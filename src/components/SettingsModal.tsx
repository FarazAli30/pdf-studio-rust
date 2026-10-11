import { motion, AnimatePresence } from "framer-motion";
import { X, RotateCcw, Sun, Moon, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useSettings } from "@/contexts/SettingsContext";
import { cn } from "@/lib/utils";

interface SettingsModalProps { open: boolean; onClose: () => void; }

const THEMES = [
  { value: "light" as const, label: "Light", icon: Sun },
  { value: "dark" as const, label: "Dark", icon: Moon },
  { value: "system" as const, label: "System", icon: Monitor },
];

export default function SettingsModal({ open, onClose }: SettingsModalProps) {
  const { settings, updateSetting, resetSettings } = useSettings();

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 z-50 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            initial={{ opacity: 0, x: "100%" }} animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed right-0 top-0 bottom-0 w-full max-w-sm bg-background border-l border-border shadow-2xl z-50 flex flex-col"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="text-base font-bold text-foreground">Settings</h2>
              <button onClick={onClose} className="p-2 hover:bg-accent rounded-lg transition-colors" data-testid="close-settings">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">

              {/* ── Appearance ── */}
              <section className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Appearance</p>
                <div className="grid grid-cols-3 gap-2">
                  {THEMES.map(({ value, label, icon: Icon }) => (
                    <button
                      key={value}
                      onClick={() => updateSetting("theme", value)}
                      data-testid={`theme-${value}`}
                      className={cn(
                        "flex flex-col items-center gap-2 py-3 rounded-xl border text-sm font-medium transition-all",
                        settings.theme === value
                          ? "border-primary bg-primary/10 text-primary shadow-sm"
                          : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
                      )}
                    >
                      <Icon className="w-4 h-4" />
                      {label}
                    </button>
                  ))}
                </div>
              </section>

              {/* ── PDF Defaults ── */}
              <section className="space-y-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">PDF Defaults</p>
                <div className="space-y-2">
                  <Label>Default compression level</Label>
                  <Select value={settings.defaultCompressionLevel} onValueChange={(v) => updateSetting("defaultCompressionLevel", v as "low" | "medium" | "high")}>
                    <SelectTrigger data-testid="setting-compression"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low (smallest size)</SelectItem>
                      <SelectItem value="medium">Medium (balanced)</SelectItem>
                      <SelectItem value="high">High (best quality)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Default page size</Label>
                  <Select value={settings.defaultPageSize} onValueChange={(v) => updateSetting("defaultPageSize", v as "A4" | "Letter")}>
                    <SelectTrigger data-testid="setting-pagesize"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="A4">A4</SelectItem>
                      <SelectItem value="Letter">Letter</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Default image quality: {settings.imageQuality}%</Label>
                  <input type="range" min={50} max={100} step={5} value={settings.imageQuality}
                    onChange={(e) => updateSetting("imageQuality", Number(e.target.value))}
                    className="w-full accent-primary" data-testid="setting-quality" />
                </div>
              </section>

              {/* ── OCR ── */}
              <section className="space-y-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">OCR</p>
                <div className="space-y-2">
                  <Label>Default OCR language</Label>
                  <Select value={settings.ocrLanguage} onValueChange={(v) => updateSetting("ocrLanguage", v)}>
                    <SelectTrigger data-testid="setting-ocr-lang"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="eng">English</SelectItem>
                      <SelectItem value="deu">German</SelectItem>
                      <SelectItem value="fra">French</SelectItem>
                      <SelectItem value="spa">Spanish</SelectItem>
                      <SelectItem value="por">Portuguese</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </section>

              {/* ── Watermark ── */}
              <section className="space-y-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Watermark Defaults</p>
                <div className="space-y-2">
                  <Label>Default watermark text</Label>
                  <input type="text" value={settings.defaultWatermarkText}
                    onChange={(e) => updateSetting("defaultWatermarkText", e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    data-testid="setting-watermark-text" />
                </div>
                <div className="space-y-2">
                  <Label>Default opacity: {settings.defaultWatermarkOpacity}%</Label>
                  <input type="range" min={5} max={100} step={5} value={settings.defaultWatermarkOpacity}
                    onChange={(e) => updateSetting("defaultWatermarkOpacity", Number(e.target.value))}
                    className="w-full accent-primary" data-testid="setting-watermark-opacity" />
                </div>
              </section>

              {/* ── Behavior ── */}
              <section className="space-y-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Behavior</p>
                <div className="flex items-center justify-between">
                  <Label>Recent files to keep</Label>
                  <Select value={String(settings.recentFilesCount)} onValueChange={(v) => updateSetting("recentFilesCount", Number(v))}>
                    <SelectTrigger className="w-20" data-testid="setting-recent-count"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="5">5</SelectItem>
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="20">20</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between">
                  <Label>Auto-download results</Label>
                  <Switch checked={settings.autoDownload} onCheckedChange={(v) => updateSetting("autoDownload", v)} data-testid="setting-auto-download" />
                </div>
              </section>
            </div>

            <div className="px-5 py-4 border-t border-border">
              <Button variant="outline" onClick={resetSettings} className="w-full gap-2 text-muted-foreground" data-testid="reset-settings-button">
                <RotateCcw className="w-4 h-4" /> Reset to defaults
              </Button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
