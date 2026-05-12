import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase.js";
import { useAuth } from "../../contexts/AuthContext.jsx";

const cv = "\u0027Coolvetica\u0027,\u0027Bebas Neue\u0027,sans-serif";
const cvc = "\u0027Coolvetica Condensed\u0027,\u0027Barlow Condensed\u0027,sans-serif";

const DAYS = [
  { idx: 1, label: "Pzt" },
  { idx: 2, label: "Sal" },
  { idx: 3, label: "\u00c7ar" },
  { idx: 4, label: "Per" },
  { idx: 5, label: "Cum" },
  { idx: 6, label: "Cmt" },
  { idx: 7, label: "Paz" },
];

export default function CategorySchedulePage() {
  const { staffUser } = useAuth();
  const [rules, setRules] = useState([]);
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    name: "",
    start_time: "22:00",
    end_time: "06:00",
    days_of_week: [1, 2, 3, 4, 5, 6, 7],
    category_overrides: {},
    product_overrides: {},
  });

  const load = async () => {
    const [{ data: r }, { data: c }, { data: p }] = await Promise.all([
      supabase.from("category_schedule_rules").select("*").in("store_id", staffUser?.store_ids?.length ? staffUser.store_ids : ["00000000-0000-0000-0000-000000000000"]).order("created_at", { ascending: false }),
      supabase.from("categories").select("id, name, store_id").in("store_id", staffUser?.store_ids?.length ? staffUser.store_ids : ["00000000-0000-0000-0000-000000000000"]).eq("is_active", true).order("sort_order"),
      supabase.from("products").select("id, name, store_id, category_id").in("store_id", staffUser?.store_ids?.length ? staffUser.store_ids : ["00000000-0000-0000-0000-000000000000"]).eq("is_available", true).order("name"),
    ]);
    setRules(r || []);
    setCategories(c || []);
    setProducts(p || []);
  };
  useEffect(() => { load(); }, []);

  const toggle = async (id, val) => {
    await supabase.from("category_schedule_rules").update({ is_active: val }).eq("id", id);
    load();
  };

  const remove = async (id) => {
    if (!confirm("Bu kural\u0131 silmek istedi\u011finizden emin misiniz?")) return;
    await supabase.from("category_schedule_rules").delete().eq("id", id);
    load();
  };

  const save = async () => {
    if (!form.name) return alert("Kural ismi gerekli");
    const catCount = Object.keys(form.category_overrides).length;
    const prodCount = Object.keys(form.product_overrides).length;
    if (catCount === 0 && prodCount === 0) return alert("En az bir kategori veya \u00fcr\u00fcn se\u00e7in");
    const payload = {
      name: form.name,
      start_time: form.start_time,
      end_time: form.end_time,
      days_of_week: form.days_of_week,
      category_overrides: form.category_overrides,
      product_overrides: form.product_overrides,
      priority: 0,
      store_id: staffUser?.store_ids?.[0],
      is_active: true,
    };
    const { error } = await supabase.from("category_schedule_rules").insert(payload);
    if (error) return alert("Hata: " + error.message);
    setShowAdd(false);
    setForm({ name: "", start_time: "22:00", end_time: "06:00", days_of_week: [1, 2, 3, 4, 5, 6, 7], category_overrides: {}, product_overrides: {} });
    load();
  };

  const toggleDay = (idx) => {
    const d = form.days_of_week.includes(idx) ? form.days_of_week.filter(x => x !== idx) : [...form.days_of_week, idx];
    setForm({ ...form, days_of_week: d });
  };

  const toggleCategory = (cid) => {
    const co = { ...form.category_overrides };
    if (co[cid]) delete co[cid]; else co[cid] = true;
    setForm({ ...form, category_overrides: co });
  };

  const toggleProduct = (pid) => {
    const po = { ...form.product_overrides };
    if (po[pid]) delete po[pid]; else po[pid] = true;
    setForm({ ...form, product_overrides: po });
  };

  return (
    <div style={{ padding: 24, fontFamily: cv, color: "#fff", minHeight: "100vh", background: "#000" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 style={{ fontSize: 32, fontFamily: cvc, letterSpacing: "2px", margin: 0 }}>\u23f0 KATEGOR\u0130 / \u00dcR\u00dcN SAATLER\u0130</h1>
        <button onClick={() => setShowAdd(true)} style={{ padding: "12px 20px", background: "#C8973E", color: "#000", border: "none", fontFamily: cvc, fontSize: 14, letterSpacing: "1px", cursor: "pointer", borderRadius: 8 }}>+ YEN\u0130 KURAL</button>
      </div>

      {rules.length === 0 && <div style={{ color: "#888", marginTop: 32, textAlign: "center" }}>Hen\u00fcz kural yok. Yukar\u0131dan yeni kural ekleyin.</div>}

      {rules.map(r => {
        const catCount = Object.keys(r.category_overrides || {}).length;
        const prodCount = Object.keys(r.product_overrides || {}).length;
        return (
          <div key={r.id} style={{ background: "#111", padding: 16, marginBottom: 12, borderRadius: 8, border: "1px solid #333" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontFamily: cvc, fontSize: 18, letterSpacing: "1px" }}>{r.name}</div>
                <div style={{ color: "#888", fontSize: 13, marginTop: 4 }}>
                  {r.start_time?.slice(0, 5)} - {r.end_time?.slice(0, 5)} | {r.days_of_week?.map(d => DAYS.find(x => x.idx === d)?.label).join(", ")}
                </div>
                <div style={{ color: "#C8973E", fontSize: 13, marginTop: 4 }}>
                  {catCount > 0 && (catCount + " kategori")}{catCount > 0 && prodCount > 0 && " + "}{prodCount > 0 && (prodCount + " \u00fcr\u00fcn")} gizli
                </div>
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
            <h2 style={{ fontFamily: cvc, fontSize: 24, letterSpacing: "2px", margin: "0 0 16px 0" }}>YEN\u0130 KURAL</h2>
            <label style={{ display: "block", color: "#aaa", fontSize: 12, marginBottom: 4 }}>\u0130S\u0130M</label>
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="\u00d6rn: Gece Mutfak Kapal\u0131" style={{ width: "100%", padding: 10, background: "#000", color: "#fff", border: "1px solid #333", borderRadius: 6, marginBottom: 12 }} />
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
            <label style={{ display: "block", color: "#aaa", fontSize: 12, marginBottom: 8 }}>G\u0130ZLENECEK KATEGOR\u0130LER</label>
            <div style={{ background: "#000", padding: 12, borderRadius: 6, border: "1px solid #333", maxHeight: 150, overflowY: "auto", marginBottom: 12 }}>
              {categories.map(c => (
                <label key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", cursor: "pointer", fontSize: 14 }}>
                  <input type="checkbox" checked={!!form.category_overrides[c.id]} onChange={() => toggleCategory(c.id)} style={{ accentColor: "#C8973E" }} />
                  <span style={{ color: "#fff" }}>{c.name}</span>
                </label>
              ))}
              {categories.length === 0 && <div style={{ color: "#666", textAlign: "center", padding: 8 }}>Y\u00fckleniyor\u2026</div>}
            </div>
            <label style={{ display: "block", color: "#aaa", fontSize: 12, marginBottom: 8 }}>G\u0130ZLENECEK \u00dcR\u00dcNLER</label>
            <div style={{ background: "#000", padding: 12, borderRadius: 6, border: "1px solid #333", maxHeight: 200, overflowY: "auto", marginBottom: 16 }}>
              {products.map(p => (
                <label key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", cursor: "pointer", fontSize: 14 }}>
                  <input type="checkbox" checked={!!form.product_overrides[p.id]} onChange={() => toggleProduct(p.id)} style={{ accentColor: "#C8973E" }} />
                  <span style={{ color: "#fff" }}>{p.name}</span>
                </label>
              ))}
              {products.length === 0 && <div style={{ color: "#666", textAlign: "center", padding: 8 }}>Y\u00fckleniyor\u2026</div>}
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
