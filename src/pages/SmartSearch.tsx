import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import * as pdfjsLib from "pdfjs-dist";
import { recognizeImage } from "@/lib/paddleocr";
import { Search, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import FileDropZone from "@/components/FileDropZone";
import { useCurrentPdf } from "@/contexts/CurrentPdfContext";
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

interface SearchResult { pageNum: number; text: string; context: string; matchIndex: number; }

const LANGS = [{ value: "eng", label: "English" }, { value: "deu", label: "German" }, { value: "fra", label: "French" }, { value: "spa", label: "Spanish" }];

export default function SmartSearch() {
  const [file, setFile] = useState<File | null>(null);
  const [query, setQuery] = useState("");
  const [lang, setLang] = useState("eng");
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMsg, setStatusMsg] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pageTexts, setPageTexts] = useState<string[]>([]);
  const [hasIndex, setHasIndex] = useState(false);
  const { update: updatePdf } = useCurrentPdf();

  const buildIndex = async () => {
    if (!file) return;
    setIsProcessing(true); setError(null); setProgress(0); setPageTexts([]); setResults([]); setSearched(false);
    try {
      const ab = await file.arrayBuffer();
      const pdfProxy = await pdfjsLib.getDocument({ data: ab }).promise;
      const numPages = pdfProxy.numPages;
      const texts: string[] = [];
      for (let i = 1; i <= numPages; i++) {
        setStatusMsg(`Scanning page ${i}/${numPages}...`); setProgress(Math.round((i-1)/numPages*100));
        const page = await pdfProxy.getPage(i);
        const vp = page.getViewport({ scale: 2 });
        const canvas = document.createElement("canvas"); canvas.width = vp.width; canvas.height = vp.height;
        await page.render({ canvas: canvas, canvasContext: canvas.getContext("2d")!, viewport: vp }).promise;
        const preprocessed = applyOtsuThreshold(canvas);
        await yieldFrame();
        const text = await recognizeImage(preprocessed, (pct) => setProgress(Math.round(((i-1)/numPages)*100 + pct/numPages)), setStatusMsg);
        texts.push(text);
      }
      setPageTexts(texts); setHasIndex(true);
    } catch (err: unknown) { setError((err as Error).message || "Failed to scan PDF"); }
    finally { setIsProcessing(false); setStatusMsg(""); }
  };

  const search = () => {
    if (!query.trim() || !pageTexts.length) return;
    const q = query.toLowerCase();
    const found: SearchResult[] = [];
    pageTexts.forEach((text, i) => {
      const lower = text.toLowerCase();
      let idx = 0;
      while ((idx = lower.indexOf(q, idx)) !== -1) {
        const start = Math.max(0, idx - 50);
        const end = Math.min(text.length, idx + q.length + 50);
        found.push({ pageNum: i+1, text: text.slice(idx, idx + q.length), context: text.slice(start, end), matchIndex: idx - start });
        idx += q.length;
        if (found.filter(r => r.pageNum === i+1).length >= 3) break;
      }
    });
    setResults(found); setSearched(true);
  };

  const reset = () => { setFile(null); setQuery(""); setResults([]); setSearched(false); setPageTexts([]); setHasIndex(false); setError(null); };

  return (
    <div className="max-w-2xl mx-auto px-6 py-10 pb-24 md:pb-20">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center"><Search className="w-5 h-5 text-amber-600" /></div>
          <h1 className="text-2xl font-bold text-foreground">Smart Search</h1>
        </div>
        <p className="text-muted-foreground mb-8">Search for text in scanned PDFs using OCR — finds matches even in image-based documents.</p>
        <div className="space-y-6">
          <FileDropZone onFileSelect={async (f) => { setFile(f); const _b = new Uint8Array(await f.arrayBuffer()); updatePdf({ bytes: _b, name: f.name, originalSize: f.size }); }} selectedFile={file} onClear={reset} label="Drop your scanned PDF here" />

          {file && !isProcessing && !hasIndex && !error && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4 bg-card border border-border rounded-2xl p-5">
              <div className="space-y-2">
                <Label>OCR Language</Label>
                <Select value={lang} onValueChange={setLang}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{LANGS.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <Button onClick={buildIndex} className="w-full gap-2" data-testid="scan-button"><Search className="w-4 h-4" /> Scan PDF for Search</Button>
            </motion.div>
          )}

          {isProcessing && (
            <div className="rounded-2xl border border-border bg-card p-6 space-y-3">
              <div className="flex items-center gap-3">
                <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} className="w-5 h-5 rounded-full border-2 border-primary/30 border-t-primary flex-shrink-0" />
                <p className="text-sm text-muted-foreground">{statusMsg}</p>
              </div>
              <div className="w-full bg-border rounded-full h-1.5"><motion.div className="bg-primary h-full rounded-full" animate={{ width: `${progress}%` }} /></div>
            </div>
          )}

          {error && <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">{error}</div>}

          {hasIndex && !isProcessing && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
              <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
                <p className="text-xs font-medium text-green-700 bg-green-50 rounded-lg px-3 py-2">{pageTexts.length} pages indexed. Enter a search term below.</p>
                <div className="flex gap-2">
                  <Input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} placeholder="Search text..." data-testid="search-input" />
                  <Button onClick={search} disabled={!query.trim()} data-testid="search-execute-button"><Search className="w-4 h-4" /></Button>
                </div>
              </div>

              <AnimatePresence>
                {searched && (
                  <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
                    <p className="text-sm font-medium text-foreground">{results.length === 0 ? "No matches found." : `${results.length} match${results.length !== 1 ? "es" : ""} found`}</p>
                    {results.map((r, i) => (
                      <div key={i} className="bg-card border border-border rounded-xl p-4 space-y-1" data-testid={`result-${i}`}>
                        <div className="flex items-center gap-2"><FileText className="w-3.5 h-3.5 text-primary" /><span className="text-xs font-bold text-primary">Page {r.pageNum}</span></div>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          ...{r.context.slice(0, r.matchIndex)}
                          <span className={cn("bg-amber-200 text-amber-900 font-semibold px-0.5 rounded")}>{r.context.slice(r.matchIndex, r.matchIndex + r.text.length)}</span>
                          {r.context.slice(r.matchIndex + r.text.length)}...
                        </p>
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
