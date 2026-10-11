import { useState } from "react";
import { motion } from "framer-motion";
import { PDFDocument } from "pdf-lib";
import * as pdfjs from "pdfjs-dist";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import FileDropZone from "@/components/FileDropZone";
import ProcessingState from "@/components/ProcessingState";
import { useCurrentPdf } from "@/contexts/CurrentPdfContext";

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
function downloadBlob(b: Uint8Array, n: string) { const url=URL.createObjectURL(new Blob([b.slice()],{type:"application/pdf"})),a=document.createElement("a");a.href=url;a.download=n;a.click();URL.revokeObjectURL(url); }

declare const cv: any;

async function waitForCV() { return new Promise<void>(res=>{ if(typeof cv!=="undefined"&&cv.Mat) res(); else { const t=setInterval(()=>{ if(typeof cv!=="undefined"&&cv.Mat){clearInterval(t);res();} },100); } }); }

async function detectSkewAngle(canvas: HTMLCanvasElement): Promise<number> {
  await waitForCV();
  const src = cv.imread(canvas);
  const gray = new cv.Mat();
  cv.cvtColor(src,gray,cv.COLOR_RGBA2GRAY);
  const blur = new cv.Mat();
  cv.GaussianBlur(gray,blur,new cv.Size(5,5),0);
  const edges = new cv.Mat();
  cv.Canny(blur,edges,50,150);
  const lines = new cv.Mat();
  cv.HoughLines(edges,lines,1,Math.PI/180,100);
  let totalAngle=0, count=0;
  for(let i=0;i<Math.min(lines.rows,50);i++){
    const theta=lines.data32F[i*2+1];
    const deg=(theta*180/Math.PI)-90;
    if(Math.abs(deg)<45){totalAngle+=deg;count++;}
  }
  [src,gray,blur,edges,lines].forEach(m=>m.delete());
  return count>0 ? totalAngle/count : 0;
}

async function deskewCanvas(src: HTMLCanvasElement, angle: number): Promise<HTMLCanvasElement> {
  await waitForCV();
  const mat = cv.imread(src);
  const center = new cv.Point(mat.cols/2,mat.rows/2);
  const M = cv.getRotationMatrix2D(center,-angle,1);
  const dst = new cv.Mat();
  cv.warpAffine(mat,dst,M,new cv.Size(mat.cols,mat.rows),cv.INTER_LINEAR,cv.BORDER_CONSTANT,new cv.Scalar(255,255,255,255));
  const out = document.createElement("canvas");
  cv.imshow(out,dst);
  [mat,M,dst].forEach(m=>m.delete());
  return out;
}

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
      const ab = await file.arrayBuffer();
      const pdfDoc = await pdfjs.getDocument({data:ab.slice(0)}).promise;
      const libDoc = await PDFDocument.load(ab);
      const angles: number[] = [];

      for (let i=0;i<pdfDoc.numPages;i++) {
        const page = await pdfDoc.getPage(i+1);
        const vp = page.getViewport({scale:1.5});
        const canvas = document.createElement("canvas");
        canvas.width=vp.width; canvas.height=vp.height;
        await page.render({ canvas: canvas, canvasContext: canvas.getContext("2d")!, viewport: vp }).promise;

        const angle = autoDetect ? await detectSkewAngle(canvas) : manualAngle[0];
        angles.push(angle);
        if (Math.abs(angle)<0.1) continue;

        const corrected = await deskewCanvas(canvas,angle);
        const jpeg = corrected.toDataURL("image/jpeg",0.92);
        const b64 = jpeg.split(",")[1];
        const bytes = Uint8Array.from(atob(b64),c=>c.charCodeAt(0));
        const img = await libDoc.embedJpg(bytes);
        const libPage = libDoc.getPage(i);
        const {width,height} = libPage.getSize();
        libPage.drawImage(img,{x:0,y:0,width,height});
      }
      setDetectedAngles(angles);
      const result = await libDoc.save();
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
