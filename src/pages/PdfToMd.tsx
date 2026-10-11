import { useState } from "react";
import { motion } from "framer-motion";
import * as pdfjsLib from "pdfjs-dist";
import { FileDown, Copy, Download, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import FileDropZone from "@/components/FileDropZone";
import { useToast } from "@/hooks/use-toast";
import { useRecent } from "@/contexts/RecentContext";
import { useCurrentPdf } from "@/contexts/CurrentPdfContext";
import { cn } from "@/lib/utils";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).href;

interface TextItem { str: string; x: number; y: number; w: number; h: number; fontSize: number; }

function downloadText(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ── PDF → Markdown conversion ──────────────────────────────────────────────
async function convertPdfToMarkdown(file: File, onProgress: (msg: string) => void): Promise<string> {
  onProgress("Loading PDF…");
  const pdfDoc = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  const numPages = pdfDoc.numPages;
  const mdParts: string[] = [];

  for (let p = 1; p <= numPages; p++) {
    onProgress(`Processing page ${p} / ${numPages}…`);
    const page = await pdfDoc.getPage(p);
    const { height: pgH, width: pgW } = page.getViewport({ scale: 1 });
    const content = await page.getTextContent({ includeMarkedContent: false } as unknown as Parameters<typeof page.getTextContent>[0]);

    // Extract text items with font size
    const items: TextItem[] = (content.items as Array<{
      str: string; transform: number[]; width: number; height: number;
    }>)
      .filter(it => it.str.trim())
      .map(it => ({
        str: it.str,
        x: it.transform[4],
        y: pgH - it.transform[5],
        w: it.width,
        h: it.height || Math.abs(it.transform[3]) || 10,
        fontSize: Math.round(Math.abs(it.transform[3]) || it.height || 10),
      }));

    if (!items.length) continue;

    // Find body font size (most common)
    const sizeCounts: Record<number, number> = {};
    for (const it of items) sizeCounts[it.fontSize] = (sizeCounts[it.fontSize] || 0) + 1;
    const bodySize = Number(
      Object.entries(sizeCounts).sort((a, b) => b[1] - a[1])[0][0],
    );

    // Unique font sizes larger than body → heading levels
    const headingSizes = [...new Set(
      items.filter(it => it.fontSize > bodySize * 1.1).map(it => it.fontSize),
    )].sort((a, b) => b - a);

    const headingLevel = (size: number): number => {
      const idx = headingSizes.indexOf(size);
      return idx === -1 ? 0 : Math.min(idx + 1, 6);
    };

    // Group items into lines by y-proximity
    const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
    const lines: TextItem[][] = [];
    let curLine: TextItem[] = [sorted[0]];
    for (let i = 1; i < sorted.length; i++) {
      const dy = sorted[i].y - sorted[i - 1].y;
      const lineH = curLine.reduce((m, it) => Math.max(m, it.h), 0) || 10;
      if (dy > lineH * 0.5) { lines.push(curLine); curLine = [sorted[i]]; }
      else curLine.push(sorted[i]);
    }
    lines.push(curLine);

    // Build logical "blocks" — group lines into paragraphs by larger y-gaps
    const lineYs = lines.map(l => l[0].y);
    const lineHeights = lines.map(l => l.reduce((m, it) => Math.max(m, it.h), 0) || 10);
    const blocks: TextItem[][][] = [];
    let curBlock: TextItem[][] = [lines[0]];
    for (let i = 1; i < lines.length; i++) {
      const gap = lineYs[i] - lineYs[i - 1];
      const expectedGap = (lineHeights[i] + lineHeights[i - 1]) / 2;
      if (gap > expectedGap * 1.6) { blocks.push(curBlock); curBlock = [lines[i]]; }
      else curBlock.push(lines[i]);
    }
    blocks.push(curBlock);

    // Convert blocks to Markdown
    const pageParts: string[] = [];
    for (const block of blocks) {
      // Each line in block → join by x-order
      const lineTexts = block.map(line => {
        const sorted = [...line].sort((a, b) => a.x - b.x);
        let text = "";
        for (let i = 0; i < sorted.length; i++) {
          if (i > 0) {
            const gap = sorted[i].x - (sorted[i - 1].x + sorted[i - 1].w);
            if (gap > 8) text += " ";
          }
          text += sorted[i].str;
        }
        return text.trim();
      }).filter(Boolean);

      if (!lineTexts.length) continue;

      // Detect block type using first line's font size
      const firstFontSize = block[0][0].fontSize;
      const hLevel = headingLevel(firstFontSize);

      const fullText = lineTexts.join(" ");
      const firstLine = lineTexts[0];

      if (hLevel > 0) {
        // Heading
        pageParts.push(`${"#".repeat(hLevel)} ${fullText}`);
      } else if (/^\s*(\d+[\.\)]\s+|\*\s+|[-•]\s+)/.test(firstLine)) {
        // List — each line is a list item
        for (const lt of lineTexts) {
          const cleaned = lt.replace(/^\s*(\d+[\.\)]\s+|\*\s+|[-•]\s+)/, "").trim();
          if (/^\d+[\.\)]/.test(lt)) pageParts.push(`1. ${cleaned}`);
          else pageParts.push(`- ${cleaned}`);
        }
      } else if (firstFontSize <= bodySize * 0.85 && /^[a-zA-Z0-9]/.test(firstLine)) {
        // Small text → code block hint
        pageParts.push("```\n" + lineTexts.join("\n") + "\n```");
      } else {
        // Paragraph — join lines
        pageParts.push(lineTexts.join(" "));
      }
    }

    if (pageParts.length) {
      if (p > 1) mdParts.push(`\n---\n`);
      mdParts.push(pageParts.join("\n\n"));
    }
  }

  return mdParts.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
}

// ── Component ─────────────────────────────────────────────────────────────
export default function PdfToMd() {
  const [file, setFile] = useState<File | null>(null);
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"preview" | "raw">("preview");
  const { toast } = useToast();
  const { addRecent } = useRecent();
  const { update: updatePdf } = useCurrentPdf();

  const convert = async () => {
    if (!file) return;
    setIsProcessing(true); setError(null); setMarkdown(null);
    try {
      const md = await convertPdfToMarkdown(file, setStatusMsg);
      setMarkdown(md);
      addRecent({ name: file.name, tool: "PDF → Markdown", toolPath: "/pdf-to-md", size: file.size });
    } catch (err: unknown) {
      setError((err as Error).message || "Conversion failed");
    } finally {
      setIsProcessing(false); setStatusMsg("");
    }
  };

  const copy = () => {
    if (!markdown) return;
    navigator.clipboard.writeText(markdown);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
    toast({ title: "Copied!", description: "Markdown copied to clipboard." });
  };

  const downloadMd = () => {
    if (!markdown || !file) return;
    downloadText(markdown, file.name.replace(/\.pdf$/i, ".md"));
  };

  const reset = () => { setFile(null); setMarkdown(null); setError(null); };

  // Simple Markdown preview renderer
  const renderPreview = (md: string) => {
    return md
      .split("\n\n")
      .map((block, i) => {
        if (/^#{1,6} /.test(block)) {
          const match = block.match(/^(#{1,6}) (.+)/);
          if (match) {
            const level = match[1].length;
            const text = match[2];
            const sizes = ["text-2xl", "text-xl", "text-lg", "text-base", "text-sm", "text-xs"];
            return <div key={i} className={cn("font-bold text-foreground mb-1", sizes[level - 1])}>{text}</div>;
          }
        }
        if (block.startsWith("---")) return <hr key={i} className="my-4 border-border" />;
        if (block.startsWith("```")) {
          const code = block.replace(/^```[^\n]*\n?/, "").replace(/\n?```$/, "");
          return <pre key={i} className="bg-muted rounded-lg p-3 text-xs font-mono overflow-x-auto mb-2">{code}</pre>;
        }
        if (/^(\d+\. |- )/.test(block)) {
          const items = block.split("\n").filter(Boolean);
          const isOrdered = /^\d+\. /.test(items[0]);
          return isOrdered
            ? <ol key={i} className="list-decimal list-inside text-sm text-muted-foreground mb-2 space-y-0.5">
              {items.map((it, j) => <li key={j}>{it.replace(/^\d+\. /, "")}</li>)}
            </ol>
            : <ul key={i} className="list-disc list-inside text-sm text-muted-foreground mb-2 space-y-0.5">
              {items.map((it, j) => <li key={j}>{it.replace(/^- /, "")}</li>)}
            </ul>;
        }
        return <p key={i} className="text-sm text-muted-foreground leading-relaxed mb-2">{block}</p>;
      });
  };

  return (
    <div className="max-w-3xl mx-auto px-6 py-10 pb-24 md:pb-20">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
            <FileDown className="w-5 h-5 text-indigo-600" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">PDF → Markdown</h1>
        </div>
        <p className="text-muted-foreground mb-8">
          Extract structured Markdown from any text-based PDF — headings, paragraphs, lists, and code blocks detected automatically.
        </p>

        <div className="space-y-6">
          <FileDropZone onFileSelect={async (f) => { setFile(f); const _b = new Uint8Array(await f.arrayBuffer()); updatePdf({ bytes: _b, name: f.name, originalSize: f.size }); }} selectedFile={file} onClear={reset} />

          {file && !isProcessing && !markdown && !error && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4 bg-card border border-border rounded-2xl p-5">
              <div className="flex items-start gap-2 rounded-xl bg-accent/50 p-3 text-xs text-muted-foreground">
                <FileDown className="w-4 h-4 flex-shrink-0 mt-0.5 text-primary" />
                <p>Works best on digital PDFs with a text layer. For scanned PDFs, run <strong>Make Searchable</strong> first.</p>
              </div>
              <Button onClick={convert} className="w-full gap-2" data-testid="convert-button">
                <FileDown className="w-4 h-4" /> Convert to Markdown
              </Button>
            </motion.div>
          )}

          {isProcessing && (
            <div className="rounded-2xl border border-border bg-card p-6 flex items-center gap-3">
              <motion.div
                animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                className="w-5 h-5 rounded-full border-2 border-primary/30 border-t-primary flex-shrink-0"
              />
              <div>
                <p className="text-sm font-medium text-foreground">Converting PDF to Markdown…</p>
                <p className="text-xs text-muted-foreground mt-0.5">{statusMsg}</p>
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
              {error} <button onClick={reset} className="ml-2 underline">Reset</button>
            </div>
          )}

          {markdown && !isProcessing && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              {/* Toolbar */}
              <div className="flex items-center justify-between">
                <div className="flex gap-1">
                  {(["preview", "raw"] as const).map(tab => (
                    <button key={tab} onClick={() => setActiveTab(tab)}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors",
                        activeTab === tab ? "bg-primary text-primary-foreground" : "bg-accent text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button onClick={copy} className="flex items-center gap-1.5 text-xs text-primary hover:underline">
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? "Copied!" : "Copy"}
                  </button>
                  <button onClick={downloadMd} className="flex items-center gap-1.5 text-xs text-primary hover:underline">
                    <Download className="w-3.5 h-3.5" /> Download .md
                  </button>
                  <button onClick={reset} className="text-xs text-muted-foreground hover:text-foreground underline">
                    Reset
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="rounded-2xl border border-border overflow-hidden">
                {activeTab === "preview" ? (
                  <div className="p-5 max-h-[60vh] overflow-y-auto space-y-1">
                    {renderPreview(markdown)}
                  </div>
                ) : (
                  <pre className="p-5 text-xs font-mono text-muted-foreground bg-muted/30 max-h-[60vh] overflow-auto whitespace-pre-wrap">
                    {markdown}
                  </pre>
                )}
              </div>

              <p className="text-xs text-muted-foreground text-center">
                {markdown.length.toLocaleString()} characters · {markdown.split("\n").length} lines
              </p>
            </motion.div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
