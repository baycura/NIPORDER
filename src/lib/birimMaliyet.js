// Birim maliyet hanesine yanlis rakam yazma tuzaklari.
//
// Iki gercek vaka bu dosyayi dogurdu:
//
//   Pipet — 50'lik paketin fiyati (₺33) birim maliyet hanesine yazilmisti.
//   21 urunun maliyeti sisti; Limonata'da kayitli maliyetin %92'si tek bir
//   pipetti. Dogrusu ₺0,66.
//
//   Sut — mililitre maliyeti 0,20523375 yaziyordu. Rakam kendi halinde
//   masum gorunuyor; litreye cevrilince ₺205 ediyordu, gercek fiyat ₺52,75.
//   6 kahvenin maliyeti dort katina cikmisti.
//
// Fatura kalem kalem sisteme girmiyor (invoices tablosu yalniz baslik tutuyor),
// yani capraz kontrol edecek bir kaynak yok. Tek savunma rakamin YAZILDIGI an.
//
// Bu yuzden iki ayri yardimci var:
//   paketIkilemi  — paket/adet karisikligini yakalar (Pipet vakasi)
//   anlasilirFiyat — mililitre/gram maliyetini litre/kilo fiyatina cevirir,
//                    boylece goz kontrolu mumkun olur (Sut vakasi)
//
// OTOMATIK DUZELTMEK YANLIS OLUR. Bazi malzemede adet fiyati gercekten
// yuksektir: Stella sisesi ₺138, Absolut ₺1.739. Ekranin isi karari vermek
// degil, rakami insanin tanidigi olcuye getirip ikilemi gorunur kilmak.

// Girilen rakam iki turlu okunabiliyorsa ikisini de dondurur, yoksa null.
//
// kesin=true: onceki maliyet biliniyor ve yeni rakam onun ~paket kati. Bu
// noktada tesaduf ihtimali cok dusuk, kullaniciya sorulur.
// kesin=false: ilk giris; onceki deger olmadigi icin kanit yok, yalnizca
// sessiz bir hatirlatma gosterilir.
export function paketIkilemi(girilen, malzeme) {
  const deger = Number(girilen);
  const paket = Number(malzeme?.pack_qty) || 1;
  const eski  = Number(malzeme?.cost_per_unit) || 0;
  if (!isFinite(deger) || deger <= 0 || paket <= 1) return null;

  const birim = deger / paket;
  const beklenenPaket = eski * paket;
  const kesin = eski > 0 && Math.abs(deger - beklenenPaket) <= beklenenPaket * 0.15;

  return { deger, paket, birim, kesin };
}

export const birimYaz = (n) =>
  "₺" + Number(n || 0).toLocaleString("tr-TR", { maximumFractionDigits: 4 });

// ---------------------------------------------------------------------------
// UCUNCU TUZAK: KAP FIYATI ILE OLCU FIYATININ YER DEGISTIRMESI
// ---------------------------------------------------------------------------
// Uc gercek vaka daha (18.09.2026 veritabani taramasi):
//
//   Soda (sise) — kayit ml bazinda (sise 200 ml) ama maliyet hanesinde
//   SISENIN fiyati yaziyordu: 30,85. Yani her 1 ml soda 30,85 TL sayildi.
//   Churchill'in maliyeti 6.178 TL cikiyordu (satis 150 TL).
//
//   Monkey Shoulder, Aperol, Bumbu Rom, Monkey 47 Sloe, iki Cotes du Rhone —
//   bunlarda ters yon: birim 'sise' ama hanedeki rakam ML fiyatiydi (3,26).
//   Maliyet hesabi dogru calisiyordu (recete de ml yaziyordu), ama stok
//   "2 sise"den 40 dusurdugu icin ilk satista eksiye iniyordu.
//
// paketIkilemi koli/adet karisikligini yakaliyor; bu ikisini yakalamiyordu
// cunku pack_qty=1'di. Ayrimi yapan sey kap hacmi (unit_volume_ml).
//
// anlasilirYaz zaten "₺30.854 / litre" yaziyordu ve Soda'da kimseyi
// durdurmadi — cunku bilgi veriyor, KARSILIGINI onermiyordu. Buradaki fark:
// otekinin rakamini da hesaplayip gosteriyoruz.

const OLCU_BIRIMLERI = ["ml", "cl", "l", "g", "gr", "kg"];
const KAP_BIRIMLERI  = ["adet", "şişe", "sise"];
const HACIM_KAT = { ml: 1, cl: 10, l: 1000 };

// Kabin, KAYDIN KENDI biriminde kac ettigi. 700 ml sise: kayit ml ise 700,
// cl ise 70, l ise 0,7. Hacim birimi degilse (adet/sise) ml'nin kendisi.
export function kapOlcusu(malzeme) {
  const ml = Number(malzeme?.unit_volume_ml) || 0;
  if (ml <= 1) return 0;
  const kat = HACIM_KAT[malzeme?.unit];
  return kat ? ml / kat : ml;
}

// Litre/kilo karsiligi bu tutarin ustundeyse hicbir kafe malzemesi olamaz.
// Kiyas: en pahali gercek kalem Chivas 18 = 4.685 TL/litre.
const IMKANSIZ_LITRE = 10000;
// Bir kabin (sise/kutu) makul fiyat bandi: en ucuz pet bardak ~1 TL,
// en pahali sise Absolut 1.739 TL, 50 L fici ~10.600 TL.
const KAP_ALT = 20, KAP_UST = 25000;

// Kap TOPLAMI icin ayri yazim: birimYaz 4 haneye kadar gosteriyor, o birim
// maliyet icin dogru (0,1543) ama toplamda "₺2.283,0003" diye cirkin cikiyor.
export const kapYaz = (n) =>
  "₺" + Number(n || 0).toLocaleString("tr-TR", { maximumFractionDigits: 2 });

// Girilen rakam kap fiyati mi olcu fiyati mi? Ikilem varsa dondurur, yoksa
// null. paketIkilemi ile ayni sozlesme: KARAR VERMEZ, iki okumayi da verir.
//
//   yon="olcude-kap"  hane olcu basina ama rakam KAP fiyati gibi duruyor
//   yon="kapta-olcu"  hane kap basina ama rakam OLCU fiyati gibi duruyor
//   kapYazildigiGibi  rakam OLCU fiyati sayilirsa bir kap kaca gelir
//                     (iki yonde de ayni hesap: deger x kap)
//   onerilen          oteki okumaya gore bu HANEDE olmasi gereken sayi
export function kapIkilemi(girilen, malzeme) {
  const deger = Number(girilen);
  const kap = kapOlcusu(malzeme);
  const unit = malzeme?.unit;
  if (!isFinite(deger) || deger <= 0 || kap <= 0) return null;

  const kapYazildigiGibi = deger * kap;

  if (OLCU_BIRIMLERI.includes(unit)) {
    // Yazildigi gibi okunursa litre/kilo fiyati ne eder?
    const a = anlasilirFiyat(deger, unit);
    const litre = a ? a.tutar : deger * 1000;
    if (litre <= IMKANSIZ_LITRE) return null;         // rakam zaten makul
    const onerilen = deger / kap;                      // rakam kap fiyatiysa
    const otekiA = anlasilirFiyat(onerilen, unit);
    // Oteki okuma da sacmaysa ikilem yok, rakam bastan yanlis — sessiz kal.
    if (otekiA && otekiA.tutar > IMKANSIZ_LITRE) return null;
    return { yon: "olcude-kap", deger, kap, unit, onerilen, kapYazildigiGibi };
  }

  if (KAP_BIRIMLERI.includes(unit)) {
    if (deger >= 8) return null;                       // kap fiyati olarak makul
    if (kapYazildigiGibi < KAP_ALT || kapYazildigiGibi > KAP_UST) return null;
    return { yon: "kapta-olcu", deger, kap, unit,
             onerilen: kapYazildigiGibi, kapYazildigiGibi };
  }

  return null;
}

// Iki okumayi da yazan tek cumle — ikilemMetni ile ayni is, kap tuzagi icin.
export function kapIkilemMetni(ik) {
  return ik.yon === "olcude-kap"
    ? `${birimYaz(ik.deger)} girdin ve bu hane ${ik.unit} BAŞINA.\n\n` +
      `• Öyleyse ${ik.kap} ${ik.unit}'lik kap ${kapYaz(ik.kapYazildigiGibi)} eder — bu olamaz.\n` +
      `• Bu rakam KABIN fiyatıysa → hane ${birimYaz(ik.onerilen)} olmalı.`
    : `${birimYaz(ik.deger)} girdin ve bu hane ${ik.unit} BAŞINA.\n\n` +
      `• Öyleyse bir ${ik.unit} ${birimYaz(ik.deger)} eder — bu çok düşük.\n` +
      `• Bu rakam ÖLÇÜ (ml) fiyatıysa → kap ${kapYaz(ik.kapYazildigiGibi)} eder; ` +
      `ya birimi ml yap ya haneye ${kapYaz(ik.kapYazildigiGibi)} yaz.`;
}

// Mililitre/gram maliyeti insanin kafasinda fiyati olan olcuye cevrilir.
// "0,20523375 TL/ml" hicbir sey soylemez; "₺205/litre" yanlisligi bagirir.
// Sut hatasi tam olarak boyle gorundu.
export function anlasilirFiyat(birimMaliyet, unit) {
  const n = Number(birimMaliyet);
  if (!isFinite(n) || n <= 0) return null;
  if (unit === "ml") return { tutar: n * 1000, olcu: "litre" };
  if (unit === "g" || unit === "gr") return { tutar: n * 1000, olcu: "kilo" };
  if (unit === "cl") return { tutar: n * 100, olcu: "litre" };
  return null;   // adet/porsiyon zaten anlasilir, cevirmeye gerek yok
}

export function anlasilirYaz(birimMaliyet, unit) {
  const a = anlasilirFiyat(birimMaliyet, unit);
  if (!a) return null;
  return "₺" + a.tutar.toLocaleString("tr-TR", { maximumFractionDigits: 2 }) + " / " + a.olcu;
}

// Iki okumayi da yazan tek cumle. Ayni metin hem uyari kutusunda hem alan
// altindaki ipucunda kullanilir ki kullanici iki farkli anlatimla karsilasmasin.
export function ikilemMetni(ik, birimAdi = "adet") {
  return `${birimYaz(ik.deger)} girdin. Bu malzeme ${ik.paket}'li paket olarak kayıtlı.\n\n` +
         `• Bu BİR ${birimAdi} fiyatıysa → paket ${birimYaz(ik.deger * ik.paket)} eder.\n` +
         `• Bu PAKET fiyatıysa → birim maliyet ${birimYaz(ik.birim)} olmalı.`;
}
