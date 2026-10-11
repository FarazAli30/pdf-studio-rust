import { useState, useRef } from "react";
import { motion } from "framer-motion";
import { PenLine, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import FileDropZone from "@/components/FileDropZone";
import ProcessingState from "@/components/ProcessingState";
import { useRecent } from "@/contexts/RecentContext";
import { useCurrentPdf } from "@/contexts/CurrentPdfContext";
import { cn } from "@/lib/utils";
import { signPdf, pdfInfo, bytesOf } from "@/lib/backend";

function downloadBlob(bytes: Uint8Array, name: string) { const blob=new Blob([bytes.slice()],{type:"application/pdf"}),url=URL.createObjectURL(blob),a=document.createElement("a"); a.href=url; a.download=name; a.click(); URL.revokeObjectURL(url); }

export default function SignPDF() {
  const [file, setFile] = useState<File | null>(null);
  const [sigFile, setSigFile] = useState<File | null>(null);
  const [sigPreview, setSigPreview] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [targetPage, setTargetPage] = useState("1");
  const [posX, setPosX] = useState([50]);
  const [posY, setPosY] = useState([30]);
  const [sigWidth, setSigWidth] = useState([150]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultBytes, setResultBytes] = useState<Uint8Array | null>(null);
  const [outputSize, setOutputSize] = useState(0);
  const sigInputRef = useRef<HTMLInputElement>(null);
  const { addRecent } = useRecent();
  const { update: updatePdf } = useCurrentPdf();

  const handlePdf = async (f: File) => {
    setFile(f); setIsSuccess(false); setError(null); setResultBytes(null);
    try { setPageCount((await pdfInfo(await bytesOf(f))).pageCount); } catch { setPageCount(0); }
  };

  const handleSig = (f: File) => {
    setSigFile(f);
    const reader = new FileReader();
    reader.onload = (e) => setSigPreview(e.target!.result as string);
    reader.readAsDataURL(f);
  };

  const sign = async () => {
    if (!file || !sigFile) return;
    setIsProcessing(true); setError(null); setIsSuccess(false);
    try {
      const result = await signPdf(await bytesOf(file), await bytesOf(sigFile), { page: parseInt(targetPage) || 1, posX: posX[0], posY: posY[0], width: sigWidth[0] });
      setResultBytes(result); setOutputSize(result.byteLength); setIsSuccess(true);
      addRecent({ name: file.name, tool: "Sign PDF", toolPath: "/sign-pdf", size: file.size });
    } catch (err: unknown) { setError((err as Error).message || "Failed to sign PDF"); }
    finally { setIsProcessing(false); }
  };

  const download = () => { if (resultBytes) downloadBlob(resultBytes, `signed-${file?.name || "output.pdf"}`); };
  const reset = () => { setFile(null); setSigFile(null); setSigPreview(null); setPageCount(0); setIsSuccess(false); setError(null); setResultBytes(null); };

  return (
    <div className="max-w-2xl mx-auto px-6 py-10 pb-24 md:pb-20">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center"><PenLine className="w-5 h-5 text-violet-600" /></div>
          <h1 className="text-2xl font-bold text-foreground">Sign PDF</h1>
        </div>
        <p className="text-muted-foreground mb-8">Insert a signature image onto a chosen page at a chosen position.</p>
        <div className="space-y-6">
          <div className="space-y-3">
            <p className="text-sm font-medium text-foreground">Step 1: Upload your PDF</p>
            <FileDropZone onFileSelect={handlePdf} selectedFile={file} onClear={reset} />
          </div>

          <div className="space-y-3">
            <p className="text-sm font-medium text-foreground">Step 2: Upload your signature</p>
            <div
              className={cn("rounded-2xl border-2 border-dashed transition-all cursor-pointer p-6 flex flex-col items-center gap-3", sigFile ? "border-primary/30 bg-primary/5" : "border-border hover:border-primary/50 hover:bg-accent/20")}
              onClick={() => sigInputRef.current?.click()} data-testid="sig-dropzone"
            >
              {sigPreview ? (
                <img src={sigPreview} alt="Signature preview" className="max-h-20 object-contain" />
              ) : (
                <><Upload className="w-8 h-8 text-muted-foreground" /><p className="text-sm text-muted-foreground">Upload signature image (PNG/JPG)</p></>
              )}
            </div>
            <input ref={sigInputRef} type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => { if (e.target.files?.[0]) handleSig(e.target.files[0]); }} />
          </div>

          <ProcessingState isProcessing={isProcessing} isSuccess={isSuccess} error={error} label="Inserting signature..." outputSize={outputSize} downloadLabel="Download Signed PDF" onDownload={download} onReset={reset} 
            resultBytes={resultBytes}
            resultName={`out-${file?.name||"output.pdf"}`}
            operationLabel="Processed"
          />

          {file && sigFile && !isProcessing && !isSuccess && !error && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4 bg-card border border-border rounded-2xl p-5">
              <p className="text-sm font-semibold text-foreground">Step 3: Position your signature</p>
              {pageCount > 1 && (
                <div className="space-y-2">
                  <Label>Page: 1 – {pageCount}</Label>
                  <Input type="number" min={1} max={pageCount} value={targetPage} onChange={(e) => setTargetPage(e.target.value)} className="w-24" data-testid="target-page-input" />
                </div>
              )}
              <div className="space-y-2"><Label>Horizontal position: {posX[0]}%</Label><Slider min={0} max={100} step={1} value={posX} onValueChange={setPosX} /></div>
              <div className="space-y-2"><Label>Vertical position: {posY[0]}% from bottom</Label><Slider min={0} max={100} step={1} value={posY} onValueChange={setPosY} /></div>
              <div className="space-y-2"><Label>Signature width: {sigWidth[0]}pt</Label><Slider min={50} max={400} step={10} value={sigWidth} onValueChange={setSigWidth} /></div>
              <Button onClick={sign} className="w-full gap-2" data-testid="sign-button"><PenLine className="w-4 h-4" /> Insert Signature</Button>
            </motion.div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
