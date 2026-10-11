//! Binary framing used between the webview and Rust.
//!
//! Frame layout (all integers little-endian u32):
//!   [json_len][json bytes][blob_count]{[blob_len][blob bytes]}*
//!
//! Request JSON : { "op": "merge", "params": { ... } }
//! Response JSON: whatever the op returns (plus an optional "error" is never used;
//!                errors travel through the Tauri invoke rejection channel).

use anyhow::{bail, Result};
use serde_json::Value;

pub fn decode(buf: &[u8]) -> Result<(String, Value, Vec<Vec<u8>>)> {
    let mut p = 0usize;
    let read_u32 = |p: &mut usize| -> Result<usize> {
        if *p + 4 > buf.len() {
            bail!("malformed IPC frame");
        }
        let v = u32::from_le_bytes([buf[*p], buf[*p + 1], buf[*p + 2], buf[*p + 3]]) as usize;
        *p += 4;
        Ok(v)
    };

    let jl = read_u32(&mut p)?;
    if p + jl > buf.len() {
        bail!("malformed IPC frame (json)");
    }
    let header: Value = serde_json::from_slice(&buf[p..p + jl])?;
    p += jl;

    let n = read_u32(&mut p)?;
    let mut blobs = Vec::with_capacity(n);
    for _ in 0..n {
        let l = read_u32(&mut p)?;
        if p + l > buf.len() {
            bail!("malformed IPC frame (blob)");
        }
        blobs.push(buf[p..p + l].to_vec());
        p += l;
    }

    let op = header
        .get("op")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let params = header.get("params").cloned().unwrap_or(Value::Null);
    Ok((op, params, blobs))
}

pub fn encode(json: &Value, blobs: &[Vec<u8>]) -> Vec<u8> {
    let j = serde_json::to_vec(json).unwrap_or_else(|_| b"{}".to_vec());
    let mut out = Vec::with_capacity(8 + j.len() + blobs.iter().map(|b| b.len() + 4).sum::<usize>());
    out.extend_from_slice(&(j.len() as u32).to_le_bytes());
    out.extend_from_slice(&j);
    out.extend_from_slice(&(blobs.len() as u32).to_le_bytes());
    for b in blobs {
        out.extend_from_slice(&(b.len() as u32).to_le_bytes());
        out.extend_from_slice(b);
    }
    out
}
