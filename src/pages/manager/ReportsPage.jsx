import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase.js";
import { useAuth } from "../../contexts/AuthContext.jsx";

const cv = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";
const hv = "'Bebas Neue','Barlow Condensed','Coolvetica Condensed',sans-serif";

export default function ReportsPage() {
  const { staffUser } = useAuth();
  const storeIds = staffUser?.store_ids || [];
  const [stores, setStores] = useState([]);
  const [selectedStore, setSelectedStore] = useState(null);
  const [data, setData] = useState({ today: 0, yesterday: 0, activeOrders: 0, completed: 0, topProducts: [], hourly: [], weekTotal: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (storeIds.length === 0) return;
    supabase.from("stores").select("id,name,slug").in("id", storeIds).then(r => {
      const list = r.data || [];
      setStores(list);
      if (list.length > 0 && !selectedStore) setSelectedStore(list[0].id);
    });
  }, [staffUser?.id]);

  useEffect(() => { if (selectedStore) loadData(); }, [selectedStore]);

  async function loadData() {
    setLoading(true);
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const yesterdayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).toISOString();
    const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7).toISOString();

    const [todayRes, yesterdayRes, weekRes] = await Promise.all([
      supabase.from("orders").select("id,total,status,created_at,order_items(quantity,unit_price,product_id,products(name))").eq("origin_store_id", selectedStore).gte("created_at", todayStart),
      supabase.from("orders").select("total,status").eq("origin_store_id", selectedStore).gte("created_at", yesterdayStart).lt("created_at", todayStart),
      supabase.from("orders").select("total,status").eq("origin_store_id", selectedStore).gte("created_at", weekStart),
    ]);

    const paid = ['paid','completed','served','closed'];
    const todayOrders = todayRes.data || [];
    const todayPaid = todayOrders.filter(o => paid.includes(o.status));
    const yesterdayPaid = (yesterdayRes.data || []).filter(o => paid.includes(o.status));
    const weekPaid = (weekRes.data || []).filter(o => paid.includes(o.status));

    const todayTotal = todayPaid.reduce((s,o) => s + Number(o.total||0), 0);
    const yesterdayTotal = yesterdayPaid.reduce((s,o) => s + Number(o.total||0), 0);
    const weekTotal = weekPaid.reduce((s,o) => s + Number(o.total||0), 0);
    const active = todayOrders.filter(o => !paid.includes(o.status)).length;

    const pCount = {};
    todayPaid.forEach(o => (o.order_items||[]).forEach(oi => {
      const n = oi.products?.name || 'Bilinmeyen';
      pCount[n] = (pCount[n]||0) + (oi.quantity||0);
    }));
    const topProducts = Object.entries(pCount).sort((a,b) => b[1]-a[1]).slice(0,5);

    const hourly = Array.from({length:16}, (_,i) => ({ hour: 8+i, total: 0 }));
    todayPaid.forEach(o => {
      const h = new Date(o.created_at).getHours();
      const slot = hourly.find(x => x.hour === h);
      if (slot) slot.total += Number(o.total||0);
    });

    setData({ today: todayTotal, yesterday: yesterdayTotal, activeOrders: active, completed: todayPaid.length, topProducts, hourly, weekTotal });
    setLoading(false);
  }

  const diff = data.yesterday > 0 ? ((data.today - data.yesterday) / data.yesterday * 100) : null;
  const maxHour = Math.max(...data.hourly.map(h => h.total), 1);

  return (
    <div style={{ padding: 16, fontFamily: cv, maxWidth: 900, margin: "0 auto", paddingBottom: 80 }}>
      <h1 style={{ fontFamily: hv, fontWeight: 900, fontSize: 36, margin: "0 0 8px", letterSpacing: 1 }}>
        📊 DASHBOARD
      </h1>
      <div style={{ fontSize: 12, color: "#999", marginBottom: 16 }}>{new Date().toLocaleDateString('tr-TR', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}</div>

      {stores.length > 1 && (
        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          {stores.map(s => (
            <button key={s.id} onClick={() => setSelectedStore(s.id)} style={{
              padding: "8px 16px", borderRadius: 8, border: "none", cursor: "pointer",
              background: selectedStore === s.id ? (s.slug === 'paris' ? "#000" : "#a02020") : "#eee",
              color: selectedStore === s.id ? "#fff" : "#666", fontWeight: 600, fontSize: 14
            }}>
              {s.slug === 'paris' ? '🗼' : '🍩'} {s.name}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div style={{ padding: 60, textAlign: "center", color: "#999" }}>Yükleniyor...</div>
      ) : (
        <>
          <div style={{ background: "#000", color: "#fff", padding: 24, borderRadius: 12, marginBottom: 12 }}>
            <div style={{ fontSize: 12, opacity: 0.6, letterSpacing: 1 }}>💰 BUGÜN CİRO</div>
            <div style={{ fontSize: 52, fontWeight: 900, fontFamily: hv, lineHeight: 1, marginTop: 4 }}>
              ₺{data.today.toFixed(2)}
            </div>
            {diff !== null && (
              <div style={{ fontSize: 14, marginTop: 8, color: diff >= 0 ? "#9f9" : "#f99" }}>
                {diff >= 0 ? "↗" : "↘"} %{Math.abs(diff).toFixed(0)} dünden (₺{data.yesterday.toFixed(2)})
              </div>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 16 }}>
            <div style={{ background: "#f5f5f5", padding: 14, borderRadius: 10 }}>
              <div style={{ fontSize: 11, color: "#666" }}>⏱️ AKTİF</div>
              <div style={{ fontSize: 28, fontWeight: 700 }}>{data.activeOrders}</div>
            </div>
            <div style={{ background: "#f5f5f5", padding: 14, borderRadius: 10 }}>
              <div style={{ fontSize: 11, color: "#666" }}>✅ BUGÜN</div>
              <div style={{ fontSize: 28, fontWeight: 700 }}>{data.completed}</div>
            </div>
            <div style={{ background: "#f5f5f5", padding: 14, borderRadius: 10 }}>
              <div style={{ fontSize: 11, color: "#666" }}>📅 7 GÜN</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>₺{data.weekTotal.toFixed(0)}</div>
            </div>
          </div>

          <div style={{ background: "#fff", border: "1px solid #eee", padding: 16, borderRadius: 10, marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: "#666", marginBottom: 14, letterSpacing: 1 }}>📈 SAATLİK SATIŞ</div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 110 }}>
              {data.hourly.map(h => (
                <div key={h.hour} style={{ flex: 1, textAlign: "center", display:"flex", flexDirection:"column", justifyContent:"flex-end", height:"100%" }}>
                  <div style={{
                    background: h.total > 0 ? "#d4af37" : "#f0f0f0",
                    height: `${Math.max((h.total / maxHour) * 100, 2)}%`,
                    borderRadius: "3px 3px 0 0",
                    transition: "all 0.3s"
                  }} title={`${h.hour}:00 - ₺${h.total.toFixed(0)}`} />
                  <div style={{ fontSize: 9, color: "#bbb", marginTop: 4 }}>{h.hour}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ background: "#fff", border: "1px solid #eee", padding: 16, borderRadius: 10 }}>
            <div style={{ fontSize: 12, color: "#666", marginBottom: 12, letterSpacing: 1 }}>🏆 EN ÇOK SATAN (BUGÜN)</div>
            {data.topProducts.length === 0 ? (
              <div style={{ color: "#bbb", fontSize: 13, padding: 12 }}>Bugün henüz satış yok</div>
            ) : data.topProducts.map(([name, qty], i) => (
              <div key={name} style={{ display: "flex", justifyContent: "space-between", alignItems:"center", padding: "10px 0", borderBottom: i < data.topProducts.length-1 ? "1px solid #f5f5f5" : "none" }}>
                <span style={{ fontSize: 14 }}><b style={{ color: "#d4af37", marginRight: 8 }}>{i+1}.</b> {name}</span>
                <span style={{ fontWeight: 700, fontSize: 16 }}>× {qty}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
