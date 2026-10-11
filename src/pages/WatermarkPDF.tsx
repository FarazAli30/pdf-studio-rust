import { useState } from "react";
import { motion } from "framer-motion";
import { Stamp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCurrentPdf } from "@/contexts/CurrentPdfContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import FileDropZone from "@/components/FileDropZone";
import ProcessingState from "@/components/ProcessingState";
import { watermark, bytesOf } from "@/lib/backend";

function downloadBlob(bytes: Uint8Array, name: string) {
  const blob = new Blob([bytes.slice()], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}


export default function WatermarkPDF() {
  const { update: updatePdf } = useCurrentPdf();
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("CONFIDENTIAL");
  const [opacity, setOpacity] = useState([30]);
  const [fontSize, setFontSize] = useState([48]);
  const [color, setColor] = useState("#8b5cf6");
  const [angle, setAngle] = useState([45]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultBytes, setResultBytes] = useState<Uint8Array | null>(null);
  const [outputSize, setOutputSize] = useState(0);

  const addWatermark = async () => {
    if (!file || !text.trim()) return;
    setIsProcessing(true); setError(null); setIsSuccess(false);
    try {
      const result = await watermark(await bytesOf(file), { text, opacity: opacity[0], fontSize: fontSize[0], color, angle: angle[0] });
      setResultBytes(result); setOutputSize(result.byteLength); setIsSuccess(true);
    } catch (err: unknown) {
      setError((err as Error).message || "Failed to add watermark");
    } finally { setIsProcessing(false); }
  };

  const download = () => { if (resultBytes) downloadBlob(resultBytes, `watermarked-${file?.name || "output.pdf"}`); };
  const reset = () => { setFile(null); setIsSuccess(false); setError(null); setResultBytes(null); };

  return (
    <div className="max-w-2xl mx-auto px-6 py-10 pb-24 md:pb-10">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center">
            <Stamp className="w-5 h-5 text-rose-600" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Add Watermark</h1>
        </div>
        <p className="text-muted-foreground mb-8">Add a text watermark to every page of your PDF.</p>

        <div className="space-y-6">
          <FileDropZone onFileSelect={async (f) => { setFile(f); const _b = new Uint8Array(await f.arrayBuffer()); updatePdf({ bytes: _b, name: f.name, originalSize: f.size }); }} selectedFile={file} onClear={reset} />
          <ProcessingState isProcessing={isProcessing} isSuccess={isSuccess} error={error} label="Adding watermark..." outputSize={outputSize} downloadLabel="Download Watermarked PDF" onDownload={download} onReset={reset} 
            resultBytes={resultBytes}
            resultName={`out-${file?.name||"output.pdf"}`}
            operationLabel="Processed"
          />

          {file && !isProcessing && !isSuccess && !error && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5 bg-card border border-border rounded-2xl p-5">
              <div className="space-y-2">
                <Label htmlFor="watermark-text">Watermark text</Label>
                <Input id="watermark-text" value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. CONFIDENTIAL" data-testid="watermark-text-input" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Opacity: {opacity[0]}%</Label>
                  <Slider min={5} max={100} step={5} value={opacity} onValueChange={setOpacity} data-testid="opacity-slider" />
                </div>
                <div className="space-y-2">
                  <Label>Font size: {fontSize[0]}px</Label>
                  <Slider min={12} max={120} step={4} value={fontSize} onValueChange={setFontSize} data-testid="font-size-slider" />
                </div>
                <div className="space-y-2">
                  <Label>Angle: {angle[0]}°</Label>
                  <Slider min={-90} max={90} step={5} value={angle} onValueChange={setAngle} data-testid="angle-slider" />
                </div>
                <div className="space-y-2">
                  <Label>Color</Label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="w-10 h-10 rounded-lg border border-border cursor-pointer" data-testid="color-picker" />
                    <span className="text-sm text-muted-foreground font-mono">{color}</span>
                  </div>
                </div>
              </div>

              {/* Preview */}
              <div className="rounded-xl bg-accent/30 border border-border p-6 flex items-center justify-center min-h-[100px] relative overflow-hidden">
                <p
                  className="font-bold select-none pointer-events-none"
                  style={{
                    fontSize: Math.max(12, fontSize[0] * 0.4),
                    color,
                    opacity: opacity[0] / 100,
                    transform: `rotate(${angle[0]}deg)`,
                    letterSpacing: "0.05em",
                  }}
                >
                  {text || "Preview"}
                </p>
              </div>

              <Button onClick={addWatermark} disabled={!text.trim()} className="w-full gap-2" data-testid="add-watermark-button">
                <Stamp className="w-4 h-4" />
                Add Watermark
              </Button>
            </motion.div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
