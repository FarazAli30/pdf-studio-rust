import { useState, useRef } from "react";
import { motion } from "framer-motion";
import { FileText, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import ProcessingState from "@/components/ProcessingState";
import { useRecent } from "@/contexts/RecentContext";
import { useCurrentPdf } from "@/contexts/CurrentPdfContext";
import { txtToPdf } from "@/lib/backend";

function downloadBlob(bytes: Uint8Array, name: string) { const blob=new Blob([bytes.slice()],{type:"application/pdf"}),url=URL.createObjectURL(blob),a=document.createElement("a"); a.href=url; a.download=name; a.click(); URL.revokeObjectURL(url); }

export default function TxtToPdf() {
  const [file, setFile] = useState<File | null>(null);
  const [textContent, setTextContent] = useState("");
  const [mode, setMode] = useState<"file" | "paste">("file");
  const [fontSize, setFontSize] = useState([11]);
  const [margin, setMargin] = useState([40]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultBytes, setResultBytes] = useState<Uint8Array | null>(null);
  const [outputSize, setOutputSize] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const { addRecent } = useRecent();
  const { update: updatePdf } = useCurrentPdf();

  const handleFile = async (f: File) => {
    setFile(f); setIsSuccess(false); setError(null); setResultBytes(null);
    const text = await f.text();
    setTextContent(text);
  };

  const convert = async () => {
    const text = textContent.trim();
    if (!text) return;
    setIsProcessing(true); setError(null); setIsSuccess(false);
    try {
      const result = await txtToPdf(text, fontSize[0], margin[0]);
      setResultBytes(result); setOutputSize(result.byteLength); setIsSuccess(true);
      if (file) addRecent({ name: file.name, tool: "TXT to PDF", toolPath: "/txt-to-pdf", size: file.size });
    } catch (err: unknown) { setError((err as Error).message || "Conversion failed"); }
    finally { setIsProcessing(false); }
  };

  const download = () => { if (resultBytes) downloadBlob(resultBytes, `${file?.name.replace(".txt","") || "document"}.pdf`); };
  const reset = () => { setFile(null); setTextContent(""); setIsSuccess(false); setError(null); setResultBytes(null); };

  return (
    <div className="max-w-2xl mx-auto px-6 py-10 pb-24 md:pb-20">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center"><FileText className="w-5 h-5 text-slate-600" /></div>
          <h1 className="text-2xl font-bold text-foreground">TXT → PDF</h1>
        </div>
        <p className="text-muted-foreground mb-8">Convert plain text files or pasted text into a formatted PDF.</p>
        <div className="space-y-6">
          <div className="flex gap-2">
            {(["file","paste"] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)} className={`flex-1 py-2 rounded-xl border text-sm font-medium transition-colors ${mode===m?"border-primary bg-primary/5 text-primary":"border-border text-muted-foreground hover:border-primary/40"}`} data-testid={`mode-${m}`}>{m==="file"?"Upload .txt file":"Paste text"}</button>
            ))}
          </div>

          {mode === "file" ? (
            <div className={`rounded-2xl border-2 border-dashed transition-all cursor-pointer p-8 flex flex-col items-center gap-3 ${file?"border-primary/30 bg-primary/5":"border-border hover:border-primary/50 hover:bg-accent/20"}`} onClick={() => inputRef.current?.click()} data-testid="txt-dropzone">
              {file ? <><FileText className="w-8 h-8 text-primary" /><p className="text-sm font-medium">{file.name}</p></> : <><Upload className="w-8 h-8 text-muted-foreground" /><p className="text-sm font-medium text-foreground">Drop .txt file here</p></>}
            </div>
          ) : (
            <textarea value={textContent} onChange={(e) => setTextContent(e.target.value)} placeholder="Paste your text here..." className="w-full h-48 rounded-xl border border-border bg-background p-4 text-sm font-mono resize-none focus:outline-none focus:ring-1 focus:ring-primary" data-testid="paste-area" />
          )}
          <input ref={inputRef} type="file" accept=".txt,text/plain" className="hidden" onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />

          <ProcessingState isProcessing={isProcessing} isSuccess={isSuccess} error={error} label="Building PDF..." outputSize={outputSize} downloadLabel="Download PDF" onDownload={download} onReset={reset} 
            resultBytes={resultBytes}
            resultName={`out-${file?.name||"output.pdf"}`}
            operationLabel="Processed"
          />

          {(file || (mode==="paste" && textContent)) && !isProcessing && !isSuccess && !error && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4 bg-card border border-border rounded-2xl p-5">
              <div className="space-y-2"><Label>Font size: {fontSize[0]}pt</Label><Slider min={8} max={18} step={1} value={fontSize} onValueChange={setFontSize} /></div>
              <div className="space-y-2"><Label>Page margin: {margin[0]}pt</Label><Slider min={20} max={80} step={5} value={margin} onValueChange={setMargin} /></div>
              <Button onClick={convert} className="w-full gap-2" disabled={!textContent.trim()} data-testid="convert-txt-button"><FileText className="w-4 h-4" /> Convert to PDF</Button>
            </motion.div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
