// Merkezi magaza (store) kimlikleri ve etiketleri.
// Tek DB uzerinde iki store var: Not In Paris (ana isletme) ve Doner mutfagi.
// Doner ayri bir isletme/mutfak; NIP kendi menusunden doner (mutfak) urunlerini
// de satar. Bir urunun "mutfak hedefi" Doner ise, o urunun NIP'te satilan cirosu
// ay sonu mutfaga odenir (bkz. SettlementPage - "Ay Sonu Mutfaga Odenecek").

export const PARIS_STORE_ID = "c3c6e0c7-1821-4edd-993d-ad960cfbc452";
export const DONER_STORE_ID = "c39da530-7f73-4f69-a752-029bf03790b1";

export const STORES = {
  [PARIS_STORE_ID]: { id: PARIS_STORE_ID, label: "Not In Paris", short: "NIP" },
  [DONER_STORE_ID]: { id: DONER_STORE_ID, label: "Döner Mutfağı", short: "Döner" },
};

export const storeLabel = (id) => STORES[id]?.label || "—";
export const storeShort = (id) => STORES[id]?.short || "—";

// Bir urun/siparis kalemi mutfaga (Doner) mi gidiyor?
export const isKitchenDestination = (id) => id === DONER_STORE_ID;
