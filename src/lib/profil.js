// ============================================================================
// ISLETME PROFILI — hangi modul acik, marka ne, tek yerden.
// ============================================================================
// NEDEN: Ayni kod ikinci bir isletmeye kuruluyor: ayri Supabase projesi,
// ayri Vercel projesi, veriler hic karismaz. Not in Paris'e ozel parcalar
// (Telegram, Shopify, Strava surusleri, parti modu, RESERVE koprusu, doner
// mutfagi hakedisi, faturayi fotograftan AI ile okuma) o isletmede yok.
// Repoyu catallamak yerine profil secilir; her duzeltme iki isletmeye birden
// gider.
//
//   VITE_PROFIL=nip    (varsayilan) her sey acik — bugunku davranis
//   VITE_PROFIL=temel  kafe siparisi + etkinlik rezervasyonu + recete/maliyet
//
// Ince ayar: VITE_OZELLIK_ACIK / VITE_OZELLIK_KAPALI (virgulle ayrilmis modul
// adlari). Degerler BUILD aninda gomulur; isletme basina
// isletme/<slug>/vite.config.js icinde yazilir (bkz. supabase/kurulum/README).
//
// Kural: bir ekran/menu ogesi bir modulun parcasiysa ozellik("modul") ile
// kapatilir. Rota durur (URL'den gidilse de sayfa bos/zararsiz), menu ve
// dugmeler gizlenir, sunucu cagrisi yapilmaz.
// ============================================================================

const env = (typeof import.meta !== "undefined" && import.meta.env) || {};

export const PROFIL = env.VITE_PROFIL || "nip";
const nip = PROFIL === "nip";

const MODULLER = {
  telegram:       nip,  // vardiya bildirimleri, fiyat uyarisi, gun sonu ozeti
  shopify:        nip,  // stok aynasi, Ayarlar > Shopify
  surus:          nip,  // Strava kulup surusleri (Surusler sayfasi + musteri sekmesi)
  parti:          nip,  // parti menusu / parti modu
  faturaOcr:      nip,  // faturayi fotograftan AI ile okuma (kapaliyken elle giris)
  yapayZeka:      nip,  // recete ayristirma, ceviri, icerik yazma
  reserveKoprusu: nip,  // RESERVE projesine kopru (uye senkronu, SSO)
  mutfakHakedis:  nip,  // doner mutfagi / "Mutfaga Odenecek"
  raf:            nip,  // marka/raf urunleri (Shop sekmesi, "Urunler (Raf)")
  icerik:         nip,  // Vitrin & Blog
  oylama:         nip,  // Oylamalar
  paytr:          nip,  // online odeme
  eur:            nip,  // Euro fiyatlama + kur senkronu
  uyelik:         nip,  // musteri girisi (Google/OTP), puan, uye fiyatlari
  push:           nip,  // web push (siparis hazir bildirimi)
  // her profilde acik
  rezervasyon:    true, // etkinlik + rezervasyon (kaynak asagida)
  happyHour:      true,
  uyeBorc:        true, // Uyeler & Borc (musteri karnesi, veresiye)
};

const liste = (s) => String(s || "").split(",").map(x => x.trim()).filter(Boolean);
for (const k of liste(env.VITE_OZELLIK_ACIK))   MODULLER[k] = true;
for (const k of liste(env.VITE_OZELLIK_KAPALI)) MODULLER[k] = false;

export const OZELLIK = MODULLER;
// ozellik(undefined) = true: modul etiketi olmayan her sey her profilde var.
export const ozellik = (ad) => ad == null || OZELLIK[ad] !== false;

// Rezervasyon verisi nerede?
//   "reserve": ayri RESERVE Supabase projesi (NIP; lib/reserve.js koprusu)
//   "yerel":   bu veritabanindaki events / reservations tablolari
export const REZERVASYON_KAYNAK = env.VITE_REZERVASYON || (nip ? "reserve" : "yerel");
export const rezervasyonYerel = REZERVASYON_KAYNAK === "yerel";

export const MARKA = {
  ad:           env.VITE_MARKA_AD || "Not in Paris",
  kisa:         env.VITE_MARKA_KISA || "NIP",
  sehir:        env.VITE_MARKA_SEHIR || "Fethiye",
  epostaAlani:  env.VITE_MARKA_EPOSTA_ALANI || "notinparis.me",
  instagram:    env.VITE_MARKA_INSTAGRAM || (nip ? "https://instagram.com/notinparis.me" : ""),
  // Acilis/karsilama logosu. Isletme kendi ikonlarini isletme/<slug>/public/icons
  // altina koyar; ayni yol, farkli dosya.
  logoYolu:     "/icons/logo-mark.png",
};
MARKA.harf = ((MARKA.kisa || MARKA.ad || "N").trim()[0] || "N").toLocaleUpperCase("tr-TR");
MARKA.buyuk = MARKA.ad.toLocaleUpperCase("tr-TR");
