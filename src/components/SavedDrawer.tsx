import { motion, AnimatePresence } from "framer-motion";
import { X, Bookmark, Star } from "lucide-react";
import { useLocation } from "wouter";
import { useRecent } from "@/contexts/RecentContext";

interface Props { open: boolean; onClose: () => void; }

export default function SavedDrawer({ open, onClose }: Props) {
  const { savedTools, toggleSaved } = useRecent();
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
              <div className="flex items-center gap-2"><Bookmark className="w-4 h-4 text-primary" /><h2 className="text-base font-bold">Saved Tools</h2></div>
              <button onClick={onClose} className="p-2 hover:bg-accent rounded-lg"><X className="w-4 h-4" /></button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {savedTools.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 p-8 text-center">
                  <Star className="w-10 h-10 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">No saved tools yet. Bookmark your favourite tools from the home page.</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {savedTools.map((tool) => (
                    <div key={tool.path} className="flex items-center gap-3 px-5 py-3 hover:bg-accent/40 transition-colors">
                      <button className="flex-1 flex items-center gap-3 text-left" onClick={() => { setLocation(tool.path); onClose(); }} data-testid={`saved-tool-${tool.path}`}>
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0"><Star className="w-4 h-4 text-primary" /></div>
                        <p className="text-sm font-medium text-foreground">{tool.label}</p>
                      </button>
                      <button onClick={() => toggleSaved(tool)} className="p-1.5 hover:bg-destructive/10 rounded-lg" data-testid={`unsave-tool-${tool.path}`}><X className="w-3.5 h-3.5 text-muted-foreground" /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
