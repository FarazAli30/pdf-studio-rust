/**
 * Bridge to the Rust PDF engine (src-tauri). Every operation goes through ONE Tauri
 * command (`run_op`) using a binary frame so large PDFs are never base64/JSON encoded:
 *
 *   [u32 json_len][json {op, params}][u32 blob_count]{[u32 len][bytes]}*
 */
import { invoke } from "@tauri-apps/api/core";

export interface OpResult<T = any> {
  json: T;
  blobs: Uint8Array[];
}

function encode(header: unknown, blobs: Uint8Array[]): Uint8Array {
  const j = new TextEncoder().encode(JSON.stringify(header));
  let size = 4 + j.length + 4;
  for (const b of blobs) size += 4 + b.length;
  const out = new Uint8Array(size);
  const dv = new DataView(out.buffer);
  let p = 0;
  dv.setUint32(p, j.length, true); p += 4;
  out.set(j, p); p += j.length;
  dv.setUint32(p, blobs.length, true); p += 4;
  for (const b of blobs) {
    dv.setUint32(p, b.length, true); p += 4;
    out.set(b, p); p += b.length;
  }
  return out;
}

function decode(buf: ArrayBuffer | Uint8Array | number[]): OpResult {
  const u8 = buf instanceof Uint8Array ? buf : Array.isArray(buf) ? new Uint8Array(buf) : new Uint8Array(buf);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let p = 0;
  const jl = dv.getUint32(p, true); p += 4;
  const json = JSON.parse(new TextDecoder().decode(u8.subarray(p, p + jl))); p += jl;
  const n = dv.getUint32(p, true); p += 4;
  const blobs: Uint8Array[] = [];
  for (let i = 0; i < n; i++) {
    const l = dv.getUint32(p, true); p += 4;
    blobs.push(u8.slice(p, p + l)); p += l;
  }
  return { json, blobs };
}

export const isTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export async function call<T = any>(op: string, params: Record<string, unknown> = {}, blobs: Uint8Array[] = []): Promise<OpResult<T>> {
  if (!isTauri()) throw new Error("PDF Studio must run inside the Tauri desktop shell (npm run tauri dev).");
  try {
    const res = await invoke<ArrayBuffer>("run_op", encode({ op, params }, blobs));
    return decode(res);
  } catch (e) {
    throw new Error(typeof e === "string" ? e : (e as Error)?.message ?? String(e));
  }
}

/** Run an op that returns exactly one PDF. */
async function pdfOp(op: string, params: Record<string, unknown>, blobs: Uint8Array[]): Promise<Uint8Array> {
  const r = await call(op, params, blobs);
  if (!r.blobs[0]) throw new Error("Engine returned no data");
  return r.blobs[0];
}

export const bytesOf = async (f: File | Blob) => new Uint8Array(await f.arrayBuffer());

// ---------------- page structure ----------------
export const pdfInfo = (pdf: Uint8Array) => call<{ pageCount: number; pages: { width: number; height: number; rotation: number }[] }>("info", {}, [pdf]).then(r => r.json);
export const mergePdfs = (pdfs: Uint8Array[]) => pdfOp("merge", {}, pdfs);
export const splitAll = (pdf: Uint8Array) => call<{ names: string[] }>("split", { mode: "all" }, [pdf]).then(r => r.blobs.map((b, i) => ({ bytes: b, name: r.json.names[i] })));
export const splitRanges = (pdf: Uint8Array, ranges: string) => call<{ names: string[] }>("split", { mode: "range", ranges }, [pdf]).then(r => r.blobs.map((b, i) => ({ bytes: b, name: r.json.names[i] })));
/** ranges are 0-based inclusive [start,end] pairs */
export const splitByIndexRanges = (pdf: Uint8Array, ranges: [number, number][]) => call("split_ranges", { ranges }, [pdf]).then(r => r.blobs);
export const extractPages = (pdf: Uint8Array, pages: number[]) => pdfOp("extract", { pages }, [pdf]);
export const reorderPages = (pdf: Uint8Array, order: number[]) => pdfOp("reorder", { order }, [pdf]);
export const reversePages = (pdf: Uint8Array) => pdfOp("reverse", {}, [pdf]);
export const rotatePages = (pdf: Uint8Array, rotations: number[]) => pdfOp("rotate", { rotations }, [pdf]);
export const bookletImpose = (pdf: Uint8Array) => pdfOp("booklet", {}, [pdf]);
export const nupLayout = (pdf: Uint8Array, nup: string) => pdfOp("nup", { nup }, [pdf]);
export const duplexPrep = (pdf: Uint8Array, mode: string) => pdfOp("duplex", { mode }, [pdf]);
export const cropPdf = (pdf: Uint8Array, p: { top: number; bottom: number; left: number; right: number; boxType: string; allPages: boolean }) => pdfOp("crop", p, [pdf]);
export const resizePages = (pdf: Uint8Array, p: { width: number; height: number; scaleContent: boolean; keepMargins: boolean; align: string; preserveAspectRatio: boolean }) => pdfOp("page_size", p, [pdf]);

// ---------------- stamping ----------------
export const backgroundColor = (pdf: Uint8Array, color: string, opacity: number) => pdfOp("bg_color", { color, opacity }, [pdf]);
export const watermark = (pdf: Uint8Array, p: { text: string; opacity: number; fontSize: number; color: string; angle: number }) => pdfOp("watermark", p, [pdf]);
export const headerFooter = (pdf: Uint8Array, cfg: unknown) => pdfOp("header_footer", { ...(cfg as object), date: new Date().toLocaleDateString() }, [pdf]);
export const batesNumber = (pdf: Uint8Array, p: { prefix: string; start: number; padding: number; position: string; fontSize: number }) => pdfOp("bates", p, [pdf]);
export const dateStamp = (pdf: Uint8Array, p: { text: string; position: string; fontSize: number; opacity: number; color: string; allPages: boolean }) => pdfOp("date_stamp", p, [pdf]);
export const qrStamp = (pdf: Uint8Array, p: { text: string; position: string; size: number; allPages: boolean }) => pdfOp("qr_stamp", p, [pdf]);
export const signPdf = (pdf: Uint8Array, image: Uint8Array, p: { page: number; posX: number; posY: number; width: number }) => pdfOp("sign", p, [pdf, image]);

// ---------------- metadata / structure ----------------
export interface Metadata { title: string; author: string; subject: string; keywords: string; creator: string }
export const getMetadata = (pdf: Uint8Array) => call<Metadata & { producer: string; pageCount: number }>("meta_get", {}, [pdf]).then(r => r.json);
export const setMetadata = (pdf: Uint8Array, m: Metadata) => pdfOp("meta_set", m as unknown as Record<string, unknown>, [pdf]);
export const listAttachments = (pdf: Uint8Array) => call<{ attachments: { name: string; size: number }[] }>("attachments", {}, [pdf]).then(r => r.json.attachments.map((a, i) => ({ ...a, bytes: r.blobs[i] })));
export const extractLinks = (pdf: Uint8Array) => call<{ links: { page: number; url: string; type: string }[] }>("links", {}, [pdf]).then(r => r.json.links);
export interface BookmarkNode { title: string; pageIndex: number | null; children: BookmarkNode[] }
export const readBookmarks = (pdf: Uint8Array) => call<{ bookmarks: BookmarkNode[]; pageCount: number }>("bookmarks", {}, [pdf]).then(r => r.json);
export const repairPdf = (pdf: Uint8Array, cfg: Record<string, boolean>) => pdfOp("repair", cfg, [pdf]);

// ---------------- security ----------------
export const protectPdf = (pdf: Uint8Array, password: string) => pdfOp("protect", { password }, [pdf]);
export const unlockPdf = (pdf: Uint8Array, password: string) => pdfOp("unlock", { password }, [pdf]);
export const changePassword = (pdf: Uint8Array, oldPassword: string, newPassword: string) => pdfOp("change_password", { oldPassword, newPassword }, [pdf]);

// ---------------- phase 2: render / convert ----------------
export const toDataUrl = (bytes: Uint8Array, mime: string) => {
  let s = ""; const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode(...bytes.subarray(i, i + CH));
  return `data:${mime};base64,${btoa(s)}`;
};
export interface RenderOpts { scale?: number; format?: "jpeg" | "png"; quality?: number; from?: number; to?: number; password?: string }
export const renderPages = (pdf: Uint8Array, o: RenderOpts) => call<{ pages: number[]; widths: number[]; heights: number[]; pageCount: number }>("render", { ...o }, [pdf]).then(r => r.blobs.map((bytes, i) => ({ bytes, page: r.json.pages[i], width: r.json.widths[i], height: r.json.heights[i] })));
export const comparePdfs = (a: Uint8Array, b: Uint8Array, o: { threshold: number; mode: string; scale?: number; maxPages?: number }) => call<{ results: { page: number; diffPct: number }[] }>("compare", { ...o }, [a, b]).then(r => r.json.results.map((x, i) => ({ ...x, preview: r.blobs[i] })));
export const compressPdf = (pdf: Uint8Array, dpi: number, quality: number) => pdfOp("compress", { dpi, quality }, [pdf]);
export const imagesToPdf = (images: Uint8Array[], pageSize: string) => pdfOp("images_to_pdf", { pageSize }, images);
export const txtToPdf = (text: string, fontSize: number, margin: number) => pdfOp("txt_to_pdf", { text, fontSize, margin }, []);
export const mdToPdf = (text: string, theme: string, pageSize: string) => pdfOp("md_to_pdf", { text, theme, pageSize }, []);

// ---------------- native save ----------------
export async function saveFile(name: string, bytes: Uint8Array): Promise<boolean> {
  return invoke<boolean>("save_file", encode({ op: "save", params: { name } }, [bytes]));
}
