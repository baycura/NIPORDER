// Stok sayimi yardimcilari — ekran ve gecmis ayni kurallari kullansin diye
// tek yerde.

export const fmtTL = (n) =>
  "₺" + Number(n || 0).toLocaleString("tr-TR", { maximumFractionDigits: 2 });

// Miktar: 712500 gibi sayilar gruplansin, 0.25 gibi olanlar kirpilmasin.
export const fmtMiktar = (n) =>
  Number(n || 0).toLocaleString("tr-TR", { maximumFractionDigits: 3 });

// Bir malzeme "kap" (sise / kutu / kegi) olarak sayilabilir mi?
// unit_volume_ml dolu ve 1'den buyukse evet: raftaki fiziksel nesne o.
// Yoksa satir kendi biriminde kalir — tahmin YAPILMAZ.
export const kapVar = (i) => Number(i?.unit_volume_ml) > 1;

// Kabin adi hacimden turetilir. Amac dogru terminoloji degil, sayan kisinin
// eline aldigi seyi tanimasi: 50 L'lik sey fici, 750 ml'lik sey sise.
export function kapAdi(i) {
  const ml = Number(i?.unit_volume_ml) || 0;
  if (ml >= 20000) return "fıçı";
  if (ml >= 2000) return "bidon";
  return "şişe";
}

// Kayit biriminden kap birimine ve geri. Cevrim TEK YONLU degil: ekranda ne
// gosterirsek onun tersiyle kaydediyoruz, yoksa 750 ml'lik siseyi "1" diye
// sayan kisi stoga 1 ml yazmis olur.
export const kabaCevir = (miktar, i) =>
  kapVar(i) ? Number(miktar) / Number(i.unit_volume_ml) : Number(miktar);

export const kabaGeri = (miktar, i) =>
  kapVar(i) ? Number(miktar) * Number(i.unit_volume_ml) : Number(miktar);

// Fark tutari: eksi = kayip. Maliyeti girilmemis malzeme 0 doner — sayim yine
// yapilir, sadece parasal karsiligi bilinmez.
export const farkTutari = (fark, i) => Number(fark) * (Number(i?.cost_per_unit) || 0);

// Kurus/mililitre artiklarini fark saymayalim: 0.0001 ml sapma "eksik" degil,
// numeric yuvarlamasi.
export const ONEMSIZ = 0.000001;

export const farkRengi = (fark) =>
  Math.abs(Number(fark) || 0) <= ONEMSIZ ? "#8A8A86"
  : Number(fark) < 0 ? "#C87A6A" : "#7FA88A";

export const TASLAK_KEY = (storeId) => `nip_stok_sayim_taslak_${storeId}`;

// Arama: buyuk/kucuk ve Turkce karakter farki eslesmeyi bozmasin. Gece,
// tek elle, "sut" yazip Sut'u bulmak lazim.
const SADE = { ı: "i", i: "i", İ: "i", I: "i", ş: "s", Ş: "s", ğ: "g", Ğ: "g",
               ü: "u", Ü: "u", ö: "o", Ö: "o", ç: "c", Ç: "c" };
export const sadelestir = (s) =>
  String(s || "").replace(/[ıiİIşŞğĞüÜöÖçÇ]/g, c => SADE[c]).toLowerCase();

// Sayim aramasi bir adim daha gevsek: bosluk, tire, nokta atilir ki
// "t shirt", "t-shirt" ve "tshirt" ayni seyi bulsun. Tisort iki dilde
// yaziliyor — eski urunler "T-Shirt", yeniler "Tişört" — biri aranirken
// oteki de cikmali; yoksa "tshirt" yazan kisi bos liste gorur.
const ESANLAM = { tshirt: "tisort", tisort: "tshirt" };
export const aramaAnahtari = (s) => sadelestir(s).replace(/[^a-z0-9]/g, "");
export const aramaUyar = (ad, sorgu) => {
  const q = aramaAnahtari(sorgu);
  if (!q) return true;
  const hedef = aramaAnahtari(ad);
  if (hedef.includes(q)) return true;
  return Object.entries(ESANLAM).some(([a, b]) => q.includes(a) && hedef.includes(q.replace(a, b)));
};
