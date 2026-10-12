//! Scan clean-up tools (deskew / enhance / whiten / signature finder) and OCR.
//! Pages are rendered with pdfium; all pixel work is pure Rust (see imgproc.rs).

use super::render::{encode_jpeg, render_page};
use super::*;
use crate::canvas::Canvas;
use crate::imgproc as ip;
use crate::pdfkit::*;
use image::{ExtendedColorType, GrayImage, ImageEncoder, RgbImage};
use lopdf::{Document, ObjectId};
use pdfium_render::prelude::*;

fn encode_jpeg_gray(g: &GrayImage, quality: u8) -> Result<Vec<u8>> {
    let mut buf = Vec::new();
    image::codecs::jpeg::JpegEncoder::new_with_quality(&mut buf, quality.clamp(1, 100))
        .write_image(g.as_raw(), g.width(), g.height(), ExtendedColorType::L8)?;
    Ok(buf)
}

/// DeviceGray, Flate-compressed (used for the 1-bit-looking whitened pages).
fn embed_gray_flate(doc: &mut Document, g: &GrayImage) -> Result<ObjectId> {
    use flate2::{write::ZlibEncoder, Compression};
    use std::io::Write;
    let mut e = ZlibEncoder::new(Vec::new(), Compression::default());
    e.write_all(g.as_raw())?;
    let data = e.finish()?;
    let mut d = lopdf::Dictionary::new();
    d.set("Type", name("XObject"));
    d.set("Subtype", name("Image"));
    d.set("Width", int(g.width() as i64));
    d.set("Height", int(g.height() as i64));
    d.set("ColorSpace", name("DeviceGray"));
    d.set("BitsPerComponent", int(8));
    d.set("Filter", name("FlateDecode"));
    Ok(doc.add_object(lopdf::Object::Stream(lopdf::Stream::new(d, data))))
}

/// Draw an image XObject over the whole page (what the original did with drawImage).
fn cover_page(doc: &mut Document, page: ObjectId, xo: ObjectId) -> Result<()> {
    let (w, h) = page_size(doc, page);
    let mut cv = Canvas::new();
    cv.image(xo, 0.0, 0.0, w, h);
    cv.commit(doc, page)
}

/// Render every page at `scale`, hand it to `f`, and return the lopdf document that `f` edited.
fn for_each_page<F>(bytes: &[u8], scale: f32, mut f: F) -> Result<Document>
where
    F: FnMut(usize, &RgbImage, &mut Document, ObjectId) -> Result<()>,
{
    let pdfium = super::render::engine()?;
    let rdoc = pdfium.load_pdf_from_byte_slice(bytes, None).map_err(|e| anyhow::anyhow!("Could not open PDF: {e}"))?;
    let mut doc = load(bytes)?;
    let ids = pages(&doc);
    let n = (rdoc.pages().len() as usize).min(ids.len());
    for i in 0..n {
        let page = rdoc.pages().get(i as u16).map_err(|e| anyhow::anyhow!("page {}: {e}", i + 1))?;
        let img = render_page(&page, scale)?;
        f(i, &img, &mut doc, ids[i])?;
    }
    Ok(doc)
}

/// params: auto (bool), angle (deg, used when auto = false), quality (1-100)
pub fn deskew(p: &Value, blobs: &[Vec<u8>]) -> Result<Output> {
    let auto = p_bool(p, "auto", true);
    let manual = p_f32(p, "angle", 0.0);
    let q = p_i64(p, "quality", 92) as u8;
    let mut angles: Vec<f32> = vec![];
    let doc = for_each_page(blob(blobs, 0)?, 1.5, |_, img, doc, id| {
        let angle = if auto { ip::detect_skew(&ip::to_gray(img)) } else { manual };
        angles.push(angle);
        if angle.abs() < 0.1 {
            return Ok(());
        }
        let fixed = ip::rotate(img, angle);
        let jpeg = encode_jpeg(&fixed, q)?;
        let xo = embed_jpeg(doc, &jpeg, fixed.width(), fixed.height(), false);
        cover_page(doc, id, xo)
    })?;
    Ok(Output::with(json!({ "angles": angles }), vec![finish(doc)?]))
}

/// params: denoise, sharpen, binarize (bool), contrast (f), quality (1-100)
pub fn enhance(p: &Value, blobs: &[Vec<u8>]) -> Result<Output> {
    let (denoise, sharpen, binarize) = (p_bool(p, "denoise", true), p_bool(p, "sharpen", true), p_bool(p, "binarize", false));
    let contrast = p_f32(p, "contrast", 1.3);
    let q = p_i64(p, "quality", 92) as u8;
    let doc = for_each_page(blob(blobs, 0)?, 1.5, |_, img, doc, id| {
        let mut g = ip::to_gray(img);
        if denoise {
            g = ip::blur(&g, 3);
        }
        if (contrast - 1.0).abs() > 1e-4 {
            g = ip::contrast(&g, contrast);
        }
        if sharpen {
            g = ip::sharpen(&g);
        }
        if binarize {
            g = ip::adaptive_gaussian(&g, 11, 2.0);
        }
        let jpeg = encode_jpeg_gray(&g, q)?;
        let xo = embed_jpeg(doc, &jpeg, g.width(), g.height(), true);
        cover_page(doc, id, xo)
    })?;
    Ok(Output::pdf(finish(doc)?))
}

/// params: mode ("adaptive" | "otsu" | anything else = fixed), threshold (0-255)
pub fn whiten(p: &Value, blobs: &[Vec<u8>]) -> Result<Output> {
    let mode = p_str(p, "mode");
    let thr = p_f32(p, "threshold", 180.0).clamp(0.0, 255.0) as u8;
    let doc = for_each_page(blob(blobs, 0)?, 2.0, |_, img, doc, id| {
        let g = ip::to_gray(img);
        let out = match mode.as_str() {
            "adaptive" => ip::adaptive_gaussian(&g, 21, 10.0),
            "otsu" => ip::otsu(&g),
            _ => ip::threshold(&g, thr),
        };
        let xo = embed_gray_flate(doc, &out)?;
        cover_page(doc, id, xo)
    })?;
    Ok(Output::pdf(finish(doc)?))
}

/// Candidate signature regions (pixel coordinates at 1.5x page scale).
pub fn sig_detect(blobs: &[Vec<u8>]) -> Result<Output> {
    let pdfium = super::render::engine()?;
    let rdoc = pdfium.load_pdf_from_byte_slice(blob(blobs, 0)?, None).map_err(|e| anyhow::anyhow!("Could not open PDF: {e}"))?;
    let mut all = vec![];
    for i in 0..rdoc.pages().len() {
        let page = rdoc.pages().get(i).map_err(|e| anyhow::anyhow!("{e}"))?;
        let img = render_page(&page, 1.5)?;
        let g = ip::to_gray(&img);
        let (w, h) = (g.width() as f32, g.height() as f32);
        // inverted threshold 30  <=>  gray < 225
        let bin = GrayImage::from_fn(g.width(), g.height(), |x, y| image::Luma([if 255 - g.get_pixel(x, y).0[0] > 30 { 255 } else { 0 }]));
        let mut cands: Vec<(i64, serde_json::Value)> = vec![];
        for (x, y, bw, bh) in ip::outer_boxes(&bin) {
            let area = bw as f32 * bh as f32;
            let aspect = bw as f32 / (bh.max(1) as f32);
            if area > 800.0 && area < w * h * 0.3 && aspect > 0.5 && aspect < 15.0 && bh > 15 {
                let rel_y = y as f32 / h;
                let region = if rel_y > 0.75 { "bottom" } else if rel_y < 0.25 { "top" } else { "middle" };
                let conf = (50 + ((area / 5000.0) * 20.0).round() as i64 + if region == "bottom" { 15 } else { 0 }).min(95);
                cands.push((conf, json!({ "page": i + 1, "region": region, "confidence": conf, "x": x, "y": y, "w": bw, "h": bh })));
            }
        }
        cands.sort_by(|a, b| b.0.cmp(&a.0));
        all.extend(cands.into_iter().take(5).map(|c| c.1));
    }
    Ok(Output::json(json!({ "candidates": all })))
}

// ------------------------------------------------------------------ OCR (ocrs)

/// blobs[0] = PNG/JPEG of a page. Returns { boxes: [{ text, mean, box: [[x,y] x4 (TL,TR,BR,BL)] }] }
pub fn ocr(blobs: &[Vec<u8>]) -> Result<Output> {
    use ocrs::{ImageSource, OcrEngine, OcrEngineParams};
    use rten::Model;

    let det = crate::resources::find("models/text-detection.rten")
        .ok_or_else(|| anyhow::anyhow!("OCR model text-detection.rten not found (run `npm run build` once to download it, or place it in src-tauri/models/)"))?;
    let rec = crate::resources::find("models/text-recognition.rten")
        .ok_or_else(|| anyhow::anyhow!("OCR model text-recognition.rten not found (run `npm run build` once to download it, or place it in src-tauri/models/)"))?;

    let engine = OcrEngine::new(OcrEngineParams {
        detection_model: Some(Model::load_file(det).map_err(|e| anyhow::anyhow!("load detection model: {e}"))?),
        recognition_model: Some(Model::load_file(rec).map_err(|e| anyhow::anyhow!("load recognition model: {e}"))?),
        ..Default::default()
    })
    .map_err(|e| anyhow::anyhow!("OCR engine: {e}"))?;

    let img = image::load_from_memory(blob(blobs, 0)?)?.into_rgb8();
    let src = ImageSource::from_bytes(img.as_raw(), img.dimensions()).map_err(|e| anyhow::anyhow!("{e}"))?;
    let input = engine.prepare_input(src).map_err(|e| anyhow::anyhow!("{e}"))?;
    let words = engine.detect_words(&input).map_err(|e| anyhow::anyhow!("{e}"))?;
    let line_rects = engine.find_text_lines(&input, &words);
    let lines = engine.recognize_text(&input, &line_rects).map_err(|e| anyhow::anyhow!("{e}"))?;

    let mut boxes = vec![];
    for (line, rects) in lines.iter().zip(line_rects.iter()) {
        let line = match line {
            Some(l) => l,
            None => continue,
        };
        let text = line.to_string();
        if text.trim().is_empty() {
            continue;
        }
        let (mut x0, mut y0, mut x1, mut y1) = (f32::MAX, f32::MAX, f32::MIN, f32::MIN);
        for r in rects {
            for c in r.corners() {
                x0 = x0.min(c.x);
                y0 = y0.min(c.y);
                x1 = x1.max(c.x);
                y1 = y1.max(c.y);
            }
        }
        boxes.push(json!({ "text": text, "mean": 0.9, "box": [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] }));
    }
    Ok(Output::json(json!({ "boxes": boxes })))
}
