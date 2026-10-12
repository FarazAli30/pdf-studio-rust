//! pdfium-based operations: page rendering, comparison, compression.

use super::*;
use crate::canvas::Canvas;
use crate::pdfkit::*;
use image::{ExtendedColorType, ImageEncoder, RgbImage};
use pdfium_render::prelude::*;
use std::path::PathBuf;

/// Locate and bind the pdfium shared library. Search order: $PDFIUM_PATH, next to the
/// executable (and ./pdfium, ./resources, ../Resources), the working dir, then the system.
pub fn engine() -> Result<Pdfium> {
    let mut dirs: Vec<PathBuf> = vec![];
    if let Ok(p) = std::env::var("PDFIUM_PATH") {
        dirs.push(PathBuf::from(p));
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(d) = exe.parent() {
            for sub in ["", "pdfium", "resources", "resources/pdfium", "../Resources", "../Resources/pdfium", "../lib"] {
                dirs.push(d.join(sub));
            }
        }
    }
    for sub in ["./", "./pdfium", "./src-tauri/pdfium", "./src-tauri/resources"] {
        dirs.push(PathBuf::from(sub));
    }
    for d in dirs {
        let lib = Pdfium::pdfium_platform_library_name_at_path(&d);
        if let Ok(b) = Pdfium::bind_to_library(lib) {
            return Ok(Pdfium::new(b));
        }
    }
    match Pdfium::bind_to_system_library() {
        Ok(b) => Ok(Pdfium::new(b)),
        Err(_) => bail!("pdfium library not found. Place the pdfium shared library next to the app (or set PDFIUM_PATH). See README."),
    }
}

pub fn render_page(page: &PdfPage, scale: f32) -> Result<RgbImage> {
    let cfg = PdfRenderConfig::new()
        .scale_page_by_factor(scale)
        .set_clear_color(PdfColor::WHITE)
        .render_form_data(true);
    let bmp = page.render_with_config(&cfg).map_err(|e| anyhow::anyhow!("render failed: {e}"))?;
    Ok(bmp.as_image().to_rgb8())
}

pub fn encode_jpeg(img: &RgbImage, quality: u8) -> Result<Vec<u8>> {
    let mut buf = Vec::new();
    let enc = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut buf, quality.clamp(1, 100));
    enc.write_image(img.as_raw(), img.width(), img.height(), ExtendedColorType::Rgb8)?;
    Ok(buf)
}

pub fn encode_png(img: &RgbImage) -> Result<Vec<u8>> {
    let mut buf = Vec::new();
    image::codecs::png::PngEncoder::new(&mut buf).write_image(img.as_raw(), img.width(), img.height(), ExtendedColorType::Rgb8)?;
    Ok(buf)
}

/// params: scale, format ("jpeg"|"png"), quality (1-100), from/to (1-based inclusive, optional)
/// Returns one image blob per page and json { pages: [1-based numbers], widths, heights }.
pub fn render(p: &Value, blobs: &[Vec<u8>]) -> Result<Output> {
    let pdfium = engine()?;
    let doc = pdfium
        .load_pdf_from_byte_slice(blob(blobs, 0)?, Some(&p_str(p, "password")).filter(|s| !s.is_empty()).map(|s| s.as_str()))
        .map_err(|e| anyhow::anyhow!("Could not open PDF: {e}"))?;
    let total = doc.pages().len() as i64;
    let from = p_i64(p, "from", 1).clamp(1, total.max(1));
    let to = p_i64(p, "to", total).clamp(from, total.max(1));
    let scale = p_f32(p, "scale", 1.0).max(0.05);
    let png = p_str(p, "format") == "png";
    let q = p_i64(p, "quality", 92) as u8;

    let mut out = vec![];
    let mut nums = vec![];
    let (mut ws, mut hs) = (vec![], vec![]);
    for n in from..=to {
        let page = doc.pages().get((n - 1) as u16).map_err(|e| anyhow::anyhow!("page {n}: {e}"))?;
        let img = render_page(&page, scale)?;
        ws.push(img.width());
        hs.push(img.height());
        out.push(if png { encode_png(&img)? } else { encode_jpeg(&img, q)? });
        nums.push(n);
    }
    Ok(Output::with(json!({ "pages": nums, "widths": ws, "heights": hs, "pageCount": total }), out))
}

/// blobs[0]=A, blobs[1]=B. params: threshold, mode ("diff"|"side"), scale, maxPages.
/// Returns one JPEG preview per compared page + json { results: [{page, diffPct}] }.
pub fn compare(p: &Value, blobs: &[Vec<u8>]) -> Result<Output> {
    let pdfium = engine()?;
    let da = pdfium.load_pdf_from_byte_slice(blob(blobs, 0)?, None).map_err(|e| anyhow::anyhow!("PDF A: {e}"))?;
    let db = pdfium.load_pdf_from_byte_slice(blob(blobs, 1)?, None).map_err(|e| anyhow::anyhow!("PDF B: {e}"))?;
    let threshold = p_f32(p, "threshold", 25.0);
    let scale = p_f32(p, "scale", 1.2);
    let side = p_str(p, "mode") == "side";
    let max_pages = p_i64(p, "maxPages", 20) as usize;
    let n = (da.pages().len() as usize).min(db.pages().len() as usize).min(max_pages);

    let mut results = vec![];
    let mut previews = vec![];
    for i in 0..n {
        let a = render_page(&da.pages().get(i as u16).map_err(|e| anyhow::anyhow!("{e}"))?, scale)?;
        let b = render_page(&db.pages().get(i as u16).map_err(|e| anyhow::anyhow!("{e}"))?, scale)?;
        let (w, h) = (a.width().min(b.width()), a.height().min(b.height()));
        let mut diff = RgbImage::new(w, h);
        let mut count = 0u64;
        for y in 0..h {
            for x in 0..w {
                let (pa, pb) = (a.get_pixel(x, y).0, b.get_pixel(x, y).0);
                let d = ((pa[0] as i32 - pb[0] as i32).abs() + (pa[1] as i32 - pb[1] as i32).abs() + (pa[2] as i32 - pb[2] as i32).abs()) as f32 / 3.0;
                let px = if d > threshold {
                    count += 1;
                    [255u8, 40, 40]
                } else {
                    // faded copy of A, blended with white like the original (alpha 220 over white)
                    let f = |c: u8| ((c as f32 * 0.4 + 200.0).min(255.0)) as u8;
                    [f(pa[0]), f(pa[1]), f(pa[2])]
                };
                diff.put_pixel(x, y, image::Rgb(px));
            }
        }
        let pct = ((count as f64 / (w as f64 * h as f64).max(1.0)) * 1000.0).round() / 10.0;
        let preview = if side {
            let mut sc = RgbImage::from_pixel(a.width() + b.width() + 4, a.height().max(b.height()), image::Rgb([229, 231, 235]));
            image::imageops::overlay(&mut sc, &a, 0, 0);
            image::imageops::overlay(&mut sc, &b, (a.width() + 4) as i64, 0);
            sc
        } else {
            diff
        };
        previews.push(encode_jpeg(&preview, 85)?);
        results.push(json!({ "page": i + 1, "diffPct": pct }));
    }
    Ok(Output::with(json!({ "results": results, "pagesA": da.pages().len(), "pagesB": db.pages().len() }), previews))
}

/// Rasterise every page at `dpi` and re-encode as JPEG (`quality` 0..1), like the original tool.
pub fn compress(p: &Value, blobs: &[Vec<u8>]) -> Result<Output> {
    let pdfium = engine()?;
    let src = pdfium.load_pdf_from_byte_slice(blob(blobs, 0)?, None).map_err(|e| anyhow::anyhow!("Could not open PDF: {e}"))?;
    let dpi = p_f32(p, "dpi", 120.0);
    let q = (p_f32(p, "quality", 0.72) * 100.0).round() as u8;
    let scale = dpi / 72.0;

    let mut out = new_doc();
    let mut kids = vec![];
    for i in 0..src.pages().len() {
        let page = src.pages().get(i).map_err(|e| anyhow::anyhow!("{e}"))?;
        let (pw, ph) = (page.width().value.round(), page.height().value.round());
        let img = render_page(&page, scale)?;
        let jpeg = encode_jpeg(&img, q)?;
        let xo = embed_jpeg(&mut out, &jpeg, img.width(), img.height(), false);
        let mut cv = Canvas::new();
        cv.image(xo, 0.0, 0.0, pw, ph);
        let res = cv.resources();
        kids.push(new_page(&mut out, pw, ph, cv.ops.into_bytes(), res));
    }
    install_pages(&mut out, &kids)?;
    Ok(Output::pdf(finish(out)?))
}
