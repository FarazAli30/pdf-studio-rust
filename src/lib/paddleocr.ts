// OCR now runs in Rust (ocrs, pure Rust). Same exports as the old browser/ONNX version,
// so MakeSearchable / PdfToText / SmartSearch keep working unchanged.
import { ocrImage, bytesOf, type OcrBox } from "./backend";

export type { OcrBox };

const toPng = (canvas: HTMLCanvasElement) =>
  new Promise<Blob>((res, rej) => canvas.toBlob(b => (b ? res(b) : rej(new Error("Could not read page image"))), "image/png"));

export async function recognizeBoxes(
  canvas: HTMLCanvasElement,
  onProgress?: (pct: number) => void,
  onStatus?: (msg: string) => void,
): Promise<OcrBox[]> {
  onStatus?.("Recognizing text…");
  onProgress?.(20);
  const png = await bytesOf(await toPng(canvas));
  const boxes = await ocrImage(png);
  onProgress?.(100);
  return boxes.filter(b => b.text?.trim());
}

export async function recognizeImage(
  canvas: HTMLCanvasElement,
  onProgress?: (pct: number) => void,
  onStatus?: (msg: string) => void,
): Promise<string> {
  const boxes = await recognizeBoxes(canvas, onProgress, onStatus);
  return boxes.map(b => b.text).filter(Boolean).join("\n").trim();
}
