import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase.js";

const cv  = "'Coolvetica','Bebas Neue',sans-serif";
const cvc = "'Coolvetica Condensed','Barlow Condensed',sans-serif";

export default function HappyHourPage() {
  const [rules,      setRules]      = useState([]);
  const [categories, setCategories] = useState([]);
  const [showAdd,    setShowAdd]    = useState(false);
  const [form,       setForm]       = useState({
    name:"", start_time:"17:00", end_time:"19:00", discount_pct:20,
  });
  const [selCats, setSelCats] = useState([]);
  const [saving,  setSaving]  = useState(false);

  const load = async () => {
    const [{ data:r }, { data:c }] = await Promise.all([
      supabase.from("happy_hour_rules")
        .select("*, happy_hour_categories(category_id, categories(name))")
        .order("start_time"),
      supabase.from("categories").select("*").eq("is_active", true),
    ]);
    setRules(r || []);
    setCategories(c || []);
  };

  useEffect(() => { load(); }, []);

  const toggle = async (id, val) => {
    await supabase.from("happy_hour_rules")
      .update({ is_active: val }).eq("id", id);
    load();
  };

  const handleDelete = async (id) => {
    if (!confirm("Silmek istediğinizden emin misiniz?")) return;
    await supabase.from("happy_hour_rules").delete().eq("id", id);
    load();
  };

  const handleSave = async () => {
    if (!form.name) return;
    setSaving(true);
    const { data: rule } = await supabase
      .from("happy_hour_rules")
      .insert({
        name: form.name,
        start_time: form.start_time,
        end_time: form.end_time,
        discount_pct: +form.discount_pct,
        is_active: true,
      }).select().single();
    if (selCats.length && rule) {
      await supabase.from("happy_hour_categories").insert(
        selCats.map(cid => ({ rule_id: rule.id, category_id: cid }))
      );
    }
    setSaving(false);
    setShowAdd(false);
    setForm({ name:"", start_time:"17:00", end_time:"19:00", discount_pct:20 });
    setSelCats([]);
    load();
  };

  const isLive = (rule) => {
    if (!rule.is_active) return false;
    const now  = new Date();
    const mins = now.getHours() * 60 + now.getMinutes();
    const s    = rule.start_time?.split(":").reduce((a,v,i)=>a+(i===0?+v*60:+v),0);
    const e    = rule.end_time?.split(":").reduce((a,v,i)=>a+(i===0?+v*60:+v),0);
    return mins >= s && mins < e;
  };

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between",
        alignItems:"center", marginBottom:24 }}>
        <h1 style={{ color:"#F0EDE8", fontFamily:cv, fontSize:28,
          letterSpacing:"-0.5px", margin:0 }}>Happy Hour</h1>
        <button onClick={() => setShowAdd(true)}
          style={{ padding:"9px 16px", background:"#C8973E", border:"none",
            color:"#000", fontFamily:cvc, fontSize:12,
            letterSpacing:"1px", cursor:"pointer", borderRadius:8 }}>
          + YENİ KURAL
        </button>
      </div>

      {rules.length === 0 && (
        <div style={{ color:"#888", fontFamily:cvc, fontSize:12,
          textAlign:"center", padding:40 }}>Henüz kural yok</div>
      )}

      {rules.map(rule => {
        const live = isLive(rule);
        const cats = rule.happy_hour_categories
          ?.map(hc => hc.categories?.name).filter(Boolean) || [];
        return (
          <div key={rule.id} style={{
            background: live ? "rgba(200,151,62,0.12)" : "#1E1E1E",
            border:`1px solid ${live ? "#C8973E" : "#2A2A2A"}`,
            borderRadius:12, padding:18, marginBottom:12 }}>
            <div style={{ display:"flex", justifyContent:"space-between",
              alignItems:"flex-start", marginBottom:12 }}>
              <div>
                <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:4 }}>
                  <div style={{ color:"#F0EDE8", fontFamily:cv, fontSize:20 }}>
                    {rule.name}
                  </div>
                  {live && (
                    <span style={{ background:"rgba(62,207,142,0.12)",
                      color:"#3ECF8E", fontFamily:cvc, fontSize:9,
                      letterSpacing:"1.5px", padding:"2px 8px", borderRadius:3 }}>
                      ● CANLI
                    </span>
                  )}
                </div>
                <div style={{ color:"#888", fontFamily:cvc, fontSize:12 }}>
                  {rule.start_time?.slice(0,5)} – {rule.end_time?.slice(0,5)}
                  {" · "}%{rule.discount_pct} indirim
                </div>
              </div>
              <div onClick={() => toggle(rule.id, !rule.is_active)}
                style={{ width:44, height:24, borderRadius:12, cursor:"pointer",
                  background: rule.is_active ? "#C8973E" : "#333",
                  position:"relative", transition:"background 0.2s", flexShrink:0 }}>
                <div style={{ width:16, height:16, borderRadius:"50%",
                  background:"#fff", position:"absolute", top:4,
                  left: rule.is_active ? 24 : 4, transition:"left 0.2s" }}/>
              </div>
            </div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:12 }}>
              {cats.map(name => (
                <span key={name} style={{ background:"#ffffff11", color:"#888",
                  fontFamily:cvc, fontSize:10, letterSpacing:"0.5px",
                  padding:"2px 8px", borderRadius:3 }}>{name}</span>
              ))}
            </div>
            <button onClick={() => handleDelete(rule.id)}
              style={{ padding:"5px 12px", background:"transparent",
                border:"1px solid #333", color:"#444",
                fontFamily:cvc, fontSize:10, cursor:"pointer", borderRadius:6 }}>
              SİL
            </button>
          </div>
        );
      })}

      {showAdd && (
        <div onClick={() => setShowAdd(false)}
          style={{ position:"fixed", inset:0, background:"#000000bb",
            zIndex:200, display:"flex", alignItems:"center", justifyContent:"center" }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background:"#161616", border:"1px solid #2A2A2A",
              borderRadius:16, padding:28, width:420 }}>
            <div style={{ color:"#F0EDE8", fontFamily:cv, fontSize:22,
              marginBottom:20 }}>Yeni Happy Hour Kuralı</div>

            <div style={{ marginBottom:14 }}>
              <div style={{ color:"#888", fontFamily:cvc, fontSize:10,
                letterSpacing:"2px", marginBottom:5 }}>KURAL ADI</div>
              <input value={form.name}
                onChange={e => setForm(f=>({...f,name:e.target.value}))}
                placeholder="Akşam Happy Hour"
                style={{ width:"100%", background:"#111", border:"1px solid #2A2A2A",
                  borderRadius:8, padding:"10px 12px", color:"#F0EDE8",
                  fontFamily:cvc, fontSize:14 }}/>
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:14 }}>
              {[["BAŞLANGIÇ","start_time"],["BİTİŞ","end_time"]].map(([lbl,key])=>(
                <div key={key}>
                  <div style={{ color:"#888", fontFamily:cvc, fontSize:10,
                    letterSpacing:"2px", marginBottom:5 }}>{lbl}</div>
                  <input type="time" value={form[key]}
                    onChange={e=>setForm(f=>({...f,[key]:e.target.value}))}
                    style={{ width:"100%", background:"#111", border:"1px solid #2A2A2A",
                      borderRadius:8, padding:"10px 12px", color:"#F0EDE8",
                      fontFamily:cvc, fontSize:14 }}/>
                </div>
              ))}
            </div>

            <div style={{ marginBottom:14 }}>
              <div style={{ color:"#888", fontFamily:cvc, fontSize:10,
                letterSpacing:"2px", marginBottom:5 }}>
                İNDİRİM ORANI: %{form.discount_pct}
              </div>
              <input type="range" min={5} max={50} step={5}
                value={form.discount_pct}
                onChange={e=>setForm(f=>({...f,discount_pct:+e.target.value}))}
                style={{ width:"100%", accentColor:"#C8973E" }}/>
            </div>

            <div style={{ marginBottom:20 }}>
              <div style={{ color:"#888", fontFamily:cvc, fontSize:10,
                letterSpacing:"2px", marginBottom:8 }}>KATEGORİLER</div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                {categories.map(cat => {
                  const sel = selCats.includes(cat.id);
                  return (
                    <button key={cat.id}
                      onClick={() => setSelCats(p =>
                        sel ? p.filter(x=>x!==cat.id) : [...p,cat.id])}
                      style={{ padding:"6px 14px",
                        border:`2px solid ${sel?"#C8973E":"#2A2A2A"}`,
                        background: sel ? "rgba(200,151,62,0.12)" : "transparent",
                        color: sel ? "#C8973E" : "#888",
                        fontFamily:cvc, fontSize:11, cursor:"pointer", borderRadius:6 }}>
                      {cat.name}
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ display:"flex", gap:10 }}>
              <button onClick={() => setShowAdd(false)}
                style={{ flex:1, padding:"11px", background:"transparent",
                  border:"1px solid #2A2A2A", color:"#888",
                  borderRadius:8, cursor:"pointer", fontFamily:cvc, fontSize:12 }}>
                İptal
              </button>
              <button onClick={handleSave} disabled={saving}
                style={{ flex:2, padding:"11px",
                  background: saving ? "#333" : "#C8973E",
                  border:"none", color:"#000", borderRadius:8,
                  cursor:"pointer", fontFamily:cv, fontSize:16 }}>
                {saving ? "KAYDEDİLİYOR..." : "KAYDET"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
