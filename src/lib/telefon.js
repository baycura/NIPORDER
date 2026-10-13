// Telefonu uyelerle ayni bicime getir (+90…): uye kaydi E.164 tutar
// (save_member_profile). Kasada "0555 123 45 67" yazilip sonra ayni kisi
// uye olursa iki kayit olusmasin. Kisa/anlamsiz giris oldugu gibi kalir.
export const telefonNormalize = (s) => {
  const d = String(s || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.length === 10 && d.startsWith("5")) return "+90" + d;
  if (d.length === 11 && d.startsWith("05")) return "+9" + d;
  if (d.length === 12 && d.startsWith("90")) return "+" + d;
  return String(s || "").trim().startsWith("+") ? "+" + d : d;
};

// wa.me ulke koduyla baslayan, "+" isaretsiz numara ister. "05321234567"
// gecersiz, "5321234567" ise +53 (Kuba) sanilir. Ulke kodu bilinmeyen
// numarada bos doner: WhatsApp kisiyi sectirir.
export const waNumara = (s) => {
  const n = telefonNormalize(s);
  return n.startsWith("+") && n.length >= 11 ? n.slice(1) : "";
};
