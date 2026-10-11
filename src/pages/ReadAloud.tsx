import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import * as pdfjsLib from "pdfjs-dist";
import {
  Volume2, Play, Pause, Square, ChevronLeft, ChevronRight,
  Download, Loader2, CheckCircle2, AudioWaveform,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import FileDropZone from "@/components/FileDropZone";
import { useToast } from "@/hooks/use-toast";
import {
  autoLoadModel, setPiperModel, piperSynth, piperSpeak,
  hasPiperModel, clearPiperCache, prewarmPiper, type PiperModelFiles, type SynthResult,
} from "@/lib/tts";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).href;

function dlWav(buf: ArrayBuffer, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
  a.download = name; a.click(); URL.revokeObjectURL(a.href);
}

type PageCache = Record<number, SynthResult | "generating" | "error">;

export default function ReadAloud() {
  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState<string[]>([]);
  const [cur, setCur] = useState(0);
  const [isExtracting, setIsExtracting] = useState(false);
  const [modelStatus, setModelStatus] = useState<"loading" | "ready" | "none">("loading");
  const [modelName, setModelName] = useState("");
  const [pageCache, setPageCache] = useState<PageCache>({});
  const [playState, setPlayState] = useState<"idle" | "playing" | "paused">("idle");
  const [activeSent, setActiveSent] = useState(-1);
  const [playProgress, setPlayProgress] = useState(0);
  const [genMsg, setGenMsg] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string>("");
  const sentRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const pendingRef = useRef<{ onnx?: File; json?: File }>({});
  // refs for current synth result so timeupdate closure is never stale
  const synthRef = useRef<SynthResult | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    autoLoadModel().then(ok => {
      if (ok) { setModelStatus("ready"); setModelName("en_US-lessac-medium"); prewarmPiper(); }
      else setModelStatus("none");
    });
  }, []);

  const setCacheEntry = useCallback((idx: number, val: SynthResult | "generating" | "error") =>
    setPageCache(p => ({ ...p, [idx]: val })), []);

  const generatePage = useCallback(async (idx: number, pagesArr: string[]) => {
    if (!hasPiperModel()) return;
    const text = pagesArr[idx];
    if (!text || text.startsWith("[Page")) return;
    setCacheEntry(idx, "generating");
    try {
      const result = await piperSynth(text, idx === 0 ? m => setGenMsg(m) : undefined);
      setCacheEntry(idx, result ?? "error");
    } catch { setCacheEntry(idx, "error"); }
    if (idx === 0) setGenMsg("");
  }, [setCacheEntry]);

  useEffect(() => {
    if (!pages.length || modelStatus === "loading") return;
    setPageCache({});
    (async () => {
      await generatePage(0, pages);
      for (let i = 1; i < pages.length; i++) await generatePage(i, pages);
    })();
  }, [pages, modelStatus]); // eslint-disable-line

  const stopAudio = useCallback(() => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ""; }
    if (audioUrlRef.current) { URL.revokeObjectURL(audioUrlRef.current); audioUrlRef.current = ""; }
    synthRef.current = null;
    setPlayState("idle"); setActiveSent(-1); setPlayProgress(0);
  }, []);

  const attachAudio = useCallback((result: SynthResult) => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ""; }
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    const url = URL.createObjectURL(new Blob([result.wav], { type: "audio/wav" }));
    audioUrlRef.current = url;
    synthRef.current = result;
    const audio = new Audio(url);

    audio.ontimeupdate = () => {
      const t = audio.currentTime;
      const r = synthRef.current;
      if (!r) return;
      setPlayProgress(r.totalDuration > 0 ? t / r.totalDuration : 0);
      let idx = r.sentenceTimings.length - 1;
      for (let i = 0; i < r.sentenceTimings.length; i++) {
        if (r.sentenceTimings[i] > t) { idx = i - 1; break; }
      }
      setActiveSent(idx);
      if (idx >= 0) sentRefs.current[idx]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    };
    audio.onended = () => { setPlayState("idle"); setActiveSent(-1); setPlayProgress(0); };
    audio.onerror = () => { setPlayState("idle"); setActiveSent(-1); };
    audioRef.current = audio;
    return audio;
  }, []);

  const handlePlay = useCallback(() => {
    const cached = pageCache[cur];
    if (!cached || cached === "generating" || cached === "error") return;
    if (playState === "paused" && audioRef.current) {
      audioRef.current.play().catch(() => {});
      setPlayState("playing");
      return;
    }
    const audio = attachAudio(cached as SynthResult);
    audio.play().catch(() => {});
    setPlayState("playing");
  }, [pageCache, cur, playState, attachAudio]);

  const handlePause = useCallback(() => {
    audioRef.current?.pause();
    setPlayState("paused");
  }, []);

  const changePage = (next: number) => {
    stopAudio();
    setCur(next);
    // pre-generate if needed
    setPageCache(p => {
      if (!p[next]) generatePage(next, pages);
      return p;
    });
  };

  const handleFile = async (f: File) => {
    stopAudio(); setFile(f); setIsExtracting(true); setPages([]); setCur(0); setPageCache({});
    try {
      const doc = await pdfjsLib.getDocument({ data: await f.arrayBuffer() }).promise;
      const texts: string[] = [];
      for (let i = 1; i <= doc.numPages; i++) {
        const pg = await doc.getPage(i);
        const c = await pg.getTextContent();
        texts.push((c.items as Array<{ str: string }>).map(it => it.str).join(" ").trim() || `[Page ${i}: no selectable text]`);
      }
      setPages(texts);
    } catch (e) { toast({ title: "Error", description: (e as Error).message, variant: "destructive" }); }
    finally { setIsExtracting(false); }
  };

  const tryManualLoad = (p: { onnx?: File; json?: File }) => {
    if (!p.onnx || !p.json) return;
    clearPiperCache();
    setPiperModel({ onnx: p.onnx, config: p.json } as PiperModelFiles);
    setModelStatus("ready"); setModelName(p.onnx.name);
    setPageCache({});
    prewarmPiper();
    toast({ title: "Model loaded", description: p.onnx.name });
    if (pages.length) (async () => {
      await generatePage(0, pages);
      for (let i = 1; i < pages.length; i++) await generatePage(i, pages);
    })();
  };

  const saveCurrentPage = async () => {
    const cached = pageCache[cur];
    if (cached && cached !== "generating" && cached !== "error") {
      dlWav((cached as SynthResult).wav, `page-${cur + 1}.wav`);
      toast({ title: "Downloaded", description: `page-${cur + 1}.wav` }); return;
    }
    if (!hasPiperModel()) return;
    setIsSaving(true); setSaveMsg(`Generating page ${cur + 1}…`);
    try {
      const buf = await piperSpeak(pages[cur], m => setSaveMsg(m || `Generating page ${cur + 1}…`));
      if (buf) dlWav(buf, `page-${cur + 1}.wav`);
    } catch (e) { toast({ title: "Error", description: (e as Error).message, variant: "destructive" }); }
    setIsSaving(false); setSaveMsg("");
  };

  const saveAll = async () => {
    if (!hasPiperModel()) return;
    setIsSaving(true); let ok = 0;
    for (let i = 0; i < pages.length; i++) {
      setSaveMsg(`Saving ${i + 1}/${pages.length}…`);
      const c = pageCache[i];
      if (c && c !== "generating" && c !== "error") { dlWav((c as SynthResult).wav, `page-${i + 1}.wav`); ok++; }
      else {
        try {
          const buf = await piperSpeak(pages[i], m => setSaveMsg(m || `Saving ${i + 1}/${pages.length}…`));
          if (buf) { dlWav(buf, `page-${i + 1}.wav`); ok++; }
        } catch { /**/ }
      }
      await new Promise(r => requestAnimationFrame(r));
    }
    setIsSaving(false); setSaveMsg("");
    toast({ title: "Done", description: `${ok}/${pages.length} pages saved` });
  };

  const saveAllCombined = async () => {
    if (!hasPiperModel()) return;
    setIsSaving(true); setSaveMsg("Generating combined…");
    try {
      const buf = await piperSpeak(pages.join(" . "), m => setSaveMsg(m || "Generating combined…"));
      if (buf) { dlWav(buf, "all-pages.wav"); toast({ title: "Saved", description: "all-pages.wav" }); }
    } catch (e) { toast({ title: "Error", description: (e as Error).message, variant: "destructive" }); }
    setIsSaving(false); setSaveMsg("");
  };

  const cached = pageCache[cur];
  const isGenerating = cached === "generating";
  const hasAudio = cached && cached !== "generating" && cached !== "error";
  const synth = hasAudio ? cached as SynthResult : null;
  const sentences = synth?.sentences ?? [];

  return (
    <div className="max-w-2xl mx-auto px-6 py-10 pb-24 md:pb-20">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
            <Volume2 className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Read Aloud</h1>
            <p className="text-xs text-muted-foreground">Piper TTS · offline · high-quality neural voice</p>
          </div>
        </div>

        <div className="space-y-4">
          {/* Model status */}
          <div className="bg-card border border-border rounded-2xl p-4">
            {modelStatus === "loading" && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading voice model…
              </div>
            )}
            {modelStatus === "ready" && (
              <div className="flex items-center gap-2 text-sm text-green-600 font-medium">
                <CheckCircle2 className="w-4 h-4" /> Voice ready: <span className="font-mono text-xs">{modelName}</span>
              </div>
            )}
            {modelStatus === "none" && (
              <div className="space-y-3">
                <p className="text-sm text-amber-600 font-medium">
                  Model not found in <code className="text-xs">/piper/voices/</code> — load manually:
                </p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">.onnx model</span>
                    <input type="file" accept=".onnx"
                      onChange={e => { const f = e.target.files?.[0]; if (f) { pendingRef.current.onnx = f; tryManualLoad(pendingRef.current); } }}
                      className="text-xs file:mr-2 file:rounded file:border-0 file:bg-accent file:px-2 file:py-1 file:text-xs cursor-pointer" />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">.onnx.json config</span>
                    <input type="file" accept=".json"
                      onChange={e => { const f = e.target.files?.[0]; if (f) { pendingRef.current.json = f; tryManualLoad(pendingRef.current); } }}
                      className="text-xs file:mr-2 file:rounded file:border-0 file:bg-accent file:px-2 file:py-1 file:text-xs cursor-pointer" />
                  </label>
                </div>
              </div>
            )}
          </div>

          <FileDropZone onFileSelect={handleFile} selectedFile={file}
            onClear={() => { stopAudio(); setFile(null); setPages([]); setPageCache({}); }} />

          {isExtracting && <p className="text-sm text-muted-foreground animate-pulse text-center">Extracting text…</p>}
          {genMsg && !isExtracting && (
            <div className="flex items-center gap-2 text-xs text-primary bg-primary/5 rounded-xl px-3 py-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" />{genMsg}
            </div>
          )}

          {pages.length > 0 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="space-y-4 bg-card border border-border rounded-2xl p-5">

              {/* Page nav */}
              <div className="flex items-center justify-between">
                <p className="font-semibold text-sm">
                  Page {cur + 1} <span className="text-muted-foreground font-normal">of {pages.length}</span>
                </p>
                <div className="flex items-center gap-2">
                  {isGenerating && (
                    <span className="flex items-center gap-1 text-xs text-primary">
                      <Loader2 className="w-3 h-3 animate-spin" /> generating…
                    </span>
                  )}
                  {hasAudio && (
                    <span className="flex items-center gap-1 text-xs text-green-600">
                      <AudioWaveform className="w-3 h-3" /> ready
                    </span>
                  )}
                  <button onClick={() => changePage(Math.max(0, cur - 1))} disabled={cur === 0}
                    className="p-1.5 rounded-lg border border-border disabled:opacity-30 hover:bg-accent">
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button onClick={() => changePage(Math.min(pages.length - 1, cur + 1))} disabled={cur === pages.length - 1}
                    className="p-1.5 rounded-lg border border-border disabled:opacity-30 hover:bg-accent">
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Player */}
              <div className="flex gap-2">
                {playState === "idle" && (
                  <Button onClick={handlePlay} disabled={!hasAudio || isGenerating} className="flex-1 gap-2">
                    {isGenerating
                      ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</>
                      : <><Play className="w-4 h-4" /> Play</>}
                  </Button>
                )}
                {playState === "playing" && (
                  <>
                    <Button onClick={handlePause} variant="outline" className="flex-1 gap-2">
                      <Pause className="w-4 h-4" /> Pause
                    </Button>
                    <Button onClick={stopAudio} variant="outline" className="gap-2 px-3">
                      <Square className="w-4 h-4" />
                    </Button>
                  </>
                )}
                {playState === "paused" && (
                  <>
                    <Button onClick={handlePlay} className="flex-1 gap-2">
                      <Play className="w-4 h-4" /> Resume
                    </Button>
                    <Button onClick={stopAudio} variant="outline" className="gap-2 px-3">
                      <Square className="w-4 h-4" />
                    </Button>
                  </>
                )}
                <Button variant="outline" onClick={saveCurrentPage}
                  disabled={isSaving || (!hasAudio && !hasPiperModel())}
                  className="gap-1.5 px-3" title="Download page WAV">
                  <Download className="w-4 h-4" />
                </Button>
              </div>

              {/* Progress bar */}
              {playState !== "idle" && (
                <div className="w-full h-1.5 bg-accent rounded-full overflow-hidden">
                  <motion.div className="h-full bg-primary rounded-full"
                    animate={{ width: `${playProgress * 100}%` }}
                    transition={{ duration: 0.15, ease: "linear" }} />
                </div>
              )}

              {/* Text with sentence highlighting */}
              <div className="rounded-xl bg-accent/30 border border-border/50 p-4 max-h-60 overflow-y-auto text-sm leading-loose">
                {sentences.length > 0
                  ? sentences.map((s, i) => (
                      <span key={i} ref={el => { sentRefs.current[i] = el; }}
                        className={`transition-all duration-150 rounded-sm px-0.5 cursor-default
                          ${activeSent === i
                            ? "bg-primary text-primary-foreground font-semibold"
                            : "text-foreground/75"}`}>
                        {s}{" "}
                      </span>
                    ))
                  : <p className="text-muted-foreground italic text-xs">
                      {isGenerating ? "Generating audio…" : pages[cur]?.startsWith("[Page") ? pages[cur] : "Ready"}
                    </p>}
              </div>

              {/* Download section */}
              <div className="border-t border-border pt-4 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                  <Download className="w-3.5 h-3.5" /> Export WAV
                </p>
                <AnimatePresence>
                  {(isSaving || saveMsg) && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      className="flex items-center gap-2 text-xs text-primary">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />{saveMsg}
                    </motion.div>
                  )}
                </AnimatePresence>
                <div className="flex gap-2 flex-wrap">
                  <Button variant="outline" size="sm" onClick={saveCurrentPage}
                    disabled={isSaving || (!hasAudio && !hasPiperModel())} className="gap-1.5 text-xs">
                    <Download className="w-3.5 h-3.5" /> Page {cur + 1}
                  </Button>
                  <Button variant="outline" size="sm" onClick={saveAll}
                    disabled={isSaving || !hasPiperModel()} className="gap-1.5 text-xs">
                    <Download className="w-3.5 h-3.5" /> All separate
                  </Button>
                  <Button variant="outline" size="sm" onClick={saveAllCombined}
                    disabled={isSaving || !hasPiperModel()} className="gap-1.5 text-xs">
                    <Download className="w-3.5 h-3.5" /> All combined
                  </Button>
                </div>
                {hasAudio && (
                  <p className="text-[10px] text-green-600">✓ Page {cur + 1} audio cached — download is instant</p>
                )}
              </div>
            </motion.div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
