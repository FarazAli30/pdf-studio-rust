const PIPER_BASE = "/piper/";
const VOICES_BASE = "/piper/voices/";
const ONNX_RT_BASE = "/ort/"; // ORT 1.17.0 — matched to piper-wasm worker
const MODEL_NAME = "en_US-lessac-medium";

export type PiperModelFiles = { onnx: File | null; config: File | null; onnxUrl?: string; configUrl?: string };

let _model: PiperModelFiles | null = null;
let _worker: Worker | null = null;
let _blobsCache: Record<string, Blob> | null = null;

function getWorker(): Worker {
  if (!_worker) _worker = new Worker(PIPER_BASE + "piper_worker.js");
  return _worker;
}

export function hasPiperModel() { return _model !== null; }
export function getModelName() { return _model ? MODEL_NAME : ""; }

export function setPiperModel(m: PiperModelFiles) {
  _model = m; _blobsCache = null;
  _worker?.terminate(); _worker = null;
}

export function clearPiperCache() { _blobsCache = null; }

// Try loading model from /piper/voices/ automatically
export async function autoLoadModel(): Promise<boolean> {
  try {
    const onnxUrl = VOICES_BASE + MODEL_NAME + ".onnx";
    const cfgUrl = VOICES_BASE + MODEL_NAME + ".onnx.json";
    const [oRes, cRes] = await Promise.all([fetch(onnxUrl), fetch(cfgUrl)]);
    if (!oRes.ok || !cRes.ok) return false;
    setPiperModel({ onnx: null, config: null, onnxUrl, configUrl: cfgUrl });
    return true;
  } catch { return false; }
}

function chunkText(text: string, max = 280): string[] {
  const sents = text.match(/[^.!?\n]+[.!?\n]*/g) ?? [text];
  const out: string[] = []; let cur = "";
  for (const s of sents) {
    if ((cur + s).length > max && cur) { out.push(cur.trim()); cur = s; }
    else cur += s;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.length ? out : [text];
}

async function buildBlobs(): Promise<Record<string, Blob>> {
  if (!_model) throw new Error("No model");
  const getBlob = async (f: File | null, url?: string) =>
    f ? new Blob([await f.arrayBuffer()], { type: "application/octet-stream" })
      : await fetch(url!).then(r => r.blob());

  const [onnxB, cfgB, jsB, wasmB, dataB, ortJsB] = await Promise.all([
    getBlob(_model.onnx, _model.onnxUrl),
    getBlob(_model.config, _model.configUrl),
    fetch(PIPER_BASE + "piper_phonemize.js").then(r => r.blob()),
    fetch(PIPER_BASE + "piper_phonemize.wasm").then(r => r.blob()),
    fetch(PIPER_BASE + "piper_phonemize.data").then(r => r.blob()),
    fetch(ONNX_RT_BASE + "ort.min.js").then(r => r.blob()),
  ]);
  return {
    ["/model.onnx"]: onnxB,
    ["/model.onnx.json"]: cfgB,
    [PIPER_BASE + "piper_phonemize.js"]: jsB,
    [PIPER_BASE + "piper_phonemize.wasm"]: wasmB,
    [PIPER_BASE + "piper_phonemize.data"]: dataB,
    [ONNX_RT_BASE + "ort.min.js"]: ortJsB,
  };
}

async function getBlobs(onStatus?: (s: string) => void): Promise<Record<string, Blob>> {
  if (_blobsCache) return _blobsCache;
  onStatus?.("Loading voice model…");
  _blobsCache = await buildBlobs();
  return _blobsCache;
}

// Call after model is loaded to pre-fetch all blobs in background
export function prewarmPiper() {
  if (_model && !_blobsCache) buildBlobs().then(b => { _blobsCache = b; }).catch(() => {});
}

function workerSynth(blobs: Record<string, Blob>, text: string): Promise<Blob> {
  const w = getWorker();
  return new Promise((resolve, reject) => {
    const handler = (e: MessageEvent) => {
      const d = e.data;
      if (d.kind === "fetch") return;
      if (d.kind === "output") { w.removeEventListener("message", handler); resolve(d.file as Blob); }
      if (d.kind === "stderr") { w.removeEventListener("message", handler); reject(new Error(d.message)); }
      if (d.kind === "complete") w.removeEventListener("message", handler);
    };
    w.addEventListener("message", handler);
    w.postMessage({
      kind: "init", input: text, speakerId: null, blobs,
      piperPhonemizeJsUrl: PIPER_BASE + "piper_phonemize.js",
      piperPhonemizeWasmUrl: PIPER_BASE + "piper_phonemize.wasm",
      piperPhonemizeDataUrl: PIPER_BASE + "piper_phonemize.data",
      modelUrl: "/model.onnx", modelConfigUrl: "/model.onnx.json",
      onnxruntimeUrl: ONNX_RT_BASE,
    });
  });
}

function mergeWavs(arrays: Uint8Array[]): ArrayBuffer {
  const hdr = 44;
  const pcmSize = arrays.reduce((s, a) => s + a.length - hdr, 0);
  const out = new Uint8Array(hdr + pcmSize);
  out.set(arrays[0].slice(0, hdr));
  const dv = new DataView(out.buffer);
  dv.setUint32(4, 36 + pcmSize, true);
  dv.setUint32(40, pcmSize, true);
  let off = hdr;
  for (const a of arrays) { out.set(a.slice(hdr), off); off += a.length - hdr; }
  return out.buffer;
}

function wavDuration(buf: ArrayBuffer): number {
  const dv = new DataView(buf);
  const sampleRate = dv.getUint32(24, true);
  const byteRate = dv.getUint32(28, true);
  const dataSize = dv.getUint32(40, true);
  return byteRate > 0 ? dataSize / byteRate : (buf.byteLength - 44) / (sampleRate * 2);
}

export interface SynthResult {
  wav: ArrayBuffer;
  sentences: string[];
  // start time (s) of each sentence within the wav
  sentenceTimings: number[];
  totalDuration: number;
}

export async function piperSynth(
  text: string,
  onStatus?: (s: string) => void,
): Promise<SynthResult | null> {
  if (!_model) return null;
  const blobs = await getBlobs(onStatus);
  const sentences = (text.match(/[^.!?\n]+[.!?\n]*/g) ?? [text]).map(s => s.trim()).filter(Boolean);
  if (!sentences.length) return null;

  // Synthesize each sentence separately to get per-sentence durations for timing
  const wavArrays: Uint8Array[] = [];
  const sentenceTimings: number[] = [];
  let elapsed = 0;

  for (let i = 0; i < sentences.length; i++) {
    onStatus?.(`Synthesizing ${i + 1}/${sentences.length}…`);
    const blob = await workerSynth(blobs, sentences[i]);
    const arr = new Uint8Array(await blob.arrayBuffer());
    sentenceTimings.push(elapsed);
    elapsed += wavDuration(arr.buffer);
    wavArrays.push(arr);
  }

  onStatus?.("");
  const wav = (wavArrays.length === 1
    ? wavArrays[0].buffer.slice(wavArrays[0].byteOffset, wavArrays[0].byteOffset + wavArrays[0].byteLength)
    : mergeWavs(wavArrays)) as ArrayBuffer;

  return { wav, sentences, sentenceTimings, totalDuration: elapsed };
}

// Simple full-text synthesis without timing (for multi-page export)
export async function piperSpeak(
  text: string,
  onStatus?: (s: string) => void,
): Promise<ArrayBuffer | null> {
  if (!_model) return null;
  const blobs = await getBlobs(onStatus);
  const chunks = chunkText(text);
  const wavBlobs: Blob[] = [];
  for (let i = 0; i < chunks.length; i++) {
    onStatus?.(`Synthesizing ${i + 1}/${chunks.length}…`);
    wavBlobs.push(await workerSynth(blobs, chunks[i]));
  }
  onStatus?.("");
  if (!wavBlobs.length) return null;
  const arrays = await Promise.all(wavBlobs.map(b => b.arrayBuffer().then(a => new Uint8Array(a))));
  return arrays.length === 1
    ? arrays[0].buffer.slice(arrays[0].byteOffset, arrays[0].byteOffset + arrays[0].byteLength)
    : mergeWavs(arrays);
}
