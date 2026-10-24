// Konsinye: tedarikcinin mali bizde satilir, satisin bir yuzdesi bize kalir.
// Alis fiyati yoktur; maliyet satis aninda belli olur:
//   maliyet = satis x (100 - bizim pay) / 100
//
// Uc duzeyde tanim, en ozel kazanir: urun > marka (raf) > kategori.
// Veritabanindaki nip_konsinye_pay() ile AYNI kural; raporlar DB'den okur,
// bu dosya yalniz formlarda onizleme ve aciklama icin.

export function konsinyeDurumu(urun, kategori, marka) {
  const markaDer = !!marka?.konsinye;
  const katDer = !!kategori?.konsinye;
  const etkin = urun?.konsinye === true ? true
              : urun?.konsinye === false ? false
              : (markaDer || katDer);
  if (!etkin) return { etkin: false, pay: null, kaynak: null };
  const dolu = (v) => v != null && v !== "" && isFinite(Number(v));
  if (dolu(urun?.konsinye_pay_pct)) return { etkin: true, pay: Number(urun.konsinye_pay_pct), kaynak: "ürün" };
  if (markaDer && dolu(marka?.konsinye_pay_pct)) return { etkin: true, pay: Number(marka.konsinye_pay_pct), kaynak: "marka" };
  if (katDer && dolu(kategori?.konsinye_pay_pct)) return { etkin: true, pay: Number(kategori.konsinye_pay_pct), kaynak: "kategori" };
  return { etkin: true, pay: null, kaynak: null };
}

// Satis fiyatindan tedarikciye gidecek tutar (bizim maliyetimiz).
export const konsinyeMaliyet = (satis, pay) =>
  pay == null ? null : Math.round(Number(satis || 0) * (100 - Number(pay)) / 100);

export const payMetni = (pay) =>
  pay == null ? "bizim pay yazılmadı" : `%${Number(pay)} bizim · %${100 - Number(pay)} tedarikçinin`;

// Form kutusundan veritabanina: bos -> null, yoksa 0-100 arasi sayi.
export const payTemizle = (v) => {
  if (v === "" || v == null) return null;
  const n = Number(String(v).replace(",", "."));
  if (!isFinite(n)) return null;
  return Math.min(100, Math.max(0, n));
};
