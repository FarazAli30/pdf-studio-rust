import { useState } from "react";
import { motion } from "framer-motion";
import { LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import FileDropZone from "@/components/FileDropZone";
import ProcessingState from "@/components/ProcessingState";
import { useCurrentPdf } from "@/contexts/CurrentPdfContext";
import { nupLayout, bytesOf } from "@/lib/backend";

function downloadBlob(b: Uint8Array, n: string) { const url=URL.createObjectURL(new Blob([b.slice()],{type:"application/pdf"})),a=document.createElement("a");a.href=url;a.download=n;a.click();URL.revokeObjectURL(url); }

const LAYOUTS: Record<string,{cols:number;rows:number;label:string}> = {
  "2":  {cols:2,rows:1,label:"2-up (2×1)"},
  "4":  {cols:2,rows:2,label:"4-up (2×2)"},
  "6":  {cols:3,rows:2,label:"6-up (3×2)"},
  "9":  {cols:3,rows:3,label:"9-up (3×3)"},
  "16": {cols:4,rows:4,label:"16-up (4×4)"},
};

export default function NupLayout() {
  const [file,setFile]=useState<File|null>(null);
  const [nup,setNup]=useState("4");
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
      const result = await nupLayout(await bytesOf(file), nup);
      setResultBytes(result); setOutputSize(result.byteLength); setIsSuccess(true);
      updatePdf({ bytes: result, name: `${nup}up-${file.name}` });
    } catch(e:unknown){setError((e as Error).message);}
    finally{setIsProcessing(false);}
  };

  const reset=()=>{setFile(null);setIsSuccess(false);setError(null);setResultBytes(null);};

  return (
    <div className="max-w-2xl mx-auto px-6 py-10 pb-24">
      <motion.div initial={{opacity:0,y:12}} animate={{opacity:1,y:0}}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center"><LayoutGrid className="w-5 h-5 text-indigo-600"/></div>
          <h1 className="text-2xl font-bold">N-up Layout</h1>
        </div>
        <p className="text-muted-foreground mb-8">Place multiple pages per sheet — 2, 4, 6, 9, or 16 per page.</p>
        <div className="space-y-5">
          <FileDropZone onFileSelect={f=>{setFile(f);setIsSuccess(false);setError(null);}} selectedFile={file} onClear={reset}/>
          <ProcessingState isProcessing={isProcessing} isSuccess={isSuccess} error={error} label="Building layout..." outputSize={outputSize} downloadLabel="Download N-up PDF" onDownload={()=>resultBytes&&downloadBlob(resultBytes,`${nup}up-${file?.name}`)} onReset={()=>{setIsSuccess(false);setError(null);}}/>
          {file && !isProcessing && !isSuccess && !error && (
            <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
              <div><Label className="text-sm mb-1.5 block">Layout</Label>
                <Select value={nup} onValueChange={setNup}>
                  <SelectTrigger><SelectValue/></SelectTrigger>
                  <SelectContent>{Object.entries(LAYOUTS).map(([k,v])=><SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <Button onClick={process} className="w-full">Apply {nup}-up Layout</Button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
