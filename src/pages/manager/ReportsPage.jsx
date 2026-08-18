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
  const [data, setData] = useState({ today: 0, yesterday: 0, activeOrders: 0, completed: 0, topProducts: [], hourly: [], weekTotal: 0, kitchenToday: 0, daily: [] });
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
    const dayStart = (offset) => new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset);
    const todayStart = dayStart(0);
    // 14 gunluk pencereyi TEK sorguda cekiyoruz: gunun ozeti de, gunluk grafik de
    // ayni veriden hesaplaniyor — ucuncu bir sorgu ve tutarsizlik riski yok.
    const { data: rows } = await supabase
      .from("orders")
      .select("id,total,status,created_at,order_items(quantity,final_price,product_id,products(name,kitchen_consignment))")
      .eq("origin_store_id", selectedStore)
      .gte("created_at", dayStart(13).toISOString());

    const paid = ['paid','completed','served','closed'];
    const all = rows || [];
    const isPaid = (o) => paid.includes(o.status);
    // Yerel gun anahtari (YYYY-MM-DD) — UTC'ye cevirirsek gece yarisi kayar
    const dayKey = (d) => {
      const x = new Date(d);
      return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,"0")}-${String(x.getDate()).padStart(2,"0")}`;
    };
    // NIP Kitchen envanteri: ciroya girer ama bize kalmaz, ay sonu mutfaga odenir
    const kitchenOf = (o) => (o.order_items||[])
      .filter(oi => oi.products?.kitchen_consignment)
      .reduce((t,oi) => t + Number(oi.final_price||0) * Number(oi.quantity||0), 0);

    const todayKey = dayKey(todayStart);
    const yesterdayKey = dayKey(dayStart(1));
    const todayOrders = all.filter(o => dayKey(o.created_at) === todayKey);
    const todayPaid = todayOrders.filter(isPaid);

    const todayTotal = todayPaid.reduce((s,o) => s + Number(o.total||0), 0);
    const yesterdayTotal = all.filter(o => dayKey(o.created_at) === yesterdayKey && isPaid(o))
      .reduce((s,o) => s + Number(o.total||0), 0);
    const weekTotal = all.filter(o => isPaid(o) && new Date(o.created_at) >= dayStart(6))
      .reduce((s,o) => s + Number(o.total||0), 0);
    const active = todayOrders.filter(o => !isPaid(o)).length;
    const kitchenToday = todayPaid.reduce((s,o) => s + kitchenOf(o), 0);

    const pCount = {};
    todayPaid.forEach(o => (o.order_items||[]).forEach(oi => {
      const n = oi.products?.name || 'Bilinmeyen';
      pCount[n] = (pCount[n]||0) + (oi.quantity||0);
    }));
    const topProducts = Object.entries(pCount).sort((a,b) => b[1]-a[1]).slice(0,5);

    const hourly = Array.from({length:16}, (_,i) => ({ hour: 8+i, total: 0 }));
    todayPaid.forEach(o => {
      const slot = hourly.find(x => x.hour === new Date(o.created_at).getHours());
      if (slot) slot.total += Number(o.total||0);
    });

    // Gunluk kazanc: satis olmayan gunler de bosluk olarak durmali, bu yuzden
    // 14 gunun hepsini onceden kuruyoruz.
    const daily = Array.from({length:14}, (_,i) => {
      const d = dayStart(13-i);
      return { key: dayKey(d), date: d, total: 0, kitchen: 0, orders: 0 };
    });
    const byKey = Object.fromEntries(daily.map(d => [d.key, d]));
    all.filter(isPaid).forEach(o => {
      const slot = byKey[dayKey(o.created_at)];
      if (!slot) return;
      slot.total += Number(o.total||0);
      slot.kitchen += kitchenOf(o);
      slot.orders += 1;
    });

    setData({ today: todayTotal, yesterday: yesterdayTotal, activeOrders: active,
              completed: todayPaid.length, topProducts, hourly, weekTotal, kitchenToday, daily });
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
            {data.kitchenToday > 0 && (
              <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.15)", display: "flex", justifyContent: "space-between", gap: 10, fontSize: 13 }}>
                <div>
                  <div style={{ opacity: 0.55, fontSize: 11 }}>🥙 MUTFAĞA ÖDENECEK</div>
                  <div style={{ fontWeight: 700, fontSize: 18 }}>₺{data.kitchenToday.toFixed(2)}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ opacity: 0.55, fontSize: 11 }}>🏠 BİZE KALAN CİRO</div>
                  <div style={{ fontWeight: 700, fontSize: 18, color: "#d4af37" }}>₺{(data.today - data.kitchenToday).toFixed(2)}</div>
                </div>
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

          {(() => {
            const days = data.daily || [];
            const maxDay = Math.max(...days.map(d => d.total), 1);
            const sumT = days.reduce((s,d) => s + d.total, 0);
            const sumK = days.reduce((s,d) => s + d.kitchen, 0);
            const gun = (d) => d.date.toLocaleDateString("tr-TR", { day:"numeric", month:"short" });
            const kisaGun = (d) => ["Pz","Pt","Sa","Ça","Pe","Cu","Ct"][d.date.getDay()];
            const tl = (n) => "₺" + Math.round(n).toLocaleString("tr-TR");
            if (!days.length) return null;
            return (
            <div style={{ background: "#fff", border: "1px solid #eee", padding: 16, borderRadius: 10, marginBottom: 12 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom: 14 }}>
                <div style={{ fontSize: 12, color: "#666", letterSpacing: 1 }}>💵 GÜNLÜK KAZANÇ · 14 GÜN</div>
                <div style={{ fontSize: 11, color: "#999" }}>toplam {tl(sumT)}{sumK > 0 ? " · bize kalan " + tl(sumT - sumK) : ""}</div>
              </div>

              {/* Cubugun koyu kismi bize kalan, acik kismi mutfaga odenecek */}
              <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 130 }}>
                {days.map(d => {
                  const h = (d.total / maxDay) * 100;
                  const kitchenPct = d.total > 0 ? (d.kitchen / d.total) * 100 : 0;
                  const bugun = d.key === days[days.length-1].key;
                  return (
                    <div key={d.key} style={{ flex: 1, display:"flex", flexDirection:"column", justifyContent:"flex-end", height:"100%", minWidth: 0 }}
                         title={`${gun(d)} — ${tl(d.total)} (${d.orders} sipariş)` + (d.kitchen > 0 ? `\nMutfağa: ${tl(d.kitchen)}` : "")}>
                      <div style={{ fontSize: 8, color: "#bbb", textAlign:"center", marginBottom: 3, whiteSpace:"nowrap" }}>
                        {d.total > 0 ? Math.round(d.total/1000) + "k" : ""}
                      </div>
                      <div style={{ height: `${Math.max(h, d.total > 0 ? 3 : 1.5)}%`, background: d.total > 0 ? "#f0f0f0" : "#f7f7f7",
                                    borderRadius: "3px 3px 0 0", overflow:"hidden", display:"flex", flexDirection:"column", justifyContent:"flex-end" }}>
                        {kitchenPct > 0 && <div style={{ height: `${kitchenPct}%`, background: "#e8dcc0" }} />}
                        <div style={{ height: `${100 - kitchenPct}%`, background: bugun ? "#000" : "#d4af37" }} />
                      </div>
                      <div style={{ fontSize: 9, color: bugun ? "#000" : "#bbb", marginTop: 4, textAlign:"center", fontWeight: bugun ? 800 : 400 }}>{kisaGun(d)}</div>
                    </div>
                  );
                })}
              </div>

              <div style={{ overflowX: "auto", marginTop: 14 }}>
                <table style={{ width:"100%", borderCollapse:"collapse", fontSize: 12, fontVariantNumeric:"tabular-nums" }}>
                  <thead>
                    <tr style={{ color:"#999", fontSize: 10, letterSpacing: 0.5 }}>
                      <th style={{ textAlign:"left", padding:"6px 4px", fontWeight:600 }}>GÜN</th>
                      <th style={{ textAlign:"right", padding:"6px 4px", fontWeight:600 }}>SİP.</th>
                      <th style={{ textAlign:"right", padding:"6px 4px", fontWeight:600 }}>CİRO</th>
                      {sumK > 0 && <th style={{ textAlign:"right", padding:"6px 4px", fontWeight:600 }}>MUTFAK</th>}
                      <th style={{ textAlign:"right", padding:"6px 4px", fontWeight:600 }}>BİZE KALAN</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...days].reverse().filter(d => d.total > 0).map(d => (
                      <tr key={d.key} style={{ borderTop:"1px solid #f5f5f5" }}>
                        <td style={{ padding:"7px 4px" }}>{gun(d)} <span style={{color:"#bbb"}}>{kisaGun(d)}</span></td>
                        <td style={{ padding:"7px 4px", textAlign:"right", color:"#999" }}>{d.orders}</td>
                        <td style={{ padding:"7px 4px", textAlign:"right" }}>{tl(d.total)}</td>
                        {sumK > 0 && <td style={{ padding:"7px 4px", textAlign:"right", color:"#a08a50" }}>{d.kitchen > 0 ? tl(d.kitchen) : "—"}</td>}
                        <td style={{ padding:"7px 4px", textAlign:"right", fontWeight:700 }}>{tl(d.total - d.kitchen)}</td>
                      </tr>
                    ))}
                    {days.every(d => d.total === 0) && (
                      <tr><td colSpan={5} style={{ padding:16, textAlign:"center", color:"#bbb" }}>Son 14 günde satış yok</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            );
          })()}

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
