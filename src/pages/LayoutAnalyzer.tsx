import { useState } from "react";
import { motion } from "framer-motion";
import * as pdfjs from "pdfjs-dist";
import { Layout } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import FileDropZone from "@/components/FileDropZone";

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface Block { type: "header"|"paragraph"|"column"|"image"|"table"; x: number; y: number; w: number; h: number; text: string; }
interface PageLayout { page: number; columns: number; blocks: Block[]; }

function analyzeLayout(items: any[], vw: number, vh: number): PageLayout {
  if (!items.length) return { page: 1, columns: 1, blocks: [] };
  const sorted = [...items].sort((a: any, b: any) => b.transform[5] - a.transform[5]);
  const xPositions = items.map((it: any) => it.transform[4]);
  const xMid = vw / 2;
  const leftItems = xPositions.filter(x => x < xMid - 20).length;
  const rightItems = xPositions.filter(x => x > xMid + 20).length;
  const columns = leftItems > 5 && rightItems > 5 ? 2 : 1;
  const blocks: Block[] = [];
  let group: any[] = [];
  let lastY = sorted[0]?.transform[5] || 0;
  const flush = (grp: any[]) => {
    if (!grp.length) return;
    const txt = grp.map(it => it.str).join(" ").trim();
    if (!txt) return;
    const xs = grp.map(it => it.transform[4]);
    const ys = grp.map(it => it.transform[5]);
    const bx = Math.min(...xs), by = Math.min(...ys);
    const bw = Math.max(...xs) + (grp[0].width || 50) - bx;
    const bh = Math.max(...ys) - by + (grp[0].height || 12);
    const avgFontSize = grp.reduce((s, it) => s + (it.height || 12), 0) / grp.length;
    const type: Block["type"] = avgFontSize > 16 ? "header" : txt.length > 200 ? "paragraph" : columns === 2 ? "column" : "paragraph";
    blocks.push({ type, x: bx / vw, y: 1 - (by + bh) / vh, w: bw / vw, h: bh / vh, text: txt.slice(0, 80) });
  };
  for (const item of sorted) {
    if (Math.abs(item.transform[5] - lastY) > 20 && group.length) { flush(group); group = []; }
    group.push(item); lastY = item.transform[5];
  }
  flush(group);
  return { page: 1, columns, blocks: blocks.slice(0, 40) };
}

export default function LayoutAnalyzer() {
  const [file, setFile] = useState<File | null>(null);
  const [layouts, setLayouts] = useState<PageLayout[]>([]);
  const [selectedPage, setSelectedPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analyze = async (f: File) => {
    setFile(f); setLayouts([]); setError(null); setLoading(true);
    try {
      const doc = await pdfjs.getDocument({ data: await f.arrayBuffer() }).promise;
      const results: PageLayout[] = [];
      for (let i = 1; i <= Math.min(doc.numPages, 10); i++) {
        const page = await doc.getPage(i);
        const vp = page.getViewport({ scale: 1 });
        const tc = await page.getTextContent();
        const layout = analyzeLayout(tc.items as any[], vp.width, vp.height);
        layout.page = i;
        results.push(layout);
      }
      setLayouts(results);
    } catch (e: unknown) { setError((e as Error).message); }
    finally { setLoading(false); }
  };

  const reset = () => { setFile(null); setLayouts([]); setError(null); setSelectedPage(0); };
  const layout = layouts[selectedPage];
  const typeColors: Record<string, string> = { header: "bg-blue-100 border-blue-300 text-blue-800", paragraph: "bg-green-50 border-green-200", column: "bg-purple-50 border-purple-200", image: "bg-orange-50 border-orange-200", table: "bg-yellow-50 border-yellow-200" };

  return (
    <div className="max-w-3xl mx-auto px-6 py-10 pb-24">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-cyan-100 flex items-center justify-center"><Layout className="w-5 h-5 text-cyan-600" /></div>
          <h1 className="text-2xl font-bold">Layout Analyzer</h1>
        </div>
        <p className="text-muted-foreground mb-8">Detect document layout structure — columns, headers, paragraphs, and reading order.</p>
        <div className="space-y-5">
          <FileDropZone onFileSelect={analyze} selectedFile={file} onClear={reset} />
          {loading && <p className="text-sm text-muted-foreground text-center py-4">Analyzing layout…</p>}
          {error && <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-4 text-sm text-destructive">{error}</div>}
          {layouts.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                {layouts.length > 1 && (
                  <div className="flex-1"><Label className="text-sm mb-1.5 block">Page</Label>
                    <Select value={String(selectedPage)} onValueChange={v => setSelectedPage(Number(v))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{layouts.map((l, i) => <SelectItem key={i} value={String(i)}>Page {l.page}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                )}
                {layout && <div className="flex gap-2 pt-4"><span className="text-xs bg-accent px-2 py-1 rounded-full">{layout.columns}-column layout</span><span className="text-xs bg-accent px-2 py-1 rounded-full">{layout.blocks.length} blocks</span></div>}
              </div>
              {layout && (
                <div className="bg-card border border-border rounded-2xl overflow-hidden">
                  <div className="relative bg-white border border-border rounded-xl mx-4 my-4" style={{ aspectRatio: "0.7" }}>
                    {layout.blocks.map((b, i) => (
                      <div key={i} className={`absolute border text-[9px] overflow-hidden px-0.5 ${typeColors[b.type] || "bg-gray-50"}`}
                        style={{ left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: `${Math.max(b.w * 100, 5)}%`, height: `${Math.max(b.h * 100, 1.5)}%` }}
                        title={b.text}>
                        <span className="opacity-60 font-medium capitalize">{b.type}</span>
                      </div>
                    ))}
                  </div>
                  <div className="px-4 pb-4 flex flex-wrap gap-2">
                    {(["header", "paragraph", "column"] as const).map(t => (
                      <div key={t} className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-full border ${typeColors[t]}`}>
                        <span className="w-2 h-2 rounded-full bg-current opacity-50" />
                        <span className="capitalize">{t}</span>
                        <span className="font-semibold">×{layout.blocks.filter(b => b.type === t).length}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
