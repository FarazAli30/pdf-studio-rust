import { motion, AnimatePresence } from "framer-motion";
import { X, Clock, Trash2, FileText } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { useRecent } from "@/contexts/RecentContext";

function formatBytes(b: number) { if(!b)return"0 B"; const k=1024,s=["B","KB","MB","GB"],i=Math.floor(Math.log(b)/Math.log(k)); return `${parseFloat((b/Math.pow(k,i)).toFixed(1))} ${s[i]}`; }
function timeAgo(ms: number) { const d = Date.now()-ms; if(d<60000)return"just now"; if(d<3600000)return`${Math.floor(d/60000)}m ago`; if(d<86400000)return`${Math.floor(d/3600000)}h ago`; return`${Math.floor(d/86400000)}d ago`; }

interface Props { open: boolean; onClose: () => void; }

export default function RecentDrawer({ open, onClose }: Props) {
  const { recentItems, clearRecent } = useRecent();
  const [, setLocation] = useLocation();

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/40 z-50 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            initial={{ opacity: 0, x: "100%" }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed right-0 top-0 bottom-0 w-full max-w-sm bg-background border-l border-border shadow-2xl z-50 flex flex-col"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="flex items-center gap-2"><Clock className="w-4 h-4 text-primary" /><h2 className="text-base font-bold">Recent Files</h2></div>
              <button onClick={onClose} className="p-2 hover:bg-accent rounded-lg"><X className="w-4 h-4" /></button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {recentItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 p-8 text-center">
                  <Clock className="w-10 h-10 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">No recent files yet. Files you process will appear here.</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {recentItems.map((item) => (
                    <button key={item.id} onClick={() => { setLocation(item.toolPath); onClose(); }} className="w-full flex items-center gap-3 px-5 py-3 hover:bg-accent/40 transition-colors text-left" data-testid={`recent-item-${item.id}`}>
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0"><FileText className="w-4 h-4 text-primary" /></div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate text-foreground">{item.name}</p>
                        <p className="text-xs text-muted-foreground">{item.tool} · {formatBytes(item.size)} · {timeAgo(item.time)}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {recentItems.length > 0 && (
              <div className="px-5 py-4 border-t border-border">
                <Button variant="outline" onClick={clearRecent} className="w-full gap-2 text-muted-foreground" data-testid="clear-recent-button"><Trash2 className="w-4 h-4" /> Clear history</Button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
