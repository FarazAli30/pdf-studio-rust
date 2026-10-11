import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, FileText, X, FolderOpen, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCurrentPdf } from "@/contexts/CurrentPdfContext";
import PdfPreviewStrip from "@/components/PdfPreviewStrip";

interface Props {
  onFileSelect: (file: File) => void;
  accept?: string;
  multiple?: boolean;
  onFilesSelect?: (files: File[]) => void;
  selectedFile?: File | null;
  selectedFiles?: File[];
  onClear?: () => void;
  label?: string;
  hint?: string;
}

function fmt(b: number) {
  if (!b) return "0 B";
  const k=1024,s=["B","KB","MB","GB"],i=Math.floor(Math.log(b)/Math.log(k));
  return `${parseFloat((b/Math.pow(k,i)).toFixed(1))} ${s[i]}`;
}

export default function FileDropZone({
  onFileSelect, accept="application/pdf", multiple=false,
  onFilesSelect, selectedFile, selectedFiles, onClear, label="Drop your PDF here", hint="or tap to browse",
}: Props) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { state, update, undo } = useCurrentPdf();
  const hasLocal = selectedFile || (selectedFiles && selectedFiles.length > 0);

  const ingestFile = async (f: File) => {
    // Update global working PDF state (matches image app's ingestFile pattern)
    const bytes = new Uint8Array(await f.arrayBuffer());
    update({ bytes, name: f.name, originalSize: f.size });
    onFileSelect(f);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const files = Array.from(e.dataTransfer.files).filter(f => f.type === "application/pdf");
    if (!files.length) return;
    if (multiple && onFilesSelect) { onFilesSelect(files); files.forEach(f => update({ bytes: undefined })); }
    else ingestFile(files[0]);
  }, [multiple, onFilesSelect, onFileSelect]);

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    if (multiple && onFilesSelect) onFilesSelect(files);
    else await ingestFile(files[0]);
    e.target.value = "";
  };

  const useWorkingPdf = () => {
    if (!state.bytes) return;
    const f = new File([state.bytes!.buffer as ArrayBuffer], state.name, { type: "application/pdf" });
    onFileSelect(f);
  };

  return (
    <div className="w-full space-y-2">
      <AnimatePresence mode="wait">
        {hasLocal ? (
          <motion.div key="sel" initial={{opacity:0,y:4}} animate={{opacity:1,y:0}} exit={{opacity:0}}
            className="rounded-2xl border border-border bg-card p-4 space-y-3">
            {selectedFile && (
              <div className="flex items-center gap-3 py-2 px-3 rounded-xl bg-accent/40">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <FileText className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{selectedFile.name}</p>
                  <p className="text-xs text-muted-foreground">{fmt(selectedFile.size)}</p>
                </div>
                {onClear && (
                  <button onClick={onClear} className="p-1 hover:bg-destructive/10 rounded-lg">
                    <X className="w-4 h-4 text-muted-foreground hover:text-destructive" />
                  </button>
                )}
              </div>
            )}
            {selectedFiles?.map((f, i) => (
              <div key={i} className="flex items-center gap-3 py-2 px-3 rounded-xl bg-accent/40">
                <FileText className="w-4 h-4 text-primary flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{f.name}</p>
                  <p className="text-xs text-muted-foreground">{fmt(f.size)}</p>
                </div>
              </div>
            ))}
            <div className="flex items-center gap-3">
              <button onClick={() => inputRef.current?.click()} className="text-sm text-primary hover:underline">
                {multiple ? "Add more" : "Change file"}
              </button>
              {state.history.length > 0 && (
                <button onClick={undo} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                  <RotateCcw className="w-3 h-3" /> Undo
                </button>
              )}
            </div>
          </motion.div>
        ) : state.bytes && state.proxy ? (
          // Working PDF from context — show with preview (matches image app's "Use it" pattern)
          <motion.div key="working" initial={{opacity:0,y:4}} animate={{opacity:1,y:0}} exit={{opacity:0}}
            className="rounded-2xl border-2 border-primary/30 bg-primary/5 p-4 space-y-3">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-primary">Working PDF</p>
                <p className="text-xs text-muted-foreground truncate">
                  {state.name} · {state.pageCount} pages
                  {state.history.length > 0 && <span className="ml-1 text-primary/60">({state.history.length} edits)</span>}
                </p>
              </div>
              <div className="flex gap-1.5 flex-shrink-0">
                {state.history.length > 0 && (
                  <button onClick={undo} className="text-xs text-muted-foreground border border-border rounded-lg px-2 py-1 flex items-center gap-1 whitespace-nowrap">
                    <RotateCcw className="w-3 h-3" /> Undo
                  </button>
                )}
                <button onClick={() => inputRef.current?.click()}
                  className="text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg px-2 py-1 whitespace-nowrap">
                  Upload
                </button>
                <button onClick={useWorkingPdf}
                  className="text-xs bg-primary text-primary-foreground rounded-lg px-3 py-1 font-medium hover:bg-primary/90 whitespace-nowrap">
                  Use this ▸
                </button>
              </div>
            </div>
            <PdfPreviewStrip proxy={state.proxy} pageCount={state.pageCount} compact />
          </motion.div>
        ) : (
          <motion.div key="drop" initial={{opacity:0,y:4}} animate={{opacity:1,y:0}} exit={{opacity:0}}
            className={cn(
              "relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed transition-all cursor-pointer select-none min-h-[180px] p-8 gap-4",
              dragging ? "border-primary bg-primary/5 scale-[1.01]" : "border-border bg-background hover:border-primary/50 hover:bg-accent/30"
            )}
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}>
            <motion.div animate={dragging ? {scale:1.15,rotate:5} : {scale:1,rotate:0}}
              transition={{type:"spring",stiffness:300,damping:20}}
              className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Upload className="w-6 h-6 text-primary" />
            </motion.div>
            <div className="text-center">
              <p className="text-base font-semibold">{label}</p>
              <p className="text-sm text-muted-foreground mt-1">{hint}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {hasLocal && state.bytes && (
        <p className="text-xs text-muted-foreground text-center flex items-center justify-center gap-1">
          <FolderOpen className="w-3 h-3" />
          Working PDF:
          <button onClick={useWorkingPdf} className="text-primary hover:underline ml-1 font-medium">{state.name}</button>
        </p>
      )}

      <input ref={inputRef} type="file" accept={accept} multiple={multiple} className="hidden" onChange={handleChange} />
    </div>
  );
}
