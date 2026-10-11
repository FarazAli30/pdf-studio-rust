import { useState } from "react";
import { motion } from "framer-motion";
import { Scaling } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import FileDropZone from "@/components/FileDropZone";
import ProcessingState from "@/components/ProcessingState";
import { useRecent } from "@/contexts/RecentContext";
import { resizePages, bytesOf } from "@/lib/backend";

function downloadBlob(b: Uint8Array, n: string) { const url=URL.createObjectURL(new Blob([b.slice()],{type:"application/pdf"})),a=document.createElement("a"); a.href=url; a.download=n; a.click(); URL.revokeObjectURL(url); }
function formatBytes(b: number) { const k=1024,s=["B","KB","MB","GB"],i=Math.floor(Math.log(b)/Math.log(k)); return `${parseFloat((b/Math.pow(k,i)).toFixed(1))} ${s[i]}`; }

const PAGE_SIZES: Record<string, [number, number]> = {
  A4: [595.28, 841.89], Letter: [612, 792], Legal: [612, 1008],
  A3: [841.89, 1190.55], A5: [419.53, 595.28], Custom: [0, 0],
};

type Orientation = "portrait" | "landscape";
type Align = "center" | "top-left" | "top-right" | "bottom-left" | "bottom-right";

interface PageSizeConfig {
  targetSize: string;
  customWidth: number;
  customHeight: number;
  orientation: Orientation;
  scaleContent: boolean;
  keepMargins: boolean;
  align: Align;
  preserveAspectRatio: boolean;
  dpi: number;
  normalizedCoordinates: boolean;
}

export default function PageSizeConverter() {
  const [file, setFile] = useState<File | null>(null);
  const [config, setConfig] = useState<PageSizeConfig>({
    targetSize: "A4", customWidth: 595, customHeight: 842,
    orientation: "portrait", scaleContent: true, keepMargins: true,
    align: "center", preserveAspectRatio: true, dpi: 72, normalizedCoordinates: true,
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultBytes, setResultBytes] = useState<Uint8Array | null>(null);
  const [outputSize, setOutputSize] = useState(0);
  const { addRecent } = useRecent();

  const upd = <K extends keyof PageSizeConfig>(k: K, v: PageSizeConfig[K]) => setConfig(p => ({ ...p, [k]: v }));

  const getTargetDims = (): [number, number] => {
    const base = config.targetSize === "Custom" ? [config.customWidth, config.customHeight] as [number, number] : PAGE_SIZES[config.targetSize];
    return config.orientation === "landscape" ? [Math.max(...base), Math.min(...base)] : [Math.min(...base), Math.max(...base)];
  };

  const convert = async () => {
    if (!file) return;
    setIsProcessing(true); setError(null);
    try {
      const [tw, th] = getTargetDims();
      const result = await resizePages(await bytesOf(file), { width: tw, height: th, scaleContent: config.scaleContent, keepMargins: config.keepMargins, align: config.align, preserveAspectRatio: config.preserveAspectRatio });
      setResultBytes(result); setOutputSize(result.byteLength); setIsSuccess(true);
      addRecent({ name: file.name, tool: "Page Size Converter", toolPath: "/page-size", size: file.size });
    } catch (err: unknown) { setError((err as Error).message || "Conversion failed"); }
    finally { setIsProcessing(false); }
  };

  const reset = () => { setFile(null); setIsSuccess(false); setError(null); setResultBytes(null); };

  return (
    <div className="max-w-2xl mx-auto px-6 py-10 pb-24 md:pb-20">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center"><Scaling className="w-5 h-5 text-purple-600" /></div>
          <h1 className="text-2xl font-bold text-foreground">Page Size Converter</h1>
        </div>
        <p className="text-muted-foreground mb-8">Convert pages between A4, Letter, Legal and custom sizes with content scaling.</p>
        <div className="space-y-6">
          <FileDropZone onFileSelect={f => { setFile(f); setIsSuccess(false); setError(null); setResultBytes(null); }} selectedFile={file} onClear={reset} />
          <ProcessingState isProcessing={isProcessing} isSuccess={isSuccess} error={error} label="Converting pages..." outputSize={outputSize} downloadLabel="Download Converted PDF" onDownload={() => resultBytes && downloadBlob(resultBytes, `resized-${file?.name || "output.pdf"}`)} onReset={() => { setIsSuccess(false); setError(null); }} />

          {file && !isProcessing && !isSuccess && !error && (
            <div className="bg-card border border-border rounded-2xl p-5 space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm mb-1.5 block">Target Size</Label>
                  <Select value={config.targetSize} onValueChange={v => upd("targetSize", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{Object.keys(PAGE_SIZES).map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-sm mb-1.5 block">Orientation</Label>
                  <Select value={config.orientation} onValueChange={v => upd("orientation", v as Orientation)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="portrait">Portrait</SelectItem><SelectItem value="landscape">Landscape</SelectItem></SelectContent>
                  </Select>
                </div>
              </div>

              {config.targetSize === "Custom" && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm mb-1.5 block">Width (pt)</Label>
                    <Input type="number" value={config.customWidth} onChange={e => upd("customWidth", Number(e.target.value))} />
                  </div>
                  <div>
                    <Label className="text-sm mb-1.5 block">Height (pt)</Label>
                    <Input type="number" value={config.customHeight} onChange={e => upd("customHeight", Number(e.target.value))} />
                  </div>
                </div>
              )}

              <div>
                <Label className="text-sm mb-1.5 block">Content Alignment</Label>
                <Select value={config.align} onValueChange={v => upd("align", v as Align)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="center">Center</SelectItem>
                    <SelectItem value="top-left">Top Left</SelectItem>
                    <SelectItem value="top-right">Top Right</SelectItem>
                    <SelectItem value="bottom-left">Bottom Left</SelectItem>
                    <SelectItem value="bottom-right">Bottom Right</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                {([
                  ["scaleContent", "Scale Content to Fit"],
                  ["keepMargins", "Keep Margins (36pt)"],
                  ["preserveAspectRatio", "Preserve Aspect Ratio"],
                ] as [keyof PageSizeConfig, string][]).map(([k, label]) => (
                  <div key={k} className="flex items-center justify-between">
                    <Label className="text-sm">{label}</Label>
                    <Switch checked={config[k] as boolean} onCheckedChange={v => upd(k, v)} />
                  </div>
                ))}
              </div>

              <div className="pt-1 text-xs text-muted-foreground">
                Target: {getTargetDims().map(v => v.toFixed(0)).join(" × ")} pt ({config.orientation})
              </div>

              <Button onClick={convert} className="w-full">Convert All Pages</Button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
