// RECETE ORTAK KURALLARI — Reçeteler sayfasi ve yeni urun formundaki reçete
// bolumu ayni degerleri kullansin diye tek yerde.
import { aramaAnahtari, aramaUyar } from "./stockCount.js";
import { anlasilirFiyat } from "./birimMaliyet.js";

// Recete satirina eklenen malzemenin ILK miktari (birime gore). Yalniz
// baslangic degeri: kisi miktari her zaman elle yazar.
export const varsayilanMiktar = (ing) => {
  if (ing?.unit === "g") return 150;
  if (ing?.unit === "ml") return 40;
  if (ing?.unit === "cl") return 4;
  if (ing?.unit === "l") return 0.2;
  return 1;
};

// YENI URUN FORMUNDAKI recete kutusu icin ilk miktar. Hazir deger elle
// yazilmis gibi gecerli sayilir; yanlis kalirsa her satista o kadar duser.
// O yuzden yalniz TANIDIK durumda hazir deger verilir:
//   ml  -> 40 (tek olcu) · adet -> 1 · sarf (buz 150 g, pipet 1)
// Tartilan malzeme (g: tarcin, kahve, seker) ve YENI ACILAN malzeme BOS
// baslar; "Kaydet" miktari yazdirir.
export const ilkMiktar = (ing, { yeniAcildi = false } = {}) => {
  if (yeniAcildi) return "";
  const tartilan = ["g", "gr", "kg"].includes(ing?.unit);
  if (tartilan && !ing?.is_consumable) return "";
  return varsayilanMiktar(ing);
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
const SARF_RAFI = "Sarf Malzeme";
const FICI_ML = 20000;        // bu boyut ve ustu ficidir: fire payi ister (Stok Yönetimi)
// Bundan kucuk kap buyuk olasilikla cl / litre / kilo olarak yazilmistir
// ("70" = 70 cl, "1" = 1 litre). Ucuz urunde litre fiyati esigi asmaz; o
// yuzden boyutun kendisine bakilir. En kucuk gercek kap: 200 ml soda.
const KUCUK_KAP = { ml: 150, g: 50 };
const PAHALI_LITRE = 10000;   // litre / kilo karsiligi bunu asarsa sorulur (lib/birimMaliyet.js ile ayni esik)

// girdi: { name, unit, boyut, fiyat, eldeki, grup, storeId }
//   boyut  = bir sise / paketin icindeki miktar (unit cinsinden)
//   fiyat  = bir sise / paketin fiyati, KDV dahil (bos = maliyet sonra girilir)
//   eldeki = elde kac sise / paket var (bos = 0; yarim sise 0,5 yazilabilir)
// mevcutlar: ayni adla ikinci kayit acilmasin diye bakilan malzemeler.
// Doner: { hata, ayni? } ya da { kayit, soru? }.
//   soru: rakam kuskulu (70 cl icin "70" yazilmis gibi). Kayit ENGELLENMEZ
//         (minyatur sise, pahali icki gercek olabilir) ama kisi bir kez
//         daha onaylar: maliyet ve stok BIRLIKTE bozuldugu icin sonradan
//         stok ekraninda "2 sise, ₺2.780" diye dogru gorunur, fark edilmez.
export function yeniMalzemeKaydi(girdi, mevcutlar = []) {
  const { name, unit, boyut, fiyat, eldeki, grup, storeId } = girdi || {};
  const ad = String(name || "").trim().replace(/\s+/g, " ");
  if (!ad) return { hata: "Malzemenin adını yaz" };
  const anahtar = aramaAnahtari(ad);
  // Adi yalniz simge olan malzeme aramada hic bulunamaz.
  if (!anahtar) return { hata: "Adında harf ya da rakam olsun" };
  const birim = MALZEME_BIRIMLERI.find(b => b.k === unit);
  if (!birim) return { hata: "Birim seç" };
  if (!storeId) return { hata: "Mağaza bulunamadı" };
  const ayni = (mevcutlar || []).find(m => aramaAnahtari(m.name) === anahtar);
  if (ayni) return { hata: `"${ayni.name}" zaten var. Yeni açma; onu seç.`, ayni };
  const b = Number(boyut);
  if (bosMu(boyut) || !Number.isFinite(b) || b <= 0) return { hata: birim.kapHata };
  if (unit === "adet" && !Number.isInteger(b)) return { hata: "Paketteki adet tam sayı olmalı" };
  // Fici: satilabilir hacim fire payi dusulerek hesaplanir (30 L ficinin
  // 27.500 ml'si). Bu form fire sormaz; maliyet dusuk yazilirdi.
  if (unit === "ml" && b >= FICI_ML) return { hata: "Fıçı bu formdan açılmaz: fire payı girilir. Stok Yönetimi'nden aç ya da yöneticiye yaz." };
  const f = bosMu(fiyat) ? 0 : Number(fiyat);
  if (!Number.isFinite(f) || f < 0) return { hata: "Fiyat geçersiz" };
  const e = bosMu(eldeki) ? 0 : Number(eldeki);
  if (!Number.isFinite(e) || e < 0) return { hata: "Eldeki miktar geçersiz" };
  const raf = String(grup || "").trim() || null;
  const kayit = {
    name: ad, unit, store_id: storeId,
    cost_per_unit: yuvarla(f / b, 6),
    stock_qty: yuvarla(e * b, 3),
    pack_qty: unit === "adet" ? b : 1,
    unit_volume_ml: unit === "ml" ? b : null,
    waste_pct: 0, waste_per_pack: 0,
    // Sarf rafi secildiyse sarf sayilir: SARF dugmelerinde cikar, "sadece
    // parti gecesi" kutusu gelir, secenek carpani uygulanmaz.
    is_consumable: raf === SARF_RAFI,
    grup: raf,
  };
  let soru = null;
  const olculen = unit === "ml" || unit === "g";
  const buyuk = anlasilirFiyat(kayit.cost_per_unit, unit);   // litre / kilo karsiligi
  if (olculen && b < KUCUK_KAP[unit]) {
    soru = unit === "ml"
      ? `Şişe ${b} ml mi? 70 cl şişe 700, 1 litre 1000 yazılır.`
      : `Paket ${b} g mı? 1 kg paket 1000, yarım kilo 500 yazılır.`;
  } else if (buyuk && buyuk.tutar > PAHALI_LITRE) {
    soru = `Bu fiyatla 1 ${buyuk.olcu} ₺${Math.round(buyuk.tutar).toLocaleString("tr-TR")} eder. Şişe boyutunu ve fiyatı kontrol et.`;
  }
  return soru ? { kayit, soru } : { kayit };
}

// Kaydedilecek satirin INSANIN TANIDIGI olcuyle ozeti: mililitre maliyeti
// goz kontrolu icin fazla kucuk bir rakam ("1 ml = ₺19,86" kimseyi durdurmaz;
// "1 litre = ₺19.857" durdurur).
export function yeniMalzemeOzeti(kayit) {
  if (!kayit) return "";
  const yaz = (x, hane) => Number(x).toLocaleString("tr-TR", { maximumFractionDigits: hane });
  const u = kayit.unit;
  const parca = [];
  parca.push(kayit.cost_per_unit > 0 ? `1 ${u} = ₺${yaz(kayit.cost_per_unit, 4)}` : "maliyet yok");
  const buyuk = anlasilirFiyat(kayit.cost_per_unit, u);
  if (buyuk) parca.push(`1 ${buyuk.olcu} = ₺${yaz(buyuk.tutar, 0)}`);
  parca.push(`stok ${yaz(kayit.stock_qty, 2)} ${u}`);
  return parca.join(" · ");
}

// BENZER MALZEMELER: yeni malzeme acilmadan once gosterilir. Ayni malzeme
// baska yazilisla ("vodka" / "Absolut Votka") ya da ayni rafta zaten varsa
// kisi onu secsin; ikinci kayit stogu ve maliyeti ikiye boler.
// Kelime KELIME karsilastirilir ("gin" ile "Tarçın" benzer sayilmaz; "vodka"
// ile "Votka" sayilir). Once kelimesi tutanlar, sonra ayni raftakiler.
const kelimeler = (s) => String(s || "").split(/[\s\-/]+/).filter(k => aramaAnahtari(k).length >= 3);
const ayniKelime = (a, b) => aramaUyar(a, b) && aramaUyar(b, a);
export function benzerMalzemeler(ad, grup, mevcutlar = []) {
  const yk = kelimeler(ad);
  const raf = String(grup || "").trim();
  const kelimeTutan = [], rafTutan = [];
  (mevcutlar || []).forEach(m => {
    const mk = kelimeler(m.name);
    if (yk.some(k => mk.some(w => ayniKelime(w, k)))) kelimeTutan.push(m);
    else if (raf && String(m.grup || "").trim() === raf) rafTutan.push(m);
  });
  return [...kelimeTutan, ...rafTutan];
}
