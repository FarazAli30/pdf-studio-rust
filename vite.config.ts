import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

// Tauri expects a fixed dev port and a relative base.
export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
    dedupe: ["react", "react-dom"],
  },
  build: {
    outDir: path.resolve(import.meta.dirname, "dist"),
    emptyOutDir: true,
    target: "es2021",
    rollupOptions: { output: { manualChunks: { pdfjs: ["pdfjs-dist"] } } },
  },
  server: { port: 5173, strictPort: true, host: "127.0.0.1" },
  worker: { format: "es" },
});
