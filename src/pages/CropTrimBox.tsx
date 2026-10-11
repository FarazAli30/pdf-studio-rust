import { useState } from "react";
import { motion } from "framer-motion";
import { Crop } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import FileDropZone from "@/components/FileDropZone";
import ProcessingState from "@/components/ProcessingState";
import { useCurrentPdf } from "@/contexts/CurrentPdfContext";
import { cropPdf, bytesOf } from "@/lib/backend";

function downloadBlob(b: Uint8Array, n: string) { const url=URL.createObjectURL(new Blob([b.slice()],{type:"application/pdf"})),a=document.createElement("a");a.href=url;a.download=n;a.click();URL.revokeObjectURL(url); }

export default function CropTrimBox() {
  const [file,setFile]=useState<File|null>(null);
  const [top,setTop]=useState(0); const [bottom,setBottom]=useState(0);
  const [left,setLeft]=useState(0); const [right,setRight]=useState(0);
  const [boxType,setBoxType]=useState("crop");
  const [allPages,setAllPages]=useState(true);
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
      const result = await cropPdf(await bytesOf(file), { top, bottom, left, right, boxType, allPages });
      setResultBytes(result); setOutputSize(result.byteLength); setIsSuccess(true);
      updatePdf({ bytes: result, name: `cropped-${file.name}` });
    } catch(e:unknown){setError((e as Error).message);}
    finally{setIsProcessing(false);}
  };

  const reset=()=>{setFile(null);setIsSuccess(false);setError(null);setResultBytes(null);};

  return (
    <div className="max-w-2xl mx-auto px-6 py-10 pb-24">
      <motion.div initial={{opacity:0,y:12}} animate={{opacity:1,y:0}}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center"><Crop className="w-5 h-5 text-rose-600"/></div>
          <h1 className="text-2xl font-bold">Crop / Trim Box</h1>
        </div>
        <p className="text-muted-foreground mb-8">Set CropBox, TrimBox, BleedBox, or MediaBox margins on PDF pages.</p>
        <div className="space-y-5">
          <FileDropZone onFileSelect={f=>{setFile(f);setIsSuccess(false);setError(null);}} selectedFile={file} onClear={reset}/>
          <ProcessingState isProcessing={isProcessing} isSuccess={isSuccess} error={error} label="Cropping pages…" outputSize={outputSize} downloadLabel="Download Cropped PDF" onDownload={()=>resultBytes&&downloadBlob(resultBytes,`cropped-${file?.name}`)} onReset={()=>{setIsSuccess(false);setError(null);}}/>
          {file && !isProcessing && !isSuccess && !error && (
            <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><Label className="text-sm mb-1.5 block">Box Type</Label>
                  <Select value={boxType} onValueChange={setBoxType}>
                    <SelectTrigger><SelectValue/></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="crop">CropBox (visible area)</SelectItem>
                      <SelectItem value="trim">TrimBox (final trim)</SelectItem>
                      <SelectItem value="bleed">BleedBox (print bleed)</SelectItem>
                      <SelectItem value="media">MediaBox (physical)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between pt-5"><Label className="text-sm">All pages</Label><Switch checked={allPages} onCheckedChange={setAllPages}/></div>
              </div>
              <p className="text-xs text-muted-foreground">Margins to cut from each edge (in points, 1pt = 0.353mm)</p>
              <div className="grid grid-cols-2 gap-3">
                {([["Top",top,setTop],["Bottom",bottom,setBottom],["Left",left,setLeft],["Right",right,setRight]] as [string,number,(v:number)=>void][]).map(([l,v,s])=>(
                  <div key={l}><Label className="text-xs mb-1 block">{l} (pt)</Label><Input type="number" value={v} onChange={e=>s(Number(e.target.value))} min={0}/></div>
                ))}
              </div>
              <Button onClick={process} className="w-full">Apply {boxType.charAt(0).toUpperCase()+boxType.slice(1)}Box</Button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
