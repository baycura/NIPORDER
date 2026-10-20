import { defineConfig, mergeConfig } from "vite";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import kokConfig from "../../vite.config.js";

// ============================================================================
// ISLETME: "doner" — Not in Paris Doner'in defteri (ayri limited sirket)
// ============================================================================
// Ayni kaynak kod, AYNI Supabase projesi, AYRI Vercel projesi, AYRI giris.
// Veritabani kafeyle ortak: kafede satilan doner (konsinye) ve donerin kendi
// QR siparisleri gelire kendiliginden girer. Kullanicilar kafe personeli
// DEGIL: doner_kullanicilar listesi; kafe tablolarina gecit yok
// (20261020_doner_defter.sql). VITE_PROFIL=doner ile App.jsx yalniz
// src/doner/DonerApp.jsx'i yukler; kafe ekranlari pakete girmez.
//
// Buradaki hicbir deger gizli degil: anon anahtar tarayiciya zaten gider,
// veriyi RLS korur. Vercel projesinin Root Directory'si isletme/doner;
// vercel.json buradaki komutlarla repo kokunde build alir, cikti dist/'e gider.
// ============================================================================

const burasi = path.dirname(fileURLToPath(import.meta.url));
const kok = path.resolve(burasi, "../..");

const ISLETME = {
  VITE_PROFIL: "doner",                      // lib/profil.js + App.jsx: yalniz doner defteri
  VITE_MARKA_AD: "Döner Defteri",
  VITE_MARKA_KISA: "DÖNER",
  VITE_MARKA_DIL: "tr",
  VITE_MARKA_BASLIK: "Döner Defteri — gider, gün sonu, borç",
  VITE_MARKA_ACIKLAMA: "Not in Paris Döner'in defteri: gider ve faturalar, gün sonu, ürün maliyeti, borçlular, özet.",
  VITE_MARKA_ACIKLAMA_KISA: "Not in Paris Döner'in defteri.",
  VITE_MARKA_SEHIR: "Fethiye",
  VITE_MARKA_EPOSTA_ALANI: "notinparis.me",
  VITE_MARKA_INSTAGRAM: "",
  VITE_APP_HOST: "doner.notinparis.me",      // DNS baglaninca; o ana kadar Vercel'in verdigi adres calisir
  VITE_STORE_ID: "c39da530-7f73-4f69-a752-029bf03790b1",   // stores: DONER (mutfak hedefi)
  VITE_STORE_SLUG: "doner",
  // Kafeyle AYNI Supabase projesi (order.notinparis.me ile ortak veritabani):
  VITE_SUPABASE_URL: "https://gbbxxcduuwdmvfayxzeg.supabase.co",
  VITE_SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdiYnh4Y2R1dXdkbXZmYXl4emVnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyNzQ2NDYsImV4cCI6MjA5MTg1MDY0Nn0.znsE_M_K0tp6wr386fMNzQ9mJsqtBmUMsRiy-ITig-s",
};
Object.assign(process.env, ISLETME);
process.env.VITE_APP_URL = "https://" + ISLETME.VITE_APP_HOST;

export default mergeConfig(kokConfig, defineConfig({
  root: kok,
  publicDir: path.join(kok, "public"),
  build: { outDir: path.join(burasi, "dist"), emptyOutDir: true },
  plugins: [{
    // Ortak index.html kafe girisini (/src/main.jsx) yukler; doner sitesinde
    // giris src/doner/main.jsx. "pre" sirasi: Vite giris betigini bu
    // degisiklikten SONRA okur, kafe sayfalari pakete hic girmez.
    name: "doner-girisi",
    transformIndexHtml: {
      order: "pre",
      handler: (html) => html.replace('src="/src/main.jsx"', 'src="/src/doner/main.jsx"'),
    },
  }, {
    // Isletmenin kendi ikonlari ve manifest'i ortak public/ uzerine yazilir:
    // ayni yollar (/icons/..., /manifest.json), farkli dosyalar.
    name: "isletme-public-ustune-yaz",
    closeBundle() {
      const kaynak = path.join(burasi, "public");
      if (fs.existsSync(kaynak)) fs.cpSync(kaynak, path.join(burasi, "dist"), { recursive: true });
    },
  }],
}));
