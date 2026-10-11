import { useState } from "react";
import { motion } from "framer-motion";
import { Hash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import FileDropZone from "@/components/FileDropZone";
import ProcessingState from "@/components/ProcessingState";
import { useCurrentPdf } from "@/contexts/CurrentPdfContext";
import { batesNumber, bytesOf } from "@/lib/backend";

function downloadBlob(b: Uint8Array, n: string) { const url=URL.createObjectURL(new Blob([b.slice()],{type:"application/pdf"})),a=document.createElement("a");a.href=url;a.download=n;a.click();URL.revokeObjectURL(url); }

export default function BatesNumbering() {
  const [file, setFile] = useState<File|null>(null);
  const [prefix, setPrefix] = useState("BATES-");
  const [start, setStart] = useState(1);
  const [padding, setPadding] = useState(6);
  const [position, setPosition] = useState("bottom-right");
  const [fontSize, setFontSize] = useState(9);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string|null>(null);
  const [resultBytes, setResultBytes] = useState<Uint8Array|null>(null);
  const [outputSize, setOutputSize] = useState(0);
  const { update: updatePdf } = useCurrentPdf();

  const process = async () => {
    if (!file) return;
    setIsProcessing(true); setError(null);
    try {
      const result = await batesNumber(await bytesOf(file), { prefix, start, padding, position, fontSize });
      setResultBytes(result); setOutputSize(result.byteLength); setIsSuccess(true);
      updatePdf({ bytes: result, name: `bates-${file.name}` });
    } catch(e: unknown) { setError((e as Error).message); }
    finally { setIsProcessing(false); }
  };

  const reset = () => { setFile(null); setIsSuccess(false); setError(null); setResultBytes(null); };

  return (
    <div className="max-w-2xl mx-auto px-6 py-10 pb-24">
      <motion.div initial={{opacity:0,y:12}} animate={{opacity:1,y:0}}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center"><Hash className="w-5 h-5 text-blue-600"/></div>
          <h1 className="text-2xl font-bold">Bates Numbering</h1>
        </div>
        <p className="text-muted-foreground mb-8">Stamp sequential legal Bates numbers on every page.</p>
        <div className="space-y-5">
          <FileDropZone onFileSelect={f=>{setFile(f);setIsSuccess(false);setError(null);}} selectedFile={file} onClear={reset}/>
          <ProcessingState isProcessing={isProcessing} isSuccess={isSuccess} error={error} label="Stamping Bates numbers..." outputSize={outputSize} downloadLabel="Download Bates PDF" onDownload={()=>resultBytes&&downloadBlob(resultBytes,`bates-${file?.name}`)} onReset={()=>{setIsSuccess(false);setError(null);}}/>
          {file && !isProcessing && !isSuccess && !error && (
            <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><Label className="text-sm mb-1.5 block">Prefix</Label><Input value={prefix} onChange={e=>setPrefix(e.target.value)} placeholder="BATES-"/></div>
                <div><Label className="text-sm mb-1.5 block">Start Number</Label><Input type="number" value={start} onChange={e=>setStart(Number(e.target.value))} min={0}/></div>
                <div><Label className="text-sm mb-1.5 block">Zero Padding</Label><Input type="number" value={padding} onChange={e=>setPadding(Number(e.target.value))} min={1} max={12}/></div>
                <div><Label className="text-sm mb-1.5 block">Font Size</Label><Input type="number" value={fontSize} onChange={e=>setFontSize(Number(e.target.value))} min={6} max={24}/></div>
              </div>
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
              <div className="text-xs text-muted-foreground bg-accent/40 rounded-lg p-3">Preview: <span className="font-mono font-semibold">{prefix}{String(start).padStart(padding,"0")}</span> → <span className="font-mono font-semibold">{prefix}{String(start+1).padStart(padding,"0")}</span> ...</div>
              <Button onClick={process} className="w-full">Apply Bates Numbers</Button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
