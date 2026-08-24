import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase.js";
import { useAuth } from "../../contexts/AuthContext.jsx";

const cv = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";

const DAYS = [
  { idx: 1, label: "Pzt" },
  { idx: 2, label: "Sal" },
  { idx: 3, label: "Çar" },
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
    const { error } = await supabase.from("category_schedule_rules").update({ is_active: val }).eq("id", id);
    if (error) { alert("Değiştirilemedi: " + error.message); return; }
    load();
  };

  const remove = async (id) => {
    if (!confirm("Bu kuralı silmek istediğinizden emin misiniz?")) return;
    const { error } = await supabase.from("category_schedule_rules").delete().eq("id", id);
    if (error) { alert("Silinemedi: " + error.message); return; }
    load();
  };

  const save = async () => {
    if (!form.name) return alert("Kural ismi gerekli");
    const catCount = Object.keys(form.category_overrides).length;
    const prodCount = Object.keys(form.product_overrides).length;
    if (catCount === 0 && prodCount === 0) return alert("En az bir kategori veya ürün seçin");
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
    <div style={{ fontFamily: cv, color: "#F0EDE8" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>⏰ Kategori Saatleri</h1>
          <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>Seçilen saat aralığında işaretli kategori ve ürünler müşteri menüsünden otomatik gizlenir (örn. gece mutfak kapalı).</div>
        </div>
        <button onClick={() => setShowAdd(true)} style={{ padding: "12px 20px", background: "#FFFFFF", color: "#000", border: "none", fontWeight: 800, fontSize: 13, cursor: "pointer", borderRadius: 8 }}>+ YENİ KURAL</button>
      </div>

      {rules.length === 0 && <div style={{ color: "#888", marginTop: 32, textAlign: "center" }}>Henüz kural yok. Yukarıdan yeni kural ekleyin.</div>}

      {rules.map(r => {
        const catCount = Object.keys(r.category_overrides || {}).length;
        const prodCount = Object.keys(r.product_overrides || {}).length;
        return (
          <div key={r.id} style={{ background: "#111", padding: 16, marginBottom: 12, borderRadius: 8, border: "1px solid #333" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{r.name}</div>
                <div style={{ color: "#888", fontSize: 13, marginTop: 4 }}>
                  {r.start_time?.slice(0, 5)} - {r.end_time?.slice(0, 5)} | {r.days_of_week?.map(d => DAYS.find(x => x.idx === d)?.label).join(", ")}
                </div>
                <div style={{ color: "#FFFFFF", fontSize: 13, marginTop: 4 }}>
                  Bu saatlerde gizlenir: {catCount > 0 && (catCount + " kategori")}{catCount > 0 && prodCount > 0 && " + "}{prodCount > 0 && (prodCount + " ürün")}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => toggle(r.id, !r.is_active)} style={{ padding: "8px 16px", background: r.is_active ? "#8A8580" : "#444", color: "#fff", border: "none", borderRadius: 6, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>{r.is_active ? "AKTİF" : "PASİF"}</button>
                <button onClick={() => remove(r.id)} style={{ padding: "8px 16px", background: "#2A2A2A", color: "#fff", border: "none", borderRadius: 6, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>SİL</button>
              </div>
            </div>
          </div>
        );
      })}

      {showAdd && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "flex-start", justifyContent: "center", overflowY: "auto", zIndex: 100, padding: 24 }}>
          <div style={{ background: "#111", padding: 24, borderRadius: 12, width: "100%", maxWidth: 700, border: "1px solid #333" }}>
            <h2 style={{ fontWeight: 800, fontSize: 20, margin: "0 0 16px 0" }}>YENİ KURAL</h2>
            <label style={{ display: "block", color: "#aaa", fontSize: 12, marginBottom: 4 }}>İSİM</label>
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Örn: Gece Mutfak Kapalı" style={{ width: "100%", padding: 10, background: "#000", color: "#fff", border: "1px solid #333", borderRadius: 6, marginBottom: 12 }} />
            <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: "block", color: "#aaa", fontSize: 12, marginBottom: 4 }}>BAŞLANGIÇ</label>
                <input type="time" value={form.start_time} onChange={e => setForm({ ...form, start_time: e.target.value })} style={{ width: "100%", padding: 10, background: "#000", color: "#fff", border: "1px solid #333", borderRadius: 6 }} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: "block", color: "#aaa", fontSize: 12, marginBottom: 4 }}>BİTİŞ</label>
                <input type="time" value={form.end_time} onChange={e => setForm({ ...form, end_time: e.target.value })} style={{ width: "100%", padding: 10, background: "#000", color: "#fff", border: "1px solid #333", borderRadius: 6 }} />
              </div>
            </div>
            <label style={{ display: "block", color: "#aaa", fontSize: 12, marginBottom: 4 }}>GÜNLER</label>
            <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
              {DAYS.map(d => (
                <button key={d.idx} onClick={() => toggleDay(d.idx)} style={{ padding: "8px 12px", background: form.days_of_week.includes(d.idx) ? "#FFFFFF" : "#222", color: form.days_of_week.includes(d.idx) ? "#000" : "#aaa", border: "none", borderRadius: 6, fontWeight: 700, fontSize: 12, cursor: "pointer", minWidth: 50 }}>{d.label}</button>
              ))}
            </div>
            <label style={{ display: "block", color: "#aaa", fontSize: 12, marginBottom: 8 }}>GİZLENECEK KATEGORİLER</label>
            <div style={{ background: "#000", padding: 12, borderRadius: 6, border: "1px solid #333", maxHeight: 150, overflowY: "auto", marginBottom: 12 }}>
              {categories.map(c => (
                <label key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", cursor: "pointer", fontSize: 14 }}>
                  <input type="checkbox" checked={!!form.category_overrides[c.id]} onChange={() => toggleCategory(c.id)} style={{ accentColor: "#FFFFFF" }} />
                  <span style={{ color: "#fff" }}>{c.name}</span>
                </label>
              ))}
              {categories.length === 0 && <div style={{ color: "#666", textAlign: "center", padding: 8 }}>Yükleniyor…</div>}
            </div>
            <label style={{ display: "block", color: "#aaa", fontSize: 12, marginBottom: 8 }}>GİZLENECEK ÜRÜNLER</label>
            <div style={{ background: "#000", padding: 12, borderRadius: 6, border: "1px solid #333", maxHeight: 200, overflowY: "auto", marginBottom: 16 }}>
              {products.map(p => (
                <label key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", cursor: "pointer", fontSize: 14 }}>
                  <input type="checkbox" checked={!!form.product_overrides[p.id]} onChange={() => toggleProduct(p.id)} style={{ accentColor: "#FFFFFF" }} />
                  <span style={{ color: "#fff" }}>{p.name}</span>
                </label>
              ))}
              {products.length === 0 && <div style={{ color: "#666", textAlign: "center", padding: 8 }}>Yükleniyor…</div>}
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setShowAdd(false)} style={{ padding: "10px 20px", background: "#333", color: "#fff", border: "none", borderRadius: 6, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>İPTAL</button>
              <button onClick={save} style={{ padding: "10px 20px", background: "#FFFFFF", color: "#000", border: "none", borderRadius: 6, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>KAYDET</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
