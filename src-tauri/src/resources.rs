//! Locate bundled resource files (pdfium, OCR models) in dev and in installed builds.

use std::path::PathBuf;

pub fn find(rel: &str) -> Option<PathBuf> {
    let mut bases: Vec<PathBuf> = vec![];
    if let Ok(p) = std::env::var("PDFSTUDIO_RES") {
        bases.push(PathBuf::from(p));
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(d) = exe.parent() {
            for sub in ["", "resources", "../Resources", "../Resources/resources", "../lib/pdf-studio", "../lib/PDF Studio"] {
                bases.push(d.join(sub));
            }
        }
    }
    for sub in ["./", "./src-tauri", "../src-tauri"] {
        bases.push(PathBuf::from(sub));
    }
    bases.into_iter().map(|b| b.join(rel)).find(|p| p.is_file())
}
