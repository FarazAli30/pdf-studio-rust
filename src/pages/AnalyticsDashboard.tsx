import { useState } from "react";
import { motion } from "framer-motion";
import * as pdfjs from "pdfjs-dist";
import { BarChart2 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, PieChart, Pie, Cell, ResponsiveContainer, Legend } from "recharts";
import FileDropZone from "@/components/FileDropZone";

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PageStat { page: number; words: number; images: number; fonts: number; }
interface DocStats { pageStats: PageStat[]; totalWords: number; totalImages: number; fontDist: { name: string; value: number }[]; imageDist: { name: string; value: number }[]; textDensityDist: { range: string; count: number }[]; }

const COLORS = ["#6366f1","#f59e0b","#10b981","#ef4444","#8b5cf6","#ec4899","#14b8a6","#f97316"];

async function computeStats(f: File): Promise<DocStats> {
  const doc = await pdfjs.getDocument({ data: await f.arrayBuffer() }).promise;
  const pageStats: PageStat[] = [];
  const fontMap = new Map<string, number>();
  const rawText = new TextDecoder("latin1").decode((await f.arrayBuffer()));
  const jpgCount = (rawText.match(/\/DCTDecode/g) || []).length;
  const pngCount = (rawText.match(/\/FlateDecode/gi) || []).length;
  const totalImgs = (rawText.match(/\/Subtype\s*\/Image/g) || []).length;

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    const words = tc.items.map((it: any) => it.str).join(" ").trim().split(/\s+/).filter(Boolean).length;
    const ops = await page.getOperatorList();
    const imgs = ops.fnArray.filter((f: number) => f === pdfjs.OPS.paintImageXObject || f === pdfjs.OPS.paintInlineImageXObject).length;
    const pageFonts = new Set<string>();
    tc.items.forEach((it: any) => { if (it.fontName) { pageFonts.add(it.fontName); fontMap.set(it.fontName, (fontMap.get(it.fontName) || 0) + 1); } });
    pageStats.push({ page: i, words, images: imgs, fonts: pageFonts.size });
  }

  const totalWords = pageStats.reduce((s, p) => s + p.words, 0);
  const fontDist = Array.from(fontMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, value]) => ({ name: name.replace(/^[A-Z]{6}\+/, "").slice(0, 16), value }));
  const imageDist = [{ name: "JPEG", value: jpgCount }, { name: "PNG", value: pngCount }, { name: "Other", value: Math.max(0, totalImgs - jpgCount - pngCount) }].filter(d => d.value > 0);
  const densities = pageStats.map(p => p.words);
  const maxD = Math.max(...densities, 1);
  const step = Math.ceil(maxD / 4);
  const buckets = Array.from({ length: 4 }, (_, i) => ({ range: `${i * step}–${(i + 1) * step}`, count: densities.filter(d => d >= i * step && d < (i + 1) * step).length }));

  return { pageStats, totalWords, totalImages: totalImgs, fontDist, imageDist, textDensityDist: buckets };
}

export default function AnalyticsDashboard() {
  const [file, setFile] = useState<File | null>(null);
  const [stats, setStats] = useState<DocStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analyze = async (f: File) => {
    setFile(f); setStats(null); setError(null); setLoading(true);
    try { setStats(await computeStats(f)); }
    catch (e: unknown) { setError((e as Error).message); }
    finally { setLoading(false); }
  };

  const reset = () => { setFile(null); setStats(null); setError(null); };

  return (
    <div className="max-w-3xl mx-auto px-6 py-10 pb-24">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center"><BarChart2 className="w-5 h-5 text-blue-600" /></div>
          <h1 className="text-2xl font-bold">Analytics Dashboard</h1>
        </div>
        <p className="text-muted-foreground mb-8">Visual charts of word count, images, fonts, and text density per page.</p>
        <div className="space-y-6">
          <FileDropZone onFileSelect={analyze} selectedFile={file} onClear={reset} />
          {loading && <p className="text-sm text-muted-foreground text-center py-8">Analysing {file?.name}…</p>}
          {error && <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-4 text-sm text-destructive">{error}</div>}
          {stats && (
            <div className="space-y-5">
              <div className="grid grid-cols-3 gap-4">
                {[["Pages", stats.pageStats.length], ["Total Words", stats.totalWords.toLocaleString()], ["Total Images", stats.totalImages]].map(([l, v]) => (
                  <div key={l} className="bg-card border border-border rounded-xl p-4 text-center">
                    <p className="text-2xl font-bold">{v}</p>
                    <p className="text-xs text-muted-foreground">{l}</p>
                  </div>
                ))}
              </div>

              <div className="bg-card border border-border rounded-2xl p-5">
                <p className="text-sm font-semibold mb-4">Words per Page</p>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={stats.pageStats}>
                    <XAxis dataKey="page" tick={{ fontSize: 10 }} label={{ value: "Page", position: "insideBottom", offset: -2, fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v) => [v, "words"]} labelFormatter={l => `Page ${l}`} />
                    <Bar dataKey="words" fill="#6366f1" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {stats.imageDist.length > 0 && (
                  <div className="bg-card border border-border rounded-2xl p-5">
                    <p className="text-sm font-semibold mb-4">Image Formats</p>
                    <ResponsiveContainer width="100%" height={150}>
                      <PieChart>
                        <Pie data={stats.imageDist} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={55} label={({ name, value }) => `${name}: ${value}`} labelLine={false} fontSize={10}>
                          {stats.imageDist.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
                {stats.fontDist.length > 0 && (
                  <div className="bg-card border border-border rounded-2xl p-5">
                    <p className="text-sm font-semibold mb-4">Top Fonts</p>
                    <ResponsiveContainer width="100%" height={150}>
                      <BarChart data={stats.fontDist} layout="vertical">
                        <XAxis type="number" tick={{ fontSize: 9 }} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} width={80} />
                        <Tooltip />
                        <Bar dataKey="value" fill="#f59e0b" radius={[0, 2, 2, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              <div className="bg-card border border-border rounded-2xl p-5">
                <p className="text-sm font-semibold mb-4">Images per Page</p>
                <ResponsiveContainer width="100%" height={120}>
                  <BarChart data={stats.pageStats}>
                    <XAxis dataKey="page" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v) => [v, "images"]} labelFormatter={l => `Page ${l}`} />
                    <Bar dataKey="images" fill="#10b981" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
