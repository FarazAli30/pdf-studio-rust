import { useState } from "react";
import { motion } from "framer-motion";
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import FileDropZone from "@/components/FileDropZone";
import ProcessingState from "@/components/ProcessingState";
import { useCurrentPdf } from "@/contexts/CurrentPdfContext";
import { dateStamp, bytesOf } from "@/lib/backend";

function downloadBlob(b: Uint8Array, n: string) { const url=URL.createObjectURL(new Blob([b.slice()],{type:"application/pdf"})),a=document.createElement("a");a.href=url;a.download=n;a.click();URL.revokeObjectURL(url); }

const FORMATS = [
  {v:"MM/DD/YYYY",label:"MM/DD/YYYY"},
  {v:"DD/MM/YYYY",label:"DD/MM/YYYY"},
  {v:"YYYY-MM-DD",label:"YYYY-MM-DD (ISO)"},
  {v:"MMMM D, YYYY",label:"Month D, YYYY"},
  {v:"custom",label:"Custom text"},
];

function formatDate(fmt: string, d: Date): string {
  const pad = (n:number)=>String(n).padStart(2,"0");
  const months=["January","February","March","April","May","June","July","August","September","October","November","December"];
  return fmt
    .replace("YYYY",String(d.getFullYear()))
    .replace("MM",pad(d.getMonth()+1))
    .replace("DD",pad(d.getDate()))
    .replace("MMMM",months[d.getMonth()])
    .replace("D",String(d.getDate()));
}

export default function DateStamp() {
  const [file,setFile]=useState<File|null>(null);
  const [format,setFormat]=useState("MM/DD/YYYY");
  const [customText,setCustomText]=useState("");
  const [position,setPosition]=useState("bottom-right");
  const [fontSize,setFontSize]=useState(10);
  const [opacity,setOpacity]=useState([0.7]);
  const [allPages,setAllPages]=useState(true);
  const [dateColor,setDateColor]=useState("#000000");
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
      const stamp = format==="custom" ? customText : formatDate(format, new Date());
      const result = await dateStamp(await bytesOf(file), { text: stamp, position, fontSize, opacity: opacity[0], color: dateColor, allPages });
      setResultBytes(result); setOutputSize(result.byteLength); setIsSuccess(true);
      updatePdf({ bytes: result, name: `dated-${file.name}` });
    } catch(e:unknown){setError((e as Error).message);}
    finally{setIsProcessing(false);}
  };

  const reset=()=>{setFile(null);setIsSuccess(false);setError(null);setResultBytes(null);};
  const preview = format==="custom" ? customText : formatDate(format,new Date());

  return (
    <div className="max-w-2xl mx-auto px-6 py-10 pb-24">
      <motion.div initial={{opacity:0,y:12}} animate={{opacity:1,y:0}}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center"><CalendarDays className="w-5 h-5 text-green-600"/></div>
          <h1 className="text-2xl font-bold">Date Stamp</h1>
        </div>
        <p className="text-muted-foreground mb-8">Overlay today's date or custom text on PDF pages.</p>
        <div className="space-y-5">
          <FileDropZone onFileSelect={f=>{setFile(f);setIsSuccess(false);setError(null);}} selectedFile={file} onClear={reset}/>
          <ProcessingState isProcessing={isProcessing} isSuccess={isSuccess} error={error} label="Stamping date..." outputSize={outputSize} downloadLabel="Download Stamped PDF" onDownload={()=>resultBytes&&downloadBlob(resultBytes,`dated-${file?.name}`)} onReset={()=>{setIsSuccess(false);setError(null);}}/>
          {file && !isProcessing && !isSuccess && !error && (
            <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><Label className="text-sm mb-1.5 block">Format</Label>
                  <Select value={format} onValueChange={setFormat}>
                    <SelectTrigger><SelectValue/></SelectTrigger>
                    <SelectContent>{FORMATS.map(f=><SelectItem key={f.v} value={f.v}>{f.label}</SelectItem>)}</SelectContent>
                  </Select>
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
              </div>
              {format==="custom" && <div><Label className="text-sm mb-1.5 block">Custom Text</Label><Input value={customText} onChange={e=>setCustomText(e.target.value)} placeholder="e.g. CONFIDENTIAL · 2025"/></div>}
              <div className="grid grid-cols-2 gap-4">
                <div><Label className="text-sm mb-1.5 block">Font Size ({fontSize}pt)</Label><Slider value={[fontSize]} onValueChange={v=>setFontSize(v[0])} min={6} max={36} step={1}/></div>
                <div><Label className="text-sm mb-1.5 block">Opacity ({Math.round(opacity[0]*100)}%)</Label><Slider value={opacity} onValueChange={setOpacity} min={0.1} max={1} step={0.05}/></div>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2"><Label className="text-sm">Color</Label><input type="color" value={dateColor} onChange={e=>setDateColor(e.target.value)} className="w-8 h-8 rounded border border-border cursor-pointer"/></div>
                <div className="flex items-center gap-2"><Label className="text-sm">All pages</Label><Switch checked={allPages} onCheckedChange={setAllPages}/></div>
              </div>
              <div className="text-xs text-muted-foreground bg-accent/40 rounded-lg p-3">Preview: <span className="font-mono font-semibold">{preview}</span></div>
              <Button onClick={process} className="w-full">Apply Date Stamp</Button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
