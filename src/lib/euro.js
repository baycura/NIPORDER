// EURO KARSILIGI — TL fiyatin yaninda kucuk, silik "≈ €5".
//
// SAHIP: "Urunlerin fiyatlari yanina ortalama Euro fiyatlarini da kucuk ve
// soluk koyalim, turistlere kolaylik olsun; gunluk kuru cekip kusuratı asagi
// yuvarlayalim."
//
// KUR NEREDEN: app_settings['eur_rate']. Zaten gunluk cekiliyor (edge
// fonksiyonu eur-rate-sync, TCMB doviz satis; Ayarlar'dan elle de girilebilir).
// Bu dosya kur CEKMEZ, yalnizca yazar.
//
// IKI KURAL:
//   1. ASAGI yuvarlanir. Musteri kasada gordugunden FAZLA odememeli; yukari
//      yuvarlanan bir euro rakami "ama menude 5 euro yaziyordu" tartismasi
//      cikarir. Asagi yuvarlama her zaman musterinin lehine.
//   2. Gosterim YAKLASIKTIR ve oyle yazilir ("≈"). Satis TL'dir; bu rakam
//      fiyat degil, fikir verir. Kur yoksa hic gosterilmez — yanlis rakam
//      gostermektense hic gostermemek iyidir.
//
// ADIM: 0,5 € (varsayilan) ya da 1 €. 1 €'da ucuz urunler cok sapar:
// 122 ₺ kahve 56 kurla 2,17 € eder, 1 € adiminda "2 €" (%8 dusuk), ama
// 165 ₺'lik bir urun 2,94 -> "2 €" (%32 dusuk) gorunur. 0,5 adimda sapma
// en fazla yarim euro kalir.

export const EURO_ADIMLARI = [0.5, 1];

// Ayarlardan kuru oku: "56,12" ya da "56.12" gelebilir.
export function euroKuru(settings) {
  const ham = String(settings?.eur_rate ?? "").replace(",", ".").replace(/[^0-9.]/g, "");
  const kur = Number(ham);
  return Number.isFinite(kur) && kur > 1 ? kur : 0;
}

export function euroGosterilsin(settings) {
  const v = settings?.eur_price_hint;
  return v !== false && v !== "false";     // varsayilan ACIK
}

export function euroAdimi(settings) {
  const n = Number(String(settings?.eur_price_hint_step ?? "").replace(",", "."));
  return EURO_ADIMLARI.includes(n) ? n : 0.5;
}

// TL -> "≈ €4,5" | null. Kur yoksa, tutar sifir/negatifse ya da sonuc bir
// adimin altinda kaliyorsa null doner (satirda hicbir sey cikmaz).
export function euroYaz(tl, kur, adim = 0.5) {
  const tutar = Number(tl);
  if (!(kur > 1) || !Number.isFinite(tutar) || tutar <= 0) return null;
  const ham = tutar / kur;
  const asagi = Math.floor(ham / adim) * adim;
  if (asagi < adim) return null;                 // "€0" yazmayalim
  const yazi = asagi % 1 === 0 ? String(asagi) : asagi.toFixed(1).replace(".", ",");
  return "≈ €" + yazi;
}
