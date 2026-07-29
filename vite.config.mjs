import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

function manualChunks(id) {
  const normalizedId = id.replaceAll("\\", "/");
  if (
    normalizedId.includes("/node_modules/react/")
    || normalizedId.includes("/node_modules/react-dom/")
    || normalizedId.includes("/node_modules/scheduler/")
  ) {
    return "react-vendor";
  }
  return undefined;
}

export default defineConfig({
  build: {
    // PDF/DOCX processors are lazy-only; keep the warning focused on unexpected eager bundles.
    chunkSizeWarningLimit: 520,
    rollupOptions: {
      output: { manualChunks },
    },
  },
  optimizeDeps: {
    include: ["react", "react-dom/client"],
  },
  server: {
    warmup: {
      clientFiles: ["./src/main.jsx"],
    },
  },
  plugins: [react()],
});
