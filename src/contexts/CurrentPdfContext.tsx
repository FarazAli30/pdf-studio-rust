import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export interface PdfState {
  bytes: Uint8Array | null;
  name: string;
  originalSize: number;
  pageCount: number;
  proxy: pdfjsLib.PDFDocumentProxy | null;
  history: Array<{ bytes: Uint8Array; name: string; pageCount: number; proxy: pdfjsLib.PDFDocumentProxy | null; originalSize: number }>;
}

interface PdfCtxType {
  state: PdfState;
  update: (patch: Partial<PdfState> & { bytes?: Uint8Array }) => void;
  undo: () => void;
}

const defaultState: PdfState = { bytes: null, name: "", originalSize: 0, pageCount: 0, proxy: null, history: [] };

const PdfCtx = createContext<PdfCtxType>({ state: defaultState, update: () => {}, undo: () => {} });

export function CurrentPdfProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PdfState>(defaultState);

  const update = useCallback((patch: Partial<PdfState>) => {
    setState(prev => {
      const next = { ...prev, ...patch };
      // Auto-track history when bytes change
      if (patch.bytes && patch.bytes !== prev.bytes && prev.bytes) {
        next.history = [...(prev.history || []).slice(-9), {
          bytes: prev.bytes, name: prev.name, pageCount: prev.pageCount,
          proxy: prev.proxy, originalSize: prev.originalSize,
        }];
      }
      return next;
    });
    // Async: load pdfjs proxy when bytes change
    if (patch.bytes) {
      pdfjsLib.getDocument({ data: patch.bytes.slice() }).promise
        .then(p => setState(prev => ({ ...prev, proxy: p, pageCount: p.numPages })))
        .catch(() => {});
    }
  }, []);

  const undo = useCallback(() => setState(prev => {
    if (!prev.history?.length) return prev;
    const last = prev.history[prev.history.length - 1];
    return { ...prev, ...last, history: prev.history.slice(0, -1) };
  }), []);

  return <PdfCtx.Provider value={{ state, update, undo }}>{children}</PdfCtx.Provider>;
}

export const useCurrentPdf = () => useContext(PdfCtx);
// Alias matching image app pattern
export const usePdf = useCurrentPdf;
