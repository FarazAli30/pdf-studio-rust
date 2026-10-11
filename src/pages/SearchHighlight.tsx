import { useState } from "react";
import { motion } from "framer-motion";
import { PDFDocument, rgb } from "pdf-lib";
import * as pdfjs from "pdfjs-dist";
import { TextSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import FileDropZone from "@/components/FileDropZone";
import ProcessingState from "@/components/ProcessingState";
import { useCurrentPdf } from "@/contexts/CurrentPdfContext";

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
function downloadBlob(b: Uint8Array, n: string) { const url=URL.createObjectURL(new Blob([b.slice()],{type:"application/pdf"})),a=document.createElement("a");a.href=url;a.download=n;a.click();URL.revokeObjectURL(url); }

export default function SearchHighlight() {
  const [file,setFile]=useState<File|null>(null);
  const [query,setQuery]=useState("");
  const [hlColor,setHlColor]=useState("#FFFF00");
  const [caseSensitive,setCaseSensitive]=useState(false);
  const [matchCount,setMatchCount]=useState(0);
  const [isProcessing,setIsProcessing]=useState(false);
  const [isSuccess,setIsSuccess]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [resultBytes,setResultBytes]=useState<Uint8Array|null>(null);
  const [outputSize,setOutputSize]=useState(0);
  const { update: updatePdf } = useCurrentPdf();

  const process = async () => {
    if (!file||!query.trim()) return;
    setIsProcessing(true); setError(null); setMatchCount(0);
    try {
      const ab = await file.arrayBuffer();
      const pdfjsDoc = await pdfjs.getDocument({data:ab.slice(0)}).promise;
      const libDoc = await PDFDocument.load(ab);
      const [r,g,b] = hlColor.match(/\w\w/g)!.map(v=>parseInt(v,16)/255);
      let total = 0;

      for (let pi=0;pi<pdfjsDoc.numPages;pi++) {
        const page = await pdfjsDoc.getPage(pi+1);
        const vp = page.getViewport({scale:1});
        const tc = await page.getTextContent();
        const libPage = libDoc.getPage(pi);
        const {height:ph} = libPage.getSize();
        const scaleX = libPage.getSize().width / vp.width;
        const scaleY = ph / vp.height;

        tc.items.forEach((item:any) => {
          if (!item.str) return;
          const haystack = caseSensitive ? item.str : item.str.toLowerCase();
          const needle = caseSensitive ? query : query.toLowerCase();
          if (!haystack.includes(needle)) return;
          const [,, ,, tx, ty] = item.transform;
          const x = tx * scaleX;
          const y = ph - ty * scaleY - item.height * scaleY;
          const w = item.width * scaleX;
          const h = item.height * scaleY;
          libPage.drawRectangle({x,y,width:w,height:h,color:rgb(r,g,b),opacity:0.45});
          total++;
        });
      }

      setMatchCount(total);
      if (total===0) { setError(`No matches found for "${query}"`); setIsProcessing(false); return; }
      const result = await libDoc.save();
      setResultBytes(result); setOutputSize(result.byteLength); setIsSuccess(true);
      updatePdf({ bytes: result, name: `highlighted-${file.name}` });
    } catch(e:unknown){setError((e as Error).message);}
    finally{setIsProcessing(false);}
  };

  const reset=()=>{setFile(null);setIsSuccess(false);setError(null);setResultBytes(null);setMatchCount(0);};

  return (
    <div className="max-w-2xl mx-auto px-6 py-10 pb-24">
      <motion.div initial={{opacity:0,y:12}} animate={{opacity:1,y:0}}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-yellow-100 flex items-center justify-center"><TextSearch className="w-5 h-5 text-yellow-600"/></div>
          <h1 className="text-2xl font-bold">Search & Highlight</h1>
        </div>
        <p className="text-muted-foreground mb-8">Find all occurrences of text and permanently highlight them in the PDF.</p>
        <div className="space-y-5">
          <FileDropZone onFileSelect={f=>{setFile(f);setIsSuccess(false);setError(null);}} selectedFile={file} onClear={reset}/>
          <ProcessingState isProcessing={isProcessing} isSuccess={isSuccess} error={error} label="Searching & highlighting…" outputSize={outputSize} downloadLabel="Download Highlighted PDF" onDownload={()=>resultBytes&&downloadBlob(resultBytes,`highlighted-${file?.name}`)} onReset={()=>{setIsSuccess(false);setError(null);}}/>
          {file && !isProcessing && !isSuccess && !error && (
            <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
              <div><Label className="text-sm mb-1.5 block">Search Text</Label>
                <Input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Enter search term…" onKeyDown={e=>e.key==="Enter"&&process()}/>
              </div>
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2"><Label className="text-sm">Highlight Color</Label><input type="color" value={hlColor} onChange={e=>setHlColor(e.target.value)} className="w-8 h-8 rounded border border-border cursor-pointer"/></div>
                <div className="flex items-center gap-2"><Label className="text-sm">Case Sensitive</Label><Switch checked={caseSensitive} onCheckedChange={setCaseSensitive}/></div>
              </div>
              <Button onClick={process} disabled={!query.trim()} className="w-full">Highlight All Matches</Button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
