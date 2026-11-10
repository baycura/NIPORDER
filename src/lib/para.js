// Para ve sure yazimi — tek tanim. (Eskiden bes ayri kopya vardi; ayni hesap
// Masalar'da "₺1.250", Siparis'te "₺1250" yaziyordu.)

// "₺1.250": binlik ayracli, tam sayi (kasada kurus yok).
export const tl = (n) => "₺" + Math.round(Number(n) || 0).toLocaleString("tr-TR");

// "38 dk" / "1 sa 12 dk": bir andan bu yana gecen sure.
export const sure = (iso) => {
  const dk = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (dk < 60) return dk + " dk";
  return Math.floor(dk / 60) + " sa " + (dk % 60) + " dk";
};
