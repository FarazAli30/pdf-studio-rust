import { useState, useCallback } from "react";
import { useCurrentPdf } from "@/contexts/CurrentPdfContext";

export function usePdfTool() {
  const [file, setFileState] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultBytes, setResultBytes] = useState<Uint8Array | null>(null);
  const [outputSize, setOutputSize] = useState(0);
  const { update: setPdf } = useCurrentPdf();

  const setFile = useCallback(async (f: File | null) => {
    setFileState(f);
    if (f) {
      const bytes = await f.arrayBuffer().then(ab => new Uint8Array(ab));
      setPdf({ bytes, name: f.name, originalSize: f.size });
    }
  }, [setPdf]);

  const setResult = useCallback((bytes: Uint8Array) => {
    setResultBytes(bytes); setOutputSize(bytes.byteLength); setIsSuccess(true);
  }, []);

  const reset = useCallback(() => {
    setFileState(null); setIsSuccess(false); setError(null); setResultBytes(null); setOutputSize(0);
  }, []);

  return { file, setFile, isProcessing, setIsProcessing, isSuccess, setIsSuccess, error, setError, resultBytes, setResultBytes: setResult, outputSize, reset };
}
