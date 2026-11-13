// GIRIS DONUSU: club'da baslayan giris club'da bitsin.
//
// Uygulama iki adresten sunulur (lib/appUrl.js: club ve order). Supabase,
// Google ya da e-posta baglantisi ile giristen sonra kullaniciyi yalniz KENDI
// kabul ettigi adrese geri yollar. Olcum (12-13.11, canli):
//   - club.notinparis.me KABUL EDILMIYOR; "Site URL"e (order, kok sayfa) dusuyor.
//   - order.notinparis.me altindaki her yol ve sorgu KABUL EDILIYOR
//     (ornek: /menu?donus=club.notinparis.me aynen geri geldi).
// Kabul listesi yalniz Supabase panelinden degisir; bu kod panel ayari istemez.
//
// Cozum (araci adres):
//   1) Giris club'da baslarsa donus adresi olarak order verilir ve nereye
//      donulecegi ADRESIN ICINE yazilir: https://order…/menu?donus=club….
//   2) order bu isaretle acilirsa sayfayi, giris sonucuyla (# kismi) birlikte
//      club'a tasir.
// Isaret adresin icinde oldugu icin e-postadaki baglanti baska bir tarayicida
// acilsa da calisir (Instagram / WhatsApp ic tarayicisindan baslayan giriste
// baglanti telefonun kendi tarayicisinda acilir). Ilk surum cerez kullaniyordu;
// cerez yalniz ayni tarayicida okunur (inceleme bulgusu, 13.11).
//
// Kurallar:
//   - Tasima yalniz bilinen iki adres arasinda olur; isarette baska bir sey
//     yazsa da oturum anahtari disari gitmez.
//   - Araci adreste oturum ACILMAZ: lib/supabase.js, girisTasiniyor dogruyken
//     adresteki giris sonucunu okumaz. Okusaydi iki adres ayni yenileme
//     anahtarini paylasir, biri yenileyince oburu oturumdan duserdi.
//   - Adres cubugu degistirilmez: sayfa yenilenirse tasima aynen tekrarlanir.
//
// Supabase listesine club eklenirse bu kod zararsiz kalir (bir ek durak).
import { IKIZ_ADRESLER } from "./appUrl.js";

// Supabase'in geri donusu kabul ettigi adres ("Site URL").
export const GIRIS_ARACI = "order.notinparis.me";
const ISARET = "donus";

const ikizMi = (host) => IKIZ_ADRESLER.includes(String(host || "").toLowerCase());
const kapi = (loc) => (loc.port ? ":" + loc.port : "");

// Giris baslarken Supabase'e verilecek donus adresi (Google ve e-posta kodu).
// Ikiz adreslerin disinda (baska isletme, yerel deneme, onizleme) eskisi gibi.
export function girisDonusAdresi(loc = typeof window !== "undefined" ? window.location : null) {
  if (!loc) return "/menu";
  const h = String(loc.hostname || "").toLowerCase();
  if (ikizMi(h) && h !== GIRIS_ARACI) {
    return loc.protocol + "//" + GIRIS_ARACI + kapi(loc) + "/menu?" + ISARET + "=" + encodeURIComponent(h);
  }
  return loc.origin + "/menu";
}

// Saf karar (test edilir): bu adrese "donus" isaretiyle gelindiyse tasinacak
// adres, degilse null.
export function girisDonusKarar({ host, search }) {
  const h = String(host || "").toLowerCase();
  if (!ikizMi(h)) return null;
  let d = "";
  try { d = String(new URLSearchParams(String(search || "")).get(ISARET) || "").toLowerCase(); } catch { d = ""; }
  return ikizMi(d) && d !== h ? d : null;
}

// Acilista bir kez calisir. true: sayfa obur adrese gidiyor (uygulama cizilmez,
// oturum acilmaz).
export function girisDonusCalistir(w = typeof window !== "undefined" ? window : null) {
  if (!w) return false;
  try {
    const loc = w.location;
    const hedef = girisDonusKarar({ host: loc.hostname, search: loc.search });
    if (!hedef) return false;
    // Ayni sema ve kapi: canlida https ve kapisiz; yerel denemede oldugu gibi.
    loc.replace(loc.protocol + "//" + hedef + kapi(loc) + "/menu" + (loc.hash || ""));
    return true;
  } catch { return false; }
}

export const girisTasiniyor = girisDonusCalistir();
