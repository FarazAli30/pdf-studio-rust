import { useState, useRef } from "react";
import { motion } from "framer-motion";
import * as pdfjs from "pdfjs-dist";
import { Headphones, Play, Square, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import FileDropZone from "@/components/FileDropZone";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export default function AudiobookExport() {
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState([1]);
  const [pitch, setPitch] = useState([1]);
  const [voice, setVoice] = useState("");
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [currentWord, setCurrentWord] = useState(-1);
  const words = useRef<string[]>([]);
  const utterRef = useRef<SpeechSynthesisUtterance | null>(null);

  const loadVoices = () => {
    const v = speechSynthesis.getVoices();
    setVoices(v);
    if (!voice && v.length) setVoice(v[0].name);
  };
  if (typeof window !== "undefined") { speechSynthesis.onvoiceschanged = loadVoices; if (!voices.length) loadVoices(); }

  const extract = async (f: File) => {
    setFile(f); setText(""); setLoading(true);
    try {
      const doc = await pdfjs.getDocument({ data: await f.arrayBuffer() }).promise;
      let t = "";
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const tc = await page.getTextContent();
        t += tc.items.map((it: any) => it.str).join(" ") + "\n\n";
      }
      setText(t.trim());
      words.current = t.trim().split(/\s+/);
    } finally { setLoading(false); }
  };

  const speak = () => {
    if (!text) return;
    speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.rate = rate[0]; utt.pitch = pitch[0];
    const v = voices.find(v => v.name === voice);
    if (v) utt.voice = v;
    utt.onboundary = e => { if (e.name === "word") setCurrentWord(Math.round(e.charIndex / 6)); };
    utt.onend = () => { setPlaying(false); setCurrentWord(-1); };
    utterRef.current = utt;
    speechSynthesis.speak(utt);
    setPlaying(true);
  };

  const stop = () => { speechSynthesis.cancel(); setPlaying(false); setCurrentWord(-1); };

  const exportText = () => {
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" })), a = document.createElement("a");
    a.href = url; a.download = `${file?.name?.replace(".pdf","")}_transcript.txt`; a.click(); URL.revokeObjectURL(url);
  };

  const reset = () => { stop(); setFile(null); setText(""); };

  return (
    <div className="max-w-2xl mx-auto px-6 py-10 pb-24">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center"><Headphones className="w-5 h-5 text-indigo-600" /></div>
          <h1 className="text-2xl font-bold">Audiobook Export</h1>
        </div>
        <p className="text-muted-foreground mb-8">Extract text from PDF and read it aloud using your browser's speech engine.</p>
        <div className="space-y-5">
          <FileDropZone onFileSelect={extract} selectedFile={file} onClear={reset} />
          {loading && <p className="text-sm text-muted-foreground text-center py-4">Extracting text…</p>}
          {text && (
            <div className="space-y-4">
              <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
                {voices.length > 0 && (
                  <div><Label className="text-sm mb-1.5 block">Voice</Label>
                    <Select value={voice} onValueChange={setVoice}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent className="max-h-48">{voices.map(v => <SelectItem key={v.name} value={v.name}>{v.name} ({v.lang})</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div><Label className="text-sm mb-2 block">Speed ({rate[0].toFixed(1)}×)</Label><Slider value={rate} onValueChange={setRate} min={0.5} max={2} step={0.1} /></div>
                  <div><Label className="text-sm mb-2 block">Pitch ({pitch[0].toFixed(1)})</Label><Slider value={pitch} onValueChange={setPitch} min={0.5} max={2} step={0.1} /></div>
                </div>
                <div className="flex gap-3">
                  {!playing
                    ? <Button onClick={speak} className="flex-1 gap-2"><Play className="w-4 h-4" />Play</Button>
                    : <Button onClick={stop} variant="outline" className="flex-1 gap-2"><Square className="w-4 h-4" />Stop</Button>
                  }
                  <Button variant="outline" onClick={exportText} className="gap-2"><Download className="w-4 h-4" />Text</Button>
                </div>
              </div>
              <div className="bg-accent/30 border border-border rounded-xl p-4 max-h-48 overflow-y-auto">
                <p className="text-xs text-muted-foreground leading-relaxed">{words.current.map((w, i) => (
                  <span key={i} className={i === currentWord ? "bg-yellow-200 rounded px-0.5" : ""}>{w} </span>
                ))}</p>
              </div>
              <p className="text-xs text-muted-foreground">{words.current.length.toLocaleString()} words · estimated {Math.round(words.current.length / (150 * rate[0]))} min read</p>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
