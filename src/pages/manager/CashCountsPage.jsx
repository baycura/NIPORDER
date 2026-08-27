import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase.js";
import { useAuth } from "../../contexts/AuthContext.jsx";
import Ikon from "../../components/Ikon.jsx";
import { fmtTL, farkRengi } from "../../lib/cashCount.js";

const cv = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";

const C = {
  card: "#161616", line: "#2A2A2A", ink: "#F0EDE8", muted: "#8A8A86",
  faint: "#666666", accent: "#FFFFFF", down: "#C87A6A",
};

const gunAd = (g) =>
  new Date(g + "T12:00").toLocaleDateString("tr-TR", { day: "numeric", month: "short", weekday: "short" });

// Kasa Gecmisi — gun gun fark, duzeltme zincirleri ve HIC SAYILMAMIS geceler.
// Sayilmamis gece, farki buyuk olan geceden daha onemli bir sinyaldir:
// sayilmayan kasa denetlenmemis kasadir.
export default function CashCountsPage() {
  const { staffUser } = useAuth();
  const storeIds = staffUser?.store_ids || [];
  const [stores, setStores] = useState([]);
  const [storeId, setStoreId] = useState(null);
  const [kayitlar, setKayitlar] = useState(null);
  const [acik, setAcik] = useState(null);

  useEffect(() => {
    if (!storeIds.length) return;
    supabase.from("stores").select("id,name,slug").in("id", storeIds).order("slug").then(r => {
      const list = r.data || [];
      setStores(list);
      setStoreId(prev => prev || list[0]?.id || null);
    });
  }, [staffUser?.id]);

  useEffect(() => {
    if (!storeId) return;
    let iptal = false;
    setKayitlar(null);
    supabase.from("cash_counts")
      .select("*")
      .eq("store_id", storeId)
      .order("business_day", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(200)
      .then(({ data }) => { if (!iptal) setKayitlar(data || []); });
    return () => { iptal = true; };
  }, [storeId]);

  // Gune gore grupla: her gun bir zincir (devir sayimlari + kapanis + duzeltmeler).
  const gunler = useMemo(() => {
    const m = new Map();
    for (const k of kayitlar || []) {
      if (!m.has(k.business_day)) m.set(k.business_day, []);
      m.get(k.business_day).push(k);
    }
    return [...m.entries()].map(([gun, zincir]) => {
      const duzeltilenler = new Set(zincir.map(z => z.supersedes).filter(Boolean));
      const gecerliler = zincir.filter(z => !duzeltilenler.has(z.id));
      // Gunun basligi KAPANIS sayimidir; devir varsa zincirde gorunur.
      // Kapanis yoksa (yalniz devir yapilmis gece) son devir gosterilir.
      const gecerli = gecerliler.find(z => z.tur !== "devir")
                   || gecerliler[gecerliler.length - 1] || zincir[zincir.length - 1];
      const kapanisVar = gecerliler.some(z => z.tur !== "devir");
      return { gun, zincir, gecerli, kapanisVar };
    });
  }, [kayitlar]);

  // Sayilmamis geceler: ilk sayimdan bugune kadar bosluklar. Yalniz devir
  // yapilmis bir gece "sayilmis" sayilmaz — kapanis sayimi sart.
  const eksikGunler = useMemo(() => {
    if (!gunler.length) return [];
    const var_ = new Set(gunler.filter(g => g.kapanisVar).map(g => g.gun));
    const enEski = gunler[gunler.length - 1].gun;
    const out = [];
    const d = new Date(enEski + "T12:00");
    const bugun = new Date();
    while (d <= bugun) {
      const s = d.toISOString().slice(0, 10);
      if (!var_.has(s)) out.push(s);
      d.setDate(d.getDate() + 1);
    }
    return out.slice(-30);
  }, [gunler]);

  const kart = { background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: 14 };
  const etiket = { fontSize: 12, color: C.muted, letterSpacing: "0.2px", fontWeight: 600 };

  return (
    <div style={{ fontFamily: cv, color: C.ink, maxWidth: 640, margin: "0 auto", paddingBottom: 60 }}>
      <div style={{ fontSize: 24, fontWeight: 800, marginBottom: 12 }}>Kasa Geçmişi</div>

      {stores.length > 1 && (
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          {stores.map(s => (
            <button key={s.id} onClick={() => setStoreId(s.id)} style={{
              minHeight: 40, padding: "9px 14px", borderRadius: 9, cursor: "pointer", fontFamily: cv,
              fontSize: 12, fontWeight: 700,
              background: storeId === s.id ? C.accent : "transparent",
              color: storeId === s.id ? "#000" : C.muted,
              border: `1px solid ${storeId === s.id ? C.accent : C.line}`,
            }}>{s.name}</button>
          ))}
        </div>
      )}

      {kayitlar === null && <div style={{ ...kart, color: C.muted, fontSize: 13 }}>Yükleniyor…</div>}

      {kayitlar && kayitlar.length === 0 && (
        <div style={{ ...kart, color: C.muted, fontSize: 13, lineHeight: 1.7 }}>
          Henüz kasa sayımı yapılmamış. Kapanışta personel "Kasa Sayımı"ndan girer;
          buraya gün gün fark, düzeltme zinciri ve atlanmış geceler düşer.
        </div>
      )}

      {eksikGunler.length > 0 && (
        <div style={{ ...kart, marginBottom: 10, borderColor: "#3A2E2A" }}>
          <div style={{ ...etiket, color: C.down, display: "flex", alignItems: "center", gap: 6 }}>
            <Ikon ad="uyari" boy={13} />Sayılmamış {eksikGunler.length} gece
          </div>
          <div style={{ fontSize: 13, color: C.muted, marginTop: 6, lineHeight: 1.6 }}>
            {eksikGunler.slice(-10).map(gunAd).join(" · ")}
          </div>
        </div>
      )}

      {gunler.map(({ gun, zincir, gecerli, kapanisVar }) => {
        const acikBu = acik === gun;
        const duzeltmeAdet = zincir.filter(z => z.supersedes).length;
        const devirAdet = zincir.filter(z => z.tur === "devir" && !z.supersedes).length;
        const duzeltmeVar = duzeltmeAdet > 0;
        return (
          <div key={gun} onClick={() => setAcik(acikBu ? null : gun)}
               style={{ ...kart, marginBottom: 8, cursor: "pointer" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700 }}>
                  {gunAd(gun)}
                  {!kapanisVar && <span style={{ fontSize: 11, fontWeight: 700, color: C.down,
                    marginLeft: 8, letterSpacing: "0.3px" }}>KAPANIŞ YOK — sadece devir</span>}
                </div>
                <div style={{ fontSize: 12, color: C.faint, marginTop: 2 }}>
                  {gecerli.counted_by_person}
                  {gecerli.counted_by_name && gecerli.counted_by_name !== gecerli.counted_by_person
                    && ` · ${gecerli.counted_by_name} hesabından`}
                  {devirAdet > 0 && ` · ${devirAdet} devir sayımı`}
                  {duzeltmeVar && ` · ${duzeltmeAdet} düzeltme`}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 17, fontWeight: 800, fontVariantNumeric: "tabular-nums",
                              color: farkRengi(gecerli.difference) }}>
                  {Number(gecerli.difference) > 0 ? "+" : ""}{fmtTL(gecerli.difference)}
                </div>
                <div style={{ fontSize: 12, color: C.faint, fontVariantNumeric: "tabular-nums" }}>
                  {fmtTL(gecerli.counted_total)} sayıldı
                </div>
              </div>
            </div>

            {acikBu && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.line}`,
                            fontSize: 13, color: C.muted, lineHeight: 1.9 }}>
                {[["Dünden devreden", gecerli.opening_float],
                  ["Nakit tahsilat", gecerli.cash_sales],
                  ["Kasadan gider", -Number(gecerli.cash_expenses || 0)],
                  ["Beklenen", gecerli.expected_cash],
                  ["Sayılan", gecerli.counted_total],
                  ["Çekmeceden alınan", gecerli.withdrawn]].map(([l, v]) => (
                  <div key={l} style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>{l}</span>
                    <span style={{ color: C.ink, fontVariantNumeric: "tabular-nums" }}>{fmtTL(v)}</span>
                  </div>
                ))}
                {gecerli.note && (
                  <div style={{ marginTop: 8, color: C.ink }}>
                    <Ikon ad="not" boy={13} style={{ marginRight: 6 }} />{gecerli.note}
                  </div>
                )}

                {/* Gunun tum kayitlari: devir sayimlari + duzeltme zinciri.
                    Silinen yok, ustune yazilan var. */}
                {(duzeltmeVar || devirAdet > 0) && (
                  <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.line}` }}>
                    <div style={{ ...etiket, marginBottom: 6 }}>Günün sayımları</div>
                    {zincir.map((z, i) => (
                      <div key={z.id} style={{ fontSize: 12, color: z.id === gecerli.id ? C.ink : C.faint,
                                               marginBottom: 4, lineHeight: 1.5 }}>
                        {i + 1}. {z.tur === "devir" ? "DEVİR · " : ""}
                        {new Date(z.created_at).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}
                        {" · "}{fmtTL(z.counted_total)} · fark {Number(z.difference) > 0 ? "+" : ""}{fmtTL(z.difference)}
                        {" · "}{z.counted_by_person}
                        {z.reason && <> — {z.reason}</>}
                        {z.id === gecerli.id && <span style={{ fontWeight: 700 }}> · geçerli</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
