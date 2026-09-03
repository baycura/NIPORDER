import { createClient } from "@supabase/supabase-js";

// Zayif sinyalde fetch reddedilmez, ASILI kalir. O sirada garson urun eklemisse
// ekranda eklenmis gorunur (OrderDetailPage once optimistik yazar) ama sunucuya
// hic gitmez ve kimse fark etmez. Zaman asimi bunu sessiz kayip olmaktan
// cikarip normal bir hataya cevirir — hata dali zaten kalemi geri alip uyariyor.
//
// SURELER (2026-09-03 duzeltmesi):
// Ilk surumde tek sure vardi: 8 saniye, her istek icin. Iki seyi kirdi:
//   1) Edge Function'lar (AI soru uretimi, fatura OCR, ceviri, tarif ayristirma)
//      Claude'u cagiriyor; 10-30 saniye normal. Sunucu logunda fatura OCR'in
//      8,8 ve 9,0 saniyede bitip istemcide 8'de kesildigi goruldu. AI soru
//      uretimi ise hic bitemedi — her seferinde "Fetch is aborted".
//   2) Kafede telefonla gece yarisi duz bir kayit bile 8 saniyeyi asabiliyor
//      (veritabani Singapur'da; zayif 5G'de TLS + gidis-donus). Oylama
//      kaydi bu yuzden dustu.
// Simdi: veri/oturum istekleri 20 s (asili kalmayi hala yakalar, sabirsiz
// degil), Edge Function'lar 90 s, dosya yukleme sinirsiz.
const ZAMAN_ASIMI_VERI_MS = 20000;
const ZAMAN_ASIMI_FONKSIYON_MS = 90000;

const dosyaIstegi = (url) => String(url).includes("/storage/v1/");
const fonksiyonIstegi = (url) => String(url).includes("/functions/v1/");

// Donus: { signal, bitti } — bitti() istek sonuclaninca cagrilir ki yedek
// yoldaki zamanlayici (AbortSignal.timeout olmayan eski tarayicilar) her
// istek icin 20/90 saniye asili kalmasin.
const zamanAsimiSinyali = (ms) => {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return { signal: AbortSignal.timeout(ms), bitti: () => {} };
  }
  const kontrol = new AbortController();
  const zamanlayici = setTimeout(() => kontrol.abort(), ms);
  return { signal: kontrol.signal, bitti: () => clearTimeout(zamanlayici) };
};

// "AbortError: Fetch is aborted" kullaniciya bir sey soylemiyor. Zaman asimini
// yakalayip Turkce, ne yapilacagini soyleyen bir hataya cevir. Veri (PostgREST)
// yolunda supabase-js bunu "<name>: <message>" olarak error.message'a tasir;
// Edge Function yolunda ise sabit bir Ingilizce mesajin altina, error.context'e
// koyar — o yuzden ekranlar asagidaki hataMetni() ile okur.
const zamanAsimiliFetch = async (url, options = {}) => {
  // Cagiran kendi sinyalini verdiyse (iptal edilebilir istek) ona karisma.
  if (options.signal || dosyaIstegi(url)) return fetch(url, options);
  const ms = fonksiyonIstegi(url) ? ZAMAN_ASIMI_FONKSIYON_MS : ZAMAN_ASIMI_VERI_MS;
  const { signal, bitti } = zamanAsimiSinyali(ms);
  try {
    return await fetch(url, { ...options, signal });
  } catch (e) {
    if (e && (e.name === "AbortError" || e.name === "TimeoutError")) {
      // postgrest-js mesaji "<name>: <message>" diye basar; name burada
      // "AbortError" yerine okunur bir sey olsun.
      const hata = new Error(`${Math.round(ms / 1000)} saniyede cevap gelmedi — sinyal zayıf, tekrar dene`);
      hata.name = "Bağlantı";
      // postgrest-js, iptal olarak TANIMADIGI hatalarda GET isteklerini 3 kez
      // (1+2+4 s arayla) yeniden dener: 20 s'lik zaman asimi 87 s olurdu.
      // code'u ABORT_ERR yapinca (name 'AbortError' ile birlikte tanidigi
      // iki isaretten biri) yeniden denemeyi atlar, mesaj korunur.
      hata.code = "ABORT_ERR";
      throw hata;
    }
    throw e;
  } finally {
    bitti();
  }
};

// Edge Function cagrilarinda supabase-js fetch hatasini sabit bir Ingilizce
// mesajin ("Failed to send a request to the Edge Function") icine sarar; asil
// neden error.context'te kalir. Ekranlar hata basarken bunu kullansin ki
// yukaridaki Turkce zaman asimi mesaji kullaniciya ulassin.
export const hataMetni = (error) =>
  error?.context?.message || error?.message || (error ? String(error) : "Bilinmeyen hata");

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  { global: { fetch: zamanAsimiliFetch } }
);
