// Downloads the pure-Rust OCR models (ocrs) into src-tauri/models/ if they are missing.
// Runs automatically before `npm run dev` / `npm run build`. Never overwrites existing files.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = "https://ocrs-models.s3-accelerate.amazonaws.com/";
const FILES = ["text-detection.rten", "text-recognition.rten"];
const dir = join("src-tauri", "models");
mkdirSync(dir, { recursive: true });

for (const f of FILES) {
  const dst = join(dir, f);
  if (existsSync(dst)) continue;
  try {
    console.log(`[assets] downloading ${f} ...`);
    const res = await fetch(BASE + f);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    writeFileSync(dst, Buffer.from(await res.arrayBuffer()));
    console.log(`[assets] saved ${dst}`);
  } catch (e) {
    console.warn(`[assets] could not download ${f}: ${e.message}. OCR tools need it: place it in src-tauri/models/ manually.`);
  }
}
