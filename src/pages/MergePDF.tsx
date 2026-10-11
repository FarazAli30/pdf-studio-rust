import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence, Reorder } from "framer-motion";
import { Upload, GripVertical, FileText, X, ArrowDown, Merge } from "lucide-react";
import { Button } from "@/components/ui/button";
import ProcessingState from "@/components/ProcessingState";
import { cn } from "@/lib/utils";
import { useCurrentPdf } from "@/contexts/CurrentPdfContext";
import { mergePdfs, bytesOf } from "@/lib/backend";

function formatBytes(b: number) {
  if (b === 0) return "0 B";
  const k = 1024, s = ["B", "KB", "MB", "GB"], i = Math.floor(Math.log(b) / Math.log(k));
  return `${parseFloat((b / Math.pow(k, i)).toFixed(1))} ${s[i]}`;
}

function downloadBlob(bytes: Uint8Array, name: string) {
  const blob = new Blob([bytes.slice()], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

interface PdfFile {
  id: string;
  file: File;
}

export default function MergePDF() {
  const [files, setFiles] = useState<PdfFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultBytes, setResultBytes] = useState<Uint8Array | null>(null);
  const [outputSize, setOutputSize] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const { update: updatePdf } = useCurrentPdf();

  const addFiles = useCallback((newFiles: File[]) => {
    setFiles((prev) => [
      ...prev,
      ...newFiles.map((f) => ({ id: `${f.name}-${Date.now()}-${Math.random()}`, file: f })),
    ]);
    setIsSuccess(false);
    setError(null);
  }, []);

  const removeFile = (id: string) => setFiles((prev) => prev.filter((f) => f.id !== id));

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = Array.from(e.dataTransfer.files).filter((f) => f.type === "application/pdf");
    if (dropped.length > 0) addFiles(dropped);
  };

  const merge = async () => {
    if (files.length < 2) return;
    setIsProcessing(true);
    setError(null);
    setIsSuccess(false);
    try {
      const result = await mergePdfs(await Promise.all(files.map(({ file }) => bytesOf(file))));
      setResultBytes(result);
      setOutputSize(result.byteLength);
      setIsSuccess(true);
      updatePdf({ bytes: result, name: "Merged PDF" });
    } catch (err: unknown) {
      setError((err as Error).message || "Failed to merge PDFs");
    } finally {
      setIsProcessing(false);
    }
  };

  const download = () => {
    if (resultBytes) downloadBlob(resultBytes, "merged.pdf");
  };

  const reset = () => {
    setFiles([]);
    setIsSuccess(false);
    setError(null);
    setResultBytes(null);
  };

  const totalSize = files.reduce((s, f) => s + f.file.size, 0);

  return (
    <div className="max-w-2xl mx-auto px-6 py-10 pb-24 md:pb-10">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center">
            <Merge className="w-5 h-5 text-violet-600" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Merge PDFs</h1>
        </div>
        <p className="text-muted-foreground mb-8">Combine multiple PDF files into one. Drag to reorder before merging.</p>

        <ProcessingState
          isProcessing={isProcessing}
          isSuccess={isSuccess}
          error={error}
          label="Merging PDFs..."
          outputSize={outputSize}
          downloadLabel="Download Merged PDF"
          onDownload={download}
          onReset={reset}
          resultBytes={resultBytes}
          resultName="merged.pdf"
          operationLabel="Merged PDF"
        />

        {!isProcessing && !isSuccess && !error && (
          <div className="space-y-4">
            {/* Drop zone */}
            <div
              className={cn(
                "relative rounded-2xl border-2 border-dashed transition-all duration-200 cursor-pointer p-8 flex flex-col items-center gap-3",
                isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-accent/20"
              )}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
              data-testid="merge-dropzone"
            >
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Upload className="w-5 h-5 text-primary" />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-foreground">Drop PDF files here</p>
                <p className="text-xs text-muted-foreground">or click to browse</p>
              </div>
            </div>
            <input ref={inputRef} type="file" accept="application/pdf" multiple className="hidden" onChange={(e) => addFiles(Array.from(e.target.files || []))} />

            {/* File list */}
            <AnimatePresence>
              {files.length > 0 && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium text-foreground">{files.length} files · {formatBytes(totalSize)}</p>
                    <p className="text-xs text-muted-foreground">Drag to reorder</p>
                  </div>
                  <Reorder.Group axis="y" values={files} onReorder={setFiles} className="space-y-2">
                    {files.map((pf, i) => (
                      <Reorder.Item key={pf.id} value={pf}>
                        <motion.div
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 8 }}
                          className="flex items-center gap-3 p-3 bg-card border border-border rounded-xl cursor-grab active:cursor-grabbing"
                          data-testid={`merge-file-${i}`}
                        >
                          <GripVertical className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                          <span className="text-xs font-bold text-muted-foreground w-5">{i + 1}</span>
                          <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <FileText className="w-4 h-4 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{pf.file.name}</p>
                            <p className="text-xs text-muted-foreground">{formatBytes(pf.file.size)}</p>
                          </div>
                          <button onClick={() => removeFile(pf.id)} className="p-1 hover:bg-destructive/10 rounded-lg transition-colors" data-testid={`remove-file-${i}`}>
                            <X className="w-4 h-4 text-muted-foreground hover:text-destructive" />
                          </button>
                        </motion.div>
                      </Reorder.Item>
                    ))}
                  </Reorder.Group>

                  {files.length >= 2 && (
                    <div className="mt-4 flex items-center gap-3">
                      <div className="flex-1 flex items-center justify-center py-2 bg-accent rounded-xl gap-2 text-xs text-muted-foreground">
                        <ArrowDown className="w-3 h-3" />
                        {files.length} PDFs → 1 merged file
                      </div>
                      <Button onClick={merge} className="gap-2" data-testid="merge-button">
                        <Merge className="w-4 h-4" />
                        Merge
                      </Button>
                    </div>
                  )}
                  {files.length === 1 && (
                    <p className="text-sm text-muted-foreground text-center mt-3">Add at least one more PDF to merge</p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </motion.div>
    </div>
  );
}
