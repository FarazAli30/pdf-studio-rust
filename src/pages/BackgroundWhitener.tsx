import { useState } from "react";
import { motion } from "framer-motion";
import { PDFDocument } from "pdf-lib";
import * as pdfjs from "pdfjs-dist";
import { Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import FileDropZone from "@/components/FileDropZone";
import ProcessingState from "@/components/ProcessingState";
import { useCurrentPdf } from "@/contexts/CurrentPdfContext";

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
function downloadBlob(b: Uint8Array, n: string) { const url=URL.createObjectURL(new Blob([b.slice()],{type:"application/pdf"})),a=document.createElement("a");a.href=url;a.download=n;a.click();URL.revokeObjectURL(url); }
declare const cv: any;
async function waitForCV() { return new Promise<void>(res=>{ if(typeof cv!=="undefined"&&cv.Mat) res(); else { const t=setInterval(()=>{ if(typeof cv!=="undefined"&&cv.Mat){clearInterval(t);res();} },100); } }); }

async function whitenBg(canvas: HTMLCanvasElement, mode: string, threshold: number): Promise<HTMLCanvasElement> {
  await waitForCV();
  let mat = cv.imread(canvas);
  const gray = new cv.Mat();
  cv.cvtColor(mat,gray,cv.COLOR_RGBA2GRAY);
  const result = new cv.Mat();
  if (mode==="adaptive") {
    cv.adaptiveThreshold(gray,result,255,cv.ADAPTIVE_THRESH_GAUSSIAN_C,cv.THRESH_BINARY,21,10);
  } else if (mode==="otsu") {
    cv.threshold(gray,result,0,255,cv.THRESH_BINARY+cv.THRESH_OTSU);
  } else {
    cv.threshold(gray,result,threshold,255,cv.THRESH_BINARY);
  }
  const rgba=new cv.Mat(); cv.cvtColor(result,rgba,cv.COLOR_GRAY2RGBA);
  [mat,gray,result].forEach(m=>m.delete());
  const out=document.createElement("canvas"); cv.imshow(out,rgba); rgba.delete();
  return out;
}

export default function BackgroundWhitener() {
  const [file,setFile]=useState<File|null>(null);
  const [mode,setMode]=useState("adaptive");
  const [threshold,setThreshold]=useState([180]);
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
      const ab = await file.arrayBuffer();
      const pdfDoc = await pdfjs.getDocument({data:ab.slice(0)}).promise;
      const libDoc = await PDFDocument.load(ab);
      for (let i=0;i<pdfDoc.numPages;i++) {
        const page = await pdfDoc.getPage(i+1);
        const vp = page.getViewport({scale:2});
        const canvas = document.createElement("canvas");
        canvas.width=vp.width; canvas.height=vp.height;
        await page.render({ canvas: canvas, canvasContext: canvas.getContext("2d")!, viewport: vp }).promise;
        const whitened = await whitenBg(canvas,mode,threshold[0]);
        const dataUrl = whitened.toDataURL("image/png");
        const bytes = Uint8Array.from(atob(dataUrl.split(",")[1]),c=>c.charCodeAt(0));
        const img = await libDoc.embedPng(bytes);
        const libPage = libDoc.getPage(i);
        const {width,height} = libPage.getSize();
        libPage.drawImage(img,{x:0,y:0,width,height});
      }
      const result = await libDoc.save();
      setResultBytes(result); setOutputSize(result.byteLength); setIsSuccess(true);
      updatePdf({ bytes: result, name: `whitened-${file.name}` });
    } catch(e:unknown){setError((e as Error).message);}
    finally{setIsProcessing(false);}
  };

  const reset=()=>{setFile(null);setIsSuccess(false);setError(null);setResultBytes(null);};

  return (
    <div className="max-w-2xl mx-auto px-6 py-10 pb-24">
      <motion.div initial={{opacity:0,y:12}} animate={{opacity:1,y:0}}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-yellow-100 flex items-center justify-center"><Sun className="w-5 h-5 text-yellow-600"/></div>
          <h1 className="text-2xl font-bold">Background Whitener</h1>
        </div>
        <p className="text-muted-foreground mb-8">Remove yellow/grey scanner background and make scanned pages crisp white-black.</p>
        <div className="space-y-5">
          <FileDropZone onFileSelect={f=>{setFile(f);setIsSuccess(false);setError(null);}} selectedFile={file} onClear={reset}/>
          <ProcessingState isProcessing={isProcessing} isSuccess={isSuccess} error={error} label="Whitening background…" outputSize={outputSize} downloadLabel="Download Whitened PDF" onDownload={()=>resultBytes&&downloadBlob(resultBytes,`whitened-${file?.name}`)} onReset={()=>{setIsSuccess(false);setError(null);}}/>
          {file && !isProcessing && !isSuccess && !error && (
            <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
              <div><Label className="text-sm mb-1.5 block">Threshold Method</Label>
                <Select value={mode} onValueChange={setMode}>
                  <SelectTrigger><SelectValue/></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="adaptive">Adaptive (best for uneven lighting)</SelectItem>
                    <SelectItem value="otsu">Otsu Auto (global)</SelectItem>
                    <SelectItem value="manual">Manual threshold</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {mode==="manual"&&<div><Label className="text-sm mb-2 block">Threshold ({threshold[0]})</Label><Slider value={threshold} onValueChange={setThreshold} min={100} max={240} step={5}/></div>}
              <div className="text-xs text-muted-foreground bg-accent/40 rounded-lg p-3">Converts pages to pure black-and-white. Best for text-only scans.</div>
              <Button onClick={process} className="w-full">Whiten Background</Button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
