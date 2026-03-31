import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // static/ holds vendor and legacy JS assets so they don't conflict with
  // the root index.html that Vite processes for the React entry point.
  publicDir: "static",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    // In dev mode, proxy /api/ to the API service so relative URLs work
    // the same way as in production (where nginx handles the proxying).
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
});
