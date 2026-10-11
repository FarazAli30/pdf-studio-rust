import { useState } from "react";
import { motion } from "framer-motion";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import FileDropZone from "@/components/FileDropZone";
import ProcessingState from "@/components/ProcessingState";
import { useCurrentPdf } from "@/contexts/CurrentPdfContext";
import { duplexPrep, bytesOf } from "@/lib/backend";

function downloadBlob(b: Uint8Array, n: string) { const url=URL.createObjectURL(new Blob([b.slice()],{type:"application/pdf"})),a=document.createElement("a");a.href=url;a.download=n;a.click();URL.revokeObjectURL(url); }

export default function DuplexPrep() {
  const [file,setFile]=useState<File|null>(null);
  const [mode,setMode]=useState("even");
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
      const result = await duplexPrep(await bytesOf(file), mode);
      setResultBytes(result); setOutputSize(result.byteLength); setIsSuccess(true);
      updatePdf({ bytes: result, name: `duplex-${file.name}` });
    } catch(e:unknown){setError((e as Error).message);}
    finally{setIsProcessing(false);}
  };

  const reset=()=>{setFile(null);setIsSuccess(false);setError(null);setResultBytes(null);};

  return (
    <div className="max-w-2xl mx-auto px-6 py-10 pb-24">
      <motion.div initial={{opacity:0,y:12}} animate={{opacity:1,y:0}}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-cyan-100 flex items-center justify-center"><Printer className="w-5 h-5 text-cyan-600"/></div>
          <h1 className="text-2xl font-bold">Duplex Print Prep</h1>
        </div>
        <p className="text-muted-foreground mb-8">Add blank pages to ensure correct double-sided printing alignment.</p>
        <div className="space-y-5">
          <FileDropZone onFileSelect={f=>{setFile(f);setIsSuccess(false);setError(null);}} selectedFile={file} onClear={reset}/>
          <ProcessingState isProcessing={isProcessing} isSuccess={isSuccess} error={error} label="Preparing for duplex..." outputSize={outputSize} downloadLabel="Download Prepared PDF" onDownload={()=>resultBytes&&downloadBlob(resultBytes,`duplex-${file?.name}`)} onReset={()=>{setIsSuccess(false);setError(null);}}/>
          {file && !isProcessing && !isSuccess && !error && (
            <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
              <div><Label className="text-sm mb-1.5 block">Print mode</Label>
                <Select value={mode} onValueChange={setMode}>
                  <SelectTrigger><SelectValue/></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="even">2-sided (pad to even pages)</SelectItem>
                    <SelectItem value="booklet">Booklet (pad to multiple of 4)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={process} className="w-full">Prepare for Duplex Print</Button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
