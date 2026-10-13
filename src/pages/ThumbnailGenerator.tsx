import { useState, useRef } from "react";
import { motion } from "framer-motion";
import * as pdfjs from "pdfjs-dist";
import { Grid2x2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import FileDropZone from "@/components/FileDropZone";
import { renderPages, toDataUrl, bytesOf } from "@/lib/backend";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export default function ThumbnailGenerator() {
  const [file,setFile]=useState<File|null>(null);
  const [thumbs,setThumbs]=useState<string[]>([]);
  const [scale,setScale]=useState([0.25]);
  const [loading,setLoading]=useState(false);
  const [progress,setProgress]=useState(0);

  const generate = async (f: File, sc: number) => {
    setLoading(true); setProgress(0); setThumbs([]);
    try {
      const rendered = await renderPages(await bytesOf(f), { scale: sc, format: "jpeg", quality: 85 });
      const results: string[] = rendered.map(r => toDataUrl(r.bytes, "image/jpeg"));
      setProgress(100);
      setThumbs(results);
    } finally { setLoading(false); }
  };

  const handleFile = async (f: File) => { setFile(f); await generate(f, scale[0]); };
  const reset=()=>{setFile(null);setThumbs([]);setProgress(0);};

  const downloadAll=()=>{
    thumbs.forEach((t,i)=>{
      const a=document.createElement("a"); a.href=t; a.download=`page-${i+1}.jpg`; a.click();
    });
  };
  const downloadOne=(t:string,i:number)=>{const a=document.createElement("a");a.href=t;a.download=`page-${i+1}.jpg`;a.click();};

  return (
    <div className="max-w-4xl mx-auto px-6 py-10 pb-24">
      <motion.div initial={{opacity:0,y:12}} animate={{opacity:1,y:0}}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-teal-100 flex items-center justify-center"><Grid2x2 className="w-5 h-5 text-teal-600"/></div>
          <h1 className="text-2xl font-bold">Thumbnail Generator</h1>
        </div>
        <p className="text-muted-foreground mb-8">Render every page as a preview image. Download individually or all at once.</p>
        <div className="space-y-5">
          <FileDropZone onFileSelect={handleFile} selectedFile={file} onClear={reset}/>
          {file && !loading && thumbs.length===0 && (
            <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
              <div><Label className="text-sm mb-2 block">Scale ({Math.round(scale[0]*100)}%)</Label>
                <Slider value={scale} onValueChange={v=>{setScale(v);}} min={0.1} max={1} step={0.05}/>
              </div>
              <Button onClick={()=>generate(file,scale[0])} className="w-full">Generate Thumbnails</Button>
            </div>
          )}
          {loading && <div className="bg-card border border-border rounded-xl p-4 text-center"><p className="text-sm text-muted-foreground mb-2">Rendering pages… {progress}%</p><div className="h-1.5 bg-accent rounded-full overflow-hidden"><div className="h-full bg-primary transition-all" style={{width:`${progress}%`}}/></div></div>}
          {thumbs.length>0 && !loading && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">{thumbs.length} pages rendered</p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={()=>file&&generate(file,scale[0])} className="text-xs">Re-render</Button>
                  <Button size="sm" onClick={downloadAll} className="gap-1 text-xs"><Download className="w-3.5 h-3.5"/>All JPGs</Button>
                </div>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
                {thumbs.map((t,i)=>(
                  <div key={i} className="group relative cursor-pointer rounded-lg overflow-hidden border border-border hover:border-primary transition-colors bg-white" onClick={()=>downloadOne(t,i)}>
                    <img src={t} alt={`Page ${i+1}`} className="w-full block"/>
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center"><Download className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition-opacity"/></div>
                    <div className="absolute bottom-1 left-0 right-0 text-center text-[10px] text-white/90 font-medium drop-shadow">{i+1}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
