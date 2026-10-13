import { useState } from "react";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  Merge, Scissors, Archive, RotateCw, Stamp, Lock, Unlock,
  Copy, Shuffle, FileText, Info, Home, ChevronRight, Zap,
  Image, AlignLeft, PenLine, Palette, ScanText,
  Search, Table2, List, Volume2, Settings2, Settings, Clock,
  Bookmark, ImageIcon, Github, FileDown, Menu, X, ShieldCheck,
} from "lucide-react";
import SettingsModal from "./SettingsModal";
import RecentDrawer from "./RecentDrawer";
import SavedDrawer from "./SavedDrawer";

const groups = [
  {
    label: "Organize",
    items: [
      { href: "/merge", label: "Merge PDFs", icon: Merge },
      { href: "/split", label: "Split PDF", icon: Scissors },
      { href: "/extract", label: "Extract Pages", icon: Copy },
      { href: "/reorder", label: "Reorder Pages", icon: Shuffle },
      { href: "/page-tools", label: "Page Tools", icon: Settings2 },
    ],
  },
  {
    label: "Convert",
    items: [
      { href: "/pdf-to-jpg", label: "PDF → JPG", icon: Image },
      { href: "/images-to-pdf", label: "Images → PDF", icon: ImageIcon },
      { href: "/txt-to-pdf", label: "TXT → PDF", icon: FileText },
      { href: "/markdown-to-pdf", label: "Markdown → PDF", icon: FileText },
      { href: "/pdf-to-md", label: "PDF → Markdown", icon: FileDown },
    ],
  },
  {
    label: "Transform",
    items: [
      { href: "/compress", label: "Compress", icon: Archive },
      { href: "/rotate", label: "Rotate Pages", icon: RotateCw },
      { href: "/watermark", label: "Watermark", icon: Stamp },
      { href: "/header-footer", label: "Header & Footer", icon: AlignLeft },
      { href: "/sign-pdf", label: "Sign PDF", icon: PenLine },
      { href: "/background-color", label: "Background Color", icon: Palette },
    ],
  },
  {
    label: "Security",
    items: [
      { href: "/protect", label: "Password Protect", icon: Lock },
      { href: "/unlock", label: "Unlock PDF", icon: Unlock },
    ],
  },
  {
    label: "OCR",
    items: [
      { href: "/make-searchable", label: "Make Searchable", icon: ScanText },
      { href: "/smart-search", label: "Smart Search", icon: Search },
    ],
  },
  {
    label: "Analyze",
    items: [
      { href: "/pdf-to-text", label: "Extract Text", icon: FileText },
      { href: "/pdf-info", label: "PDF Info", icon: Info },
      { href: "/extract-tables", label: "Extract Tables", icon: Table2 },
      { href: "/table-of-contents", label: "Table of Contents", icon: List },
      { href: "/read-aloud", label: "Read Aloud", icon: Volume2 },
    ],
  },
];

type Panel = "settings" | "recent" | "saved" | null;

function NavItem({ href, label, icon: Icon, onNavigate }: {
  href: string; label: string; icon: React.ElementType; onNavigate?: () => void;
}) {
  const [location] = useLocation();
  const isActive = location === href;
  return (
    <Link href={href}>
      <motion.div
        whileHover={{ x: 2 }}
        onClick={onNavigate}
        className={cn(
          "flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all cursor-pointer",
          isActive
            ? "bg-primary/10 text-primary"
            : "text-muted-foreground hover:text-foreground hover:bg-accent/80",
        )}
        data-testid={`nav-${href.replace(/\//g, "")}`}
      >
        <Icon className="w-[17px] h-[17px] flex-shrink-0" />
        <span className="truncate">{label}</span>
        {isActive && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />}
      </motion.div>
    </Link>
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const [panel, setPanel] = useState<Panel>(null);
  const [location] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const togglePanel = (p: Panel) => setPanel((prev) => (prev === p ? null : p));
  const routeParts = location.split("/").filter(Boolean);
  const pageLabel = location === "/" ? "Workspace" : (routeParts[routeParts.length - 1] || "Workspace").replace(/-/g, " ");

  const panelItems = [
    { id: "recent" as Panel, label: "Recent files", icon: Clock },
    { id: "saved" as Panel, label: "Saved tools", icon: Bookmark },
    { id: "settings" as Panel, label: "Settings", icon: Settings },
  ];

  const sidebar = (mobile = false) => (
    <>
      <div className="px-5 pt-5 pb-4 border-b border-sidebar-border/80">
        <Link href="/" onClick={() => setMobileMenuOpen(false)}>
          <div className="flex items-center gap-3 cursor-pointer">
            <div className="w-10 h-10 rounded-[14px] bg-primary flex items-center justify-center shadow-[0_6px_14px_hsl(var(--primary)/.22)]">
              <Zap className="w-5 h-5 text-primary-foreground fill-current" />
            </div>
            <div>
              <p className="text-[15px] font-bold text-sidebar-foreground leading-tight tracking-[-.02em]">PDF Studio</p>
              <p className="text-[11px] text-muted-foreground mt-1">Private document workspace</p>
            </div>
          </div>
        </Link>
      </div>
      <div className="px-3 pt-4 pb-1">
        <p className="px-3 mb-2 text-[10px] font-bold uppercase tracking-[.13em] text-muted-foreground/75">Workspace</p>
        <Link href="/" onClick={() => setMobileMenuOpen(false)}>
          <motion.div
            whileHover={{ x: 2 }}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-all cursor-pointer",
              location === "/" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-accent/80",
            )}
            data-testid="nav-home"
          >
            <Home className="w-[17px] h-[17px]" />
            <span>Home</span>
            {location === "/" && <ChevronRight className="w-4 h-4 ml-auto opacity-75" />}
          </motion.div>
        </Link>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto">
        {groups.map((group) => (
          <div key={group.label}>
            <p className="text-[10px] font-bold uppercase tracking-[.13em] text-muted-foreground/75 px-3 mb-1.5">{group.label}</p>
            <div className="space-y-0.5">
              {group.items.map((item) => <NavItem key={item.href} {...item} onNavigate={mobile ? () => setMobileMenuOpen(false) : undefined} />)}
            </div>
          </div>
        ))}
      </nav>
      <div className="p-3 border-t border-sidebar-border/80 space-y-1">
        {panelItems.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => { togglePanel(id); if (mobile) setMobileMenuOpen(false); }}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-colors",
              panel === id ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-accent/80",
            )}
            data-testid={`sidebar-${id}`}
          >
            <Icon className="w-[17px] h-[17px]" /><span>{label}</span>
          </button>
        ))}
        <div className="pt-3 px-1">
          <div className="rounded-xl bg-primary/[.06] border border-primary/10 p-3 flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-primary mt-0.5 shrink-0" />
            <p className="text-[11px] leading-relaxed text-muted-foreground">Your documents stay on this device. No uploads, no tracking.</p>
          </div>
          <a href="https://github.com/your-username/pdf-studio" target="_blank" rel="noopener noreferrer" className="mt-3 flex items-center gap-2 px-3 py-2 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors">
            <Github className="w-3.5 h-3.5" /> Open-source · MIT License
          </a>
        </div>
      </div>
    </>
  );

  return (
    <div className="app-shell flex h-[100dvh] bg-background overflow-hidden">
      <aside className="hidden lg:flex flex-col w-[264px] border-r border-sidebar-border/80 bg-sidebar shrink-0 overflow-hidden">
        {sidebar()}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="app-topbar h-[64px] shrink-0 flex items-center justify-between gap-4 px-4 sm:px-6 lg:px-8 border-b border-border/80 bg-background/90 backdrop-blur-xl z-20">
          <div className="flex items-center gap-3 min-w-0">
            <button className="lg:hidden w-10 h-10 rounded-xl flex items-center justify-center text-muted-foreground hover:bg-accent" aria-label="Open navigation" onClick={() => setMobileMenuOpen(true)}>
              <Menu className="w-5 h-5" />
            </button>
            <Link href="/" className="lg:hidden flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-[11px] bg-primary flex items-center justify-center"><Zap className="w-4 h-4 text-primary-foreground fill-current" /></span>
              <span className="text-sm font-bold tracking-tight">PDF Studio</span>
            </Link>
            <div className="hidden lg:flex items-center gap-2 text-sm min-w-0">
              <span className="text-muted-foreground">PDF Studio</span><ChevronRight className="w-3.5 h-3.5 text-muted-foreground/60" />
              <span className="font-semibold capitalize truncate">{pageLabel}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="hidden sm:inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] font-semibold text-emerald-700"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Works offline</span>
            <button onClick={() => togglePanel("settings")} className="w-10 h-10 rounded-xl border border-border bg-card flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors" aria-label="Open settings">
              <Settings className="w-[18px] h-[18px]" />
            </button>
          </div>
        </header>
        <main className="app-content flex-1 min-h-0 overflow-y-auto pb-20 lg:pb-8">
          {children}
        </main>
      </div>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-[70] lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation menu">
          <button className="absolute inset-0 bg-slate-950/40 backdrop-blur-[2px]" onClick={() => setMobileMenuOpen(false)} aria-label="Close navigation overlay" />
          <aside className="mobile-nav-panel absolute inset-y-0 left-0 flex w-[min(86vw,320px)] flex-col border-r border-border bg-sidebar shadow-2xl">
            <button onClick={() => setMobileMenuOpen(false)} className="absolute top-5 right-4 z-10 w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-accent" aria-label="Close navigation"><X className="w-4 h-4" /></button>
            {sidebar(true)}
          </aside>
        </div>
      )}

      <nav className="mobile-bottom-nav fixed bottom-0 left-0 right-0 border-t border-border/80 bg-background/95 backdrop-blur-xl z-40 lg:hidden" aria-label="Quick navigation">
        <div className="flex items-center justify-around px-2 pt-2 pb-[max(.5rem,env(safe-area-inset-bottom))] max-w-xl mx-auto">
          {[
            { id: "home", label: "Home", icon: Home, href: "/" },
            { id: "recent" as const, label: "Recent", icon: Clock },
            { id: "saved" as const, label: "Saved", icon: Bookmark },
            { id: "settings" as const, label: "Settings", icon: Settings },
          ].map(({ id, label, icon: Icon, href }) => {
            const active = href ? location === href : panel === id;
            const classes = cn("flex min-w-[64px] flex-col items-center justify-center gap-1 rounded-2xl px-3 py-1 text-[10px] font-semibold transition-colors", active ? "text-primary" : "text-muted-foreground");
            return href ? (
              <Link key={id} href={href} className={classes} data-testid={`bottom-${id}`}><span className={cn("flex h-7 w-12 items-center justify-center rounded-full transition-colors", active && "bg-primary/10")}><Icon className="w-[18px] h-[18px]" /></span>{label}</Link>
            ) : (
              <button key={id} onClick={() => togglePanel(id as Panel)} className={classes} data-testid={`bottom-${id}`}><span className={cn("flex h-7 w-12 items-center justify-center rounded-full transition-colors", active && "bg-primary/10")}><Icon className="w-[18px] h-[18px]" /></span>{label}</button>
            );
          })}
        </div>
      </nav>

      <SettingsModal open={panel === "settings"} onClose={() => setPanel(null)} />
      <RecentDrawer open={panel === "recent"} onClose={() => setPanel(null)} />
      <SavedDrawer open={panel === "saved"} onClose={() => setPanel(null)} />
    </div>
  );
}
