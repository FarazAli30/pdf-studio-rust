import { useState, useRef } from "react";
import { motion } from "framer-motion";
import { Code2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import ProcessingState from "@/components/ProcessingState";
import { useRecent } from "@/contexts/RecentContext";
import { useCurrentPdf } from "@/contexts/CurrentPdfContext";
import { imagesToPdf, bytesOf } from "@/lib/backend";

function downloadBlob(bytes: Uint8Array, name: string) { const blob=new Blob([bytes.slice()],{type:"application/pdf"}),url=URL.createObjectURL(blob),a=document.createElement("a"); a.href=url; a.download=name; a.click(); URL.revokeObjectURL(url); }

export default function SvgToPdf() {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultBytes, setResultBytes] = useState<Uint8Array | null>(null);
  const [outputSize, setOutputSize] = useState(0);
  const [pageSize, setPageSize] = useState<"fit" | "A4" | "Letter">("fit");
  const inputRef = useRef<HTMLInputElement>(null);
  const { addRecent } = useRecent();
  const { update: updatePdf } = useCurrentPdf();

  const convert = async () => {
    if (!file) return;
    setIsProcessing(true); setError(null); setIsSuccess(false);
    try {
      const result = await imagesToPdf([await bytesOf(file)], pageSize);
      setResultBytes(result); setOutputSize(result.byteLength); setIsSuccess(true);
      addRecent({ name: file.name, tool: "SVG to PDF", toolPath: "/svg-to-pdf", size: file.size });
    } catch (err: unknown) { setError((err as Error).message || "Conversion failed"); }
    finally { setIsProcessing(false); }
  };

  const download = () => { if (resultBytes) downloadBlob(resultBytes, `${file?.name.replace(".svg","") || "image"}.pdf`); };
  const reset = () => { setFile(null); setIsSuccess(false); setError(null); setResultBytes(null); };

  return (
    <div className="max-w-2xl mx-auto px-6 py-10 pb-24 md:pb-20">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center"><Code2 className="w-5 h-5 text-purple-600" /></div>
          <h1 className="text-2xl font-bold text-foreground">SVG → PDF</h1>
        </div>
        <p className="text-muted-foreground mb-8">Convert SVG vector files into a high-quality PDF document.</p>
        <div className="space-y-6">
          <div className={`rounded-2xl border-2 border-dashed transition-all cursor-pointer p-8 flex flex-col items-center gap-3 ${file?"border-primary/30 bg-primary/5":"border-border hover:border-primary/50 hover:bg-accent/20"}`} onClick={() => inputRef.current?.click()} data-testid="svg-dropzone">
            {file ? <><Code2 className="w-8 h-8 text-primary" /><p className="text-sm font-medium">{file.name}</p></> : <><Upload className="w-8 h-8 text-muted-foreground" /><p className="text-sm font-semibold text-foreground">Drop SVG file here</p><p className="text-xs text-muted-foreground">or click to browse</p></>}
          </div>
          <input ref={inputRef} type="file" accept=".svg,image/svg+xml" className="hidden" onChange={(e) => { if (e.target.files?.[0]) { setFile(e.target.files[0]); setIsSuccess(false); setError(null); setResultBytes(null); } }} />

          <ProcessingState isProcessing={isProcessing} isSuccess={isSuccess} error={error} label="Converting SVG to PDF..." outputSize={outputSize} downloadLabel="Download PDF" onDownload={download} onReset={reset} 
            resultBytes={resultBytes}
            resultName={`out-${file?.name||"output.pdf"}`}
            operationLabel="Processed"
          />

          {file && !isProcessing && !isSuccess && !error && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4 bg-card border border-border rounded-2xl p-5">
              <div className="space-y-2">
                <Label>Page size</Label>
                <div className="flex gap-2">
                  {(["fit","A4","Letter"] as const).map((s) => (
                    <button key={s} onClick={() => setPageSize(s)} className={`flex-1 py-2 rounded-xl border text-sm font-medium transition-colors ${pageSize===s?"border-primary bg-primary/5 text-primary":"border-border text-muted-foreground hover:border-primary/40"}`} data-testid={`size-${s}`}>{s==="fit"?"Fit to SVG":s}</button>
                  ))}
                </div>
              </div>
              <Button onClick={convert} className="w-full gap-2" data-testid="convert-svg-button"><Code2 className="w-4 h-4" /> Convert to PDF</Button>
            </motion.div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
