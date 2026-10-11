//! PDF standard security handler.
//!   * encrypt : V2 / R3, RC4-128 (opens everywhere)
//!   * decrypt : V1/V2 RC4 (R2/R3) and V4 AES-128 (AESV2). AES-256 (V5) is reported as unsupported.

use crate::pdfkit::{name, resolve};
use aes::Aes128;
use anyhow::{anyhow, bail, Result};
use cbc::cipher::{block_padding::Pkcs7, BlockDecryptMut, KeyIvInit};
use lopdf::{Dictionary, Document, Object, ObjectId, StringFormat};
use md5::{Digest, Md5};

const PAD: [u8; 32] = [
    0x28, 0xBF, 0x4E, 0x5E, 0x4E, 0x75, 0x8A, 0x41, 0x64, 0x00, 0x4E, 0x56, 0xFF, 0xFA, 0x01, 0x08, 0x2E, 0x2E, 0x00, 0xB6,
    0xD0, 0x68, 0x3E, 0x80, 0x2F, 0x0C, 0xA9, 0xFE, 0x64, 0x53, 0x69, 0x7A,
];

fn md5(data: &[u8]) -> [u8; 16] {
    let mut h = Md5::new();
    h.update(data);
    h.finalize().into()
}

fn rc4(key: &[u8], data: &[u8]) -> Vec<u8> {
    let mut s: [u8; 256] = core::array::from_fn(|i| i as u8);
    let mut j = 0u8;
    for i in 0..256 {
        j = j.wrapping_add(s[i]).wrapping_add(key[i % key.len()]);
        s.swap(i, j as usize);
    }
    let (mut i, mut j) = (0u8, 0u8);
    data.iter()
        .map(|b| {
            i = i.wrapping_add(1);
            j = j.wrapping_add(s[i as usize]);
            s.swap(i as usize, j as usize);
            let k = s[s[i as usize].wrapping_add(s[j as usize]) as usize];
            b ^ k
        })
        .collect()
}

fn xor_key(key: &[u8], i: u8) -> Vec<u8> {
    key.iter().map(|b| b ^ i).collect()
}

fn pad_pw(pw: &[u8]) -> [u8; 32] {
    let mut out = [0u8; 32];
    let n = pw.len().min(32);
    out[..n].copy_from_slice(&pw[..n]);
    out[n..].copy_from_slice(&PAD[..32 - n]);
    out
}

// Algorithm 2
fn file_key(user_pw: &[u8], o: &[u8], p: i32, id0: &[u8], r: i64, n: usize, encrypt_metadata: bool) -> Vec<u8> {
    let mut buf = Vec::new();
    buf.extend_from_slice(&pad_pw(user_pw));
    buf.extend_from_slice(&o[..o.len().min(32)]);
    buf.extend_from_slice(&p.to_le_bytes());
    buf.extend_from_slice(id0);
    if r >= 4 && !encrypt_metadata {
        buf.extend_from_slice(&[0xFF; 4]);
    }
    let mut h = md5(&buf);
    if r >= 3 {
        for _ in 0..50 {
            h = md5(&h[..n]);
        }
    }
    h[..n].to_vec()
}

fn owner_rc4_key(owner_pw: &[u8], r: i64, n: usize) -> Vec<u8> {
    let mut h = md5(&pad_pw(owner_pw));
    if r >= 3 {
        for _ in 0..50 {
            h = md5(&h);
        }
    }
    h[..n].to_vec()
}

// Algorithm 3
fn compute_o(owner_pw: &[u8], user_pw: &[u8], r: i64, n: usize) -> Vec<u8> {
    let opw = if owner_pw.is_empty() { user_pw } else { owner_pw };
    let key = owner_rc4_key(opw, r, n);
    let mut out = rc4(&key, &pad_pw(user_pw));
    if r >= 3 {
        for i in 1..=19u8 {
            out = rc4(&xor_key(&key, i), &out);
        }
    }
    out
}

// Algorithm 4 / 5
fn compute_u(key: &[u8], id0: &[u8], r: i64) -> Vec<u8> {
    if r == 2 {
        return rc4(key, &PAD);
    }
    let mut b = Vec::new();
    b.extend_from_slice(&PAD);
    b.extend_from_slice(id0);
    let mut x = rc4(key, &md5(&b));
    for i in 1..=19u8 {
        x = rc4(&xor_key(key, i), &x);
    }
    x.extend_from_slice(&[0u8; 16]);
    x
}

// Algorithm 7: recover the (padded) user password from /O using the owner password
fn owner_to_user(owner_pw: &[u8], o: &[u8], r: i64, n: usize) -> Vec<u8> {
    let key = owner_rc4_key(owner_pw, r, n);
    if r == 2 {
        return rc4(&key, o);
    }
    let mut data = o.to_vec();
    for i in (0..=19u8).rev() {
        data = rc4(&xor_key(&key, i), &data);
    }
    data
}

fn obj_key(key: &[u8], id: ObjectId, aes: bool) -> Vec<u8> {
    let mut b = key.to_vec();
    b.extend_from_slice(&id.0.to_le_bytes()[..3]);
    b.extend_from_slice(&id.1.to_le_bytes()[..2]);
    if aes {
        b.extend_from_slice(b"sAlT");
    }
    let h = md5(&b);
    h[..(key.len() + 5).min(16)].to_vec()
}

fn aes_decrypt(key: &[u8], data: &[u8]) -> Vec<u8> {
    if data.len() < 32 {
        return vec![];
    }
    let (iv, ct) = data.split_at(16);
    cbc::Decryptor::<Aes128>::new_from_slices(key, iv)
        .ok()
        .and_then(|d| d.decrypt_padded_vec_mut::<Pkcs7>(ct).ok())
        .unwrap_or_default()
}

fn map_strings(obj: &mut Object, f: &dyn Fn(&[u8]) -> Vec<u8>) {
    match obj {
        Object::String(s, _) => *s = f(s),
        Object::Array(a) => a.iter_mut().for_each(|o| map_strings(o, f)),
        Object::Dictionary(d) => d.iter_mut().for_each(|(_, o)| map_strings(o, f)),
        Object::Stream(st) => st.dict.iter_mut().for_each(|(_, o)| map_strings(o, f)),
        _ => {}
    }
}

fn is_xref_stream(obj: &Object) -> bool {
    matches!(obj, Object::Stream(st) if matches!(st.dict.get(b"Type"), Ok(Object::Name(n)) if n == b"XRef"))
}

fn str_of(doc: &Document, d: &Dictionary, key: &str) -> Vec<u8> {
    match d.get(key.as_bytes()).ok().map(|o| resolve(doc, o)) {
        Some(Object::String(s, _)) => s.clone(),
        _ => vec![],
    }
}

fn int_of(doc: &Document, d: &Dictionary, key: &str) -> Option<i64> {
    match d.get(key.as_bytes()).ok().map(|o| resolve(doc, o)) {
        Some(Object::Integer(i)) => Some(*i),
        _ => None,
    }
}

fn first_id(doc: &Document) -> Vec<u8> {
    match doc.trailer.get(b"ID").ok().map(|o| resolve(doc, o)) {
        Some(Object::Array(a)) => match a.first().map(|o| resolve(doc, o)) {
            Some(Object::String(s, _)) => s.clone(),
            _ => vec![],
        },
        _ => vec![],
    }
}

pub fn is_encrypted(doc: &Document) -> bool {
    doc.trailer.has(b"Encrypt")
}

pub fn decrypt_in_place(doc: &mut Document, password: &str) -> Result<()> {
    let enc_obj = doc.trailer.get(b"Encrypt").map_err(|_| anyhow!("not encrypted"))?.clone();
    let enc_id = if let Object::Reference(id) = &enc_obj { Some(*id) } else { None };
    let enc = match resolve(doc, &enc_obj) {
        Object::Dictionary(d) => d.clone(),
        _ => bail!("Unsupported /Encrypt dictionary"),
    };

    let v = int_of(doc, &enc, "V").unwrap_or(0);
    let r = int_of(doc, &enc, "R").unwrap_or(2);
    if v >= 5 || r >= 5 {
        bail!("This file uses AES-256 encryption, which is not supported yet");
    }
    let mut aes = false;
    if v == 4 {
        let stmf = match enc.get(b"StmF").ok().map(|o| resolve(doc, o)) {
            Some(Object::Name(n)) => String::from_utf8_lossy(n).into_owned(),
            _ => "Identity".into(),
        };
        if stmf == "Identity" {
            // streams not encrypted — only strings could be; treat as RC4 for simplicity
        } else if let Some(cf) = enc.get(b"CF").ok().and_then(|o| crate::pdfkit::dict_of(doc, o)) {
            if let Some(f) = cf.get(stmf.as_bytes()).ok().and_then(|o| crate::pdfkit::dict_of(doc, o)) {
                if let Some(Object::Name(cfm)) = f.get(b"CFM").ok().map(|o| resolve(doc, o)) {
                    aes = cfm == b"AESV2";
                }
            }
        }
    }
    let length = int_of(doc, &enc, "Length").unwrap_or(40);
    let n: usize = if v == 1 || r == 2 { 5 } else if v == 4 { 16 } else { (length / 8).clamp(5, 16) as usize };
    let o = str_of(doc, &enc, "O");
    let u = str_of(doc, &enc, "U");
    let p = int_of(doc, &enc, "P").unwrap_or(0) as i32;
    let em = !matches!(enc.get(b"EncryptMetadata").ok().map(|o| resolve(doc, o)), Some(Object::Boolean(false)));
    let id0 = first_id(doc);

    let verify = |upw: &[u8]| -> Option<Vec<u8>> {
        let k = file_key(upw, &o, p, &id0, r, n, em);
        let cu = compute_u(&k, &id0, r);
        let ok = if r == 2 { cu == u } else { u.len() >= 16 && cu[..16] == u[..16] };
        if ok {
            Some(k)
        } else {
            None
        }
    };
    let key = verify(password.as_bytes())
        .or_else(|| verify(&owner_to_user(password.as_bytes(), &o, r, n)))
        .ok_or_else(|| anyhow!("Incorrect password"))?;

    let ids: Vec<ObjectId> = doc.objects.keys().cloned().collect();
    for id in ids {
        if Some(id) == enc_id {
            continue;
        }
        let okey = obj_key(&key, id, aes);
        let dec = |s: &[u8]| -> Vec<u8> {
            if aes {
                aes_decrypt(&okey, s)
            } else {
                rc4(&okey, s)
            }
        };
        if let Some(obj) = doc.objects.get_mut(&id) {
            if is_xref_stream(obj) {
                continue;
            }
            map_strings(obj, &dec);
            if let Object::Stream(st) = obj {
                st.content = dec(&st.content);
            }
        }
    }
    doc.trailer.remove(b"Encrypt");
    Ok(())
}

/// Permission bit flags (PDF 32000-1 table 22).
pub mod perm {
    pub const PRINT: u32 = 1 << 2;
    pub const MODIFY: u32 = 1 << 3;
    pub const COPY: u32 = 1 << 4;
    pub const ANNOTATE: u32 = 1 << 5;
    pub const FILL_FORMS: u32 = 1 << 8;
    pub const ACCESSIBILITY: u32 = 1 << 9;
    pub const ASSEMBLE: u32 = 1 << 10;
    pub const PRINT_HQ: u32 = 1 << 11;
    pub const ALL: u32 = PRINT | MODIFY | COPY | ANNOTATE | FILL_FORMS | ACCESSIBILITY | ASSEMBLE | PRINT_HQ;
}

/// Encrypt the whole document (RC4-128). Must be the very last step before saving:
/// no further compression / pruning afterwards.
pub fn encrypt_in_place(doc: &mut Document, user_pw: &str, owner_pw: &str, perms: u32) -> Result<()> {
    let (r, n, v) = (3i64, 16usize, 2i64);
    let id0: Vec<u8> = {
        let existing = first_id(doc);
        if existing.is_empty() {
            rand::random::<[u8; 16]>().to_vec()
        } else {
            existing
        }
    };
    let p = (0xFFFF_F0C0u32 | perms) as i32;
    let o = compute_o(owner_pw.as_bytes(), user_pw.as_bytes(), r, n);
    let key = file_key(user_pw.as_bytes(), &o, p, &id0, r, n, true);
    let u = compute_u(&key, &id0, r);

    let ids: Vec<ObjectId> = doc.objects.keys().cloned().collect();
    for id in ids {
        let okey = obj_key(&key, id, false);
        let enc = |s: &[u8]| rc4(&okey, s);
        if let Some(obj) = doc.objects.get_mut(&id) {
            if is_xref_stream(obj) {
                continue;
            }
            map_strings(obj, &enc);
            if let Object::Stream(st) = obj {
                st.content = enc(&st.content);
            }
        }
    }

    let mut ed = Dictionary::new();
    ed.set("Filter", name("Standard"));
    ed.set("V", Object::Integer(v));
    ed.set("R", Object::Integer(r));
    ed.set("Length", Object::Integer((n * 8) as i64));
    ed.set("O", Object::String(o, StringFormat::Hexadecimal));
    ed.set("U", Object::String(u, StringFormat::Hexadecimal));
    ed.set("P", Object::Integer(p as i64));
    doc.trailer.set("Encrypt", Object::Dictionary(ed));
    doc.trailer.set(
        "ID",
        Object::Array(vec![
            Object::String(id0.clone(), StringFormat::Hexadecimal),
            Object::String(id0, StringFormat::Hexadecimal),
        ]),
    );
    Ok(())
}
