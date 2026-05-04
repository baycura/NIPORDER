import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase.js";

const cv = "\u0027Coolvetica\u0027,\u0027Bebas Neue\u0027,sans-serif";
const cvc = "\u0027Coolvetica Condensed\u0027,\u0027Barlow Condensed\u0027,sans-serif";

const PARIS_STORE_UUID = "c3c6e0c7-1821-4edd-993d-ad960cfbc452";

const DAYS = [
  { idx: 1, label: "Pzt" },
  { idx: 2, label: "Sal" },
  { idx: 3, label: "\u00c7ar" },
  { idx: 4, label: "Per" },
  { idx: 5, label: "Cum" },
  { idx: 6, label: "Cmt" },
  { idx: 7, label: "Paz" },
];

export default function HappyHourPage() {
  const [rules, setRules] = useState([]);
  const [products, setProducts] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    name: "",
    start_time: "17:00",
    end_time: "19:00",
    days_of_week: [1, 2, 3, 4, 5, 6, 7],
    product_overrides: {},
  });

  const load = async () => {
    const [{ data: r }, { data: p }] = await Promise.all([
      supabase.from("happy_hour_rules").select("*").order("created_at", { ascending: false }),
      supabase.from("products").select("id, name, price, store_id").eq("is_available", true).order("name"),
    ]);
    setRules(r || []);
    setProducts(p || []);
  };
  useEffect(() => { load(); }, []);

  const toggle = async (id, val) => {
    await supabase.from("happy_hour_rules").update({ is_active: val }).eq("id", id);
    load();
  };

  const remove = async (id) => {
    if (!confirm("Bu kural\u0131 silmek istedi\u011finizden emin misiniz?")) return;
    await supabase.from("happy_hour_rules").delete().eq("id", id);
    load();
  };

  const save = async () => {
    if (!form.name) return alert("Kural ismi gerekli");
    if (Object.keys(form.product_overrides).length === 0) return alert("En az bir \u00fcr\u00fcn se\u00e7in");
    const payload = {
      name: form.name,
      start_time: form.start_time,
      end_time: form.end_time,
      days_of_week: form.days_of_week,
      discount_pct: 0,
      product_overrides: form.product_overrides,
      store_id: PARIS_STORE_UUID,
      is_active: true,
    };
    const { error } = await supabase.from("happy_hour_rules").insert(payload);
    if (error) return alert("Hata: " + error.message);
    setShowAdd(false);
    setForm({ name: "", start_time: "17:00", end_time: "19:00", days_of_week: [1, 2, 3, 4, 5, 6, 7], product_overrides: {} });
    load();
  };

  const toggleDay = (idx) => {
    const d = form.days_of_week.includes(idx) ? form.days_of_week.filter(x => x !== idx) : [...form.days_of_week, idx];
    setForm({ ...form, days_of_week: d });
  };

  const setProductPrice = (pid, defaultPrice, newPrice) => {
    const po = { ...form.product_overrides };
    if (newPrice === "" || newPrice == null) {
      delete po[pid];
    } else {
      po[pid] = parseInt(newPrice, 10) || 0;
    }
    setForm({ ...form, product_overrides: po });
  };

  return (
    <div style={{ padding: 24, fontFamily: cv, color: "#fff", minHeight: "100vh", background: "#000" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 style={{ fontSize: 32, fontFamily: cvc, letterSpacing: "2px", margin: 0 }}>\u{1F389} HAPPY HOUR</h1>
        <button onClick={() => setShowAdd(true)} style={{ padding: "12px 20px", background: "#C8973E", color: "#000", border: "none", fontFamily: cvc, fontSize: 14, letterSpacing: "1px", cursor: "pointer", borderRadius: 8 }}>+ YEN\u0130 KURAL</button>
      </div>

      {rules.length === 0 && <div style={{ color: "#888", marginTop: 32, textAlign: "center" }}>Hen\u00fcz kural yok. Yukar\u0131dan yeni kural ekleyin.</div>}

      {rules.map(r => {
        const productCount = Object.keys(r.product_overrides || {}).length;
        return (
          <div key={r.id} style={{ background: "#111", padding: 16, marginBottom: 12, borderRadius: 8, border: "1px solid #333" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontFamily: cvc, fontSize: 18, letterSpacing: "1px" }}>{r.name}</div>
                <div style={{ color: "#888", fontSize: 13, marginTop: 4 }}>
                  {r.start_time?.slice(0, 5)} - {r.end_time?.slice(0, 5)} | {r.days_of_week?.map(d => DAYS.find(x => x.idx === d)?.label).join(", ")}
                </div>
                <div style={{ color: "#C8973E", fontSize: 13, marginTop: 4 }}>{productCount} \u00fcr\u00fcn i\u00e7in \u00f6zel fiyat</div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => toggle(r.id, !r.is_active)} style={{ padding: "8px 16px", background: r.is_active ? "#22c55e" : "#444", color: "#fff", border: "none", borderRadius: 6, fontFamily: cvc, cursor: "pointer" }}>{r.is_active ? "AKT\u0130F" : "PAS\u0130F"}</button>
                <button onClick={() => remove(r.id)} style={{ padding: "8px 16px", background: "#ef4444", color: "#fff", border: "none", borderRadius: 6, fontFamily: cvc, cursor: "pointer" }}>S\u0130L</button>
              </div>
            </div>
          </div>
        );
      })}

      {showAdd && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "flex-start", justifyContent: "center", overflowY: "auto", zIndex: 100, padding: 24 }}>
          <div style={{ background: "#111", padding: 24, borderRadius: 12, width: "100%", maxWidth: 700, border: "1px solid #333" }}>
            <h2 style={{ fontFamily: cvc, fontSize: 24, letterSpacing: "2px", margin: "0 0 16px 0" }}>YEN\u0130 HAPPY HOUR</h2>
            <label style={{ display: "block", color: "#aaa", fontSize: 12, marginBottom: 4 }}>\u0130S\u0130M</label>
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="\u00d6rn: Ak\u015fam Cocktail" style={{ width: "100%", padding: 10, background: "#000", color: "#fff", border: "1px solid #333", borderRadius: 6, marginBottom: 12 }} />
            <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: "block", color: "#aaa", fontSize: 12, marginBottom: 4 }}>BA\u015eLANGI\u00c7</label>
                <input type="time" value={form.start_time} onChange={e => setForm({ ...form, start_time: e.target.value })} style={{ width: "100%", padding: 10, background: "#000", color: "#fff", border: "1px solid #333", borderRadius: 6 }} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: "block", color: "#aaa", fontSize: 12, marginBottom: 4 }}>B\u0130T\u0130\u015e</label>
                <input type="time" value={form.end_time} onChange={e => setForm({ ...form, end_time: e.target.value })} style={{ width: "100%", padding: 10, background: "#000", color: "#fff", border: "1px solid #333", borderRadius: 6 }} />
              </div>
            </div>
            <label style={{ display: "block", color: "#aaa", fontSize: 12, marginBottom: 4 }}>G\u00dcNLER</label>
            <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
              {DAYS.map(d => (
                <button key={d.idx} onClick={() => toggleDay(d.idx)} style={{ padding: "8px 12px", background: form.days_of_week.includes(d.idx) ? "#C8973E" : "#222", color: form.days_of_week.includes(d.idx) ? "#000" : "#aaa", border: "none", borderRadius: 6, fontFamily: cvc, cursor: "pointer", minWidth: 50 }}>{d.label}</button>
              ))}
            </div>
            <label style={{ display: "block", color: "#aaa", fontSize: 12, marginBottom: 8 }}>\u00dcR\u00dcNLER VE YEN\u0130 F\u0130YATLAR</label>
            <div style={{ background: "#000", padding: 12, borderRadius: 6, border: "1px solid #333", maxHeight: 300, overflowY: "auto", marginBottom: 16 }}>
              {products.map(p => {
                const newPrice = form.product_overrides[p.id];
                const isSelected = newPrice != null;
                return (
                  <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid #222" }}>
                    <input type="checkbox" checked={isSelected} onChange={e => setProductPrice(p.id, p.price, e.target.checked ? Math.round(p.price) : "")} style={{ accentColor: "#C8973E" }} />
                    <div style={{ flex: 1, fontSize: 14 }}>
                      <span style={{ color: "#fff" }}>{p.name}</span>
                      <span style={{ color: "#666", fontSize: 12, marginLeft: 8 }}>(\u20ba{Math.round(p.price)})</span>
                    </div>
                    {isSelected && (
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <span style={{ color: "#aaa", fontSize: 12 }}>\u20ba</span>
                        <input type="number" value={newPrice} onChange={e => setProductPrice(p.id, p.price, e.target.value)} style={{ width: 70, padding: 6, background: "#111", color: "#C8973E", border: "1px solid #C8973E", borderRadius: 4, fontFamily: cvc, fontSize: 14 }} />
                      </div>
                    )}
                  </div>
                );
              })}
              {products.length === 0 && <div style={{ color: "#666", textAlign: "center", padding: 16 }}>\u00dcr\u00fcn y\u00fckleniyor\u2026</div>}
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setShowAdd(false)} style={{ padding: "10px 20px", background: "#333", color: "#fff", border: "none", borderRadius: 6, fontFamily: cvc, cursor: "pointer" }}>\u0130PTAL</button>
              <button onClick={save} style={{ padding: "10px 20px", background: "#C8973E", color: "#000", border: "none", borderRadius: 6, fontFamily: cvc, cursor: "pointer" }}>KAYDET</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
