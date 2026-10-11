import { useState } from "react";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  Merge, Scissors, Archive, RotateCw, Stamp, Lock, Unlock,
  Copy, Shuffle, FileText, Info, Home, ChevronRight, Zap,
  Image, AlignLeft, PenLine, Palette, ScanText,
  Search, Table2, List, Volume2, Settings2, Settings, Clock,
  Bookmark, ImageIcon, Github, FileDown,
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

function NavItem({ href, label, icon: Icon }: { href: string; label: string; icon: React.ElementType }) {
  const [location] = useLocation();
  const isActive = location === href;
  return (
    <Link href={href}>
      <motion.div
        whileHover={{ x: 2 }}
        className={cn(
          "flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-colors cursor-pointer",
          isActive ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-accent",
        )}
        data-testid={`nav-${href.replace(/\//g, "")}`}
      >
        <Icon className="w-4 h-4 flex-shrink-0" />
        <span className="truncate">{label}</span>
        {isActive && <ChevronRight className="w-3 h-3 ml-auto opacity-70" />}
      </motion.div>
    </Link>
  );
}

type Panel = "settings" | "recent" | "saved" | null;

export default function Layout({ children }: { children: React.ReactNode }) {
  const [panel, setPanel] = useState<Panel>(null);
  const [location] = useLocation();
  const togglePanel = (p: Panel) => setPanel((prev) => (prev === p ? null : p));

  const bottomItems = [
    { id: "home" as Panel, label: "Home", icon: Home, href: "/" },
    { id: "recent" as Panel, label: "Recent", icon: Clock },
    { id: "saved" as Panel, label: "Saved", icon: Bookmark },
    { id: "settings" as Panel, label: "Settings", icon: Settings },
  ];

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-60 border-r border-border bg-sidebar shrink-0 overflow-y-auto">
        <div className="p-5 border-b border-sidebar-border">
          <Link href="/">
            <div className="flex items-center gap-3 cursor-pointer">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shadow-sm">
                <Zap className="w-4 h-4 text-primary-foreground" />
              </div>
              <div>
                <p className="text-sm font-bold text-sidebar-foreground leading-tight">PDF Studio</p>
                <p className="text-[10px] text-muted-foreground leading-tight">Browser-Powered · 27 tools</p>
              </div>
            </div>
          </Link>
        </div>

        <div className="px-3 pt-4 pb-1">
          <Link href="/">
            <motion.div
              whileHover={{ x: 2 }}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-colors cursor-pointer",
                location === "/" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-accent",
              )}
              data-testid="nav-home"
            >
              <Home className="w-4 h-4" />
              <span>Home</span>
              {location === "/" && <ChevronRight className="w-3 h-3 ml-auto opacity-70" />}
            </motion.div>
          </Link>
        </div>

        <nav className="flex-1 px-3 pb-4 space-y-4">
          {groups.map((group) => (
            <div key={group.label}>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground px-3 mb-1.5">{group.label}</p>
              <div className="space-y-0.5">
                {group.items.map((item) => <NavItem key={item.href} {...item} />)}
              </div>
            </div>
          ))}
        </nav>

        <div className="p-3 border-t border-sidebar-border space-y-1">
          {([
            { id: "recent" as Panel, label: "Recent Files", icon: Clock },
            { id: "saved" as Panel, label: "Saved Tools", icon: Bookmark },
            { id: "settings" as Panel, label: "Settings", icon: Settings },
          ] as const).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => togglePanel(id)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-colors",
                panel === id ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-accent",
              )}
              data-testid={`sidebar-${id}`}
            >
              <Icon className="w-4 h-4" /><span>{label}</span>
            </button>
          ))}

          {/* About Developer */}
          <div className="pt-3 pb-1 px-1 space-y-2">
            <a
              href="https://github.com/your-username/pdf-studio"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 w-full px-3 py-2 rounded-xl bg-accent/60 hover:bg-accent transition-colors"
            >
              <Github className="w-4 h-4 text-foreground" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-foreground">PDF Studio</p>
                <p className="text-[10px] text-muted-foreground">View on GitHub</p>
              </div>
            </a>
            <p className="text-[10px] text-muted-foreground text-center px-1">
              All local · No uploads · MIT License
            </p>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto pb-16 md:pb-16">
        {children}
      </main>

      {/* Universal Bottom Bar */}
      <nav className="fixed bottom-0 left-0 right-0 border-t border-border bg-background/95 backdrop-blur-sm z-40 md:left-60">
        <div className="flex items-center justify-around py-2 px-2 max-w-lg mx-auto md:max-w-none">
          {bottomItems.map(({ id, label, icon: Icon, href }) => {
            const isActive = href != null ? location === href : panel === (id as Panel);
            return href ? (
              <Link key={id} href={href}>
                <motion.div
                  whileTap={{ scale: 0.9 }}
                  className={cn("flex flex-col items-center gap-1 px-4 py-1.5 rounded-xl transition-colors cursor-pointer", isActive ? "text-primary" : "text-muted-foreground hover:text-foreground")}
                  data-testid={`bottom-${id}`}
                >
                  <Icon className="w-5 h-5" />
                  <span className="text-[10px] font-medium">{label}</span>
                </motion.div>
              </Link>
            ) : (
              <motion.button
                key={id}
                whileTap={{ scale: 0.9 }}
                onClick={() => togglePanel(id)}
                className={cn("flex flex-col items-center gap-1 px-4 py-1.5 rounded-xl transition-colors", isActive ? "text-primary" : "text-muted-foreground hover:text-foreground")}
                data-testid={`bottom-${id}`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[10px] font-medium">{label}</span>
              </motion.button>
            );
          })}
        </div>
      </nav>

      {/* Panels */}
      <SettingsModal open={panel === "settings"} onClose={() => setPanel(null)} />
      <RecentDrawer open={panel === "recent"} onClose={() => setPanel(null)} />
      <SavedDrawer open={panel === "saved"} onClose={() => setPanel(null)} />
    </div>
  );
}
