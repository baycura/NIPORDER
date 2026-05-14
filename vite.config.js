import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("react-router")) return "react-vendor";
            if (id.includes("/react/") || id.includes("/react-dom/") || id.includes("scheduler")) return "react-vendor";
            if (id.includes("@supabase")) return "supabase-vendor";
            return "vendor";
          }
        },
      },
    },
    chunkSizeWarningLimit: 1000,
  },
});
