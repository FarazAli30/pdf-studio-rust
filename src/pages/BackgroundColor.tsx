import { useState } from "react";
import { motion } from "framer-motion";
import { Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import FileDropZone from "@/components/FileDropZone";
import ProcessingState from "@/components/ProcessingState";
import { useRecent } from "@/contexts/RecentContext";
import { useCurrentPdf } from "@/contexts/CurrentPdfContext";
import { backgroundColor, bytesOf } from "@/lib/backend";

function downloadBlob(bytes: Uint8Array, name: string) { const blob=new Blob([bytes.slice()],{type:"application/pdf"}),url=URL.createObjectURL(blob),a=document.createElement("a"); a.href=url; a.download=name; a.click(); URL.revokeObjectURL(url); }

const PRESETS = ["#ffffff","#f8f9fa","#fef9c3","#fce7f3","#ede9fe","#ecfdf5","#1e1e2e","#0f172a"];

export default function BackgroundColor() {
  const [file, setFile] = useState<File | null>(null);
  const [color, setColor] = useState("#ede9fe");
  const [opacity, setOpacity] = useState(15);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultBytes, setResultBytes] = useState<Uint8Array | null>(null);
  const [outputSize, setOutputSize] = useState(0);
  const { addRecent } = useRecent();
  const { update: updatePdf } = useCurrentPdf();

  const apply = async () => {
    if (!file) return;
    setIsProcessing(true); setError(null); setIsSuccess(false);
    try {
      const result = await backgroundColor(await bytesOf(file), color, opacity);
      setResultBytes(result); setOutputSize(result.byteLength); setIsSuccess(true);
      addRecent({ name: file.name, tool: "Background Color", toolPath: "/background-color", size: file.size });
    } catch (err: unknown) { setError((err as Error).message || "Failed to apply background"); }
    finally { setIsProcessing(false); }
  };

  const download = () => { if (resultBytes) downloadBlob(resultBytes, `bg-${file?.name || "output.pdf"}`); };
  const reset = () => { setFile(null); setIsSuccess(false); setError(null); setResultBytes(null); };

  return (
    <div className="max-w-2xl mx-auto px-6 py-10 pb-24 md:pb-20">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-fuchsia-100 flex items-center justify-center"><Palette className="w-5 h-5 text-fuchsia-600" /></div>
          <h1 className="text-2xl font-bold text-foreground">Background Color</h1>
        </div>
        <p className="text-muted-foreground mb-8">Add a color tint to page backgrounds. Useful for white PDFs displayed on dark themes.</p>
        <div className="space-y-6">
          <FileDropZone onFileSelect={async (f) => { setFile(f); const _b = new Uint8Array(await f.arrayBuffer()); updatePdf({ bytes: _b, name: f.name, originalSize: f.size }); }} selectedFile={file} onClear={reset} />
          <ProcessingState isProcessing={isProcessing} isSuccess={isSuccess} error={error} label="Applying background color..." outputSize={outputSize} downloadLabel="Download PDF" onDownload={download} onReset={reset} 
            resultBytes={resultBytes}
            resultName={`out-${file?.name||"output.pdf"}`}
            operationLabel="Processed"
          />

          {file && !isProcessing && !isSuccess && !error && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5 bg-card border border-border rounded-2xl p-5">
              <div className="space-y-3">
                <Label>Background color</Label>
                <div className="flex items-center gap-3">
                  <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="w-12 h-12 rounded-xl border border-border cursor-pointer" data-testid="color-picker" />
                  <div>
                    <p className="text-sm font-semibold font-mono">{color}</p>
                    <p className="text-xs text-muted-foreground">Click to pick any color</p>
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {PRESETS.map((p) => (
                    <button key={p} onClick={() => setColor(p)} title={p} className={`w-8 h-8 rounded-lg border-2 transition-all ${color===p?"border-primary scale-110":"border-border"}`} style={{ background: p }} data-testid={`preset-${p}`} />
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Opacity: {opacity}%</Label>
                <input type="range" min={5} max={100} step={5} value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} className="w-full accent-primary" data-testid="opacity-slider" />
                <p className="text-xs text-muted-foreground">Lower opacity preserves original content visibility.</p>
              </div>
              <div className="rounded-xl p-6 flex items-center justify-center border border-border relative overflow-hidden">
                <div className="absolute inset-0" style={{ background: color, opacity: opacity/100 }} />
                <div className="relative space-y-1.5 w-24">
                  {[4,5,3,4].map((w,i) => <div key={i} className="h-1.5 rounded bg-gray-400/60" style={{width:`${w*6}px`}} />)}
                </div>
              </div>
              <Button onClick={apply} className="w-full gap-2" data-testid="apply-bg-button"><Palette className="w-4 h-4" /> Apply Background</Button>
            </motion.div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
