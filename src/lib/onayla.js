// ONAY PENCERESI — tarayicinin confirm() kutusu yerine.
//
// Panelde 34 confirm() vardi: kurulu uygulamada adres satiri gosteren,
// dugmeleri "Tamam / İptal" olan, iPad'de ekranin ortasinda kucuk dugmelerle
// acilan kutular. Simdi uygulamanin kendi penceresi cikar; dugme ne
// yapacagini yazar ("Sil", "Evet"), vazgecmek her zaman "Vazgeç".
//
//   if (!(await onayla('"Latte" silinsin mi?', { evet: "Sil", tehlike: true }))) return;
//
// Yuva yoksa (panel disindaki sayfa) eski davranis: tarayici kutusu. Boylece
// hicbir soru sorulmadan gecilmez.

const dinleyenler = new Set();
let sira = 0;

export function onayla(metin, secenek = {}) {
  const yazi = String(metin ?? "");
  if (!dinleyenler.size) {
    let cevap = false;
    try { cevap = window.confirm(yazi); } catch (e) { cevap = false; }
    return Promise.resolve(cevap);
  }
  return new Promise((coz) => {
    const istek = {
      metin: yazi,
      evet: secenek.evet || "Evet",
      hayir: secenek.hayir || "Vazgeç",
      tehlike: !!secenek.tehlike,
      n: ++sira,
      coz,
    };
    // Tek yuva cizer; birden cok yuva varsa (olmamali) sonuncusu.
    [...dinleyenler].pop()(istek);
  });
}

export function onayDinle(f) {
  dinleyenler.add(f);
  return () => { dinleyenler.delete(f); };
}
