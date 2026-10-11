import { useState } from "react";
import { motion } from "framer-motion";
import { Unlock, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCurrentPdf } from "@/contexts/CurrentPdfContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import FileDropZone from "@/components/FileDropZone";
import ProcessingState from "@/components/ProcessingState";
import { unlockPdf, bytesOf } from "@/lib/backend";

function downloadBlob(bytes: Uint8Array, name: string) {
  const blob = new Blob([bytes.slice()], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

export default function UnlockPDF() {
  const { update: updatePdf } = useCurrentPdf();
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultBytes, setResultBytes] = useState<Uint8Array | null>(null);
  const [outputSize, setOutputSize] = useState(0);

  const unlock = async () => {
    if (!file) return;
    setIsProcessing(true); setError(null); setIsSuccess(false);
    try {
      const result = await unlockPdf(await bytesOf(file), password);
      setResultBytes(result); setOutputSize(result.byteLength); setIsSuccess(true);
    } catch (err: unknown) {
      const msg = (err as Error).message || "";
      if (msg.toLowerCase().includes("password") || msg.toLowerCase().includes("encrypt")) {
        setError("Incorrect password or the PDF could not be unlocked.");
      } else {
        setError(msg || "Failed to unlock PDF");
      }
    } finally { setIsProcessing(false); }
  };

  const download = () => { if (resultBytes) downloadBlob(resultBytes, `unlocked-${file?.name || "output.pdf"}`); };
  const reset = () => { setFile(null); setPassword(""); setIsSuccess(false); setError(null); setResultBytes(null); };

  return (
    <div className="max-w-2xl mx-auto px-6 py-10 pb-24 md:pb-10">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
            <Unlock className="w-5 h-5 text-emerald-600" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Unlock PDF</h1>
        </div>
        <p className="text-muted-foreground mb-8">Remove password protection from a PDF you have access to.</p>

        <div className="space-y-6">
          <FileDropZone onFileSelect={async (f) => { setFile(f); const _b = new Uint8Array(await f.arrayBuffer()); updatePdf({ bytes: _b, name: f.name, originalSize: f.size }); }} selectedFile={file} onClear={reset} label="Drop your password-protected PDF here" />
          <ProcessingState isProcessing={isProcessing} isSuccess={isSuccess} error={error} label="Unlocking PDF..." outputSize={outputSize} downloadLabel="Download Unlocked PDF" onDownload={download} onReset={reset} 
            resultBytes={resultBytes}
            resultName={`out-${file?.name||"output.pdf"}`}
            operationLabel="Processed"
          />

          {file && !isProcessing && !isSuccess && !error && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4 bg-card border border-border rounded-2xl p-5">
              <div className="space-y-2">
                <Label htmlFor="unlock-password">Password</Label>
                <div className="relative">
                  <Input
                    id="unlock-password"
                    type={showPw ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter the PDF password"
                    className="pr-10"
                    data-testid="unlock-password-input"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(!showPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    data-testid="toggle-unlock-password"
                  >
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">Leave blank if the PDF has owner restrictions but no user password.</p>
              </div>

              <Button onClick={unlock} className="w-full gap-2" data-testid="unlock-button">
                <Unlock className="w-4 h-4" />
                Unlock PDF
              </Button>
            </motion.div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
