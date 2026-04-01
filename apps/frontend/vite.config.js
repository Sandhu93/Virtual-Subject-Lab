import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Vite publishes files from static/ as /assets/* in the built bundle.
  // Keep legacy viewer/vendor assets here so Docker/Nginx serves the same files
  // that local Vite builds use.
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
