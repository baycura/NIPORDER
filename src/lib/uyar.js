// KISA UYARI — tarayicinin alert() kutusu yerine.
//
// Panelde 180'den fazla alert() vardi: ekranin ortasinda acilan, "Tamam"a
// basilana kadar her seyi durduran, kurulu uygulamada adres satiri gosteren
// kutular. Hata yazilari artik ustte kisa bir bildirim olarak cikar ve
// kendiliginden kaybolur (components/UyariYuvasi.jsx, StaffLayout'ta tek yuva).
//
//   uyar("Kaydedilemedi: " + hata)        -> kirmizi, role=alert
//   uyar("12 kalem okundu", "basari")     -> yesil, role=status
//
// Yuva yoksa (panel disindaki sayfa) eski davranis: tarayici kutusu. Boylece
// hicbir ileti kaybolmaz.
//
// OKUNMASI ZORUNLU iletiler (yeni sifre, "hesap acik kaldi") bilerek alert()
// olarak birakildi: kaybolan bir yazi onlara uygun degil.

const dinleyenler = new Set();
let sira = 0;

// Cagrilarin cogu sunucu hatasini oldugu gibi ekler ("…: TypeError: Failed to
// fetch"). En sik iki teknik ileti burada Turkce sebebe cevrilir.
const CEVIR = [
  [/(TypeError: )?(Failed to fetch|Load failed|NetworkError when attempting to fetch resource\.?|network request failed)/i,
   "internet bağlantısı kurulamadı. Bağlantını kontrol edip tekrar dene."],
  [/JWT expired|invalid JWT|token is expired/i, "oturum süresi doldu. Çıkış yapıp yeniden gir."],
];

export function uyar(metin, tur = "hata") {
  let yazi = String(metin ?? "");
  for (const [desen, karsilik] of CEVIR) if (desen.test(yazi)) { yazi = yazi.replace(desen, karsilik); break; }
  if (!dinleyenler.size) {
    try { window.alert(yazi); } catch (e) { /* tarayici yok */ }
    return;
  }
  const ileti = { metin: yazi, tur, n: ++sira };
  dinleyenler.forEach(f => f(ileti));
}

export function uyarDinle(f) {
  dinleyenler.add(f);
  return () => { dinleyenler.delete(f); };
}
