import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase.js";

const cv  = "'Coolvetica','Bebas Neue',sans-serif";
const cvc = "'Coolvetica Condensed','Barlow Condensed',sans-serif";

export default function SettingsPage() {
  const [enabled, setEnabled] = useState(true);
  const [pct, setPct] = useState(5);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => { (async () => {
    const { data } = await supabase.from("app_settings").select("*");
    if (data) {
      const e = data.find(d => d.key === "member_discount_enabled");
      const p = data.find(d => d.key === "member_discount_pct");
      if (e) setEnabled(e.value === true || e.value === "true");
      if (p) setPct(Number(p.value));
    }
    setLoading(false);
  })(); }, []);

  const save = async () => {
    setSaving(true); setMsg("");
    const { error: e1 } = await supabase.from("app_settings").upsert({
      key: "member_discount_enabled", value: enabled, updated_at: new Date().toISOString(),
    });
    const { error: e2 } = await supabase.from("app_settings").upsert({
      key: "member_discount_pct", value: Number(pct), updated_at: new Date().toISOString(),
    });
    setSaving(false);
    if (e1 || e2) setMsg("HATA: " + (e1?.message || e2?.message));
    else setMsg("Kaydedildi.");
    setTimeout(() => setMsg(""), 3000);
  };

  if (loading) return <div style={{color:"#888",fontFamily:cvc,letterSpacing:"2px",fontSize:14}}>YUKLENIYOR...</div>;

  return (
    <div style={{maxWidth:600}}>
      <div style={{fontFamily:cv,fontSize:36,color:"#F0EDE8",marginBottom:6}}>AYARLAR</div>
      <div style={{fontFamily:cvc,fontSize:12,color:"#888",letterSpacing:"2px",marginBottom:32}}>UYELIK & INDIRIM YONETIMI</div>

      <div style={{background:"#161616",border:"1px solid #2A2A2A",borderRadius:12,padding:24,marginBottom:20}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <div>
            <div style={{fontFamily:cv,fontSize:18,color:"#F0EDE8"}}>UYE OTOMATIK INDIRIMI</div>
            <div style={{fontFamily:cvc,fontSize:13,color:"#888",marginTop:4}}>Google ile uye olan musterilere otomatik indirim uygula</div>
          </div>
          <label style={{position:"relative",display:"inline-block",width:54,height:30}}>
            <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} style={{opacity:0,width:0,height:0}}/>
            <span style={{position:"absolute",cursor:"pointer",top:0,left:0,right:0,bottom:0,background:enabled?"#C8973E":"#2A2A2A",borderRadius:30,transition:"0.2s"}}>
              <span style={{position:"absolute",height:24,width:24,left:enabled?27:3,top:3,background:"#fff",borderRadius:"50%",transition:"0.2s"}}/>
            </span>
          </label>
        </div>
      </div>

      <div style={{background:"#161616",border:"1px solid #2A2A2A",borderRadius:12,padding:24,marginBottom:20,opacity:enabled?1:0.5}}>
        <div style={{fontFamily:cv,fontSize:18,color:"#F0EDE8",marginBottom:6}}>INDIRIM YUZDESI</div>
        <div style={{fontFamily:cvc,fontSize:13,color:"#888",marginBottom:16}}>Tum uyelere uygulanacak varsayilan indirim orani</div>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <input type="number" min="0" max="100" disabled={!enabled} value={pct} onChange={e => setPct(e.target.value)}
            style={{flex:1,background:"#0C0C0C",border:"1px solid #2A2A2A",borderRadius:8,padding:"12px 16px",color:"#F0EDE8",fontFamily:cv,fontSize:24,outline:"none"}}/>
          <span style={{fontFamily:cv,fontSize:32,color:"#C8973E"}}>%</span>
        </div>
        <div style={{fontFamily:cvc,fontSize:11,color:"#666",marginTop:8,letterSpacing:"1px"}}>NOT: Admin tek tek uyelere ozel indirim tanimlayabilir (UYELER sayfasi). Ozel indirim varsa o uygulanir.</div>
      </div>

      <button onClick={save} disabled={saving} style={{width:"100%",padding:"14px",background:"#C8973E",color:"#000",border:"none",borderRadius:8,fontFamily:cv,fontSize:18,letterSpacing:"2px",cursor:"pointer",opacity:saving?0.6:1}}>
        {saving ? "KAYDEDILIYOR..." : "KAYDET"}
      </button>
      {msg && <div style={{textAlign:"center",marginTop:16,fontFamily:cvc,fontSize:13,color:msg.startsWith("HATA")?"#FF4444":"#4ADE80"}}>{msg}</div>}
    </div>
  );
}
