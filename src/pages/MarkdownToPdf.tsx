import { useState, useRef } from "react";
import { motion } from "framer-motion";
import { FileText, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import ProcessingState from "@/components/ProcessingState";
import { useRecent } from "@/contexts/RecentContext";
import { useCurrentPdf } from "@/contexts/CurrentPdfContext";
import { cn } from "@/lib/utils";
import { mdToPdf } from "@/lib/backend";

function downloadBlob(bytes: Uint8Array, name: string) { const blob=new Blob([bytes.slice()],{type:"application/pdf"}),url=URL.createObjectURL(blob),a=document.createElement("a"); a.href=url; a.download=name; a.click(); URL.revokeObjectURL(url); }

type Theme = "light" | "dark" | "sepia";
type PageSizeKey = "A4" | "Letter";

export default function MarkdownToPdf() {
  const [file, setFile] = useState<File | null>(null);
  const [mdText, setMdText] = useState("# Hello World\n\nThis is a **Markdown** document converted to PDF.\n\n## Features\n\n- Headings (H1-H6)\n- **Bold** and *italic* text\n- Lists and code blocks\n\n```javascript\nconsole.log('Hello!');\n```\n\n> Blockquotes are supported too.");
  const [mode, setMode] = useState<"paste" | "file">("paste");
  const [theme, setTheme] = useState<Theme>("light");
  const [pageSize, setPageSize] = useState<PageSizeKey>("A4");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultBytes, setResultBytes] = useState<Uint8Array | null>(null);
  const [outputSize, setOutputSize] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const { addRecent } = useRecent();
  const { update: updatePdf } = useCurrentPdf();

  const convert = async () => {
    if (!mdText.trim()) return;
    setIsProcessing(true); setError(null); setIsSuccess(false);
    try {
      const result = await mdToPdf(mdText, theme, pageSize);
      setResultBytes(result); setOutputSize(result.byteLength); setIsSuccess(true);
      if (file) addRecent({ name: file.name, tool: "Markdown to PDF", toolPath: "/markdown-to-pdf", size: file.size });
    } catch (err: unknown) { setError((err as Error).message || "Conversion failed"); }
    finally { setIsProcessing(false); }
  };

  const download = () => { if (resultBytes) downloadBlob(resultBytes, `${file?.name.replace(".md","") || "document"}.pdf`); };
  const reset = () => { setFile(null); setIsSuccess(false); setError(null); setResultBytes(null); };

  return (
    <div className="max-w-2xl mx-auto px-6 py-10 pb-24 md:pb-20">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center"><FileText className="w-5 h-5 text-emerald-600" /></div>
          <h1 className="text-2xl font-bold text-foreground">Markdown → PDF</h1>
        </div>
        <p className="text-muted-foreground mb-8">Convert Markdown files or pasted text into a beautifully formatted PDF.</p>
        <div className="space-y-6">
          <div className="flex gap-2">
            {(["paste","file"] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)} className={cn("flex-1 py-2 rounded-xl border text-sm font-medium transition-colors", mode===m?"border-primary bg-primary/5 text-primary":"border-border text-muted-foreground hover:border-primary/40")} data-testid={`mode-${m}`}>{m==="paste"?"Paste Markdown":"Upload .md file"}</button>
            ))}
          </div>
          {mode === "file" ? (
            <div className={cn("rounded-2xl border-2 border-dashed cursor-pointer p-8 flex flex-col items-center gap-3", file?"border-primary/30 bg-primary/5":"border-border hover:border-primary/50")} onClick={() => inputRef.current?.click()} data-testid="md-dropzone">
              {file ? <><FileText className="w-8 h-8 text-primary" /><p className="text-sm font-medium">{file.name}</p></> : <><Upload className="w-8 h-8 text-muted-foreground" /><p className="text-sm font-semibold">Drop .md file here</p></>}
            </div>
          ) : (
            <textarea value={mdText} onChange={(e) => setMdText(e.target.value)} className="w-full h-56 rounded-xl border border-border bg-background p-4 text-sm font-mono resize-none focus:outline-none focus:ring-1 focus:ring-primary" placeholder="# Your Markdown here..." data-testid="md-textarea" />
          )}
          <input ref={inputRef} type="file" accept=".md,.markdown,text/markdown" className="hidden" onChange={async (e) => { if (e.target.files?.[0]) { setFile(e.target.files[0]); setMdText(await e.target.files[0].text()); } }} />

          <ProcessingState isProcessing={isProcessing} isSuccess={isSuccess} error={error} label="Rendering Markdown to PDF..." outputSize={outputSize} downloadLabel="Download PDF" onDownload={download} onReset={reset} 
            resultBytes={resultBytes}
            resultName={`out-${file?.name||"output.pdf"}`}
            operationLabel="Processed"
          />

          {!isProcessing && !isSuccess && !error && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4 bg-card border border-border rounded-2xl p-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Theme</Label>
                  <div className="flex flex-col gap-1.5">
                    {(["light","dark","sepia"] as Theme[]).map((t) => (
                      <button key={t} onClick={() => setTheme(t)} className={cn("py-2 rounded-xl border text-sm font-medium capitalize transition-colors", theme===t?"border-primary bg-primary/5 text-primary":"border-border text-muted-foreground hover:border-primary/40")} data-testid={`theme-${t}`}>{t}</button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Page size</Label>
                  <div className="flex flex-col gap-1.5">
                    {(["A4","Letter"] as PageSizeKey[]).map((s) => (
                      <button key={s} onClick={() => setPageSize(s)} className={cn("py-2 rounded-xl border text-sm font-medium transition-colors", pageSize===s?"border-primary bg-primary/5 text-primary":"border-border text-muted-foreground hover:border-primary/40")} data-testid={`pagesize-${s}`}>{s}</button>
                    ))}
                  </div>
                </div>
              </div>
              <Button onClick={convert} disabled={!mdText.trim()} className="w-full gap-2" data-testid="convert-md-button"><FileText className="w-4 h-4" /> Convert to PDF</Button>
            </motion.div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
