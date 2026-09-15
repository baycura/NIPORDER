// PANEL KULLANIMI — hangi sayfaya kac kez girildi (yalniz bu cihazda).
//
// SAHIP: "Admin panelindeki alt menuler cok komplike, kafa karistirici."
// Menude 38 karo var; herkesin gunluk kullandigi 5-6 tanesi. Hangileri
// oldugunu sormak yerine sayiyoruz: her dokunus bir puan, en ustte "Sik
// kullandiklarin" cikiyor. Ayar yok, liste kendi kendine oturuyor.
//
// localStorage: cihaz basina, sunucuya gitmez, kaybolursa yalniz siralama
// sifirlanir. Her okuma/yazma try/catch: gizli sekmede localStorage erisimi
// hata firlatabiliyor, menu bu yuzden acilmazlik etmesin.

const ANAHTAR = "nip_panel_kullanim";
const ACIK_ANAHTAR = "nip_panel_acik_gruplar";

export function kullanimOku() {
  try { return JSON.parse(localStorage.getItem(ANAHTAR) || "{}") || {}; }
  catch (e) { return {}; }
}

export function kullanimYaz(to) {
  if (!to) return;
  try {
    const v = kullanimOku();
    v[to] = (Number(v[to]) || 0) + 1;
    localStorage.setItem(ANAHTAR, JSON.stringify(v));
  } catch (e) { /* onemsiz: sayac tutulamadi */ }
}

// En cok kullanilan n sayfa. Bir kez bile girilmemis sayfa listeye girmez;
// esitlikte menudeki sira korunur (Array.sort kararli).
export function sikKullanilanlar(gruplar, n = 6) {
  const v = kullanimOku();
  const hepsi = gruplar.flatMap(g => g.items);
  return hepsi
    .map(i => ({ i, p: Number(v[i.to]) || 0 }))
    .filter(x => x.p > 0)
    .sort((a, b) => b.p - a.p)
    .slice(0, n)
    .map(x => x.i);
}

export function acikGruplarOku(varsayilan) {
  try {
    const ham = localStorage.getItem(ACIK_ANAHTAR);
    if (!ham) return varsayilan;
    const v = JSON.parse(ham);
    return v && typeof v === "object" ? v : varsayilan;
  } catch (e) { return varsayilan; }
}

export function acikGruplarYaz(v) {
  try { localStorage.setItem(ACIK_ANAHTAR, JSON.stringify(v)); }
  catch (e) { /* onemsiz */ }
}
