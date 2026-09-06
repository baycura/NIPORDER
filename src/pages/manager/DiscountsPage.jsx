import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase.js";
import Ikon from "../../components/Ikon.jsx";

const cv = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";
const hv = "'Bebas Neue','Barlow Condensed','Coolvetica Condensed',sans-serif";
const C = { bg: "#0C0C0C", card: "#161616", line: "#2A2A2A", ink: "#F0EDE8", muted: "#8A8A86", faint: "#666666", accent: "#FFFFFF", down: "#C87A6A" };
const tl = (n) => "₺" + Math.round(Number(n) || 0).toLocaleString("tr-TR");

// Pazartesi 00:00 (yerel). Kasa ve lig ile ayni hafta tanimi.
const haftaBasi = () => {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  const gun = (d.getDay() + 6) % 7; // Pzt=0
  d.setDate(d.getDate() - gun);
  return d;
};
const DONEMLER = [
  { key: "hafta", ad: "Bu hafta", from: () => haftaBasi() },
  { key: "ay",    ad: "Bu ay",    from: () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); } },
  { key: "30",    ad: "Son 30 gün", from: () => new Date(Date.now() - 30 * 86400000) },
  { key: "hepsi", ad: "Tümü",     from: () => new Date(2020, 0, 1) },
];

// Kim ne kadar indirim yapti — YALNIZ SAHIP. Kaynak nip_indirim_raporu:
// guncel kalemlerden hesaplanir (indirim x adet), her kalem son indirimi
// veren personele yazilir (discount_audit). Rota adminOnly; RPC de icinde
// is_admin() kosar, yani menuden bulan yonetici bile veriyi alamaz.
export default function DiscountsPage() {
  const [donem, setDonem] = useState("hafta");
  const [satirlar, setSatirlar] = useState(null);
  const [hata, setHata] = useState(null);
  const [acikPersonel, setAcikPersonel] = useState(null);

  useEffect(() => {
    let iptal = false;
    setSatirlar(null); setHata(null);
    const d = DONEMLER.find(x => x.key === donem) || DONEMLER[0];
    supabase.rpc("nip_indirim_raporu", { p_from: d.from().toISOString(), p_to: new Date(Date.now() + 86400000).toISOString() })
      .then(({ data, error }) => {
        if (iptal) return;
        if (error) { setHata(error.message); setSatirlar([]); return; }
        setSatirlar(data || []);
      });
    return () => { iptal = true; };
  }, [donem]);

  const ozet = useMemo(() => {
    const m = {};
    for (const r of satirlar || []) {
      const k = r.personel_id || "yok";
      if (!m[k]) m[k] = { id: k, ad: r.personel || "—", adet: 0, tutar: 0, kalem: 0 };
      m[k].kalem += 1; m[k].adet += Number(r.adet) || 0; m[k].tutar += Number(r.tutar) || 0;
    }
    return Object.values(m).sort((a, b) => b.tutar - a.tutar);
  }, [satirlar]);
  const toplam = ozet.reduce((s, p) => s + p.tutar, 0);

  const kart = { background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: 14 };
  const etiket = { fontSize: 12, color: C.muted, letterSpacing: "0.2px", fontWeight: 600 };
  const cip = (aktif) => ({
    minHeight: 36, padding: "7px 12px", borderRadius: 9, cursor: "pointer", fontFamily: cv, fontSize: 12, fontWeight: 700,
    background: aktif ? C.accent : "transparent", color: aktif ? "#000" : C.muted, border: `1px solid ${aktif ? C.accent : C.line}`,
  });
  const gosterilen = (satirlar || []).filter(r => !acikPersonel || (r.personel_id || "yok") === acikPersonel);

  return (
    <div style={{ fontFamily: cv, color: C.ink, maxWidth: 760, margin: "0 auto", paddingBottom: 40 }}>
      <div style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }}>İndirimler</div>
      <div style={{ fontSize: 13, color: C.muted, marginBottom: 14, lineHeight: 1.6, maxWidth: "60ch" }}>
        Kasada kalem başına verilen indirimler, veren personele göre. Yalnız sahip görür;
        personel kendi verdiği indirimi kalemde görür ama kimin ne kadar verdiğini göremez.
      </div>

      <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 12 }}>
        {DONEMLER.map(d => <button key={d.key} onClick={() => { setDonem(d.key); setAcikPersonel(null); }} style={cip(donem === d.key)}>{d.ad}</button>)}
      </div>

      {hata && (
        <div style={{ ...kart, borderColor: C.down, color: C.down, fontSize: 13, marginBottom: 12 }}>
          <Ikon ad="uyari" boy={15} style={{ marginRight: 6 }} />{hata}
        </div>
      )}
      {satirlar === null && <div style={{ ...kart, color: C.muted, fontSize: 13 }}>Yükleniyor…</div>}

      {satirlar && (
        <>
          <div style={{ ...kart, marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
              <div style={etiket}>Personele göre</div>
              <div style={{ fontFamily: hv, fontSize: 22, color: toplam > 0 ? C.down : C.muted, fontVariantNumeric: "tabular-nums" }}>−{tl(toplam)}</div>
            </div>
            {ozet.length === 0 && <div style={{ color: C.muted, fontSize: 13 }}>Bu dönemde indirim yok.</div>}
            {ozet.map((p, i) => (
              <div key={p.id} onClick={() => setAcikPersonel(acikPersonel === p.id ? null : p.id)} style={{
                display: "flex", alignItems: "center", gap: 10, padding: "9px 0", cursor: "pointer",
                borderTop: i === 0 ? "none" : `1px solid ${C.line}`,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: acikPersonel === p.id ? C.ink : "#ddd" }}>{p.ad}</div>
                  <div style={{ fontSize: 12, color: C.faint, marginTop: 2 }}>{p.kalem} kalem · {p.adet} ürün</div>
                </div>
                <div style={{ fontFamily: hv, fontSize: 20, color: C.down, fontVariantNumeric: "tabular-nums" }}>−{tl(p.tutar)}</div>
                <Ikon ad={acikPersonel === p.id ? "yukari" : "asagi"} boy={14} style={{ color: C.faint }} />
              </div>
            ))}
          </div>

          <div style={{ ...etiket, marginBottom: 8 }}>
            {acikPersonel ? "Seçili personelin indirimleri" : "Tüm indirimler"} · {gosterilen.length}
          </div>
          <div style={{ ...kart, padding: 0, overflow: "hidden" }}>
            {gosterilen.length === 0 && <div style={{ padding: 22, textAlign: "center", color: C.muted, fontSize: 13 }}>Kayıt yok.</div>}
            {gosterilen.map((r, i) => (
              <div key={r.kalem_id} style={{ padding: "10px 14px", borderTop: i === 0 ? "none" : `1px solid ${C.line}` }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.urun}{Number(r.adet) > 1 ? ` ×${r.adet}` : ""}
                  </div>
                  <div style={{ color: C.down, fontWeight: 800, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>−{tl(r.tutar)}</div>
                </div>
                <div style={{ fontSize: 12, color: C.faint, marginTop: 3, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ color: C.muted, fontWeight: 600 }}>{r.personel}</span>
                  <span>{new Date(r.tarih).toLocaleString("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                  <span>{tl(r.indirim)}/adet</span>
                  <span>{r.durum === "paid" ? "ödendi" : r.durum === "open" ? "açık hesap" : r.durum}</span>
                  {r.neden && <span style={{ color: C.ink }}>“{r.neden}”</span>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
