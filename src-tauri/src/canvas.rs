//! Content-stream builder used by every "draw on top of a page" tool.

use crate::fonts::{hex_string, Font};
use crate::pdfkit::*;
use anyhow::Result;
use lopdf::{Dictionary, Document, Object, ObjectId};

pub struct Canvas {
    pub ops: String,
    fonts: Vec<(String, ObjectId)>,
    gstates: Vec<(String, f32)>,
    xobjects: Vec<(String, ObjectId)>,
}

fn f(v: f32) -> String {
    let s = format!("{:.4}", v);
    let s = s.trim_end_matches('0').trim_end_matches('.').to_string();
    if s.is_empty() || s == "-" {
        "0".into()
    } else {
        s
    }
}

impl Canvas {
    pub fn new() -> Self {
        Canvas { ops: String::new(), fonts: vec![], gstates: vec![], xobjects: vec![] }
    }

    fn font_key(&mut self, id: ObjectId) -> String {
        if let Some((k, _)) = self.fonts.iter().find(|(_, i)| *i == id) {
            return k.clone();
        }
        let k = format!("PSF{}", self.fonts.len() + 1);
        self.fonts.push((k.clone(), id));
        k
    }

    fn gs_key(&mut self, opacity: f32) -> String {
        if let Some((k, _)) = self.gstates.iter().find(|(_, o)| (*o - opacity).abs() < 1e-4) {
            return k.clone();
        }
        let k = format!("PSG{}", self.gstates.len() + 1);
        self.gstates.push((k.clone(), opacity));
        k
    }

    fn xobj_key(&mut self, id: ObjectId) -> String {
        if let Some((k, _)) = self.xobjects.iter().find(|(_, i)| *i == id) {
            return k.clone();
        }
        let k = format!("PSX{}", self.xobjects.len() + 1);
        self.xobjects.push((k.clone(), id));
        k
    }

    #[allow(clippy::too_many_arguments)]
    pub fn text(&mut self, font_id: ObjectId, s: &str, x: f32, y: f32, size: f32, rgb: [f32; 3], opacity: f32, rot_deg: f32) {
        if s.is_empty() {
            return;
        }
        let fk = self.font_key(font_id);
        self.ops.push_str("q\n");
        if opacity < 0.999 {
            let g = self.gs_key(opacity.clamp(0.0, 1.0));
            self.ops.push_str(&format!("/{} gs\n", g));
        }
        let (sn, cs) = rot_deg.to_radians().sin_cos();
        self.ops.push_str(&format!("{} {} {} rg\n", f(rgb[0]), f(rgb[1]), f(rgb[2])));
        self.ops.push_str(&format!("{} {} {} {} {} {} cm\n", f(cs), f(sn), f(-sn), f(cs), f(x), f(y)));
        self.ops.push_str(&format!("BT\n/{} {} Tf\n{} Tj\nET\n", fk, f(size), hex_string(s)));
        self.ops.push_str("Q\n");
    }

    pub fn rect(&mut self, x: f32, y: f32, w: f32, h: f32, rgb: [f32; 3], opacity: f32) {
        self.ops.push_str("q\n");
        if opacity < 0.999 {
            let g = self.gs_key(opacity.clamp(0.0, 1.0));
            self.ops.push_str(&format!("/{} gs\n", g));
        }
        self.ops.push_str(&format!("{} {} {} rg\n{} {} {} {} re\nf\nQ\n", f(rgb[0]), f(rgb[1]), f(rgb[2]), f(x), f(y), f(w), f(h)));
    }

    pub fn stroke_rect(&mut self, x: f32, y: f32, w: f32, h: f32, rgb: [f32; 3], line: f32) {
        self.ops.push_str(&format!(
            "q\n{} {} {} RG\n{} w\n{} {} {} {} re\nS\nQ\n",
            f(rgb[0]), f(rgb[1]), f(rgb[2]), f(line), f(x), f(y), f(w), f(h)
        ));
    }

    pub fn line(&mut self, x1: f32, y1: f32, x2: f32, y2: f32, rgb: [f32; 3], width: f32) {
        self.ops.push_str(&format!(
            "q\n{} {} {} RG\n{} w\n{} {} m\n{} {} l\nS\nQ\n",
            f(rgb[0]), f(rgb[1]), f(rgb[2]), f(width), f(x1), f(y1), f(x2), f(y2)
        ));
    }

    /// Draw an Image / Form XObject into the box (x, y, w, h) — for forms pass the
    /// scale factors via `xobject_scaled`.
    pub fn image(&mut self, id: ObjectId, x: f32, y: f32, w: f32, h: f32) {
        let k = self.xobj_key(id);
        self.ops.push_str(&format!("q\n{} 0 0 {} {} {} cm\n/{} Do\nQ\n", f(w), f(h), f(x), f(y), k));
    }

    /// Draw a Form XObject whose BBox is `bw` x `bh` (origin already normalised by its Matrix)
    /// scaled to `w` x `h` at (x, y).
    pub fn form(&mut self, id: ObjectId, bw: f32, bh: f32, x: f32, y: f32, w: f32, h: f32) {
        let k = self.xobj_key(id);
        let sx = if bw > 0.0 { w / bw } else { 1.0 };
        let sy = if bh > 0.0 { h / bh } else { 1.0 };
        self.ops.push_str(&format!("q\n{} 0 0 {} {} {} cm\n/{} Do\nQ\n", f(sx), f(sy), f(x), f(y), k));
    }

    pub fn raw(&mut self, s: &str) {
        self.ops.push_str(s);
    }

    /// Resource dictionary for a stand-alone page that only contains this canvas.
    pub fn resources(&self) -> Dictionary {
        let mut res = Dictionary::new();
        let mut fd = Dictionary::new();
        for (k, id) in &self.fonts {
            fd.set(k.as_str(), Object::Reference(*id));
        }
        if !self.fonts.is_empty() {
            res.set("Font", Object::Dictionary(fd));
        }
        let mut gd = Dictionary::new();
        for (k, o) in &self.gstates {
            let mut g = Dictionary::new();
            g.set("Type", name("ExtGState"));
            g.set("ca", real(*o));
            g.set("CA", real(*o));
            gd.set(k.as_str(), Object::Dictionary(g));
        }
        if !self.gstates.is_empty() {
            res.set("ExtGState", Object::Dictionary(gd));
        }
        let mut xd = Dictionary::new();
        for (k, id) in &self.xobjects {
            xd.set(k.as_str(), Object::Reference(*id));
        }
        if !self.xobjects.is_empty() {
            res.set("XObject", Object::Dictionary(xd));
        }
        res
    }

    /// Merge our resources into the page and append the content stream.
    pub fn commit(self, doc: &mut Document, page: ObjectId) -> Result<()> {
        let mut res = page_resources(doc, page);
        let ours = self.resources();
        for (key, val) in ours.iter() {
            let mut sub = match res.get(key.as_slice()) {
                Ok(o) => match resolve(doc, o) {
                    Object::Dictionary(d) => d.clone(),
                    _ => Dictionary::new(),
                },
                Err(_) => Dictionary::new(),
            };
            if let Object::Dictionary(add) = val {
                for (k, v) in add.iter() {
                    sub.set(k.clone(), v.clone());
                }
            }
            res.set(key.clone(), Object::Dictionary(sub));
        }
        page_dict_mut(doc, page)?.set("Resources", Object::Dictionary(res));
        append_content(doc, page, self.ops.into_bytes())
    }
}

/// One shared font object per (document, font).
pub struct FontCache {
    ids: Vec<(Font, ObjectId)>,
}

impl FontCache {
    pub fn new() -> Self {
        FontCache { ids: vec![] }
    }
    pub fn get(&mut self, doc: &mut Document, font: Font) -> ObjectId {
        if let Some((_, id)) = self.ids.iter().find(|(f, _)| *f == font) {
            return *id;
        }
        let id = doc.add_object(Object::Dictionary(font.dict()));
        self.ids.push((font, id));
        id
    }
}

pub fn hex_rgb(hex: &str) -> [f32; 3] {
    let h = hex.trim_start_matches('#');
    let p = |i: usize| -> f32 {
        h.get(i..i + 2)
            .and_then(|s| u8::from_str_radix(s, 16).ok())
            .map(|v| v as f32 / 255.0)
            .unwrap_or(0.0)
    };
    [p(0), p(2), p(4)]
}
