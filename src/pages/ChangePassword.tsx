import { useState } from "react";
import { motion } from "framer-motion";
import { KeyRound, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import FileDropZone from "@/components/FileDropZone";
import ProcessingState from "@/components/ProcessingState";
import { useCurrentPdf } from "@/contexts/CurrentPdfContext";
import { changePassword, bytesOf } from "@/lib/backend";

function downloadBlob(b: Uint8Array, n: string) { const url=URL.createObjectURL(new Blob([b.slice()],{type:"application/pdf"})),a=document.createElement("a");a.href=url;a.download=n;a.click();URL.revokeObjectURL(url); }

export default function ChangePassword() {
  const [file,setFile]=useState<File|null>(null);
  const [oldPass,setOldPass]=useState("");
  const [newPass,setNewPass]=useState("");
  const [confirmPass,setConfirmPass]=useState("");
  const [showOld,setShowOld]=useState(false);
  const [showNew,setShowNew]=useState(false);
  const [isProcessing,setIsProcessing]=useState(false);
  const [isSuccess,setIsSuccess]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [resultBytes,setResultBytes]=useState<Uint8Array|null>(null);
  const [outputSize,setOutputSize]=useState(0);
  const { update: updatePdf } = useCurrentPdf();

  const process = async () => {
    if (!file) return;
    if (newPass && newPass !== confirmPass) { setError("New passwords do not match"); return; }
    setIsProcessing(true); setError(null);
    try {
      const result = await changePassword(await bytesOf(file), oldPass, newPass);
      setResultBytes(result); setOutputSize(result.byteLength); setIsSuccess(true);
      updatePdf({ bytes: result, name: `secured-${file.name}` });
    } catch(e:unknown){setError((e as Error).message||"Wrong password or unsupported encryption");}
    finally{setIsProcessing(false);}
  };

  const reset=()=>{setFile(null);setOldPass("");setNewPass("");setConfirmPass("");setIsSuccess(false);setError(null);setResultBytes(null);};

  return (
    <div className="max-w-2xl mx-auto px-6 py-10 pb-24">
      <motion.div initial={{opacity:0,y:12}} animate={{opacity:1,y:0}}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center"><KeyRound className="w-5 h-5 text-orange-600"/></div>
          <h1 className="text-2xl font-bold">Change Password</h1>
        </div>
        <p className="text-muted-foreground mb-8">Change or remove the password on a protected PDF.</p>
        <div className="space-y-5">
          <FileDropZone onFileSelect={f=>{setFile(f);setIsSuccess(false);setError(null);}} selectedFile={file} onClear={reset}/>
          <ProcessingState isProcessing={isProcessing} isSuccess={isSuccess} error={error} label="Changing password..." outputSize={outputSize} downloadLabel="Download Secured PDF" onDownload={()=>resultBytes&&downloadBlob(resultBytes,`secured-${file?.name}`)} onReset={()=>{setIsSuccess(false);setError(null);}}/>
          {file && !isProcessing && !isSuccess && !error && (
            <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
              <div>
                <Label className="text-sm mb-1.5 block">Current Password (if protected)</Label>
                <div className="relative"><Input type={showOld?"text":"password"} value={oldPass} onChange={e=>setOldPass(e.target.value)} placeholder="Leave blank if not protected"/><button onClick={()=>setShowOld(p=>!p)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground">{showOld?<EyeOff className="w-4 h-4"/>:<Eye className="w-4 h-4"/>}</button></div>
              </div>
              <div>
                <Label className="text-sm mb-1.5 block">New Password (leave blank to remove)</Label>
                <div className="relative"><Input type={showNew?"text":"password"} value={newPass} onChange={e=>setNewPass(e.target.value)} placeholder="New password"/><button onClick={()=>setShowNew(p=>!p)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground">{showNew?<EyeOff className="w-4 h-4"/>:<Eye className="w-4 h-4"/>}</button></div>
              </div>
              {newPass && <div><Label className="text-sm mb-1.5 block">Confirm New Password</Label><Input type="password" value={confirmPass} onChange={e=>setConfirmPass(e.target.value)} placeholder="Repeat new password"/></div>}
              <Button onClick={process} className="w-full">{newPass?"Change Password":"Remove Password"}</Button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
