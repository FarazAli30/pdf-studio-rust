import { useState } from "react";
import { motion } from "framer-motion";
import { AlignLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import FileDropZone from "@/components/FileDropZone";
import ProcessingState from "@/components/ProcessingState";
import { useRecent } from "@/contexts/RecentContext";
import { useCurrentPdf } from "@/contexts/CurrentPdfContext";
import { headerFooter, bytesOf } from "@/lib/backend";

function downloadBlob(bytes: Uint8Array, name: string) { const blob=new Blob([bytes.slice()],{type:"application/pdf"}),url=URL.createObjectURL(blob),a=document.createElement("a"); a.href=url; a.download=name; a.click(); URL.revokeObjectURL(url); }

const TOKENS = ["none", "Page Number", "Total Pages", "Date", "Custom"];
type ZoneValue = "Page Number" | "Total Pages" | "Date" | "Custom" | "none";

interface Zone { token: ZoneValue; custom: string; }
interface HeaderFooterConfig {
  header: { left: Zone; center: Zone; right: Zone; enabled: boolean; color: string; fontSize: number; };
  footer: { left: Zone; center: Zone; right: Zone; enabled: boolean; color: string; fontSize: number; };
}

function resolveToken(zone: Zone, pageNum: number, totalPages: number): string {
  if (!zone.token || zone.token === "none") return "";
  if (zone.token === "Page Number") return String(pageNum);
  if (zone.token === "Total Pages") return String(totalPages);
  if (zone.token === "Date") return new Date().toLocaleDateString();
  if (zone.token === "Custom") return zone.custom;
  return "";
}

function ZoneEditor({ label, zone, onChange }: { label: string; zone: Zone; onChange: (z: Zone) => void }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Select value={zone.token} onValueChange={(v) => onChange({ ...zone, token: v as ZoneValue })}>
        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="None" /></SelectTrigger>
        <SelectContent>{TOKENS.map((t) => <SelectItem key={t} value={t} className="text-xs">{t === "none" ? "None" : t}</SelectItem>)}</SelectContent>
      </Select>
      {zone.token === "Custom" && (
        <Input className="h-8 text-xs" placeholder="Custom text..." value={zone.custom} onChange={(e) => onChange({ ...zone, custom: e.target.value })} />
      )}
    </div>
  );
}

const emptyZone = (): Zone => ({ token: "none", custom: "" });

export default function HeaderFooter() {
  const [file, setFile] = useState<File | null>(null);
  const [config, setConfig] = useState<HeaderFooterConfig>({
    header: { left: emptyZone(), center: { token: "Custom", custom: "My Document" }, right: { token: "Date", custom: "" }, enabled: true, color: "#000000", fontSize: 9 },
    footer: { left: emptyZone(), center: { token: "Page Number", custom: "" }, right: { token: "Total Pages", custom: "" }, enabled: true, color: "#666666", fontSize: 9 },
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultBytes, setResultBytes] = useState<Uint8Array | null>(null);
  const [outputSize, setOutputSize] = useState(0);
  const { addRecent } = useRecent();
  const { update: updatePdf } = useCurrentPdf();

  const updateSection = (section: "header" | "footer", key: string, value: unknown) => {
    setConfig((prev) => ({ ...prev, [section]: { ...prev[section], [key]: value } }));
  };

  const apply = async () => {
    if (!file) return;
    setIsProcessing(true); setError(null); setIsSuccess(false);
    try {
      const result = await headerFooter(await bytesOf(file), config);
      setResultBytes(result); setOutputSize(result.byteLength); setIsSuccess(true);
      addRecent({ name: file.name, tool: "Header & Footer", toolPath: "/header-footer", size: file.size });
    } catch (err: unknown) { setError((err as Error).message || "Failed to add header/footer"); }
    finally { setIsProcessing(false); }
  };

  const download = () => { if (resultBytes) downloadBlob(resultBytes, `hf-${file?.name || "output.pdf"}`); };
  const reset = () => { setFile(null); setIsSuccess(false); setError(null); setResultBytes(null); };

  return (
    <div className="max-w-2xl mx-auto px-6 py-10 pb-24 md:pb-20">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-lime-100 flex items-center justify-center"><AlignLeft className="w-5 h-5 text-lime-600" /></div>
          <h1 className="text-2xl font-bold text-foreground">Header & Footer</h1>
        </div>
        <p className="text-muted-foreground mb-8">Add headers and footers to every page with page numbers, dates, or custom text.</p>
        <div className="space-y-6">
          <FileDropZone onFileSelect={async (f) => { setFile(f); const _b = new Uint8Array(await f.arrayBuffer()); updatePdf({ bytes: _b, name: f.name, originalSize: f.size }); }} selectedFile={file} onClear={reset} />
          <ProcessingState isProcessing={isProcessing} isSuccess={isSuccess} error={error} label="Adding header & footer..." outputSize={outputSize} downloadLabel="Download PDF" onDownload={download} onReset={reset} 
            resultBytes={resultBytes}
            resultName={`out-${file?.name||"output.pdf"}`}
            operationLabel="Processed"
          />

          {file && !isProcessing && !isSuccess && !error && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
              {(["header", "footer"] as const).map((section) => (
                <div key={section} className="bg-card border border-border rounded-2xl p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold capitalize text-foreground">{section}</p>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={config[section].enabled} onChange={(e) => updateSection(section, "enabled", e.target.checked)} className="w-4 h-4 accent-primary" />
                      <span className="text-sm text-muted-foreground">Enabled</span>
                    </label>
                  </div>
                  {config[section].enabled && (
                    <>
                      <div className="grid grid-cols-3 gap-3">
                        {(["left","center","right"] as const).map((pos) => (
                          <ZoneEditor key={pos} label={pos.charAt(0).toUpperCase()+pos.slice(1)} zone={(config[section] as unknown as Record<string, Zone>)[pos]} onChange={(z) => updateSection(section, pos, z)} />
                        ))}
                      </div>
                      <div className="flex gap-4 items-end">
                        <div className="space-y-1.5 flex-1">
                          <Label className="text-xs">Font size</Label>
                          <Input type="number" min={6} max={16} value={config[section].fontSize} onChange={(e) => updateSection(section, "fontSize", Number(e.target.value))} className="h-8 text-xs" />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Color</Label>
                          <input type="color" value={config[section].color} onChange={(e) => updateSection(section, "color", e.target.value)} className="w-8 h-8 rounded-lg border border-border cursor-pointer" />
                        </div>
                      </div>
                      <div className="rounded-lg bg-accent/30 border border-border px-4 py-2 text-xs font-medium flex justify-between" style={{ color: config[section].color }}>
                        <span>{resolveToken((config[section] as unknown as Record<string, Zone>)["left"], 1, 5) || "·"}</span>
                        <span>{resolveToken((config[section] as unknown as Record<string, Zone>)["center"], 1, 5) || "·"}</span>
                        <span>{resolveToken((config[section] as unknown as Record<string, Zone>)["right"], 1, 5) || "·"}</span>
                      </div>
                    </>
                  )}
                </div>
              ))}
              <Button onClick={apply} className="w-full gap-2"><AlignLeft className="w-4 h-4" /> Apply Header & Footer</Button>
            </motion.div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
