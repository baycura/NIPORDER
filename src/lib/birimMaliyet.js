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
