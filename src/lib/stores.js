// Merkezi magaza (store) kimlikleri ve etiketleri.
//
// NIP'te tek DB uzerinde iki store var: Not In Paris (ana isletme) ve Doner
// mutfagi. Doner ayri bir isletme/mutfak; NIP kendi menusunden doner (mutfak)
// urunlerini de satar. Bir urunun "mutfak hedefi" Doner ise, o urunun NIP'te
// satilan cirosu ay sonu mutfaga odenir (bkz. SettlementPage).
//
// Baska bir isletmeye kurulumda kimlikler build aninda verilir
// (isletme/<slug>/vite.config.js): VITE_STORE_ID o isletmenin tek magazasi,
// VITE_STORE_SLUG musteri menusunun varsayilan magazasi. Mutfak magazasi yoksa
// DONER_STORE_ID null olur ve "mutfak hedefi" secenekleri hic gorunmez.
import { MARKA, PROFIL } from "./profil.js";

const env = (typeof import.meta !== "undefined" && import.meta.env) || {};

export const PARIS_STORE_ID = env.VITE_STORE_ID || "c3c6e0c7-1821-4edd-993d-ad960cfbc452";
export const STORE_SLUG = env.VITE_STORE_SLUG || "paris";
export const DONER_STORE_ID = env.VITE_MUTFAK_STORE_ID || (PROFIL === "nip" ? "c39da530-7f73-4f69-a752-029bf03790b1" : null);

export const STORES = {
  [PARIS_STORE_ID]: { id: PARIS_STORE_ID, label: MARKA.ad, short: MARKA.kisa },
  ...(DONER_STORE_ID ? { [DONER_STORE_ID]: { id: DONER_STORE_ID, label: "Döner Mutfağı", short: "Döner" } } : {}),
};

export const storeLabel = (id) => STORES[id]?.label || "—";
export const storeShort = (id) => STORES[id]?.short || "—";

// Bir urun/siparis kalemi mutfaga (Doner) mi gidiyor?
export const isKitchenDestination = (id) => !!DONER_STORE_ID && id === DONER_STORE_ID;
