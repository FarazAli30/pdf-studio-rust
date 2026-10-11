use super::*;
use crate::canvas::Canvas;
use crate::pdfkit::*;
use lopdf::{Dictionary, Document, ObjectId};

pub fn info(blobs: &[Vec<u8>]) -> Result<Output> {
    let doc = load(blob(blobs, 0)?)?;
    let ids = pages(&doc);
    let sizes: Vec<Value> = ids
        .iter()
        .map(|id| {
            let (w, h) = page_size(&doc, *id);
            json!({ "width": w, "height": h, "rotation": page_rotation(&doc, *id) })
        })
        .collect();
    Ok(Output::json(json!({ "pageCount": ids.len(), "pages": sizes })))
}

pub fn merge(blobs: &[Vec<u8>]) -> Result<Output> {
    if blobs.len() < 2 {
        bail!("Select at least two PDFs to merge");
    }
    let mut docs = Vec::with_capacity(blobs.len());
    for b in blobs {
        docs.push(load(b)?);
    }
    Ok(Output::pdf(finish(merge_docs(docs)?)?))
}

/// "1-3, 5, 8-9" -> 0-based inclusive (start, end) pairs; invalid parts are skipped.
pub fn parse_ranges(input: &str, max: usize) -> Vec<(usize, usize)> {
    let mut out = vec![];
    for part in input.split(',').map(|s| s.trim()).filter(|s| !s.is_empty()) {
        if part.contains('-') {
            let mut it = part.split('-').map(|s| s.trim().parse::<usize>());
            if let (Some(Ok(s)), Some(Ok(e))) = (it.next(), it.next()) {
                if s >= 1 && e <= max && s <= e {
                    out.push((s - 1, e - 1));
                }
            }
        } else if let Ok(n) = part.parse::<usize>() {
            if n >= 1 && n <= max {
                out.push((n - 1, n - 1));
            }
        }
    }
    out
}

pub fn split(p: &Value, blobs: &[Vec<u8>]) -> Result<Output> {
    let src = load(blob(blobs, 0)?)?;
    let total = pages(&src).len();
    let mut names = vec![];
    let mut out = vec![];
    if p_str(p, "mode") == "range" {
        let ranges = parse_ranges(&p_str(p, "ranges"), total);
        if ranges.is_empty() {
            bail!("No valid page ranges entered.");
        }
        for (ri, (s, e)) in ranges.iter().enumerate() {
            let idx: Vec<usize> = (*s..=*e).collect();
            out.push(finish(pick_pages(src.clone(), &idx)?)?);
            names.push(format!("split-{}-pages-{}-{}.pdf", ri + 1, s + 1, e + 1));
        }
    } else {
        for i in 0..total {
            out.push(finish(pick_pages(src.clone(), &[i])?)?);
            names.push(format!("page-{}.pdf", i + 1));
        }
    }
    Ok(Output::with(json!({ "names": names }), out))
}

/// params.ranges = [[start, end], ...] 0-based inclusive. One output PDF per range.
pub fn split_ranges(p: &Value, blobs: &[Vec<u8>]) -> Result<Output> {
    let src = load(blob(blobs, 0)?)?;
    let ranges = p.get("ranges").and_then(|v| v.as_array()).cloned().unwrap_or_default();
    let mut out = vec![];
    for r in ranges {
        let s = r.get(0).and_then(|v| v.as_u64()).unwrap_or(0) as usize;
        let e = r.get(1).and_then(|v| v.as_u64()).unwrap_or(0) as usize;
        let idx: Vec<usize> = (s..=e).collect();
        out.push(finish(pick_pages(src.clone(), &idx)?)?);
    }
    Ok(Output::with(json!({}), out))
}

pub fn extract(p: &Value, blobs: &[Vec<u8>]) -> Result<Output> {
    let mut idx = p_usizes(p, "pages");
    if idx.is_empty() {
        bail!("No pages selected");
    }
    idx.sort_unstable();
    idx.dedup();
    let doc = load(blob(blobs, 0)?)?;
    Ok(Output::pdf(finish(pick_pages(doc, &idx)?)?))
}

pub fn reorder(p: &Value, blobs: &[Vec<u8>]) -> Result<Output> {
    let idx = p_usizes(p, "order");
    let doc = load(blob(blobs, 0)?)?;
    Ok(Output::pdf(finish(pick_pages(doc, &idx)?)?))
}

pub fn reverse(blobs: &[Vec<u8>]) -> Result<Output> {
    let doc = load(blob(blobs, 0)?)?;
    let n = pages(&doc).len();
    let idx: Vec<usize> = (0..n).rev().collect();
    Ok(Output::pdf(finish(pick_pages(doc, &idx)?)?))
}

/// params.rotations = [deg per page] (relative, multiples of 90)
pub fn rotate(p: &Value, blobs: &[Vec<u8>]) -> Result<Output> {
    let mut doc = load(blob(blobs, 0)?)?;
    let ids = pages(&doc);
    let rots: Vec<i64> = p
        .get("rotations")
        .and_then(|v| v.as_array())
        .map(|a| a.iter().map(|x| x.as_i64().unwrap_or(0)).collect())
        .unwrap_or_default();
    for (i, id) in ids.iter().enumerate() {
        let by = rots.get(i).copied().unwrap_or(0);
        if by % 360 == 0 {
            continue;
        }
        let cur = page_rotation(&doc, *id) as i64;
        let next = (((cur + by) % 360) + 360) % 360;
        page_dict_mut(&mut doc, *id)?.set("Rotate", int(next));
    }
    Ok(Output::pdf(finish(doc)?))
}

// ---------- imposition ----------

struct Place {
    src: usize,
    x: f32,
    y: f32,
    w: f32,
    h: f32,
}

type Sheet = (f32, f32, Vec<Place>);

fn compose(mut doc: Document, sheets: Vec<Sheet>) -> Result<Document> {
    let ids = pages(&doc);
    let mut forms: Vec<Option<(ObjectId, [f32; 4])>> = vec![None; ids.len()];
    let mut kids = vec![];
    for (w, h, places) in sheets {
        let mut cv = Canvas::new();
        for pl in places {
            if forms[pl.src].is_none() {
                forms[pl.src] = Some(page_to_form(&mut doc, ids[pl.src])?);
            }
            let (fid, mb) = forms[pl.src].unwrap();
            cv.form(fid, mb[2] - mb[0], mb[3] - mb[1], pl.x, pl.y, pl.w, pl.h);
        }
        let res = cv.resources();
        kids.push(new_page(&mut doc, w, h, cv.ops.into_bytes(), res));
    }
    install_pages(&mut doc, &kids)?;
    Ok(doc)
}

fn booklet_order(n: usize) -> Vec<Option<usize>> {
    let total = ((n + 3) / 4) * 4;
    let mut order = vec![];
    let mut i = 0;
    while i < total / 2 {
        order.push(total - 1 - i);
        order.push(i);
        order.push(i + 1);
        order.push(total - 2 - i);
        i += 2;
    }
    order.into_iter().map(|v| if v < n { Some(v) } else { None }).collect()
}

pub fn booklet(blobs: &[Vec<u8>]) -> Result<Output> {
    let doc = load(blob(blobs, 0)?)?;
    let ids = pages(&doc);
    if ids.is_empty() {
        bail!("PDF has no pages");
    }
    let (pw, ph) = page_size(&doc, ids[0]);
    // Two source pages side by side on a landscape sheet, each at native size.
    let (sw, sh) = (pw * 2.0, ph);
    let order = booklet_order(ids.len());
    let mut sheets: Vec<Sheet> = vec![];
    for chunk in order.chunks(2) {
        let mut places = vec![];
        for (s, idx) in chunk.iter().enumerate() {
            if let Some(i) = idx {
                places.push(Place { src: *i, x: if s == 0 { 0.0 } else { sw / 2.0 }, y: 0.0, w: sw / 2.0, h: sh });
            }
        }
        sheets.push((sw, sh, places));
    }
    Ok(Output::pdf(finish(compose(doc, sheets)?)?))
}

pub fn nup(p: &Value, blobs: &[Vec<u8>]) -> Result<Output> {
    let (cols, rows) = match p_str(p, "nup").as_str() {
        "2" => (2, 1),
        "4" => (2, 2),
        "6" => (3, 2),
        "9" => (3, 3),
        "16" => (4, 4),
        other => bail!("unsupported layout '{other}'"),
    };
    let doc = load(blob(blobs, 0)?)?;
    let ids = pages(&doc);
    if ids.is_empty() {
        bail!("PDF has no pages");
    }
    let (pw, ph) = page_size(&doc, ids[0]);
    let (sw, sh) = (pw * cols as f32, ph * rows as f32);
    let (cw, ch) = (sw / cols as f32, sh / rows as f32);
    let per = cols * rows;
    let mut sheets: Vec<Sheet> = vec![];
    let mut base = 0;
    while base < ids.len() {
        let mut places = vec![];
        for s in 0..per {
            let idx = base + s;
            if idx >= ids.len() {
                break;
            }
            let (col, row) = (s % cols, s / cols);
            places.push(Place { src: idx, x: col as f32 * cw, y: sh - (row as f32 + 1.0) * ch, w: cw, h: ch });
        }
        sheets.push((sw, sh, places));
        base += per;
    }
    Ok(Output::pdf(finish(compose(doc, sheets)?)?))
}

pub fn duplex(p: &Value, blobs: &[Vec<u8>]) -> Result<Output> {
    let mut doc = load(blob(blobs, 0)?)?;
    let ids = pages(&doc);
    let n = ids.len();
    if n == 0 {
        bail!("PDF has no pages");
    }
    let target = if p_str(p, "mode") == "even" { (n + 1) / 2 * 2 } else { (n + 3) / 4 * 4 };
    let (w, h) = page_size(&doc, ids[n - 1]);
    for id in &ids {
        materialize_inherited(&mut doc, *id);
        sanitize_annots(&mut doc, *id);
    }
    let mut kids = ids.clone();
    for _ in 0..(target - n) {
        kids.push(new_page(&mut doc, w, h, vec![], Dictionary::new()));
    }
    install_pages(&mut doc, &kids)?;
    Ok(Output::pdf(finish(doc)?))
}

pub fn crop(p: &Value, blobs: &[Vec<u8>]) -> Result<Output> {
    let mut doc = load(blob(blobs, 0)?)?;
    let ids = pages(&doc);
    let (top, bottom, left, right) = (p_f32(p, "top", 0.0), p_f32(p, "bottom", 0.0), p_f32(p, "left", 0.0), p_f32(p, "right", 0.0));
    let key = match p_str(p, "boxType").as_str() {
        "trim" => "TrimBox",
        "bleed" => "BleedBox",
        "media" => "MediaBox",
        _ => "CropBox",
    };
    let all = p_bool(p, "allPages", true);
    for (i, id) in ids.iter().enumerate() {
        if !all && i > 0 {
            break;
        }
        let (w, h) = page_size(&doc, *id);
        let bx = [left, bottom, w - right, h - top];
        if bx[2] <= bx[0] || bx[3] <= bx[1] {
            bail!("Crop margins are larger than the page");
        }
        page_dict_mut(&mut doc, *id)?.set(key, rect_obj(bx));
    }
    Ok(Output::pdf(finish(doc)?))
}

pub fn resize(p: &Value, blobs: &[Vec<u8>]) -> Result<Output> {
    let src = load(blob(blobs, 0)?)?;
    let (tw, th) = (p_f32(p, "width", 595.28), p_f32(p, "height", 841.89));
    let scale_content = p_bool(p, "scaleContent", true);
    let keep_aspect = p_bool(p, "preserveAspectRatio", true);
    let margin = if p_bool(p, "keepMargins", false) { 36.0 } else { 0.0 };
    let align = p_str(p, "align");
    let ids = pages(&src);

    let mut sheets: Vec<Sheet> = vec![];
    for (i, id) in ids.iter().enumerate() {
        let (sw, sh) = crate::pdfkit::page_size(&src, *id);
        let (mut dw, mut dh) = (tw - margin * 2.0, th - margin * 2.0);
        if scale_content {
            let (sx, sy) = (dw / sw, dh / sh);
            let scale = if keep_aspect { sx.min(sy) } else { 1.0 };
            dw = sw * scale;
            dh = sh * scale;
        } else {
            dw = sw;
            dh = sh;
        }
        let (x, y) = match align.as_str() {
            "center" => ((tw - dw) / 2.0, (th - dh) / 2.0),
            "top-right" => (tw - dw - margin, th - dh - margin),
            "bottom-left" => (margin, margin),
            "bottom-right" => (tw - dw - margin, margin),
            _ => (margin, th - dh - margin),
        };
        sheets.push((tw, th, vec![Place { src: i, x, y, w: dw, h: dh }]));
    }
    Ok(Output::pdf(finish(compose(src, sheets)?)?))
}
