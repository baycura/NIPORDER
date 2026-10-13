import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase.js";
import Ikon from "../../components/Ikon.jsx";

const cv = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";
const C = { card: "#161616", line: "#2A2A2A", ink: "#F0EDE8", muted: "#8A8A86", faint: "#666666", accent: "#FFFFFF", down: "#C87A6A" };
const tl = (n) => "₺" + Math.round(Number(n) || 0).toLocaleString("tr-TR");

const haftaBasi = () => {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
};
const DONEMLER = [
  { key: "hafta", ad: "Bu hafta", from: () => haftaBasi() },
  { key: "ay", ad: "Bu ay", from: () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); } },
  { key: "30", ad: "Son 30 gün", from: () => new Date(Date.now() - 30 * 86400000) },
];
const TURLER = {
  hesap_iptal: { ad: "Hesap iptali", ikon: "cop" },
  kalem_kaldir: { ad: "Kaldırılan ürün", ikon: "kapat" },
  kalem_tasi: { ad: "Taşınan ürün", ikon: "oksag" },
  masa_degistir: { ad: "Masa değişikliği", ikon: "masa" },
};
const zaman = (iso) => new Date(iso).toLocaleString("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

// IPTAL VE DUZELTMELER — yalniz sahip. Kaynak hesap_duzeltmeleri
// (20261013_hesap_duzeltme.sql): personel hesabi neden secmeden iptal edemez,
// mutfaga gitmis urunu neden secerek kaldirir. Tablonun RLS'i is_admin();
// rota da adminOnly.
export default function CorrectionsPage() {
  const [donem, setDonem] = useState("hafta");
  const [kayitlar, setKayitlar] = useState(null);
  const [hata, setHata] = useState(null);
  const [tur, setTur] = useState(null);

  useEffect(() => {
    let iptal = false;
    setKayitlar(null); setHata(null);
    const d = DONEMLER.find(x => x.key === donem) || DONEMLER[0];
    supabase.from("hesap_duzeltmeleri")
      .select("id, created_at, tur, neden, aciklama, tutar, detay, staff:staff_id(name)")
      .gte("created_at", d.from().toISOString())
      .order("created_at", { ascending: false }).limit(500)
      .then(({ data, error }) => {
        if (iptal) return;
        if (error) { setHata(error.message); setKayitlar([]); return; }
        setKayitlar(data || []);
      });
    return () => { iptal = true; };
  }, [donem]);

  const ozet = useMemo(() => {
    const m = {};
    for (const k of kayitlar || []) {
      m[k.tur] = m[k.tur] || { adet: 0, tutar: 0 };
      m[k.tur].adet += 1;
      if (k.tur !== "masa_degistir") m[k.tur].tutar += Number(k.tutar) || 0;
    }
    return m;
  }, [kayitlar]);

  // Neden ve kisi dagilimi: yalniz iptal ve kaldirma (para kaybi olanlar).
  const dagilim = useMemo(() => {
    const neden = {}, kisi = {};
    for (const k of kayitlar || []) {
      if (k.tur !== "hesap_iptal" && k.tur !== "kalem_kaldir") continue;
      if (Number(k.tutar) <= 0) continue;
      const n = k.neden || "—";
      neden[n] = neden[n] || { adet: 0, tutar: 0 };
      neden[n].adet += 1; neden[n].tutar += Number(k.tutar) || 0;
      const p = k.staff?.name || "—";
      kisi[p] = kisi[p] || { adet: 0, tutar: 0 };
      kisi[p].adet += 1; kisi[p].tutar += Number(k.tutar) || 0;
    }
    const sirala = (o) => Object.entries(o).sort((a, b) => b[1].tutar - a[1].tutar);
    return { neden: sirala(neden), kisi: sirala(kisi) };
  }, [kayitlar]);

  const kart = { background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: 14 };
  const etiket = { fontSize: 12, color: C.muted, letterSpacing: "0.2px", fontWeight: 600 };
  const cip = (aktif) => ({
    minHeight: 36, padding: "7px 12px", borderRadius: 9, cursor: "pointer", fontFamily: cv, fontSize: 12, fontWeight: 700,
    background: aktif ? C.accent : "transparent", color: aktif ? "#000" : C.muted, border: `1px solid ${aktif ? C.accent : C.line}`,
  });
  const gosterilen = (kayitlar || []).filter(k => !tur || k.tur === tur);

  const satirAciklama = (k) => {
    const d = k.detay || {};
    if (k.tur === "kalem_kaldir") return `${d.adet || 1} × ${d.ad || "ürün"}${d.durum && d.durum !== "pending" ? " · mutfağa gitmişti" : ""}`;
    if (k.tur === "kalem_tasi") return `${(d.kalemler || []).map(x => `${x.adet} × ${x.ad}`).join(", ")} → ${d.hedef || "hesap"}`;
    if (k.tur === "masa_degistir") return `${d.eski_masa || "masasız"} → ${d.yeni_masa || "masasız"}`;
    const kalem = (d.kalemler || []).map(x => `${x.adet} × ${x.ad}`).join(", ");
    return kalem || "boş hesap";
  };

  return (
    <div style={{ fontFamily: cv, color: C.ink, maxWidth: 760, margin: "0 auto", paddingBottom: 40 }}>
      <div style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }}>İptal ve düzeltmeler</div>
      <div style={{ fontSize: 13, color: C.muted, marginBottom: 14, lineHeight: 1.6, maxWidth: "62ch" }}>
        Hesap iptalleri, kaldırılan ve taşınan ürünler, masa değişiklikleri. Personel hesabı
        neden seçmeden iptal edemez. Bu sayfayı yalnız sen görürsün.
      </div>

      <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 12 }}>
        {DONEMLER.map(d => <button key={d.key} onClick={() => setDonem(d.key)} style={cip(donem === d.key)}>{d.ad}</button>)}
      </div>

      {hata && (
        <div style={{ ...kart, borderColor: C.down, color: C.down, fontSize: 13, marginBottom: 12 }}>
          <Ikon ad="uyari" boy={15} style={{ marginRight: 6 }} />{hata}
        </div>
      )}
      {kayitlar === null && <div style={{ ...kart, color: C.muted, fontSize: 13 }}>Yükleniyor…</div>}

      {kayitlar && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8, marginBottom: 12 }}>
          {Object.entries(TURLER).map(([k, t]) => (
            <button key={k} onClick={() => setTur(tur === k ? null : k)}
              style={{ ...kart, textAlign: "left", cursor: "pointer", fontFamily: cv, color: C.ink,
                       borderColor: tur === k ? C.accent : C.line }}>
              <div style={{ ...etiket, display: "flex", alignItems: "center", gap: 6 }}><Ikon ad={t.ikon} boy={13} />{t.ad}</div>
              <div style={{ fontSize: 22, fontWeight: 800, marginTop: 6 }}>{ozet[k]?.adet || 0}</div>
              {k !== "masa_degistir" && (
                <div style={{ fontSize: 12, color: C.muted, fontVariantNumeric: "tabular-nums" }}>{tl(ozet[k]?.tutar)}</div>
              )}
            </button>
          ))}
        </div>
      )}

      {kayitlar && dagilim.neden.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 8, marginBottom: 12 }}>
          {[["Nedene göre (iptal + kaldırma)", dagilim.neden], ["Kişiye göre", dagilim.kisi]].map(([baslik, liste]) => (
            <div key={baslik} style={kart}>
              <div style={{ ...etiket, marginBottom: 8 }}>{baslik}</div>
              {liste.map(([ad, v]) => (
                <div key={ad} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 13, lineHeight: 1.9 }}>
                  <span>{ad} <span style={{ color: C.faint }}>· {v.adet}</span></span>
                  <span style={{ fontVariantNumeric: "tabular-nums", color: C.muted }}>{tl(v.tutar)}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {kayitlar && kayitlar.length === 0 && !hata && (
        <div style={{ ...kart, color: C.muted, fontSize: 13, lineHeight: 1.6 }}>
          Bu dönemde iptal ya da düzeltme yok.
        </div>
      )}

      {gosterilen.map(k => (
        <div key={k.id} style={{ ...kart, marginBottom: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
            <div style={{ fontSize: 14, fontWeight: 700, minWidth: 0 }}>
              {TURLER[k.tur]?.ad || k.tur} · {k.detay?.hesap || "Hesap"}
            </div>
            {k.tur !== "masa_degistir" && (
              <div style={{ fontSize: 14, fontWeight: 800, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{tl(k.tutar)}</div>
            )}
          </div>
          <div style={{ fontSize: 13, color: C.muted, marginTop: 4, lineHeight: 1.5 }}>{satirAciklama(k)}</div>
          <div style={{ fontSize: 12, color: C.faint, marginTop: 4 }}>
            {zaman(k.created_at)} · {k.staff?.name || "—"}
            {k.neden && <> · <span style={{ color: C.ink }}>{k.neden}</span></>}
            {k.aciklama && <> — {k.aciklama}</>}
          </div>
        </div>
      ))}
    </div>
  );
}
