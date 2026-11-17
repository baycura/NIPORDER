// ============================================================================
// REZERVASYON KAYNAGI — calisma aninda okunur.
//
// Rezervasyon iki yerden sunulabilir:
//   kopru : ayri rezervasyon projesi (RESERVE), lib/reserve.js koprusuyle
//   yerel : bu veritabanindaki events / reservations tablolari
//
// Hangisi oldugunu SUNUCU soyler: nip_rez_yerel_mi() (nip_rez_ayar.yerel;
// migration 20261113_rezervasyon_order_icinde). Anahtar bir SQL oturumundan
// cevrilir; telefonlarda acik duran eski sayfa yeniden yuklenmeden yeni
// kaynaga gecmelidir. Bu yuzden deger BUILD sabiti degildir.
//
// Profil "temel" (lib/profil.js rezervasyonYerel = true): ayri proje hic yok;
// soru sorulmaz, cevap hep "yerel".
//
// Talep (nip_rezervasyon_iste) ve "Rezervasyonlarim" (nip_rezervasyonlarim)
// zaten sunucuda dallanir. Burasi yalniz DOGRUDAN tablo okuyan yerler icindir:
// menude etkinlik listesi, panelde her sey.
// ============================================================================
import { supabase } from "./supabase.js";
import { rezervasyonYerel } from "./profil.js";

const ANAHTAR = "nip_rez_yerel";

let bilinen = rezervasyonYerel ? true : null;   // null: bu oturumda okunmadi
let okundu = 0;
let bekleyen = null;

const saklanan = () => {
  try {
    const v = localStorage.getItem(ANAHTAR);
    return v === "1" ? true : v === "0" ? false : null;
  } catch (_) { return null; }
};
const sakla = (v) => { try { localStorage.setItem(ANAHTAR, v ? "1" : "0"); } catch (_) { /* gizli sekme */ } };

// Son bilinen deger: bu oturumda okunan, yoksa bu cihazda en son okunan.
export const rezYerelSonBilinen = () => (bilinen !== null ? bilinen : saklanan());

// Donus: true (yerel) | false (kopru) | null (bilinmiyor).
//   tazeMs : bu kadar yeni bir okuma varsa sunucuya gidilmez.
//   kesin  : true ise yalniz SIMDI okunan deger gecerlidir; okunamazsa null.
//            Panel bunu kullanir: eski degerle yanlis veritabanina yazmasin.
//            kesin degilken okunamazsa son bilinen deger doner (menu).
export function rezYerelOku({ tazeMs = 30000, kesin = false } = {}) {
  if (rezervasyonYerel) return Promise.resolve(true);
  if (bilinen !== null && Date.now() - okundu < tazeMs) return Promise.resolve(bilinen);
  if (!bekleyen) {
    bekleyen = (async () => {
      let taze = null;
      try {
        const { data, error } = await supabase.rpc("nip_rez_yerel_mi");
        if (!error && typeof data === "boolean") {
          taze = data; bilinen = data; okundu = Date.now(); sakla(data);
        }
      } catch (_) { /* ag hatasi: taze = null */ }
      bekleyen = null;
      return taze;
    })();
  }
  return bekleyen.then(taze => (taze !== null ? taze : kesin ? null : rezYerelSonBilinen()));
}
