import { useState } from "react";
import { motion } from "framer-motion";
import { Link2, Copy, ExternalLink, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import FileDropZone from "@/components/FileDropZone";
import { extractLinks, bytesOf } from "@/lib/backend";


interface LinkItem { page: number; url: string; type: string; }

export default function LinkExtractor() {
  const [file,setFile]=useState<File|null>(null);
  const [links,setLinks]=useState<LinkItem[]>([]);
  const [filter,setFilter]=useState("");
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState<string|null>(null);

  const analyze = async (f: File) => {
    setFile(f); setLinks([]); setError(null); setLoading(true);
    try {
      const found: LinkItem[] = await extractLinks(await bytesOf(f));
      setLinks(found);
      if (!found.length) setError("No hyperlinks found in this PDF.");
    } catch(e:unknown){setError((e as Error).message);}
    finally{setLoading(false);}
  };

  const reset=()=>{setFile(null);setLinks([]);setError(null);};
  const filtered = links.filter(l=>!filter||l.url.toLowerCase().includes(filter.toLowerCase()));

  const exportCSV = () => {
    const csv = "Page,Type,URL\n"+filtered.map(l=>`${l.page},${l.type},"${l.url}"`).join("\n");
    const url=URL.createObjectURL(new Blob([csv],{type:"text/csv"})),a=document.createElement("a");
    a.href=url;a.download="links.csv";a.click();URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-2xl mx-auto px-6 py-10 pb-24">
      <motion.div initial={{opacity:0,y:12}} animate={{opacity:1,y:0}}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center"><Link2 className="w-5 h-5 text-blue-600"/></div>
          <h1 className="text-2xl font-bold">Link Extractor</h1>
        </div>
        <p className="text-muted-foreground mb-8">Extract all hyperlinks and URL annotations from a PDF.</p>
        <div className="space-y-5">
          <FileDropZone onFileSelect={analyze} selectedFile={file} onClear={reset}/>
          {loading && <p className="text-sm text-muted-foreground text-center py-4">Scanning {file?.name}…</p>}
          {error && <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-4 text-sm text-destructive">{error}</div>}
          {links.length>0 && (
            <div className="space-y-3">
              <div className="flex gap-2">
                <Input value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Filter links…" className="flex-1"/>
                <Button size="sm" variant="outline" onClick={exportCSV} className="gap-1"><Download className="w-3.5 h-3.5"/>CSV</Button>
                <Button size="sm" variant="outline" onClick={()=>navigator.clipboard.writeText(filtered.map(l=>l.url).join("\n"))} className="gap-1"><Copy className="w-3.5 h-3.5"/>Copy</Button>
              </div>
              <div className="bg-card border border-border rounded-2xl overflow-hidden divide-y divide-border max-h-96 overflow-y-auto">
                <div className="px-4 py-2 bg-accent/30 grid grid-cols-12 gap-2 text-xs font-semibold text-muted-foreground">
                  <span className="col-span-1">Page</span><span className="col-span-2">Type</span><span className="col-span-9">URL</span>
                </div>
                {filtered.map((l,i)=>(
                  <div key={i} className="px-4 py-2.5 grid grid-cols-12 gap-2 text-xs items-center hover:bg-accent/20">
                    <span className="col-span-1 text-muted-foreground">{l.page}</span>
                    <span className="col-span-2"><span className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded text-[10px]">{l.type}</span></span>
                    <div className="col-span-8 truncate font-mono text-[11px]">{l.url}</div>
                    <a href={l.url} target="_blank" rel="noreferrer" className="col-span-1 flex justify-end"><ExternalLink className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground"/></a>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">{filtered.length} / {links.length} links</p>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
