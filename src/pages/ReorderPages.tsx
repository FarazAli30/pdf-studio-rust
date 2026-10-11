import { useState } from "react";
import { motion } from "framer-motion";
import { Reorder } from "framer-motion";
import { Shuffle, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCurrentPdf } from "@/contexts/CurrentPdfContext";
import FileDropZone from "@/components/FileDropZone";
import ProcessingState from "@/components/ProcessingState";
import { reorderPages, pdfInfo, bytesOf } from "@/lib/backend";

function downloadBlob(bytes: Uint8Array, name: string) {
  const blob = new Blob([bytes.slice()], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

interface PageItem { id: string; index: number; label: string; }

export default function ReorderPages() {
  const { update: updatePdf } = useCurrentPdf();
  const [file, setFile] = useState<File | null>(null);
  const [items, setItems] = useState<PageItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultBytes, setResultBytes] = useState<Uint8Array | null>(null);
  const [outputSize, setOutputSize] = useState(0);

  const handleFile = async (f: File) => {
    setFile(f); setIsSuccess(false); setError(null); setResultBytes(null);
    try {
      const pc = (await pdfInfo(await bytesOf(f))).pageCount;
      setItems(Array.from({ length: pc }, (_, i) => ({ id: `page-${i}`, index: i, label: `Page ${i + 1}` })));
    } catch { setItems([]); }
  };

  const reorder = async () => {
    if (!file) return;
    setIsProcessing(true); setError(null); setIsSuccess(false);
    try {
      const result = await reorderPages(await bytesOf(file), items.map((item) => item.index));
      setResultBytes(result); setOutputSize(result.byteLength); setIsSuccess(true);
    } catch (err: unknown) {
      setError((err as Error).message || "Failed to reorder pages");
    } finally { setIsProcessing(false); }
  };

  const download = () => { if (resultBytes) downloadBlob(resultBytes, `reordered-${file?.name || "output.pdf"}`); };
  const reset = () => { setFile(null); setItems([]); setIsSuccess(false); setError(null); setResultBytes(null); };

  const isReordered = items.some((item, i) => item.index !== i);

  return (
    <div className="max-w-2xl mx-auto px-6 py-10 pb-24 md:pb-10">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
            <Shuffle className="w-5 h-5 text-indigo-600" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Reorder Pages</h1>
        </div>
        <p className="text-muted-foreground mb-8">Drag pages into a new order and save the rearranged PDF.</p>

        <div className="space-y-6">
          <FileDropZone onFileSelect={handleFile} selectedFile={file} onClear={reset} />
          <ProcessingState isProcessing={isProcessing} isSuccess={isSuccess} error={error} label="Reordering pages..." outputSize={outputSize} downloadLabel="Download Reordered PDF" onDownload={download} onReset={reset} 
            resultBytes={resultBytes}
            resultName={`out-${file?.name||"output.pdf"}`}
            operationLabel="Processed"
          />

          {file && items.length > 0 && !isProcessing && !isSuccess && !error && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
              <p className="text-sm text-muted-foreground">Drag pages to rearrange them</p>
              <Reorder.Group axis="y" values={items} onReorder={setItems} className="space-y-2">
                {items.map((item, i) => (
                  <Reorder.Item key={item.id} value={item}>
                    <motion.div
                      whileDrag={{ scale: 1.02, boxShadow: "0 8px 24px rgba(0,0,0,0.12)" }}
                      className="flex items-center gap-3 p-3 bg-card border border-border rounded-xl cursor-grab active:cursor-grabbing"
                      data-testid={`page-item-${i}`}
                    >
                      <GripVertical className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      <div className="w-8 h-10 rounded border border-border bg-accent/30 flex items-center justify-center flex-shrink-0">
                        <div className="space-y-0.5 w-5">
                          {[3, 4, 3, 4].map((w, j) => <div key={j} className="h-px bg-muted-foreground/30 rounded" style={{ width: `${w * 4}px` }} />)}
                        </div>
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-foreground">{item.label}</p>
                        {item.index !== i && (
                          <p className="text-xs text-primary">Was page {item.index + 1}</p>
                        )}
                      </div>
                      <span className="text-xs font-bold text-muted-foreground w-6 text-right">{i + 1}</span>
                    </motion.div>
                  </Reorder.Item>
                ))}
              </Reorder.Group>

              <Button onClick={reorder} disabled={!isReordered} className="w-full gap-2" data-testid="apply-reorder-button">
                <Shuffle className="w-4 h-4" />
                Apply New Order
              </Button>
              {!isReordered && (
                <p className="text-xs text-muted-foreground text-center">Drag pages to change their order</p>
              )}
            </motion.div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
