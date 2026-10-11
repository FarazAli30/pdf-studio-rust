import * as ort from "onnxruntime-web";

declare global {
  interface Window {
    cv: { Mat: unknown; [k: string]: unknown };
    "esearch-ocr": { init: (o: unknown) => Promise<unknown>; ocr: (src: unknown) => Promise<OcrRaw> };
    _paddleReady: boolean;
  }
}
interface OcrRaw { src?: Array<{ text: string; mean: number }>; [k: string]: unknown }

function loadScript(src: string): Promise<void> {
  return new Promise((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`)) { res(); return; }
    const s = document.createElement("script");
    s.src = src; s.async = false;
    s.onload = () => res();
    s.onerror = () => rej(new Error(`Script failed: ${src}`));
    document.head.appendChild(s);
  });
}

const yieldFrame = () => new Promise<void>(res => requestAnimationFrame(() => res()));

let _initPromise: Promise<void> | null = null;

async function ensureReady(onStatus?: (msg: string) => void) {
  if (window._paddleReady) return;
  if (_initPromise) { await _initPromise; return; }

  _initPromise = (async () => {
    // Point ORT to our local wasm files (matching installed onnxruntime-web 1.26)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (ort.env as any).wasm = (ort.env as any).wasm ?? {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (ort.env as any).wasm.wasmPaths = "/ort-ocr/";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (ort.env as any).wasm.numThreads = 1;

    if (!window.cv?.Mat) {
      onStatus?.("Loading OpenCV…");
      await yieldFrame();
      await loadScript("/opencv.js");
      await new Promise<void>(res => {
        const t = setInterval(() => { if (window.cv?.Mat) { clearInterval(t); res(); } }, 100);
        setTimeout(() => { clearInterval(t); res(); }, 20000);
      });
    }

    if (!window["esearch-ocr"]) {
      onStatus?.("Loading OCR engine…");
      await yieldFrame();
      await loadScript("/esearch-ocr.umd.js");
      await yieldFrame();
    }

    if (!window._paddleReady) {
      onStatus?.("Loading OCR models…");
      await yieldFrame();
      const dic = await fetch("/paddleocr/ppocr_keys_v1.txt").then(r => r.text());
      await yieldFrame();
      await window["esearch-ocr"].init({
        detPath: "/paddleocr/ppocr_det.onnx",
        recPath: "/paddleocr/ppocr_rec.onnx",
        dic, ort, cv: window.cv, dev: false, node: false,
      });
      window._paddleReady = true;
    }
  })();

  await _initPromise;
}

export interface OcrBox {
  text: string;
  mean: number;
  box: [[number,number],[number,number],[number,number],[number,number]];
}

export async function recognizeImage(
  canvas: HTMLCanvasElement,
  onProgress?: (pct: number) => void,
  onStatus?: (msg: string) => void,
): Promise<string> {
  const boxes = await recognizeBoxes(canvas, onProgress, onStatus);
  return boxes.map(b => b.text).filter(Boolean).join("\n").trim();
}

export async function recognizeBoxes(
  canvas: HTMLCanvasElement,
  onProgress?: (pct: number) => void,
  onStatus?: (msg: string) => void,
): Promise<OcrBox[]> {
  await ensureReady(onStatus);
  onProgress?.(20);
  onStatus?.("Recognizing text…");
  await yieldFrame();

  const result = await window["esearch-ocr"].ocr(canvas);
  await yieldFrame();
  onProgress?.(95);

  const items: OcrBox[] = Array.isArray(result)
    ? result as OcrBox[]
    : (((result as OcrRaw)?.src ?? []) as OcrBox[]);

  onProgress?.(100);
  return items.filter(b => b.text?.trim());
}
