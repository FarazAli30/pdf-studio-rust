import { useState } from "react";
import { motion } from "framer-motion";
import * as pdfjsLib from "pdfjs-dist";
import { Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCurrentPdf } from "@/contexts/CurrentPdfContext";
import FileDropZone from "@/components/FileDropZone";
import ProcessingState from "@/components/ProcessingState";
import { compressPdf, bytesOf } from "@/lib/backend";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).href;

function downloadBlob(bytes: Uint8Array, name: string) {
  const blob = new Blob([bytes.slice()], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

const LEVELS = [
  { id: "low", label: "Low Quality", desc: "Max compression\nSmallest file", dpi: 72, quality: 0.5 },
  { id: "medium", label: "Medium", desc: "Balanced size\nand quality", dpi: 120, quality: 0.72 },
  { id: "high", label: "High Quality", desc: "Good quality\nsmaller file", dpi: 150, quality: 0.88 },
];

export default function CompressPDF() {
  const { update: updatePdf } = useCurrentPdf();
  const [file, setFile] = useState<File | null>(null);
  const [level, setLevel] = useState("medium");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultBytes, setResultBytes] = useState<Uint8Array | null>(null);
  const [outputSize, setOutputSize] = useState(0);
  const [progress, setProgress] = useState(0);

  const compress = async () => {
    if (!file) return;
    setIsProcessing(true); setError(null); setIsSuccess(false); setProgress(0);
    try {
      const chosen = LEVELS.find((l) => l.id === level)!;
      setProgress(30);
      const result = await compressPdf(await bytesOf(file), chosen.dpi, chosen.quality);
      setResultBytes(result);
      setOutputSize(result.byteLength);
      setIsSuccess(true);
      updatePdf({ bytes: result, name: "CompressPDF" });
    } catch (err: unknown) {
      setError((err as Error).message || "Failed to compress PDF");
    } finally {
      setIsProcessing(false);
      setProgress(100);
    }
  };

  const download = () => {
    if (resultBytes) downloadBlob(resultBytes, `compressed-${file?.name || "output.pdf"}`);
  };
  const reset = () => { setFile(null); setIsSuccess(false); setError(null); setResultBytes(null); };

  return (
    <div className="max-w-2xl mx-auto px-6 py-10 pb-24 md:pb-10">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
            <Archive className="w-5 h-5 text-amber-600" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Compress PDF</h1>
        </div>
        <p className="text-muted-foreground mb-8">Reduce file size by re-rendering pages at lower resolution.</p>

        <div className="space-y-6">
          <FileDropZone onFileSelect={async (f) => { setFile(f); const _b = new Uint8Array(await f.arrayBuffer()); updatePdf({ bytes: _b, name: f.name, originalSize: f.size }); }} selectedFile={file} onClear={reset} />

          <ProcessingState
            isProcessing={isProcessing}
            isSuccess={isSuccess}
            error={error}
            label="Compressing PDF pages…"
            progress={progress}
            outputSize={outputSize}
            inputSize={file?.size}
            downloadLabel="Download Compressed PDF"
            onDownload={download}
            onReset={reset}
            resultBytes={resultBytes}
            resultName={`out-${file?.name||"output.pdf"}`}
            operationLabel="Processed"
          />

          {file && !isProcessing && !isSuccess && !error && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
              <div>
                <p className="text-sm font-medium mb-3">Compression level</p>
                <div className="grid grid-cols-3 gap-3">
                  {LEVELS.map((l) => (
                    <button
                      key={l.id}
                      onClick={() => setLevel(l.id)}
                      className={`p-4 rounded-xl border text-left transition-all ${level === l.id ? "border-primary bg-primary/5 shadow-sm" : "border-border hover:border-primary/50"}`}
                    >
                      <p className={`text-sm font-semibold ${level === l.id ? "text-primary" : "text-foreground"}`}>{l.label}</p>
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed whitespace-pre-line">{l.desc}</p>
                    </button>
                  ))}
                </div>
              </div>
              <div className="rounded-xl bg-accent/50 border border-border p-4 text-xs text-muted-foreground">
                Pages are re-rendered as JPEG images at {LEVELS.find(l=>l.id===level)?.dpi} DPI with {Math.round((LEVELS.find(l=>l.id===level)?.quality||0)*100)}% quality. Best for scanned or image-heavy PDFs. Text PDFs will lose text selectability.
              </div>
              <Button onClick={compress} className="w-full gap-2">
                <Archive className="w-4 h-4" /> Compress PDF
              </Button>
            </motion.div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
