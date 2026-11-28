// RECETE ORTAK KURALLARI — Reçeteler sayfasi ve yeni urun formundaki reçete
// bolumu ayni degerleri kullansin diye tek yerde.
import { aramaAnahtari } from "./stockCount.js";

// Recete satirina eklenen malzemenin ILK miktari (birime gore). Yalniz
// baslangic degeri: kisi miktari her zaman elle yazar.
export const varsayilanMiktar = (ing) => {
  if (ing?.unit === "g") return 150;
  if (ing?.unit === "ml") return 40;
  if (ing?.unit === "cl") return 4;
  if (ing?.unit === "l") return 0.2;
  return 1;
};

// Formda tutulan satirlar: [{ ingredient_id, name, unit, qty, store_id }].
// Miktari gecersiz (bos, 0, eksi, sayi degil) ilk satiri verir; hepsi
// gecerliyse null. Kayittan ONCE bakilir: 0 miktarli satir stoktan hicbir sey
// dusmez, "reçete girdim" sanilmasin.
export const gecersizReceteSatiri = (satirlar) =>
  (satirlar || []).find(r => {
    const q = Number(r.qty);
    return r.qty === "" || r.qty == null || !Number.isFinite(q) || q <= 0;
  }) || null;

// Formdaki satirlar -> recipes tablosuna yazilacak kayitlar.
// party_only: sarf malzeme yalniz parti gecesi dusulur (PET bardak).
export const receteKayitlari = (satirlar, productId, storeId) =>
  (satirlar || []).map(r => ({
    product_id: productId,
    ingredient_id: r.ingredient_id,
    qty_per_unit: Number(r.qty),
    store_id: storeId,
    party_only: !!r.party_only,
  }));

// ---------------------------------------------------------------------------
// YENI MALZEME (sahip 28.11: ek yetkili personel listede olmayan malzemeyi
// acabilsin; maliyet ve stok da girebilsin).
//
// Kisi PAKET diliyle yazar, kayit BIRIM diliyle tutulur:
//   "70 cl sise ₺1.390, elde 2 sise"  ->  ml basina ₺1,9857 · stok 1.400 ml
// Birim maliyeti elle yazdirmak iki kez pahaliya patladi (soda 200 kat sisik
// kaydedilmisti: lib/birimMaliyet.js). Burada bolmeyi kod yapar.
//
// Fiyat KDV DAHIL yazilir (isletme kurali: birim maliyet KDV dahildir).
// ---------------------------------------------------------------------------
export const MALZEME_BIRIMLERI = [
  { k: "ml",   ne: "sıvı: içki, şurup, süt",
    kap: "Bir şişe / kap kaç ml?", kapOrnek: "70 cl şişe = 700", kapHata: "Şişenin kaç ml olduğunu yaz",
    fiyatSoru: "Bir şişenin fiyatı", eldeSoru: "Elde kaç şişe var?", hazir: [200, 500, 700, 750, 1000] },
  { k: "g",    ne: "tartılan: kahve, şeker",
    kap: "Bir paket kaç g?", kapOrnek: "1 kg paket = 1000", kapHata: "Paketin kaç g olduğunu yaz",
    fiyatSoru: "Bir paketin fiyatı", eldeSoru: "Elde kaç paket var?", hazir: [250, 500, 1000] },
  { k: "adet", ne: "sayılan: şişe bira, limon, bardak",
    kap: "Bir pakette / kolide kaç adet?", kapOrnek: "tek tek alınıyorsa 1", kapHata: "Pakette kaç adet olduğunu yaz (tek tek alınıyorsa 1)",
    fiyatSoru: "Bir paketin / kolinin fiyatı", eldeSoru: "Elde kaç paket / koli var?", hazir: [1, 6, 20, 24, 100] },
];

const bosMu = (v) => v === "" || v == null;
const yuvarla = (x, hane) => { const k = 10 ** hane; return Math.round(x * k) / k; };

// girdi: { name, unit, boyut, fiyat, eldeki, grup, storeId }
//   boyut  = bir sise / paketin icindeki miktar (unit cinsinden)
//   fiyat  = bir sise / paketin fiyati, KDV dahil (bos = maliyet sonra girilir)
//   eldeki = elde kac sise / paket var (bos = 0; yarim sise 0,5 yazilabilir)
// mevcutlar: ayni adla ikinci kayit acilmasin diye bakilan malzemeler.
// Doner: { hata, ayni? } ya da { kayit } (ingredients satiri).
export function yeniMalzemeKaydi(girdi, mevcutlar = []) {
  const { name, unit, boyut, fiyat, eldeki, grup, storeId } = girdi || {};
  const ad = String(name || "").trim().replace(/\s+/g, " ");
  if (!ad) return { hata: "Malzemenin adını yaz" };
  const birim = MALZEME_BIRIMLERI.find(b => b.k === unit);
  if (!birim) return { hata: "Birim seç" };
  if (!storeId) return { hata: "Mağaza bulunamadı" };
  const anahtar = aramaAnahtari(ad);
  const ayni = (mevcutlar || []).find(m => aramaAnahtari(m.name) === anahtar);
  if (ayni) return { hata: `"${ayni.name}" zaten var. Yeni açma; aramadan seç.`, ayni };
  const b = Number(boyut);
  if (bosMu(boyut) || !Number.isFinite(b) || b <= 0) return { hata: birim.kapHata };
  if (unit === "adet" && !Number.isInteger(b)) return { hata: "Paketteki adet tam sayı olmalı" };
  const f = bosMu(fiyat) ? 0 : Number(fiyat);
  if (!Number.isFinite(f) || f < 0) return { hata: "Fiyat geçersiz" };
  const e = bosMu(eldeki) ? 0 : Number(eldeki);
  if (!Number.isFinite(e) || e < 0) return { hata: "Eldeki miktar geçersiz" };
  return {
    kayit: {
      name: ad, unit, store_id: storeId,
      cost_per_unit: yuvarla(f / b, 6),
      stock_qty: yuvarla(e * b, 3),
      pack_qty: unit === "adet" ? b : 1,
      unit_volume_ml: unit === "ml" ? b : null,
      waste_pct: 0, waste_per_pack: 0, is_consumable: false,
      grup: String(grup || "").trim() || null,
    },
  };
}
