import { useState } from "react";
import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import FileDropZone from "@/components/FileDropZone";
import ProcessingState from "@/components/ProcessingState";
import { useCurrentPdf } from "@/contexts/CurrentPdfContext";
import { enhancePdf, bytesOf } from "@/lib/backend";

function downloadBlob(b: Uint8Array, n: string) { const url=URL.createObjectURL(new Blob([b.slice()],{type:"application/pdf"})),a=document.createElement("a");a.href=url;a.download=n;a.click();URL.revokeObjectURL(url); }


export default function EnhanceScan() {
  const [file,setFile]=useState<File|null>(null);
  const [denoise,setDenoise]=useState(true);
  const [sharpen,setSharpen]=useState(true);
  const [contrast,setContrast]=useState([1.3]);
  const [binarize,setBinarize]=useState(false);
  const [quality,setQuality]=useState([92]);
  const [isProcessing,setIsProcessing]=useState(false);
  const [isSuccess,setIsSuccess]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [resultBytes,setResultBytes]=useState<Uint8Array|null>(null);
  const [outputSize,setOutputSize]=useState(0);
  const { update: updatePdf } = useCurrentPdf();

  const process = async () => {
    if (!file) return;
    setIsProcessing(true); setError(null);
    try {
      const result = await enhancePdf(await bytesOf(file), { denoise, sharpen, contrast: contrast[0], binarize, quality: quality[0] });
      setResultBytes(result); setOutputSize(result.byteLength); setIsSuccess(true);
      updatePdf({ bytes: result, name: `enhanced-${file.name}` });
    } catch(e:unknown){setError((e as Error).message);}
    finally{setIsProcessing(false);}
  };

  const reset=()=>{setFile(null);setIsSuccess(false);setError(null);setResultBytes(null);};

  return (
    <div className="max-w-2xl mx-auto px-6 py-10 pb-24">
      <motion.div initial={{opacity:0,y:12}} animate={{opacity:1,y:0}}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center"><Sparkles className="w-5 h-5 text-amber-600"/></div>
          <h1 className="text-2xl font-bold">Enhance Scan</h1>
        </div>
        <p className="text-muted-foreground mb-8">Denoise, sharpen, and improve contrast on scanned PDF pages using OpenCV.</p>
        <div className="space-y-5">
          <FileDropZone onFileSelect={f=>{setFile(f);setIsSuccess(false);setError(null);}} selectedFile={file} onClear={reset}/>
          <ProcessingState isProcessing={isProcessing} isSuccess={isSuccess} error={error} label="Enhancing scan quality…" outputSize={outputSize} downloadLabel="Download Enhanced PDF" onDownload={()=>resultBytes&&downloadBlob(resultBytes,`enhanced-${file?.name}`)} onReset={()=>{setIsSuccess(false);setError(null);}}/>
          {file && !isProcessing && !isSuccess && !error && (
            <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
              {([["Denoise (Gaussian blur)",denoise,setDenoise],["Sharpen (Laplacian)",sharpen,setSharpen],["Binarize (adaptive threshold)",binarize,setBinarize]] as [string,boolean,(v:boolean)=>void][]).map(([l,v,s])=>(
                <div key={l} className="flex items-center justify-between"><Label className="text-sm">{l}</Label><Switch checked={v} onCheckedChange={s}/></div>
              ))}
              <div><Label className="text-sm mb-2 block">Contrast ({contrast[0].toFixed(1)}×)</Label><Slider value={contrast} onValueChange={setContrast} min={0.5} max={3} step={0.1}/></div>
              <div><Label className="text-sm mb-2 block">JPEG Quality ({quality[0]}%)</Label><Slider value={quality} onValueChange={setQuality} min={60} max={100} step={2}/></div>
              <div className="text-xs text-muted-foreground bg-accent/40 rounded-lg p-3">OpenCV processes each page. Text layer is replaced with processed image.</div>
              <Button onClick={process} className="w-full">Enhance All Pages</Button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
