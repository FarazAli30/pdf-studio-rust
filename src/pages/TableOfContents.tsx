import { useState } from "react";
import { motion } from "framer-motion";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist";
import { List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import FileDropZone from "@/components/FileDropZone";
import ProcessingState from "@/components/ProcessingState";
import { useRecent } from "@/contexts/RecentContext";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
function downloadBlob(bytes: Uint8Array, name: string) { const blob=new Blob([bytes.slice()],{type:"application/pdf"}),url=URL.createObjectURL(blob),a=document.createElement("a"); a.href=url; a.download=name; a.click(); URL.revokeObjectURL(url); }

interface TocEntry { text: string; page: number; level: number; }

async function detectHeadings(file: File): Promise<TocEntry[]> {
  const task = pdfjsLib.getDocument({ data: await file.arrayBuffer() });
  const doc = await task.promise;
  const entries: TocEntry[] = [];
  const seenTexts = new Set<string>();
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const { height } = page.getViewport({ scale: 1 });
    type RichItem = { str: string; transform: number[]; height: number };
    const items = content.items as RichItem[];
    const maxFontSize = items.reduce((m, i) => Math.max(m, i.height || 0), 0);
    for (const item of items) {
      const text = item.str.trim();
      if (!text || text.length < 3 || text.length > 120) continue;
      const fs = item.height || 0;
      if (fs < maxFontSize * 0.8) continue;
      const key = `${text.slice(0,30)}-${p}`;
      if (seenTexts.has(key)) continue;
      seenTexts.add(key);
      const level = fs >= maxFontSize * 0.95 ? 1 : fs >= maxFontSize * 0.85 ? 2 : 3;
      entries.push({ text, page: p, level });
    }
  }
  return entries.slice(0, 80);
}

export default function TableOfContents() {
  const [file, setFile] = useState<File | null>(null);
  const [entries, setEntries] = useState<TocEntry[]>([]);
  const [customTitle, setCustomTitle] = useState("Table of Contents");
  const [isDetecting, setIsDetecting] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultBytes, setResultBytes] = useState<Uint8Array | null>(null);
  const [outputSize, setOutputSize] = useState(0);
  const { addRecent } = useRecent();

  const handleFile = async (f: File) => {
    setFile(f); setEntries([]); setIsSuccess(false); setError(null); setResultBytes(null);
    setIsDetecting(true);
    try { setEntries(await detectHeadings(f)); } catch { setEntries([]); }
    finally { setIsDetecting(false); }
  };

  const toggleEntry = (i: number) => setEntries((prev) => prev.map((e, idx) => idx === i ? { ...e, _hidden: !("_hidden" in e && (e as TocEntry & {_hidden?:boolean})._hidden) } as TocEntry : e));

  const generate = async () => {
    if (!file || entries.length === 0) return;
    setIsProcessing(true); setError(null); setIsSuccess(false);
    try {
      const src = await PDFDocument.load(await file.arrayBuffer());
      const toc = await PDFDocument.create();
      const boldFont = await toc.embedFont(StandardFonts.HelveticaBold);
      const regFont = await toc.embedFont(StandardFonts.Helvetica);
      const pw = 595.28, ph = 841.89, m = 50;
      let tocPage = toc.addPage([pw, ph]);
      tocPage.drawRectangle({ x:0, y:0, width:pw, height:ph, color: rgb(1,1,1) });
      let y = ph - m;
      tocPage.drawText(customTitle, { x: m, y: y - 24, size: 20, font: boldFont, color: rgb(0.05,0.05,0.35) });
      y -= 50;
      tocPage.drawLine({ start:{x:m,y}, end:{x:pw-m,y}, thickness:0.5, color:rgb(0.8,0.8,0.9) });
      y -= 16;

      const visible = entries.filter(e => !(e as TocEntry & {_hidden?:boolean})._hidden);
      for (const entry of visible) {
        if (y < m + 20) { tocPage = toc.addPage([pw, ph]); tocPage.drawRectangle({ x:0,y:0,width:pw,height:ph,color:rgb(1,1,1) }); y = ph - m; }
        const indent = (entry.level - 1) * 20;
        const fs = entry.level === 1 ? 12 : entry.level === 2 ? 11 : 10;
        const font = entry.level === 1 ? boldFont : regFont;
        const col = entry.level === 1 ? rgb(0.05,0.05,0.35) : rgb(0.2,0.2,0.3);
        const truncated = entry.text.length > 60 ? entry.text.slice(0, 58) + "..." : entry.text;
        const pageStr = String(entry.page);
        const psWidth = regFont.widthOfTextAtSize(pageStr, 10);
        tocPage.drawText(truncated, { x: m + indent, y: y - fs, size: fs, font, color: col });
        tocPage.drawText(pageStr, { x: pw - m - psWidth, y: y - 10, size: 10, font: regFont, color: rgb(0.5,0.5,0.5) });
        const dotX = m + indent + font.widthOfTextAtSize(truncated, fs) + 8;
        const dotEnd = pw - m - psWidth - 8;
        if (dotEnd > dotX + 10) {
          const dots = ".".repeat(Math.floor((dotEnd - dotX) / regFont.widthOfTextAtSize(".", 8)));
          tocPage.drawText(dots, { x: dotX, y: y - 9, size: 8, font: regFont, color: rgb(0.7,0.7,0.7) });
        }
        y -= fs * 1.8;
      }

      const merged = await PDFDocument.create();
      const tocPages = await merged.copyPages(toc, toc.getPageIndices());
      tocPages.forEach(p => merged.addPage(p));
      const srcPages = await merged.copyPages(src, src.getPageIndices());
      srcPages.forEach(p => merged.addPage(p));
      const result = await merged.save();
      setResultBytes(result); setOutputSize(result.byteLength); setIsSuccess(true);
      addRecent({ name: file.name, tool: "Table of Contents", toolPath: "/table-of-contents", size: file.size });
    } catch (err: unknown) { setError((err as Error).message || "Failed to generate TOC"); }
    finally { setIsProcessing(false); }
  };

  const download = () => { if (resultBytes) downloadBlob(resultBytes, `toc-${file?.name || "output.pdf"}`); };
  const reset = () => { setFile(null); setEntries([]); setIsSuccess(false); setError(null); setResultBytes(null); };

  return (
    <div className="max-w-2xl mx-auto px-6 py-10 pb-24 md:pb-20">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center"><List className="w-5 h-5 text-orange-600" /></div>
          <h1 className="text-2xl font-bold text-foreground">Table of Contents</h1>
        </div>
        <p className="text-muted-foreground mb-8">Automatically generate a TOC page from detected headings and insert it at the beginning.</p>
        <div className="space-y-6">
          <FileDropZone onFileSelect={handleFile} selectedFile={file} onClear={reset} />

          {isDetecting && <div className="rounded-2xl border border-border bg-card p-5 flex items-center gap-3"><motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} className="w-4 h-4 rounded-full border-2 border-primary/30 border-t-primary" /><p className="text-sm text-muted-foreground">Detecting headings...</p></div>}

          <ProcessingState isProcessing={isProcessing} isSuccess={isSuccess} error={error} label="Generating TOC..." outputSize={outputSize} downloadLabel="Download PDF with TOC" onDownload={download} onReset={() => { setIsSuccess(false); setError(null); }} />

          {file && entries.length > 0 && !isDetecting && !isProcessing && !isSuccess && !error && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
              <div className="space-y-2"><Label>TOC page title</Label><Input value={customTitle} onChange={(e) => setCustomTitle(e.target.value)} data-testid="toc-title-input" /></div>
              <div className="bg-card border border-border rounded-2xl overflow-hidden">
                <div className="px-4 py-3 border-b border-border bg-accent/30 flex items-center justify-between">
                  <p className="text-sm font-semibold text-foreground">{entries.length} headings detected</p>
                  <p className="text-xs text-muted-foreground">Click to toggle visibility</p>
                </div>
                <div className="max-h-64 overflow-y-auto divide-y divide-border">
                  {entries.map((entry, i) => (
                    <button key={i} onClick={() => toggleEntry(i)} className={`w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-accent/30 transition-colors ${(entry as TocEntry & {_hidden?:boolean})._hidden ? "opacity-40" : ""}`} data-testid={`toc-entry-${i}`}>
                      <span className="text-xs text-muted-foreground w-12 flex-shrink-0">p.{entry.page}</span>
                      <span className="text-sm text-foreground truncate" style={{ marginLeft: `${(entry.level-1)*12}px`, fontWeight: entry.level === 1 ? 600 : 400 }}>{entry.text}</span>
                    </button>
                  ))}
                </div>
              </div>
              <Button onClick={generate} disabled={entries.filter(e => !(e as TocEntry & {_hidden?:boolean})._hidden).length === 0} className="w-full gap-2" data-testid="generate-toc-button"><List className="w-4 h-4" /> Insert TOC Page</Button>
            </motion.div>
          )}
          {file && entries.length === 0 && !isDetecting && (
            <div className="rounded-2xl border border-border bg-accent/20 p-6 text-center">
              <p className="text-sm text-muted-foreground">No headings detected. TOC works best with PDFs that have large-text headings.</p>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
