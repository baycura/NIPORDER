// GIRIS DONUSU: club'da baslayan giris club'da bitsin.
//
// Uygulama iki adresten sunulur (lib/appUrl.js: club ve order). Supabase,
// Google ya da e-posta baglantisi ile giristen sonra kullaniciyi yalniz KENDI
// izin listesindeki adrese geri yollar; listede olmayan adres icin "Site URL"e
// (order.notinparis.me, kok sayfa) duser. O liste yalniz Supabase panelinden
// degisir. Olcum (12.11): club listede YOK; club'da baslayan Google girisi
// order'a donuyor ve kisi yanlis adreste oturum aciyor.
//
// Cozum (panel ayari gerektirmez):
//   1) Giris baslarken, baslanan adres kisa omurlu bir cereze yazilir. Cerez
//      ust alan adina (notinparis.me) aittir; iki adres de okur.
//   2) Uygulama acilirken adres cubugunda giris sonucu (#access_token / #error)
//      varsa ve cerez OBUR ikiz adresi gosteriyorsa, sonuc o adrese tasinir.
//
// Uc kural:
//   - Tasima yalniz bilinen iki adres arasinda olur; cerezde baska bir sey
//     yazsa da oturum anahtari disari gitmez.
//   - Tasimadan ONCE giris sonucu bu adresin cubugundan silinir. Silinmezse
//     buradaki istemci de ayni oturumu acar; iki adres ayni yenileme
//     anahtarini paylasir ve biri yenileyince oburu oturumdan duser.
//   - Bu dosya main.jsx'in ILK ice aktarimidir: Supabase istemcisi
//     (lib/supabase.js) kurulmadan once calismalidir.
//
// Supabase listesine club eklenirse bu kod zararsiz kalir: donus dogrudan
// club'a gelir, cerez ayni adresi gosterir, tasima olmaz.
import { IKIZ_ADRESLER } from "./appUrl.js";

export const GIRIS_CEREZ = "nip_giris_adres";
const CEREZ_ALANI = "notinparis.me";
// E-postadaki giris baglantisi bir saat gecerlidir; cerez de o kadar yasar.
const CEREZ_OMRU_SN = 3600;

const ikizMi = (host) => IKIZ_ADRESLER.includes(String(host || "").toLowerCase());

// Saf karar (test edilir). hedef: tasinacak adres ya da null.
export function girisDonusKarar({ host, hash, cerez }) {
  const h = String(host || "").toLowerCase();
  const c = String(cerez || "").toLowerCase();
  const girisVar = /(^#|&)(access_token|error)=/.test(String(hash || ""));
  if (!ikizMi(h) || !girisVar) return { hedef: null, cerezSil: false };
  if (!c) return { hedef: null, cerezSil: false };
  if (!ikizMi(c) || c === h) return { hedef: null, cerezSil: true };
  return { hedef: c, cerezSil: true };
}

function cerezOku(doc) {
  try {
    const m = String(doc.cookie || "").match(new RegExp("(?:^|;\\s*)" + GIRIS_CEREZ + "=([^;]*)"));
    return m ? decodeURIComponent(m[1]) : "";
  } catch { return ""; }
}

function cerezYaz(doc, loc, deger, omurSn) {
  try {
    doc.cookie = GIRIS_CEREZ + "=" + encodeURIComponent(deger)
      + "; Domain=" + CEREZ_ALANI + "; Path=/; Max-Age=" + omurSn + "; SameSite=Lax"
      + (loc.protocol === "https:" ? "; Secure" : "");
  } catch { /* cerez kapaliysa giris yine calisir; yalniz tasima olmaz */ }
}

// Giris baslarken cagrilir (Google dugmesi, e-posta kodu isteme).
export function girisAdresiYaz(w = typeof window !== "undefined" ? window : null) {
  if (!w || !ikizMi(w.location.hostname)) return;
  cerezYaz(w.document, w.location, w.location.hostname.toLowerCase(), CEREZ_OMRU_SN);
}

// Acilista bir kez calisir. true: sayfa obur adrese gidiyor (uygulama cizilmez).
export function girisDonusCalistir(w = typeof window !== "undefined" ? window : null) {
  if (!w) return false;
  try {
    const loc = w.location;
    const k = girisDonusKarar({ host: loc.hostname, hash: loc.hash, cerez: cerezOku(w.document) });
    if (k.cerezSil) cerezYaz(w.document, loc, "", 0);
    if (!k.hedef) return false;
    const hash = loc.hash;
    w.history.replaceState(null, "", loc.pathname + loc.search);
    // Ayni sema ve kapi: canlida https ve kapisiz; yerel denemede oldugu gibi.
    loc.replace(loc.protocol + "//" + k.hedef + (loc.port ? ":" + loc.port : "") + "/menu" + hash);
    return true;
  } catch { return false; }
}

export const girisTasiniyor = girisDonusCalistir();
