import { useState } from "react";
import { motion } from "framer-motion";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import FileDropZone from "@/components/FileDropZone";
import ProcessingState from "@/components/ProcessingState";
import { useCurrentPdf } from "@/contexts/CurrentPdfContext";
import { deskewPdf, bytesOf } from "@/lib/backend";

function downloadBlob(b: Uint8Array, n: string) { const url=URL.createObjectURL(new Blob([b.slice()],{type:"application/pdf"})),a=document.createElement("a");a.href=url;a.download=n;a.click();URL.revokeObjectURL(url); }




export default function DeskewPDF() {
  const [file,setFile]=useState<File|null>(null);
  const [autoDetect,setAutoDetect]=useState(true);
  const [manualAngle,setManualAngle]=useState([0]);
  const [isProcessing,setIsProcessing]=useState(false);
  const [isSuccess,setIsSuccess]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [resultBytes,setResultBytes]=useState<Uint8Array|null>(null);
  const [outputSize,setOutputSize]=useState(0);
  const [detectedAngles,setDetectedAngles]=useState<number[]>([]);
  const { update: updatePdf } = useCurrentPdf();

  const process = async () => {
    if (!file) return;
    setIsProcessing(true); setError(null);
    try {
      const { bytes: result, angles } = await deskewPdf(await bytesOf(file), autoDetect, manualAngle[0]);
      setDetectedAngles(angles);
      setResultBytes(result); setOutputSize(result.byteLength); setIsSuccess(true);
      updatePdf({ bytes: result, name: `deskewed-${file.name}` });
    } catch(e:unknown){setError((e as Error).message);}
    finally{setIsProcessing(false);}
  };

  const reset=()=>{setFile(null);setIsSuccess(false);setError(null);setResultBytes(null);setDetectedAngles([]);};

  return (
    <div className="max-w-2xl mx-auto px-6 py-10 pb-24">
      <motion.div initial={{opacity:0,y:12}} animate={{opacity:1,y:0}}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-sky-100 flex items-center justify-center"><RotateCcw className="w-5 h-5 text-sky-600"/></div>
          <h1 className="text-2xl font-bold">Auto Deskew</h1>
        </div>
        <p className="text-muted-foreground mb-8">Automatically detect and correct page rotation in scanned PDFs using OpenCV.</p>
        <div className="space-y-5">
          <FileDropZone onFileSelect={f=>{setFile(f);setIsSuccess(false);setError(null);}} selectedFile={file} onClear={reset}/>
          <ProcessingState isProcessing={isProcessing} isSuccess={isSuccess} error={error} label="Detecting & correcting skew…" outputSize={outputSize} downloadLabel="Download Deskewed PDF" onDownload={()=>resultBytes&&downloadBlob(resultBytes,`deskewed-${file?.name}`)} onReset={()=>{setIsSuccess(false);setError(null);}}/>
          {detectedAngles.length>0&&isSuccess&&<div className="bg-accent/50 rounded-xl p-3 text-xs text-muted-foreground">Detected angles: {detectedAngles.map((a,i)=>`p${i+1}: ${a.toFixed(2)}°`).join(" · ")}</div>}
          {file && !isProcessing && !isSuccess && !error && (
            <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between"><Label className="text-sm">Auto-detect angle (Hough transform)</Label><Switch checked={autoDetect} onCheckedChange={setAutoDetect}/></div>
              {!autoDetect&&<div><Label className="text-sm mb-2 block">Manual angle ({manualAngle[0]}°)</Label><Slider value={manualAngle} onValueChange={setManualAngle} min={-45} max={45} step={0.5}/></div>}
              <div className="text-xs text-muted-foreground bg-accent/40 rounded-lg p-3">Pages are re-rendered via OpenCV and embedded as JPEG. Text layer is replaced with image layer.</div>
              <Button onClick={process} className="w-full">Deskew PDF</Button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
