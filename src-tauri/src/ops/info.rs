use super::*;
use crate::pdfkit::*;
use lopdf::{Dictionary, Document, Object, ObjectId};
use std::collections::{HashMap, HashSet};

// ---------------------------------------------------------------- metadata

const INFO_KEYS: [(&str, &str); 6] = [
    ("title", "Title"),
    ("author", "Author"),
    ("subject", "Subject"),
    ("keywords", "Keywords"),
    ("creator", "Creator"),
    ("producer", "Producer"),
];

fn info_dict(doc: &Document) -> Option<Dictionary> {
    match doc.trailer.get(b"Info").ok() {
        Some(o) => match resolve(doc, o) {
            Object::Dictionary(d) => Some(d.clone()),
            _ => None,
        },
        None => None,
    }
}

pub fn meta_get(blobs: &[Vec<u8>]) -> Result<Output> {
    let doc = load(blob(blobs, 0)?)?;
    let info = info_dict(&doc);
    let mut m = serde_json::Map::new();
    for (k, pdf_key) in INFO_KEYS {
        let v = info
            .as_ref()
            .and_then(|d| get(&doc, d, pdf_key))
            .and_then(|o| if let Object::String(s, _) = o { Some(decode_text(s)) } else { None })
            .unwrap_or_default();
        m.insert(k.to_string(), Value::String(v));
    }
    m.insert("pageCount".into(), json!(pages(&doc).len()));
    Ok(Output::json(Value::Object(m)))
}

pub fn meta_set(p: &Value, blobs: &[Vec<u8>]) -> Result<Output> {
    let mut doc = load(blob(blobs, 0)?)?;
    let info_id: ObjectId = match doc.trailer.get(b"Info") {
        Ok(Object::Reference(id)) => *id,
        _ => {
            let existing = info_dict(&doc).unwrap_or_default();
            let id = doc.add_object(Object::Dictionary(existing));
            doc.trailer.set("Info", Object::Reference(id));
            id
        }
    };
    if let Ok(Object::Dictionary(d)) = doc.get_object_mut(info_id) {
        for (k, pdf_key) in INFO_KEYS {
            if k == "producer" {
                continue;
            }
            if let Some(v) = p.get(k).and_then(|v| v.as_str()) {
                d.set(pdf_key, text_obj(v));
            }
        }
        d.set("Producer", text_obj("PDF Studio"));
    }
    Ok(Output::pdf(finish(doc)?))
}

// ---------------------------------------------------------------- name trees

fn walk_name_tree(doc: &Document, node: &Object, out: &mut Vec<(Vec<u8>, Object)>, depth: u32) {
    if depth > 32 {
        return;
    }
    let d = match dict_of(doc, node) {
        Some(d) => d,
        None => return,
    };
    if let Some(Object::Array(names)) = get(doc, d, "Names") {
        for pair in names.chunks(2) {
            if pair.len() == 2 {
                if let Object::String(k, _) = resolve(doc, &pair[0]) {
                    out.push((k.clone(), pair[1].clone()));
                }
            }
        }
    }
    if let Some(Object::Array(kids)) = get(doc, d, "Kids") {
        for k in kids {
            walk_name_tree(doc, k, out, depth + 1);
        }
    }
}

fn catalog_dict(doc: &Document) -> Option<Dictionary> {
    let root = doc.trailer.get(b"Root").ok()?;
    match resolve(doc, root) {
        Object::Dictionary(d) => Some(d.clone()),
        _ => None,
    }
}

// ---------------------------------------------------------------- attachments

pub fn attachments(blobs: &[Vec<u8>]) -> Result<Output> {
    let doc = load(blob(blobs, 0)?)?;
    let cat = catalog_dict(&doc).ok_or_else(|| anyhow::anyhow!("Invalid PDF (no catalog)"))?;
    let mut entries = vec![];
    if let Some(names) = get(&doc, &cat, "Names").and_then(|o| dict_of(&doc, o)) {
        if let Some(ef) = names.get(b"EmbeddedFiles").ok() {
            walk_name_tree(&doc, ef, &mut entries, 0);
        }
    }
    let mut meta = vec![];
    let mut files = vec![];
    for (key, spec) in entries {
        let sd = match dict_of(&doc, &spec) {
            Some(d) => d,
            None => continue,
        };
        let fname = match get(&doc, sd, "UF").or_else(|| get(&doc, sd, "F")) {
            Some(Object::String(s, _)) => decode_text(s),
            _ => decode_text(&key),
        };
        let stream_obj = sd
            .get(b"EF")
            .ok()
            .and_then(|o| dict_of(&doc, o))
            .and_then(|ef| get(&doc, ef, "F").or_else(|| get(&doc, ef, "UF")));
        if let Some(Object::Stream(st)) = stream_obj {
            let bytes = stream_bytes(st);
            meta.push(json!({ "name": fname, "size": bytes.len() }));
            files.push(bytes);
        }
    }
    Ok(Output::with(json!({ "attachments": meta }), files))
}

// ---------------------------------------------------------------- destinations

struct Dests {
    named: HashMap<Vec<u8>, Object>,
}

fn collect_dests(doc: &Document) -> Dests {
    let mut named = HashMap::new();
    if let Some(cat) = catalog_dict(doc) {
        if let Some(d) = get(doc, &cat, "Dests").and_then(|o| dict_of(doc, o)) {
            for (k, v) in d.iter() {
                named.insert(k.clone(), v.clone());
            }
        }
        if let Some(names) = get(doc, &cat, "Names").and_then(|o| dict_of(doc, o)) {
            if let Ok(tree) = names.get(b"Dests") {
                let mut v = vec![];
                walk_name_tree(doc, tree, &mut v, 0);
                for (k, o) in v {
                    named.insert(k, o);
                }
            }
        }
    }
    Dests { named }
}

fn dest_to_page(doc: &Document, dest: &Object, page_ids: &[ObjectId], dests: &Dests, depth: u32) -> Option<usize> {
    if depth > 8 {
        return None;
    }
    match resolve(doc, dest) {
        Object::Array(a) => match a.first() {
            Some(Object::Reference(id)) => page_ids.iter().position(|p| p == id),
            Some(Object::Integer(i)) => Some(*i as usize),
            _ => None,
        },
        Object::Name(n) => dests.named.get(n).and_then(|o| dest_to_page(doc, o, page_ids, dests, depth + 1)),
        Object::String(s, _) => dests.named.get(s).and_then(|o| dest_to_page(doc, o, page_ids, dests, depth + 1)),
        Object::Dictionary(d) => d.get(b"D").ok().and_then(|o| dest_to_page(doc, o, page_ids, dests, depth + 1)),
        _ => None,
    }
}

fn action_dest<'a>(doc: &'a Document, d: &'a Dictionary) -> Option<&'a Object> {
    if let Ok(o) = d.get(b"Dest") {
        return Some(o);
    }
    let a = get(doc, d, "A").and_then(|o| dict_of(doc, o))?;
    if matches!(get(doc, a, "S"), Some(Object::Name(n)) if n == b"GoTo") {
        return a.get(b"D").ok();
    }
    None
}

// ---------------------------------------------------------------- links

pub fn links(blobs: &[Vec<u8>]) -> Result<Output> {
    let doc = load(blob(blobs, 0)?)?;
    let page_ids = pages(&doc);
    let dests = collect_dests(&doc);
    let mut out = vec![];
    for (pi, pid) in page_ids.iter().enumerate() {
        let pd = match doc.get_object(*pid).ok().and_then(|o| o.as_dict().ok()) {
            Some(d) => d,
            None => continue,
        };
        let annots = match get(&doc, pd, "Annots") {
            Some(Object::Array(a)) => a.clone(),
            _ => continue,
        };
        for a in annots {
            let ad = match dict_of(&doc, &a) {
                Some(d) => d,
                None => continue,
            };
            if !matches!(get(&doc, ad, "Subtype"), Some(Object::Name(n)) if n == b"Link") {
                continue;
            }
            // external URI
            if let Some(act) = get(&doc, ad, "A").and_then(|o| dict_of(&doc, o)) {
                if let Some(Object::String(u, _)) = get(&doc, act, "URI") {
                    out.push(json!({ "page": pi + 1, "url": decode_text(u), "type": "URL" }));
                    continue;
                }
            }
            // internal destination
            if let Some(d) = action_dest(&doc, ad) {
                let label = match dest_to_page(&doc, d, &page_ids, &dests, 0) {
                    Some(n) => format!("Page {}", n + 1),
                    None => match resolve(&doc, d) {
                        Object::Name(n) => String::from_utf8_lossy(n).into_owned(),
                        Object::String(s, _) => decode_text(s),
                        _ => "Internal destination".into(),
                    },
                };
                out.push(json!({ "page": pi + 1, "url": label, "type": "Destination" }));
            }
        }
    }
    Ok(Output::json(json!({ "links": out })))
}

// ---------------------------------------------------------------- bookmarks

fn outline_children(doc: &Document, first: &Object, page_ids: &[ObjectId], dests: &Dests, seen: &mut HashSet<ObjectId>, depth: u32) -> Vec<Value> {
    let mut out = vec![];
    if depth > 32 {
        return out;
    }
    let mut cur = Some(first.clone());
    let mut guard = 0;
    while let Some(item) = cur {
        guard += 1;
        if guard > 50_000 {
            break;
        }
        if let Object::Reference(id) = &item {
            if !seen.insert(*id) {
                break;
            }
        }
        let d = match dict_of(doc, &item) {
            Some(d) => d,
            None => break,
        };
        let title = match get(doc, d, "Title") {
            Some(Object::String(s, _)) => decode_text(s),
            _ => String::new(),
        };
        let page = action_dest(doc, d).and_then(|x| dest_to_page(doc, x, page_ids, dests, 0));
        let children = match d.get(b"First") {
            Ok(f) => outline_children(doc, f, page_ids, dests, seen, depth + 1),
            Err(_) => vec![],
        };
        out.push(json!({ "title": title, "pageIndex": page, "children": children }));
        cur = d.get(b"Next").ok().cloned();
    }
    out
}

pub fn bookmarks(blobs: &[Vec<u8>]) -> Result<Output> {
    let doc = load(blob(blobs, 0)?)?;
    let page_ids = pages(&doc);
    let dests = collect_dests(&doc);
    let cat = catalog_dict(&doc);
    let tree = cat
        .as_ref()
        .and_then(|c| get(&doc, c, "Outlines"))
        .and_then(|o| if let Object::Dictionary(d) = o { Some(d) } else { None })
        .and_then(|o| o.get(b"First").ok())
        .map(|first| {
            let mut seen = HashSet::new();
            outline_children(&doc, first, &page_ids, &dests, &mut seen, 0)
        })
        .unwrap_or_default();
    Ok(Output::json(json!({ "bookmarks": tree, "pageCount": page_ids.len() })))
}

// ---------------------------------------------------------------- repair

/// Rebuild a missing / damaged xref by scanning for `N G obj` markers and appending
/// a fresh xref table + trailer pointing at the catalog.
fn rebuild_xref(bytes: &[u8]) -> Option<Vec<u8>> {
    let obj_re = regex::bytes::Regex::new(r"(?-u)(?:^|[\r\n\s])(\d{1,10})\s+(\d{1,5})\s+obj\b").ok()?;
    let mut offsets: HashMap<u32, (usize, u16)> = HashMap::new();
    let mut order: Vec<(usize, u32)> = vec![];
    for c in obj_re.captures_iter(bytes) {
        let m = c.get(1)?;
        let num: u32 = std::str::from_utf8(m.as_bytes()).ok()?.parse().ok()?;
        let gen: u16 = std::str::from_utf8(c.get(2)?.as_bytes()).ok()?.parse().ok()?;
        offsets.insert(num, (m.start(), gen));
        order.push((m.start(), num));
    }
    if offsets.is_empty() {
        return None;
    }
    let cat_re = regex::bytes::Regex::new(r"(?-u)/Type\s*/Catalog\b").ok()?;
    let cat_pos = cat_re.find_iter(bytes).last()?.start();
    let root = order.iter().rev().find(|(off, _)| *off <= cat_pos).map(|(_, n)| *n)?;

    let max = *offsets.keys().max()?;
    let mut out = bytes.to_vec();
    if !out.ends_with(b"\n") {
        out.push(b'\n');
    }
    let xref_pos = out.len();
    out.extend_from_slice(format!("xref\n0 {}\n", max + 1).as_bytes());
    out.extend_from_slice(b"0000000000 65535 f \n");
    for n in 1..=max {
        match offsets.get(&n) {
            Some((off, gen)) => out.extend_from_slice(format!("{:010} {:05} n \n", off, gen).as_bytes()),
            None => out.extend_from_slice(b"0000000000 00000 f \n"),
        }
    }
    out.extend_from_slice(format!("trailer\n<< /Size {} /Root {} 0 R >>\nstartxref\n{}\n%%EOF\n", max + 1, root, xref_pos).as_bytes());
    Some(out)
}

fn load_for_repair(bytes: &[u8]) -> Result<Document> {
    if let Ok(d) = Document::load_mem(bytes) {
        if !pages(&d).is_empty() {
            return Ok(d);
        }
    }
    // normalise line endings like the original tool did, then rebuild the xref
    let normalised: Vec<u8> = {
        let mut v = Vec::with_capacity(bytes.len());
        let mut i = 0;
        while i < bytes.len() {
            if bytes[i] == b'\r' && bytes.get(i + 1) == Some(&b'\n') {
                i += 1;
                continue;
            }
            v.push(bytes[i]);
            i += 1;
        }
        v
    };
    for candidate in [bytes.to_vec(), normalised] {
        if let Some(rebuilt) = rebuild_xref(&candidate) {
            if let Ok(d) = Document::load_mem(&rebuilt) {
                if !pages(&d).is_empty() {
                    return Ok(d);
                }
            }
        }
    }
    bail!("Repair failed — the file is too badly damaged to reconstruct")
}

fn strip_javascript(doc: &mut Document) {
    // catalog: OpenAction / AA / Names.JavaScript
    let root_id = match doc.trailer.get(b"Root") {
        Ok(Object::Reference(id)) => *id,
        _ => return,
    };
    let names_ref = doc
        .get_object(root_id)
        .ok()
        .and_then(|o| o.as_dict().ok())
        .and_then(|d| d.get(b"Names").ok())
        .cloned();
    if let Ok(Object::Dictionary(cat)) = doc.get_object_mut(root_id) {
        cat.remove(b"OpenAction");
        cat.remove(b"AA");
    }
    match names_ref {
        Some(Object::Reference(nid)) => {
            if let Ok(Object::Dictionary(n)) = doc.get_object_mut(nid) {
                n.remove(b"JavaScript");
            }
        }
        Some(Object::Dictionary(_)) => {
            if let Ok(Object::Dictionary(cat)) = doc.get_object_mut(root_id) {
                if let Ok(Object::Dictionary(n)) = cat.get_mut(b"Names") {
                    n.remove(b"JavaScript");
                }
            }
        }
        _ => {}
    }
    // pages: /AA and JavaScript link/widget actions
    for pid in pages(doc) {
        let annots: Vec<Object> = match doc
            .get_object(pid)
            .ok()
            .and_then(|o| o.as_dict().ok())
            .and_then(|d| d.get(b"Annots").ok())
            .map(|o| resolve(doc, o).clone())
        {
            Some(Object::Array(a)) => a,
            _ => vec![],
        };
        for a in annots {
            if let Object::Reference(aid) = a {
                if let Ok(Object::Dictionary(ad)) = doc.get_object_mut(aid) {
                    ad.remove(b"AA");
                    let is_js = matches!(ad.get(b"A"), Ok(Object::Dictionary(act)) if matches!(act.get(b"S"), Ok(Object::Name(n)) if n == b"JavaScript"));
                    if is_js {
                        ad.remove(b"A");
                    }
                }
            }
        }
        if let Ok(Object::Dictionary(pd)) = doc.get_object_mut(pid) {
            pd.remove(b"AA");
        }
    }
}

fn remove_broken_annotations(doc: &mut Document) {
    for pid in pages(doc) {
        let annots: Vec<Object> = match doc
            .get_object(pid)
            .ok()
            .and_then(|o| o.as_dict().ok())
            .and_then(|d| d.get(b"Annots").ok())
            .map(|o| resolve(doc, o).clone())
        {
            Some(Object::Array(a)) => a,
            Some(_) => {
                if let Ok(Object::Dictionary(pd)) = doc.get_object_mut(pid) {
                    pd.remove(b"Annots");
                }
                continue;
            }
            None => continue,
        };
        let keep: Vec<Object> = annots
            .into_iter()
            .filter(|a| match dict_of(doc, a) {
                Some(d) => d.has(b"Subtype"),
                None => false,
            })
            .collect();
        if let Ok(Object::Dictionary(pd)) = doc.get_object_mut(pid) {
            if keep.is_empty() {
                pd.remove(b"Annots");
            } else {
                pd.set("Annots", Object::Array(keep));
            }
        }
    }
}

fn repair_fonts(doc: &mut Document) {
    for (_, obj) in doc.objects.iter_mut() {
        if let Object::Dictionary(d) = obj {
            if matches!(d.get(b"Type"), Ok(Object::Name(n)) if n == b"Font") {
                if !d.has(b"Subtype") {
                    d.set("Subtype", name("Type1"));
                }
                if !d.has(b"BaseFont") && matches!(d.get(b"Subtype"), Ok(Object::Name(n)) if n == b"Type1") {
                    d.set("BaseFont", name("Helvetica"));
                }
            }
        }
    }
}

pub fn repair(p: &Value, blobs: &[Vec<u8>]) -> Result<Output> {
    let bytes = blob(blobs, 0)?;
    let mut doc = load_for_repair(bytes)?;
    if doc.trailer.has(b"Encrypt") {
        // best effort: try the empty password so the output is readable
        let _ = crate::security::decrypt_in_place(&mut doc, "");
    }
    if p_bool(p, "normalizeMetadata", false) {
        let info_id = match doc.trailer.get(b"Info") {
            Ok(Object::Reference(id)) => *id,
            _ => {
                let id = doc.add_object(Object::Dictionary(Dictionary::new()));
                doc.trailer.set("Info", Object::Reference(id));
                id
            }
        };
        if let Ok(Object::Dictionary(d)) = doc.get_object_mut(info_id) {
            d.set("Creator", text_obj("PDF Repair Tool"));
            d.set("Producer", text_obj("PDF Studio"));
        }
    }
    if p_bool(p, "sanitizeJS", false) {
        strip_javascript(&mut doc);
    }
    if p_bool(p, "removeBrokenAnnotations", false) {
        remove_broken_annotations(&mut doc);
    }
    if p_bool(p, "repairFonts", false) {
        repair_fonts(&mut doc);
    }
    if p_bool(p, "removeInvalidObjects", false) {
        doc.delete_zero_length_streams();
        doc.prune_objects();
    }
    if p_bool(p, "decompressStreams", false) {
        doc.decompress();
        doc.prune_objects();
        return Ok(Output::pdf(save_raw(&mut doc)?));
    }
    Ok(Output::pdf(finish(doc)?))
}
