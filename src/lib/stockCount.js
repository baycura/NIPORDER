// Stok sayimi yardimcilari — ekran ve gecmis ayni kurallari kullansin diye
// tek yerde.

export const fmtTL = (n) =>
  "₺" + Number(n || 0).toLocaleString("tr-TR", { maximumFractionDigits: 2 });

// Miktar: 712500 gibi sayilar gruplansin, 0.25 gibi olanlar kirpilmasin.
export const fmtMiktar = (n) =>
  Number(n || 0).toLocaleString("tr-TR", { maximumFractionDigits: 3 });

// Kayit birimi mililitre cinsinden kac ml? Kap cevrimi YALNIZ hacim birimiyle
// tutulan malzemede anlamli.
const HACIM = { ml: 1, cl: 10, l: 1000 };
export const hacimBirimi = (i) => HACIM[i?.unit] || 0;

// Bir malzeme "kap" (sise / kutu / kegi) olarak sayilabilir mi?
// SART: malzeme hacimle tutuluyor (ml/cl/l) VE bir kabin hacmi yazili.
// SAHIP: "Sise biralarda ml, koli vb. hesaplara gerek yok; adet fiyatiyla
// alip adet fiyatiyla satiyoruz." Zaten adetle tutulan malzemede kap cevrimi
// hem gereksiz hem YANLIS: 38 adet Heineken, 330'a bolunup "0,115 sise"
// gorunuyordu. Adetle tutulan sey zaten sayilacak seydir.
export const kapVar = (i) => hacimBirimi(i) > 0 && Number(i?.unit_volume_ml) > 1;

// FICI ESIGI: 20 litre ve ustu kap ficidir. Fici hacmi sabittir (30 ya da
// 50 L) ve kimse depoda mililitre saymaz — fici HER ZAMAN adetle sayilir,
// ekranin sayim birimi ne olursa olsun (sahip karari, 16.09.2026).
export const FICI_ML = 20000;
export const ficiMi = (i) => kapVar(i) && Number(i?.unit_volume_ml) >= FICI_ML;

// Kabin adi hacimden turetilir. Amac dogru terminoloji degil, sayan kisinin
// eline aldigi seyi tanimasi: 50 L'lik sey fici, 750 ml'lik sey sise.
export function kapAdi(i) {
  const ml = Number(i?.unit_volume_ml) || 0;
  if (ml >= FICI_ML) return "fıçı";
  if (ml >= 2000) return "bidon";
  return "şişe";
}

// Kap boyu okunur yazi: 50.000 ml degil "50 L", 700 ml degil "70 cl".
// Sayan kisi elindeki sisenin/ficinin ustundeki yaziyla karsilastiracak.
export function boyYaz(ml) {
  const n = Number(ml) || 0;
  if (!n) return "";
  if (n >= FICI_ML) return fmtMiktar(n / 1000) + " L";
  if (n % 10 === 0) return fmtMiktar(n / 10) + " cl";
  return fmtMiktar(n) + " ml";
}
export const kapBoyu = (i) => boyYaz(i?.unit_volume_ml);

// SAHIP: "Sise agir alkoller — cin, viski, votka — 50, 70 ve 100 cl'lik
// versiyonlarla satiliyor; bunlarda boy secenegi olsun."
// Ayni malzeme bazen 70, bazen 100 cl gelir. Kayitli boy varsayilan kalir;
// sayarken/girerken elindeki sisenin boyu tek dokunusla secilir. Kayitli boy
// listeye her zaman eklenir (75 cl sarap, 33 cl sise gibi).
export const SISE_BOYLARI = [500, 700, 1000];
export const FICI_BOYLARI = [30000, 50000];
export function boySecenekleri(i) {
  if (!kapVar(i)) return [];
  const kendi = Number(i.unit_volume_ml) || 0;
  const temel = ficiMi(i) ? FICI_BOYLARI : SISE_BOYLARI;
  return [...new Set([...temel, kendi])].filter(x => x > 0).sort((a, b) => a - b);
}

// Kayit biriminden kap birimine ve geri. Cevrim TEK YONLU degil: ekranda ne
// gosterirsek onun tersiyle kaydediyoruz, yoksa 750 ml'lik siseyi "1" diye
// sayan kisi stoga 1 ml yazmis olur.
// Kayit birimi cl ya da l olabilir: 70 cl'lik sise, cl tutulan malzemede 70
// birimdir, 700 degil. Once ml'ye cevrilir, sonra kap hacmine bolunur.
// boyMl verilirse kayitli boy yerine o kullanilir (elindeki sisenin boyu).
export const kapMl = (i, boyMl) => Number(boyMl) > 0 ? Number(boyMl) : Number(i?.unit_volume_ml);

export const kabaCevir = (miktar, i, boyMl) =>
  kapVar(i) ? Number(miktar) * hacimBirimi(i) / kapMl(i, boyMl) : Number(miktar);

export const kabaGeri = (miktar, i, boyMl) =>
  kapVar(i) ? Number(miktar) * kapMl(i, boyMl) / hacimBirimi(i) : Number(miktar);

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
