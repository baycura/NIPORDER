// Uygulamanin genel adresi TEK yerden yonetilir: QR kodlari, personel
// ekranindaki alt yazi ve paylasilan baglantilar buradan okur.
//
// DNS/Vercel tarafinda club.notinparis.me yayina alindiginda burayi
// degistirmek yeterli — eski order.notinparis.me yonlendirme ile calismaya
// devam ettigi surece basili QR'lar olmez.
//
// Baska isletme kurulumunda adres build aninda VITE_APP_HOST ile verilir
// (isletme/<slug>/vite.config.js).
const env = (typeof import.meta !== "undefined" && import.meta.env) || {};

export const APP_HOST = env.VITE_APP_HOST || "order.notinparis.me";
export const APP_URL = "https://" + APP_HOST;
export const menuUrl = (storeSlug) => APP_URL + "/menu?store=" + storeSlug;
