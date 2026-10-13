import { useState } from "react";
import { motion } from "framer-motion";
import * as pdfjs from "pdfjs-dist";
import { Type, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import FileDropZone from "@/components/FileDropZone";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface FontInfo { name: string; type: string; embedded: boolean; pages: number[]; }

export default function FontInspector() {
  const [file,setFile]=useState<File|null>(null);
  const [fonts,setFonts]=useState<FontInfo[]>([]);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState<string|null>(null);

  const analyze = async (f: File) => {
    setFile(f); setFonts([]); setError(null); setLoading(true);
    try {
      const doc = await pdfjs.getDocument({data:await f.arrayBuffer()}).promise;
      const map = new Map<string,FontInfo>();
      for (let i=1;i<=doc.numPages;i++) {
        const page = await doc.getPage(i);
        const ops = await page.getOperatorList();
        const tc = await page.getTextContent();
        const names = new Set<string>();
        tc.items.forEach((it:any)=>{ if(it.fontName) names.add(it.fontName); });
        names.forEach(name=>{
          const existing = map.get(name);
          if (existing) { if(!existing.pages.includes(i)) existing.pages.push(i); }
          else map.set(name,{name,type:"TrueType",embedded:name.includes("+"),pages:[i]});
        });
      }
      setFonts(Array.from(map.values()));
      if (!map.size) setError("No font information found.");
    } catch(e:unknown){setError((e as Error).message);}
    finally{setLoading(false);}
  };

  const reset=()=>{setFile(null);setFonts([]);setError(null);};
  const exportCSV=()=>{
    const csv="Font Name,Embedded,Pages\n"+fonts.map(f=>`"${f.name}",${f.embedded},"${f.pages.join(",")}"`).join("\n");
    const url=URL.createObjectURL(new Blob([csv],{type:"text/csv"})),a=document.createElement("a");a.href=url;a.download="fonts.csv";a.click();URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-2xl mx-auto px-6 py-10 pb-24">
      <motion.div initial={{opacity:0,y:12}} animate={{opacity:1,y:0}}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-pink-100 flex items-center justify-center"><Type className="w-5 h-5 text-pink-600"/></div>
          <h1 className="text-2xl font-bold">Font Inspector</h1>
        </div>
        <p className="text-muted-foreground mb-8">List all fonts used in a PDF — names, embedding status, and which pages.</p>
        <div className="space-y-5">
          <FileDropZone onFileSelect={analyze} selectedFile={file} onClear={reset}/>
          {loading && <p className="text-sm text-muted-foreground text-center py-4">Scanning fonts…</p>}
          {error && <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-4 text-sm text-destructive">{error}</div>}
          {fonts.length>0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">{fonts.length} font{fonts.length>1?"s":""} found</p>
                <Button size="sm" variant="outline" onClick={exportCSV} className="gap-1"><Download className="w-3.5 h-3.5"/>CSV</Button>
              </div>
              <div className="bg-card border border-border rounded-2xl overflow-hidden divide-y divide-border">
                <div className="px-4 py-2 bg-accent/30 grid grid-cols-12 gap-2 text-xs font-semibold text-muted-foreground">
                  <span className="col-span-6">Font Name</span><span className="col-span-2">Embedded</span><span className="col-span-4">Pages</span>
                </div>
                {fonts.map((f,i)=>(
                  <div key={i} className="px-4 py-2.5 grid grid-cols-12 gap-2 text-xs items-center">
                    <span className="col-span-6 font-mono truncate">{f.name.replace(/^[A-Z]{6}\+/,"")}</span>
                    <span className="col-span-2"><span className={`px-1.5 py-0.5 rounded text-[10px] ${f.embedded?"bg-green-100 text-green-700":"bg-red-100 text-red-700"}`}>{f.embedded?"Yes":"No"}</span></span>
                    <span className="col-span-4 text-muted-foreground truncate">{f.pages.slice(0,8).join(", ")}{f.pages.length>8?"…":""}</span>
                  </div>
                ))}
              </div>
              {fonts.filter(f=>!f.embedded).length>0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
                  ⚠ {fonts.filter(f=>!f.embedded).length} non-embedded font(s) — text may not display correctly on other devices.
                </div>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
