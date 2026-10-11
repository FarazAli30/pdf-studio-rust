import { useState, useRef } from "react";
import { motion } from "framer-motion";
import { Reorder } from "framer-motion";
import { ImageIcon, GripVertical, X, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import ProcessingState from "@/components/ProcessingState";
import { useRecent } from "@/contexts/RecentContext";
import { useCurrentPdf } from "@/contexts/CurrentPdfContext";
import { cn } from "@/lib/utils";
import { imagesToPdf, bytesOf } from "@/lib/backend";

function formatBytes(b: number) { const k=1024,s=["B","KB","MB","GB"],i=Math.floor(Math.log(b)/Math.log(k)); return `${parseFloat((b/Math.pow(k,i)).toFixed(1))} ${s[i]}`; }
function downloadBlob(bytes: Uint8Array, name: string) { const blob=new Blob([bytes.slice()],{type:"application/pdf"}),url=URL.createObjectURL(blob),a=document.createElement("a"); a.href=url; a.download=name; a.click(); URL.revokeObjectURL(url); }

interface ImgFile { id: string; file: File; preview: string; }

type PageSizeKey = "A4" | "Letter" | "fit";
const PAGE_SIZES: Record<PageSizeKey, [number, number]> = {
  A4: [595.28, 841.89],
  Letter: [612, 792],
  fit: [0, 0],
};

export default function JpgToPdf() {
  const [images, setImages] = useState<ImgFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [pageSize, setPageSize] = useState<PageSizeKey>("A4");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultBytes, setResultBytes] = useState<Uint8Array | null>(null);
  const [outputSize, setOutputSize] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const { addRecent } = useRecent();
  const { update: updatePdf } = useCurrentPdf();

  const addImages = (files: File[]) => {
    const valid = files.filter((f) => f.type.startsWith("image/"));
    valid.forEach((f) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        setImages((prev) => [...prev, { id: `${f.name}-${Date.now()}-${Math.random()}`, file: f, preview: e.target!.result as string }]);
      };
      reader.readAsDataURL(f);
    });
    setIsSuccess(false); setError(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    addImages(Array.from(e.dataTransfer.files));
  };

  const remove = (id: string) => setImages((prev) => prev.filter((i) => i.id !== id));

  const convert = async () => {
    if (images.length === 0) return;
    setIsProcessing(true); setError(null); setIsSuccess(false);
    try {
      const result = await imagesToPdf(await Promise.all(images.map(({ file }) => bytesOf(file))), pageSize);
      setResultBytes(result); setOutputSize(result.byteLength); setIsSuccess(true);
      addRecent({ name: `${images.length} images`, tool: "JPG to PDF", toolPath: "/jpg-to-pdf", size: images.reduce((s,i)=>s+i.file.size,0) });
    } catch (err: unknown) { setError((err as Error).message || "Conversion failed"); }
    finally { setIsProcessing(false); }
  };

  const download = () => { if (resultBytes) downloadBlob(resultBytes, "images.pdf"); };
  const reset = () => { setImages([]); setIsSuccess(false); setError(null); setResultBytes(null); };

  return (
    <div className="max-w-2xl mx-auto px-6 py-10 pb-24 md:pb-20">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-pink-100 flex items-center justify-center">
            <ImageIcon className="w-5 h-5 text-pink-600" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">JPG → PDF</h1>
        </div>
        <p className="text-muted-foreground mb-8">Bundle one or more images into a single PDF. Drag to reorder pages.</p>

        <div className="space-y-6">
          {/* Drop zone */}
          <div
            className={cn("relative rounded-2xl border-2 border-dashed transition-all duration-200 cursor-pointer p-8 flex flex-col items-center gap-3", isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-accent/20")}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)} onDrop={handleDrop} onClick={() => inputRef.current?.click()} data-testid="img-dropzone"
          >
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><Upload className="w-5 h-5 text-primary" /></div>
            <div className="text-center"><p className="text-sm font-semibold text-foreground">Drop image files here</p><p className="text-xs text-muted-foreground">JPG, PNG, WebP supported</p></div>
          </div>
          <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => addImages(Array.from(e.target.files || []))} />

          <ProcessingState isProcessing={isProcessing} isSuccess={isSuccess} error={error} label="Building PDF from images..." outputSize={outputSize} downloadLabel="Download PDF" onDownload={download} onReset={reset} 
            resultBytes={resultBytes}
            resultName={"output.pdf"}
            operationLabel="Processed"
          />

          {images.length > 0 && !isProcessing && !isSuccess && !error && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">{images.length} image{images.length > 1 ? "s" : ""} · {formatBytes(images.reduce((s,i)=>s+i.file.size,0))}</p>
                <p className="text-xs text-muted-foreground">Drag to reorder</p>
              </div>
              <Reorder.Group axis="y" values={images} onReorder={setImages} className="space-y-2">
                {images.map((img, i) => (
                  <Reorder.Item key={img.id} value={img}>
                    <motion.div whileDrag={{ scale: 1.02 }} className="flex items-center gap-3 p-3 bg-card border border-border rounded-xl cursor-grab active:cursor-grabbing" data-testid={`img-item-${i}`}>
                      <GripVertical className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      <img src={img.preview} alt="" className="w-10 h-10 object-cover rounded-lg border border-border flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{img.file.name}</p>
                        <p className="text-xs text-muted-foreground">{formatBytes(img.file.size)}</p>
                      </div>
                      <button onClick={() => remove(img.id)} className="p-1 hover:bg-destructive/10 rounded-lg"><X className="w-4 h-4 text-muted-foreground" /></button>
                    </motion.div>
                  </Reorder.Item>
                ))}
              </Reorder.Group>
              <div className="space-y-3">
                <Label>Page size</Label>
                <div className="flex gap-2">
                  {(["A4", "Letter", "fit"] as PageSizeKey[]).map((s) => (
                    <button key={s} onClick={() => setPageSize(s)} className={`flex-1 py-2 rounded-xl border text-sm font-medium transition-colors ${pageSize === s ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:border-primary/40"}`} data-testid={`size-${s}`}>{s === "fit" ? "Fit to image" : s}</button>
                  ))}
                </div>
              </div>
              <Button onClick={convert} className="w-full gap-2" data-testid="convert-button"><ImageIcon className="w-4 h-4" /> Create PDF</Button>
            </motion.div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
