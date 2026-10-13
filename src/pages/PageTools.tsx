import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { Reorder } from "framer-motion";
import { PDFDocument, degrees } from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist";
import { Settings2, RotateCw, Trash2, PlusSquare, GripVertical, ImagePlus, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import FileDropZone from "@/components/FileDropZone";
import ProcessingState from "@/components/ProcessingState";
import { useCurrentPdf } from "@/contexts/CurrentPdfContext";
import { useRecent } from "@/contexts/RecentContext";
import { cn } from "@/lib/utils";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

function downloadBlob(bytes: Uint8Array, name: string) { const blob=new Blob([bytes.slice()],{type:"application/pdf"}),url=URL.createObjectURL(blob),a=document.createElement("a"); a.href=url; a.download=name; a.click(); URL.revokeObjectURL(url); }

interface PageState { id: string; index: number; rotation: number; deleted: boolean; }
interface ThumbItem { id: string; origIndex: number; label: string; }

function Thumbnail({ pdfDoc, pageIndex, width = 70 }: { pdfDoc: pdfjsLib.PDFDocumentProxy; pageIndex: number; width?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const page = await pdfDoc.getPage(pageIndex + 1);
        const vp = page.getViewport({ scale: 1 });
        const scale = width / vp.width;
        const svp = page.getViewport({ scale });
        if (cancelled || !canvasRef.current) return;
        const canvas = canvasRef.current;
        canvas.width = svp.width; canvas.height = svp.height;
        await page.render({ canvas: canvas, canvasContext: canvas.getContext("2d")!, viewport: svp }).promise;
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [pdfDoc, pageIndex, width]);
  return <canvas ref={canvasRef} className="w-full object-contain rounded" />;
}

export default function PageTools() {
  const [file, setFile] = useState<File | null>(null);
  const [pdfDocProxy, setPdfDocProxy] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [pageStates, setPageStates] = useState<PageState[]>([]);
  const [thumbItems, setThumbItems] = useState<ThumbItem[]>([]);
  const [imgFile, setImgFile] = useState<File | null>(null);
  const [imgPreview, setImgPreview] = useState<string | null>(null);
  const [imgInsertAfter, setImgInsertAfter] = useState(0);
  const [imgScale, setImgScale] = useState([90]);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultBytes, setResultBytes] = useState<Uint8Array | null>(null);
  const [outputSize, setOutputSize] = useState(0);
  const imgInputRef = useRef<HTMLInputElement>(null);
  const { addRecent } = useRecent();
  const { update: updatePdf } = useCurrentPdf();

  const handleFile = useCallback(async (f: File) => {
    setFile(f); setIsSuccess(false); setError(null); setResultBytes(null);
    setIsLoadingFile(true); setPdfDocProxy(null); setPageStates([]); setThumbItems([]);
    try {
      const ab = await f.arrayBuffer();
      const bytes = new Uint8Array(ab);
      const proxy = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
      setPdfDocProxy(proxy);
      const count = proxy.numPages;
      const _b = new Uint8Array(await f.arrayBuffer()); updatePdf({ bytes: _b, name: f.name, originalSize: f.size });
      setPageStates(Array.from({ length: count }, (_, i) => ({ id: `p${i}`, index: i, rotation: 0, deleted: false })));
      setThumbItems(Array.from({ length: count }, (_, i) => ({ id: `t${i}`, origIndex: i, label: `Page ${i+1}` })));
    } catch (e: unknown) {
      setError("Could not read PDF: " + ((e as Error).message || "unknown error"));
    } finally { setIsLoadingFile(false); }
  }, []);

  const handleImgFile = (f: File) => {
    setImgFile(f);
    const reader = new FileReader();
    reader.onload = (e) => setImgPreview(e.target!.result as string);
    reader.readAsDataURL(f);
  };

  const rotatePage = (id: string, by: number) => setPageStates((prev) => prev.map((p) => p.id === id ? { ...p, rotation: (p.rotation + by + 360) % 360 } : p));
  const deletePage = (id: string) => setPageStates((prev) => prev.map((p) => p.id === id ? { ...p, deleted: true } : p));
  const restorePage = (id: string) => setPageStates((prev) => prev.map((p) => p.id === id ? { ...p, deleted: false } : p));

  const insertBlank = () => {
    const ts = Date.now();
    setPageStates((prev) => [...prev, { id: `blank-${ts}`, index: -1, rotation: 0, deleted: false }]);
    setThumbItems((prev) => [...prev, { id: `tb-${ts}`, origIndex: -1, label: "Blank Page" }]);
  };

  const applyOrganize = async () => {
    if (!file) return;
    setIsProcessing(true); setError(null); setIsSuccess(false);
    try {
      const srcDoc = await PDFDocument.load(await file.arrayBuffer());
      const newDoc = await PDFDocument.create();
      for (const ps of pageStates.filter((p) => !p.deleted)) {
        if (ps.index === -1) { newDoc.addPage(); continue; }
        const [page] = await newDoc.copyPages(srcDoc, [ps.index]);
        if (ps.rotation !== 0) { const cur = page.getRotation().angle; page.setRotation(degrees((cur + ps.rotation) % 360)); }
        newDoc.addPage(page);
      }
      const result = await newDoc.save();
      setResultBytes(result); setOutputSize(result.byteLength); setIsSuccess(true);
      addRecent({ name: file.name, tool: "Page Tools", toolPath: "/page-tools", size: file.size });
    } catch (err: unknown) { setError((err as Error).message || "Failed to process pages"); }
    finally { setIsProcessing(false); }
  };

  const applySort = async () => {
    if (!file) return;
    setIsProcessing(true); setError(null); setIsSuccess(false);
    try {
      const srcDoc = await PDFDocument.load(await file.arrayBuffer());
      const newDoc = await PDFDocument.create();
      for (const item of thumbItems) {
        if (item.origIndex === -1) { newDoc.addPage(); continue; }
        const [page] = await newDoc.copyPages(srcDoc, [item.origIndex]);
        newDoc.addPage(page);
      }
      const result = await newDoc.save();
      setResultBytes(result); setOutputSize(result.byteLength); setIsSuccess(true);
      addRecent({ name: file.name, tool: "Page Tools", toolPath: "/page-tools", size: file.size });
    } catch (err: unknown) { setError((err as Error).message || "Failed to sort pages"); }
    finally { setIsProcessing(false); }
  };

  const applyAddImage = async () => {
    if (!file || !imgFile) return;
    setIsProcessing(true); setError(null); setIsSuccess(false);
    try {
      const doc = await PDFDocument.load(await file.arrayBuffer());
      const imgBytes = await imgFile.arrayBuffer();
      let img;
      if (imgFile.type === "image/png") img = await doc.embedPng(imgBytes);
      else img = await doc.embedJpg(imgBytes);
      const refPage = doc.getPage(Math.max(0, imgInsertAfter - 1));
      const { width, height } = refPage.getSize();
      const newPage = doc.insertPage(imgInsertAfter, [width, height]);
      const scale = imgScale[0] / 100;
      const drawW = width * scale;
      const drawH = (img.height / img.width) * drawW;
      newPage.drawImage(img, { x: (width - drawW) / 2, y: (height - drawH) / 2, width: drawW, height: drawH });
      const result = await doc.save();
      setResultBytes(result); setOutputSize(result.byteLength); setIsSuccess(true);
      addRecent({ name: file.name, tool: "Page Tools", toolPath: "/page-tools", size: file.size });
    } catch (err: unknown) { setError((err as Error).message || "Failed to insert image page"); }
    finally { setIsProcessing(false); }
  };

  const reset = () => { setFile(null); setPdfDocProxy(null); setPageStates([]); setThumbItems([]); setImgFile(null); setImgPreview(null); setIsSuccess(false); setError(null); setResultBytes(null); };

  const ready = file && pageStates.length > 0 && !isLoadingFile && !isProcessing && !isSuccess && !error;

  return (
    <div className="max-w-3xl mx-auto px-6 py-10 pb-24 md:pb-20">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center"><Settings2 className="w-5 h-5 text-indigo-600" /></div>
          <h1 className="text-2xl font-bold text-foreground">Page Tools</h1>
        </div>
        <p className="text-muted-foreground mb-8">Organize, sort, delete, rotate and add pages to your PDF.</p>
        <div className="space-y-6">
          <FileDropZone onFileSelect={handleFile} selectedFile={file} onClear={reset} />

          {isLoadingFile && (
            <div className="flex items-center justify-center gap-3 py-8 text-muted-foreground text-sm">
              <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} className="w-5 h-5 border-2 border-primary/20 border-t-primary rounded-full" />
              Reading PDF…
            </div>
          )}

          <ProcessingState isProcessing={isProcessing} isSuccess={isSuccess} error={error} label="Applying page changes..." outputSize={outputSize} downloadLabel="Download PDF" onDownload={() => { if (resultBytes) downloadBlob(resultBytes, `pages-${file?.name||"output.pdf"}`); }} onReset={() => { setIsSuccess(false); setError(null); }} resultBytes={resultBytes} resultName={`pages-${file?.name||"output.pdf"}`} operationLabel="Page Tools" />

          {ready && (
            <Tabs defaultValue="organize" className="w-full">
              <TabsList className="w-full">
                <TabsTrigger value="organize" className="flex-1">Organize</TabsTrigger>
                <TabsTrigger value="sort" className="flex-1">Sort Pages</TabsTrigger>
                <TabsTrigger value="addimage" className="flex-1">Add Image</TabsTrigger>
              </TabsList>

              <TabsContent value="organize" className="space-y-3 mt-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm text-muted-foreground">{pageStates.filter(p=>!p.deleted).length} active / {pageStates.length} total pages</p>
                  <Button size="sm" variant="outline" onClick={insertBlank} className="gap-1.5"><PlusSquare className="w-3.5 h-3.5" /> Add Blank</Button>
                </div>
                <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                  {pageStates.map((ps, i) => (
                    <div key={ps.id} className={cn("flex items-center gap-3 p-3 rounded-xl border transition-all", ps.deleted ? "border-destructive/20 bg-destructive/5 opacity-50" : "border-border bg-card")}>
                      <span className="text-xs text-muted-foreground w-6 text-right font-bold">{i+1}</span>
                      <div className="flex-1 text-sm font-medium">{ps.index === -1 ? "Blank Page" : `Page ${ps.index+1}`}</div>
                      {ps.rotation !== 0 && <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">{ps.rotation}°</span>}
                      {!ps.deleted ? (
                        <div className="flex gap-1">
                          <button onClick={() => rotatePage(ps.id, -90)} className="p-1.5 hover:bg-accent rounded" title="Rotate left"><RotateCw className="w-3.5 h-3.5 scale-x-[-1]" /></button>
                          <button onClick={() => rotatePage(ps.id, 90)} className="p-1.5 hover:bg-accent rounded" title="Rotate right"><RotateCw className="w-3.5 h-3.5" /></button>
                          <button onClick={() => deletePage(ps.id)} className="p-1.5 hover:bg-destructive/10 rounded" title="Delete page"><Trash2 className="w-3.5 h-3.5 text-destructive" /></button>
                        </div>
                      ) : (
                        <button onClick={() => restorePage(ps.id)} className="text-xs text-primary hover:underline">Restore</button>
                      )}
                    </div>
                  ))}
                </div>
                <Button onClick={applyOrganize} className="w-full gap-2"><Settings2 className="w-4 h-4" /> Apply Changes</Button>
              </TabsContent>

              <TabsContent value="sort" className="mt-4">
                <p className="text-sm text-muted-foreground mb-3">Drag thumbnails to reorder pages</p>
                <Reorder.Group axis="x" values={thumbItems} onReorder={setThumbItems} className="flex flex-wrap gap-3 mb-4">
                  {thumbItems.map((item, i) => (
                    <Reorder.Item key={item.id} value={item}>
                      <motion.div whileDrag={{ scale: 1.05, zIndex: 10 }} className="cursor-grab active:cursor-grabbing w-20 rounded-xl border-2 border-border bg-card overflow-hidden hover:border-primary/50 transition-colors">
                        {pdfDocProxy && item.origIndex >= 0 ? (
                          <Thumbnail pdfDoc={pdfDocProxy} pageIndex={item.origIndex} width={80} />
                        ) : (
                          <div className="w-full aspect-[3/4] flex items-center justify-center bg-accent/30 text-xs text-muted-foreground">Blank</div>
                        )}
                        <p className="text-[10px] text-center py-1 font-medium text-muted-foreground">{i+1}</p>
                      </motion.div>
                    </Reorder.Item>
                  ))}
                </Reorder.Group>
                <Button onClick={applySort} className="w-full gap-2"><GripVertical className="w-4 h-4" /> Apply Sort Order</Button>
              </TabsContent>

              <TabsContent value="addimage" className="space-y-4 mt-4">
                <div className={cn("rounded-2xl border-2 border-dashed transition-all cursor-pointer p-6 flex flex-col items-center gap-3", imgFile ? "border-primary/30 bg-primary/5" : "border-border hover:border-primary/50")} onClick={() => imgInputRef.current?.click()}>
                  {imgPreview ? <img src={imgPreview} alt="" className="max-h-24 object-contain rounded" /> : <><Upload className="w-7 h-7 text-muted-foreground" /><p className="text-sm text-muted-foreground">Tap to select image</p></>}
                </div>
                <input ref={imgInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { if (e.target.files?.[0]) handleImgFile(e.target.files[0]); }} />
                {imgFile && (
                  <div className="space-y-4 bg-card border border-border rounded-2xl p-4">
                    <div className="space-y-2">
                      <Label>Insert after page: {imgInsertAfter === 0 ? "beginning" : imgInsertAfter}</Label>
                      <Slider min={0} max={pageStates.length} step={1} value={[imgInsertAfter]} onValueChange={([v]) => setImgInsertAfter(v)} />
                    </div>
                    <div className="space-y-2">
                      <Label>Image scale: {imgScale[0]}%</Label>
                      <Slider min={20} max={100} step={5} value={imgScale} onValueChange={setImgScale} />
                    </div>
                    <Button onClick={applyAddImage} className="w-full gap-2"><ImagePlus className="w-4 h-4" /> Insert Image as Page</Button>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}
        </div>
      </motion.div>
    </div>
  );
}
