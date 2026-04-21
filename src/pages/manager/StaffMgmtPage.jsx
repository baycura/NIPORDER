import{useState,useEffect}from"react";import{supabase}from"../../lib/supabase.js";
const cv="'Coolvetica','Bebas Neue',sans-serif";const cvc="'Coolvetica Condensed','Barlow Condensed',sans-serif";
const rc={manager:"#C8973E",owner:"#C8973E",waiter:"#3ECF8E",kitchen:"#E07A3E",cashier:"#5A8FE0"};
const rl={manager:"Yönetici",owner:"Yönetici",waiter:"Garson",kitchen:"Mutfak",cashier:"Kasiyer"};
export default function StaffMgmtPage(){
  const[staff,setStaff]=useState([]);const[loading,setLoading]=useState(true);const[showAdd,setShowAdd]=useState(false);const[form,setForm]=useState({name:"",email:"",password:"",role:"waiter"});const[saving,setSaving]=useState(false);const[error,setError]=useState("");
  const load=async()=>{const{data}=await supabase.from("staff").select("*").order("name");setStaff(data||[]);setLoading(false);};
  useEffect(()=>{load();},[]);
  const handleCreate=async()=>{if(!form.name||!form.email||!form.password){setError("Tüm alanlar zorunlu");return;}setSaving(true);setError("");
    const{data:authData,error:authErr}=await supabase.auth.admin?.createUser({email:form.email,password:form.password,email_confirm:true})||{data:null,error:{message:"no admin"}};
    if(authErr){await supabase.from("staff").insert({name:form.name,role:form.role,is_active:true});}
    else{await supabase.from("staff").insert({auth_id:authData.user?.id,name:form.name,role:form.role,is_active:true});}
    setSaving(false);setShowAdd(false);setForm({name:"",email:"",password:"",role:"waiter"});load();};
  return(<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24}}>
      <h1 style={{color:"#F0EDE8",fontFamily:cv,fontSize:28,letterSpacing:"-0.5px",margin:0}}>Personel</h1>
      <button onClick={()=>setShowAdd(true)} style={{padding:"9px 16px",background:"#C8973E",border:"none",color:"#000",fontFamily:cvc,fontSize:12,letterSpacing:"1px",cursor:"pointer",borderRadius:8}}>+ PERSONEL EKLE</button>
    </div>
    {loading&&<div style={{color:"#888",fontFamily:cvc,fontSize:12,textAlign:"center",padding:40}}>YÜKLENİYOR...</div>}
    <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12}}>
      {staff.map(s=>(<div key={s.id} style={{background:"#1E1E1E",border:"1px solid #2A2A2A",borderTop:`3px solid ${rc[s.role]||"#888"}`,borderRadius:12,padding:16}}>
        <div style={{width:40,height:40,borderRadius:"50%",background:(rc[s.role]||"#888")+"22",display:"flex",alignItems:"center",justifyContent:"center",color:rc[s.role]||"#888",fontFamily:cv,fontSize:20,marginBottom:10}}>{s.name?.[0]}</div>
        <div style={{color:"#F0EDE8",fontFamily:cvc,fontSize:14,fontWeight:700}}>{s.name}</div>
        <div style={{color:"#888",fontFamily:cvc,fontSize:11,marginBottom:8}}>{s.email||"—"}</div>
        <span style={{background:(rc[s.role]||"#888")+"22",color:rc[s.role]||"#888",fontFamily:cvc,fontSize:9,letterSpacing:"1px",padding:"2px 8px",borderRadius:3}}>{rl[s.role]||s.role}</span>
      </div>))}
    </div>
    {showAdd&&(<div onClick={()=>setShowAdd(false)} style={{position:"fixed",inset:0,background:"#000000bb",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center"}}><div onClick={e=>e.stopPropagation()} style={{background:"#161616",border:"1px solid #2A2A2A",borderRadius:16,padding:28,width:400}}>
      <div style={{color:"#F0EDE8",fontFamily:cv,fontSize:22,marginBottom:20}}>Yeni Personel</div>
      {[["AD SOYAD","name","text","Ahmet Yılmaz"],["E-POSTA","email","email","ahmet@notinparis.me"],["ŞİFRE","password","password","••••••••"]].map(([l,k,t,p])=>(<div key={k} style={{marginBottom:14}}><div style={{color:"#888",fontFamily:cvc,fontSize:10,letterSpacing:"2px",marginBottom:5}}>{l}</div><input type={t} value={form[k]} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))} placeholder={p} style={{width:"100%",background:"#111",border:"1px solid #2A2A2A",borderRadius:8,padding:"10px 12px",color:"#F0EDE8",fontFamily:cvc,fontSize:14}}/></div>))}
      <div style={{marginBottom:20}}><div style={{color:"#888",fontFamily:cvc,fontSize:10,letterSpacing:"2px",marginBottom:5}}>ROL</div><select value={form.role} onChange={e=>setForm(f=>({...f,role:e.target.value}))} style={{width:"100%",background:"#111",border:"1px solid #2A2A2A",borderRadius:8,padding:"10px 12px",color:"#F0EDE8",fontFamily:cvc,fontSize:14}}><option value="waiter">Garson</option><option value="kitchen">Mutfak</option><option value="cashier">Kasiyer</option><option value="manager">Yönetici</option></select></div>
      {error&&<div style={{color:"#E05A5A",fontFamily:cvc,fontSize:11,marginBottom:12}}>⚠ {error}</div>}
      <div style={{display:"flex",gap:10}}><button onClick={()=>setShowAdd(false)} style={{flex:1,padding:"11px",background:"transparent",border:"1px solid #2A2A2A",color:"#888",borderRadius:8,cursor:"pointer",fontFamily:cvc,fontSize:12}}>İptal</button><button onClick={handleCreate} disabled={saving} style={{flex:2,padding:"11px",background:saving?"#333":"#C8973E",border:"none",color:"#000",borderRadius:8,cursor:"pointer",fontFamily:cv,fontSize:16}}>{saving?"KAYDEDİLİYOR...":"EKLE"}</button></div>
    </div></div>)}
  </div>);}