import { useState, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Merge, Scissors, Archive, RotateCw, Stamp, Lock, Unlock,
  Copy, Shuffle, FileText, Info, ArrowRight, Upload, Zap,
  Image, AlignLeft, PenLine, Palette, ScanText,
  Search, Table2, List, Volume2, Settings2, Star, ImageIcon, FileDown, Github,
  EyeOff, Highlighter, Scaling, Layers, Wrench,
  Hash, BookOpen, LayoutGrid, ArrowLeftRight, Printer, CalendarDays, KeyRound,
  QrCode, Link2, Type, Grid2x2, TextSearch, Crop, Bookmark, PenTool,
  RotateCcw, Sparkles, Sun, Brain, Layout, Receipt, Smartphone,
  Headphones, GitCompare, Paperclip, BookMarked, BarChart2,
} from "lucide-react";
import { useRecent } from "@/contexts/RecentContext";
import { cn } from "@/lib/utils";

type Category = "All" | "Organize" | "Convert" | "Transform" | "Security" | "OCR" | "Analyze" | "Edit" | "Enhance" | "Smart";

const tools: { href: string; label: string; desc: string; icon: React.ElementType; color: string; category: Category }[] = [
  { href: "/merge", label: "Merge PDFs", desc: "Combine multiple PDFs into one file", icon: Merge, color: "bg-violet-100 text-violet-600", category: "Organize" },
  { href: "/split", label: "Split PDF", desc: "Divide a PDF into separate files", icon: Scissors, color: "bg-blue-100 text-blue-600", category: "Organize" },
  { href: "/extract", label: "Extract Pages", desc: "Pull specific pages into a new PDF", icon: Copy, color: "bg-sky-100 text-sky-600", category: "Organize" },
  { href: "/reorder", label: "Reorder Pages", desc: "Drag pages into a new order", icon: Shuffle, color: "bg-indigo-100 text-indigo-600", category: "Organize" },
  { href: "/page-tools", label: "Page Tools", desc: "Rotate, delete, add blank pages, reorder by thumbnail", icon: Settings2, color: "bg-indigo-100 text-indigo-600", category: "Organize" },
  { href: "/pdf-to-jpg", label: "PDF → JPG", desc: "Convert each page to a JPG image with custom quality", icon: Image, color: "bg-yellow-100 text-yellow-600", category: "Convert" },
  { href: "/images-to-pdf", label: "Images → PDF", desc: "Convert JPG, PNG, SVG, HEIC, WebP and more", icon: ImageIcon, color: "bg-pink-100 text-pink-600", category: "Convert" },
  { href: "/txt-to-pdf", label: "TXT → PDF", desc: "Convert plain text files into formatted PDF", icon: FileText, color: "bg-slate-100 text-slate-600", category: "Convert" },
  { href: "/markdown-to-pdf", label: "Markdown → PDF", desc: "Convert .md files to styled PDF with themes", icon: FileText, color: "bg-emerald-100 text-emerald-600", category: "Convert" },
  { href: "/pdf-to-md", label: "PDF → Markdown", desc: "Extract structured Markdown from any text-based PDF", icon: FileDown, color: "bg-indigo-100 text-indigo-600", category: "Convert" },
  { href: "/compress", label: "Compress PDF", desc: "Reduce file size while keeping quality", icon: Archive, color: "bg-amber-100 text-amber-600", category: "Transform" },
  { href: "/rotate", label: "Rotate Pages", desc: "Fix orientation of any pages", icon: RotateCw, color: "bg-orange-100 text-orange-600", category: "Transform" },
  { href: "/watermark", label: "Watermark", desc: "Add text overlay to your PDF", icon: Stamp, color: "bg-rose-100 text-rose-600", category: "Transform" },
  { href: "/header-footer", label: "Header & Footer", desc: "Add page numbers, dates, and custom text to every page", icon: AlignLeft, color: "bg-lime-100 text-lime-600", category: "Transform" },
  { href: "/sign-pdf", label: "Sign PDF", desc: "Insert a signature image at a chosen position", icon: PenLine, color: "bg-violet-100 text-violet-600", category: "Transform" },
  { href: "/background-color", label: "Background Color", desc: "Add a color tint to page backgrounds", icon: Palette, color: "bg-fuchsia-100 text-fuchsia-600", category: "Transform" },
  { href: "/protect", label: "Password Protect", desc: "Encrypt your PDF with a password", icon: Lock, color: "bg-red-100 text-red-600", category: "Security" },
  { href: "/unlock", label: "Unlock PDF", desc: "Remove password from a PDF", icon: Unlock, color: "bg-emerald-100 text-emerald-600", category: "Security" },
  { href: "/make-searchable", label: "Make Searchable", desc: "OCR-scan scanned PDFs and embed invisible text layer", icon: ScanText, color: "bg-cyan-100 text-cyan-600", category: "OCR" },
  { href: "/smart-search", label: "Smart Search", desc: "Find text in scanned PDFs using OCR", icon: Search, color: "bg-amber-100 text-amber-600", category: "OCR" },
  { href: "/pdf-to-text", label: "Extract Text", desc: "Native extraction or OCR for scanned documents", icon: FileText, color: "bg-teal-100 text-teal-600", category: "Analyze" },
  { href: "/pdf-info", label: "PDF Info", desc: "Inspect, sanitize, and forensically analyze PDFs", icon: Info, color: "bg-slate-100 text-slate-600", category: "Analyze" },
  { href: "/extract-tables", label: "Extract Tables", desc: "Detect tables and export to CSV, JSON, or Markdown", icon: Table2, color: "bg-green-100 text-green-600", category: "Analyze" },
  { href: "/table-of-contents", label: "Table of Contents", desc: "Auto-generate a TOC page from headings", icon: List, color: "bg-orange-100 text-orange-600", category: "Analyze" },
  { href: "/read-aloud", label: "Read Aloud", desc: "Listen to your PDF read with text-to-speech", icon: Volume2, color: "bg-blue-100 text-blue-600", category: "Analyze" },
  { href: "/redact-pdf", label: "Redact PDF", desc: "Draw and embed permanent black redaction boxes", icon: EyeOff, color: "bg-red-100 text-red-600", category: "Edit" },
  { href: "/annotate-pdf", label: "Annotate PDF", desc: "Add highlights, underlines, strikeouts and notes", icon: Highlighter, color: "bg-yellow-100 text-yellow-600", category: "Edit" },
  { href: "/page-size", label: "Page Size Converter", desc: "Convert pages between A4, Letter, Legal and custom sizes", icon: Scaling, color: "bg-purple-100 text-purple-600", category: "Edit" },
  { href: "/flatten-pdf", label: "Flatten Forms", desc: "Convert form fields to static text and remove editable structure", icon: Layers, color: "bg-green-100 text-green-600", category: "Edit" },
  { href: "/repair-pdf", label: "Repair PDF", desc: "Diagnose and rebuild broken or corrupted PDF files", icon: Wrench, color: "bg-orange-100 text-orange-600", category: "Edit" },
  // Organize extras
  { href: "/bates", label: "Bates Numbering", desc: "Stamp sequential legal Bates numbers on every page", icon: Hash, color: "bg-blue-100 text-blue-600", category: "Organize" },
  { href: "/booklet", label: "Booklet Imposition", desc: "Reorder pages for saddle-stitch booklet printing", icon: BookOpen, color: "bg-amber-100 text-amber-600", category: "Organize" },
  { href: "/nup", label: "N-up Layout", desc: "Place 2, 4, 6 or 9 pages per sheet", icon: LayoutGrid, color: "bg-indigo-100 text-indigo-600", category: "Organize" },
  { href: "/reverse-pages", label: "Reverse Pages", desc: "Flip the entire page order of a PDF", icon: ArrowLeftRight, color: "bg-slate-100 text-slate-600", category: "Organize" },
  { href: "/duplex-prep", label: "Duplex Print Prep", desc: "Add blank pages for correct double-sided printing", icon: Printer, color: "bg-cyan-100 text-cyan-600", category: "Organize" },
  { href: "/split-bookmarks", label: "Split by Bookmark", desc: "Split PDF into files at each bookmark entry", icon: Bookmark, color: "bg-purple-100 text-purple-600", category: "Organize" },
  // Transform extras
  { href: "/date-stamp", label: "Date Stamp", desc: "Overlay today's date or custom text on pages", icon: CalendarDays, color: "bg-green-100 text-green-600", category: "Transform" },
  { href: "/qr-stamp", label: "QR Code Stamp", desc: "Generate and embed a QR code on PDF pages", icon: QrCode, color: "bg-slate-100 text-slate-600", category: "Transform" },
  { href: "/crop", label: "Crop / Trim Box", desc: "Set CropBox, TrimBox or BleedBox margins on pages", icon: Crop, color: "bg-rose-100 text-rose-600", category: "Transform" },
  { href: "/whiteboard", label: "PDF Whiteboard", desc: "Draw freehand, lines, arrows and shapes on pages", icon: PenTool, color: "bg-rose-100 text-rose-600", category: "Edit" },
  // Security extras
  { href: "/change-password", label: "Change Password", desc: "Change or remove the password on a protected PDF", icon: KeyRound, color: "bg-orange-100 text-orange-600", category: "Security" },
  // Analyze extras
  { href: "/extract-links", label: "Link Extractor", desc: "Extract all hyperlinks and URL annotations", icon: Link2, color: "bg-blue-100 text-blue-600", category: "Analyze" },
  { href: "/font-inspector", label: "Font Inspector", desc: "List all fonts, embedding status, and page usage", icon: Type, color: "bg-pink-100 text-pink-600", category: "Analyze" },
  { href: "/thumbnails", label: "Thumbnail Generator", desc: "Render every page as a downloadable preview image", icon: Grid2x2, color: "bg-teal-100 text-teal-600", category: "Analyze" },
  { href: "/search-highlight", label: "Search & Highlight", desc: "Find text and permanently highlight all matches", icon: TextSearch, color: "bg-yellow-100 text-yellow-600", category: "Analyze" },
  { href: "/extract-attachments", label: "Attachment Extractor", desc: "Extract embedded file attachments from a PDF", icon: Paperclip, color: "bg-violet-100 text-violet-600", category: "Analyze" },
  { href: "/bookmark-editor", label: "Bookmark Editor", desc: "View, rename and delete PDF bookmarks", icon: BookMarked, color: "bg-amber-100 text-amber-600", category: "Analyze" },
  { href: "/analytics", label: "Analytics Dashboard", desc: "Visual charts of words, images, and fonts per page", icon: BarChart2, color: "bg-blue-100 text-blue-600", category: "Analyze" },
  // Enhance (OpenCV)
  { href: "/deskew", label: "Auto Deskew", desc: "Auto-detect and correct page rotation in scans", icon: RotateCcw, color: "bg-sky-100 text-sky-600", category: "Enhance" },
  { href: "/enhance-scan", label: "Enhance Scan", desc: "Denoise, sharpen and improve contrast in scanned PDFs", icon: Sparkles, color: "bg-amber-100 text-amber-600", category: "Enhance" },
  { href: "/whiten-bg", label: "Background Whitener", desc: "Remove scanner background, make pages crisp white", icon: Sun, color: "bg-yellow-100 text-yellow-600", category: "Enhance" },
  // Smart (AI / OCR)
  { href: "/classify", label: "Document Classifier", desc: "AI detection — invoice, contract, report, form and more", icon: Brain, color: "bg-violet-100 text-violet-600", category: "Smart" },
  { href: "/layout-analyzer", label: "Layout Analyzer", desc: "Detect columns, headers and reading order", icon: Layout, color: "bg-cyan-100 text-cyan-600", category: "Smart" },
  { href: "/detect-signatures", label: "Signature Detector", desc: "Find probable signature regions using contour analysis", icon: PenLine, color: "bg-indigo-100 text-indigo-600", category: "Smart" },
  { href: "/invoice-extractor", label: "Invoice Extractor", desc: "Extract totals, dates and vendor from invoice PDFs", icon: Receipt, color: "bg-green-100 text-green-600", category: "Smart" },
  // Convert extras
  { href: "/heic-to-pdf", label: "HEIC to PDF", desc: "Convert iPhone HEIC photos to PDF in-browser", icon: Smartphone, color: "bg-gray-100 text-gray-600", category: "Convert" },
  { href: "/audiobook", label: "Audiobook Export", desc: "Read PDF aloud with browser speech engine", icon: Headphones, color: "bg-indigo-100 text-indigo-600", category: "Convert" },
  { href: "/compare", label: "PDF Compare", desc: "Pixel-diff two PDF versions and highlight changes", icon: GitCompare, color: "bg-fuchsia-100 text-fuchsia-600", category: "Analyze" },
];

const CATEGORIES: Category[] = ["All", "Organize", "Convert", "Transform", "Security", "OCR", "Analyze", "Edit", "Enhance", "Smart"];

const categoryColors: Record<Category, string> = {
  All: "bg-primary text-primary-foreground",
  Organize: "bg-indigo-500 text-white",
  Convert: "bg-pink-500 text-white",
  Transform: "bg-amber-500 text-white",
  Security: "bg-red-500 text-white",
  OCR: "bg-cyan-500 text-white",
  Analyze: "bg-teal-500 text-white",
  Edit: "bg-violet-500 text-white",
  Enhance: "bg-sky-500 text-white",
  Smart: "bg-emerald-500 text-white",
};

export default function Home() {
  const [, setLocation] = useLocation();
  const [isDragging, setIsDragging] = useState(false);
  const [activeCategory, setActiveCategory] = useState<Category>("All");
  const [twoCol, setTwoCol] = useState(() => {
    try { return localStorage.getItem("pdf-studio-2col") === "1"; } catch { return false; }
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const { recentItems, savedTools, toggleSaved, isSaved } = useRecent();

  const filtered = activeCategory === "All" ? tools : tools.filter((t) => t.category === activeCategory);

  const handleFileSelected = useCallback(() => { setLocation("/merge"); }, [setLocation]);
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type === "application/pdf");
    if (files.length > 0) handleFileSelected();
  }, [handleFileSelected]);

  return (
    <div className="min-h-screen pb-20">

      {/* ── Category Filter — pinned 100% at top ── */}
      <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="px-4 py-3 max-w-5xl mx-auto">
          <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-0.5">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={cn(
                  "flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-semibold transition-all duration-200",
                  activeCategory === cat ? categoryColors[cat] : "bg-accent/60 text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
                data-testid={`category-${cat.toLowerCase()}`}
              >
                {cat}
                {cat !== "All" && (
                  <span className="ml-1.5 text-[10px] opacity-75">
                    {tools.filter(t => t.category === cat).length}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Hero ── */}
      <div className="relative overflow-hidden bg-gradient-to-br from-primary/5 via-violet-50 to-background border-b border-border">
        <div className="absolute inset-0 bg-grid-pattern opacity-30 pointer-events-none" />
        <div className="relative px-6 py-10 md:py-16 max-w-3xl mx-auto text-center space-y-6">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-1.5 rounded-full text-xs font-semibold mb-4">
              <Zap className="w-3 h-3" /> 100% Browser-Based — No Uploads
            </div>
            <h1 className="text-4xl md:text-5xl font-bold text-foreground leading-tight tracking-tight">
              Your PDF Toolkit,<br /><span className="text-primary">Browser-Powered</span>
            </h1>
            <p className="text-muted-foreground text-lg mt-4 max-w-xl mx-auto">
              {tools.length} tools — merge, split, OCR, convert, sign, and more. All private, all local.
            </p>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.15 }}
            className={`relative rounded-2xl border-2 border-dashed transition-all duration-200 cursor-pointer p-10 ${isDragging ? "border-primary bg-primary/5 scale-[1.01]" : "border-border bg-background/80 hover:border-primary/50 hover:bg-accent/20"}`}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            data-testid="home-dropzone"
          >
            <div className="flex flex-col items-center gap-3">
              <motion.div animate={isDragging ? { scale: 1.2, rotate: 5 } : { scale: 1, rotate: 0 }} className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Upload className="w-7 h-7 text-primary" />
              </motion.div>
              <div>
                <p className="font-semibold text-foreground">Drop PDF files here to get started</p>
                <p className="text-sm text-muted-foreground mt-1">or click to browse your files</p>
              </div>
            </div>
          </motion.div>
          <input ref={inputRef} type="file" accept="application/pdf" multiple className="hidden" onChange={() => handleFileSelected()} />
        </div>
      </div>

      {/* ── Tools Grid ── */}
      <div className="px-6 py-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-foreground">
            {activeCategory === "All" ? "All PDF Tools" : `${activeCategory} Tools`}
            <span className="ml-2 text-sm font-normal text-muted-foreground">({filtered.length})</span>
          </h2>
          {/* Two-column toggle — mobile only */}
          <button
            onClick={() => setTwoCol(v => { const next = !v; try { localStorage.setItem("pdf-studio-2col", next ? "1" : "0"); } catch {} return next; })}
            className="md:hidden flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border bg-background text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title={twoCol ? "Switch to 1 column" : "Switch to 2 columns"}
          >
            {twoCol ? (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="flex-shrink-0">
                <rect x="1" y="1" width="12" height="4" rx="1" fill="currentColor"/>
                <rect x="1" y="7" width="12" height="4" rx="1" fill="currentColor"/>
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="flex-shrink-0">
                <rect x="1" y="1" width="5.5" height="4" rx="1" fill="currentColor"/>
                <rect x="7.5" y="1" width="5.5" height="4" rx="1" fill="currentColor"/>
                <rect x="1" y="7" width="5.5" height="4" rx="1" fill="currentColor"/>
                <rect x="7.5" y="7" width="5.5" height="4" rx="1" fill="currentColor"/>
              </svg>
            )}
            <span>{twoCol ? "1" : "2"}</span>
          </button>
        </div>
        <AnimatePresence mode="wait">
          <motion.div
            key={activeCategory}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2 }}
            className={cn(
              "grid gap-4",
              twoCol
                ? "grid-cols-2 sm:grid-cols-2 lg:grid-cols-3"
                : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
            )}
          >
            {filtered.map((tool, i) => {
              const saved = isSaved(tool.href);
              return (
                <motion.div
                  key={tool.href}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: i * 0.03 }}
                  className={cn("group relative bg-card border border-border rounded-2xl cursor-pointer hover:-translate-y-1 hover:shadow-md transition-all duration-200", twoCol ? "p-3" : "p-5")}
                  onClick={() => setLocation(tool.href)}
                  data-testid={`tool-card-${tool.href.replace("/", "")}`}
                >
                  <button
                    className={cn("absolute top-3 right-3 p-1.5 rounded-lg transition-colors z-10", saved ? "text-amber-500 hover:text-amber-600" : "text-muted-foreground/30 hover:text-muted-foreground opacity-0 group-hover:opacity-100")}
                    onClick={(e) => { e.stopPropagation(); toggleSaved({ path: tool.href, label: tool.label, icon: "", savedAt: Date.now() }); }}
                    data-testid={`save-tool-${tool.href.replace("/","")}`}
                    title={saved ? "Remove from saved" : "Save tool"}
                  >
                    <Star className={cn("w-3.5 h-3.5", saved ? "fill-amber-500" : "")} />
                  </button>
                  <div className={cn("flex gap-3", twoCol ? "flex-col items-center text-center" : "flex-row items-start")}>
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${tool.color}`}>
                      <tool.icon className="w-5 h-5" />
                    </div>
                    <div className={cn("min-w-0", twoCol ? "pr-0" : "flex-1 pr-4")}>
                      <p className="font-semibold text-foreground text-sm">{tool.label}</p>
                      {!twoCol && <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{tool.desc}</p>}
                    </div>
                    {!twoCol && <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all flex-shrink-0 mt-0.5 absolute bottom-4 right-4 opacity-0 group-hover:opacity-100" />}
                  </div>
                  <div className="mt-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60">{tool.category}</span>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ── Recent Activity ── */}
      {recentItems.length > 0 && (
        <div className="px-6 py-4 max-w-5xl mx-auto border-t border-border">
          <h3 className="text-sm font-semibold text-muted-foreground mb-3">Recent Activity</h3>
          <div className="flex flex-wrap gap-2">
            {recentItems.slice(0, 5).map((item) => (
              <button key={item.id} onClick={() => setLocation(item.toolPath)} className="flex items-center gap-2 bg-accent/60 hover:bg-accent px-3 py-1.5 rounded-xl text-sm transition-colors" data-testid={`recent-chip-${item.id}`}>
                <FileText className="w-3.5 h-3.5 text-primary" />
                <span className="font-medium truncate max-w-[140px]">{item.name}</span>
                <span className="text-muted-foreground text-xs">· {item.tool}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Saved Tools ── */}
      {savedTools.length > 0 && (
        <div className="px-6 py-4 max-w-5xl mx-auto border-t border-border">
          <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-1.5"><Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" /> Saved Tools</h3>
          <div className="flex flex-wrap gap-2">
            {savedTools.map((tool) => (
              <button key={tool.path} onClick={() => setLocation(tool.path)} className="flex items-center gap-2 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-3 py-1.5 rounded-xl text-sm transition-colors" data-testid={`saved-chip-${tool.path}`}>
                <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                <span className="font-medium text-amber-900">{tool.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Privacy note ── */}
      <div className="px-6 py-6 max-w-5xl mx-auto">
        <div className="rounded-2xl bg-accent/50 border border-border p-5 flex items-start gap-4">
          <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5"><Lock className="w-4 h-4 text-primary" /></div>
          <div>
            <p className="text-sm font-semibold text-foreground">Your files never leave your device</p>
            <p className="text-xs text-muted-foreground mt-1">All PDF processing happens entirely in your browser using WebAssembly and JavaScript. No files are uploaded to any server — your documents stay 100% private.</p>
          </div>
        </div>
      </div>

      {/* ── About Developer ── */}
      <div className="px-6 pb-10 max-w-5xl mx-auto">
        <div className="rounded-2xl border border-border bg-card p-6 flex flex-col sm:flex-row items-center sm:items-start gap-5">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-violet-600 flex items-center justify-center flex-shrink-0 shadow-md">
            <Zap className="w-7 h-7 text-white" />
          </div>
          <div className="flex-1 text-center sm:text-left">
            <p className="text-sm font-bold text-foreground">PDF Studio</p>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed max-w-md">
              An open-source, fully offline PDF toolkit built for privacy. No servers, no uploads, no tracking.
              All {tools.length} tools run entirely in your browser using WebAssembly, PDF-lib, PDF.js, and PaddleOCR.
            </p>
            <div className="flex items-center justify-center sm:justify-start gap-3 mt-4">
              <a
                href="https://github.com/your-username/pdf-studio"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-foreground text-background px-4 py-2 rounded-xl text-xs font-semibold hover:opacity-80 transition-opacity"
              >
                <Github className="w-3.5 h-3.5" />
                View on GitHub
              </a>
              <span className="text-[10px] text-muted-foreground">MIT License · v8.0</span>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
