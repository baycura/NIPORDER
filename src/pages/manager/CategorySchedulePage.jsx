import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase.js";

const cv = "'Coolvetica','Bebas Neue',sans-serif";
const cvc = "'Coolvetica Condensed','Barlow Condensed',sans-serif";

const PARIS_STORE_UUID = "c3c6e0c7-1821-4edd-993d-ad960cfbc452";

const DAYS = [
  { idx: 1, label: "Pzt" },
  { idx: 2, label: "Sal" },
  { idx: 3, label: "Çar" },
  { idx: 4, label: "Per" },
  { idx: 5, label: "Cum" },
  { idx: 6, label: "Cmt" },
  { idx: 0, label: "Paz" },
];

export default function CategorySchedulePage() {
  const [rules, setRules] = useState([]);
  const [categories, setCategories] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    name: "",
    start_time: "06:00",
    end_time: "22:00",
    days_of_week: [0, 1, 2, 3, 4, 5, 6],
  });
  const [selCats, setSelCats] = useState([]);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const [{ data: r }, { data: c }] = await Promise.all([
      supabase.from("category_schedule_rules").select("*").eq("store_id", PARIS_STORE_UUID).order("priority", { ascending: false }),
      supabase.from("categories").select("*").eq("is_active", true).eq("store_id", PARIS_STORE_UUID).order("sort_order"),
    ]);
    setRules(r || []);
    setCategories(c || []);
  };

  useEffect(() => { load(); }, []);

  const toggle = async (id, val) => {
    await supabase.from("category_schedule_rules").update({ is_active: val }).eq("id", id);
    load();
  };

  const del = async (id) => {
    if (!confirm("Bu kuralı silmek istediğinizden emin misiniz?")) return;
    await supabase.from("category_schedule_rules").delete().eq("id", id);
    load();
  };

  const save = async () => {
    if (!form.name || !form.days_of_week.length || !selCats.length) return;
    setSaving(true);
    const overrides = {};
    selCats.forEach((cid) => { overrides[cid] = true; });
    await supabase.from("category_schedule_rules").insert({
      name: form.name,
      start_time: form.start_time,
      end_time: form.end_time,
      days_of_week: form.days_of_week,
      category_overrides: overrides,
      is_active: true,
      store_id: PARIS_STORE_UUID,
      priority: 0,
    });
    setSaving(false);
    setShowAdd(false);
    setForm({ name: "", start_time: "06:00", end_time: "22:00", days_of_week: [0, 1, 2, 3, 4, 5, 6] });
    setSelCats([]);
    load();
  };

  const isLive = (r) => {
    if (!r.is_active) return false;
    const now = new Date();
    const dow = now.getDay();
    if (!r.days_of_week?.includes(dow)) return false;
    const m = now.getHours() * 60 + now.getMinutes();
    const [sh, sm] = (r.start_time || "00:00").split(":").map(Number);
    const [eh, em] = (r.end_time || "00:00").split(":").map(Number);
    const s = sh * 60 + sm;
    const e = eh * 60 + em;
    if (s <= e) return m >= s && m < e;
    return m >= s || m < e;
  };

  const dayLabel = (arr) => {
    if (!arr || !arr.length) return "—";
    if (arr.length === 7) return "Her gün";
    return DAYS.filter((d) => arr.includes(d.idx)).map((d) => d.label).join(", ");
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h1 style={{ color: "#F0EDE8", fontFamily: cv, fontSize: 28, letterSpacing: "-0.5px", margin: 0 }}>Kategori Saatleri</h1>
        <button onClick={() => setShowAdd(true)} style={{ padding: "9px 16px", background: "#C8973E", border: "none", color: "#000", fontFamily: cvc, fontSize: 12, letterSpacing: "1px", cursor: "pointer", borderRadius: 8 }}>+ YENİ KURAL</button>
      </div>
      <div style={{ color: "#666", fontSize: 12, marginBottom: 18, fontFamily: cvc, letterSpacing: "0.5px" }}>
        Kural aktifken belirtilen gün ve saatlerde seçili kategoriler menüde GİZLENİR.
      </div>
      {rules.length === 0 && (
        <div style={{ color: "#666", textAlign: "center", padding: 40, fontFamily: cvc, fontSize: 14 }}>
          Henüz kural eklenmemiş. "+ YENİ KURAL" ile ekleyebilirsin.
        </div>
      )}
      {rules.map((rule) => {
        const live = isLive(rule);
        const hiddenCats = Object.keys(rule.category_overrides || {});
        const catNames = hiddenCats.map((cid) => categories.find((c) => c.id === cid)?.name).filter(Boolean);
        return (
          <div key={rule.id} style={{ background: live ? "rgba(224,122,62,0.12)" : "#1E1E1E", border: `1px solid ${live ? "#E07A3E" : "#2A2A2A"}`, borderRadius: 12, padding: 18, marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                  <div style={{ color: "#F0EDE8", fontFamily: cv, fontSize: 20 }}>{rule.name}</div>
                  {live && (<span style={{ background: "rgba(224,122,62,0.18)", color: "#E07A3E", fontFamily: cvc, fontSize: 9, letterSpacing: "1.5px", padding: "2px 8px", borderRadius: 3 }}>● ŞU AN GİZLİ</span>)}
                </div>
                <div style={{ color: "#888", fontFamily: cvc, fontSize: 12 }}>
                  {rule.start_time?.slice(0, 5)} – {rule.end_time?.slice(0, 5)} · {dayLabel(rule.days_of_week)}
                </div>
              </div>
              <div onClick={() => toggle(rule.id, !rule.is_active)} style={{ width: 44, height: 24, borderRadius: 12, cursor: "pointer", background: rule.is_active ? "#C8973E" : "#333", position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
                <div style={{ width: 16, height: 16, borderRadius: "50%", background: "#fff", position: "absolute", top: 4, left: rule.is_active ? 24 : 4, transition: "left 0.2s" }} />
              </div>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
              {catNames.map((n) => (<span key={n} style={{ background: "#ffffff11", color: "#888", fontFamily: cvc, fontSize: 10, padding: "2px 8px", borderRadius: 3 }}>{n}</span>))}
            </div>
            <button onClick={() => del(rule.id)} style={{ padding: "5px 12px", background: "transparent", border: "1px solid #333", color: "#444", fontFamily: cvc, fontSize: 10, cursor: "pointer", borderRadius: 6 }}>SİL</button>
          </div>
        );
      })}

      {showAdd && (
        <div onClick={() => setShowAdd(false)} style={{ position: "fixed", inset: 0, background: "#000000bb", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#161616", border: "1px solid #2A2A2A", borderRadius: 16, padding: 28, width: 480, maxWidth: "100%", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ color: "#F0EDE8", fontFamily: cv, fontSize: 22, marginBottom: 20 }}>Yeni Kural</div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ color: "#888", fontFamily: cvc, fontSize: 10, letterSpacing: "2px", marginBottom: 5 }}>KURAL ADI</div>
              <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Gündüz Nights gizle" style={{ width: "100%", background: "#111", border: "1px solid #2A2A2A", borderRadius: 8, padding: "10px 12px", color: "#F0EDE8", fontFamily: cvc, fontSize: 14, boxSizing: "border-box" }} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
              {[["BAŞLANGIÇ", "start_time"], ["BİTİŞ", "end_time"]].map(([l, k]) => (
                <div key={k}>
                  <div style={{ color: "#888", fontFamily: cvc, fontSize: 10, letterSpacing: "2px", marginBottom: 5 }}>{l}</div>
                  <input type="time" value={form[k]} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} style={{ width: "100%", background: "#111", border: "1px solid #2A2A2A", borderRadius: 8, padding: "10px 12px", color: "#F0EDE8", fontFamily: cvc, fontSize: 14, boxSizing: "border-box" }} />
                </div>
              ))}
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ color: "#888", fontFamily: cvc, fontSize: 10, letterSpacing: "2px", marginBottom: 8 }}>GÜNLER</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {DAYS.map((d) => {
                  const sel = form.days_of_week.includes(d.idx);
                  return (<button key={d.idx} onClick={() => setForm((f) => ({ ...f, days_of_week: sel ? f.days_of_week.filter((x) => x !== d.idx) : [...f.days_of_week, d.idx] }))} style={{ padding: "6px 12px", border: `2px solid ${sel ? "#C8973E" : "#2A2A2A"}`, background: sel ? "rgba(200,151,62,0.12)" : "transparent", color: sel ? "#C8973E" : "#888", fontFamily: cvc, fontSize: 11, cursor: "pointer", borderRadius: 6, minWidth: 48 }}>{d.label}</button>);
                })}
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <div style={{ color: "#888", fontFamily: cvc, fontSize: 10, letterSpacing: "2px", marginBottom: 8 }}>GİZLENECEK KATEGORİLER</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {categories.map((cat) => {
                  const sel = selCats.includes(cat.id);
                  return (<button key={cat.id} onClick={() => setSelCats((p) => (sel ? p.filter((x) => x !== cat.id) : [...p, cat.id]))} style={{ padding: "6px 14px", border: `2px solid ${sel ? "#E07A3E" : "#2A2A2A"}`, background: sel ? "rgba(224,122,62,0.12)" : "transparent", color: sel ? "#E07A3E" : "#888", fontFamily: cvc, fontSize: 11, cursor: "pointer", borderRadius: 6 }}>{cat.name}</button>);
                })}
              </div>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowAdd(false)} style={{ flex: 1, padding: "11px", background: "transparent", border: "1px solid #2A2A2A", color: "#888", borderRadius: 8, cursor: "pointer", fontFamily: cvc, fontSize: 12 }}>İptal</button>
              <button onClick={save} disabled={saving || !form.name || !selCats.length || !form.days_of_week.length} style={{ flex: 2, padding: "11px", background: saving || !form.name || !selCats.length || !form.days_of_week.length ? "#333" : "#C8973E", border: "none", color: "#000", borderRadius: 8, cursor: "pointer", fontFamily: cv, fontSize: 16 }}>{saving ? "KAYDEDİLİYOR..." : "KAYDET"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
