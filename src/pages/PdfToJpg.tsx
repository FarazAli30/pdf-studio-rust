import { useState } from "react";
import { motion } from "framer-motion";
import * as pdfjsLib from "pdfjs-dist";
import { ImageIcon, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import FileDropZone from "@/components/FileDropZone";
import ProcessingState from "@/components/ProcessingState";
import { useRecent } from "@/contexts/RecentContext";
import { useCurrentPdf } from "@/contexts/CurrentPdfContext";
import { renderPages, toDataUrl, bytesOf } from "@/lib/backend";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface ImageResult { dataUrl: string; name: string; pageNum: number; }

export default function PdfToJpg() {
  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [quality, setQuality] = useState([92]);
  const [scale, setScale] = useState([2]);
  const [fromPage, setFromPage] = useState("1");
  const [toPage, setToPage] = useState("1");
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [images, setImages] = useState<ImageResult[]>([]);
  const [progress, setProgress] = useState(0);
  const { addRecent } = useRecent();
  const { update: updatePdf } = useCurrentPdf();

  const handleFile = async (f: File) => {
    setFile(f); setIsSuccess(false); setError(null); setFileError(null); setImages([]); setIsLoadingFile(true);
    try {
      const ab = await f.arrayBuffer();
      const bytes = new Uint8Array(ab);
      const doc = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
      setPageCount(doc.numPages);
      setFromPage("1");
      setToPage(String(doc.numPages));
      updatePdf({ bytes, name: f.name, originalSize: f.size });
    } catch (e: unknown) {
      setFileError("Could not read PDF: " + ((e as Error).message || "unknown"));
      setPageCount(0);
    } finally { setIsLoadingFile(false); }
  };

  const convert = async () => {
    if (!file) return;
    const from = Math.max(1, parseInt(fromPage) || 1);
    const to = Math.min(pageCount, parseInt(toPage) || pageCount);
    if (from > to) { setError("Invalid page range"); return; }
    setIsProcessing(true); setError(null); setIsSuccess(false); setImages([]); setProgress(0);
    try {
      setProgress(10);
      const rendered = await renderPages(await bytesOf(file), { scale: scale[0], format: "jpeg", quality: quality[0], from, to });
      const results: ImageResult[] = rendered.map(r => ({ dataUrl: toDataUrl(r.bytes, "image/jpeg"), name: `page-${r.page}.jpg`, pageNum: r.page }));
      setProgress(100);
      setImages(results);
      setIsSuccess(true);
      addRecent({ name: file.name, tool: "PDF to JPG", toolPath: "/pdf-to-jpg", size: file.size });
    } catch (err: unknown) {
      setError((err as Error).message || "Conversion failed");
    } finally { setIsProcessing(false); }
  };

  const downloadImage = (img: ImageResult) => {
    const a = document.createElement("a"); a.href = img.dataUrl; a.download = img.name; a.click();
  };

  const downloadAll = async () => {
    for (const img of images) {
      downloadImage(img);
      await new Promise(r => setTimeout(r, 300));
    }
  };

  const reset = () => { setFile(null); setPageCount(0); setIsSuccess(false); setError(null); setFileError(null); setImages([]); };

  return (
    <div className="max-w-2xl mx-auto px-6 py-10 pb-24 md:pb-20">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-yellow-100 flex items-center justify-center">
            <ImageIcon className="w-5 h-5 text-yellow-600" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">PDF → JPG</h1>
        </div>
        <p className="text-muted-foreground mb-8">Convert each PDF page into a JPG image.</p>

        <div className="space-y-6">
          <FileDropZone onFileSelect={handleFile} selectedFile={file} onClear={reset} />

          {isLoadingFile && (
            <div className="flex items-center justify-center gap-3 py-6 text-muted-foreground text-sm">
              <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} className="w-5 h-5 border-2 border-primary/20 border-t-primary rounded-full" />
              Reading PDF…
            </div>
          )}

          {fileError && (
            <div className="rounded-xl bg-destructive/5 border border-destructive/20 p-4 text-sm text-destructive">{fileError}</div>
          )}

          <ProcessingState isProcessing={isProcessing} isSuccess={false} error={error} label="Converting pages to JPG..." progress={progress} onReset={reset} />

          {file && pageCount > 0 && !isLoadingFile && !isProcessing && !isSuccess && !error && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5 bg-card border border-border rounded-2xl p-5">
              <p className="text-sm text-muted-foreground font-medium">{pageCount} page{pageCount !== 1 ? "s" : ""} detected</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>From page</Label>
                  <Input type="number" min={1} max={pageCount} value={fromPage} onChange={(e) => setFromPage(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>To page (of {pageCount})</Label>
                  <Input type="number" min={1} max={pageCount} value={toPage} onChange={(e) => setToPage(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Image quality: {quality[0]}%</Label>
                <Slider min={50} max={100} step={2} value={quality} onValueChange={setQuality} />
              </div>
              <div className="space-y-2">
                <Label>Scale (resolution): {scale[0]}x</Label>
                <Slider min={1} max={4} step={0.5} value={scale} onValueChange={setScale} />
                <p className="text-xs text-muted-foreground">Higher = larger, sharper. 2x recommended.</p>
              </div>
              <Button onClick={convert} className="w-full gap-2">
                <ImageIcon className="w-4 h-4" /> Convert to JPG
              </Button>
            </motion.div>
          )}

          {isSuccess && images.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-foreground">{images.length} image{images.length > 1 ? "s" : ""} ready</p>
                {images.length > 1 && (
                  <Button size="sm" onClick={downloadAll} className="gap-1.5">
                    <Download className="w-3.5 h-3.5" /> Download All
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {images.map((img) => (
                  <div key={img.pageNum} className="rounded-xl border border-border overflow-hidden bg-accent/20">
                    <img src={img.dataUrl} alt={`Page ${img.pageNum}`} className="w-full object-cover" loading="lazy" />
                    <div className="p-2 flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">Page {img.pageNum}</span>
                      <button onClick={() => downloadImage(img)} className="text-xs text-primary font-medium hover:underline flex items-center gap-1">
                        <Download className="w-3 h-3" /> Save
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <Button variant="outline" onClick={reset} className="w-full">Start over</Button>
            </motion.div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
