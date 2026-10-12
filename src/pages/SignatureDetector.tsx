import { useState } from "react";
import { motion } from "framer-motion";
import { PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import FileDropZone from "@/components/FileDropZone";
import { detectSignatures as detectSignaturesRust, bytesOf } from "@/lib/backend";


interface SigCandidate { page: number; region: string; confidence: number; x: number; y: number; w: number; h: number; }


export default function SignatureDetector() {
  const [file,setFile]=useState<File|null>(null);
  const [candidates,setCandidates]=useState<SigCandidate[]>([]);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState<string|null>(null);

  const analyze = async (f: File) => {
    setFile(f); setCandidates([]); setError(null); setLoading(true);
    try {
      const all: SigCandidate[] = await detectSignaturesRust(await bytesOf(f));
      setCandidates(all);
      if (!all.length) setError("No signature candidates detected.");
    } catch(e:unknown){setError((e as Error).message);}
    finally{setLoading(false);}
  };

  const reset=()=>{setFile(null);setCandidates([]);setError(null);};

  return (
    <div className="max-w-2xl mx-auto px-6 py-10 pb-24">
      <motion.div initial={{opacity:0,y:12}} animate={{opacity:1,y:0}}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center"><PenLine className="w-5 h-5 text-indigo-600"/></div>
          <h1 className="text-2xl font-bold">Signature Detector</h1>
        </div>
        <p className="text-muted-foreground mb-8">Detect probable signature regions in scanned PDFs using contour analysis.</p>
        <div className="space-y-5">
          <FileDropZone onFileSelect={analyze} selectedFile={file} onClear={reset}/>
          {loading && <p className="text-sm text-muted-foreground text-center py-4">Scanning for signatures…</p>}
          {error && <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">{error}</div>}
          {candidates.length>0 && (
            <div className="space-y-3">
              <p className="text-sm font-semibold">{candidates.length} signature candidate{candidates.length>1?"s":""} found</p>
              <div className="bg-card border border-border rounded-2xl divide-y divide-border overflow-hidden">
                <div className="px-4 py-2 bg-accent/30 grid grid-cols-4 text-xs font-semibold text-muted-foreground"><span>Page</span><span>Region</span><span>Size</span><span>Confidence</span></div>
                {candidates.map((c,i)=>(
                  <div key={i} className="px-4 py-3 grid grid-cols-4 text-sm items-center">
                    <span>{c.page}</span>
                    <span className="capitalize">{c.region}</span>
                    <span className="text-xs text-muted-foreground">{c.w}×{c.h}px</span>
                    <div className="flex items-center gap-2"><div className="h-1.5 flex-1 bg-accent rounded-full overflow-hidden"><div className="h-full bg-primary rounded-full" style={{width:`${c.confidence}%`}}/></div><span className="text-xs text-muted-foreground">{c.confidence}%</span></div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">Detection uses contour analysis. Results are estimates — verify manually.</p>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
