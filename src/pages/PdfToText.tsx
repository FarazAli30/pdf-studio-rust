import { useState } from "react";
import { motion } from "framer-motion";
import * as pdfjsLib from "pdfjs-dist";
import { recognizeImage } from "@/lib/paddleocr";
import { FileText, Copy, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import FileDropZone from "@/components/FileDropZone";
import ProcessingState from "@/components/ProcessingState";
import { useToast } from "@/hooks/use-toast";
import { useRecent } from "@/contexts/RecentContext";
import { cn } from "@/lib/utils";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const yieldFrame = () => new Promise<void>(res => requestAnimationFrame(() => res()));

function applyOtsuThreshold(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = canvas.getContext("2d")!;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const total = canvas.width * canvas.height;
  const hist = new Array(256).fill(0);
  const gray = new Uint8Array(total);
  for (let i = 0; i < total; i++) {
    const g = Math.round(0.299*data[i*4] + 0.587*data[i*4+1] + 0.114*data[i*4+2]);
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
    result.data[i*4] = result.data[i*4+1] = result.data[i*4+2] = val; result.data[i*4+3] = 255;
  }
  const out = document.createElement("canvas"); out.width = canvas.width; out.height = canvas.height;
  out.getContext("2d")!.putImageData(result, 0, 0); return out;
}

const LANGS = [{ value: "eng", label: "English" }, { value: "deu", label: "German" }, { value: "fra", label: "French" }, { value: "spa", label: "Spanish" }, { value: "por", label: "Portuguese" }];

export default function PdfToText() {
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<"native" | "ocr">("native");
  const [fromPage, setFromPage] = useState("1");
  const [toPage, setToPage] = useState("");
  const [pageCount, setPageCount] = useState(0);
  const [lang, setLang] = useState("eng");
  const [text, setText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [statusMsg, setStatusMsg] = useState("");
  const { toast } = useToast();
  const { addRecent } = useRecent();

  const handleFile = async (f: File) => {
    setFile(f); setIsSuccess(false); setError(null); setText("");
    try {
      const task = pdfjsLib.getDocument({ data: await f.arrayBuffer() });
      const doc = await task.promise;
      setPageCount(doc.numPages);
      setToPage(String(doc.numPages));
    } catch { setPageCount(0); }
  };

  const extract = async () => {
    if (!file) return;
    setIsProcessing(true); setError(null); setIsSuccess(false); setText(""); setProgress(0);
    const from = Math.max(1, parseInt(fromPage) || 1);
    const to = Math.min(pageCount || 999, parseInt(toPage) || pageCount);
    try {
      const ab = await file.arrayBuffer();
      const pdfProxy = await pdfjsLib.getDocument({ data: ab }).promise;
      const lines: string[] = [];

      if (mode === "native") {
        for (let i = from; i <= to; i++) {
          setProgress(Math.round(((i - from) / (to - from + 1)) * 100));
          const page = await pdfProxy.getPage(i);
          const content = await page.getTextContent();
          const pageText = content.items.map((item: unknown) => (item as { str: string }).str).join(" ");
          lines.push(`--- Page ${i} ---\n${pageText}`);
        }
      } else {
        setStatusMsg("Loading OCR engine...");
        for (let i = from; i <= to; i++) {
          setStatusMsg(`OCR processing page ${i}/${to}...`); setProgress(Math.round(((i-from)/(to-from+1))*100));
          const page = await pdfProxy.getPage(i);
          const vp = page.getViewport({ scale: 2 });
          const canvas = document.createElement("canvas"); canvas.width = vp.width; canvas.height = vp.height;
          await page.render({ canvas: canvas, canvasContext: canvas.getContext("2d")!, viewport: vp }).promise;
          const preprocessed = applyOtsuThreshold(canvas);
          await yieldFrame();
        const text = await recognizeImage(preprocessed, (pct) => setProgress(Math.round(((i-from)/(to-from+1))*100 + pct/(to-from+1))), setStatusMsg);
          lines.push(`--- Page ${i} ---\n${text}`);
        }
      }
      const extracted = lines.join("\n\n");
      setText(extracted); setIsSuccess(true);
      addRecent({ name: file.name, tool: "Extract Text", toolPath: "/pdf-to-text", size: file.size });
    } catch (err: unknown) {
      setError((err as Error).message || "Extraction failed");
    } finally { setIsProcessing(false); setStatusMsg(""); }
  };

  const copyText = () => { navigator.clipboard.writeText(text); toast({ title: "Copied!", description: "Text copied to clipboard." }); };
  const downloadText = () => {
    const blob = new Blob([text], { type: "text/plain" }); const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `${file?.name.replace(".pdf","") || "extracted"}.txt`; a.click(); URL.revokeObjectURL(url);
  };
  const reset = () => { setFile(null); setText(""); setIsSuccess(false); setError(null); setPageCount(0); };

  return (
    <div className="max-w-2xl mx-auto px-6 py-10 pb-24 md:pb-20">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-teal-100 flex items-center justify-center"><FileText className="w-5 h-5 text-teal-600" /></div>
          <h1 className="text-2xl font-bold text-foreground">Extract Text</h1>
        </div>
        <p className="text-muted-foreground mb-8">Extract text from digital PDFs (native) or scanned documents (OCR with Otsu binarization).</p>
        <div className="space-y-6">
          <div className="flex gap-2">
            {(["native","ocr"] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)} className={cn("flex-1 py-2.5 rounded-xl border text-sm font-medium transition-colors", mode===m?"border-primary bg-primary/5 text-primary":"border-border text-muted-foreground hover:border-primary/40")} data-testid={`mode-${m}`}>
                {m === "native" ? "Native text layer" : "OCR scan (scanned PDFs)"}
              </button>
            ))}
          </div>
          <FileDropZone onFileSelect={handleFile} selectedFile={file} onClear={reset} />
          <ProcessingState isProcessing={isProcessing} isSuccess={false} error={error} label={statusMsg || (mode === "ocr" ? "OCR scanning pages..." : "Extracting text...")} progress={progress} onReset={reset} />

          {file && !isProcessing && !isSuccess && !error && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4 bg-card border border-border rounded-2xl p-5">
              {pageCount > 0 && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label>From page</Label><Input type="number" min={1} max={pageCount} value={fromPage} onChange={(e) => setFromPage(e.target.value)} data-testid="from-page" /></div>
                  <div className="space-y-1.5"><Label>To page (of {pageCount})</Label><Input type="number" min={1} max={pageCount} value={toPage} onChange={(e) => setToPage(e.target.value)} data-testid="to-page" /></div>
                </div>
              )}
              {mode === "ocr" && (
                <div className="space-y-1.5">
                  <Label>OCR Language</Label>
                  <Select value={lang} onValueChange={setLang}>
                    <SelectTrigger data-testid="lang-select"><SelectValue /></SelectTrigger>
                    <SelectContent>{LANGS.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}</SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">OCR uses Otsu threshold binarization for improved accuracy on scanned documents.</p>
                </div>
              )}
              <Button onClick={extract} className="w-full gap-2" data-testid="extract-text-button"><FileText className="w-4 h-4" /> Extract Text</Button>
            </motion.div>
          )}

          {isSuccess && text && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">{text.length.toLocaleString()} characters</p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={copyText} className="gap-1.5" data-testid="copy-text-button"><Copy className="w-3.5 h-3.5" /> Copy</Button>
                  <Button size="sm" onClick={downloadText} className="gap-1.5" data-testid="download-text-button"><Download className="w-3.5 h-3.5" /> Download .txt</Button>
                </div>
              </div>
              <textarea readOnly value={text} className="w-full h-80 rounded-xl border border-border bg-accent/20 p-4 text-sm font-mono resize-none focus:outline-none" data-testid="extracted-text" />
              <Button variant="outline" onClick={reset} className="w-full">Start over</Button>
            </motion.div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
