use super::*;
use crate::canvas::{hex_rgb, Canvas, FontCache};
use crate::fonts::{text_width, Font};
use crate::pdfkit::*;
use lopdf::{Document, ObjectId};

fn targets(doc: &Document, all: bool) -> Vec<ObjectId> {
    let ids = pages(doc);
    if all {
        ids
    } else {
        ids.into_iter().take(1).collect()
    }
}

pub fn bg_color(p: &Value, blobs: &[Vec<u8>]) -> Result<Output> {
    let mut doc = load(blob(blobs, 0)?)?;
    let col = hex_rgb(&p_str(p, "color"));
    let op = p_f32(p, "opacity", 15.0) / 100.0;
    for id in pages(&doc) {
        let (w, h) = page_size(&doc, id);
        let mut cv = Canvas::new();
        cv.rect(0.0, 0.0, w, h, col, op);
        cv.commit(&mut doc, id)?;
    }
    Ok(Output::pdf(finish(doc)?))
}

pub fn watermark(p: &Value, blobs: &[Vec<u8>]) -> Result<Output> {
    let mut doc = load(blob(blobs, 0)?)?;
    let mut fonts = FontCache::new();
    let fid = fonts.get(&mut doc, Font::HelveticaBold);
    let text = p_str(p, "text");
    let size = p_f32(p, "fontSize", 48.0);
    let col = hex_rgb(&p_str(p, "color"));
    let op = p_f32(p, "opacity", 30.0) / 100.0;
    let angle = p_f32(p, "angle", 45.0);
    let tw = text_width(Font::HelveticaBold, &text, size);
    for id in pages(&doc) {
        let (w, h) = page_size(&doc, id);
        let mut cv = Canvas::new();
        cv.text(fid, &text, (w - tw) / 2.0, h / 2.0 - size / 2.0, size, col, op, angle);
        cv.commit(&mut doc, id)?;
    }
    Ok(Output::pdf(finish(doc)?))
}

fn zone_text(z: &Value, page: usize, total: usize, date: &str) -> String {
    match z.get("token").and_then(|v| v.as_str()).unwrap_or("none") {
        "Page Number" => page.to_string(),
        "Total Pages" => total.to_string(),
        "Date" => date.to_string(),
        "Custom" => z.get("custom").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        _ => String::new(),
    }
}

pub fn header_footer(p: &Value, blobs: &[Vec<u8>]) -> Result<Output> {
    let mut doc = load(blob(blobs, 0)?)?;
    let mut fonts = FontCache::new();
    let fid = fonts.get(&mut doc, Font::HelveticaBold);
    let date = p_str(p, "date");
    let ids = pages(&doc);
    let total = ids.len();
    let m = 30.0f32;
    for (idx, id) in ids.iter().enumerate() {
        let (w, h) = page_size(&doc, *id);
        let mut cv = Canvas::new();
        for (section, y) in [("header", h - 20.0), ("footer", 12.0)] {
            let sec = match p.get(section) {
                Some(s) => s,
                None => continue,
            };
            if !p_bool(sec, "enabled", false) {
                continue;
            }
            let fs = p_f32(sec, "fontSize", 10.0);
            let col = hex_rgb(&p_str(sec, "color"));
            for (zone, x, align) in [("left", m, 0), ("center", w / 2.0, 1), ("right", w - m, 2)] {
                let text = match sec.get(zone) {
                    Some(z) => zone_text(z, idx + 1, total, &date),
                    None => continue,
                };
                if text.is_empty() {
                    continue;
                }
                let tw = text_width(Font::HelveticaBold, &text, fs);
                let tx = match align {
                    1 => x - tw / 2.0,
                    2 => x - tw,
                    _ => x,
                };
                cv.text(fid, &text, tx, y, fs, col, 1.0, 0.0);
            }
        }
        cv.commit(&mut doc, *id)?;
    }
    Ok(Output::pdf(finish(doc)?))
}

pub fn bates(p: &Value, blobs: &[Vec<u8>]) -> Result<Output> {
    let mut doc = load(blob(blobs, 0)?)?;
    let mut fonts = FontCache::new();
    let fid = fonts.get(&mut doc, Font::Helvetica);
    let prefix = p_str(p, "prefix");
    let start = p_i64(p, "start", 1);
    let padding = p_i64(p, "padding", 6).max(0) as usize;
    let position = p_str(p, "position");
    let fs = p_f32(p, "fontSize", 9.0);
    let margin = 20.0;
    for (i, id) in pages(&doc).into_iter().enumerate() {
        let (w, h) = page_size(&doc, id);
        let label = format!("{}{:0>width$}", prefix, start + i as i64, width = padding);
        let tw = text_width(Font::Helvetica, &label, fs);
        let mut x = margin;
        let mut y = margin;
        if position.contains("right") {
            x = w - tw - margin;
        }
        if position.contains("top") {
            y = h - fs - margin;
        }
        let mut cv = Canvas::new();
        cv.text(fid, &label, x, y, fs, [0.0, 0.0, 0.0], 0.85, 0.0);
        cv.commit(&mut doc, id)?;
    }
    Ok(Output::pdf(finish(doc)?))
}

pub fn date_stamp(p: &Value, blobs: &[Vec<u8>]) -> Result<Output> {
    let mut doc = load(blob(blobs, 0)?)?;
    let mut fonts = FontCache::new();
    let fid = fonts.get(&mut doc, Font::HelveticaBold);
    let text = p_str(p, "text");
    let position = p_str(p, "position");
    let fs = p_f32(p, "fontSize", 10.0);
    let op = p_f32(p, "opacity", 0.7);
    let col = hex_rgb(&p_str(p, "color"));
    let margin = 16.0;
    for id in targets(&doc, p_bool(p, "allPages", true)) {
        let (w, h) = page_size(&doc, id);
        let tw = text_width(Font::HelveticaBold, &text, fs);
        let mut x = margin;
        let mut y = margin;
        if position.contains("right") {
            x = w - tw - margin;
        }
        if position.contains("top") {
            y = h - fs - margin;
        }
        let mut cv = Canvas::new();
        cv.text(fid, &text, x, y, fs, col, op, 0.0);
        cv.commit(&mut doc, id)?;
    }
    Ok(Output::pdf(finish(doc)?))
}

pub fn qr_stamp(p: &Value, blobs: &[Vec<u8>]) -> Result<Output> {
    use qrcode::{Color, QrCode};
    let mut doc = load(blob(blobs, 0)?)?;
    let text = p_str(p, "text");
    if text.is_empty() {
        bail!("Enter the text or URL to encode");
    }
    let code = QrCode::new(text.as_bytes()).map_err(|e| anyhow::anyhow!("Could not generate QR code: {e}"))?;
    let n = code.width();
    let colors = code.to_colors();
    let sz = p_f32(p, "size", 80.0);
    let position = p_str(p, "position");
    let margin = 16.0;
    let quiet = 2.0f32;
    let module = sz / (n as f32 + quiet * 2.0);

    for id in targets(&doc, p_bool(p, "allPages", false)) {
        let (w, h) = page_size(&doc, id);
        let mut x = margin;
        let mut y = margin;
        if position.contains("right") {
            x = w - sz - margin;
        }
        if position.contains("top") {
            y = h - sz - margin;
        }
        let mut cv = Canvas::new();
        cv.rect(x, y, sz, sz, [1.0, 1.0, 1.0], 1.0);
        let mut ops = String::from("q\n0 g\n");
        for row in 0..n {
            for col in 0..n {
                if colors[row * n + col] == Color::Dark {
                    let mx = x + (col as f32 + quiet) * module;
                    let my = y + sz - (row as f32 + quiet + 1.0) * module;
                    ops.push_str(&format!("{:.3} {:.3} {:.3} {:.3} re\n", mx, my, module + 0.02, module + 0.02));
                }
            }
        }
        ops.push_str("f\nQ\n");
        cv.raw(&ops);
        cv.commit(&mut doc, id)?;
    }
    Ok(Output::pdf(finish(doc)?))
}

/// blobs[0] = pdf, blobs[1] = signature image. params: page (1-based), posX/posY (0-100), width.
pub fn sign(p: &Value, blobs: &[Vec<u8>]) -> Result<Output> {
    let mut doc = load(blob(blobs, 0)?)?;
    let img_bytes = blob(blobs, 1)?;
    let (img, iw, ih) = embed_image(&mut doc, img_bytes)?;
    let ids = pages(&doc);
    if ids.is_empty() {
        bail!("PDF has no pages");
    }
    let page_no = p_i64(p, "page", 1);
    let idx = (page_no - 1).clamp(0, ids.len() as i64 - 1) as usize;
    let id = ids[idx];
    let (w, h) = page_size(&doc, id);
    let sw = p_f32(p, "width", 150.0);
    let sh = sw * (ih as f32 / iw as f32);
    let x = (p_f32(p, "posX", 50.0) / 100.0) * (w - sw);
    let y = (p_f32(p, "posY", 30.0) / 100.0) * (h - sh);
    let mut cv = Canvas::new();
    cv.image(img, x, y, sw, sh);
    cv.commit(&mut doc, id)?;
    Ok(Output::pdf(finish(doc)?))
}
