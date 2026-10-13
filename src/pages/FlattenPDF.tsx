import { useState } from "react";
import { motion } from "framer-motion";
import { PDFDocument, PDFName, PDFString, rgb, StandardFonts, PDFForm } from "pdf-lib";
import * as pdfjs from "pdfjs-dist";
import { Layers, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import FileDropZone from "@/components/FileDropZone";
import ProcessingState from "@/components/ProcessingState";
import { useRecent } from "@/contexts/RecentContext";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

function downloadBlob(b: Uint8Array, n: string) { const url=URL.createObjectURL(new Blob([b.slice()],{type:"application/pdf"})),a=document.createElement("a"); a.href=url; a.download=n; a.click(); URL.revokeObjectURL(url); }
function formatBytes(b: number) { const k=1024,s=["B","KB","MB","GB"],i=Math.floor(Math.log(b)/Math.log(k)); return `${parseFloat((b/Math.pow(k,i)).toFixed(1))} ${s[i]}`; }

interface FlattenField {
  fieldName: string;
  fieldType: string;
  fieldValue: string;
  fontSize: number;
  fontName: string;
  textColor: string;
  pageIndex: number;
  rect: number[];
  alignment: number;
  multiline: boolean;
  checked: boolean;
  normalizedCoordinates: { x: number; y: number; w: number; h: number };
}

export default function FlattenPDF() {
  const [file, setFile] = useState<File | null>(null);
  const [fields, setFields] = useState<FlattenField[]>([]);
  const [removeFields, setRemoveFields] = useState(true);
  const [showFields, setShowFields] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultBytes, setResultBytes] = useState<Uint8Array | null>(null);
  const [outputSize, setOutputSize] = useState(0);
  const { addRecent } = useRecent();

  const analyzeFields = async (f: File) => {
    setFile(f); setFields([]); setIsSuccess(false); setError(null); setResultBytes(null);
    try {
      const ab = await f.arrayBuffer();
      const pdfDoc = await pdfjs.getDocument({ data: ab.slice(0) }).promise;
      const libDoc = await PDFDocument.load(ab);
      const form = libDoc.getForm();
      const detected: FlattenField[] = [];
      for (const field of form.getFields()) {
        const name = field.getName();
        const type = field.constructor.name.replace("PDF", "").replace("Field", "");
        let value = "";
        try {
          const f = field as any;
          if (f.getText) value = f.getText() || "";
          else if (f.isChecked) value = f.isChecked() ? "✓" : "";
          else if (f.getSelected) value = f.getSelected() || "";
        } catch {}
        const widgets = (field as any).acroField?.getWidgets?.() || [];
        for (const w of widgets) {
          const rect = w.getRectangle?.() || { x: 0, y: 0, width: 100, height: 20 };
          const pageRef = w.P?.();
          const pageIdx = pageRef ? libDoc.getPages().findIndex((p: any) => p.ref === pageRef) : 0;
          const page = libDoc.getPage(Math.max(0, pageIdx));
          const { width: pw, height: ph } = page.getSize();
          detected.push({
            fieldName: name, fieldType: type, fieldValue: value,
            fontSize: 10, fontName: "Helvetica", textColor: "#000000",
            pageIndex: Math.max(0, pageIdx),
            rect: [rect.x, rect.y, rect.x + rect.width, rect.y + rect.height],
            alignment: 0, multiline: false, checked: value === "✓",
            normalizedCoordinates: { x: rect.x / pw, y: rect.y / ph, w: rect.width / pw, h: rect.height / ph },
          });
        }
      }
      setFields(detected);
    } catch (e) { setError((e as Error).message || "Failed to read fields"); }
  };

  const flatten = async () => {
    if (!file) return;
    setIsProcessing(true); setError(null);
    try {
      const doc = await PDFDocument.load(await file.arrayBuffer());
      const form = doc.getForm();
      const font = await doc.embedFont(StandardFonts.Helvetica);

      for (const ff of fields) {
        if (!ff.fieldValue && !ff.checked) continue;
        const page = doc.getPage(ff.pageIndex);
        const { height: ph } = page.getSize();
        const [x1, y1, x2, y2] = ff.rect;
        const w = x2 - x1, h = y2 - y1;
        const pdfY = y1;
        const fs = Math.min(ff.fontSize, h * 0.7);
        if (ff.checked) {
          page.drawText("✓", { x: x1 + 2, y: pdfY + h * 0.2, size: fs, font, color: rgb(0, 0, 0) });
        } else if (ff.fieldValue) {
          const lines = ff.fieldValue.split("\n");
          lines.forEach((line, idx) => {
            page.drawText(line, { x: x1 + 2, y: pdfY + h - fs * (idx + 1), size: fs, font, color: rgb(0, 0, 0), maxWidth: w - 4 });
          });
        }
      }

      if (removeFields) form.flatten();
      const result = await doc.save();
      setResultBytes(result); setOutputSize(result.byteLength); setIsSuccess(true);
      addRecent({ name: file.name, tool: "Flatten Forms", toolPath: "/flatten-pdf", size: file.size });
    } catch (err: unknown) { setError((err as Error).message || "Flatten failed"); }
    finally { setIsProcessing(false); }
  };

  const reset = () => { setFile(null); setFields([]); setIsSuccess(false); setError(null); setResultBytes(null); };

  return (
    <div className="max-w-2xl mx-auto px-6 py-10 pb-24 md:pb-20">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center"><Layers className="w-5 h-5 text-green-600" /></div>
          <h1 className="text-2xl font-bold text-foreground">Flatten PDF Forms</h1>
        </div>
        <p className="text-muted-foreground mb-8">Convert form fields to static text and remove editable form structure.</p>
        <div className="space-y-6">
          <FileDropZone onFileSelect={analyzeFields} selectedFile={file} onClear={reset} />
          <ProcessingState isProcessing={isProcessing} isSuccess={isSuccess} error={error} label="Flattening form..." outputSize={outputSize} downloadLabel="Download Flattened PDF" onDownload={() => resultBytes && downloadBlob(resultBytes, `flattened-${file?.name || "output.pdf"}`)} onReset={() => { setIsSuccess(false); setError(null); }} />

          {file && !isProcessing && !isSuccess && !error && (
            <div className="space-y-4">
              {fields.length === 0 && (
                <div className="bg-accent/50 border border-border rounded-xl p-4 text-sm text-muted-foreground text-center">
                  No form fields detected. File may not contain an AcroForm.
                </div>
              )}

              {fields.length > 0 && (
                <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">{fields.length} field{fields.length > 1 ? "s" : ""} detected</p>
                    <button onClick={() => setShowFields(p => !p)} className="text-xs text-muted-foreground flex items-center gap-1 hover:text-foreground">
                      {showFields ? "Hide" : "Show"} details <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showFields ? "rotate-180" : ""}`} />
                    </button>
                  </div>

                  {showFields && (
                    <div className="space-y-1.5 max-h-48 overflow-y-auto">
                      {fields.map((f, i) => (
                        <div key={i} className="flex items-start justify-between text-xs bg-accent/40 rounded-lg px-3 py-2">
                          <div>
                            <span className="font-medium">{f.fieldName}</span>
                            <span className="ml-2 text-muted-foreground capitalize">({f.fieldType})</span>
                          </div>
                          <span className="text-muted-foreground max-w-[120px] truncate">{f.fieldValue || (f.checked ? "✓" : "—")}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-1">
                    <Label className="text-sm">Remove editable fields after flattening</Label>
                    <Switch checked={removeFields} onCheckedChange={setRemoveFields} />
                  </div>

                  <Button onClick={flatten} className="w-full">Flatten {fields.length} Field{fields.length > 1 ? "s" : ""}</Button>
                </div>
              )}

              {fields.length === 0 && (
                <Button onClick={flatten} variant="outline" className="w-full">Flatten Anyway (remove form structure)</Button>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
