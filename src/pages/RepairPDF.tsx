import { useState } from "react";
import { motion } from "framer-motion";
import { Wrench, CheckCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import FileDropZone from "@/components/FileDropZone";
import ProcessingState from "@/components/ProcessingState";
import { useRecent } from "@/contexts/RecentContext";
import { repairPdf, bytesOf } from "@/lib/backend";

function downloadBlob(b: Uint8Array, n: string) { const url=URL.createObjectURL(new Blob([b.slice()],{type:"application/pdf"})),a=document.createElement("a"); a.href=url; a.download=n; a.click(); URL.revokeObjectURL(url); }
function formatBytes(b: number) { const k=1024,s=["B","KB","MB","GB"],i=Math.floor(Math.log(b)/Math.log(k)); return `${parseFloat((b/Math.pow(k,i)).toFixed(1))} ${s[i]}`; }

interface RepairConfig {
  rebuildXref: boolean;
  decompressStreams: boolean;
  removeInvalidObjects: boolean;
  normalizeMetadata: boolean;
  repairFonts: boolean;
  removeBrokenAnnotations: boolean;
  sanitizeJS: boolean;
  optimize: boolean;
}

interface DiagResult { label: string; ok: boolean; detail: string; }

function diagnose(bytes: ArrayBuffer): DiagResult[] {
  const text = new TextDecoder("latin1").decode(bytes.slice(0, Math.min(bytes.byteLength, 50000)));
  const results: DiagResult[] = [];
  const hasHeader = /^%PDF-\d+\.\d+/.test(text);
  results.push({ label: "PDF Header", ok: hasHeader, detail: hasHeader ? "Valid %PDF- header found" : "Missing or corrupt header" });
  const hasEOF = text.includes("%%EOF");
  results.push({ label: "EOF Marker", ok: hasEOF, detail: hasEOF ? "%%EOF marker present" : "Missing %%EOF" });
  const hasXref = /xref|\/XRef/i.test(text);
  results.push({ label: "Cross-Reference", ok: hasXref, detail: hasXref ? "xref table/stream found" : "Missing xref — may need rebuild" });
  const hasJS = /\/JavaScript|\/JS\s*\(/i.test(text);
  results.push({ label: "JavaScript", ok: !hasJS, detail: hasJS ? "Embedded JS detected (security risk)" : "No JavaScript found" });
  const hasBrokenStream = /stream\s*\r?\n[\s\S]{0,10}endstream/.test(text);
  results.push({ label: "Empty Streams", ok: !hasBrokenStream, detail: hasBrokenStream ? "Possibly empty/broken streams" : "Streams appear intact" });
  const hasFont = /\/Font/i.test(text);
  results.push({ label: "Fonts", ok: hasFont, detail: hasFont ? "Font resources found" : "No font resources — may need repair" });
  return results;
}

export default function RepairPDF() {
  const [file, setFile] = useState<File | null>(null);
  const [diagnosis, setDiagnosis] = useState<DiagResult[] | null>(null);
  const [config, setConfig] = useState<RepairConfig>({
    rebuildXref: true, decompressStreams: false, removeInvalidObjects: true,
    normalizeMetadata: true, repairFonts: false, removeBrokenAnnotations: true,
    sanitizeJS: true, optimize: true,
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultBytes, setResultBytes] = useState<Uint8Array | null>(null);
  const [outputSize, setOutputSize] = useState(0);
  const { addRecent } = useRecent();

  const upd = (k: keyof RepairConfig, v: boolean) => setConfig(p => ({ ...p, [k]: v }));

  const handleFile = async (f: File) => {
    setFile(f); setDiagnosis(null); setIsSuccess(false); setError(null); setResultBytes(null);
    const ab = await f.arrayBuffer();
    setDiagnosis(diagnose(ab));
  };

  const repair = async () => {
    if (!file) return;
    setIsProcessing(true); setError(null);
    try {
      const result = await repairPdf(await bytesOf(file), { ...config });
      setResultBytes(result); setOutputSize(result.byteLength); setIsSuccess(true);
      addRecent({ name: file.name, tool: "PDF Repair", toolPath: "/repair-pdf", size: file.size });
    } catch (err: unknown) { setError((err as Error).message || "Repair failed — file may be too corrupted"); }
    finally { setIsProcessing(false); }
  };

  const reset = () => { setFile(null); setDiagnosis(null); setIsSuccess(false); setError(null); setResultBytes(null); };

  const options: [keyof RepairConfig, string][] = [
    ["rebuildXref", "Rebuild Cross-Reference Table"],
    ["removeInvalidObjects", "Remove Invalid Objects"],
    ["normalizeMetadata", "Normalize Metadata"],
    ["removeBrokenAnnotations", "Remove Broken Annotations"],
    ["sanitizeJS", "Sanitize Embedded JavaScript"],
    ["decompressStreams", "Decompress Streams"],
    ["repairFonts", "Attempt Font Repair"],
    ["optimize", "Optimize Object Streams"],
  ];

  return (
    <div className="max-w-2xl mx-auto px-6 py-10 pb-24 md:pb-20">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center"><Wrench className="w-5 h-5 text-orange-600" /></div>
          <h1 className="text-2xl font-bold text-foreground">PDF Repair</h1>
        </div>
        <p className="text-muted-foreground mb-8">Diagnose and repair broken or corrupted PDF files. Rebuild structure and re-save clean output.</p>
        <div className="space-y-6">
          <FileDropZone onFileSelect={handleFile} selectedFile={file} onClear={reset} />
          <ProcessingState isProcessing={isProcessing} isSuccess={isSuccess} error={error} label="Repairing PDF..." outputSize={outputSize} downloadLabel="Download Repaired PDF" onDownload={() => resultBytes && downloadBlob(resultBytes, `repaired-${file?.name || "output.pdf"}`)} onReset={() => { setIsSuccess(false); setError(null); }} />

          {file && !isProcessing && !isSuccess && !error && (
            <div className="space-y-4">
              {diagnosis && (
                <div className="bg-card border border-border rounded-2xl p-5 space-y-2">
                  <p className="text-sm font-semibold mb-3">Diagnosis</p>
                  {diagnosis.map((d, i) => (
                    <div key={i} className="flex items-start gap-2.5 py-1.5 border-b border-border last:border-0">
                      {d.ok ? <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" /> : <XCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />}
                      <div>
                        <p className="text-sm font-medium">{d.label}</p>
                        <p className="text-xs text-muted-foreground">{d.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
                <p className="text-sm font-semibold">Repair Options</p>
                {options.map(([k, label]) => (
                  <div key={k} className="flex items-center justify-between">
                    <Label className="text-sm">{label}</Label>
                    <Switch checked={config[k]} onCheckedChange={v => upd(k, v)} />
                  </div>
                ))}
              </div>

              <Button onClick={repair} className="w-full gap-2"><Wrench className="w-4 h-4" /> Repair PDF</Button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
