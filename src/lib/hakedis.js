// Doner mutfagi hakedisi — ortak yardimcilar.
//
// Iki sayfa (NIP: /settlement, mutfak: /mutfak-rapor) ve Gun Ozeti'nin Doner
// sekmesi AYNI RPC'yi okur: nip_mutfak_hakedis_raporu. Istemcide hicbir tutar
// yeniden hesaplanmaz; yalniz suzme ve bicimleme yapilir. Boylece NIP sahibi
// ile mutfak, ayni ay icin ayni JSON'u ve ayni WhatsApp metnini gorur —
// mutabakat bu esitlige dayanir.
//
// Para kurali (RPC'de, inter_company_settlement ile ayni): odenmis fisler,
// fisin ACILDIGI ana gore takvim ayi; ikram kalem liste fiyatindan (mutfak
// ikramdan zarar etmez), digerleri indirimli fiyattan. Acik/veresiye fisler
// odendigi ayda girer.
//
// Ay siniri: RPC ayi UTC gece yarisi ile keser. Turkiye'de yaz saati yok
// (+03 sabit), yani sinir her zaman Istanbul 03:00 — Gun Ozeti'nin isletme
// gunu siniriyla ayni saat. Ekranda ve metinde acikca yazilir ki gece fisi
// tartisma cikarmasin.
import { hataMetni } from "./supabase.js";
import { APP_URL, APP_HOST } from "./appUrl.js";

const AYLAR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const AY_KISA = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];

// Telefonun saat dilimine guvenilmez; ay ve gun Istanbul'a gore.
// sv-SE yerel bicimi ISO ile ayni ('YYYY-MM-DD').
export const bugunIstanbul = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" });
export const guncelAy = () => bugunIstanbul().slice(0, 7);
export const ayGecerli = (ay) => /^\d{4}-(0[1-9]|1[0-2])$/.test(ay || "");

export const ayKaydir = (ay, delta) => {
  const [y, m] = ay.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
};
export const ayEtiketi = (ay) => {
  const [y, m] = ay.split("-").map(Number);
  return `${AYLAR[m - 1]} ${y}`;
};
export const ayGunSayisi = (ay) => {
  const [y, m] = ay.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};
// "1 Eyl 03:00 – 1 Eki 03:00"
export const donemMetni = (ay) => {
  const m = Number(ay.slice(5, 7));
  const s = Number(ayKaydir(ay, 1).slice(5, 7));
  return `1 ${AY_KISA[m - 1]} 03:00 – 1 ${AY_KISA[s - 1]} 03:00`;
};
// 'YYYY-MM-DD' -> '17 Eyl'
export const gunEtiketi = (gun) => `${Number(gun.slice(8, 10))} ${AY_KISA[Number(gun.slice(5, 7)) - 1]}`;
// 'YYYY-MM-DD' -> 'DD.MM' (RPC'nin siparisler[].zaman on eki ile eslesir)
export const gunKisa = (gun) => `${gun.slice(8, 10)}.${gun.slice(5, 7)}`;

export const fmtTL = (n) => "₺" + Number(n || 0).toLocaleString("tr-TR", { maximumFractionDigits: 0 });
export const fmtSayi = (n) => Number(n || 0).toLocaleString("tr-TR", { maximumFractionDigits: 0 });
// Saatler Istanbul'a sabit: mutfagin telefonu baska dilimde olsa da metin ayni.
export const saatMetni = (d) => (d instanceof Date ? d : new Date(d)).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" });
export const tarihMetni = (d) => (d instanceof Date ? d : new Date(d)).toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul" });

// Hata siniflari ekranda uc ayri seye donusur: yetkisiz (kilit), baglanti
// (tekrar dene / onbellek), diger (mesaj).
function hataSinifla(e) {
  const code = String(e?.code || "");
  const mesaj = hataMetni(e);
  if (code === "42501" || /yetkisiz/i.test(mesaj)) {
    return { tip: "yetkisiz", mesaj: "Bu hesap hakediş raporunu göremiyor" };
  }
  const cevrimdisi = typeof navigator !== "undefined" && navigator.onLine === false;
  if (code === "ABORT_ERR" || e?.name === "Bağlantı" || cevrimdisi || /fetch|network|Failed to/i.test(mesaj)) {
    return { tip: "baglanti", mesaj: cevrimdisi ? "Bağlantı yok" : mesaj };
  }
  return { tip: "diger", mesaj };
}

// { rapor, hata } — hata: null | { tip: 'yetkisiz'|'baglanti'|'diger', mesaj }
export async function hakedisRaporu(client, ay) {
  try {
    const { data, error } = await client.rpc("nip_mutfak_hakedis_raporu", { p_ay: ay + "-01" });
    if (error) return { rapor: null, hata: hataSinifla(error) };
    return { rapor: data, hata: null };
  } catch (e) {
    return { rapor: null, hata: hataSinifla(e) };
  }
}

// Son basarili rapor cihazda kalir: mutfagin telefonu cekmediginde ekran bos
// kalmasin, "son veri HH:MM" seridiyle gosterilsin. Gizli mod/dolu depo
// hatalari yutulur.
const ONBELLEK_ONEK = "nip-hakedis:";
export const raporSakla = (ay, rapor) => {
  try { localStorage.setItem(ONBELLEK_ONEK + ay, JSON.stringify({ rapor, zaman: new Date().toISOString() })); } catch { /* depo yok */ }
};
export const raporOku = (ay) => {
  try {
    const j = JSON.parse(localStorage.getItem(ONBELLEK_ONEK + ay) || "null");
    return j && j.rapor ? { rapor: j.rapor, zaman: new Date(j.zaman) } : null;
  } catch { return null; }
};

// Ekranin ustunde kucuk "dikkat" cipleri. Yalniz tetiklenenler doner.
// seviye: 'bilgi' | 'uyari'
export function anomaliler(rapor, { guncel = false } = {}) {
  if (!rapor) return [];
  const out = [];
  const od = rapor.odenecek || {};
  const siparisler = rapor.siparisler || [];
  const acikN = Number(rapor.acik_siparis || 0);
  if (acikN > 0) {
    out.push(guncel
      ? { tip: "acik", seviye: "bilgi", metin: `${acikN} açık sipariş (${fmtTL(rapor.acik_tutar)}) — kapanınca eklenir` }
      : { tip: "acik", seviye: "uyari", metin: `${acikN} sipariş hâlâ kapanmamış (${fmtTL(rapor.acik_tutar)}) — ödenince bu aya girer` });
  }
  const ikramN = siparisler.filter(s => s.ikram).length;
  if (ikramN > 0) {
    const oran = od.siparis ? ikramN / Number(od.siparis) : 0;
    out.push({ tip: "ikram", seviye: (ikramN >= 5 || oran > 0.10) ? "uyari" : "bilgi", metin: `${ikramN} ikramlı sipariş — liste fiyatından sayıldı` });
  }
  const iptalN = Number(rapor.iptal_kalem || 0);
  if (iptalN > 0) {
    // Kucuk aylarda tek iptal %5'i asar; uyari icin en az 3 iptal de gerekir
    const oran = iptalN / (Number(od.kalem || 0) + iptalN);
    out.push({ tip: "iptal", seviye: (oran > 0.05 && iptalN >= 3) ? "uyari" : "bilgi", metin: `${iptalN} iptal kalem — sayılmadı` });
  }
  const kart = rapor.kartlar || {};
  if (kart.ort_hazirlik_dk != null && Number(kart.ort_hazirlik_dk) > 20) {
    out.push({ tip: "hazirlik", seviye: "bilgi", metin: `Hazırlık ortalaması ${fmtSayi(kart.ort_hazirlik_dk)} dk` });
  }
  // "Kart dusmemis" uyarisi bilerek YOK: kopru 12 Eylul aksami acildi, o ayin
  // onceki fisleri kartsiz — yanlis alarm olurdu. Kart sayisi pano kutusunda.
  return out;
}

// WhatsApp / pano metni. Tek uretici: iki taraf da bu fonksiyonla ayni metni
// gorur. WhatsApp *kalin* isaretlerini tanir; baska bicimleme yok. Fis listesi
// metne girmez (uzun), uygulama baglantisi verilir.
export function hakedisMetni(rapor, { uretim = new Date() } = {}) {
  if (!rapor) return "";
  const ay = rapor.ay;
  const od = rapor.odenecek || {};
  const satir = [];
  satir.push("*NOT IN PARIS → DÖNER MUTFAĞI*");
  satir.push(`Hakediş · ${ayEtiketi(ay)}`);
  satir.push(`Dönem: ${donemMetni(ay)} (fişin açıldığı ana göre)`);
  satir.push("");
  satir.push(`*Ödenecek: ${fmtTL(od.tutar)}*`);
  satir.push(`${fmtSayi(od.siparis)} sipariş · ${fmtSayi(od.kalem)} kalem · yalnız ödenmiş fişler`);

  const urunler = rapor.urunler || [];
  if (urunler.length) {
    satir.push("", "Ürünler");
    urunler.forEach(u => satir.push(`• ${fmtSayi(u.adet)}× ${u.ad} — ${fmtTL(u.tutar)}`));
  }
  const gunler = rapor.gunler || [];
  if (gunler.length) {
    satir.push("", "Günler");
    gunler.forEach(g => satir.push(`${gunKisa(g.gun)} · ${fmtSayi(g.adet)} adet · ${fmtTL(g.tutar)}`));
  }

  const notlar = [];
  const ikramN = (rapor.siparisler || []).filter(s => s.ikram).length;
  if (ikramN > 0) notlar.push(`${ikramN} ikramlı sipariş — ikram ürün liste fiyatından ödenir, tutara DAHİL`);
  if (Number(rapor.iptal_kalem || 0) > 0) notlar.push(`${fmtSayi(rapor.iptal_kalem)} iptal kalem — sayılmadı`);
  if (Number(rapor.acik_siparis || 0) > 0) notlar.push(`Açık/veresiye: ${fmtSayi(rapor.acik_siparis)} sipariş · ${fmtTL(rapor.acik_tutar)} — DAHİL DEĞİL, ödendiği ayda girer`);
  else notlar.push("Açık sipariş yok");
  notlar.push("İndirimli ürün indirimli fiyattan sayılır");
  satir.push("", "Not");
  notlar.forEach(n => satir.push(`• ${n}`));

  const kart = rapor.kartlar || {};
  if (Number(kart.acilan || 0) > 0) {
    const ort = kart.ort_hazirlik_dk != null ? ` · ort. hazırlık ${fmtSayi(kart.ort_hazirlik_dk)} dk` : "";
    satir.push("", `Pano: ${fmtSayi(kart.acilan)} kart${ort}`);
  }

  satir.push("", `Fiş dökümü: ${APP_HOST}/mutfak-rapor?ay=${ay}`);
  satir.push(`Üretildi: ${tarihMetni(uretim)} ${saatMetni(uretim)}`);
  return satir.join("\n");
}

// Numara yok: WhatsApp kisiyi sectirir, telefon numarasi kodda/ayarda durmaz.
export const waUrl = (metin) => "https://wa.me/?text=" + encodeURIComponent(metin);
export const mutfakRaporUrl = (ay) => `${APP_URL}/mutfak-rapor${ay ? "?ay=" + ay : ""}`;

// Tiklama icinde senkron cagrilmali (iOS clipboard sarti). HTTPS disinda
// navigator.clipboard yok; gizli textarea + execCommand yedegi.
export async function panoyaKopyala(metin) {
  try {
    if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(metin); return true; }
  } catch { /* asagidaki yedek */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = metin; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch { return false; }
}
