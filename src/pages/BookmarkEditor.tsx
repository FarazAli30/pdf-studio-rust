import { useState } from "react";
import { motion } from "framer-motion";
import { BookMarked, ChevronRight, ChevronDown, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import FileDropZone from "@/components/FileDropZone";
import { readBookmarks, bytesOf, type BookmarkNode } from "@/lib/backend";


interface BmNode { id: string; title: string; page: number; children: BmNode[]; open: boolean; }

function uid() { return Math.random().toString(36).slice(2, 8); }

function toNodes(items: BookmarkNode[]): BmNode[] {
  return items.map(i => ({ id: uid(), title: i.title, page: i.pageIndex == null ? 0 : i.pageIndex + 1, children: toNodes(i.children), open: false }));
}

function BmRow({ node, depth, onRename, onDelete, onToggle }: { node: BmNode; depth: number; onRename: (id: string, t: string) => void; onDelete: (id: string) => void; onToggle: (id: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(node.title);
  return (
    <div>
      <div className="flex items-center gap-1 hover:bg-accent/30 rounded px-2 py-1 group" style={{ paddingLeft: `${8 + depth * 16}px` }}>
        {node.children.length > 0
          ? <button onClick={() => onToggle(node.id)} className="text-muted-foreground">{node.open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}</button>
          : <span className="w-3.5" />}
        {editing
          ? <Input autoFocus value={draft} onChange={e => setDraft(e.target.value)} onBlur={() => { onRename(node.id, draft); setEditing(false); }} onKeyDown={e => { if (e.key === "Enter") { onRename(node.id, draft); setEditing(false); } }} className="h-6 text-xs flex-1" />
          : <span className="text-sm flex-1 cursor-pointer" onDoubleClick={() => setEditing(true)}>{node.title || <span className="text-muted-foreground italic">Untitled</span>}</span>}
        <span className="text-xs text-muted-foreground mr-2">p{node.page}</span>
        <button onClick={() => onDelete(node.id)} className="opacity-0 group-hover:opacity-100 text-destructive"><Trash2 className="w-3 h-3" /></button>
      </div>
      {node.open && node.children.map(c => <BmRow key={c.id} node={c} depth={depth + 1} onRename={onRename} onDelete={onDelete} onToggle={onToggle} />)}
    </div>
  );
}

function deleteNode(nodes: BmNode[], id: string): BmNode[] {
  return nodes.filter(n => n.id !== id).map(n => ({ ...n, children: deleteNode(n.children, id) }));
}
function renameNode(nodes: BmNode[], id: string, title: string): BmNode[] {
  return nodes.map(n => n.id === id ? { ...n, title } : { ...n, children: renameNode(n.children, id, title) });
}
function toggleNode(nodes: BmNode[], id: string): BmNode[] {
  return nodes.map(n => n.id === id ? { ...n, open: !n.open } : { ...n, children: toggleNode(n.children, id) });
}

export default function BookmarkEditor() {
  const [file, setFile] = useState<File | null>(null);
  const [nodes, setNodes] = useState<BmNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analyze = async (f: File) => {
    setFile(f); setNodes([]); setError(null); setLoading(true);
    try {
      const bms = toNodes((await readBookmarks(await bytesOf(f))).bookmarks);
      setNodes(bms);
      if (!bms.length) setError("No bookmarks found in this PDF.");
    } catch (e: unknown) { setError((e as Error).message); }
    finally { setLoading(false); }
  };

  const exportTOC = () => {
    const flatten = (ns: BmNode[], depth = 0): string => ns.map(n => `${"  ".repeat(depth)}${n.title} ......... ${n.page}\n${flatten(n.children, depth + 1)}`).join("");
    const url = URL.createObjectURL(new Blob([flatten(nodes)], { type: "text/plain" })), a = document.createElement("a");
    a.href = url; a.download = "bookmarks.txt"; a.click(); URL.revokeObjectURL(url);
  };

  const countAll = (ns: BmNode[]): number => ns.reduce((s, n) => s + 1 + countAll(n.children), 0);
  const reset = () => { setFile(null); setNodes([]); setError(null); };

  return (
    <div className="max-w-2xl mx-auto px-6 py-10 pb-24">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center"><BookMarked className="w-5 h-5 text-amber-600" /></div>
          <h1 className="text-2xl font-bold">Bookmark Editor</h1>
        </div>
        <p className="text-muted-foreground mb-8">View, rename, and delete PDF bookmarks. Double-click a title to rename.</p>
        <div className="space-y-5">
          <FileDropZone onFileSelect={analyze} selectedFile={file} onClear={reset} />
          {loading && <p className="text-sm text-muted-foreground text-center py-4">Loading bookmarks…</p>}
          {error && <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">{error}</div>}
          {nodes.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">{countAll(nodes)} bookmarks</p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setNodes(ns => ns.map(n => ({ ...n, open: true })))} className="text-xs">Expand all</Button>
                  <Button size="sm" variant="outline" onClick={exportTOC} className="text-xs">Export TOC</Button>
                </div>
              </div>
              <div className="bg-card border border-border rounded-2xl py-2 max-h-96 overflow-y-auto">
                {nodes.map(n => (
                  <BmRow key={n.id} node={n} depth={0}
                    onRename={(id, t) => setNodes(prev => renameNode(prev, id, t))}
                    onDelete={id => setNodes(prev => deleteNode(prev, id))}
                    onToggle={id => setNodes(prev => toggleNode(prev, id))} />
                ))}
              </div>
              <p className="text-xs text-muted-foreground">Double-click any title to rename it inline.</p>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
