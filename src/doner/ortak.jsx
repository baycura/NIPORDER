// DONER DEFTERI — ortak stil, tarih ve para yardimcilari.
export const cv = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";
export const hv = "'Bebas Neue','Barlow Condensed','Coolvetica Condensed',sans-serif";
export const C = { bg: "#0C0C0C", card: "#161616", line: "#2A2A2A", ink: "#F0EDE8", muted: "#8A8A86", faint: "#666666", accent: "#FFFFFF", down: "#C87A6A" };

export const fmtTL = (n) => "₺" + Math.round(Number(n) || 0).toLocaleString("tr-TR");
export const fmtN = (n) => Number(n || 0).toLocaleString("tr-TR", { maximumFractionDigits: 0 });
export const hataMetni = (e) => String(e?.message || e || "hata");

// Tarihler Istanbul takvim gunu. Doner gunu gece yarisinda biter (kafedeki
// 03:00 kurali burada yok: tezgah kapanisi gece 01'i gecmez).
const AY = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
export const GUN = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];
export const bugunIso = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" });
export const tarihObj = (iso) => { const [y, m, d] = iso.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
export const isoYaz = (d) => d.toISOString().slice(0, 10);
export const gunEkle = (iso, n) => { const d = tarihObj(iso); d.setUTCDate(d.getUTCDate() + n); return isoYaz(d); };
export const haftaBasi = (iso) => { const d = tarihObj(iso); const g = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - g); return isoYaz(d); };
export const ayBasi = (iso) => iso.slice(0, 7) + "-01";
export const kisaTarih = (iso) => `${Number(iso.slice(8, 10))} ${AY[Number(iso.slice(5, 7)) - 1]}`;
export const uzunTarih = (iso) => `${Number(iso.slice(8, 10))} ${AY[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
export const gunAdi = (iso) => GUN[tarihObj(iso).getUTCDay()];

export const DONEMLER = [
  { key: "bugun",      label: "Bugün",        aralik: (b) => [b, b] },
  { key: "dun",        label: "Dün",          aralik: (b) => [gunEkle(b, -1), gunEkle(b, -1)] },
  { key: "hafta",      label: "Bu hafta",     aralik: (b) => [haftaBasi(b), b] },
  { key: "gecenhafta", label: "Geçen hafta",  aralik: (b) => { const p = gunEkle(haftaBasi(b), -7); return [p, gunEkle(p, 6)]; } },
  { key: "ay",         label: "Bu ay",        aralik: (b) => [ayBasi(b), b] },
  { key: "gecenay",    label: "Geçen ay",     aralik: (b) => { const p = gunEkle(ayBasi(b), -1); return [ayBasi(p), p]; } },
  { key: "tarih",      label: "Tarih aralığı", aralik: null },
];

export const KATEGORILER = ["Malzeme", "Ambalaj", "Kira", "Elektrik / su / gaz", "Personel", "Vergi & muhasebe", "Ekipman & tamir", "Temizlik", "Diğer"];
export const YONTEMLER = [["nakit", "Nakit"], ["kart", "Kart"], ["havale", "Havale"]];

export const S = {
  kart: { background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: 14 },
  etiket: { fontSize: 12, color: C.muted, letterSpacing: "0.2px", fontWeight: 600 },
  alan: { width: "100%", boxSizing: "border-box", minHeight: 44, padding: "10px 12px", background: "#0C0C0C", border: `1px solid ${C.line}`,
          borderRadius: 9, color: C.ink, fontFamily: cv, fontSize: 15, outline: "none", colorScheme: "dark" },
  cip: (aktif) => ({ minHeight: 40, padding: "8px 13px", borderRadius: 9, cursor: "pointer", fontFamily: cv, fontSize: 12.5, fontWeight: 700, whiteSpace: "nowrap",
                     background: aktif ? C.accent : "transparent", color: aktif ? "#000" : C.muted, border: `1px solid ${aktif ? C.accent : C.line}` }),
  dugme: (birincil = true) => ({ minHeight: 46, padding: "0 18px", borderRadius: 10, cursor: "pointer", fontFamily: cv, fontSize: 14, fontWeight: 800,
                                 background: birincil ? C.accent : "transparent", color: birincil ? "#000" : C.ink, border: `1px solid ${birincil ? C.accent : C.line}` }),
};

export function Yukleniyor({ metin = "Yükleniyor…" }) {
  return <div style={{ padding: 40, textAlign: "center", color: C.muted, fontFamily: cv, fontSize: 13 }}>{metin}</div>;
}

export function Hata({ metin }) {
  if (!metin) return null;
  return <div style={{ ...S.kart, borderColor: C.down, color: C.down, fontSize: 13, marginBottom: 12 }}>{metin}</div>;
}

export function Baslik({ baslik, alt, sag }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 14 }}>
      <div>
        <div style={{ fontSize: 24, fontWeight: 800, color: C.ink }}>{baslik}</div>
        {alt && <div style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>{alt}</div>}
      </div>
      {sag}
    </div>
  );
}

export function Alan({ etiket, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ ...S.etiket, marginBottom: 6 }}>{etiket}</div>
      {children}
    </div>
  );
}

// Alt sayfa: form ve duzenleme pencereleri. Tam ekran, ust bar, kapat.
export function Pencere({ baslik, onKapat, children }) {
  return (
    <div role="dialog" aria-label={baslik}
         style={{ position: "fixed", inset: 0, zIndex: 100, background: C.bg, color: C.ink, fontFamily: cv, overflowY: "auto" }}>
      <div style={{ position: "sticky", top: 0, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "12px 16px",
                    background: C.card, borderBottom: `1px solid ${C.line}`, zIndex: 1 }}>
        <div style={{ fontSize: 16, fontWeight: 800 }}>{baslik}</div>
        <button onClick={onKapat} aria-label="Kapat" style={{ ...S.dugme(false), minHeight: 40, padding: "0 12px" }}>Kapat</button>
      </div>
      <div style={{ padding: 16, maxWidth: 560, margin: "0 auto", paddingBottom: 40 }}>{children}</div>
    </div>
  );
}
