// Uygulamanin genel adresi TEK yerden yonetilir: QR kodlari, personel
// ekranindaki alt yazi ve paylasilan baglantilar buradan okur.
//
// Not in Paris'te IKI adres ayni uygulamayi sunar (sahip karari, 12.11):
// club.notinparis.me (yeni, kapsayici ad) ve order.notinparis.me (eski;
// basili QR'lar ve gonderilmis baglantilar icin SUREKLI acik kalir).
// Uygulama bu iki adresten hangisinde acildiysa urettigi baglantilar da o
// adresi tasir: club'da basilan QR club'i, order'da basilan order'i gosterir.
// Boylece club adresi DNS/Vercel'de acildigi an kod degisikligi gerekmez.
//
// VARSAYILAN adres (tarayici disi kullanim, index.html onizleme etiketleri,
// taninmayan bir adresten acilis) build anindaki VITE_APP_HOST'tur. Baska
// isletme kurulumunda bu deger kendi adresidir (isletme/<slug>/vite.config.js)
// ve ikiz adres kurali ORADA DEVREYE GIRMEZ.
const env = (typeof import.meta !== "undefined" && import.meta.env) || {};

export const IKIZ_ADRESLER = ["club.notinparis.me", "order.notinparis.me"];
const VARSAYILAN_HOST = env.VITE_APP_HOST || "order.notinparis.me";

export function appHostSec(varsayilan, acilan) {
  const a = String(acilan || "").toLowerCase();
  return IKIZ_ADRESLER.includes(varsayilan) && IKIZ_ADRESLER.includes(a) ? a : varsayilan;
}

const acilanHost = typeof window !== "undefined" && window.location ? window.location.hostname : "";

export const APP_HOST = appHostSec(VARSAYILAN_HOST, acilanHost);
export const APP_URL = "https://" + APP_HOST;
export const menuUrl = (storeSlug) => APP_URL + "/menu?store=" + storeSlug;
