import { useState } from "react";
import { motion } from "framer-motion";
import { Paperclip, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import FileDropZone from "@/components/FileDropZone";
import { useCurrentPdf } from "@/contexts/CurrentPdfContext";
import { listAttachments, bytesOf } from "@/lib/backend";

function downloadRaw(bytes: Uint8Array, name: string, mime="application/octet-stream") {
  const url=URL.createObjectURL(new Blob([bytes.buffer as ArrayBuffer],{type:mime})),a=document.createElement("a");a.href=url;a.download=name;a.click();URL.revokeObjectURL(url);
}

interface Attachment { name: string; size: number; bytes: Uint8Array; }

export default function AttachmentExtractor() {
  const [file,setFile]=useState<File|null>(null);
  const [attachments,setAttachments]=useState<Attachment[]>([]);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const { update: updatePdf } = useCurrentPdf();

  const analyze = async (f: File) => {
    setFile(f); setAttachments([]); setError(null); setLoading(true);
    try {
      const found: Attachment[] = await listAttachments(await bytesOf(f));
      setAttachments(found);
      if (found.length===0) setError("No embedded file attachments found in this PDF.");
    } catch(e:unknown){setError((e as Error).message);}
    finally{setLoading(false);}
  };

  const reset=()=>{setFile(null);setAttachments([]);setError(null);};
  const formatBytes=(b:number)=>{const k=1024,s=["B","KB","MB"],i=Math.floor(Math.log(b)/Math.log(k));return`${parseFloat((b/Math.pow(k,i)).toFixed(1))} ${s[i]}`;};

  return (
    <div className="max-w-2xl mx-auto px-6 py-10 pb-24">
      <motion.div initial={{opacity:0,y:12}} animate={{opacity:1,y:0}}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center"><Paperclip className="w-5 h-5 text-violet-600"/></div>
          <h1 className="text-2xl font-bold">Attachment Extractor</h1>
        </div>
        <p className="text-muted-foreground mb-8">Extract embedded file attachments from a PDF.</p>
        <div className="space-y-5">
          <FileDropZone onFileSelect={analyze} selectedFile={file} onClear={reset}/>
          {loading && <p className="text-sm text-muted-foreground text-center py-4">Scanning for attachments…</p>}
          {error && <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-4 text-sm text-destructive">{error}</div>}
          {attachments.length>0 && (
            <div className="bg-card border border-border rounded-2xl divide-y divide-border overflow-hidden">
              <div className="px-4 py-3 flex items-center justify-between">
                <p className="text-sm font-semibold">{attachments.length} attachment{attachments.length>1?"s":""} found</p>
                <Button size="sm" variant="outline" onClick={()=>attachments.forEach(a=>downloadRaw(a.bytes,a.name))} className="gap-1 text-xs"><Download className="w-3.5 h-3.5"/>All</Button>
              </div>
              {attachments.map((a,i)=>(
                <div key={i} className="flex items-center justify-between px-4 py-3">
                  <div><p className="text-sm font-medium">{a.name}</p><p className="text-xs text-muted-foreground">{formatBytes(a.size)}</p></div>
                  <Button size="sm" variant="ghost" onClick={()=>downloadRaw(a.bytes,a.name)} className="gap-1 text-xs"><Download className="w-3.5 h-3.5"/>Save</Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
