import { useState, useRef } from "react";
import { motion } from "framer-motion";
import { Smartphone, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ProcessingState from "@/components/ProcessingState";
import { useCurrentPdf } from "@/contexts/CurrentPdfContext";
import { imagesToPdf, bytesOf } from "@/lib/backend";

function downloadBlob(b: Uint8Array, n: string) { const url=URL.createObjectURL(new Blob([b.slice()],{type:"application/pdf"})),a=document.createElement("a");a.href=url;a.download=n;a.click();URL.revokeObjectURL(url); }

const PAGE_SIZES: Record<string,[number,number]> = { A4:[595,842], Letter:[612,792], Auto:[0,0] };

export default function HeicToPdf() {
  const [files,setFiles]=useState<File[]>([]);
  const [pageSize,setPageSize]=useState("A4");
  const [isProcessing,setIsProcessing]=useState(false);
  const [isSuccess,setIsSuccess]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [resultBytes,setResultBytes]=useState<Uint8Array|null>(null);
  const [outputSize,setOutputSize]=useState(0);
  const [progress,setProgress]=useState("");
  const inputRef=useRef<HTMLInputElement>(null);
  const { update: updatePdf } = useCurrentPdf();

  const addFiles=(fl: FileList) => {
    const heics=Array.from(fl).filter(f=>f.name.toLowerCase().match(/\.(heic|heif)$/)||f.type.includes("heic")||f.type.includes("heif"));
    setFiles(p=>[...p,...heics]);
  };

  const process = async () => {
    if (!files.length) return;
    setIsProcessing(true); setError(null);
    try {
      setProgress(`Converting ${files.length} file(s)…`);
      const result = await imagesToPdf(await Promise.all(files.map(f => bytesOf(f))), pageSize);
      setResultBytes(result); setOutputSize(result.byteLength); setIsSuccess(true);
      updatePdf({ bytes: result, name: "heic-converted.pdf" });
    } catch(e:unknown){setError((e as Error).message);}
    finally{setIsProcessing(false);setProgress("");}
  };

  const reset=()=>{setFiles([]);setIsSuccess(false);setError(null);setResultBytes(null);};

  return (
    <div className="max-w-2xl mx-auto px-6 py-10 pb-24">
      <motion.div initial={{opacity:0,y:12}} animate={{opacity:1,y:0}}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center"><Smartphone className="w-5 h-5 text-gray-600"/></div>
          <h1 className="text-2xl font-bold">HEIC to PDF</h1>
        </div>
        <p className="text-muted-foreground mb-8">Convert iPhone HEIC/HEIF photos to PDF. All processing is done in-browser.</p>
        <div className="space-y-5">
          <input ref={inputRef} type="file" accept=".heic,.heif,image/heic,image/heif" multiple className="hidden" onChange={e=>e.target.files&&addFiles(e.target.files)}/>
          {!files.length ? (
            <button onClick={()=>inputRef.current?.click()} className="w-full border-2 border-dashed border-border rounded-2xl p-12 text-center hover:border-primary transition-colors">
              <Smartphone className="w-10 h-10 mx-auto text-muted-foreground mb-3"/>
              <p className="text-sm font-medium">Click to select HEIC files</p>
              <p className="text-xs text-muted-foreground mt-1">Supports .heic and .heif from iPhone/iPad</p>
            </button>
          ) : null}
          <ProcessingState isProcessing={isProcessing} isSuccess={isSuccess} error={error} label={progress||"Converting HEIC files…"} outputSize={outputSize} downloadLabel="Download PDF" onDownload={()=>resultBytes&&downloadBlob(resultBytes,"heic-converted.pdf")} onReset={reset}/>
          {files.length>0 && !isProcessing && !isSuccess && !error && (
            <div className="space-y-4">
              <div className="bg-card border border-border rounded-2xl divide-y divide-border overflow-hidden max-h-56 overflow-y-auto">
                {files.map((f,i)=>(
                  <div key={i} className="flex items-center justify-between px-4 py-2.5">
                    <span className="text-sm truncate">{f.name}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground">{(f.size/1024/1024).toFixed(1)}MB</span>
                      <button onClick={()=>setFiles(p=>p.filter((_,j)=>j!==i))}><X className="w-4 h-4 text-muted-foreground hover:text-destructive"/></button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-3 items-center">
                <Button variant="outline" onClick={()=>inputRef.current?.click()} className="text-sm">Add more</Button>
                <div className="flex-1"><Label className="text-xs mb-1 block">Page Size</Label><Select value={pageSize} onValueChange={setPageSize}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="A4">A4</SelectItem><SelectItem value="Letter">Letter</SelectItem><SelectItem value="Auto">Auto (image size)</SelectItem></SelectContent></Select></div>
              </div>
              <Button onClick={process} className="w-full">Convert {files.length} file{files.length>1?"s":""} to PDF</Button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
