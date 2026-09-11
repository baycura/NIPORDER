import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Marka / adres varsayilanlari: Not in Paris. index.html'deki %VITE_...%
// yer tutucularini ve lib/profil.js'i besler. Baska bir isletme kurulumu
// (isletme/<slug>/vite.config.js) bu dosyayi ice aktarir ve process.env'i
// kendi degerleriyle EZER; buradaki "??=" yalniz bos olanlari doldurur.
const VARSAYILAN = {
  VITE_MARKA_AD: "Not in Paris",
  VITE_MARKA_BASLIK: "Not in Paris — Fethiye",
  VITE_MARKA_ACIKLAMA: "Masandan sipariş ver, hazır olunca haber verelim. Menü, etkinlikler, sürüşler ve mağaza.",
  VITE_MARKA_ACIKLAMA_KISA: "Masandan sipariş ver, hazır olunca haber verelim.",
  VITE_APP_HOST: "order.notinparis.me",
};
for (const [k, v] of Object.entries(VARSAYILAN)) process.env[k] ??= v;
process.env.VITE_APP_URL ??= "https://" + process.env.VITE_APP_HOST;

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
