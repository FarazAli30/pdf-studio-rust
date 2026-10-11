import { createContext, useContext, useState, useEffect } from "react";

export interface AppSettings {
  defaultCompressionLevel: "low" | "medium" | "high";
  defaultPageSize: "A4" | "Letter";
  ocrLanguage: string;
  theme: "light" | "dark" | "system";
  imageQuality: number;
  defaultWatermarkText: string;
  defaultWatermarkOpacity: number;
  autoDownload: boolean;
  recentFilesCount: number;
}

const DEFAULT_SETTINGS: AppSettings = {
  defaultCompressionLevel: "medium",
  defaultPageSize: "A4",
  ocrLanguage: "eng",
  theme: "light",
  imageQuality: 92,
  defaultWatermarkText: "CONFIDENTIAL",
  defaultWatermarkOpacity: 30,
  autoDownload: false,
  recentFilesCount: 10,
};

interface SettingsContextValue {
  settings: AppSettings;
  updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  resetSettings: () => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const stored = localStorage.getItem("pdf-studio-settings");
      return stored ? { ...DEFAULT_SETTINGS, ...JSON.parse(stored) } : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  });

  useEffect(() => {
    localStorage.setItem("pdf-studio-settings", JSON.stringify(settings));
  }, [settings]);

  // Apply dark mode to document
  useEffect(() => {
    const root = document.documentElement;
    const apply = (dark: boolean) => root.classList.toggle("dark", dark);
    if (settings.theme === "dark") { apply(true); return; }
    if (settings.theme === "light") { apply(false); return; }
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    apply(mq.matches);
    const handler = (e: MediaQueryListEvent) => apply(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [settings.theme]);

  const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const resetSettings = () => setSettings(DEFAULT_SETTINGS);

  return (
    <SettingsContext.Provider value={{ settings, updateSetting, resetSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}
