import { useState } from "react";
import { motion } from "framer-motion";
import { BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import FileDropZone from "@/components/FileDropZone";
import ProcessingState from "@/components/ProcessingState";
import { useCurrentPdf } from "@/contexts/CurrentPdfContext";
import { bookletImpose, bytesOf } from "@/lib/backend";

function downloadBlob(b: Uint8Array, n: string) { const url=URL.createObjectURL(new Blob([b.slice()],{type:"application/pdf"})),a=document.createElement("a");a.href=url;a.download=n;a.click();URL.revokeObjectURL(url); }

function bookletOrder(n: number): (number|null)[] {
  const total = Math.ceil(n/4)*4;
  const order: (number|null)[] = [];
  for (let i=0;i<total/2;i+=2) { order.push(total-1-i,i,i+1,total-2-i); }
  return order.map(v=>v!=null&&v<n?v:null);
}

export default function BookletImposition() {
  const [file,setFile]=useState<File|null>(null);
  const [binding,setBinding]=useState("left");
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
      const result = await bookletImpose(await bytesOf(file));
      setResultBytes(result); setOutputSize(result.byteLength); setIsSuccess(true);
      updatePdf({ bytes: result, name: `booklet-${file.name}` });
    } catch(e:unknown){setError((e as Error).message);}
    finally{setIsProcessing(false);}
  };

  const reset=()=>{setFile(null);setIsSuccess(false);setError(null);setResultBytes(null);};

  return (
    <div className="max-w-2xl mx-auto px-6 py-10 pb-24">
      <motion.div initial={{opacity:0,y:12}} animate={{opacity:1,y:0}}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center"><BookOpen className="w-5 h-5 text-amber-600"/></div>
          <h1 className="text-2xl font-bold">Booklet Imposition</h1>
        </div>
        <p className="text-muted-foreground mb-8">Reorder pages for saddle-stitch booklet printing — 2 pages per sheet.</p>
        <div className="space-y-5">
          <FileDropZone onFileSelect={f=>{setFile(f);setIsSuccess(false);setError(null);}} selectedFile={file} onClear={reset}/>
          <ProcessingState isProcessing={isProcessing} isSuccess={isSuccess} error={error} label="Imposing booklet..." outputSize={outputSize} downloadLabel="Download Booklet PDF" onDownload={()=>resultBytes&&downloadBlob(resultBytes,`booklet-${file?.name}`)} onReset={()=>{setIsSuccess(false);setError(null);}}/>
          {file && !isProcessing && !isSuccess && !error && (
            <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
              <div><Label className="text-sm mb-1.5 block">Binding</Label>
                <Select value={binding} onValueChange={setBinding}>
                  <SelectTrigger><SelectValue/></SelectTrigger>
                  <SelectContent><SelectItem value="left">Left binding</SelectItem><SelectItem value="right">Right binding</SelectItem></SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground bg-accent/40 rounded-lg p-3">Pages will be reordered and placed 2-up on landscape sheets. Print double-sided, fold, and staple in the centre.</p>
              <Button onClick={process} className="w-full">Create Booklet</Button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
