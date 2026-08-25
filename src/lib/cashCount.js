// Kasa sayimi yardimcilari — ekran ve gecmis ayni kurallari kullansin diye
// tek yerde.

// Buyukten kucuge. Ilk bes acik gorunur, kalani "Bozuk para" arkasinda:
// gece yarisi 9 alan yerine 5 alan doldurmak isi hizlandirir.
export const KUPURLER = [200, 100, 50, 20, 10];
export const BOZUKLAR = [5, 1, 0.5, 0.25];

export const kupurToplam = (denoms) =>
  Object.entries(denoms || {}).reduce(
    (t, [k, v]) => t + (Number(k) || 0) * (Number(v) || 0), 0);

export const fmtTL = (n) =>
  "₺" + Number(n || 0).toLocaleString("tr-TR", { maximumFractionDigits: 2 });

// Aciklama zorunlulugu esigi. DB de ayni esigi zorluyor (fn_kasa_sayimi_doldur).
// Kurus farklari icin not istenmesin ki zorunluluk ritüele donusmesin.
export const NOT_ESIGI = 100;

// Farkin rengi bilgi tasir: sifira yakin sakin, buyuk fark uyari.
export const farkRengi = (fark) =>
  Math.abs(Number(fark) || 0) <= NOT_ESIGI ? "#F0EDE8" : "#C87A6A";

// Taslak anahtari magaza + gun bazli: iki magazali bir kullanicinin taslagi
// otekine sizmasin.
export const TASLAK_KEY = (storeId, gun) => `nip_kasa_taslak_${storeId}_${gun}`;

// DB'nin kabul ettigi bicim: {"200":3,"50":1}. Sifir olan kupur hic gonderilmez.
export const denomsTemizle = (adetler) => {
  const out = {};
  for (const [k, v] of Object.entries(adetler || {})) {
    const n = Math.trunc(Number(v) || 0);
    if (n > 0) out[String(k)] = n;
  }
  return out;
};
