import { useState } from "react";
import { motion } from "framer-motion";
import { Scissors } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCurrentPdf } from "@/contexts/CurrentPdfContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import FileDropZone from "@/components/FileDropZone";
import ProcessingState from "@/components/ProcessingState";
import { splitAll, splitRanges, pdfInfo, bytesOf } from "@/lib/backend";

function downloadBlob(bytes: Uint8Array, name: string) {
  const blob = new Blob([bytes.slice()], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

function parseRanges(input: string, maxPage: number): number[][] {
  const ranges: number[][] = [];
  const parts = input.split(",").map((s) => s.trim()).filter(Boolean);
  for (const part of parts) {
    if (part.includes("-")) {
      const [s, e] = part.split("-").map(Number);
      if (!isNaN(s) && !isNaN(e) && s >= 1 && e <= maxPage && s <= e) {
        ranges.push([s - 1, e - 1]);
      }
    } else {
      const n = Number(part);
      if (!isNaN(n) && n >= 1 && n <= maxPage) ranges.push([n - 1, n - 1]);
    }
  }
  return ranges;
}

export default function SplitPDF() {
  const { update: updatePdf } = useCurrentPdf();
  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [rangeInput, setRangeInput] = useState("");
  const [mode, setMode] = useState<"all" | "range">("all");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultFiles, setResultFiles] = useState<{ bytes: Uint8Array; name: string }[]>([]);

  const handleFile = async (f: File) => {
    setFile(f);
    setIsSuccess(false); setError(null); setResultFiles([]);
    try {
      setPageCount((await pdfInfo(await bytesOf(f))).pageCount);
    } catch { setPageCount(0); }
  };

  const split = async () => {
    if (!file) return;
    setIsProcessing(true); setError(null); setIsSuccess(false);
    try {
      const results = mode === "all" ? await splitAll(await bytesOf(file)) : await splitRanges(await bytesOf(file), rangeInput);
      setResultFiles(results);
      setIsSuccess(true);
    } catch (err: unknown) {
      setError((err as Error).message || "Failed to split PDF");
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadAll = () => {
    resultFiles.forEach(({ bytes, name }) => downloadBlob(bytes, name));
  };

  const reset = () => { setFile(null); setIsSuccess(false); setError(null); setResultFiles([]); };

  return (
    <div className="max-w-2xl mx-auto px-6 py-10 pb-24 md:pb-10">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
            <Scissors className="w-5 h-5 text-blue-600" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Split PDF</h1>
        </div>
        <p className="text-muted-foreground mb-8">Split a PDF into individual pages or custom page ranges.</p>

        {isSuccess ? (
          <div className="space-y-4">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="rounded-2xl border border-green-200 bg-green-50 p-6">
              <p className="font-semibold text-green-900 mb-1">Done! {resultFiles.length} file{resultFiles.length > 1 ? "s" : ""} created.</p>
              <div className="space-y-2 mt-3">
                {resultFiles.map((f, i) => (
                  <div key={i} className="flex items-center justify-between bg-white rounded-xl px-4 py-2 border border-green-100">
                    <span className="text-sm text-green-800 font-medium">{f.name}</span>
                    <Button size="sm" variant="outline" onClick={() => downloadBlob(f.bytes, f.name)} data-testid={`download-part-${i}`}>Download</Button>
                  </div>
                ))}
              </div>
              {resultFiles.length > 1 && (
                <Button onClick={downloadAll} className="mt-4 gap-2 w-full" data-testid="download-all-button">Download All</Button>
              )}
              <Button variant="outline" onClick={reset} className="mt-2 w-full">Start over</Button>
            </motion.div>
          </div>
        ) : (
          <div className="space-y-6">
            <FileDropZone onFileSelect={handleFile} selectedFile={file} onClear={reset} />
            <ProcessingState isProcessing={isProcessing} isSuccess={false} error={error} label="Splitting PDF..." onReset={reset} />

            {file && !isProcessing && !error && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
                <div className="rounded-xl bg-accent/50 border border-border p-4">
                  <p className="text-sm text-muted-foreground">This PDF has <span className="font-semibold text-foreground">{pageCount} pages</span></p>
                </div>
                <div className="space-y-3">
                  <Label className="text-sm font-medium">Split mode</Label>
                  <div className="flex gap-3">
                    <button onClick={() => setMode("all")} className={`flex-1 py-2.5 rounded-xl border text-sm font-medium transition-colors ${mode === "all" ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:border-primary/50"}`} data-testid="mode-all">Split into individual pages</button>
                    <button onClick={() => setMode("range")} className={`flex-1 py-2.5 rounded-xl border text-sm font-medium transition-colors ${mode === "range" ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:border-primary/50"}`} data-testid="mode-range">Custom page ranges</button>
                  </div>
                </div>
                {mode === "range" && (
                  <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
                    <Label htmlFor="ranges">Page ranges</Label>
                    <Input id="ranges" placeholder="e.g. 1-3, 5, 7-10" value={rangeInput} onChange={(e) => setRangeInput(e.target.value)} data-testid="range-input" />
                    <p className="text-xs text-muted-foreground">Comma-separated ranges. Each range becomes a separate PDF file.</p>
                  </motion.div>
                )}
                <Button onClick={split} className="w-full gap-2" disabled={mode === "range" && !rangeInput.trim()} data-testid="split-button">
                  <Scissors className="w-4 h-4" />
                  Split PDF
                </Button>
              </motion.div>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
}
