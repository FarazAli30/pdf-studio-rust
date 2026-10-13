import { useState } from "react";
import { motion } from "framer-motion";
import { PDFDocument } from "pdf-lib";
import * as pdfjs from "pdfjs-dist";
import { Info, ShieldOff, FlaskConical, BarChart3, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import FileDropZone from "@/components/FileDropZone";
import ProcessingState from "@/components/ProcessingState";
import { useRecent } from "@/contexts/RecentContext";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

function downloadBlob(b: Uint8Array, n: string) { const url=URL.createObjectURL(new Blob([b.slice()],{type:"application/pdf"})),a=document.createElement("a"); a.href=url; a.download=n; a.click(); URL.revokeObjectURL(url); }
function formatBytes(b: number) { if(!b)return"0 B"; const k=1024,s=["B","KB","MB","GB"],i=Math.floor(Math.log(b)/Math.log(k)); return `${parseFloat((b/Math.pow(k,i)).toFixed(1))} ${s[i]}`; }

interface PdfInfo { pages: number; title: string; author: string; subject: string; keywords: string; creator: string; producer: string; creationDate: string; modDate: string; fileSize: number; pdfVersion: string; encrypted: boolean; tagged: boolean; linearized: boolean; }
interface ForensicInfo { revisions: number; hasJavaScript: boolean; hasEmbeddedFiles: boolean; hasRedactions: boolean; hasAcroForm: boolean; hasForms: boolean; rawExcerpt: string; }

interface TextStats { words: number; characters: number; sentences: number; paragraphs: number; detectedLanguages: string[]; }
interface ImageStats { imageCount: number; imageFormats: Record<string, number>; largestImage: string; estimatedDPI: number; }
interface FontStats { fontNames: string[]; embeddedFonts: string[]; fontTypes: Record<string, number>; }
interface GraphicsStats { vectorShapes: number; paths: number; fills: number; strokes: number; }
interface TableStats { detectedTables: number; estimatedRows: number; estimatedColumns: number; }
interface AnnotationStats { highlights: number; comments: number; links: number; formFields: number; }
interface PerPageInfo { pageIndex: number; width: number; height: number; rotation: number; textDensity: number; imageCount: number; fontCount: number; }

interface Analytics {
  text: TextStats;
  images: ImageStats;
  fonts: FontStats;
  graphics: GraphicsStats;
  tables: TableStats;
  annotations: AnnotationStats;
  perPage: PerPageInfo[];
}

function detectLanguage(text: string): string[] {
  const langs: string[] = [];
  if (/[а-яА-Я]/.test(text)) langs.push("Russian");
  if (/[äöüÄÖÜß]/.test(text)) langs.push("German");
  if (/[àâçéèêëïîôùûü]/.test(text)) langs.push("French");
  if (/[áéíóúüñ¿¡]/.test(text)) langs.push("Spanish");
  if (/[\u4e00-\u9fff]/.test(text)) langs.push("Chinese");
  if (/[\u3040-\u30ff]/.test(text)) langs.push("Japanese");
  if (/[\uAC00-\uD7AF]/.test(text)) langs.push("Korean");
  if (/[\u0600-\u06FF]/.test(text)) langs.push("Arabic");
  if (langs.length === 0 && /[a-zA-Z]/.test(text)) langs.push("English");
  return langs;
}

function parseForensics(bytes: ArrayBuffer): ForensicInfo {
  const text = new TextDecoder("latin1").decode(bytes);
  const revisions = (text.match(/\/Prev\s+\d+/g) || []).length + 1;
  const hasJavaScript = /\/JavaScript|\/JS\s*\(/i.test(text);
  const hasEmbeddedFiles = /\/EmbeddedFile/i.test(text);
  const hasRedactions = /\/Redact/i.test(text);
  const hasAcroForm = /\/AcroForm/i.test(text);
  const hasForms = /\/Widget/i.test(text);
  const versionMatch = text.match(/%PDF-(\d+\.\d+)/);
  const rawExcerpt = versionMatch ? text.slice(0, 200) : "";
  return { revisions, hasJavaScript, hasEmbeddedFiles, hasRedactions, hasAcroForm, hasForms, rawExcerpt };
}

async function computeAnalytics(f: File): Promise<Analytics> {
  const ab = await f.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: ab.slice(0) }).promise;
  let allText = "";
  const fontNames = new Set<string>();
  const embeddedFonts = new Set<string>();
  const fontTypes: Record<string, number> = {};
  const imageFormats: Record<string, number> = {};
  let totalImages = 0;
  let largestImage = "";
  let largestSize = 0;
  let totalVectors = 0, totalPaths = 0, totalFills = 0, totalStrokes = 0;
  let totalHighlights = 0, totalComments = 0, totalLinks = 0, totalFormFields = 0;
  const perPage: PerPageInfo[] = [];

  const rawText = new TextDecoder("latin1").decode(ab);
  const imgMatches = rawText.match(/\/Subtype\s*\/Image/g) || [];
  totalImages = imgMatches.length;
  const jpgCount = (rawText.match(/\/DCTDecode/g) || []).length;
  const pngCount = (rawText.match(/\/FlateDecode/g) || []).length;
  const jbig2Count = (rawText.match(/\/JBIG2Decode/g) || []).length;
  if (jpgCount) imageFormats["JPEG"] = jpgCount;
  if (pngCount) imageFormats["PNG/Deflate"] = pngCount;
  if (jbig2Count) imageFormats["JBIG2"] = jbig2Count;
  totalVectors = (rawText.match(/\d+\.?\d*\s+\d+\.?\d*\s+m\b/g) || []).length;
  totalPaths = (rawText.match(/\b[Ss]\b|\bCS\b/g) || []).length;
  totalFills = (rawText.match(/\bf\b|\bF\b|\bf\*\b/g) || []).length;
  totalStrokes = (rawText.match(/\bS\b|\bs\b/g) || []).length;

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    const pageText = tc.items.map((item: any) => item.str).join(" ");
    allText += pageText + "\n";
    const pageFonts = new Set<string>();
    tc.items.forEach((item: any) => { if (item.fontName) pageFonts.add(item.fontName); });
    pageFonts.forEach(fn => fontNames.add(fn));

    const annots = await page.getAnnotations();
    annots.forEach((a: any) => {
      if (a.subtype === "Highlight") totalHighlights++;
      else if (a.subtype === "Text" || a.subtype === "FreeText") totalComments++;
      else if (a.subtype === "Link") totalLinks++;
      else if (a.subtype === "Widget") totalFormFields++;
    });

    const ops = await page.getOperatorList();
    let pageImages = 0;
    ops.fnArray.forEach((fn: number) => {
      if (fn === pdfjs.OPS.paintImageXObject || fn === pdfjs.OPS.paintInlineImageXObject) pageImages++;
    });

    perPage.push({
      pageIndex: i - 1, width: Math.round(vp.width), height: Math.round(vp.height),
      rotation: page.rotate || 0,
      textDensity: pageText.length,
      imageCount: pageImages, fontCount: pageFonts.size,
    });
  }

  const words = allText.trim() ? allText.trim().split(/\s+/).filter(Boolean).length : 0;
  const characters = allText.replace(/\s/g, "").length;
  const sentences = (allText.match(/[.!?]+/g) || []).length;
  const paragraphs = allText.split(/\n\s*\n/).filter(p => p.trim()).length;
  const detectedLanguages = detectLanguage(allText);

  const fontRefs = rawText.match(/\/BaseFont\s*\/([^\s/]+)/g) || [];
  fontRefs.forEach(r => {
    const m = r.match(/\/BaseFont\s*\/([^\s/]+)/);
    if (m) {
      const name = m[1].replace(/^[A-Z]{6}\+/, "");
      embeddedFonts.add(name);
    }
  });
  const typeRefs = rawText.match(/\/Subtype\s*\/(\w+Font)/g) || [];
  typeRefs.forEach(r => {
    const m = r.match(/\/Subtype\s*\/(\w+Font)/);
    if (m) fontTypes[m[1]] = (fontTypes[m[1]] || 0) + 1;
  });

  const tableCount = Math.round(perPage.filter(p => p.textDensity > 100).length * 0.3);
  const estimatedRows = tableCount * 8;
  const estimatedCols = tableCount > 0 ? 4 : 0;

  return {
    text: { words, characters, sentences, paragraphs, detectedLanguages },
    images: { imageCount: totalImages, imageFormats, largestImage: largestImage || "—", estimatedDPI: 72 },
    fonts: { fontNames: Array.from(fontNames), embeddedFonts: Array.from(embeddedFonts), fontTypes },
    graphics: { vectorShapes: totalVectors, paths: totalPaths, fills: totalFills, strokes: totalStrokes },
    tables: { detectedTables: tableCount, estimatedRows, estimatedColumns: estimatedCols },
    annotations: { highlights: totalHighlights, comments: totalComments, links: totalLinks, formFields: totalFormFields },
    perPage,
  };
}

function InfoRow({ label, value, highlight }: { label: string; value: string | number | boolean; highlight?: "warn" | "ok" | "neutral" }) {
  const color = highlight === "warn" ? "text-red-600" : highlight === "ok" ? "text-green-600" : "text-foreground";
  return (
    <div className="flex items-start justify-between py-2 border-b border-border last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`text-sm font-medium text-right max-w-[60%] break-words ${color}`}>{String(value) || "—"}</span>
    </div>
  );
}

function Section({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <button onClick={() => setOpen(p => !p)} className="w-full flex items-center justify-between px-4 py-3 bg-accent/30 hover:bg-accent/50 transition-colors">
        <span className="text-sm font-semibold">{title}</span>
        {open ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
      </button>
      {open && <div className="px-4 py-1">{children}</div>}
    </div>
  );
}

export default function PdfInfoFull() {
  const [file, setFile] = useState<File | null>(null);
  const [info, setInfo] = useState<PdfInfo | null>(null);
  const [forensic, setForensic] = useState<ForensicInfo | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [editMeta, setEditMeta] = useState({ title: "", author: "", subject: "", keywords: "" });
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultBytes, setResultBytes] = useState<Uint8Array | null>(null);
  const [outputSize, setOutputSize] = useState(0);
  const { addRecent } = useRecent();

  const analyzeFile = async (f: File) => {
    setFile(f); setInfo(null); setForensic(null); setAnalytics(null); setIsSuccess(false); setError(null);
    try {
      const ab = await f.arrayBuffer();
      const doc = await PDFDocument.load(ab, { ignoreEncryption: true });
      const creationDate = doc.getCreationDate();
      const modDate = doc.getModificationDate();
      const rawText = new TextDecoder("latin1").decode(ab.slice(0, 500));
      const vMatch = rawText.match(/%PDF-(\d+\.\d+)/);
      let encrypted = false;
      try { await PDFDocument.load(ab); } catch (e) { if ((e as Error).message?.toLowerCase().includes("encrypt")) encrypted = true; }
      const tagged = /\/MarkInfo/i.test(rawText);
      const linearized = /\/Linearized/i.test(rawText);
      const inf: PdfInfo = {
        pages: doc.getPageCount(), title: doc.getTitle() || "", author: doc.getAuthor() || "",
        subject: doc.getSubject() || "", keywords: doc.getKeywords() || "",
        creator: doc.getCreator() || "", producer: doc.getProducer() || "",
        creationDate: creationDate ? creationDate.toLocaleDateString() : "",
        modDate: modDate ? modDate.toLocaleDateString() : "",
        fileSize: f.size, pdfVersion: vMatch?.[1] || "Unknown",
        encrypted, tagged, linearized,
      };
      setInfo(inf);
      setEditMeta({ title: inf.title, author: inf.author, subject: inf.subject, keywords: inf.keywords });
      setForensic(parseForensics(ab));
    } catch (e) { setError((e as Error).message || "Failed to analyze PDF"); }
  };

  const loadAnalytics = async () => {
    if (!file || analyticsLoading) return;
    setAnalyticsLoading(true);
    try { setAnalytics(await computeAnalytics(file)); } catch (e) { setError((e as Error).message || "Analytics failed"); }
    finally { setAnalyticsLoading(false); }
  };

  const sanitize = async () => {
    if (!file) return;
    setIsProcessing(true); setError(null); setIsSuccess(false);
    try {
      const doc = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
      doc.setTitle(""); doc.setAuthor(""); doc.setSubject(""); doc.setKeywords([]); doc.setCreator(""); doc.setProducer("");
      const result = await doc.save();
      setResultBytes(result); setOutputSize(result.byteLength); setIsSuccess(true);
      addRecent({ name: file.name, tool: "PDF Info", toolPath: "/pdf-info", size: file.size });
    } catch (err: unknown) { setError((err as Error).message || "Sanitization failed"); }
    finally { setIsProcessing(false); }
  };

  const saveMeta = async () => {
    if (!file) return;
    setIsProcessing(true); setError(null); setIsSuccess(false);
    try {
      const doc = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
      doc.setTitle(editMeta.title); doc.setAuthor(editMeta.author); doc.setSubject(editMeta.subject);
      doc.setKeywords(editMeta.keywords ? [editMeta.keywords] : []);
      const result = await doc.save();
      setResultBytes(result); setOutputSize(result.byteLength); setIsSuccess(true);
      addRecent({ name: file.name, tool: "PDF Info", toolPath: "/pdf-info", size: file.size });
    } catch (err: unknown) { setError((err as Error).message || "Failed to save metadata"); }
    finally { setIsProcessing(false); }
  };

  const download = () => { if (resultBytes) downloadBlob(resultBytes, `updated-${file?.name || "output.pdf"}`); };
  const reset = () => { setFile(null); setInfo(null); setForensic(null); setAnalytics(null); setIsSuccess(false); setError(null); setResultBytes(null); };

  return (
    <div className="max-w-2xl mx-auto px-6 py-10 pb-24 md:pb-20">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center"><Info className="w-5 h-5 text-slate-600" /></div>
          <h1 className="text-2xl font-bold text-foreground">PDF Info & Analytics</h1>
        </div>
        <p className="text-muted-foreground mb-8">Inspect properties, run deep analytics, sanitize metadata, and forensically analyze PDFs.</p>
        <div className="space-y-6">
          <FileDropZone onFileSelect={analyzeFile} selectedFile={file} onClear={reset} />
          <ProcessingState isProcessing={isProcessing} isSuccess={isSuccess} error={error} label="Processing..." outputSize={outputSize} downloadLabel="Download Updated PDF" onDownload={download} onReset={() => { setIsSuccess(false); setError(null); }} />

          {info && !isProcessing && !isSuccess && !error && (
            <Tabs defaultValue="info" className="w-full">
              <TabsList className="w-full grid grid-cols-4">
                <TabsTrigger value="info" className="gap-1.5 text-xs"><Info className="w-3.5 h-3.5" />Info</TabsTrigger>
                <TabsTrigger value="analytics" className="gap-1.5 text-xs"><BarChart3 className="w-3.5 h-3.5" />Analytics</TabsTrigger>
                <TabsTrigger value="sanitize" className="gap-1.5 text-xs"><ShieldOff className="w-3.5 h-3.5" />Sanitize</TabsTrigger>
                <TabsTrigger value="forensic" className="gap-1.5 text-xs"><FlaskConical className="w-3.5 h-3.5" />Forensic</TabsTrigger>
              </TabsList>

              <TabsContent value="info" className="mt-4">
                <div className="bg-card border border-border rounded-2xl p-5 divide-y divide-border">
                  <InfoRow label="Pages" value={info.pages} />
                  <InfoRow label="File Size" value={formatBytes(info.fileSize)} />
                  <InfoRow label="PDF Version" value={info.pdfVersion} />
                  <InfoRow label="Encrypted" value={info.encrypted ? "Yes" : "No"} highlight={info.encrypted ? "warn" : "ok"} />
                  <InfoRow label="Tagged PDF" value={info.tagged ? "Yes" : "No"} />
                  <InfoRow label="Linearized" value={info.linearized ? "Yes" : "No"} />
                  <InfoRow label="Title" value={info.title} />
                  <InfoRow label="Author" value={info.author} />
                  <InfoRow label="Subject" value={info.subject} />
                  <InfoRow label="Keywords" value={info.keywords} />
                  <InfoRow label="Creator" value={info.creator} />
                  <InfoRow label="Producer" value={info.producer} />
                  <InfoRow label="Created" value={info.creationDate} />
                  <InfoRow label="Modified" value={info.modDate} />
                </div>
              </TabsContent>

              <TabsContent value="analytics" className="mt-4 space-y-3">
                {!analytics && (
                  <Button onClick={loadAnalytics} disabled={analyticsLoading} className="w-full gap-2">
                    {analyticsLoading ? "Analyzing…" : <><BarChart3 className="w-4 h-4" /> Run Deep Analysis</>}
                  </Button>
                )}
                {analyticsLoading && <p className="text-sm text-muted-foreground text-center py-6">Analyzing {info.pages} page{info.pages > 1 ? "s" : ""}…</p>}
                {analytics && (
                  <div className="space-y-3">
                    <Section title="Text">
                      <InfoRow label="Words" value={analytics.text.words.toLocaleString()} />
                      <InfoRow label="Characters" value={analytics.text.characters.toLocaleString()} />
                      <InfoRow label="Sentences" value={analytics.text.sentences.toLocaleString()} />
                      <InfoRow label="Paragraphs" value={analytics.text.paragraphs.toLocaleString()} />
                      <InfoRow label="Detected Languages" value={analytics.text.detectedLanguages.join(", ") || "—"} />
                    </Section>
                    <Section title="Images">
                      <InfoRow label="Image Count" value={analytics.images.imageCount} />
                      <InfoRow label="Formats" value={Object.entries(analytics.images.imageFormats).map(([k,v]) => `${k}: ${v}`).join(", ") || "—"} />
                      <InfoRow label="Largest Image" value={analytics.images.largestImage} />
                      <InfoRow label="Estimated DPI" value={analytics.images.estimatedDPI} />
                    </Section>
                    <Section title="Fonts">
                      <InfoRow label="Unique Fonts" value={analytics.fonts.fontNames.length} />
                      <InfoRow label="Embedded" value={analytics.fonts.embeddedFonts.slice(0, 4).join(", ") || "—"} />
                      <InfoRow label="Font Types" value={Object.entries(analytics.fonts.fontTypes).map(([k,v]) => `${k}: ${v}`).join(", ") || "—"} />
                    </Section>
                    <Section title="Graphics" defaultOpen={false}>
                      <InfoRow label="Vector Shapes" value={analytics.graphics.vectorShapes} />
                      <InfoRow label="Paths" value={analytics.graphics.paths} />
                      <InfoRow label="Fills" value={analytics.graphics.fills} />
                      <InfoRow label="Strokes" value={analytics.graphics.strokes} />
                    </Section>
                    <Section title="Tables (Estimated)" defaultOpen={false}>
                      <InfoRow label="Detected Tables" value={analytics.tables.detectedTables} />
                      <InfoRow label="Estimated Rows" value={analytics.tables.estimatedRows} />
                      <InfoRow label="Estimated Columns" value={analytics.tables.estimatedColumns} />
                    </Section>
                    <Section title="Annotations">
                      <InfoRow label="Highlights" value={analytics.annotations.highlights} />
                      <InfoRow label="Comments" value={analytics.annotations.comments} />
                      <InfoRow label="Links" value={analytics.annotations.links} />
                      <InfoRow label="Form Fields" value={analytics.annotations.formFields} />
                    </Section>
                    <Section title="Per-Page Analysis" defaultOpen={false}>
                      <div className="overflow-x-auto -mx-1">
                        <table className="w-full text-xs">
                          <thead><tr className="border-b border-border">
                            {["Page","W","H","Rot","Text","Imgs","Fonts"].map(h => <th key={h} className="text-left py-1.5 px-1 font-semibold text-muted-foreground">{h}</th>)}
                          </tr></thead>
                          <tbody>
                            {analytics.perPage.map(p => (
                              <tr key={p.pageIndex} className="border-b border-border last:border-0">
                                <td className="py-1.5 px-1">{p.pageIndex + 1}</td>
                                <td className="py-1.5 px-1">{p.width}</td>
                                <td className="py-1.5 px-1">{p.height}</td>
                                <td className="py-1.5 px-1">{p.rotation}°</td>
                                <td className="py-1.5 px-1">{p.textDensity}</td>
                                <td className="py-1.5 px-1">{p.imageCount}</td>
                                <td className="py-1.5 px-1">{p.fontCount}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </Section>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="sanitize" className="mt-4 space-y-4">
                <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
                  <p className="text-sm font-medium text-foreground">Edit Metadata</p>
                  {(["title","author","subject","keywords"] as const).map((k) => (
                    <div key={k} className="space-y-1.5">
                      <Label htmlFor={`edit-${k}`} className="capitalize">{k}</Label>
                      <Input id={`edit-${k}`} value={editMeta[k]} onChange={(e) => setEditMeta(prev => ({ ...prev, [k]: e.target.value }))} data-testid={`edit-${k}`} />
                    </div>
                  ))}
                  <Button onClick={saveMeta} className="w-full gap-2" data-testid="save-meta-button"><Info className="w-4 h-4" /> Save Metadata</Button>
                </div>
                <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
                  <p className="text-sm font-medium text-foreground">Strip All Metadata</p>
                  <p className="text-xs text-muted-foreground">Removes title, author, subject, keywords, creator, and producer from the PDF.</p>
                  <Button variant="outline" onClick={sanitize} className="w-full gap-2 border-destructive/30 text-destructive hover:bg-destructive/5" data-testid="sanitize-button"><ShieldOff className="w-4 h-4" /> Sanitize All Metadata</Button>
                </div>
              </TabsContent>

              <TabsContent value="forensic" className="mt-4">
                {forensic && (
                  <div className="bg-card border border-border rounded-2xl p-5 divide-y divide-border">
                    <InfoRow label="Revision Count" value={forensic.revisions} />
                    <InfoRow label="JavaScript Embedded" value={forensic.hasJavaScript ? "Yes — potential risk" : "No"} highlight={forensic.hasJavaScript ? "warn" : "ok"} />
                    <InfoRow label="Embedded Files" value={forensic.hasEmbeddedFiles ? "Yes" : "No"} highlight={forensic.hasEmbeddedFiles ? "warn" : "neutral"} />
                    <InfoRow label="Redacted Content" value={forensic.hasRedactions ? "Yes" : "No"} highlight={forensic.hasRedactions ? "warn" : "neutral"} />
                    <InfoRow label="AcroForm (Forms)" value={forensic.hasAcroForm ? "Yes" : "No"} />
                    <InfoRow label="Widget Annotations" value={forensic.hasForms ? "Yes" : "No"} />
                    <div className="pt-3">
                      <p className="text-xs font-semibold text-muted-foreground mb-2">PDF Header</p>
                      <pre className="text-[10px] text-muted-foreground bg-accent/30 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all">{forensic.rawExcerpt.slice(0, 150)}</pre>
                    </div>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}
        </div>
      </motion.div>
    </div>
  );
}
