import { useState, useRef, useEffect, useCallback } from "react";
import { motion, Reorder } from "framer-motion";
import {
  ImageIcon, GripVertical, X, Upload, Camera, Crop,
  Check, RotateCcw, ZoomIn, FlipHorizontal, Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import ProcessingState from "@/components/ProcessingState";
import { useRecent } from "@/contexts/RecentContext";
import { useCurrentPdf } from "@/contexts/CurrentPdfContext";
import { cn } from "@/lib/utils";
import heic2any from "heic2any";
import { imagesToPdf } from "@/lib/backend";

function formatBytes(b: number) {
  if (b === 0) return "—";
  const k = 1024, s = ["B", "KB", "MB", "GB"], i = Math.floor(Math.log(b) / Math.log(k));
  return `${parseFloat((b / Math.pow(k, i)).toFixed(1))} ${s[i]}`;
}
function downloadBlob(bytes: Uint8Array, name: string) {
  const blob = new Blob([bytes.slice()], { type: "application/pdf" }),
    url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
}

interface ImgFile {
  id: string; name: string; size: number;
  preview: string; croppedPreview?: string;
}

type PageSizeKey = "A4" | "Letter" | "fit";
const PAGE_SIZES: Record<PageSizeKey, [number, number]> = {
  A4: [595.28, 841.89], Letter: [612, 792], fit: [0, 0],
};

const ACCEPTED = ".jpg,.jpeg,.png,.webp,.gif,.bmp,.svg,.heic,.heif,image/*";

async function srcToDataUrl(src: string): Promise<string> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      c.getContext("2d")!.drawImage(img, 0, 0);
      res(c.toDataURL("image/png"));
    };
    img.onerror = rej;
    img.src = src;
  });
}

async function normaliseFile(file: File): Promise<{ preview: string; name: string }> {
  const isHeic = file.type === "image/heic" || file.type === "image/heif" ||
    /\.(heic|heif)$/i.test(file.name);
  if (isHeic) {
    const blob = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 }) as Blob;
    const url = URL.createObjectURL(blob);
    const preview = await srcToDataUrl(url);
    URL.revokeObjectURL(url);
    return { preview, name: file.name.replace(/\.(heic|heif)$/i, ".jpg") };
  }
  const isSvg = file.type === "image/svg+xml" || /\.svg$/i.test(file.name);
  if (isSvg) {
    const text = await file.text();
    const blob = new Blob([text], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const preview = await srcToDataUrl(url);
    URL.revokeObjectURL(url);
    return { preview, name: file.name };
  }
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload = (e) => res({ preview: e.target!.result as string, name: file.name });
    reader.onerror = rej;
    reader.readAsDataURL(file);
  });
}

// ─── CROP MODAL ─────────────────────────────────────────────────────────────
interface CropPx { x: number; y: number; w: number; h: number; }
type DragKind = "move" | "nw" | "ne" | "sw" | "se";

interface DragState {
  kind: DragKind; sx: number; sy: number; sc: CropPx; maxW: number; maxH: number;
}

function CropModal({ src, onApply, onClose }: {
  src: string; onApply: (cropped: string) => void; onClose: () => void;
}) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [ready, setReady] = useState(false);
  const [crop, setCrop] = useState<CropPx>({ x: 0, y: 0, w: 0, h: 0 });
  const drag = useRef<DragState | null>(null);

  // ── Document-level pointer events so drag continues outside the box ────
  useEffect(() => {
    const MIN = 20;
    const onMove = (e: PointerEvent) => {
      if (!drag.current) return;
      const { kind, sx, sy, sc, maxW, maxH } = drag.current;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      let n = { ...sc };
      if (kind === "move") { n.x = sc.x + dx; n.y = sc.y + dy; }
      else if (kind === "nw") { n.x = sc.x + dx; n.y = sc.y + dy; n.w = sc.w - dx; n.h = sc.h - dy; }
      else if (kind === "ne") { n.y = sc.y + dy; n.w = sc.w + dx; n.h = sc.h - dy; }
      else if (kind === "sw") { n.x = sc.x + dx; n.w = sc.w - dx; n.h = sc.h + dy; }
      else if (kind === "se") { n.w = sc.w + dx; n.h = sc.h + dy; }
      const x = Math.max(0, Math.min(n.x, maxW - MIN));
      const y = Math.max(0, Math.min(n.y, maxH - MIN));
      const w = Math.max(MIN, Math.min(n.w, maxW - x));
      const h = Math.max(MIN, Math.min(n.h, maxH - y));
      setCrop({ x, y, w, h });
    };
    const onUp = () => { drag.current = null; };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
    };
  }, []);

  const startDrag = (e: React.PointerEvent, kind: DragKind) => {
    e.preventDefault();
    e.stopPropagation();
    drag.current = {
      kind, sx: e.clientX, sy: e.clientY, sc: { ...crop },
      maxW: imgRef.current?.clientWidth ?? 0,
      maxH: imgRef.current?.clientHeight ?? 0,
    };
  };

  const init = () => {
    const iw = imgRef.current?.clientWidth ?? 0;
    const ih = imgRef.current?.clientHeight ?? 0;
    setCrop({ x: 0, y: 0, w: iw, h: ih });
    setReady(true);
  };

  const apply = () => {
    const img = imgRef.current!;
    const scaleX = img.naturalWidth / img.clientWidth;
    const scaleY = img.naturalHeight / img.clientHeight;
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(crop.w * scaleX));
    c.height = Math.max(1, Math.round(crop.h * scaleY));
    c.getContext("2d")!.drawImage(
      img,
      Math.round(crop.x * scaleX), Math.round(crop.y * scaleY),
      c.width, c.height, 0, 0, c.width, c.height,
    );
    onApply(c.toDataURL("image/png"));
  };

  const CORNER_HANDLES: [DragKind, React.CSSProperties, string][] = [
    ["nw", { top: -8, left: -8, cursor: "nw-resize" }, ""],
    ["ne", { top: -8, right: -8, cursor: "ne-resize" }, ""],
    ["sw", { bottom: -8, left: -8, cursor: "sw-resize" }, ""],
    ["se", { bottom: -8, right: -8, cursor: "se-resize" }, ""],
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
        className="bg-background rounded-2xl shadow-2xl p-5 w-full max-w-2xl flex flex-col gap-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Crop className="w-5 h-5 text-primary" />
            <h2 className="text-base font-bold">Crop Image</h2>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-accent rounded-lg"><X className="w-4 h-4" /></button>
        </div>

        {/* Image + crop overlay */}
        <div
          className="flex items-center justify-center bg-black/20 rounded-xl overflow-hidden select-none"
          style={{ maxHeight: "60vh" }}
        >
          <div className="relative inline-block" style={{ touchAction: "none" }}>
            <img
              ref={imgRef}
              src={src}
              alt="Crop preview"
              className="block"
              style={{ maxWidth: "100%", maxHeight: "58vh", objectFit: "contain", userSelect: "none" }}
              onLoad={init}
              draggable={false}
            />

            {ready && (
              <>
                {/* Dark vignette outside crop — 4 rects */}
                <div className="absolute inset-0 pointer-events-none">
                  <div className="absolute bg-black/55" style={{ top: 0, left: 0, right: 0, height: crop.y }} />
                  <div className="absolute bg-black/55" style={{ top: crop.y + crop.h, left: 0, right: 0, bottom: 0 }} />
                  <div className="absolute bg-black/55" style={{ top: crop.y, left: 0, width: crop.x, height: crop.h }} />
                  <div className="absolute bg-black/55" style={{ top: crop.y, left: crop.x + crop.w, right: 0, height: crop.h }} />
                </div>

                {/* Crop box */}
                <div
                  className="absolute border-2 border-white cursor-move"
                  style={{ left: crop.x, top: crop.y, width: crop.w, height: crop.h, touchAction: "none" }}
                  onPointerDown={e => startDrag(e, "move")}
                >
                  {/* Rule-of-thirds grid */}
                  <div className="absolute inset-0 pointer-events-none">
                    {[1 / 3, 2 / 3].map(f => (
                      <div key={`v${f}`} className="absolute top-0 bottom-0 border-r border-white/25" style={{ left: `${f * 100}%` }} />
                    ))}
                    {[1 / 3, 2 / 3].map(f => (
                      <div key={`h${f}`} className="absolute left-0 right-0 border-b border-white/25" style={{ top: `${f * 100}%` }} />
                    ))}
                  </div>

                  {/* Corner handles — larger for easier grabbing */}
                  {CORNER_HANDLES.map(([kind, style]) => (
                    <div
                      key={kind}
                      style={{
                        position: "absolute",
                        width: 16, height: 16,
                        background: "#fff",
                        borderRadius: 3,
                        boxShadow: "0 1px 4px rgba(0,0,0,0.4)",
                        touchAction: "none",
                        ...style,
                      }}
                      onPointerDown={e => startDrag(e, kind)}
                    />
                  ))}

                  {/* Edge midpoint handles */}
                  {([
                    ["n", { top: -6, left: "50%", transform: "translateX(-50%)", cursor: "n-resize", width: 24, height: 10 }] as const,
                    ["s", { bottom: -6, left: "50%", transform: "translateX(-50%)", cursor: "s-resize", width: 24, height: 10 }] as const,
                    ["w", { left: -6, top: "50%", transform: "translateY(-50%)", cursor: "w-resize", width: 10, height: 24 }] as const,
                    ["e", { right: -6, top: "50%", transform: "translateY(-50%)", cursor: "e-resize", width: 10, height: 24 }] as const,
                  ] as const).map(([side, style]) => {
                    const kindMap = { n: "nw" as DragKind, s: "se" as DragKind, w: "nw" as DragKind, e: "se" as DragKind };
                    return (
                      <div
                        key={side}
                        style={{
                          position: "absolute",
                          background: "#fff",
                          borderRadius: 3,
                          opacity: 0.85,
                          boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                          touchAction: "none",
                          ...style,
                        }}
                        onPointerDown={e => startDrag(e, kindMap[side])}
                      />
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>

        <p className="text-xs text-muted-foreground text-center">
          Drag corners or edges to resize · Drag inside to move
        </p>

        <div className="flex gap-3">
          <Button variant="outline" onClick={init} className="gap-2">
            <RotateCcw className="w-4 h-4" /> Reset
          </Button>
          <Button onClick={apply} className="flex-1 gap-2">
            <Check className="w-4 h-4" /> Apply Crop
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

// ─── CAMERA MODAL ────────────────────────────────────────────────────────────
function CameraModal({ onCapture, onClose }: {
  onCapture: (dataUrl: string) => void; onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");

  const startCamera = useCallback(async (mode: "environment" | "user") => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    setReady(false); setErr(null);
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: mode, width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      streamRef.current = s;
      if (videoRef.current) { videoRef.current.srcObject = s; }
      setReady(true);
    } catch {
      setErr("Camera access denied. Please allow camera permission in your browser.");
    }
  }, []);

  useEffect(() => {
    startCamera(facingMode);
    return () => { streamRef.current?.getTracks().forEach(t => t.stop()); };
  }, [facingMode, startCamera]);

  const capture = () => {
    const v = videoRef.current!;
    const c = document.createElement("canvas");
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext("2d")!.drawImage(v, 0, 0);
    streamRef.current?.getTracks().forEach(t => t.stop());
    onCapture(c.toDataURL("image/jpeg", 0.92));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
        className="bg-background rounded-2xl shadow-2xl p-5 w-full max-w-xl flex flex-col gap-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Camera className="w-5 h-5 text-primary" />
            <h2 className="text-base font-bold">Camera Capture</h2>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-accent rounded-lg"><X className="w-4 h-4" /></button>
        </div>
        <div className="relative bg-black rounded-xl overflow-hidden aspect-video flex items-center justify-center">
          <video ref={videoRef} autoPlay playsInline muted className={cn("w-full h-full object-cover", !ready && "invisible")} />
          {!ready && !err && <div className="absolute inset-0 flex items-center justify-center"><p className="text-white/70 text-sm">Starting camera…</p></div>}
          {err && <div className="absolute inset-0 flex items-center justify-center p-6 text-center"><p className="text-white/80 text-sm">{err}</p></div>}
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => setFacingMode(m => m === "environment" ? "user" : "environment")} className="gap-2" disabled={!ready}>
            <FlipHorizontal className="w-4 h-4" /> Flip
          </Button>
          <Button onClick={capture} className="flex-1 gap-2 text-base" disabled={!ready}>
            <Camera className="w-5 h-5" /> Capture Photo
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

// ─── MAIN PAGE ───────────────────────────────────────────────────────────────
export default function ImagesToPdf() {
  const [images, setImages] = useState<ImgFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [pageSize, setPageSize] = useState<PageSizeKey>("A4");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultBytes, setResultBytes] = useState<Uint8Array | null>(null);
  const [outputSize, setOutputSize] = useState(0);
  const [cropTarget, setCropTarget] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { addRecent } = useRecent();
  const { update: updatePdf } = useCurrentPdf();

  const addFiles = useCallback(async (files: File[]) => {
    const valid = files.filter(f =>
      f.type.startsWith("image/") || /\.(jpg|jpeg|png|webp|gif|bmp|svg|heic|heif)$/i.test(f.name),
    );
    if (!valid.length) return;
    setLoadingFiles(true); setIsSuccess(false); setError(null);
    try {
      const results = await Promise.all(valid.map(async f => {
        const { preview, name } = await normaliseFile(f);
        return { id: `${name}-${Date.now()}-${Math.random()}`, name, size: f.size, preview };
      }));
      setImages(prev => [...prev, ...results]);
    } catch (e) {
      setError((e as Error).message || "Failed to load images");
    } finally { setLoadingFiles(false); }
  }, []);

  const addFromDataUrl = (dataUrl: string, name = `photo-${Date.now()}.jpg`) => {
    setImages(prev => [...prev, { id: `${name}-${Date.now()}`, name, size: 0, preview: dataUrl }]);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    addFiles(Array.from(e.dataTransfer.files));
  };

  const remove = (id: string) => setImages(prev => prev.filter(i => i.id !== id));
  const applyCrop = (id: string, url: string) => {
    setImages(prev => prev.map(i => i.id === id ? { ...i, croppedPreview: url } : i));
    setCropTarget(null);
  };
  const removeCrop = (id: string) =>
    setImages(prev => prev.map(i => i.id === id ? { ...i, croppedPreview: undefined } : i));

  const convert = async () => {
    if (!images.length) return;
    setIsProcessing(true); setError(null); setIsSuccess(false);
    try {
      const bytesList: Uint8Array[] = [];
      for (const imgFile of images) {
        const src = imgFile.croppedPreview ?? imgFile.preview;
        bytesList.push(new Uint8Array(await (await fetch(src)).arrayBuffer()));
      }
      const result = await imagesToPdf(bytesList, pageSize);
      setResultBytes(result); setOutputSize(result.byteLength); setIsSuccess(true);
      addRecent({
        name: `${images.length} image${images.length > 1 ? "s" : ""}`,
        tool: "Images to PDF", toolPath: "/images-to-pdf",
        size: images.reduce((s, i) => s + i.size, 0),
      });
    } catch (err: unknown) { setError((err as Error).message || "Conversion failed"); }
    finally { setIsProcessing(false); }
  };

  const download = () => { if (resultBytes) downloadBlob(resultBytes, "images.pdf"); };
  const reset = () => { setImages([]); setIsSuccess(false); setError(null); setResultBytes(null); };

  const cropImg = cropTarget ? images.find(i => i.id === cropTarget) : null;
  const hasImages = images.length > 0;

  return (
    <div className="max-w-2xl mx-auto px-5 py-10 pb-28 md:pb-20">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-pink-100 flex items-center justify-center">
            <ImageIcon className="w-5 h-5 text-pink-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Images → PDF</h1>
            <p className="text-xs text-muted-foreground">JPG · PNG · SVG · HEIC · HEIF · WebP · GIF · BMP</p>
          </div>
        </div>
        <p className="text-muted-foreground mb-8">
          Convert any image format to PDF. Crop, reorder, and capture from camera — all in the browser.
        </p>

        <div className="space-y-4">
          <ProcessingState
            isProcessing={isProcessing} isSuccess={isSuccess} error={error}
            label="Building PDF from images…" outputSize={outputSize}
            downloadLabel="Download PDF" onDownload={download} onReset={reset}
            resultBytes={resultBytes}
            resultName={"output.pdf"}
            operationLabel="Processed"
          />

          {/* ── Image list — shown ABOVE the upload zone ── */}
          {hasImages && !isProcessing && !isSuccess && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-foreground">
                  {images.length} image{images.length > 1 ? "s" : ""}
                </p>
                <p className="text-xs text-muted-foreground">Drag to reorder</p>
              </div>

              <Reorder.Group axis="y" values={images} onReorder={setImages} className="space-y-2">
                {images.map((img, idx) => (
                  <Reorder.Item key={img.id} value={img}>
                    <motion.div
                      whileDrag={{ scale: 1.02, boxShadow: "0 8px 24px rgba(0,0,0,0.12)" }}
                      className="flex items-center gap-3 p-3 bg-card border border-border rounded-xl cursor-grab active:cursor-grabbing"
                      data-testid={`img-item-${idx}`}
                    >
                      <GripVertical className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      <div className="relative w-12 h-12 flex-shrink-0">
                        <img
                          src={img.croppedPreview ?? img.preview}
                          alt=""
                          className="w-12 h-12 object-cover rounded-lg border border-border"
                        />
                        {img.croppedPreview && (
                          <div className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-primary rounded-full flex items-center justify-center">
                            <Crop className="w-2.5 h-2.5 text-white" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{img.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatBytes(img.size)}{img.croppedPreview ? " · cropped" : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {img.croppedPreview && (
                          <button onClick={() => removeCrop(img.id)} className="p-1.5 hover:bg-accent rounded-lg text-primary" title="Remove crop">
                            <ZoomIn className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button onClick={() => setCropTarget(img.id)} className="p-1.5 hover:bg-accent rounded-lg text-muted-foreground hover:text-foreground" title="Crop">
                          <Crop className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => remove(img.id)} className="p-1.5 hover:bg-destructive/10 rounded-lg" title="Remove">
                          <X className="w-3.5 h-3.5 text-muted-foreground" />
                        </button>
                      </div>
                    </motion.div>
                  </Reorder.Item>
                ))}
              </Reorder.Group>
            </motion.div>
          )}

          {/* ── Upload zone — full when empty, compact "add more" when images exist ── */}
          {!isProcessing && !isSuccess && (
            <div className="flex gap-3">
              <div
                className={cn(
                  "flex-1 rounded-2xl border-2 border-dashed transition-all duration-200 cursor-pointer",
                  hasImages ? "p-4 flex items-center gap-3" : "p-8 flex flex-col items-center gap-3",
                  isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-accent/20",
                )}
                onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => inputRef.current?.click()}
                data-testid="img-dropzone"
              >
                <div className={cn("rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0", hasImages ? "w-9 h-9" : "w-10 h-10")}>
                  {hasImages ? <Plus className="w-4 h-4 text-primary" /> : <Upload className="w-5 h-5 text-primary" />}
                </div>
                {hasImages ? (
                  <p className="text-sm font-medium text-muted-foreground">
                    {loadingFiles ? "Loading…" : "Add more images"}
                  </p>
                ) : (
                  <div className="text-center">
                    <p className="text-sm font-semibold text-foreground">
                      {loadingFiles ? "Loading images…" : "Drop images here or click to browse"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      JPG, PNG, SVG, HEIC, HEIF, WebP, GIF, BMP
                    </p>
                  </div>
                )}
              </div>
              <button
                onClick={() => setShowCamera(true)}
                className={cn(
                  "flex flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-border hover:border-primary/50 hover:bg-accent/20 transition-all text-muted-foreground hover:text-foreground",
                  hasImages ? "w-16 px-2" : "w-24 p-3",
                )}
                data-testid="camera-button"
              >
                <Camera className="w-5 h-5" />
                <span className="text-xs font-medium">Camera</span>
              </button>
            </div>
          )}

          <input
            ref={inputRef} type="file" accept={ACCEPTED} multiple className="hidden"
            onChange={e => { addFiles(Array.from(e.target.files || [])); e.target.value = ""; }}
          />

          {/* ── Page size + Convert ── */}
          {hasImages && !isProcessing && !isSuccess && !error && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Page size</Label>
                <div className="flex gap-2">
                  {(["A4", "Letter", "fit"] as PageSizeKey[]).map(s => (
                    <button key={s} onClick={() => setPageSize(s)}
                      className={cn("flex-1 py-2 rounded-xl border text-sm font-medium transition-colors",
                        pageSize === s ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:border-primary/40",
                      )}
                      data-testid={`size-${s}`}
                    >
                      {s === "fit" ? "Fit to image" : s}
                    </button>
                  ))}
                </div>
              </div>
              <Button onClick={convert} className="w-full gap-2 h-11" data-testid="convert-button">
                <ImageIcon className="w-4 h-4" />
                Create PDF · {images.length} image{images.length > 1 ? "s" : ""}
              </Button>
            </motion.div>
          )}
        </div>
      </motion.div>

      {cropTarget && cropImg && (
        <CropModal
          src={cropImg.croppedPreview ?? cropImg.preview}
          onApply={url => applyCrop(cropTarget, url)}
          onClose={() => setCropTarget(null)}
        />
      )}
      {showCamera && (
        <CameraModal
          onCapture={url => { addFromDataUrl(url); setShowCamera(false); }}
          onClose={() => setShowCamera(false)}
        />
      )}
    </div>
  );
}
