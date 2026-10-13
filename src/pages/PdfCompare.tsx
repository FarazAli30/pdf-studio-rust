import { useState, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import * as pdfjs from "pdfjs-dist";
import { GitCompare, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { comparePdfs, toDataUrl, bytesOf } from "@/lib/backend";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface DiffResult { page: number; diffPct: number; previewUrl: string; }

async function renderToCanvas(doc: pdfjs.PDFDocumentProxy, page: number, scale=1.2): Promise<HTMLCanvasElement> {
  const p = await doc.getPage(page);
  const vp = p.getViewport({ scale });
  const c = document.createElement("canvas");
  c.width = vp.width; c.height = vp.height;
  await p.render({ canvas: c, canvasContext: c.getContext("2d")!, viewport: vp }).promise;
  return c;
}

function pixelDiff(c1: HTMLCanvasElement, c2: HTMLCanvasElement, threshold = 30): { pct: number; diffCanvas: HTMLCanvasElement } {
  const w = Math.min(c1.width, c2.width), h = Math.min(c1.height, c2.height);
  const d1 = c1.getContext("2d")!.getImageData(0, 0, w, h);
  const d2 = c2.getContext("2d")!.getImageData(0, 0, w, h);
  const out = document.createElement("canvas");
  out.width = w; out.height = h;
  const ctx = out.getContext("2d")!;
  const id = ctx.createImageData(w, h);
  let diffs = 0;
  for (let i = 0; i < d1.data.length; i += 4) {
    const dr = Math.abs(d1.data[i] - d2.data[i]);
    const dg = Math.abs(d1.data[i+1] - d2.data[i+1]);
    const db = Math.abs(d1.data[i+2] - d2.data[i+2]);
    const diff = (dr + dg + db) / 3;
    if (diff > threshold) {
      id.data[i] = 255; id.data[i+1] = 40; id.data[i+2] = 40; id.data[i+3] = 220;
      diffs++;
    } else {
      id.data[i] = d1.data[i] * 0.4 + 200; id.data[i+1] = d1.data[i+1] * 0.4 + 200;
      id.data[i+2] = d1.data[i+2] * 0.4 + 200; id.data[i+3] = 220;
    }
  }
  ctx.putImageData(id, 0, 0);
  return { pct: Math.round((diffs / (w * h)) * 1000) / 10, diffCanvas: out };
}

export default function PdfCompare() {
  const [fileA, setFileA] = useState<File | null>(null);
  const [fileB, setFileB] = useState<File | null>(null);
  const [results, setResults] = useState<DiffResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [threshold, setThreshold] = useState([25]);
  const [mode, setMode] = useState("diff");
  const [progress, setProgress] = useState(0);
  const inA = useRef<HTMLInputElement | null>(null);
  const inB = useRef<HTMLInputElement | null>(null);

  const compare = useCallback(async () => {
    if (!fileA || !fileB) return;
    setLoading(true); setError(null); setResults([]); setProgress(0);
    try {
      const out = await comparePdfs(await bytesOf(fileA), await bytesOf(fileB), { threshold: threshold[0], mode, scale: 1.2, maxPages: 20 });
      const res: DiffResult[] = out.map(o => ({ page: o.page, diffPct: o.diffPct, previewUrl: toDataUrl(o.preview, "image/jpeg") }));
      setProgress(100);
      setResults(res);
    } catch (e: unknown) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, [fileA, fileB, threshold, mode]);

  const FileSlot = ({ label, file, onFile, inputRef }: { label: string; file: File | null; onFile: (f: File) => void; inputRef: React.RefObject<HTMLInputElement | null> }) => (
    <div className="flex-1">
      <input ref={inputRef} type="file" accept=".pdf" className="hidden" onChange={e => e.target.files?.[0] && onFile(e.target.files[0])} />
      <button onClick={() => inputRef.current?.click()} className={`w-full border-2 border-dashed rounded-xl p-4 text-center transition-colors ${file ? "border-primary/40 bg-primary/5" : "border-border hover:border-primary"}`}>
        <Upload className="w-5 h-5 mx-auto text-muted-foreground mb-1" />
        <p className="text-xs font-medium">{label}</p>
        {file && <p className="text-[11px] text-muted-foreground mt-0.5 truncate px-2">{file.name}</p>}
      </button>
    </div>
  );

  const changed = results.filter(r => r.diffPct > 1).length;

  return (
    <div className="max-w-3xl mx-auto px-6 py-10 pb-24">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-fuchsia-100 flex items-center justify-center"><GitCompare className="w-5 h-5 text-fuchsia-600" /></div>
          <h1 className="text-2xl font-bold">PDF Compare</h1>
        </div>
        <p className="text-muted-foreground mb-8">Pixel-diff two PDF versions side by side — changed regions highlighted in red.</p>
        <div className="space-y-5">
          <div className="flex gap-3">
            <FileSlot label="Original (A)" file={fileA} onFile={setFileA} inputRef={inA} />
            <FileSlot label="Revised (B)" file={fileB} onFile={setFileB} inputRef={inB} />
          </div>
          {fileA && fileB && !loading && (
            <div className="bg-card border border-border rounded-2xl p-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm mb-1.5 block">View Mode</Label>
                  <Select value={mode} onValueChange={setMode}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="diff">Diff overlay (red = changed)</SelectItem>
                      <SelectItem value="side">Side by side</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-sm mb-2 block">Sensitivity ({threshold[0]})</Label>
                  <Slider value={threshold} onValueChange={setThreshold} min={5} max={80} step={5} />
                </div>
              </div>
              <Button onClick={compare} className="w-full">Compare PDFs</Button>
            </div>
          )}
          {loading && (
            <div className="bg-card border border-border rounded-xl p-4 text-center">
              <p className="text-sm text-muted-foreground mb-2">Comparing pages… {progress}%</p>
              <div className="h-1.5 bg-accent rounded-full overflow-hidden"><div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} /></div>
            </div>
          )}
          {error && <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-4 text-sm text-destructive">{error}</div>}
          {results.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">{results.length} pages compared</p>
                <div className="flex gap-2">
                  <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full">{changed} changed</span>
                  <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">{results.length - changed} identical</span>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {results.map(r => (
                  <div key={r.page} className={`rounded-xl overflow-hidden border-2 transition-colors ${r.diffPct > 1 ? "border-red-300" : "border-green-200"}`}>
                    <img src={r.previewUrl} alt={`Page ${r.page}`} className="w-full block" />
                    <div className={`px-2 py-1.5 flex items-center justify-between text-xs ${r.diffPct > 1 ? "bg-red-50" : "bg-green-50"}`}>
                      <span className="font-medium">Page {r.page}</span>
                      <span className={r.diffPct > 1 ? "text-red-600" : "text-green-600"}>{r.diffPct}% diff</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
