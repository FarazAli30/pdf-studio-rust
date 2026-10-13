import { useState } from "react";
import { motion } from "framer-motion";
import * as pdfjs from "pdfjs-dist";
import { Brain } from "lucide-react";
import { Button } from "@/components/ui/button";
import FileDropZone from "@/components/FileDropZone";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const CATEGORIES = [
  { label:"Invoice/Receipt", keywords:["invoice","receipt","total","amount due","subtotal","tax","billing","payment","bill to","due date","item","qty","unit price"], color:"bg-green-100 text-green-700" },
  { label:"Contract/Agreement", keywords:["agreement","contract","parties","terms","obligations","whereas","hereby","clause","signed","binding","effective date","party a","party b"], color:"bg-blue-100 text-blue-700" },
  { label:"Report", keywords:["report","summary","analysis","findings","conclusion","executive","quarterly","annual","performance","results","metrics","kpi"], color:"bg-purple-100 text-purple-700" },
  { label:"Form", keywords:["form","fill","check","signature","date of birth","full name","address","telephone","please print","applicant","application"], color:"bg-orange-100 text-orange-700" },
  { label:"ID / Certificate", keywords:["certificate","passport","license","identification","issued","expires","authority","holder","nationality","born"], color:"bg-yellow-100 text-yellow-700" },
  { label:"Letter / Correspondence", keywords:["dear","sincerely","regards","yours truly","to whom","re:","subject:","enclosed","attached","write to inform"], color:"bg-pink-100 text-pink-700" },
  { label:"Resume / CV", keywords:["experience","education","skills","objective","references","curriculum vitae","resume","employment","position","bachelor","master","degree"], color:"bg-teal-100 text-teal-700" },
  { label:"Manual / Guide", keywords:["installation","instructions","chapter","section","figure","step","procedure","warning","note","overview","table of contents","appendix"], color:"bg-slate-100 text-slate-700" },
];

function score(text: string): {label:string;score:number;color:string}[] {
  const lower = text.toLowerCase();
  return CATEGORIES.map(cat=>{
    const hits = cat.keywords.filter(k=>lower.includes(k)).length;
    return {label:cat.label,score:Math.min(100,Math.round((hits/cat.keywords.length)*100*2.5)),color:cat.color};
  }).sort((a,b)=>b.score-a.score);
}

export default function DocumentClassifier() {
  const [file,setFile]=useState<File|null>(null);
  const [results,setResults]=useState<{label:string;score:number;color:string}[]>([]);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [wordCount,setWordCount]=useState(0);

  const analyze = async (f: File) => {
    setFile(f); setResults([]); setError(null); setLoading(true);
    try {
      const doc = await pdfjs.getDocument({data:await f.arrayBuffer()}).promise;
      let text = "";
      for (let i=1;i<=Math.min(doc.numPages,5);i++) {
        const page = await doc.getPage(i);
        const tc = await page.getTextContent();
        text += tc.items.map((it:any)=>it.str).join(" ")+" ";
      }
      setWordCount(text.trim().split(/\s+/).length);
      setResults(score(text));
    } catch(e:unknown){setError((e as Error).message);}
    finally{setLoading(false);}
  };

  const reset=()=>{setFile(null);setResults([]);setError(null);setWordCount(0);};
  const top = results[0];

  return (
    <div className="max-w-2xl mx-auto px-6 py-10 pb-24">
      <motion.div initial={{opacity:0,y:12}} animate={{opacity:1,y:0}}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center"><Brain className="w-5 h-5 text-violet-600"/></div>
          <h1 className="text-2xl font-bold">Document Classifier</h1>
        </div>
        <p className="text-muted-foreground mb-8">AI-powered document type detection — invoice, contract, report, form, ID, letter, resume, or manual.</p>
        <div className="space-y-5">
          <FileDropZone onFileSelect={analyze} selectedFile={file} onClear={reset}/>
          {loading && <p className="text-sm text-muted-foreground text-center py-4">Analysing document content…</p>}
          {error && <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-4 text-sm text-destructive">{error}</div>}
          {results.length>0 && (
            <div className="space-y-4">
              {top&&top.score>0&&(
                <div className="bg-card border-2 border-primary/20 rounded-2xl p-5 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Most likely</p>
                  <span className={`text-lg font-bold px-4 py-1 rounded-full ${top.color}`}>{top.label}</span>
                  <p className="text-sm text-muted-foreground mt-2">{top.score}% confidence · {wordCount.toLocaleString()} words analysed</p>
                </div>
              )}
              <div className="bg-card border border-border rounded-2xl overflow-hidden">
                {results.map((r,i)=>(
                  <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-0">
                    <span className="text-sm w-44 shrink-0">{r.label}</span>
                    <div className="flex-1 h-2 bg-accent rounded-full overflow-hidden"><div className="h-full bg-primary rounded-full transition-all" style={{width:`${r.score}%`}}/></div>
                    <span className="text-xs text-muted-foreground w-10 text-right">{r.score}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
