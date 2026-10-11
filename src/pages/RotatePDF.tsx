import { useState } from "react";
import { motion } from "framer-motion";
import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCurrentPdf } from "@/contexts/CurrentPdfContext";
import FileDropZone from "@/components/FileDropZone";
import ProcessingState from "@/components/ProcessingState";
import { rotatePages, pdfInfo, bytesOf } from "@/lib/backend";

function downloadBlob(bytes: Uint8Array, name: string) {
  const blob = new Blob([bytes.slice()], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

interface PageInfo {
  index: number;
  rotation: number;
}

export default function RotatePDF() {
  const { update: updatePdf } = useCurrentPdf();
  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState<PageInfo[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultBytes, setResultBytes] = useState<Uint8Array | null>(null);
  const [outputSize, setOutputSize] = useState(0);

  const handleFile = async (f: File) => {
    setFile(f); setIsSuccess(false); setError(null); setResultBytes(null);
    try {
      const count = (await pdfInfo(await bytesOf(f))).pageCount;
      setPages(Array.from({ length: count }, (_, i) => ({ index: i, rotation: 0 })));
    } catch { setPages([]); }
  };

  const rotate = (index: number, by: number) => {
    setPages((prev) =>
      prev.map((p) => p.index === index ? { ...p, rotation: (p.rotation + by + 360) % 360 } : p)
    );
  };

  const rotateAll = (by: number) => {
    setPages((prev) => prev.map((p) => ({ ...p, rotation: (p.rotation + by + 360) % 360 })));
  };

  const apply = async () => {
    if (!file) return;
    setIsProcessing(true); setError(null); setIsSuccess(false);
    try {
      const result = await rotatePages(await bytesOf(file), pages.map((p) => p.rotation));
      setResultBytes(result); setOutputSize(result.byteLength); setIsSuccess(true);
    } catch (err: unknown) {
      setError((err as Error).message || "Failed to rotate pages");
    } finally { setIsProcessing(false); }
  };

  const download = () => { if (resultBytes) downloadBlob(resultBytes, `rotated-${file?.name || "output.pdf"}`); };
  const reset = () => { setFile(null); setPages([]); setIsSuccess(false); setError(null); setResultBytes(null); };

  const hasChanges = pages.some((p) => p.rotation !== 0);

  return (
    <div className="max-w-2xl mx-auto px-6 py-10 pb-24 md:pb-10">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center">
            <RotateCw className="w-5 h-5 text-orange-600" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Rotate Pages</h1>
        </div>
        <p className="text-muted-foreground mb-8">Rotate individual pages or all pages at once.</p>

        <div className="space-y-6">
          <FileDropZone onFileSelect={handleFile} selectedFile={file} onClear={reset} />
          <ProcessingState isProcessing={isProcessing} isSuccess={isSuccess} error={error} label="Rotating pages..." outputSize={outputSize} inputSize={file?.size} downloadLabel="Download Rotated PDF" onDownload={download} onReset={reset} 
            resultBytes={resultBytes}
            resultName={`out-${file?.name||"output.pdf"}`}
            operationLabel="Processed"
          />

          {file && pages.length > 0 && !isProcessing && !isSuccess && !error && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-foreground">{pages.length} pages</p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => rotateAll(-90)} className="gap-1.5" data-testid="rotate-all-ccw">
                    <RotateCw className="w-3.5 h-3.5 scale-x-[-1]" /> All Left
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => rotateAll(90)} className="gap-1.5" data-testid="rotate-all-cw">
                    <RotateCw className="w-3.5 h-3.5" /> All Right
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                {pages.map((page) => (
                  <div key={page.index} className="flex flex-col items-center gap-2" data-testid={`page-${page.index}`}>
                    <div className="w-full aspect-[3/4] rounded-xl border border-border bg-accent/30 flex items-center justify-center relative overflow-hidden">
                      <motion.div
                        animate={{ rotate: page.rotation }}
                        transition={{ type: "spring", stiffness: 200, damping: 20 }}
                        className="w-10 h-12 bg-white border border-border rounded shadow-sm flex items-end justify-center pb-2"
                      >
                        <div className="space-y-1 w-6">
                          {[3, 4, 3].map((w, i) => <div key={i} className="h-0.5 bg-muted-foreground/30 rounded" style={{ width: `${w * 6}px` }} />)}
                        </div>
                      </motion.div>
                      {page.rotation !== 0 && (
                        <div className="absolute top-1.5 right-1.5 bg-primary text-primary-foreground text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                          {page.rotation}°
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">Page {page.index + 1}</p>
                    <div className="flex gap-1">
                      <button onClick={() => rotate(page.index, -90)} className="p-1.5 rounded-lg hover:bg-accent transition-colors" data-testid={`rotate-ccw-${page.index}`}>
                        <RotateCw className="w-3.5 h-3.5 text-muted-foreground scale-x-[-1]" />
                      </button>
                      <button onClick={() => rotate(page.index, 90)} className="p-1.5 rounded-lg hover:bg-accent transition-colors" data-testid={`rotate-cw-${page.index}`}>
                        <RotateCw className="w-3.5 h-3.5 text-muted-foreground" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <Button onClick={apply} disabled={!hasChanges} className="w-full gap-2" data-testid="apply-rotation-button">
                <RotateCw className="w-4 h-4" />
                Apply Rotations
              </Button>
              {!hasChanges && <p className="text-xs text-muted-foreground text-center">Rotate at least one page to continue</p>}
            </motion.div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
