# PDF Studio

PDF Studio is a privacy-focused PDF workspace with a **React + TypeScript** interface, a **Rust/Tauri 2** desktop engine, and a browser frontend. Processing is designed to happen locally; browser and desktop capabilities are not identical.

## Project specifications

| Area | Specification |
|---|---|
| Desktop shell | Tauri 2 |
| Native engine | Rust 2021; declared MSRV Rust 1.77 |
| Web UI | React 19, TypeScript, Vite 7, Tailwind CSS 4 |
| Routing | Hash-based routes (works in WebView and static web hosting) |
| Rust IPC | One binary-framed Tauri command, `run_op`, for PDF operations; native `save_file` uses the operating-system save dialog |
| Browser engine | Existing JavaScript/WASM packages in the frontend; a separate Rust-to-WASM pilot is under `crates/pdf-studio-wasm/` |
| Listed tools | 58 tools across organizing, conversion, transformation, security, OCR, analysis, editing, enhancement and smart-document categories |

### Main folders

- `src/` — React pages, components, application state and browser-side tools.
- `src-tauri/` — Tauri configuration and the native Rust engine. `src-tauri/src/ops/` contains the operation registry and handlers.
- `crates/pdf-studio-wasm/` — isolated browser/WASM Rust crate. The initial API reads a PDF byte array and returns its page count.
- `.github/workflows/` — GitHub Actions for native builds and the browser/WASM build.
- `public/` — browser assets, workers and static resources.

### Rust engine and native resources

The desktop engine uses `lopdf` for PDF structure and editing, `pdfium-render` for raster rendering and image-based operations, `image`/`resvg` for conversion, and `ocrs`/`rten` for OCR. OCR model files are fetched by `scripts/copy-assets.mjs` when missing. PDFium binaries must be provided in `src-tauri/pdfium/` for operations that use PDFium. HEIC decoding is optional and requires the `heic` Cargo feature plus a system `libheif` installation.

The frontend contains additional browser implementations. In a normal browser, the Tauri IPC bridge is unavailable: native Rust operations and the native Save As dialog require the Tauri desktop shell. Do not assume every listed tool has identical support in web and desktop builds.

## Requirements

- Node.js 20 or newer and npm.
- Rust toolchain (stable; the native crate declares Rust 1.77 as its minimum).
- For desktop packaging, the platform prerequisites documented by [Tauri](https://v2.tauri.app/start/prerequisites/).
- PDFium and OCR model files for operations that need those resources. The frontend asset script downloads OCR models automatically; it does not download PDFium.

## Run and build

```bash
npm install
npm run typecheck
npm run build
```

Run the native desktop app with:

```bash
npm run tauri dev
```

For a packaged desktop build, generate Tauri icons if they are not already present, then build for the current host:

```bash
npx tauri icon public/favicon.svg
npm run tauri build
```

The frontend-only web build is produced in `dist/` by `npm run build`. It can be previewed with `npm run preview`. A browser deployment can use browser-side tools, but it does **not** make the Tauri Rust command bridge available.

## WebAssembly (`wasm32-unknown-unknown`)

The initial Rust web target is intentionally isolated from `src-tauri/`:

```bash
cd crates/pdf-studio-wasm
rustup target add wasm32-unknown-unknown
cargo install wasm-pack
wasm-pack build --target web --release --out-dir pkg
```

It exports `pdf_page_count(Uint8Array)`, using the portable `lopdf` crate. Import and initialize the generated JavaScript module before calling it:

```js
import init, { pdf_page_count } from "./pkg/pdf_studio_wasm.js";

await init();
const pages = pdf_page_count(new Uint8Array(await file.arrayBuffer()));
```

The **WASM pilot is not yet wired into the main React UI**. It proves a portable Rust-to-browser build path for one operation; it does not compile the Tauri application or port all operations. Tauri IPC, native dialogs, PDFium dynamic-library loading, optional `libheif`, and OS-specific resource lookup remain native-only. Expanding web support requires moving suitable operations into a portable shared core and adding browser adapters for them.

The GitHub Actions workflow at `.github/workflows/wasm-web.yml` typechecks/builds the frontend, compiles this crate for `wasm32-unknown-unknown`, and uploads the generated browser package as the `pdf-studio-wasm-web` artifact.

## GitHub workflows

- `.github/workflows/build.yml` — existing manually triggered **Windows 32-bit x86 Tauri packaging** workflow. It is not a multi-platform release matrix.
- `.github/workflows/wasm-web.yml` — frontend web build plus the Rust WASM pilot build, triggered on relevant pushes, pull requests and manual runs.
