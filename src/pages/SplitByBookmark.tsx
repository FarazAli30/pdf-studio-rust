import { useState } from "react";
import { motion } from "framer-motion";
import { Bookmark, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import FileDropZone from "@/components/FileDropZone";
import { readBookmarks, pdfInfo, splitByIndexRanges, bytesOf, type BookmarkNode } from "@/lib/backend";

function downloadBlob(b: Uint8Array, n: string) { const url=URL.createObjectURL(new Blob([b.slice()],{type:"application/pdf"})),a=document.createElement("a");a.href=url;a.download=n;a.click();URL.revokeObjectURL(url); }

interface BookmarkEntry { title: string; pageIndex: number; }

function flattenBookmarks(items: BookmarkNode[], out: BookmarkEntry[] = []): BookmarkEntry[] {
  for (const it of items) {
    if (it.pageIndex != null) out.push({ title: it.title || `Page ${it.pageIndex + 1}`, pageIndex: it.pageIndex });
    flattenBookmarks(it.children, out);
  }
  return out;
}

export default function SplitByBookmark() {
  const [file,setFile]=useState<File|null>(null);
  const [bookmarks,setBookmarks]=useState<BookmarkEntry[]>([]);
  const [loading,setLoading]=useState(false);
  const [splitting,setSplitting]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [done,setDone]=useState(false);

  const analyze = async (f: File) => {
    setFile(f); setBookmarks([]); setError(null); setLoading(true); setDone(false);
    try {
      const res = await readBookmarks(await bytesOf(f));
      const bm = flattenBookmarks(res.bookmarks).sort((a,b)=>a.pageIndex-b.pageIndex);
      setBookmarks(bm);
      if (!bm.length) setError("No bookmarks found in this PDF.");
    } catch(e:unknown){setError((e as Error).message);}
    finally{setLoading(false);}
  };

  const split = async () => {
    if (!file||!bookmarks.length) return;
    setSplitting(true); setError(null);
    try {
      const bytesIn = await bytesOf(file);
      const total = (await pdfInfo(bytesIn)).pageCount;
      for (let i=0;i<bookmarks.length;i++) {
        const bm = bookmarks[i];
        const start = bm.pageIndex;
        const end = i+1<bookmarks.length ? bookmarks[i+1].pageIndex : total;
        if (start>=end) continue;
        const [bytes] = await splitByIndexRanges(bytesIn, [[start, end-1]]);
        const safeName = bm.title.replace(/[^a-z0-9]/gi,"_").slice(0,40);
        downloadBlob(bytes,`${String(i+1).padStart(2,"0")}_${safeName}.pdf`);
        await new Promise(r=>setTimeout(r,200));
      }
      setDone(true);
    } catch(e:unknown){setError((e as Error).message);}
    finally{setSplitting(false);}
  };

  const reset=()=>{setFile(null);setBookmarks([]);setError(null);setDone(false);};

  return (
    <div className="max-w-2xl mx-auto px-6 py-10 pb-24">
      <motion.div initial={{opacity:0,y:12}} animate={{opacity:1,y:0}}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center"><Bookmark className="w-5 h-5 text-purple-600"/></div>
          <h1 className="text-2xl font-bold">Split by Bookmark</h1>
        </div>
        <p className="text-muted-foreground mb-8">Split a PDF into separate files at each top-level bookmark.</p>
        <div className="space-y-5">
          <FileDropZone onFileSelect={analyze} selectedFile={file} onClear={reset}/>
          {loading && <p className="text-sm text-muted-foreground text-center py-4">Reading bookmarks…</p>}
          {error && <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-4 text-sm text-destructive">{error}</div>}
          {done && <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-800 text-center">✓ {bookmarks.length} files downloaded</div>}
          {bookmarks.length>0 && !done && (
            <div className="space-y-3">
              <div className="bg-card border border-border rounded-2xl divide-y divide-border overflow-hidden max-h-72 overflow-y-auto">
                <div className="px-4 py-2 bg-accent/30 text-xs font-semibold text-muted-foreground flex justify-between"><span>Bookmark</span><span>Page</span></div>
                {bookmarks.map((bm,i)=>(
                  <div key={i} className="px-4 py-2.5 flex justify-between items-center text-sm">
                    <span className="truncate mr-4">{bm.title}</span>
                    <span className="text-muted-foreground text-xs shrink-0">{bm.pageIndex+1}</span>
                  </div>
                ))}
              </div>
              <Button onClick={split} disabled={splitting} className="w-full gap-2">
                <Download className="w-4 h-4"/>{splitting?"Splitting…":`Split into ${bookmarks.length} Files`}
              </Button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
