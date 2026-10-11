//! Thin helpers on top of lopdf: page tree handling, inherited attributes,
//! form-XObject creation, merging, save.

use anyhow::{anyhow, bail, Result};
use lopdf::{Dictionary, Document, Object, ObjectId, Stream, StringFormat};

// ---------- tiny object constructors (the only place that touches Object::Real) ----------

pub fn name(s: &str) -> Object {
    Object::Name(s.as_bytes().to_vec())
}
pub fn real(v: f32) -> Object {
    Object::Real(v)
}
pub fn int(v: i64) -> Object {
    Object::Integer(v)
}
pub fn num(o: &Object) -> Option<f32> {
    match o {
        Object::Integer(i) => Some(*i as f32),
        Object::Real(r) => Some(*r),
        _ => None,
    }
}
pub fn rect_obj(b: [f32; 4]) -> Object {
    Object::Array(b.iter().map(|v| real(*v)).collect())
}

// ---------- text strings ----------

/// PDF text string (PDFDocEncoding for ASCII, UTF-16BE+BOM otherwise).
pub fn text_obj(s: &str) -> Object {
    if s.is_ascii() {
        Object::String(s.as_bytes().to_vec(), StringFormat::Literal)
    } else {
        let mut v = vec![0xFE, 0xFF];
        for u in s.encode_utf16() {
            v.extend_from_slice(&u.to_be_bytes());
        }
        Object::String(v, StringFormat::Hexadecimal)
    }
}

pub fn decode_text(b: &[u8]) -> String {
    if b.len() >= 2 && b[0] == 0xFE && b[1] == 0xFF {
        let u: Vec<u16> = b[2..].chunks(2).filter(|c| c.len() == 2).map(|c| u16::from_be_bytes([c[0], c[1]])).collect();
        String::from_utf16_lossy(&u)
    } else if b.len() >= 2 && b[0] == 0xFF && b[1] == 0xFE {
        let u: Vec<u16> = b[2..].chunks(2).filter(|c| c.len() == 2).map(|c| u16::from_le_bytes([c[0], c[1]])).collect();
        String::from_utf16_lossy(&u)
    } else if b.len() >= 3 && b[0] == 0xEF && b[1] == 0xBB && b[2] == 0xBF {
        String::from_utf8_lossy(&b[3..]).into_owned()
    } else {
        b.iter().map(|&c| c as char).collect()
    }
}

// ---------- reference resolution ----------

pub fn resolve<'a>(doc: &'a Document, o: &'a Object) -> &'a Object {
    let mut cur = o;
    for _ in 0..32 {
        match cur {
            Object::Reference(id) => match doc.objects.get(id) {
                Some(n) => cur = n,
                None => return cur,
            },
            _ => return cur,
        }
    }
    cur
}

pub fn dict_of<'a>(doc: &'a Document, o: &'a Object) -> Option<&'a Dictionary> {
    match resolve(doc, o) {
        Object::Dictionary(d) => Some(d),
        Object::Stream(s) => Some(&s.dict),
        _ => None,
    }
}

pub fn get<'a>(doc: &'a Document, d: &'a Dictionary, key: &str) -> Option<&'a Object> {
    d.get(key.as_bytes()).ok().map(|o| resolve(doc, o))
}

// ---------- load / save ----------

pub fn load(bytes: &[u8]) -> Result<Document> {
    load_with_password(bytes, "")
}

pub fn load_with_password(bytes: &[u8], password: &str) -> Result<Document> {
    let mut doc = Document::load_mem(bytes).map_err(|e| anyhow!("Could not read PDF: {e}"))?;
    // If the lopdf version in use already decrypted the file, the trailer no longer has /Encrypt.
    if doc.trailer.has(b"Encrypt") {
        crate::security::decrypt_in_place(&mut doc, password)?;
    }
    Ok(doc)
}

/// Prune unreachable objects, deflate raw streams and serialise.
pub fn finish(mut doc: Document) -> Result<Vec<u8>> {
    doc.prune_objects();
    doc.compress();
    save_raw(&mut doc)
}

pub fn save_raw(doc: &mut Document) -> Result<Vec<u8>> {
    let mut buf = Vec::new();
    doc.save_to(&mut buf)?;
    Ok(buf)
}

// ---------- pages ----------

pub fn pages(doc: &Document) -> Vec<ObjectId> {
    doc.get_pages().into_values().collect()
}

/// Walk /Parent links looking for an inheritable attribute. Returns a resolved clone.
pub fn inherited(doc: &Document, page: ObjectId, key: &[u8]) -> Option<Object> {
    let mut id = page;
    for _ in 0..64 {
        let d = doc.get_object(id).ok()?.as_dict().ok()?;
        if let Ok(v) = d.get(key) {
            return Some(resolve(doc, v).clone());
        }
        match d.get(b"Parent") {
            Ok(Object::Reference(p)) => id = *p,
            _ => return None,
        }
    }
    None
}

pub fn media_box(doc: &Document, page: ObjectId) -> [f32; 4] {
    if let Some(Object::Array(a)) = inherited(doc, page, b"MediaBox") {
        let v: Vec<f32> = a.iter().filter_map(|o| num(resolve(doc, o))).collect();
        if v.len() == 4 {
            return [v[0].min(v[2]), v[1].min(v[3]), v[0].max(v[2]), v[1].max(v[3])];
        }
    }
    [0.0, 0.0, 612.0, 792.0]
}

/// (width, height) of the MediaBox — what pdf-lib's `page.getSize()` returns.
pub fn page_size(doc: &Document, page: ObjectId) -> (f32, f32) {
    let b = media_box(doc, page);
    (b[2] - b[0], b[3] - b[1])
}

pub fn page_rotation(doc: &Document, page: ObjectId) -> i32 {
    match inherited(doc, page, b"Rotate") {
        Some(Object::Integer(r)) => (((r % 360) + 360) % 360) as i32,
        _ => 0,
    }
}

pub fn page_resources(doc: &Document, page: ObjectId) -> Dictionary {
    match inherited(doc, page, b"Resources") {
        Some(Object::Dictionary(d)) => d,
        _ => Dictionary::new(),
    }
}

pub fn page_dict_mut<'a>(doc: &'a mut Document, page: ObjectId) -> Result<&'a mut Dictionary> {
    match doc.get_object_mut(page)? {
        Object::Dictionary(d) => Ok(d),
        _ => bail!("page object is not a dictionary"),
    }
}

/// Copy inheritable attributes into the page dict so it survives re-parenting.
pub fn materialize_inherited(doc: &mut Document, page: ObjectId) {
    let keys: [&[u8]; 4] = [b"MediaBox", b"CropBox", b"Rotate", b"Resources"];
    for key in keys {
        let has = doc
            .get_object(page)
            .ok()
            .and_then(|o| o.as_dict().ok())
            .map(|d| d.has(key))
            .unwrap_or(true);
        if !has {
            if let Some(v) = inherited(doc, page, key) {
                if let Ok(d) = page_dict_mut(doc, page) {
                    d.set(key.to_vec(), v);
                }
            }
        }
    }
}

/// Drop link annotations that point at other pages (they would drag the whole
/// original page tree into the output through their destination references).
pub fn sanitize_annots(doc: &mut Document, page: ObjectId) {
    let annots = match doc.get_object(page).ok().and_then(|o| o.as_dict().ok()).and_then(|d| d.get(b"Annots").ok()) {
        Some(o) => resolve(doc, o).clone(),
        None => return,
    };
    let arr = match annots {
        Object::Array(a) => a,
        _ => return,
    };
    let keep: Vec<Object> = arr
        .into_iter()
        .filter(|a| {
            let d = match dict_of(doc, a) {
                Some(d) => d,
                None => return false,
            };
            let is_link = matches!(get(doc, d, "Subtype"), Some(Object::Name(n)) if n == b"Link");
            if !is_link {
                return true;
            }
            if d.has(b"Dest") {
                return false;
            }
            if let Some(act) = get(doc, d, "A").and_then(|o| dict_of(doc, o)) {
                if matches!(get(doc, act, "S"), Some(Object::Name(n)) if n == b"GoTo") {
                    return false;
                }
            }
            true
        })
        .collect();
    if let Ok(d) = page_dict_mut(doc, page) {
        if keep.is_empty() {
            d.remove(b"Annots");
        } else {
            d.set("Annots", Object::Array(keep));
        }
    }
}

/// Replace the document's page tree with `kids` and give it a fresh minimal catalog.
pub fn install_pages(doc: &mut Document, kids: &[ObjectId]) -> Result<()> {
    let pages_id = doc.new_object_id();
    for k in kids {
        if let Ok(Object::Dictionary(d)) = doc.get_object_mut(*k) {
            d.set("Parent", Object::Reference(pages_id));
        }
    }
    let mut pd = Dictionary::new();
    pd.set("Type", name("Pages"));
    pd.set("Kids", Object::Array(kids.iter().map(|k| Object::Reference(*k)).collect()));
    pd.set("Count", int(kids.len() as i64));
    doc.objects.insert(pages_id, Object::Dictionary(pd));

    let mut cat = Dictionary::new();
    cat.set("Type", name("Catalog"));
    cat.set("Pages", Object::Reference(pages_id));
    let cat_id = doc.add_object(Object::Dictionary(cat));
    doc.trailer.set("Root", Object::Reference(cat_id));
    Ok(())
}

/// Keep `indices` (0-based, order preserved, duplicates allowed) — the equivalent of
/// pdf-lib's `newDoc.copyPages(src, indices)`.
pub fn pick_pages(mut doc: Document, indices: &[usize]) -> Result<Document> {
    let ids = pages(&doc);
    for &i in indices {
        if i >= ids.len() {
            bail!("page {} out of range (document has {} pages)", i + 1, ids.len());
        }
    }
    for id in &ids {
        materialize_inherited(&mut doc, *id);
        sanitize_annots(&mut doc, *id);
    }
    let mut used = std::collections::HashSet::new();
    let mut kids = Vec::with_capacity(indices.len());
    for &i in indices {
        let id = ids[i];
        if used.insert(id) {
            kids.push(id);
        } else {
            let copy = doc.get_object(id)?.clone();
            kids.push(doc.add_object(copy));
        }
    }
    install_pages(&mut doc, &kids)?;
    Ok(doc)
}

/// Concatenate the pages of several documents.
pub fn merge_docs(docs: Vec<Document>) -> Result<Document> {
    let mut out = Document::with_version("1.7");
    let mut next_id: u32 = 1;
    let mut all_pages: Vec<ObjectId> = Vec::new();
    for mut d in docs {
        d.renumber_objects_with(next_id);
        next_id = d.max_id + 1;
        let ids = pages(&d);
        for id in &ids {
            materialize_inherited(&mut d, *id);
            sanitize_annots(&mut d, *id);
        }
        all_pages.extend(ids);
        out.objects.extend(d.objects);
    }
    out.max_id = next_id - 1;
    install_pages(&mut out, &all_pages)?;
    Ok(out)
}

// ---------- content ----------

/// Wrap a page as a Form XObject (pdf-lib `embedPage`). Returns (xobject id, mediabox).
pub fn page_to_form(doc: &mut Document, page: ObjectId) -> Result<(ObjectId, [f32; 4])> {
    let mb = media_box(doc, page);
    let content = doc.get_page_content(page).unwrap_or_default();
    let res = page_resources(doc, page);
    let mut d = Dictionary::new();
    d.set("Type", name("XObject"));
    d.set("Subtype", name("Form"));
    d.set("FormType", int(1));
    d.set("BBox", rect_obj(mb));
    d.set("Matrix", Object::Array(vec![real(1.0), real(0.0), real(0.0), real(1.0), real(-mb[0]), real(-mb[1])]));
    d.set("Resources", Object::Dictionary(res));
    Ok((doc.add_object(Object::Stream(Stream::new(d, content))), mb))
}

/// Create a brand-new page object (not yet attached to a Pages node).
pub fn new_page(doc: &mut Document, w: f32, h: f32, content: Vec<u8>, resources: Dictionary) -> ObjectId {
    let cid = doc.add_object(Object::Stream(Stream::new(Dictionary::new(), content)));
    let mut p = Dictionary::new();
    p.set("Type", name("Page"));
    p.set("MediaBox", rect_obj([0.0, 0.0, w, h]));
    p.set("Resources", Object::Dictionary(resources));
    p.set("Contents", Object::Reference(cid));
    doc.add_object(Object::Dictionary(p))
}

/// Append a content stream on top of a page's existing content (isolated with q/Q).
pub fn append_content(doc: &mut Document, page: ObjectId, content: Vec<u8>) -> Result<()> {
    let existing: Vec<Object> = {
        let d = doc.get_object(page)?.as_dict()?;
        match d.get(b"Contents") {
            Ok(Object::Reference(r)) => match doc.objects.get(r) {
                Some(Object::Array(a)) => a.clone(),
                _ => vec![Object::Reference(*r)],
            },
            Ok(Object::Array(a)) => a.clone(),
            _ => vec![],
        }
    };
    let q = doc.add_object(Object::Stream(Stream::new(Dictionary::new(), b"q\n".to_vec())));
    let qq = doc.add_object(Object::Stream(Stream::new(Dictionary::new(), b"\nQ\n".to_vec())));
    let ours = doc.add_object(Object::Stream(Stream::new(Dictionary::new(), content)));
    let mut arr = vec![Object::Reference(q)];
    arr.extend(existing);
    arr.push(Object::Reference(qq));
    arr.push(Object::Reference(ours));
    page_dict_mut(doc, page)?.set("Contents", Object::Array(arr));
    Ok(())
}

// ---------- images ----------

/// Embed a PNG/JPEG/etc as an Image XObject (RGB + soft mask for transparency).
/// Returns (object id, pixel width, pixel height).
pub fn embed_image(doc: &mut Document, bytes: &[u8]) -> Result<(ObjectId, u32, u32)> {
    use flate2::{write::ZlibEncoder, Compression};
    use std::io::Write;

    let img = image::load_from_memory(bytes).map_err(|e| anyhow!("Unsupported image: {e}"))?;
    let rgba = img.to_rgba8();
    let (w, h) = rgba.dimensions();
    let mut rgb = Vec::with_capacity((w * h * 3) as usize);
    let mut alpha = Vec::with_capacity((w * h) as usize);
    let mut has_alpha = false;
    for px in rgba.pixels() {
        rgb.extend_from_slice(&px.0[..3]);
        alpha.push(px.0[3]);
        if px.0[3] != 255 {
            has_alpha = true;
        }
    }
    let z = |data: &[u8]| -> Result<Vec<u8>> {
        let mut e = ZlibEncoder::new(Vec::new(), Compression::default());
        e.write_all(data)?;
        Ok(e.finish()?)
    };

    let smask = if has_alpha {
        let mut d = Dictionary::new();
        d.set("Type", name("XObject"));
        d.set("Subtype", name("Image"));
        d.set("Width", int(w as i64));
        d.set("Height", int(h as i64));
        d.set("ColorSpace", name("DeviceGray"));
        d.set("BitsPerComponent", int(8));
        d.set("Filter", name("FlateDecode"));
        Some(doc.add_object(Object::Stream(Stream::new(d, z(&alpha)?))))
    } else {
        None
    };

    let mut d = Dictionary::new();
    d.set("Type", name("XObject"));
    d.set("Subtype", name("Image"));
    d.set("Width", int(w as i64));
    d.set("Height", int(h as i64));
    d.set("ColorSpace", name("DeviceRGB"));
    d.set("BitsPerComponent", int(8));
    d.set("Filter", name("FlateDecode"));
    if let Some(s) = smask {
        d.set("SMask", Object::Reference(s));
    }
    let id = doc.add_object(Object::Stream(Stream::new(d, z(&rgb)?)));
    Ok((id, w, h))
}

/// Decoded bytes of a stream (falls back to the raw bytes when there is no filter).
pub fn stream_bytes(st: &Stream) -> Vec<u8> {
    st.decompressed_content().unwrap_or_else(|_| st.content.clone())
}

pub fn new_doc() -> Document {
    let mut doc = Document::with_version("1.7");
    // empty page tree so install_pages can be used on it
    let _ = install_pages(&mut doc, &[]);
    doc
}

/// Embed JPEG bytes without re-encoding (DCTDecode pass-through).
pub fn embed_jpeg(doc: &mut Document, jpeg: &[u8], w: u32, h: u32, gray: bool) -> ObjectId {
    let mut d = Dictionary::new();
    d.set("Type", name("XObject"));
    d.set("Subtype", name("Image"));
    d.set("Width", int(w as i64));
    d.set("Height", int(h as i64));
    d.set("ColorSpace", name(if gray { "DeviceGray" } else { "DeviceRGB" }));
    d.set("BitsPerComponent", int(8));
    d.set("Filter", name("DCTDecode"));
    doc.add_object(Object::Stream(Stream::new(d, jpeg.to_vec())))
}
