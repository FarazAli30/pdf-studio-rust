use super::*;
use crate::pdfkit::*;
use crate::security::{encrypt_in_place, perm};

/// Prune + compress, then encrypt and serialise (encryption must be last).
fn finish_encrypted(mut doc: lopdf::Document, user: &str, owner: &str, perms: u32) -> Result<Vec<u8>> {
    doc.prune_objects();
    doc.compress();
    encrypt_in_place(&mut doc, user, owner, perms)?;
    save_raw(&mut doc)
}

pub fn protect(p: &Value, blobs: &[Vec<u8>]) -> Result<Output> {
    let pw = p_str(p, "password");
    if pw.is_empty() {
        bail!("Enter a password");
    }
    let doc = load(blob(blobs, 0)?)?;
    // Same permission set as the original UI: low-res printing + accessibility only.
    let perms = perm::PRINT | perm::ACCESSIBILITY;
    Ok(Output::pdf(finish_encrypted(doc, &pw, &pw, perms)?))
}

pub fn unlock(p: &Value, blobs: &[Vec<u8>]) -> Result<Output> {
    let doc = load_with_password(blob(blobs, 0)?, &p_str(p, "password"))?;
    Ok(Output::pdf(finish(doc)?))
}

pub fn change_password(p: &Value, blobs: &[Vec<u8>]) -> Result<Output> {
    let old = p_str(p, "oldPassword");
    let new = p_str(p, "newPassword");
    let doc = load_with_password(blob(blobs, 0)?, &old)
        .map_err(|e| anyhow::anyhow!("Wrong password or unsupported encryption ({e})"))?;
    if new.is_empty() {
        return Ok(Output::pdf(finish(doc)?));
    }
    Ok(Output::pdf(finish_encrypted(doc, &new, &new, perm::ALL)?))
}
