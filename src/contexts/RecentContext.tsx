import { createContext, useContext, useState, useEffect, useCallback } from "react";

export interface RecentItem {
  id: string;
  name: string;
  tool: string;
  toolPath: string;
  size: number;
  time: number;
}

export interface SavedTool {
  path: string;
  label: string;
  icon: string;
  savedAt: number;
}

interface RecentContextValue {
  recentItems: RecentItem[];
  savedTools: SavedTool[];
  addRecent: (item: Omit<RecentItem, "id" | "time">) => void;
  toggleSaved: (tool: SavedTool) => void;
  isSaved: (path: string) => boolean;
  clearRecent: () => void;
}

const RecentContext = createContext<RecentContextValue | null>(null);

export function RecentProvider({ children }: { children: React.ReactNode }) {
  const [recentItems, setRecentItems] = useState<RecentItem[]>(() => {
    try { return JSON.parse(localStorage.getItem("pdf-studio-recent-v2") || "[]"); } catch { return []; }
  });
  const [savedTools, setSavedTools] = useState<SavedTool[]>(() => {
    try { return JSON.parse(localStorage.getItem("pdf-studio-saved-tools") || "[]"); } catch { return []; }
  });

  useEffect(() => {
    localStorage.setItem("pdf-studio-recent-v2", JSON.stringify(recentItems));
  }, [recentItems]);

  useEffect(() => {
    localStorage.setItem("pdf-studio-saved-tools", JSON.stringify(savedTools));
  }, [savedTools]);

  const addRecent = useCallback((item: Omit<RecentItem, "id" | "time">) => {
    setRecentItems((prev) => {
      const newItem: RecentItem = { ...item, id: `${Date.now()}-${Math.random()}`, time: Date.now() };
      const filtered = prev.filter((r) => r.name !== item.name || r.tool !== item.tool);
      return [newItem, ...filtered].slice(0, 20);
    });
  }, []);

  const toggleSaved = useCallback((tool: SavedTool) => {
    setSavedTools((prev) => {
      const exists = prev.find((t) => t.path === tool.path);
      if (exists) return prev.filter((t) => t.path !== tool.path);
      return [...prev, { ...tool, savedAt: Date.now() }];
    });
  }, []);

  const isSaved = useCallback((path: string) => savedTools.some((t) => t.path === path), [savedTools]);

  const clearRecent = useCallback(() => setRecentItems([]), []);

  return (
    <RecentContext.Provider value={{ recentItems, savedTools, addRecent, toggleSaved, isSaved, clearRecent }}>
      {children}
    </RecentContext.Provider>
  );
}

export function useRecent() {
  const ctx = useContext(RecentContext);
  if (!ctx) throw new Error("useRecent must be used within RecentProvider");
  return ctx;
}
