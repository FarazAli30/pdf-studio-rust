import { useState } from "react";
import { motion } from "framer-motion";
import { Lock, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCurrentPdf } from "@/contexts/CurrentPdfContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import FileDropZone from "@/components/FileDropZone";
import ProcessingState from "@/components/ProcessingState";
import { protectPdf, bytesOf } from "@/lib/backend";

function downloadBlob(bytes: Uint8Array, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([bytes.slice()], { type: "application/pdf" }));
  a.download = name; a.click(); URL.revokeObjectURL(a.href);
}

export default function ProtectPDF() {
  const { update: updatePdf } = useCurrentPdf();
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultBytes, setResultBytes] = useState<Uint8Array | null>(null);
  const [outputSize, setOutputSize] = useState(0);

  const protect = async () => {
    if (!file || !password) return;
    if (password !== confirm) { setError("Passwords do not match"); return; }
    setIsProcessing(true); setError(null); setIsSuccess(false);
    try {
      const result = await protectPdf(await bytesOf(file), password);
      setResultBytes(result); setOutputSize(result.byteLength); setIsSuccess(true);
    } catch (err: unknown) {
      setError((err as Error).message || "Failed to encrypt PDF");
    } finally { setIsProcessing(false); }
  };

  const download = () => { if (resultBytes) downloadBlob(resultBytes, `protected-${file?.name || "output.pdf"}`); };
  const reset = () => { setFile(null); setPassword(""); setConfirm(""); setIsSuccess(false); setError(null); setResultBytes(null); };

  const strength = password.length === 0 ? 0 : password.length < 6 ? 1 : password.length < 10 ? 2 : 3;
  const strengthColor = ["", "bg-red-400", "bg-amber-400", "bg-green-400"][strength];

  return (
    <div className="max-w-2xl mx-auto px-6 py-10 pb-24 md:pb-10">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
            <Lock className="w-5 h-5 text-red-600" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Password Protect</h1>
        </div>
        <p className="text-muted-foreground mb-8">Encrypt your PDF with AES-256 — enforced by all PDF readers.</p>

        <div className="space-y-6">
          <FileDropZone onFileSelect={async (f) => { setFile(f); updatePdf({ bytes: new Uint8Array(await f.arrayBuffer()), name: f.name, originalSize: f.size }); }} selectedFile={file} onClear={reset} />
          <ProcessingState isProcessing={isProcessing} isSuccess={isSuccess} error={error} label="Encrypting PDF..." outputSize={outputSize}
            downloadLabel="Download Protected PDF" onDownload={download} onReset={reset}
            resultBytes={resultBytes} resultName={`protected-${file?.name || "output.pdf"}`} operationLabel="Encrypted" />

          {file && !isProcessing && !isSuccess && !error && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4 bg-card border border-border rounded-2xl p-5">
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input id="password" type={showPw ? "text" : "password"} value={password}
                    onChange={e => setPassword(e.target.value)} placeholder="Enter a strong password"
                    className="pr-10" data-testid="password-input" />
                  <button type="button" onClick={() => setShowPw(!showPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {password && (
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex gap-1 flex-1">
                      {[1,2,3].map(i => <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i <= strength ? strengthColor : "bg-muted"}`} />)}
                    </div>
                    <span className="text-xs text-muted-foreground">{["","Weak","Good","Strong"][strength]}</span>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm password</Label>
                <Input id="confirm-password" type={showPw ? "text" : "password"} value={confirm}
                  onChange={e => setConfirm(e.target.value)} placeholder="Re-enter password"
                  className={confirm && confirm !== password ? "border-destructive" : ""}
                  data-testid="confirm-password-input" />
                {confirm && confirm !== password && <p className="text-xs text-destructive">Passwords do not match</p>}
              </div>

              <div className="rounded-xl bg-accent/50 p-3 flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-muted-foreground">AES-256 encryption enforced by Adobe Acrobat, Preview, Chrome PDF viewer, and all standards-compliant readers.</p>
              </div>

              <Button onClick={protect} disabled={!password || password !== confirm} className="w-full gap-2" data-testid="protect-button">
                <Lock className="w-4 h-4" /> Protect PDF
              </Button>
            </motion.div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
