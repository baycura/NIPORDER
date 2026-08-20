import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase.js";
import { useAuth } from "../../contexts/AuthContext.jsx";

const cv = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";
const hv = "'Bebas Neue','Barlow Condensed','Coolvetica Condensed',sans-serif";

/* Dark palette — matches the staff app shell (#0C0C0C body) */
const C = {
  card: "#161616", cardLine: "#262626", ink: "#F0EDE8", muted: "#8A8A86",
  faint: "#5A5A56", accent: "#C8973E", up: "#7BC47F", down: "#E06666",
};

const fmtTL = (n) => "₺" + Number(n || 0).toLocaleString("tr-TR", { maximumFractionDigits: 0 });
const DAY_TR = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];

const DEMO = typeof window !== "undefined" && window.location.search.includes("demo=1");
const demoData = () => ({
  today: 18450, yesterday: 14200, activeOrders: 4, completed: 47, avgTicket: 392,
  topProducts: [
    { name: "Flat White", qty: 21, rev: 3150 }, { name: "Croissant", qty: 17, rev: 2380 },
    { name: "Cold Brew", qty: 12, rev: 2160 }, { name: "NIP Tost", qty: 9, rev: 2025 },
    { name: "San Sebastian", qty: 7, rev: 1890 },
  ],
  hourly: Array.from({ length: 16 }, (_, i) => ({ hour: 8 + i, total: [0,320,780,1450,2100,1800,2450,1200,900,1500,1950,1400,880,640,1080,0][i] })),
  weekTotal: 96400,
  weekDays: Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - 6 + i); return { date: d, total: [11200,9800,14500,12100,16400,13950,18450][i] }; }),
});

export default function ReportsPage() {
  const { staffUser } = useAuth();
  const storeIds = staffUser?.store_ids || [];
  const [stores, setStores] = useState([]);
  const [selectedStore, setSelectedStore] = useState(null);
  const [data, setData] = useState({ today: 0, yesterday: 0, activeOrders: 0, completed: 0, avgTicket: 0, topProducts: [], hourly: [], weekTotal: 0, weekDays: [] });
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState(null);
  const timer = useRef(null);

  useEffect(() => {
    if (DEMO) { setData(demoData()); setLoading(false); setUpdatedAt(new Date()); return; }
    if (storeIds.length === 0) return;
    supabase.from("stores").select("id,name,slug").in("id", storeIds).then(r => {
      const list = r.data || [];
      setStores(list);
      if (list.length > 0 && !selectedStore) setSelectedStore(list[0].id);
    });
  }, [staffUser?.id]);

  // Load on store change + quiet auto-refresh every 60s so the number is always live.
  useEffect(() => {
    if (DEMO || !selectedStore) return;
    loadData();
    timer.current = setInterval(() => loadData(true), 60_000);
    return () => clearInterval(timer.current);
  }, [selectedStore]);

  async function loadData(silent) {
    if (!silent) setLoading(true);
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const yesterdayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).toISOString();
    const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6).toISOString();

    const [todayRes, yesterdayRes, weekRes] = await Promise.all([
      supabase.from("orders").select("id,total,status,created_at,order_items(quantity,unit_price,product_id,products(name))").eq("origin_store_id", selectedStore).gte("created_at", todayStart),
      supabase.from("orders").select("total,status").eq("origin_store_id", selectedStore).gte("created_at", yesterdayStart).lt("created_at", todayStart),
      supabase.from("orders").select("total,status,created_at").eq("origin_store_id", selectedStore).gte("created_at", weekStart),
    ]);

    const paid = ["paid", "completed", "served", "closed"];
    const todayOrders = todayRes.data || [];
    const todayPaid = todayOrders.filter(o => paid.includes(o.status));
    const yesterdayPaid = (yesterdayRes.data || []).filter(o => paid.includes(o.status));
    const weekPaid = (weekRes.data || []).filter(o => paid.includes(o.status));

    const todayTotal = todayPaid.reduce((s, o) => s + Number(o.total || 0), 0);
    const yesterdayTotal = yesterdayPaid.reduce((s, o) => s + Number(o.total || 0), 0);
    const weekTotal = weekPaid.reduce((s, o) => s + Number(o.total || 0), 0);
    const active = todayOrders.filter(o => !paid.includes(o.status)).length;

    // Top products: quantity AND revenue, so the list reads as money not just count.
    const pAgg = {};
    todayPaid.forEach(o => (o.order_items || []).forEach(oi => {
      const n = oi.products?.name || "Bilinmeyen";
      if (!pAgg[n]) pAgg[n] = { name: n, qty: 0, rev: 0 };
      pAgg[n].qty += oi.quantity || 0;
      pAgg[n].rev += (oi.quantity || 0) * Number(oi.unit_price || 0);
    }));
    const topProducts = Object.values(pAgg).sort((a, b) => b.rev - a.rev).slice(0, 5);

    const hourly = Array.from({ length: 16 }, (_, i) => ({ hour: 8 + i, total: 0 }));
    todayPaid.forEach(o => {
      const h = new Date(o.created_at).getHours();
      const slot = hourly.find(x => x.hour === h);
      if (slot) slot.total += Number(o.total || 0);
    });

    // 7-day trend, one bar per day (today included last).
    const weekDays = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6 + i);
      return { date: d, total: 0 };
    });
    weekPaid.forEach(o => {
      const od = new Date(o.created_at);
      const slot = weekDays.find(w => w.date.getDate() === od.getDate() && w.date.getMonth() === od.getMonth());
      if (slot) slot.total += Number(o.total || 0);
    });

    setData({
      today: todayTotal, yesterday: yesterdayTotal, activeOrders: active, completed: todayPaid.length,
      avgTicket: todayPaid.length ? todayTotal / todayPaid.length : 0,
      topProducts, hourly, weekTotal, weekDays,
    });
    setUpdatedAt(new Date());
    if (!silent) setLoading(false);
  }

  const diff = data.yesterday > 0 ? ((data.today - data.yesterday) / data.yesterday * 100) : null;
  const maxHour = Math.max(...data.hourly.map(h => h.total), 1);
  const peak = data.hourly.reduce((best, h) => (h.total > best.total ? h : best), { hour: null, total: 0 });
  const maxDay = Math.max(...data.weekDays.map(d => d.total), 1);
  const maxRev = Math.max(...data.topProducts.map(p => p.rev), 1);

  const label = { fontSize: 11, color: C.muted, letterSpacing: 1.2, textTransform: "uppercase", fontWeight: 600 };
  const card = { background: C.card, border: `1px solid ${C.cardLine}`, borderRadius: 12, padding: 16 };

  return (
    <div style={{ padding: 16, fontFamily: cv, maxWidth: 900, margin: "0 auto", paddingBottom: 80, color: C.ink }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
        <h1 style={{ fontFamily: hv, fontWeight: 900, fontSize: 34, margin: 0, letterSpacing: 1 }}>Gün Özeti</h1>
        <div style={{ fontSize: 12, color: C.faint }}>
          {new Date().toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long" })}
          {updatedAt && <> · <span style={{ color: C.muted }}>{updatedAt.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}</span></>}
          <button onClick={() => loadData()} title="Yenile" style={{ marginLeft: 8, background: "none", border: `1px solid ${C.cardLine}`, color: C.muted, borderRadius: 6, padding: "2px 8px", cursor: "pointer", fontSize: 12 }}>↻</button>
        </div>
      </div>

      {stores.length > 1 && (
        <div style={{ display: "flex", gap: 8, margin: "14px 0 0", flexWrap: "wrap" }}>
          {stores.map(s => (
            <button key={s.id} onClick={() => setSelectedStore(s.id)} style={{
              padding: "8px 16px", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 13,
              background: selectedStore === s.id ? C.accent : "transparent",
              color: selectedStore === s.id ? "#000" : C.muted,
              border: `1px solid ${selectedStore === s.id ? C.accent : C.cardLine}`,
            }}>
              {s.slug === "paris" ? "🗼" : "🍩"} {s.name}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div style={{ padding: 60, textAlign: "center", color: C.muted }}>Yükleniyor…</div>
      ) : (
        <>
          {/* Hero: the one number that matters */}
          <div style={{ ...card, marginTop: 14, padding: "22px 20px", display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
            <div>
              <div style={label}>Bugün ciro</div>
              <div style={{ fontSize: 58, fontWeight: 900, fontFamily: hv, lineHeight: 1, marginTop: 6, color: C.ink }}>
                {fmtTL(data.today)}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              {diff !== null && (
                <div style={{
                  display: "inline-block", padding: "6px 12px", borderRadius: 999, fontSize: 14, fontWeight: 700,
                  background: diff >= 0 ? "rgba(123,196,127,0.12)" : "rgba(224,102,102,0.12)",
                  color: diff >= 0 ? C.up : C.down,
                }}>
                  {diff >= 0 ? "▲" : "▼"} %{Math.abs(diff).toFixed(0)} düne göre
                </div>
              )}
              <div style={{ fontSize: 12, color: C.faint, marginTop: 6 }}>Dün {fmtTL(data.yesterday)}</div>
            </div>
          </div>

          {/* Stat row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8, margin: "10px 0 14px" }}>
            {[
              ["Aktif sipariş", data.activeOrders, data.activeOrders > 0 ? C.accent : C.ink],
              ["Kapanan fiş", data.completed, C.ink],
              ["Ortalama fiş", fmtTL(data.avgTicket), C.ink],
              ["Son 7 gün", fmtTL(data.weekTotal), C.ink],
            ].map(([l, v, col]) => (
              <div key={l} style={{ ...card, padding: 14 }}>
                <div style={label}>{l}</div>
                <div style={{ fontSize: 26, fontWeight: 800, marginTop: 4, color: col }}>{v}</div>
              </div>
            ))}
          </div>

          {/* Hourly sales */}
          <div style={{ ...card, marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
              <div style={label}>Saatlik satış</div>
              {peak.hour !== null && peak.total > 0 && (
                <div style={{ fontSize: 12, color: C.muted }}>En yoğun <b style={{ color: C.accent }}>{peak.hour}:00</b> · {fmtTL(peak.total)}</div>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 130 }}>
              {data.hourly.map(h => (
                <div key={h.hour} style={{ flex: 1, textAlign: "center", display: "flex", flexDirection: "column", justifyContent: "flex-end", height: "100%" }}>
                  <div style={{
                    background: h.hour === peak.hour && h.total > 0 ? C.accent : h.total > 0 ? "#8a6b2f" : "#222",
                    height: `${Math.max((h.total / maxHour) * 100, 2)}%`,
                    borderRadius: "3px 3px 0 0",
                  }} title={`${h.hour}:00 — ${fmtTL(h.total)}`} />
                  <div style={{ fontSize: 10, color: h.hour % 2 === 0 ? C.muted : "transparent", marginTop: 5 }}>{h.hour}</div>
                </div>
              ))}
            </div>
          </div>

          {/* 7-day trend + top products side by side on wide screens */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 10 }}>
            <div style={card}>
              <div style={{ ...label, marginBottom: 14 }}>Son 7 gün</div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 96 }}>
                {data.weekDays.map((d, i) => {
                  const isToday = i === data.weekDays.length - 1;
                  return (
                    <div key={i} style={{ flex: 1, textAlign: "center", display: "flex", flexDirection: "column", justifyContent: "flex-end", height: "100%" }}>
                      <div style={{ fontSize: 10, color: isToday ? C.accent : C.faint, marginBottom: 3 }}>{d.total > 0 ? fmtTL(d.total).replace("₺", "") : ""}</div>
                      <div style={{
                        background: isToday ? C.accent : "#3a3a36",
                        height: `${Math.max((d.total / maxDay) * 62, 3)}%`,
                        borderRadius: "3px 3px 0 0",
                      }} title={`${d.date.toLocaleDateString("tr-TR", { day: "numeric", month: "short" })} — ${fmtTL(d.total)}`} />
                      <div style={{ fontSize: 10, color: isToday ? C.accent : C.muted, marginTop: 5, fontWeight: isToday ? 700 : 400 }}>{DAY_TR[d.date.getDay()]}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={card}>
              <div style={{ ...label, marginBottom: 10 }}>En çok satan · bugün</div>
              {data.topProducts.length === 0 ? (
                <div style={{ color: C.faint, fontSize: 13, padding: 12 }}>Bugün henüz satış yok</div>
              ) : data.topProducts.map((p, i) => (
                <div key={p.name} style={{ position: "relative", padding: "9px 10px", marginBottom: 4, borderRadius: 6, overflow: "hidden" }}>
                  <div style={{ position: "absolute", inset: 0, width: `${(p.rev / maxRev) * 100}%`, background: "rgba(200,151,62,0.10)", borderRadius: 6 }} />
                  <div style={{ position: "relative", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      <b style={{ color: C.accent, marginRight: 8 }}>{i + 1}</b> {p.name}
                    </span>
                    <span style={{ fontSize: 13, color: C.muted, whiteSpace: "nowrap" }}>× {p.qty} · <b style={{ color: C.ink }}>{fmtTL(p.rev)}</b></span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
