import { createClient } from "@supabase/supabase-js";

// Zayif sinyalde fetch reddedilmez, ASILI kalir. O sirada garson urun eklemisse
// ekranda eklenmis gorunur (OrderDetailPage once optimistik yazar) ama sunucuya
// hic gitmez ve kimse fark etmez. Zaman asimi bunu sessiz kayip olmaktan
// cikarip normal bir hataya cevirir — hata dali zaten kalemi geri alip uyariyor.
const ZAMAN_ASIMI_MS = 8000;

// Gorsel yukleme yavas baglantida 8 saniyeyi asabilir; storage istekleri muaf.
const uzunSurebilir = (url) => String(url).includes("/storage/v1/");

const zamanAsimiSinyali = (ms) => {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(ms);
  }
  const kontrol = new AbortController();
  setTimeout(() => kontrol.abort(), ms);
  return kontrol.signal;
};

const zamanAsimiliFetch = (url, options = {}) => {
  // Cagiran kendi sinyalini verdiyse (iptal edilebilir istek) ona karisma.
  if (options.signal || uzunSurebilir(url)) return fetch(url, options);
  return fetch(url, { ...options, signal: zamanAsimiSinyali(ZAMAN_ASIMI_MS) });
};

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  { global: { fetch: zamanAsimiliFetch } }
);
