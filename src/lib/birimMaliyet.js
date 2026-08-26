// Paket fiyatini birim maliyet zannetme tuzagi.
//
// Pipet tam boyle girilmisti: 100'luk paketin fiyati (₺33,60) birim maliyet
// hanesine yazilinca 21 urunun maliyeti sisti — Limonata'da kayitli maliyetin
// %92'si tek bir pipetti, kar raporu o urunlerde anlamsizdi. Fatura kalem
// kalem sisteme girmiyor (invoices tablosu yalniz baslik tutuyor), yani
// capraz kontrol edecek bir kaynak yok. Tek savunma rakamin YAZILDIGI an.
//
// OTOMATIK BOLMEK YANLIS OLUR. Bazi malzemede adet fiyati gercekten yuksektir:
// Stella sisesi ₺138, Absolut ₺1.739. Ekranin isi karari vermek degil,
// ikilemi gorunur kilmak.

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

// Iki okumayi da yazan tek cumle. Ayni metin hem uyari kutusunda hem alan
// altindaki ipucunda kullanilir ki kullanici iki farkli anlatimla karsilasmasin.
export function ikilemMetni(ik, birimAdi = "adet") {
  return `${birimYaz(ik.deger)} girdin. Bu malzeme ${ik.paket}'li paket olarak kayıtlı.\n\n` +
         `• Bu BİR ${birimAdi} fiyatıysa → paket ${birimYaz(ik.deger * ik.paket)} eder.\n` +
         `• Bu PAKET fiyatıysa → birim maliyet ${birimYaz(ik.birim)} olmalı.`;
}
