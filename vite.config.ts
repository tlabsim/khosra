import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom"],
          storage: ["dexie"],
          validation: ["zod"],
        },
      },
    },
  },
  server: {
    watch: { usePolling: true, interval: 300 },
    proxy: { "/api": "http://127.0.0.1:8081" },
  },
});
