import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase.js";
import { useAuth } from "../../contexts/AuthContext.jsx";
import Ikon from "../../components/Ikon.jsx";

const cv = "'Coolvetica','Bebas Neue',sans-serif";
const cvc = "'Coolvetica Condensed','Barlow Condensed',sans-serif";

// NOT: Bu ekran eskiden stock_items tablosunu okuyordu; o tablo hic doldurulmadi
// (0 kayit) ve personel bos liste goruyordu. Gercek stok ingredients'ta duruyor.
const alertLevel = (i) => {
  const stock = Number(i.stock_qty) || 0;
  const min = Number(i.min_stock) || 0;
  if (stock <= 0) return "out";
  if (min > 0 && stock < min * 0.5) return "critical";
  if (min > 0 && stock < min) return "low";
  return "ok";
};
const AC = { out: "#C87A6A", critical: "#C87A6A", low: "#FFFFFF", ok: "#FFFFFF" };
const AL = { out: "Tükendi", critical: "Kritik", low: "Düşük", ok: "Yeterli" };

function EntryModal({ item, onClose, onDone }) {
  const [qty, setQty] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const n = parseFloat(qty);
    if (!n || n <= 0) return;
    setSaving(true);
    const after = (Number(item.stock_qty) || 0) + n;
    const { data, error } = await supabase
      .from("ingredients").update({ stock_qty: after }).eq("id", item.id).select("id");
    setSaving(false);
    if (error) { alert("Kaydedilemedi: " + error.message); return; }
    if (!data?.length) { alert("Kaydedilemedi: bu işlem için yetkin yok."); return; }
    onDone(); onClose();
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "#000000bb", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#161616", border: "1px solid #2A2A2A", borderRadius: 16, padding: 28, width: 360, maxWidth: "92vw" }}>
        <div style={{ color: "#F0EDE8", fontFamily: cv, fontSize: 22, marginBottom: 4 }}>Stok Girişi</div>
        <div style={{ color: "#888", fontFamily: cvc, fontSize: 12, marginBottom: 20 }}>
          {item.name} · Mevcut: {Number(item.stock_qty) || 0} {item.unit}
        </div>
        <input type="number" value={qty} onChange={e => setQty(e.target.value)} placeholder={`Miktar (${item.unit})`}
          style={{ width: "100%", background: "#111", border: "1px solid #2A2A2A", borderRadius: 8, padding: "11px 14px", color: "#F0EDE8", fontFamily: cvc, fontSize: 16, marginBottom: 12 }} />
        <div style={{ color: "#888888", fontFamily: cvc, fontSize: 11, marginBottom: 18, lineHeight: 1.5 }}>
          Faturayla gelen mallar için Faturalar ekranını kullan — maliyet de oradan güncellenir.
          Burası sayım düzeltmesi ve elden alınan mallar içindir.
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "11px", background: "transparent", border: "1px solid #2A2A2A", color: "#888", borderRadius: 8, cursor: "pointer", fontFamily: cvc, fontSize: 12 }}>İptal</button>
          <button onClick={save} disabled={saving} style={{ flex: 2, padding: "11px", background: saving ? "#333" : "#FFFFFF", border: "none", color: "#000", borderRadius: 8, cursor: saving ? "wait" : "pointer", fontFamily: cv, fontSize: 16 }}>
            {saving ? "KAYDEDİLİYOR..." : "STOKA EKLE"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function StockViewPage() {
  const { staffUser } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [entry, setEntry] = useState(null);
  const [search, setSearch] = useState("");

  const load = async () => {
    const storeIds = staffUser?.store_ids?.length ? staffUser.store_ids : ["00000000-0000-0000-0000-000000000000"];
    const { data } = await supabase.from("ingredients").select("*").in("store_id", storeIds).order("name");
    setItems(data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, [staffUser?.id]);

  const alerts = items.filter(i => alertLevel(i) !== "ok");
  const filtered = items.filter(i => !search || i.name?.toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      <h1 style={{ color: "#F0EDE8", fontFamily: cv, fontSize: 28, letterSpacing: "-0.5px", margin: "0 0 16px" }}>Stok</h1>
      {alerts.length > 0 && (
        <div style={{ background: "rgba(224,90,90,0.12)", border: "1px solid #2A2A2A", borderRadius: 10, padding: "10px 16px", marginBottom: 16, display: "flex", gap: 10, alignItems: "center" }}>
          <Ikon ad="uyari" boy={15} style={{ color: "#C87A6A" }}/><span style={{ color: "#C87A6A", fontFamily: cvc, fontSize: 12 }}>{alerts.length} malzeme kritik</span>
        </div>
      )}
      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Malzeme ara..."
        style={{ width: "100%", background: "#111", border: "1px solid #2A2A2A", borderRadius: 8, padding: "10px 14px", color: "#F0EDE8", fontFamily: cvc, fontSize: 14, marginBottom: 16 }} />
      {loading && <div style={{ color: "#888", fontFamily: cvc, fontSize: 12, textAlign: "center", padding: 40 }}>Yükleniyor...</div>}
      {!loading && filtered.length === 0 && (
        <div style={{ color: "#888888", fontFamily: cvc, fontSize: 12, textAlign: "center", padding: 40 }}>
          {items.length === 0 ? "Henüz hammadde girilmemiş." : "Aramaya uyan malzeme yok."}
        </div>
      )}
      <div style={{ background: "#1E1E1E", border: "1px solid #2A2A2A", borderRadius: 12, overflow: "hidden" }}>
        {filtered.map((item, i) => {
          const lvl = alertLevel(item);
          const color = AC[lvl];
          return (
            <div key={item.id} style={{ display: "grid", gridTemplateColumns: "1.8fr 1fr 1fr .8fr", padding: "11px 16px", alignItems: "center", borderBottom: i < filtered.length - 1 ? "1px solid #2A2A2A" : "none" }}>
              <span style={{ color: "#F0EDE8", fontFamily: cvc, fontSize: 13, fontWeight: 700 }}>{item.name}</span>
              <span style={{ color: lvl !== "ok" ? "#C87A6A" : "#F0EDE8", fontFamily: cv, fontSize: 16 }}>
                {Number(item.stock_qty) || 0} {item.unit}
              </span>
              <span style={{ color: "#888", fontFamily: cvc, fontSize: 12 }}>
                {Number(item.min_stock) > 0 ? Number(item.min_stock) + " " + item.unit : "—"}
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ background: color + "22", color, fontFamily: cvc, fontSize: 10, padding: "2px 7px", borderRadius: 3 }}>{AL[lvl]}</span>
                <button onClick={() => setEntry(item)} style={{ background: "rgba(62,207,142,0.12)", border: "1px solid #FFFFFF", color: "#FFFFFF", borderRadius: 5, padding: "3px 8px", cursor: "pointer", fontFamily: cvc, fontSize: 10 }}>+</button>
              </div>
            </div>
          );
        })}
      </div>
      {entry && <EntryModal item={entry} onClose={() => setEntry(null)} onDone={load} />}
    </div>
  );
}
