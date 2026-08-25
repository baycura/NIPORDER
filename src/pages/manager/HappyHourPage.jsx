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

export default function HappyHourPage() {
  const { staffUser } = useAuth();
  const [rules, setRules] = useState([]);
  const [products, setProducts] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");     // urun arama
  const [bulkPct, setBulkPct] = useState("20"); // secililere toplu indirim
  const [form, setForm] = useState({
    name: "",
    start_time: "17:00",
    end_time: "19:00",
    days_of_week: [1, 2, 3, 4, 5, 6, 7],
    product_overrides: {},
  });

  const load = async () => {
    const [{ data: r }, { data: p }] = await Promise.all([
      supabase.from("happy_hour_rules").select("*").in("store_id", staffUser?.store_ids?.length ? staffUser.store_ids : ["00000000-0000-0000-0000-000000000000"]).order("created_at", { ascending: false }),
      supabase.from("products").select("id, name, price, store_id").in("store_id", staffUser?.store_ids?.length ? staffUser.store_ids : ["00000000-0000-0000-0000-000000000000"]).eq("is_available", true).order("name"),
    ]);
    setRules(r || []);
    setProducts(p || []);
  };
  useEffect(() => { load(); }, []);

  const toggle = async (id, val) => {
    const { error } = await supabase.from("happy_hour_rules").update({ is_active: val }).eq("id", id);
    if (error) { alert("Değiştirilemedi: " + error.message); return; }
    load();
  };

  const remove = async (id) => {
    if (!confirm("Bu kuralı silmek istediğinizden emin misiniz?")) return;
    const { error } = await supabase.from("happy_hour_rules").delete().eq("id", id);
    if (error) { alert("Silinemedi: " + error.message); return; }
    load();
  };

  const save = async () => {
    if (!form.name.trim()) return alert("Kural ismi gerekli");
    if (Object.keys(form.product_overrides).length === 0) return alert("En az bir ürün seçip yeni fiyatını yaz");
    if (!form.days_of_week.length) return alert("En az bir gün seç");
    if (!staffUser?.store_ids?.[0]) return alert("Hesabına mağaza atanmamış — yönetici ile görüş.");
    setBusy(true);
    const payload = {
      name: form.name,
      start_time: form.start_time,
      end_time: form.end_time,
      days_of_week: form.days_of_week,
      discount_pct: 0,
      product_overrides: form.product_overrides,
      store_id: staffUser?.store_ids?.[0],
      is_active: true,
    };
    const { data, error } = await supabase.from("happy_hour_rules").insert(payload).select("id");
    setBusy(false);
    if (error) return alert("Kaydedilemedi: " + error.message);
    if (!data?.length) return alert("Kaydedilemedi: bu işlem için yetkin yok.");
    setShowAdd(false);
    setForm({ name: "", start_time: "17:00", end_time: "19:00", days_of_week: [1, 2, 3, 4, 5, 6, 7], product_overrides: {} });
    load();
  };

  const toggleDay = (idx) => {
    const d = form.days_of_week.includes(idx) ? form.days_of_week.filter(x => x !== idx) : [...form.days_of_week, idx];
    setForm({ ...form, days_of_week: d });
  };

  // Secili urunlere yuzde indirim uygula (fiyatlari tek tek yazmaya gerek kalmasin)
  const applyBulkPct = () => {
    const pct = Number(bulkPct);
    if (!pct || pct <= 0 || pct >= 100) { alert("1-99 arasi bir yüzde gir"); return; }
    const po = { ...form.product_overrides };
    const ids = Object.keys(po);
    if (!ids.length) { alert("Önce ürünleri işaretle"); return; }
    ids.forEach(pid => {
      const prod = products.find(x => x.id === pid);
      if (prod) po[pid] = Math.round(Number(prod.price) * (100 - pct) / 100);
    });
    setForm({ ...form, product_overrides: po });
  };

  const selectAllFiltered = (list) => {
    const po = { ...form.product_overrides };
    list.forEach(p => { if (po[p.id] == null) po[p.id] = Math.round(Number(p.price)); });
    setForm({ ...form, product_overrides: po });
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

  const selectedCount = Object.keys(form.product_overrides).length;
  const canSave = !!form.name.trim() && selectedCount > 0 && form.days_of_week.length > 0;
  const q = search.trim().toLocaleLowerCase("tr");
  const shownProducts = q ? products.filter(p => String(p.name).toLocaleLowerCase("tr").includes(q)) : products;

  return (
    <div style={{ fontFamily: cv, color: "#F0EDE8" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>🎉 Happy Hour</h1>
          <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>Seçilen gün ve saatlerde işaretli ürünlerin fiyatı otomatik düşer; saat bitince normale döner.</div>
        </div>
        <button onClick={() => setShowAdd(true)} style={{ padding: "12px 20px", background: "#FFFFFF", color: "#000", border: "none", fontWeight: 800, fontSize: 13, cursor: "pointer", borderRadius: 8 }}>+ YENİ KURAL</button>
      </div>

      {rules.length === 0 && <div style={{ color: "#888", marginTop: 32, textAlign: "center" }}>Henüz kural yok. Yukarıdan yeni kural ekleyin.</div>}

      {rules.map(r => {
        const productCount = Object.keys(r.product_overrides || {}).length;
        return (
          <div key={r.id} style={{ background: "#111", padding: 16, marginBottom: 12, borderRadius: 8, border: "1px solid #333" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{r.name}</div>
                <div style={{ color: "#888", fontSize: 13, marginTop: 4 }}>
                  {r.start_time?.slice(0, 5)} - {r.end_time?.slice(0, 5)} | {r.days_of_week?.map(d => DAYS.find(x => x.idx === d)?.label).join(", ")}
                </div>
                <div style={{ color: "#FFFFFF", fontSize: 13, marginTop: 4 }}>{productCount} üründe özel fiyat</div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => toggle(r.id, !r.is_active)} style={{ padding: "8px 16px", background: r.is_active ? "#8A8580" : "#444", color: "#fff", border: "none", borderRadius: 6, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>{r.is_active ? "AKTİF" : "PASİF"}</button>
                <button onClick={() => remove(r.id)} style={{ padding: "8px 16px", background: "#2A2A2A", color: "#fff", border: "none", borderRadius: 6, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>Sil</button>
              </div>
            </div>
          </div>
        );
      })}

      {showAdd && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "flex-start", justifyContent: "center", overflowY: "auto", zIndex: 100, padding: 24 }}>
          <div style={{ background: "#111", padding: 24, borderRadius: 12, width: "100%", maxWidth: 700, border: "1px solid #333" }}>
            <h2 style={{ fontWeight: 800, fontSize: 20, margin: "0 0 16px 0" }}>Yeni happy hour</h2>
            <label style={{ display: "block", color: "#aaa", fontSize: 12, marginBottom: 4 }}>İsim</label>
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Örn: Akşam Kokteyl Saati" style={{ width: "100%", padding: 10, background: "#000", color: "#fff", border: "1px solid #333", borderRadius: 6, marginBottom: 12 }} />
            <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: "block", color: "#aaa", fontSize: 12, marginBottom: 4 }}>Başlangıç</label>
                <input type="time" value={form.start_time} onChange={e => setForm({ ...form, start_time: e.target.value })} style={{ width: "100%", padding: 10, background: "#000", color: "#fff", border: "1px solid #333", borderRadius: 6 }} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: "block", color: "#aaa", fontSize: 12, marginBottom: 4 }}>Bitiş</label>
                <input type="time" value={form.end_time} onChange={e => setForm({ ...form, end_time: e.target.value })} style={{ width: "100%", padding: 10, background: "#000", color: "#fff", border: "1px solid #333", borderRadius: 6 }} />
              </div>
            </div>
            <label style={{ display: "block", color: "#aaa", fontSize: 12, marginBottom: 4 }}>Günler</label>
            <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
              {DAYS.map(d => (
                <button key={d.idx} onClick={() => toggleDay(d.idx)} style={{ padding: "8px 12px", background: form.days_of_week.includes(d.idx) ? "#FFFFFF" : "#222", color: form.days_of_week.includes(d.idx) ? "#000" : "#aaa", border: "none", borderRadius: 6, fontWeight: 700, fontSize: 12, cursor: "pointer", minWidth: 50 }}>{d.label}</button>
              ))}
            </div>
            <label style={{ display: "block", color: "#aaa", fontSize: 12, marginBottom: 8 }}>
              ÜRÜNLER VE YENİ FİYATLAR
              <span style={{ color: selectedCount > 0 ? "#FFFFFF" : "#2A2A2A", fontWeight: 800, marginLeft: 8 }}>
                {selectedCount > 0 ? selectedCount + " ürün seçildi" : "henüz ürün seçmedin"}
              </span>
            </label>
            <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Ürün ara"
                style={{ flex: 1, minWidth: 140, padding: 9, background: "#000", color: "#fff", border: "1px solid #333", borderRadius: 6 }} />
              <input type="number" value={bulkPct} onChange={e => setBulkPct(e.target.value)}
                style={{ width: 60, padding: 9, background: "#000", color: "#FFFFFF", border: "1px solid #333", borderRadius: 6, fontWeight: 700 }} />
              <button onClick={applyBulkPct} style={{ padding: "9px 12px", background: "#222", color: "#FFFFFF", border: "1px solid #333", borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>% indir</button>
              <button onClick={() => selectAllFiltered(shownProducts)} style={{ padding: "9px 12px", background: "#222", color: "#aaa", border: "1px solid #333", borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Tümünü seç</button>
            </div>
            <div style={{ background: "#000", padding: 12, borderRadius: 6, border: "1px solid #333", maxHeight: 300, overflowY: "auto", marginBottom: 16 }}>
              {shownProducts.map(p => {
                const newPrice = form.product_overrides[p.id];
                const isSelected = newPrice != null;
                return (
                  <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid #222" }}>
                    <input type="checkbox" checked={isSelected} onChange={e => setProductPrice(p.id, p.price, e.target.checked ? Math.round(p.price) : "")} style={{ accentColor: "#FFFFFF" }} />
                    <div style={{ flex: 1, fontSize: 14 }}>
                      <span style={{ color: "#fff" }}>{p.name}</span>
                      <span style={{ color: "#888888", fontSize: 12, marginLeft: 8 }}>(₺{Math.round(p.price)})</span>
                    </div>
                    {isSelected && (
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <span style={{ color: "#aaa", fontSize: 12 }}>₺</span>
                        <input type="number" value={newPrice} onChange={e => setProductPrice(p.id, p.price, e.target.value)} style={{ width: 70, padding: 6, background: "#111", color: "#FFFFFF", border: "1px solid #FFFFFF", borderRadius: 4, fontWeight: 700, fontSize: 14 }} />
                      </div>
                    )}
                  </div>
                );
              })}
              {shownProducts.length === 0 && <div style={{ color: "#888888", textAlign: "center", padding: 16 }}>{products.length === 0 ? "Ürün yükleniyor…" : "Aramaya uyan ürün yok"}</div>}
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setShowAdd(false)} style={{ padding: "10px 20px", background: "#333", color: "#fff", border: "none", borderRadius: 6, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>İptal</button>
              <button onClick={save} disabled={!canSave || busy}
                title={canSave ? "" : "İsim yaz ve en az bir ürün seç"}
                style={{ padding: "10px 20px", background: canSave ? "#FFFFFF" : "#3a3a3a", color: canSave ? "#000" : "#888", border: "none", borderRadius: 6, fontWeight: 700, fontSize: 12, cursor: canSave ? "pointer" : "not-allowed", opacity: busy ? 0.6 : 1 }}>
                {busy ? "KAYDEDİLİYOR…" : "KAYDET"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
