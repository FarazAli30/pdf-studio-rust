//! Image / SVG / HEIC / TXT / Markdown -> PDF.

use super::*;
use crate::canvas::{Canvas, FontCache};
use crate::fonts::{text_width, Font};
use crate::pdfkit::*;
use image::DynamicImage;
use lopdf::{Document, ObjectId};

// ------------------------------------------------------------------ image decoding

fn looks_like_svg(b: &[u8]) -> bool {
    let head = String::from_utf8_lossy(&b[..b.len().min(2048)]).to_lowercase();
    head.contains("<svg")
}

fn looks_like_heic(b: &[u8]) -> bool {
    b.len() > 12 && &b[4..8] == b"ftyp" && matches!(&b[8..12], b"heic" | b"heix" | b"hevc" | b"hevx" | b"mif1" | b"msf1" | b"heim" | b"heis")
}

fn render_svg(bytes: &[u8]) -> Result<DynamicImage> {
    use resvg::{tiny_skia, usvg};
    let mut opt = usvg::Options::default();
    std::sync::Arc::make_mut(&mut opt.fontdb).load_system_fonts();
    let tree = usvg::Tree::from_data(bytes, &opt).map_err(|e| anyhow::anyhow!("Invalid SVG: {e}"))?;
    let size = tree.size();
    let (w, h) = ((size.width() * 2.0).ceil().max(1.0) as u32, (size.height() * 2.0).ceil().max(1.0) as u32);
    let mut pm = tiny_skia::Pixmap::new(w, h).ok_or_else(|| anyhow::anyhow!("SVG too large"))?;
    resvg::render(&tree, tiny_skia::Transform::from_scale(2.0, 2.0), &mut pm.as_mut());
    let png = pm.encode_png().map_err(|e| anyhow::anyhow!("{e}"))?;
    Ok(image::load_from_memory(&png)?)
}

#[cfg(feature = "heic")]
fn decode_heic(bytes: &[u8]) -> Result<DynamicImage> {
    use libheif_rs::{ColorSpace, HeifContext, LibHeif, RgbChroma};
    let ctx = HeifContext::read_from_bytes(bytes).map_err(|e| anyhow::anyhow!("HEIC: {e}"))?;
    let handle = ctx.primary_image_handle().map_err(|e| anyhow::anyhow!("HEIC: {e}"))?;
    let lib = LibHeif::new();
    let img = lib.decode(&handle, ColorSpace::Rgb(RgbChroma::Rgb), None).map_err(|e| anyhow::anyhow!("HEIC: {e}"))?;
    let planes = img.planes();
    let inter = planes.interleaved.ok_or_else(|| anyhow::anyhow!("HEIC: no interleaved plane"))?;
    let (w, h) = (inter.width as usize, inter.height as usize);
    let mut rgb = Vec::with_capacity(w * h * 3);
    for y in 0..h {
        let row = &inter.data[y * inter.stride..y * inter.stride + w * 3];
        rgb.extend_from_slice(row);
    }
    let buf = image::RgbImage::from_raw(w as u32, h as u32, rgb).ok_or_else(|| anyhow::anyhow!("HEIC: bad buffer"))?;
    Ok(DynamicImage::ImageRgb8(buf))
}

#[cfg(not(feature = "heic"))]
fn decode_heic(_bytes: &[u8]) -> Result<DynamicImage> {
    bail!("HEIC support is not compiled in. Rebuild with `--features heic` (requires system libheif).")
}

/// Embed any supported image; returns (xobject, width px, height px).
fn embed_any(doc: &mut Document, bytes: &[u8]) -> Result<(ObjectId, u32, u32)> {
    if looks_like_svg(bytes) {
        let img = render_svg(bytes)?;
        let mut png = Vec::new();
        img.write_to(&mut std::io::Cursor::new(&mut png), image::ImageFormat::Png)?;
        return embed_image(doc, &png);
    }
    let decoded: Option<DynamicImage> = if looks_like_heic(bytes) { Some(decode_heic(bytes)?) } else { None };
    if let Some(img) = decoded {
        let rgb = img.to_rgb8();
        let jpeg = super::render::encode_jpeg(&rgb, 92)?;
        let id = embed_jpeg(doc, &jpeg, rgb.width(), rgb.height(), false);
        return Ok((id, rgb.width(), rgb.height()));
    }
    // plain JPEG: pass the original bytes through when it is 8-bit gray/RGB
    if bytes.len() > 3 && bytes[0] == 0xFF && bytes[1] == 0xD8 {
        if let Ok(img) = image::load_from_memory_with_format(bytes, image::ImageFormat::Jpeg) {
            match img.color() {
                image::ColorType::Rgb8 => return Ok((embed_jpeg(doc, bytes, img.width(), img.height(), false), img.width(), img.height())),
                image::ColorType::L8 => return Ok((embed_jpeg(doc, bytes, img.width(), img.height(), true), img.width(), img.height())),
                _ => {}
            }
        }
    }
    embed_image(doc, bytes)
}

fn paper(name: &str) -> Option<(f32, f32)> {
    match name {
        "A4" => Some((595.28, 841.89)),
        "Letter" => Some((612.0, 792.0)),
        "Legal" => Some((612.0, 1008.0)),
        _ => None, // "fit" / "Auto"
    }
}

/// blobs = images (JPEG/PNG/GIF/WEBP/BMP/TIFF/SVG/HEIC). params.pageSize = A4|Letter|fit|Auto
pub fn images_to_pdf(p: &Value, blobs: &[Vec<u8>]) -> Result<Output> {
    if blobs.is_empty() {
        bail!("No images selected");
    }
    let size = paper(&p_str(p, "pageSize"));
    let mut doc = new_doc();
    let mut kids = vec![];
    for b in blobs {
        let is_svg = looks_like_svg(b);
        let (xo, iw, ih) = embed_any(&mut doc, b)?;
        let (iw, ih) = (iw as f32, ih as f32);
        // SVGs are rasterised at 2x, so their natural page size is half the pixel size
        let k = if is_svg { 2.0 } else { 1.0 };
        let (pw, ph) = size.unwrap_or((iw / k, ih / k));
        let scale = (pw / iw).min(ph / ih);
        let (dw, dh) = (iw * scale, ih * scale);
        let mut cv = Canvas::new();
        cv.image(xo, (pw - dw) / 2.0, (ph - dh) / 2.0, dw, dh);
        let res = cv.resources();
        kids.push(new_page(&mut doc, pw, ph, cv.ops.into_bytes(), res));
    }
    install_pages(&mut doc, &kids)?;
    Ok(Output::pdf(finish(doc)?))
}

// ------------------------------------------------------------------ flowing text

struct Theme {
    bg: Option<[f32; 3]>,
    text: [f32; 3],
    heading: [f32; 3],
    code_bg: [f32; 3],
    code_text: [f32; 3],
}

struct Flow {
    doc: Document,
    reg: ObjectId,
    bold: ObjectId,
    mono: ObjectId,
    pw: f32,
    ph: f32,
    m: f32,
    y: f32,
    theme: Theme,
    cur: Canvas,
    pages: Vec<ObjectId>,
}

fn wrap(font: Font, text: &str, size: f32, max: f32) -> Vec<String> {
    let mut lines = vec![];
    let mut line = String::new();
    for word in text.split(' ') {
        let test = if line.is_empty() { word.to_string() } else { format!("{line} {word}") };
        if text_width(font, &test, size) > max && !line.is_empty() {
            lines.push(std::mem::take(&mut line));
            line = word.to_string();
        } else {
            line = test;
        }
        // hard-break a single word that is wider than the line
        while text_width(font, &line, size) > max && line.chars().count() > 1 {
            let mut cut = String::new();
            for c in line.chars() {
                let mut t = cut.clone();
                t.push(c);
                if text_width(font, &t, size) > max && !cut.is_empty() {
                    break;
                }
                cut = t;
            }
            let rest: String = line.chars().skip(cut.chars().count()).collect();
            lines.push(cut);
            line = rest;
        }
    }
    if !line.is_empty() {
        lines.push(line);
    }
    if lines.is_empty() {
        lines.push(String::new());
    }
    lines
}

impl Flow {
    fn new(pw: f32, ph: f32, m: f32, theme: Theme) -> Self {
        let mut doc = new_doc();
        let mut fc = FontCache::new();
        let reg = fc.get(&mut doc, Font::Helvetica);
        let bold = fc.get(&mut doc, Font::HelveticaBold);
        let mono = fc.get(&mut doc, Font::Courier);
        let mut f = Flow { doc, reg, bold, mono, pw, ph, m, y: ph - m, theme, cur: Canvas::new(), pages: vec![] };
        f.paint_bg();
        f
    }
    fn paint_bg(&mut self) {
        if let Some(bg) = self.theme.bg {
            self.cur.rect(0.0, 0.0, self.pw, self.ph, bg, 1.0);
        }
    }
    fn add_page(&mut self) {
        let cv = std::mem::replace(&mut self.cur, Canvas::new());
        let res = cv.resources();
        let id = new_page(&mut self.doc, self.pw, self.ph, cv.ops.into_bytes(), res);
        self.pages.push(id);
        self.y = self.ph - self.m;
        self.paint_bg();
    }
    fn font_id(&self, f: Font) -> ObjectId {
        match f {
            Font::Helvetica => self.reg,
            Font::HelveticaBold => self.bold,
            Font::Courier => self.mono,
        }
    }
    fn para(&mut self, text: &str, font: Font, size: f32, color: [f32; 3], indent: f32, line_h: f32) {
        let max = self.pw - self.m * 2.0 - indent;
        for line in wrap(font, text, size, max) {
            if self.y - size < self.m {
                self.add_page();
            }
            let fid = self.font_id(font);
            self.cur.text(fid, &line, self.m + indent, self.y - size, size, color, 1.0, 0.0);
            self.y -= line_h;
        }
    }
    fn finish(mut self) -> Result<Vec<u8>> {
        self.add_page(); // flushes the current page into `pages`
        let kids = self.pages.clone();
        install_pages(&mut self.doc, &kids)?;
        finish(self.doc)
    }
}

/// params: text, fontSize, margin
pub fn txt_to_pdf(p: &Value) -> Result<Output> {
    let text = p_str(p, "text");
    let fs = p_f32(p, "fontSize", 11.0);
    let m = p_f32(p, "margin", 40.0);
    let (pw, ph) = (595.28, 841.89);
    let theme = Theme { bg: None, text: [0.1; 3], heading: [0.1; 3], code_bg: [0.9; 3], code_text: [0.1; 3] };
    let mut fl = Flow::new(pw, ph, m, theme);
    let lh = fs * 1.4;
    let text_col = fl.theme.text;
    for raw in text.replace("\r\n", "\n").split('\n') {
        if raw.trim().is_empty() {
            if fl.y - lh < m {
                fl.add_page();
            }
            fl.y -= lh;
            continue;
        }
        fl.para(raw, Font::Courier, fs, text_col, 0.0, lh);
    }
    Ok(Output::pdf(fl.finish()?))
}

fn theme_for(name: &str) -> Theme {
    match name {
        "dark" => Theme { bg: Some([0.1, 0.1, 0.15]), text: [0.9; 3], heading: [0.7, 0.7, 1.0], code_bg: [0.15, 0.15, 0.2], code_text: [0.8; 3] },
        "sepia" => Theme { bg: Some([0.98, 0.95, 0.87]), text: [0.28, 0.2, 0.1], heading: [0.4, 0.15, 0.05], code_bg: [0.92, 0.88, 0.78], code_text: [0.3, 0.2, 0.1] },
        _ => Theme { bg: Some([1.0, 1.0, 1.0]), text: [0.1; 3], heading: [0.05, 0.05, 0.35], code_bg: [0.95; 3], code_text: [0.2; 3] },
    }
}

/// params: text (markdown), theme (light|dark|sepia), pageSize (A4|Letter)
pub fn md_to_pdf(p: &Value) -> Result<Output> {
    use pulldown_cmark::{Event, HeadingLevel, Options, Parser, Tag, TagEnd};
    let md = p_str(p, "text");
    let (pw, ph) = paper(&p_str(p, "pageSize")).unwrap_or((595.28, 841.89));
    let mut fl = Flow::new(pw, ph, 50.0, theme_for(&p_str(p, "theme")));
    let m = fl.m;
    let (text_c, head_c, code_bg, code_tc) = (fl.theme.text, fl.theme.heading, fl.theme.code_bg, fl.theme.code_text);

    let mut buf = String::new();
    let mut heading: Option<usize> = None;
    let mut in_code = false;
    let mut quote_depth = 0usize;
    let mut quote_buf = String::new();
    let mut item_depth = 0usize;

    for ev in Parser::new_ext(&md, Options::empty()) {
        match ev {
            Event::Start(Tag::Heading { level, .. }) => {
                heading = Some(match level {
                    HeadingLevel::H1 => 0,
                    HeadingLevel::H2 => 1,
                    HeadingLevel::H3 => 2,
                    HeadingLevel::H4 => 3,
                    HeadingLevel::H5 => 4,
                    HeadingLevel::H6 => 5,
                });
                buf.clear();
            }
            Event::End(TagEnd::Heading(_)) => {
                let fs = [32.0, 24.0, 20.0, 16.0, 14.0, 12.0][heading.take().unwrap_or(5)];
                fl.y -= 8.0;
                let t = std::mem::take(&mut buf);
                fl.para(&t, Font::HelveticaBold, fs, head_c, 0.0, fs * 1.5);
                fl.y -= 4.0;
            }
            Event::Start(Tag::Paragraph) => buf.clear(),
            Event::End(TagEnd::Paragraph) => {
                let t = std::mem::take(&mut buf);
                if quote_depth > 0 {
                    if !quote_buf.is_empty() {
                        quote_buf.push(' ');
                    }
                    quote_buf.push_str(&t);
                } else if item_depth > 0 {
                    // loose list item paragraph handled when the item ends
                    buf = t;
                } else {
                    fl.para(&t, Font::Helvetica, 11.0, text_c, 0.0, 16.5);
                    fl.y -= 6.0;
                }
            }
            Event::Start(Tag::Item) => {
                // nested item: flush the parent's text first
                if item_depth > 0 && !buf.trim().is_empty() {
                    let t = std::mem::take(&mut buf);
                    fl.para(&format!("\u{2022} {}", t.trim()), Font::Helvetica, 11.0, text_c, 12.0, 16.5);
                }
                item_depth += 1;
                buf.clear();
            }
            Event::End(TagEnd::Item) => {
                item_depth = item_depth.saturating_sub(1);
                let t = std::mem::take(&mut buf);
                if !t.trim().is_empty() {
                    fl.para(&format!("\u{2022} {}", t.trim()), Font::Helvetica, 11.0, text_c, 12.0, 16.5);
                }
            }
            Event::End(TagEnd::List(_)) => {
                if item_depth == 0 {
                    fl.y -= 4.0;
                }
            }
            Event::Start(Tag::CodeBlock(_)) => {
                in_code = true;
                buf.clear();
            }
            Event::End(TagEnd::CodeBlock) => {
                in_code = false;
                let code = std::mem::take(&mut buf);
                let lines: Vec<&str> = code.trim_end_matches('\n').split('\n').collect();
                let block_h = lines.len() as f32 * 15.0 + 16.0;
                if fl.y - block_h < m {
                    fl.add_page();
                }
                let (x, w, y) = (m, fl.pw - m * 2.0, fl.y);
                fl.cur.rect(x, y - block_h, w, block_h, code_bg, 1.0);
                let mut cy = y - 12.0;
                let mono = fl.mono;
                for l in lines {
                    if cy - 10.0 < m {
                        fl.add_page();
                        cy = fl.y - 12.0;
                    }
                    let l: String = l.chars().take(90).collect();
                    fl.cur.text(mono, &l, m + 8.0, cy, 9.0, code_tc, 1.0, 0.0);
                    cy -= 14.0;
                }
                fl.y -= block_h + 8.0;
            }
            Event::Start(Tag::BlockQuote(_)) => {
                quote_depth += 1;
                if quote_depth == 1 {
                    quote_buf.clear();
                }
            }
            Event::End(TagEnd::BlockQuote(_)) => {
                quote_depth = quote_depth.saturating_sub(1);
                if quote_depth == 0 {
                    let (x, y) = (m, fl.y);
                    fl.cur.rect(x, y - 20.0, 3.0, 20.0, head_c, 1.0);
                    let t = std::mem::take(&mut quote_buf);
                    fl.para(&t, Font::Helvetica, 11.0, text_c, 12.0, 16.5);
                    fl.y -= 4.0;
                }
            }
            Event::Rule => {
                if fl.y - 20.0 < m {
                    fl.add_page();
                }
                let (y, pw2) = (fl.y, fl.pw);
                fl.cur.line(m, y - 10.0, pw2 - m, y - 10.0, text_c, 0.5);
                fl.y -= 20.0;
            }
            Event::Text(t) => buf.push_str(&t),
            Event::Code(t) => {
                if !in_code {
                    buf.push_str(&t);
                }
            }
            Event::SoftBreak | Event::HardBreak => {
                if in_code {
                    buf.push('\n');
                } else {
                    buf.push(' ');
                }
            }
            _ => {}
        }
    }
    Ok(Output::pdf(fl.finish()?))
}
