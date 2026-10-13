import { useState } from "react";
import { motion } from "framer-motion";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist";
import { recognizeBoxes } from "@/lib/paddleocr";
import { ScanText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import FileDropZone from "@/components/FileDropZone";
import ProcessingState from "@/components/ProcessingState";
import { useRecent } from "@/contexts/RecentContext";
import { useCurrentPdf } from "@/contexts/CurrentPdfContext";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const yieldFrame = () => new Promise<void>(res => requestAnimationFrame(() => res()));
function downloadBlob(bytes: Uint8Array, name: string) { const blob=new Blob([bytes.slice()],{type:"application/pdf"}),url=URL.createObjectURL(blob),a=document.createElement("a"); a.href=url; a.download=name; a.click(); URL.revokeObjectURL(url); }

function applyOtsuThreshold(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = canvas.getContext("2d")!;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const total = canvas.width * canvas.height;
  const hist = new Array(256).fill(0);
  const gray = new Uint8Array(total);
  for (let i = 0; i < total; i++) {
    const g = Math.round(0.299 * data[i*4] + 0.587 * data[i*4+1] + 0.114 * data[i*4+2]);
    gray[i] = g; hist[g]++;
  }
  let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, maxV = 0, threshold = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t]; if (!wB) continue;
    const wF = total - wB; if (!wF) break;
    sumB += t * hist[t];
    const v = wB * wF * Math.pow(sumB/wB - (sum-sumB)/wF, 2);
    if (v > maxV) { maxV = v; threshold = t; }
  }
  const result = ctx.createImageData(canvas.width, canvas.height);
  for (let i = 0; i < total; i++) {
    const val = gray[i] > threshold ? 255 : 0;
    result.data[i*4] = result.data[i*4+1] = result.data[i*4+2] = val;
    result.data[i*4+3] = 255;
  }
  const out = document.createElement("canvas");
  out.width = canvas.width; out.height = canvas.height;
  out.getContext("2d")!.putImageData(result, 0, 0);
  return out;
}

const LANGS = [{ value: "eng", label: "English" }, { value: "deu", label: "German" }, { value: "fra", label: "French" }, { value: "spa", label: "Spanish" }, { value: "por", label: "Portuguese" }, { value: "ita", label: "Italian" }];

export default function MakeSearchable() {
  const [file, setFile] = useState<File | null>(null);
  const [lang, setLang] = useState("eng");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultBytes, setResultBytes] = useState<Uint8Array | null>(null);
  const [outputSize, setOutputSize] = useState(0);
  const [progress, setProgress] = useState(0);
  const [statusMsg, setStatusMsg] = useState("");
  const { addRecent } = useRecent();
  const { update: updatePdf } = useCurrentPdf();

  const process = async () => {
    if (!file) return;
    setIsProcessing(true); setError(null); setIsSuccess(false); setProgress(0);
    try {
      const ab = await file.arrayBuffer();
      setStatusMsg("Loading PDF...");
      const pdfProxy = await pdfjsLib.getDocument({ data: ab.slice(0) }).promise;
      const numPages = pdfProxy.numPages;
      const pdfDoc = await PDFDocument.load(ab.slice(0));
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const worker = { terminate: async () => {} }; // no-op - PaddleOCR manages its own lifecycle
      for (let i = 1; i <= numPages; i++) {
        setStatusMsg(`OCR processing page ${i}/${numPages}...`);
        setProgress(Math.round(((i - 1) / numPages) * 100));
        const page = await pdfProxy.getPage(i);
        const viewport = page.getViewport({ scale: 2.0 });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width; canvas.height = viewport.height;
        await page.render({ canvas: canvas, canvasContext: canvas.getContext("2d")!, viewport }).promise;
        const preprocessed = applyOtsuThreshold(canvas);
        await yieldFrame();
        const boxes = await recognizeBoxes(preprocessed, (pct) => setProgress(Math.round(((i-1)/numPages)*100 + pct/numPages)), setStatusMsg);
        const pdfPage = pdfDoc.getPage(i - 1);
        const { width: pgW, height: pgH } = pdfPage.getSize();
        const scaleX = pgW / preprocessed.width;
        const scaleY = pgH / preprocessed.height;
        for (const box of boxes) {
          if (!box.text.trim()) continue;
          // box[0]=TL, box[1]=TR, box[2]=BR, box[3]=BL in canvas px (Y-down)
          const x0 = box.box[0][0] * scaleX;
          const yBottom = box.box[2][1] * scaleY; // BR y in canvas
          const boxW = Math.abs(box.box[1][0] - box.box[0][0]) * scaleX;
          const boxH = Math.abs(box.box[2][1] - box.box[0][1]) * scaleY;
          if (boxW < 2 || boxH < 2) continue;
          // fontSize must be declared before pdfY (pdfY depends on it — avoids TDZ error)
          const baseFontSize = Math.max(4, boxH * 0.85);
          const measuredW = font.widthOfTextAtSize(box.text, baseFontSize);
          const fontSize = measuredW > boxW ? baseFontSize * (boxW / measuredW) : baseFontSize;
          const pdfX = x0;
          // pdf-lib y = baseline; Helvetica descender = 207/1000 em below baseline
          const pdfY = pgH - yBottom + fontSize * 0.207;
          try {
            pdfPage.drawText(box.text, { x: pdfX, y: pdfY, size: fontSize, font, color: rgb(0, 0, 0), opacity: 0 });
          } catch { /* skip non-latin chars unsupported by Helvetica */ }
        }
      }
      await worker.terminate();
      const result = await pdfDoc.save();
      setResultBytes(result); setOutputSize(result.byteLength); setIsSuccess(true);
      addRecent({ name: file.name, tool: "Make Searchable", toolPath: "/make-searchable", size: file.size });
    } catch (err: unknown) { setError((err as Error).message || "OCR processing failed"); }
    finally { setIsProcessing(false); setStatusMsg(""); }
  };

  const download = () => { if (resultBytes) downloadBlob(resultBytes, `searchable-${file?.name || "output.pdf"}`); };
  const reset = () => { setFile(null); setIsSuccess(false); setError(null); setResultBytes(null); };

  return (
    <div className="max-w-2xl mx-auto px-6 py-10 pb-24 md:pb-20">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-cyan-100 flex items-center justify-center"><ScanText className="w-5 h-5 text-cyan-600" /></div>
          <h1 className="text-2xl font-bold text-foreground">Make Searchable</h1>
        </div>
        <p className="text-muted-foreground mb-8">OCR-scan scanned/image PDFs and embed an invisible text layer to make them searchable.</p>
        <div className="space-y-6">
          <FileDropZone onFileSelect={async (f) => { setFile(f); const _b = new Uint8Array(await f.arrayBuffer()); updatePdf({ bytes: _b, name: f.name, originalSize: f.size }); }} selectedFile={file} onClear={reset} label="Drop your scanned PDF here" />
          <ProcessingState isProcessing={isProcessing} isSuccess={isSuccess} error={error} label={statusMsg || "Processing with OCR..."} progress={progress} outputSize={outputSize} downloadLabel="Download Searchable PDF" onDownload={download} onReset={reset} 
            resultBytes={resultBytes}
            resultName={`out-${file?.name||"output.pdf"}`}
            operationLabel="Processed"
          />

          {file && !isProcessing && !isSuccess && !error && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4 bg-card border border-border rounded-2xl p-5">
              <div className="space-y-2">
                <Label>OCR Language</Label>
                <Select value={lang} onValueChange={setLang}>
                  <SelectTrigger data-testid="lang-select"><SelectValue /></SelectTrigger>
                  <SelectContent>{LANGS.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="rounded-xl bg-accent/50 p-3 text-xs text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">How it works:</p>
                <p>1. Each page is rendered at high resolution</p>
                <p>2. Otsu threshold binarization improves OCR accuracy</p>
                <p>3. Tesseract OCR detects words and their positions</p>
                <p>4. Invisible text layer is embedded at word positions</p>
                <p className="text-amber-600 font-medium">Note: Large PDFs may take several minutes to process.</p>
              </div>
              <Button onClick={process} className="w-full gap-2" data-testid="make-searchable-button"><ScanText className="w-4 h-4" /> Make Searchable</Button>
            </motion.div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
