# PDF Studio – Tauri + Rust engine (phase 1)

React UI is unchanged. PDF processing moved from pdf-lib/pdf.js in the browser to a Rust
backend (`src-tauri/`), called through ONE binary IPC command (`run_op`, see `src/lib/backend.ts`
and `src-tauri/src/ipc.rs`). Downloads go through a native "Save as…" dialog
(`src/lib/nativeDownload.ts` intercepts the pages' blob-anchor downloads).

## Build
    npm install
    npx tauri icon public/favicon.svg     # generates src-tauri/icons (needs a PNG/SVG source)
    npm run tauri dev                     # or: npm run tauri build

## STATUS – READ THIS
**The Rust code has NOT been compiled** (the authoring sandbox had no Rust toolchain/network).
Expect a first round of compile errors, most likely from crate API drift. Spots to check first:
* `lopdf = "0.34"`: `Object::Real` type (only touched in `pdfkit::real/num`), `get_page_content`,
  `renumber_objects_with`, `decompress`, `prune_objects`, `compress`.
* `security.rs`: `cbc`/`aes` trait imports; `md-5` digest `.into()`.
* tauri-plugin-dialog: `FilePath::into_path`.

### Setup for phase 2
* **pdfium**: download the library for your OS from pdfium-binaries and put it in `src-tauri/pdfium/`
  (see the README.txt there). Needed by PDF→JPG, Thumbnails, Compare, Compress.
* **HEIC**: optional, build with `--features heic` (needs system libheif: `apt install libheif-dev`,
  `brew install libheif`). Without it HEIC→PDF reports a clear error.

### Ported to Rust (37 tools)
Phase 1: Merge, Split, Extract, Reorder, Reverse, Rotate, Booklet, N-up, Duplex prep, Crop/Trim box,
Page size, Background color, Watermark, Header/Footer, Bates, Date stamp, QR stamp, Sign, Metadata,
Attachments, Links, Bookmark editor, Split by bookmark, Repair, Protect/Unlock/Change password.
Phase 2: PDF→JPG, Thumbnails, Compare (pdfium); Compress (rasterise + JPEG, DCT pass-through);
JPG/Images/HEIC/SVG→PDF (SVG via resvg at 2x); TXT→PDF; Markdown→PDF (pulldown-cmark, same layout
rules/themes as the TS version).

Behaviour notes: Images→PDF now embeds the original/cropped image bytes; JPEGs pass through without
re-encoding. Preview/page-count code in a few pages still uses pdf.js (UI only).

### NOT yet ported (original browser code)
Flatten, Redact, Annotate, Whiteboard, Page Tools; text-extraction group (PDF→Text/MD, Tables, TOC,
Search*, Classifier, Invoice, Layout, Fonts, Analytics, PdfInfoFull); OCR (Make Searchable, PDF→Text
OCR, Smart Search); CV tools (Deskew, Enhance, Whitener, Signature detector); Read Aloud / Audiobook.

Unverified (never compiled): everything in src-tauri/. New in phase 2 to check first: pdfium-render 0.8
API (`bind_to_library`, `render_with_config`, `as_image`), resvg 0.44 (`usvg::Tree::from_data`,
`fontdb`), pulldown-cmark 0.12 event names, `image` 0.25 encoder calls.

## CI
`.github/workflows/build.yml`: on every push/PR it type-builds the frontend and runs `cargo check`
(+ non-blocking clippy); then builds installers for Linux, Windows, macOS (arm64 + x64), downloading
the matching pdfium binary automatically. Push a `v*` tag to publish the installers as a GitHub
release. Commit a `Cargo.lock` and `package-lock.json` after your first successful local build for
reproducible CI (the workflow works without them).
