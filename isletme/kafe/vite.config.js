import { defineConfig, mergeConfig } from "vite";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import kokConfig from "../../vite.config.js";

// ============================================================================
// ISLETME: "kafe" (yer tutucu ad — gercek isletme adi gelince asagidakileri
// ve klasor adini degistir)
// ============================================================================
// Ayni kaynak kod, AYRI Supabase projesi, AYRI Vercel projesi. Bu dosya o
// isletmenin tek ayar yeri: Vercel projesinin Root Directory'si isletme/kafe;
// vercel.json buradaki komutlarla repo kokunde build alir, cikti dist/'e gider.
//
// Buradaki hicbir deger gizli degil: anon anahtar tarayiciya zaten gider,
// veriyi RLS korur. Gizli olan tek sey (service role, bot anahtarlari)
// Supabase tarafinda durur, repoya yazilmaz.
//
// Kurulum sirasi: supabase/kurulum/README.md
// ============================================================================

const burasi = path.dirname(fileURLToPath(import.meta.url));
const kok = path.resolve(burasi, "../..");

const ISLETME = {
  VITE_PROFIL: "temel",                     // lib/profil.js: kafe siparisi + rezervasyon + recete/maliyet
  VITE_MARKA_AD: "Kafe",
  VITE_MARKA_KISA: "KAFE",
  VITE_MARKA_BASLIK: "Kafe — sipariş & rezervasyon",
  VITE_MARKA_ACIKLAMA: "Masandan sipariş ver, hazır olunca haber verelim. Etkinlikler için yerini ayırt.",
  VITE_MARKA_ACIKLAMA_KISA: "Masandan sipariş ver, hazır olunca haber verelim.",
  VITE_MARKA_SEHIR: "",
  VITE_MARKA_EPOSTA_ALANI: "kafe.com",
  VITE_MARKA_INSTAGRAM: "",
  VITE_APP_HOST: "kafe-order.vercel.app",  // kendi alan adi baglaninca degistir
  VITE_STORE_ID: "8f3b1c2e-5d4a-4b7e-9c1f-2a6e7d8b9c01",   // 03_tohum.sql ile AYNI olmali
  VITE_STORE_SLUG: "kafe",
  // Yeni Supabase projesi acilinca doldurulur (Project Settings > API):
  VITE_SUPABASE_URL: "https://PROJE_REF.supabase.co",
  VITE_SUPABASE_ANON_KEY: "ANON_ANAHTAR",
};
Object.assign(process.env, ISLETME);
process.env.VITE_APP_URL = "https://" + ISLETME.VITE_APP_HOST;

export default mergeConfig(kokConfig, defineConfig({
  root: kok,
  publicDir: path.join(kok, "public"),
  build: { outDir: path.join(burasi, "dist"), emptyOutDir: true },
  plugins: [{
    // Isletmenin kendi ikonlari ve manifest'i ortak public/ uzerine yazilir:
    // ayni yollar (/icons/..., /manifest.json), farkli dosyalar.
    name: "isletme-public-ustune-yaz",
    closeBundle() {
      const kaynak = path.join(burasi, "public");
      if (fs.existsSync(kaynak)) fs.cpSync(kaynak, path.join(burasi, "dist"), { recursive: true });
    },
  }],
}));
