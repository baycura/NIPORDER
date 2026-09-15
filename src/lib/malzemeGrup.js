// MALZEME RAFLARI — Stok ekranlarinin ortak gruplama mantigi.
//
// SAHIP: "Stok ekrani cok zorlu; temizlik, sarf malzeme vb. hepsini kategori
// kategori ayirsak." Uc ekran ayni raflari gostersin diye tek yerde:
//   Stok Yonetimi (/stock-mgmt)  — malzeme kartlari, stok girisi
//   Stok (/stock)                — personelin baktigi liste
//   Stok Sayimi (/stock-count)   — raf sayilirken
//
// Raf adi ingredients.grup kolonunda (serbest metin, 20260916_malzeme_gruplari).
// Bos olan "Diger"e duser. Asagidaki sira menudeki okuma sirasidir: once
// ickiler, sonra bar disi, en sonda sarf ve temizlik.

export const GRUP_SIRASI = [
  "Cin", "Viski", "Votka", "Rom & Tekila", "Likör & Aperitif",
  "Fıçı Bira", "Şişe Bira", "Şarap & Köpüklü",
  "Meşrubat & Su", "Meyve Suyu & Şurup", "Kahve & Çay",
  "Süt & Yiyecek", "Sarf Malzeme", "Temizlik",
  "Raf Ürünleri", "Diğer",
];

export const GRUPSUZ = "Diğer";
export const RAF_URUN = "Raf Ürünleri";     // products.track_stock (tisort, sapka)

export const grupSira = (ad) => {
  const i = GRUP_SIRASI.indexOf(ad);
  return i < 0 ? GRUP_SIRASI.length - 1 : i;  // taninmayan raf "Diger"den once
};

// Bir satirin raf adi. Raf urunu (sayim ekraninda products'tan gelen satir)
// kendi rafina gider; malzemede grup bos ise "Diger".
export const grupAdi = (i) => (i?.urun ? RAF_URUN : (i?.grup?.trim() || GRUPSUZ));

export const trKucuk = (s) => String(s || "").toLocaleLowerCase("tr");

// Listeyi raflara ayirir. ek(i) cagiran ekranin kendi sayaclarini ekler
// (azalan, sayilan, tukenen...); dondurulen grup nesnesine yazilir.
export function raflaraAyir(liste, ek) {
  const m = new Map();
  (liste || []).forEach(i => {
    const ad = grupAdi(i);
    if (!m.has(ad)) m.set(ad, { ad, items: [] });
    const g = m.get(ad);
    g.items.push(i);
    if (ek) ek(g, i);
  });
  return [...m.values()].sort(
    (a, b) => grupSira(a.ad) - grupSira(b.ad) || a.ad.localeCompare(b.ad, "tr")
  );
}

// Hacim birimli malzemede sise karsiligi: bar siseyle dusunur, sistem ml tutar.
export function siseKarsiligi(i) {
  const hacim = Number(i?.unit_volume_ml) || 0;
  const carp = i?.unit === "ml" ? 1 : i?.unit === "cl" ? 10 : i?.unit === "l" ? 1000 : 0;
  if (!carp || hacim <= 0) return null;
  return Math.round((Number(i.stock_qty) || 0) * carp / hacim * 10) / 10;
}

// Kabin adi: 50 L'lik sey "sise" degil fici. Esik ve adlandirma sayim
// ekraniyla ayni yerden gelsin diye stockCount.js'ten.
export { kapAdi, ficiMi } from "./stockCount.js";
