import { useState } from "react";
import { motion } from "framer-motion";
import { FileSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCurrentPdf } from "@/contexts/CurrentPdfContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import FileDropZone from "@/components/FileDropZone";
import ProcessingState from "@/components/ProcessingState";
import { getMetadata, setMetadata, bytesOf } from "@/lib/backend";

function downloadBlob(bytes: Uint8Array, name: string) {
  const blob = new Blob([bytes.slice()], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

interface Metadata { title: string; author: string; subject: string; keywords: string; creator: string; }

export default function PdfMetadata() {
  const { update: updatePdf } = useCurrentPdf();
  const [file, setFile] = useState<File | null>(null);
  const [meta, setMeta] = useState<Metadata>({ title: "", author: "", subject: "", keywords: "", creator: "" });
  const [originalMeta, setOriginalMeta] = useState<Metadata | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultBytes, setResultBytes] = useState<Uint8Array | null>(null);
  const [outputSize, setOutputSize] = useState(0);

  const handleFile = async (f: File) => {
    setFile(f); setIsSuccess(false); setError(null); setResultBytes(null);
    try {
      const g = await getMetadata(await bytesOf(f));
      const m: Metadata = { title: g.title, author: g.author, subject: g.subject, keywords: g.keywords, creator: g.creator };
      setMeta(m);
      setOriginalMeta(m);
    } catch { setMeta({ title: "", author: "", subject: "", keywords: "", creator: "" }); }
  };

  const save = async () => {
    if (!file) return;
    setIsProcessing(true); setError(null); setIsSuccess(false);
    try {
      const result = await setMetadata(await bytesOf(file), meta);
      setResultBytes(result); setOutputSize(result.byteLength); setIsSuccess(true);
    } catch (err: unknown) {
      setError((err as Error).message || "Failed to update metadata");
    } finally { setIsProcessing(false); }
  };

  const download = () => { if (resultBytes) downloadBlob(resultBytes, `updated-${file?.name || "output.pdf"}`); };
  const reset = () => { setFile(null); setMeta({ title: "", author: "", subject: "", keywords: "", creator: "" }); setOriginalMeta(null); setIsSuccess(false); setError(null); setResultBytes(null); };

  const fields: { key: keyof Metadata; label: string; placeholder: string }[] = [
    { key: "title", label: "Title", placeholder: "Document title" },
    { key: "author", label: "Author", placeholder: "Author name" },
    { key: "subject", label: "Subject", placeholder: "Subject or topic" },
    { key: "keywords", label: "Keywords", placeholder: "keyword1, keyword2, ..." },
    { key: "creator", label: "Creator", placeholder: "Application or tool name" },
  ];

  return (
    <div className="max-w-2xl mx-auto px-6 py-10 pb-24 md:pb-10">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-cyan-100 flex items-center justify-center">
            <FileSearch className="w-5 h-5 text-cyan-600" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">PDF Metadata</h1>
        </div>
        <p className="text-muted-foreground mb-8">View and edit the metadata properties of your PDF.</p>

        <div className="space-y-6">
          <FileDropZone onFileSelect={handleFile} selectedFile={file} onClear={reset} />
          <ProcessingState isProcessing={isProcessing} isSuccess={isSuccess} error={error} label="Updating metadata..." outputSize={outputSize} downloadLabel="Download Updated PDF" onDownload={download} onReset={reset} 
            resultBytes={resultBytes}
            resultName={`out-${file?.name||"output.pdf"}`}
            operationLabel="Processed"
          />

          {file && originalMeta !== null && !isProcessing && !isSuccess && !error && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4 bg-card border border-border rounded-2xl p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Document Properties</p>
              {fields.map(({ key, label, placeholder }) => (
                <div key={key} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor={`meta-${key}`}>{label}</Label>
                    {originalMeta[key] && meta[key] !== originalMeta[key] && (
                      <span className="text-[10px] text-primary font-medium">Modified</span>
                    )}
                  </div>
                  <Input
                    id={`meta-${key}`}
                    value={meta[key]}
                    onChange={(e) => setMeta((prev) => ({ ...prev, [key]: e.target.value }))}
                    placeholder={placeholder}
                    data-testid={`meta-${key}-input`}
                  />
                  {originalMeta[key] && meta[key] !== originalMeta[key] && (
                    <p className="text-[10px] text-muted-foreground">Was: {originalMeta[key]}</p>
                  )}
                </div>
              ))}
              <Button onClick={save} className="w-full gap-2" data-testid="save-metadata-button">
                <FileSearch className="w-4 h-4" />
                Save Metadata
              </Button>
            </motion.div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
