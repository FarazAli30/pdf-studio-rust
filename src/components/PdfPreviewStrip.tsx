import { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import { ChevronLeft, ChevronRight } from "lucide-react";

function PageThumb({ proxy, pageIndex, width = 80 }: { proxy: pdfjsLib.PDFDocumentProxy; pageIndex: number; width?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const page = await proxy.getPage(pageIndex + 1);
        const vp = page.getViewport({ scale: width / page.getViewport({ scale: 1 }).width });
        if (cancelled || !ref.current) return;
        ref.current.width = vp.width; ref.current.height = vp.height;
        await page.render({ canvas: ref.current, canvasContext: ref.current.getContext("2d")!, viewport: vp }).promise;
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [proxy, pageIndex, width]);
  return <canvas ref={ref} className="w-full h-full object-contain" />;
}

interface Props {
  proxy: pdfjsLib.PDFDocumentProxy;
  pageCount: number;
  label?: string;
  compact?: boolean;
}

export default function PdfPreviewStrip({ proxy, pageCount, label, compact }: Props) {
  const [page, setPage] = useState(0);
  const maxVisible = compact ? 3 : 5;
  const start = Math.max(0, Math.min(page, pageCount - maxVisible));
  const visible = Array.from({ length: Math.min(maxVisible, pageCount) }, (_, i) => start + i);

  return (
    <div className="space-y-2">
      {label && <p className="text-xs text-muted-foreground font-medium">{label}</p>}
      <div className="flex items-center gap-2">
        {pageCount > maxVisible && (
          <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
            className="p-1 rounded hover:bg-accent disabled:opacity-30">
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}
        <div className="flex gap-2 overflow-hidden flex-1">
          {visible.map(i => (
            <div key={i} className="flex-1 min-w-0 rounded-lg border border-border bg-white overflow-hidden shadow-sm" style={{ aspectRatio: "3/4" }}>
              <PageThumb proxy={proxy} pageIndex={i} width={compact ? 60 : 80} />
              <p className="text-[9px] text-center text-muted-foreground py-0.5">{i + 1}</p>
            </div>
          ))}
        </div>
        {pageCount > maxVisible && (
          <button onClick={() => setPage(p => Math.min(pageCount - maxVisible, p + 1))} disabled={start + maxVisible >= pageCount}
            className="p-1 rounded hover:bg-accent disabled:opacity-30">
            <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>
      {pageCount > maxVisible && (
        <p className="text-[10px] text-center text-muted-foreground">Showing {start+1}–{Math.min(start+maxVisible, pageCount)} of {pageCount} pages</p>
      )}
    </div>
  );
}
