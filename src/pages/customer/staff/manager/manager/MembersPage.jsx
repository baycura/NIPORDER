import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase.js";

const cv  = "'Coolvetica','Bebas Neue',sans-serif";
const cvc = "'Coolvetica Condensed','Barlow Condensed',sans-serif";

const tierColor = { bronze:"#CD7F32", silver:"#9CA3AF", gold:"#C8973E", platinum:"#5A8FE0" };

function calcTier(pts) {
  if (pts >= 500) return "platinum";
  if (pts >= 250) return "gold";
  if (pts >= 100) return "silver";
  return "bronze";
}

export default function MembersPage() {
  const [members,  setMembers]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState("");
  const [showAdd,  setShowAdd]  = useState(false);
  const [editId,   setEditId]   = useState(null);
  const [editDisc, setEditDisc] = useState("");
  const [form,     setForm]     = useState({ name:"", phone:"", email:"" });
  const [saving,   setSaving]   = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from("customers")
      .select("*")
      .order("total_spent", { ascending:false });
    setMembers(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!form.name) return;
    setSaving(true);
    await supabase.from("customers").insert({
      name: form.name,
      phone: form.phone || null,
      email: form.email || null,
      tier: "bronze", points:0, total_spent:0, visit_count:0,
    });
    setSaving(false);
    setShowAdd(false);
    setForm({ name:"", phone:"", email:"" });
    load();
  };

  const saveDiscount = async (id) => {
    await supabase.from("customers")
      .update({ admin_discount: editDisc === "" ? null : +editDisc })
      .eq("id", id);
    setEditId(null);
    load();
  };

  const filtered = members.filter(m =>
    !search ||
    m.name?.toLowerCase().includes(search.toLowerCase()) ||
    m.phone?.includes(search) ||
    m.email?.includes(search)
  );

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between",
        alignItems:"center", marginBottom:20 }}>
        <h1 style={{ color:"#F0EDE8", fontFamily:cv, fontSize:28,
          letterSpacing:"-0.5px", margin:0 }}>Üye Yönetimi</h1>
        <button onClick={() => setShowAdd(true)}
          style={{ padding:"9px 16px", background:"#C8973E", border:"none",
            color:"#000", fontFamily:cvc, fontSize:12,
            letterSpacing:"1px", cursor:"pointer", borderRadius:8 }}>
          + ÜYE EKLE
        </button>
      </div>

      {/* Stats */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)",
        gap:10, marginBottom:20 }}>
        {[
          ["TOPLAM ÜYE", members.length, "👥"],
          ["GOLD+", members.filter(m =>
            ["gold","platinum"].includes(calcTier(m.points||0))).length, "⭐"],
          ["ORT. HARCAMA",
            `₺${Math.round(members.reduce((s,m)=>s+(m.total_spent||0),0)
              /(members.length||1)).toLocaleString()}`, "💰"],
        ].map(([lbl,val,icon]) => (
          <div key={lbl} style={{ background:"#1E1E1E",
            border:"1px solid #2A2A2A", borderRadius:10, padding:14,
            display:"flex", gap:10, alignItems:"center" }}>
            <span style={{ fontSize:22 }}>{icon}</span>
            <div>
              <div style={{ color:"#888", fontFamily:cvc,
                fontSize:10, letterSpacing:"1px" }}>{lbl}</div>
              <div style={{ color:"#F0EDE8", fontFamily:cv,
                fontSize:20 }}>{val}</div>
            </div>
          </div>
        ))}
      </div>

      <input value={search} onChange={e => setSearch(e.target.value)}
        placeholder="İsim, telefon veya e-posta ara..."
        style={{ width:"100%", background:"#111", border:"1px solid #2A2A2A",
          borderRadius:8, padding:"10px 14px", color:"#F0EDE8",
          fontFamily:cvc, fontSize:14, marginBottom:16 }}/>

      {loading && (
        <div style={{ color:"#888", fontFamily:cvc, fontSize:12,
          textAlign:"center", padding:40 }}>YÜKLENİYOR...</div>
      )}

      <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:12 }}>
        {filtered.map(m => {
          const tier  = calcTier(m.points || 0);
          const color = tierColor[tier] || "#888";
          const disc  = m.admin_discount ??
            { bronze:0, silver:5, gold:10, platinum:15 }[tier];
          return (
            <div key={m.id} style={{ background:"#1E1E1E",
              border:"1px solid #2A2A2A",
              borderLeft:`3px solid ${color}`,
              borderRadius:12, padding:16 }}>
              <div style={{ display:"flex", justifyContent:"space-between",
                alignItems:"flex-start", marginBottom:12 }}>
                <div>
                  <div style={{ color:"#F0EDE8", fontFamily:cv,
                    fontSize:20, letterSpacing:"-0.3px" }}>{m.name}</div>
                  <div style={{ color:"#888", fontFamily:cvc,
                    fontSize:11, marginTop:2 }}>
                    {m.phone || m.email || "—"}
                  </div>
                </div>
                <span style={{ background:color+"22", color,
                  fontFamily:cvc, fontSize:9, letterSpacing:"1.5px",
                  padding:"3px 8px", borderRadius:3 }}>
                  {tier.toUpperCase()}
                </span>
              </div>

              <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)",
                gap:8, marginBottom:12 }}>
                {[
                  ["Puan",    m.points||0,                                     "⭐"],
                  ["Harcama", `₺${Math.round((m.total_spent||0)/1000)}k`,      "💰"],
                  ["Ziyaret", m.visit_count||0,                                "👥"],
                ].map(([l,v,icon]) => (
                  <div key={l} style={{ background:"#111", borderRadius:8,
                    padding:"8px", textAlign:"center" }}>
                    <div style={{ fontSize:14 }}>{icon}</div>
                    <div style={{ color:"#F0EDE8", fontFamily:cv, fontSize:18 }}>{v}</div>
                    <div style={{ color:"#888", fontFamily:cvc, fontSize:10 }}>{l}</div>
                  </div>
                ))}
              </div>

              {/* Discount editor */}
              <div style={{ borderTop:"1px solid #2A2A2A", paddingTop:10 }}>
                {editId === m.id ? (
                  <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                    <span style={{ color:"#888", fontFamily:cvc, fontSize:11 }}>%</span>
                    <input type="number" value={editDisc}
                      onChange={e => setEditDisc(e.target.value)}
                      style={{ width:60, background:"#111",
                        border:"1px solid #2A2A2A", borderRadius:6,
                        padding:"4px 8px", color:"#F0EDE8",
                        fontFamily:cvc, fontSize:13 }}/>
                    <button onClick={() => saveDiscount(m.id)}
                      style={{ background:"#3ECF8E", border:"none",
                        color:"#000", padding:"4px 10px",
                        borderRadius:5, cursor:"pointer",
                        fontFamily:cvc, fontSize:10 }}>✓</button>
                    <button onClick={() => setEditId(null)}
                      style={{ background:"none", border:"none",
                        color:"#444", cursor:"pointer" }}>✕</button>
                  </div>
                ) : (
                  <div style={{ display:"flex", justifyContent:"space-between",
                    alignItems:"center" }}>
                    <span style={{ color:"#888", fontFamily:cvc, fontSize:11 }}>
                      {m.admin_discount != null ? "Özel indirim" : "Tier indirimi"}:{" "}
                      <span style={{ color:"#C8973E", fontWeight:700 }}>%{disc​​​​​​​​​​​​​​​​
