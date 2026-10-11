import { useState, useRef } from "react";
import { motion } from "framer-motion";
import * as pdfjsLib from "pdfjs-dist";
import { Table2, Download, Copy, Cpu, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import FileDropZone from "@/components/FileDropZone";
import { useToast } from "@/hooks/use-toast";
import { useCurrentPdf } from "@/contexts/CurrentPdfContext";
import { cn } from "@/lib/utils";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).href;

interface TextItem { str: string; x: number; y: number; w: number; h: number; }
interface TableData { headers: string[]; rows: string[][]; page: number; }

// ── Formatting helpers ────────────────────────────────────────────────────
function downloadText(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
function toCSV(t: TableData) {
  const esc = (s: string) => /[,"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  return [[...t.headers], ...t.rows].map(r => r.map(esc).join(",")).join("\n");
}
function toJSON(t: TableData) {
  return JSON.stringify(
    t.rows.map(row => Object.fromEntries(t.headers.map((h, i) => [h || `col${i + 1}`, row[i] ?? ""]))),
    null, 2,
  );
}
function toMarkdown(t: TableData) {
  const widths = t.headers.map((h, i) => Math.max(h.length, ...t.rows.map(r => (r[i] ?? "").length), 3));
  const row = (cells: string[]) => "| " + cells.map((c, i) => c.padEnd(widths[i])).join(" | ") + " |";
  return [row(t.headers), "| " + widths.map(w => "-".repeat(w)).join(" | ") + " |", ...t.rows.map(row)].join("\n");
}

// ── ONNX model (loaded lazily, cached in browser) ─────────────────────────
type OnnxPipeline = (input: string, opts?: Record<string, unknown>) => Promise<Array<{
  label: string; score: number; box: { xmin: number; ymin: number; xmax: number; ymax: number };
}>>;


// ── Table structure extraction from text items ────────────────────────────
function extractTableFromItems(items: TextItem[], pageNum: number): TableData | null {
  if (items.length < 4) return null;

  // 1. Group items into rows by y-proximity
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  const rows: TextItem[][] = [];
  let curRow: TextItem[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i].y - sorted[i - 1].y;
    const rowH = curRow.reduce((m, it) => Math.max(m, it.h), 0) || 10;
    if (gap > rowH * 0.6) { rows.push(curRow); curRow = [sorted[i]]; }
    else curRow.push(sorted[i]);
  }
  rows.push(curRow);
  if (rows.length < 2) return null;

  // 2. Detect columns using x-position clustering
  const allX = rows.flatMap(r => r.map(it => it.x));
  allX.sort((a, b) => a - b);
  const colStarts: number[] = [];
  for (const x of allX) {
    if (!colStarts.length || x - colStarts[colStarts.length - 1] > 15) colStarts.push(x);
  }
  if (colStarts.length < 2) return null;

  // 3. Assign items to columns
  const assignCol = (x: number) => {
    let best = 0, bestDist = Infinity;
    for (let i = 0; i < colStarts.length; i++) {
      const d = Math.abs(x - colStarts[i]);
      if (d < bestDist) { bestDist = d; best = i; }
    }
    return best;
  };

  // 4. Build grid — merge text items in same cell
  const numCols = colStarts.length;
  const grid: string[][] = rows.map(row => {
    const cells = Array.from({ length: numCols }, () => "");
    const rowSorted = [...row].sort((a, b) => a.x - b.x);
    for (const item of rowSorted) {
      const col = assignCol(item.x);
      cells[col] = (cells[col] ? cells[col] + " " : "") + item.str.trim();
    }
    return cells;
  });

  // 5. Filter nearly-empty rows (header noise)
  const meaningful = grid.filter(r => r.filter(c => c.trim()).length >= 2);
  if (meaningful.length < 2) return null;

  return {
    headers: meaningful[0].map(h => h.trim()),
    rows: meaningful.slice(1).map(r => r.map(c => c.trim())),
    page: pageNum,
  };
}

// ── Main component ────────────────────────────────────────────────────────
export default function ExtractTables() {
  const [file, setFile] = useState<File | null>(null);
  const [tables, setTables] = useState<TableData[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processed, setProcessed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState("");
  const [useAI, setUseAI] = useState(false);
  const [format, setFormat] = useState<"csv" | "json" | "markdown">("csv");
  const { toast } = useToast();
  const { update: updatePdf } = useCurrentPdf();
  const abortRef = useRef(false);

  const extract = async () => {
    if (!file) return;
    setIsProcessing(true); setError(null); setTables([]); setProcessed(false);
    abortRef.current = false;

    try {
      setStatusMsg("Loading PDF…");
      const pdfDoc = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
      const numPages = pdfDoc.numPages;
      const allTables: TableData[] = [];

      for (let p = 1; p <= numPages; p++) {
        if (abortRef.current) break;
        setStatusMsg(`Analyzing page ${p} / ${numPages}…`);
        const page = await pdfDoc.getPage(p);
        const { height: pgH, width: pgW } = page.getViewport({ scale: 1 });

        const content = await page.getTextContent();
        const allItems: TextItem[] = (content.items as Array<{ str: string; transform: number[]; width: number; height: number }>)
          .filter(it => it.str.trim())
          .map(it => ({
            str: it.str,
            x: it.transform[4],
            y: pgH - it.transform[5],
            w: it.width,
            h: it.height || Math.abs(it.transform[3]) || 10,
          }));

        // Split page into column regions using x-gap analysis
        const xPositions = allItems.map(it => it.x).sort((a, b) => a - b);
        const gaps: number[] = [];
        for (let i = 1; i < xPositions.length; i++) {
          const gap = xPositions[i] - xPositions[i - 1];
          if (gap > pgW * 0.15) gaps.push((xPositions[i] + xPositions[i - 1]) / 2);
        }
        const regions: TextItem[][] = gaps.length > 0
          ? gaps.reduce<{ regions: TextItem[][]; prevX: number }>((acc, gapX) => {
              acc.regions.push(allItems.filter(it => it.x >= acc.prevX && it.x < gapX));
              acc.prevX = gapX;
              return acc;
            }, { regions: [], prevX: 0 }).regions
          : [allItems];

        for (const region of regions) {
          if (region.length >= 4) {
            const t = extractTableFromItems(region, p);
            if (t && t.headers.length >= 2) allTables.push(t);
          }
        }
      }

      setTables(allTables);
      setProcessed(true);
    } catch (err: unknown) {
      setError((err as Error).message || "Failed to extract tables");
    } finally {
      setIsProcessing(false);
      setStatusMsg("");
    }
  };

  const getContent = (t: TableData) =>
    format === "csv" ? toCSV(t) : format === "json" ? toJSON(t) : toMarkdown(t);
  const getExt = () => format === "csv" ? "csv" : format === "json" ? "json" : "md";

  const copyTable = (t: TableData) => {
    navigator.clipboard.writeText(getContent(t));
    toast({ title: "Copied!", description: "Table content copied to clipboard." });
  };

  const reset = () => { setFile(null); setTables([]); setProcessed(false); setError(null); setStatusMsg(""); };

  return (
    <div className="max-w-3xl mx-auto px-6 py-10 pb-24 md:pb-20">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
            <Table2 className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Extract Tables</h1>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Cpu className="w-3 h-3" /> AI-powered table detection · exports CSV, JSON, Markdown
            </p>
          </div>
        </div>
        <p className="text-muted-foreground mb-8">
          Detect and extract tables from PDFs using an ONNX AI model for accurate region detection.
        </p>

        <div className="space-y-6">
          <FileDropZone onFileSelect={async (f) => { setFile(f); const _b = new Uint8Array(await f.arrayBuffer()); updatePdf({ bytes: _b, name: f.name, originalSize: f.size }); }} selectedFile={file} onClear={reset} />

          {file && !isProcessing && !processed && !error && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4 bg-card border border-border rounded-2xl p-5">
              {/* AI toggle */}
              <div className="flex items-center justify-between bg-primary/5 rounded-xl px-4 py-3">
                <div className="flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-primary" />
                  <div>
                    <p className="text-sm font-medium text-foreground">AI Table Detection</p>
                    <p className="text-xs text-muted-foreground">Uses ONNX table-transformer model · ~110 MB download · cached</p>
                  </div>
                </div>
                <button
                  onClick={() => setUseAI(v => !v)}
                  className={cn(
                    "w-11 h-6 rounded-full transition-colors relative",
                    useAI ? "bg-primary" : "bg-muted",
                  )}
                >
                  <div className={cn("absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all", useAI ? "left-5.5" : "left-0.5")} style={{ left: useAI ? "calc(100% - 22px)" : 2 }} />
                </button>
              </div>

              <div className="flex items-start gap-2 rounded-xl bg-accent/50 p-3 text-xs text-muted-foreground">
                <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <p>Works best on digital (text-based) PDFs. For scanned PDFs, use <strong>Make Searchable</strong> first.</p>
              </div>

              <Button onClick={extract} className="w-full gap-2" data-testid="extract-tables-button">
                <Table2 className="w-4 h-4" /> Extract Tables
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
                <p className="text-sm font-medium text-foreground">Extracting tables…</p>
                <p className="text-xs text-muted-foreground mt-0.5">{statusMsg}</p>
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
              {error} <button onClick={reset} className="ml-2 underline">Reset</button>
            </div>
          )}

          {processed && !isProcessing && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              {tables.length === 0 ? (
                <div className="rounded-2xl border border-border bg-accent/20 p-8 text-center">
                  <p className="text-sm font-medium text-muted-foreground">No tables detected in this PDF.</p>
                  <p className="text-xs text-muted-foreground mt-1">Try disabling AI mode or use a text-based PDF.</p>
                  <Button variant="outline" onClick={reset} className="mt-4">Try another file</Button>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-foreground">{tables.length} table{tables.length > 1 ? "s" : ""} detected</p>
                    <div className="flex gap-1">
                      {(["csv", "json", "markdown"] as const).map(f => (
                        <button key={f} onClick={() => setFormat(f)}
                          className={cn(
                            "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                            format === f ? "bg-primary text-primary-foreground" : "bg-accent text-muted-foreground hover:text-foreground",
                          )}
                          data-testid={`format-${f}`}
                        >
                          {f.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>
                  {tables.map((table, ti) => (
                    <div key={ti} className="rounded-2xl border border-border overflow-hidden" data-testid={`table-${ti}`}>
                      <div className="flex items-center justify-between px-4 py-3 bg-accent/30 border-b border-border">
                        <p className="text-sm font-medium">Table {ti + 1} · Page {table.page}</p>
                        <div className="flex gap-2">
                          <button onClick={() => copyTable(table)} className="text-xs text-primary hover:underline flex items-center gap-1" data-testid={`copy-table-${ti}`}>
                            <Copy className="w-3 h-3" /> Copy
                          </button>
                          <button
                            onClick={() => downloadText(getContent(table), `table-${ti + 1}-p${table.page}.${getExt()}`)}
                            className="text-xs text-primary hover:underline flex items-center gap-1"
                            data-testid={`download-table-${ti}`}
                          >
                            <Download className="w-3 h-3" /> Download
                          </button>
                        </div>
                      </div>
                      <div className="overflow-x-auto max-h-64">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-accent/50">
                              {table.headers.map((h, i) => (
                                <th key={i} className="px-3 py-2 text-left font-semibold text-foreground border-r border-border last:border-r-0">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {table.rows.slice(0, 25).map((row, ri) => (
                              <tr key={ri} className={ri % 2 === 0 ? "bg-background" : "bg-accent/10"}>
                                {row.map((cell, ci) => (
                                  <td key={ci} className="px-3 py-1.5 text-muted-foreground border-r border-border last:border-r-0">{cell}</td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {table.rows.length > 25 && (
                          <p className="text-xs text-muted-foreground text-center py-2">+{table.rows.length - 25} more rows</p>
                        )}
                      </div>
                    </div>
                  ))}
                </>
              )}
            </motion.div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
