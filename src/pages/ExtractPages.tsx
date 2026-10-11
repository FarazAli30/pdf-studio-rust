import { useState } from "react";
import { motion } from "framer-motion";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCurrentPdf } from "@/contexts/CurrentPdfContext";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import FileDropZone from "@/components/FileDropZone";
import ProcessingState from "@/components/ProcessingState";
import { extractPages, pdfInfo, bytesOf } from "@/lib/backend";

function downloadBlob(bytes: Uint8Array, name: string) {
  const blob = new Blob([bytes.slice()], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

export default function ExtractPages() {
  const { update: updatePdf } = useCurrentPdf();
  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultBytes, setResultBytes] = useState<Uint8Array | null>(null);
  const [outputSize, setOutputSize] = useState(0);

  const handleFile = async (f: File) => {
    setFile(f); setIsSuccess(false); setError(null); setResultBytes(null); setSelected(new Set());
    try {
      setPageCount((await pdfInfo(await bytesOf(f))).pageCount);
    } catch { setPageCount(0); }
  };

  const toggle = (i: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(Array.from({ length: pageCount }, (_, i) => i)));
  const clearAll = () => setSelected(new Set());

  const extract = async () => {
    if (!file || selected.size === 0) return;
    setIsProcessing(true); setError(null); setIsSuccess(false);
    try {
      const result = await extractPages(await bytesOf(file), Array.from(selected).sort((a, b) => a - b));
      setResultBytes(result); setOutputSize(result.byteLength); setIsSuccess(true);
    } catch (err: unknown) {
      setError((err as Error).message || "Failed to extract pages");
    } finally { setIsProcessing(false); }
  };

  const download = () => { if (resultBytes) downloadBlob(resultBytes, `extracted-${file?.name || "output.pdf"}`); };
  const reset = () => { setFile(null); setPageCount(0); setSelected(new Set()); setIsSuccess(false); setError(null); setResultBytes(null); };

  return (
    <div className="max-w-2xl mx-auto px-6 py-10 pb-24 md:pb-10">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-sky-100 flex items-center justify-center">
            <Copy className="w-5 h-5 text-sky-600" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Extract Pages</h1>
        </div>
        <p className="text-muted-foreground mb-8">Select specific pages to extract into a new PDF file.</p>

        <div className="space-y-6">
          <FileDropZone onFileSelect={handleFile} selectedFile={file} onClear={reset} />
          <ProcessingState isProcessing={isProcessing} isSuccess={isSuccess} error={error} label="Extracting pages..." outputSize={outputSize} downloadLabel="Download Extracted PDF" onDownload={download} onReset={reset} 
            resultBytes={resultBytes}
            resultName={`out-${file?.name||"output.pdf"}`}
            operationLabel="Processed"
          />

          {file && pageCount > 0 && !isProcessing && !isSuccess && !error && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-foreground">{pageCount} pages · {selected.size} selected</p>
                <div className="flex gap-2">
                  <button onClick={selectAll} className="text-xs text-primary hover:underline" data-testid="select-all">Select all</button>
                  <span className="text-muted-foreground text-xs">·</span>
                  <button onClick={clearAll} className="text-xs text-muted-foreground hover:text-foreground hover:underline" data-testid="clear-all">Clear</button>
                </div>
              </div>

              <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                {Array.from({ length: pageCount }, (_, i) => (
                  <button
                    key={i}
                    onClick={() => toggle(i)}
                    className={`aspect-[3/4] rounded-xl border-2 flex flex-col items-center justify-end pb-1.5 transition-all ${
                      selected.has(i) ? "border-primary bg-primary/5 shadow-sm" : "border-border hover:border-primary/40 bg-accent/20"
                    }`}
                    data-testid={`page-select-${i}`}
                  >
                    <div className="flex-1 flex items-center justify-center">
                      <div className="w-5 h-6 bg-white border border-border/50 rounded shadow-sm" />
                    </div>
                    <span className={`text-[10px] font-medium ${selected.has(i) ? "text-primary" : "text-muted-foreground"}`}>
                      {i + 1}
                    </span>
                    {selected.has(i) && (
                      <div className="absolute top-1 right-1">
                        <Checkbox checked className="w-3 h-3" />
                      </div>
                    )}
                  </button>
                ))}
              </div>

              <Button onClick={extract} disabled={selected.size === 0} className="w-full gap-2" data-testid="extract-button">
                <Copy className="w-4 h-4" />
                Extract {selected.size > 0 ? `${selected.size} page${selected.size > 1 ? "s" : ""}` : "pages"}
              </Button>
            </motion.div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
