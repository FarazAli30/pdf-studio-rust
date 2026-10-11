import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeftRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import FileDropZone from "@/components/FileDropZone";
import ProcessingState from "@/components/ProcessingState";
import { useCurrentPdf } from "@/contexts/CurrentPdfContext";
import { reversePages, bytesOf } from "@/lib/backend";

function downloadBlob(b: Uint8Array, n: string) { const url=URL.createObjectURL(new Blob([b.slice()],{type:"application/pdf"})),a=document.createElement("a");a.href=url;a.download=n;a.click();URL.revokeObjectURL(url); }

export default function ReversePages() {
  const [file,setFile]=useState<File|null>(null);
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
      const result = await reversePages(await bytesOf(file));
      setResultBytes(result); setOutputSize(result.byteLength); setIsSuccess(true);
      updatePdf({ bytes: result, name: `reversed-${file.name}` });
    } catch(e:unknown){setError((e as Error).message);}
    finally{setIsProcessing(false);}
  };

  const reset=()=>{setFile(null);setIsSuccess(false);setError(null);setResultBytes(null);};

  return (
    <div className="max-w-2xl mx-auto px-6 py-10 pb-24">
      <motion.div initial={{opacity:0,y:12}} animate={{opacity:1,y:0}}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center"><ArrowLeftRight className="w-5 h-5 text-slate-600"/></div>
          <h1 className="text-2xl font-bold">Reverse Pages</h1>
        </div>
        <p className="text-muted-foreground mb-8">Flip the page order of a PDF — last page becomes first.</p>
        <div className="space-y-5">
          <FileDropZone onFileSelect={f=>{setFile(f);setIsSuccess(false);setError(null);}} selectedFile={file} onClear={reset}/>
          <ProcessingState isProcessing={isProcessing} isSuccess={isSuccess} error={error} label="Reversing pages..." outputSize={outputSize} downloadLabel="Download Reversed PDF" onDownload={()=>resultBytes&&downloadBlob(resultBytes,`reversed-${file?.name}`)} onReset={()=>{setIsSuccess(false);setError(null);}}/>
          {file && !isProcessing && !isSuccess && !error && (
            <div className="bg-card border border-border rounded-2xl p-5">
              <p className="text-sm text-muted-foreground mb-4">The page order will be completely reversed.</p>
              <Button onClick={process} className="w-full">Reverse Page Order</Button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
