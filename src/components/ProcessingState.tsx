import { motion } from "framer-motion";
import { CheckCircle, AlertCircle, Download, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useCurrentPdf } from "@/contexts/CurrentPdfContext";
import PdfPreviewStrip from "@/components/PdfPreviewStrip";
import { useState, useEffect } from "react";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

function fmt(b: number) {
  if (!b) return "0 B";
  const k=1024,s=["B","KB","MB","GB"],i=Math.floor(Math.log(b)/Math.log(k));
  return `${parseFloat((b/Math.pow(k,i)).toFixed(1))} ${s[i]}`;
}

interface Props {
  isProcessing: boolean;
  isSuccess: boolean;
  error?: string | null;
  progress?: number;
  label?: string;
  outputSize?: number;
  inputSize?: number;
  downloadLabel?: string;
  onDownload?: () => void;
  onReset?: () => void;
  resultBytes?: Uint8Array | null;
  resultName?: string;
  operationLabel?: string;
}

export default function ProcessingState({
  isProcessing, isSuccess, error, progress=50, label="Processing...",
  outputSize, inputSize, downloadLabel="Download Result",
  onDownload, onReset, resultBytes, resultName, operationLabel,
}: Props) {
  const { update } = useCurrentPdf();
  const [proxy, setProxy] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [synced, setSynced] = useState(false);

  // Auto-push result to working PDF context whenever a tool succeeds
  useEffect(() => {
    if (!isSuccess || !resultBytes || !resultName || synced) return;
    setSynced(true);
    // Load preview proxy
    pdfjsLib.getDocument({ data: resultBytes.slice() }).promise
      .then(p => setProxy(p)).catch(() => {});
    // Update global working PDF so next tool sees the result immediately
    update({ bytes: resultBytes, name: resultName });
  }, [isSuccess, resultBytes]);

  // Reset sync flag when success resets
  useEffect(() => { if (!isSuccess) { setSynced(false); setProxy(null); } }, [isSuccess]);

  if (error) return (
    <motion.div initial={{opacity:0,scale:0.95}} animate={{opacity:1,scale:1}}
      className="rounded-2xl border border-destructive/20 bg-destructive/5 p-6 flex flex-col items-center gap-4 text-center">
      <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
        <AlertCircle className="w-6 h-6 text-destructive" />
      </div>
      <div>
        <p className="font-semibold">Processing failed</p>
        <p className="text-sm text-muted-foreground mt-1 break-all">{error}</p>
      </div>
      {onReset && <Button variant="outline" onClick={onReset}>Try again</Button>}
    </motion.div>
  );

  if (isProcessing) return (
    <motion.div initial={{opacity:0,y:8}} animate={{opacity:1,y:0}}
      className="rounded-2xl border border-border bg-card p-8 flex flex-col items-center gap-5">
      <div className="relative w-16 h-16">
        <motion.div animate={{rotate:360}} transition={{duration:1.5,repeat:Infinity,ease:"linear"}}
          className="absolute inset-0 rounded-full border-4 border-primary/20 border-t-primary"/>
        <div className="absolute inset-2 rounded-full bg-primary/10 flex items-center justify-center">
          <motion.div animate={{scale:[1,1.2,1]}} transition={{duration:1,repeat:Infinity}}
            className="w-4 h-4 rounded-full bg-primary"/>
        </div>
      </div>
      <div className="w-full max-w-xs space-y-2">
        <p className="text-sm font-medium text-center">{label}</p>
        <Progress value={progress} className="h-1.5"/>
      </div>
    </motion.div>
  );

  if (isSuccess) return (
    <motion.div initial={{opacity:0,scale:0.95}} animate={{opacity:1,scale:1}}
      className="rounded-2xl border border-green-200 bg-green-50 p-5 flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <motion.div initial={{scale:0}} animate={{scale:1}} transition={{type:"spring",stiffness:400,damping:20,delay:0.1}}
          className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
          <CheckCircle className="w-7 h-7 text-green-600"/>
        </motion.div>
        <div className="flex-1">
          <p className="font-semibold text-green-900">Done!</p>
          <div className="flex items-center gap-2 flex-wrap mt-0.5">
            {inputSize !== undefined && outputSize !== undefined ? (
              <p className="text-sm text-green-700">{fmt(inputSize)} → {fmt(outputSize)}</p>
            ) : outputSize !== undefined ? (
              <p className="text-sm text-green-700">{fmt(outputSize)}</p>
            ) : null}
            {inputSize !== undefined && outputSize !== undefined && inputSize > outputSize && (
              <span className="text-xs bg-green-200 text-green-800 px-2 py-0.5 rounded-full font-medium">
                -{Math.round((1-outputSize/inputSize)*100)}% smaller
              </span>
            )}
            {resultName && (
              <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                <Layers className="w-3 h-3"/> Saved as working PDF
              </span>
            )}
          </div>
        </div>
      </div>

      {proxy && (
        <div className="bg-white/60 rounded-xl p-3 border border-green-100">
          <PdfPreviewStrip proxy={proxy} pageCount={proxy.numPages} label="Result preview" compact/>
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        {onDownload && (
          <Button onClick={onDownload} className="gap-2 flex-1">
            <Download className="w-4 h-4"/> {downloadLabel}
          </Button>
        )}
        {onReset && (
          <Button variant="ghost" onClick={onReset} className="w-full text-sm">Start over</Button>
        )}
      </div>
    </motion.div>
  );

  return null;
}
