import { useState } from "react";
import { motion } from "framer-motion";
import { QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import FileDropZone from "@/components/FileDropZone";
import ProcessingState from "@/components/ProcessingState";
import { useCurrentPdf } from "@/contexts/CurrentPdfContext";
import { qrStamp, bytesOf } from "@/lib/backend";

function downloadBlob(b: Uint8Array, n: string) { const url=URL.createObjectURL(new Blob([b.slice()],{type:"application/pdf"})),a=document.createElement("a");a.href=url;a.download=n;a.click();URL.revokeObjectURL(url); }

export default function QRStamp() {
  const [file,setFile]=useState<File|null>(null);
  const [text,setText]=useState("");
  const [position,setPosition]=useState("bottom-right");
  const [size,setSize]=useState([80]);
  const [allPages,setAllPages]=useState(false);
  const [isProcessing,setIsProcessing]=useState(false);
  const [isSuccess,setIsSuccess]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [resultBytes,setResultBytes]=useState<Uint8Array|null>(null);
  const [outputSize,setOutputSize]=useState(0);
  const { update: updatePdf } = useCurrentPdf();

  const process = async () => {
    if (!file||!text.trim()) return;
    setIsProcessing(true); setError(null);
    try {
      const result = await qrStamp(await bytesOf(file), { text, position, size: size[0], allPages });
      setResultBytes(result); setOutputSize(result.byteLength); setIsSuccess(true);
      updatePdf({ bytes: result, name: `qr-${file.name}` });
    } catch(e:unknown){setError((e as Error).message);}
    finally{setIsProcessing(false);}
  };

  const reset=()=>{setFile(null);setIsSuccess(false);setError(null);setResultBytes(null);};

  return (
    <div className="max-w-2xl mx-auto px-6 py-10 pb-24">
      <motion.div initial={{opacity:0,y:12}} animate={{opacity:1,y:0}}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center"><QrCode className="w-5 h-5 text-slate-600"/></div>
          <h1 className="text-2xl font-bold">QR Code Stamp</h1>
        </div>
        <p className="text-muted-foreground mb-8">Generate a QR code and embed it on PDF pages. Requires internet.</p>
        <div className="space-y-5">
          <FileDropZone onFileSelect={f=>{setFile(f);setIsSuccess(false);setError(null);}} selectedFile={file} onClear={reset}/>
          <ProcessingState isProcessing={isProcessing} isSuccess={isSuccess} error={error} label="Generating & embedding QR…" outputSize={outputSize} downloadLabel="Download PDF with QR" onDownload={()=>resultBytes&&downloadBlob(resultBytes,`qr-${file?.name}`)} onReset={()=>{setIsSuccess(false);setError(null);}}/>
          {file && !isProcessing && !isSuccess && !error && (
            <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
              <div><Label className="text-sm mb-1.5 block">URL or Text</Label><Input value={text} onChange={e=>setText(e.target.value)} placeholder="https://example.com"/></div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label className="text-sm mb-1.5 block">Position</Label>
                  <Select value={position} onValueChange={setPosition}>
                    <SelectTrigger><SelectValue/></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bottom-right">Bottom Right</SelectItem>
                      <SelectItem value="bottom-left">Bottom Left</SelectItem>
                      <SelectItem value="top-right">Top Right</SelectItem>
                      <SelectItem value="top-left">Top Left</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label className="text-sm mb-1.5 block">Size ({size[0]}pt)</Label><Slider value={size} onValueChange={setSize} min={40} max={200} step={10} className="mt-3"/></div>
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-sm">Stamp all pages</Label>
                <Switch checked={allPages} onCheckedChange={setAllPages}/>
              </div>
              <Button onClick={process} disabled={!text.trim()} className="w-full">Embed QR Code</Button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
