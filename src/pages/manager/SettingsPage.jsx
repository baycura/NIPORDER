import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase.js";

const cv = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";

export default function SettingsPage() {
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("app_settings").select("*");
    const obj = {};
    (data || []).forEach(s => { obj[s.key] = s.value; });
    setSettings(obj);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const setKey = async (key, value) => {
    setSettings({...settings, [key]: value});
  };

  const save = async () => {
    if (busy) return;
    setBusy(true);
    for (const [key, value] of Object.entries(settings)) {
      await supabase.from("app_settings").upsert({ key, value }, { onConflict: "key" });
    }
    setBusy(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (loading) return (<div style={{color:"#888",fontFamily:cv,padding:20}}>Yukleniyor...</div>);

  const partyEnabled = settings.party_mode_enabled === true || settings.party_mode_enabled === "true";
  const partyFrom = settings.party_mode_from || "22:00";
  const partyUntil = settings.party_mode_until || "04:00";
  const memberDiscount = Number(settings.member_discount_pct) || 0;
  const memberEnabled = settings.member_discount_enabled === true || settings.member_discount_enabled === "true";

  return (
    <div style={{fontFamily:cv,color:"#F0EDE8"}}>
      <div style={{fontSize:24,fontWeight:800,marginBottom:4}}>Ayarlar</div>
      <div style={{fontSize:11,color:"#888",letterSpacing:"1px",marginBottom:18}}>SISTEM AYARLARI</div>

      {/* Parti modu */}
      <Section icon="🎉" title="Parti Modu" desc="Belirli saatlerde ozel parti menusu aktif olur. Bu sirada parti urunleri musteri menusunde gozukur.">
        <Toggle checked={partyEnabled} onChange={v=>setKey("party_mode_enabled", v)} label="Parti modu aktif"/>
        <div style={{display:"flex",gap:8}}>
          <Field label="BASLANGIC" style={{flex:1}}><input type="time" value={partyFrom} onChange={e=>setKey("party_mode_from", e.target.value)} style={inputS}/></Field>
          <Field label="BITIS" style={{flex:1}}><input type="time" value={partyUntil} onChange={e=>setKey("party_mode_until", e.target.value)} style={inputS}/></Field>
        </div>
        <div style={{fontSize:11,color:"#888",marginTop:6}}>NOT: Parti saatleri arasinda "Parti Menusu" tab'i acilir. "show_in_party_menu" isaretli urunler gosterilir.</div>
      </Section>

      {/* Member indirimi */}
      <Section icon="🌟" title="Uye Indirimi" desc="Sisteme kayitli musterilerin Google ile giris yapip otomatik indirim almalari icin.">
        <Toggle checked={memberEnabled} onChange={v=>setKey("member_discount_enabled", v)} label="Uye indirimi aktif"/>
        <Field label={"INDIRIM ORANI (%) - su an: %" + memberDiscount}>
          <input type="number" min="0" max="50" value={memberDiscount} onChange={e=>setKey("member_discount_pct", Number(e.target.value))} style={inputS}/>
        </Field>
        <div style={{fontSize:11,color:"#888",marginTop:6}}>NOT: Bir musteriye ozel "admin_discount" varsa, uye indirimi yerine o uygulanir.</div>
      </Section>

      {/* Save button */}
      <button onClick={save} disabled={busy} style={{width:"100%",padding:"14px",background:"#C8973E",color:"#000",border:"none",borderRadius:12,fontSize:15,fontWeight:800,cursor:"pointer",marginTop:16,opacity:busy?0.6:1}}>{busy?"Kaydediliyor...":(saved?"✓ Kaydedildi":"Ayarlari Kaydet")}</button>
    </div>
  );
}

const inputS = {width:"100%",padding:"10px 12px",background:"#0C0C0C",border:"1px solid #2A2A2A",borderRadius:8,color:"#F0EDE8",fontSize:14,outline:"none",fontFamily:"inherit"};

function Field({label, children, style={}}) {
  return (<div style={{marginBottom:12,...style}}>
    <div style={{fontSize:10,color:"#888",letterSpacing:"1.5px",fontWeight:700,marginBottom:5}}>{label}</div>
    {children}
  </div>);
}

function Toggle({checked, onChange, label}) {
  return (<label style={{display:"flex",alignItems:"center",gap:10,marginBottom:14,cursor:"pointer",userSelect:"none"}}>
    <div style={{position:"relative",width:42,height:24,borderRadius:12,background:checked?"#C8973E":"#333",transition:"0.2s"}}>
      <div style={{position:"absolute",top:3,left:checked?21:3,width:18,height:18,borderRadius:"50%",background:"#fff",transition:"0.2s"}}/>
    </div>
    <input type="checkbox" checked={checked} onChange={e=>onChange(e.target.checked)} style={{display:"none"}}/>
    <span style={{fontSize:14,color:"#F0EDE8"}}>{label}</span>
  </label>);
}

function Section({icon, title, desc, children}) {
  return (<div style={{background:"#1A1A1A",border:"1px solid #2A2A2A",borderRadius:12,padding:16,marginBottom:14}}>
    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
      <span style={{fontSize:18}}>{icon}</span>
      <div style={{fontSize:16,fontWeight:800,color:"#F0EDE8"}}>{title}</div>
    </div>
    <div style={{fontSize:11,color:"#888",marginBottom:14,lineHeight:1.5}}>{desc}</div>
    {children}
  </div>);
}
