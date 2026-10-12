//! Operation registry. Each op takes JSON params + binary blobs and returns JSON + blobs.

pub mod convert;
pub mod info;
pub mod pages;
pub mod render;
pub mod secure;
pub mod vision;
pub mod stamp;

use anyhow::{bail, Result};
use serde_json::{json, Value};

pub struct Output {
    pub json: Value,
    pub blobs: Vec<Vec<u8>>,
}

impl Output {
    pub fn pdf(bytes: Vec<u8>) -> Self {
        Output { json: json!({}), blobs: vec![bytes] }
    }
    pub fn json(v: Value) -> Self {
        Output { json: v, blobs: vec![] }
    }
    pub fn with(v: Value, blobs: Vec<Vec<u8>>) -> Self {
        Output { json: v, blobs }
    }
}

// ---- param helpers ----
pub fn p_str(p: &Value, k: &str) -> String {
    p.get(k).and_then(|v| v.as_str()).unwrap_or("").to_string()
}
pub fn p_f32(p: &Value, k: &str, d: f32) -> f32 {
    p.get(k).and_then(|v| v.as_f64()).map(|v| v as f32).unwrap_or(d)
}
pub fn p_i64(p: &Value, k: &str, d: i64) -> i64 {
    p.get(k).and_then(|v| v.as_i64()).unwrap_or(d)
}
pub fn p_bool(p: &Value, k: &str, d: bool) -> bool {
    p.get(k).and_then(|v| v.as_bool()).unwrap_or(d)
}
pub fn p_usizes(p: &Value, k: &str) -> Vec<usize> {
    p.get(k)
        .and_then(|v| v.as_array())
        .map(|a| a.iter().filter_map(|x| x.as_u64().map(|n| n as usize)).collect())
        .unwrap_or_default()
}
pub fn blob(blobs: &[Vec<u8>], i: usize) -> Result<&Vec<u8>> {
    match blobs.get(i) {
        Some(b) if !b.is_empty() => Ok(b),
        _ => bail!("missing input file #{}", i + 1),
    }
}

pub fn dispatch(op: &str, p: Value, blobs: Vec<Vec<u8>>) -> Result<Output> {
    match op {
        // ---- page structure ----
        "info" => pages::info(&blobs),
        "merge" => pages::merge(&blobs),
        "split" => pages::split(&p, &blobs),
        "split_ranges" => pages::split_ranges(&p, &blobs),
        "extract" => pages::extract(&p, &blobs),
        "reorder" => pages::reorder(&p, &blobs),
        "reverse" => pages::reverse(&blobs),
        "rotate" => pages::rotate(&p, &blobs),
        "booklet" => pages::booklet(&blobs),
        "nup" => pages::nup(&p, &blobs),
        "duplex" => pages::duplex(&p, &blobs),
        "crop" => pages::crop(&p, &blobs),
        "page_size" => pages::resize(&p, &blobs),
        // ---- stamping ----
        "bg_color" => stamp::bg_color(&p, &blobs),
        "watermark" => stamp::watermark(&p, &blobs),
        "header_footer" => stamp::header_footer(&p, &blobs),
        "bates" => stamp::bates(&p, &blobs),
        "date_stamp" => stamp::date_stamp(&p, &blobs),
        "qr_stamp" => stamp::qr_stamp(&p, &blobs),
        "sign" => stamp::sign(&p, &blobs),
        // ---- metadata / structure readers ----
        "meta_get" => info::meta_get(&blobs),
        "meta_set" => info::meta_set(&p, &blobs),
        "attachments" => info::attachments(&blobs),
        "links" => info::links(&blobs),
        "bookmarks" => info::bookmarks(&blobs),
        "repair" => info::repair(&p, &blobs),
        // ---- phase 2: render / convert ----
        "render" => render::render(&p, &blobs),
        "compare" => render::compare(&p, &blobs),
        "compress" => render::compress(&p, &blobs),
        "images_to_pdf" => convert::images_to_pdf(&p, &blobs),
        "txt_to_pdf" => convert::txt_to_pdf(&p),
        "md_to_pdf" => convert::md_to_pdf(&p),
        // ---- phase 4: pure-Rust image processing + OCR ----
        "ocr" => vision::ocr(&blobs),
        "deskew" => vision::deskew(&p, &blobs),
        "enhance" => vision::enhance(&p, &blobs),
        "whiten" => vision::whiten(&p, &blobs),
        "sig_detect" => vision::sig_detect(&blobs),
        // ---- security ----
        "protect" => secure::protect(&p, &blobs),
        "unlock" => secure::unlock(&p, &blobs),
        "change_password" => secure::change_password(&p, &blobs),
        other => bail!("unknown operation '{other}'"),
    }
}
