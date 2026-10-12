mod canvas;
mod fonts;
mod imgproc;
mod ipc;
mod ops;
mod pdfkit;
mod resources;
mod security;

use tauri::ipc::{InvokeBody, Request, Response};
use tauri_plugin_dialog::DialogExt;

/// Single entry point for every PDF operation. The webview sends one binary
/// frame (see ipc.rs); the op name selects the implementation in `ops::dispatch`.
#[tauri::command]
async fn run_op(request: Request<'_>) -> Result<Response, String> {
    let data = match request.body() {
        InvokeBody::Raw(d) => d.clone(),
        _ => return Err("expected a raw binary request body".into()),
    };
    let out = tauri::async_runtime::spawn_blocking(move || -> anyhow::Result<Vec<u8>> {
        let (op, params, blobs) = ipc::decode(&data)?;
        let out = ops::dispatch(&op, params, blobs)?;
        Ok(ipc::encode(&out.json, &out.blobs))
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| format!("{e:#}"))?;
    Ok(Response::new(out))
}

/// Native "Save as…" dialog. Frame: params { "name": "file.pdf" }, blobs[0] = bytes.
/// Returns true when written, false when the user cancelled.
#[tauri::command]
async fn save_file(app: tauri::AppHandle, request: Request<'_>) -> Result<bool, String> {
    let data = match request.body() {
        InvokeBody::Raw(d) => d.clone(),
        _ => return Err("expected a raw binary request body".into()),
    };
    let (_op, params, blobs) = ipc::decode(&data).map_err(|e| e.to_string())?;
    let name = params
        .get("name")
        .and_then(|v| v.as_str())
        .unwrap_or("output.pdf")
        .to_string();
    let bytes = blobs.into_iter().next().unwrap_or_default();

    let ext = std::path::Path::new(&name)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_string();

    let picked = tauri::async_runtime::spawn_blocking(move || {
        let mut dlg = app.dialog().file().set_file_name(&name);
        if !ext.is_empty() {
            dlg = dlg.add_filter(ext.to_uppercase(), &[ext.as_str()]);
        }
        dlg.blocking_save_file()
    })
    .await
    .map_err(|e| e.to_string())?;

    match picked {
        None => Ok(false),
        Some(fp) => {
            let path = fp.into_path().map_err(|e| e.to_string())?;
            std::fs::write(path, bytes).map_err(|e| e.to_string())?;
            Ok(true)
        }
    }
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![run_op, save_file])
        .run(tauri::generate_context!())
        .expect("error while running PDF Studio");
}
