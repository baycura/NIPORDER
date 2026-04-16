import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase.js";
import { useAuth } from "../../contexts/AuthContext.jsx";

const cv  = "'Coolvetica','Bebas Neue',sans-serif";
const cvc = "'Coolvetica Condensed','Barlow Condensed',sans-serif";

function alertLevel(item) {
  if (item.current_stock <= 0) return "out";
  if (item.current_stock < item.min_stock * 0.5) return "critical";
  if (item.current_stock < item.min_stock) return "low";
  return "ok";
}
const alertColor = { out:"#E05A5A", critical:"#E05A5A", low:"#E07A3E", ok:"#3ECF8E" };
const alertLabel = { out:"Tükendi", critical:"Kritik", low:"Düşük", ok:"Yeterli" };

function EntryModal({ item, staffId, onClose, onDone }) {
  const [qty,    setQty]    = useState("");
  const [note,   setNote]   = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const n = parseFloat(qty);
    if (!n || n <= 0) return;
    setSaving(true);
    const before = item.current_stock;
    const after  = before + n;
    await supabase.from("stock_movements").insert({
      stock_item_id: item.id, type:"in", quantity:n,
      before_stock:before, after_stock:after,
      note: note || "Stok girişi", staff_id:staffId,
    });
    await supabase.from("stock_items")
      .update({ current_stock:after, updated_at:new Date() })
      .eq("id", item.id);
    setSaving(false);
    onDone();
    onClose();
  };

  return (
    <div onClick={onClose} style={{ position:"fixed", inset:0,
      background:"#000000bb", zIndex:300,
      display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div onClick={e => e.stopPropagation()} style={{ background:"#161616",
        border:"1px solid #2A2A2A", borderRadius:16, padding:28, width:360 }}>
        <div style={{ color:"#F0EDE8", fontFamily:cv, fontSize:22,
          marginBottom:4 }}>Stok Girişi</div>
        <div style={{ color:"#888", fontFamily:cvc, fontSize:12, marginBottom:20 }}>
          {item.name} · Mevcut: {item.current_stock} {item.unit}
        </div>
        <input type="number" value={qty} onChange={e => setQty(e.target.value)}
          placeholder={`Miktar (${item.unit})`}
          style={{ width:"100%", background:"#111", border:"1px solid #2A2A2A",
            borderRadius:8, padding:"11px 14px", color:"#F0EDE8",
            fontFamily:cvc, fontSize:16, marginBottom:12 }} />
        <input value={note} onChange={e => setNote(e.target.value)}
          placeholder="Not (opsiyonel)"
          style={{ width:"100%", background:"#111", border:"1px solid #2A2A2A",
            borderRadius:8, padding:"10px 14px", color:"#F0EDE8",
            fontFamily:cvc, fontSize:14, marginBottom:20 }} />
        <div style={{ display:"flex", gap:10 }}>
          <button onClick={onClose}
            style={{ flex:1, padding:"11px", background:"transparent",
              border:"1px solid #2A2A2A", color:"#888", borderRadius:8,
              cursor:"pointer", fontFamily:cvc, fontSize:12 }}>İptal</button>
          <button onClick={handleSave} disabled={saving}
            style={{ flex:2, padding:"11px",
              background: saving ? "#333" : "#3ECF8E",
              border:"none", color:"#000", borderRadius:8,
              cursor:"pointer", fontFamily:cv, fontSize:16 }}>
            {saving ? "KAYDEDİLİYOR..." : "STOKA EKLE ✓"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function StockViewPage() {
  const { staffUser } = useAuth();
  const [items,   setItems]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [entry,   setEntry]   = useState(null);
  const [search,  setSearch]  = useState("");

  const load = async () => {
    const { data } = await supabase
      .from("stock_items")
      .select("*")
      .order("name");
    setItems(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const alerts  = items.filter(i => alertLevel(i) !== "ok");
  const filtered = items.filter(i =>
    !search || i.name?.toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between",
        alignItems:"center", marginBottom:16 }}>
        <h1 style={{ color:"#F0EDE8", fontFamily:cv, fontSize:28,
          letterSpacing:"-0.5px", margin:0 }}>Stok</h1>
      </div>

      {alerts.length > 0 && (
        <div style={{ background:"rgba(224,90,90,0.12)",
          border:"1px solid #E05A5A", borderRadius:10,
          padding:"10px 16px", marginBottom:16,
          display:"flex", gap:10, alignItems:"center" }}>
          <span>⚠️</span>
          <span style={{ color:"#E05A5A", fontFamily:cvc, fontSize:12 }}>
            {alerts.length} ürün kritik: {alerts.map(a => a.name).join(", ")}
          </span>
        </div>
      )}

      <input value={search} onChange={e => setSearch(e.target.value)}
        placeholder="Ürün ara..."
        style={{ width:"100%", background:"#111", border:"1px solid #2A2A2A",
          borderRadius:8, padding:"10px 14px", color:"#F0EDE8",
          fontFamily:cvc, fontSize:14, marginBottom:16 }} />

      {loading && (
        <div style={{ color:"#888", fontFamily:cvc, fontSize:12,
          textAlign:"center", padding:40 }}>YÜKLENİYOR...</div>
      )}

      <div style={{ background:"#1E1E1E", border:"1px solid #2A2A2A",
        borderRadius:12, overflow:"hidden" }}>
        <div style={{ display:"grid",
          gridTemplateColumns:"1.8fr 1fr 1fr .8fr",
          padding:"10px 16px", borderBottom:"1px solid #2A2A2A" }}>
          {["Ürün","Mevcut","Min","Durum"].map(h => (
            <span key={h} style={{ color:"#444", fontFamily:cvc,
              fontSize:10, letterSpacing:"1px", textTransform:"uppercase" }}>{h}</span>
          ))}
        </div>
        {filtered.map((item, i) => {
          const lvl   = alertLevel(item);
          const color = alertColor[lvl];
          return (
            <div key={item.id} style={{ display:"grid",
              gridTemplateColumns:"1.8fr 1fr 1fr .8fr",
              padding:"11px 16px", alignItems:"center",
              borderBottom: i < filtered.length-1 ? "1px solid #2A2A2A" : "none",
              background: lvl==="critical"||lvl==="out"
                ? "rgba(224,90,90,0.08)" : "transparent" }}>
              <span style={{ color:"#F0EDE8", fontFamily:cvc,
                fontSize:13, fontWeight:700 }}>{item.name}</span>
              <span style={{ color: lvl!=="ok" ? "#E05A5A" : "#F0EDE8",
                fontFamily:cv, fontSize:16 }}>
                {item.current_stock} {item.unit}
              </span>
              <span style={{ color:"#888", fontFamily:cvc, fontSize:12 }}>
                {item.min_stock} {item.unit}
              </span>
              <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                <span style={{ background:color+"22", color,
                  fontFamily:cvc, fontSize:10, padding:"2px 7px",
                  borderRadius:3 }}>{alertLabel[lvl]}</span>
                <button onClick={() => setEntry(item)}
                  style={{ background:"rgba(62,207,142,0.12)",
                    border:"1px solid #3ECF8E", color:"#3ECF8E",
                    borderRadius:5, padding:"3px 8px", cursor:"pointer",
                    fontFamily:cvc, fontSize:10 }}>+</button>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && !loading && (
          <div style={{ color:"#888", fontFamily:cvc, fontSize:12,
            textAlign:"center", padding:24 }}>Ürün bulunamadı</div>
        )}
      </div>

      {entry && (
        <EntryModal item={entry} staffId={staffUser?.id}
          onClose={() => setEntry(null)} onDone={load} />
      )}
    </div>
  );
}
