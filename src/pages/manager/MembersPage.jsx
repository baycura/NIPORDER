import{useState,useEffect}from"react";import{supabase}from"../../lib/supabase.js";
const cv="'Coolvetica','Bebas Neue',sans-serif";const cvc="'Coolvetica Condensed','Barlow Condensed',sans-serif";
const tc={bronze:"#CD7F32",silver:"#9CA3AF",gold:"#C8973E",platinum:"#5A8FE0"};
function calcTier(p){if(p>=500)return"platinum";if(p>=250)return"gold";if(p>=100)return"silver";return"bronze";}
export default function MembersPage(){
  const[members,setMembers]=useState([]);const[loading,setLoading]=useState(true);const[search,setSearch]=useState("");const[showAdd,setShowAdd]=useState(false);const[editId,setEditId]=useState(null);const[editDisc,setEditDisc]=useState("");const[form,setForm]=useState({name:"",phone:""});const[saving,setSaving]=useState(false);
  const load=async()=>{const{data}=await supabase.from("customers").select("*").order("total_spent",{ascending:false});setMembers(data||[]);setLoading(false);};
  useEffect(()=>{load();},[]);
  const handleCreate=async()=>{if(!form.name)return;setSaving(true);await supabase.from("customers").insert({name:form.name,phone:form.phone||null,tier:"bronze",points:0,total_spent:0,visit_count:0});setSaving(false);setShowAdd(false);setForm({name:"",phone:""});load();};
  const saveDisc=async(id)=>{await supabase.from("customers").update({admin_discount:editDisc===""?null:+editDisc}).eq("id",id);setEditId(null);load();};
  const filtered=members.filter(m=>!search||m.name?.toLowerCase().includes(search.toLowerCase())||m.phone?.includes(search));
  return(<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}><h1 style={{color:"#F0EDE8",fontFamily:cv,fontSize:28,margin:0}}>Üye Yönetimi</h1><button onClick={()=>setShowAdd(true)} style={{padding:"9px 16px",background:"#C8973E",border:"none",color:"#000",fontFamily:cvc,fontSize:12,cursor:"pointer",borderRadius:8}}>+ ÜYE EKLE</button></div>
    <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="İsim veya telefon ara..." style={{width:"100%",background:"#111",border:"1px solid #2A2A2A",borderRadius:8,padding:"10px 14px",color:"#F0EDE8",fontFamily:cvc,fontSize:14,marginBottom:16}}/>
    {loading&&<div style={{color:"#888",textAlign:"center",padding:40}}>YÜKLENİYOR...</div>}
    <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:12}}>
      {filtered.map(m=>{const tier=calcTier(m.points||0);const color=tc[tier];const disc=m.admin_discount??{bronze:0,silver:5,gold:10,platinum:15}[tier];return(<div key={m.id} style={{background:"#1E1E1E",border:"1px solid #2A2A2A",borderLeft:"3px solid "+color,borderRadius:12,padding:16}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:12}}><div><div style={{color:"#F0EDE8",fontFamily:cv,fontSize:20}}>{m.name}</div><div style={{color:"#888",fontFamily:cvc,fontSize:11}}>{m.phone||"—"}</div></div><span style={{background:color+"22",color,fontFamily:cvc,fontSize:9,padding:"3px 8px",borderRadius:3}}>{tier.toUpperCase()}</span></div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",borderTop:"1px solid #2A2A2A",paddingTop:10}}>
          <span style={{color:"#888",fontFamily:cvc,fontSize:11}}>Puan: <b style={{color:"#F0EDE8"}}>{m.points||0}</b> · İndirim: <b style={{color:"#C8973E"}}>%{disc}</b></span>
          {editId===m.id?(<div style={{display:"flex",gap:5,alignItems:"center"}}><input type="number" value={editDisc} onChange={e=>setEditDisc(e.target.value)} style={{width:45,background:"#111",border:"1px solid #2A2A2A",borderRadius:4,padding:"3px 5px",color:"#F0EDE8",fontFamily:cvc,fontSize:12}}/><button onClick={()=>saveDisc(m.id)} style={{background:"#3ECF8E",border:"none",color:"#000",padding:"3px 7px",borderRadius:3,cursor:"pointer",fontFamily:cvc,fontSize:10}}>✓</button><button onClick={()=>setEditId(null)} style={{background:"none",border:"none",color:"#444",cursor:"pointer",fontSize:12}}>✕</button></div>):
          (<button onClick={()=>{setEditId(m.id);setEditDisc(m.admin_discount??"");}} style={{background:"transparent",border:"1px solid #2A2A2A",color:"#888",padding:"3px 8px",borderRadius:4,cursor:"pointer",fontFamily:cvc,fontSize:10}}>DÜZENLE</button>)}
        </div>
      </div>);})}
    </div>
    {showAdd&&(<div onClick={()=>setShowAdd(false)} style={{position:"fixed",inset:0,background:"#000000bb",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center"}}><div onClick={e=>e.stopPropagation()} style={{background:"#161616",border:"1px solid #2A2A2A",borderRadius:16,padding:28,width:360}}>
      <div style={{color:"#F0EDE8",fontFamily:cv,fontSize:22,marginBottom:20}}>Yeni Üye</div>
      {[["AD","name","text","Ahmet"],["TELEFON","phone","tel","+90 555"]].map(([l,k,t,p])=>(<div key={k} style={{marginBottom:14}}><div style={{color:"#888",fontFamily:cvc,fontSize:10,letterSpacing:"2px",marginBottom:5}}>{l}</div><input type={t} value={form[k]} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))} placeholder={p} style={{width:"100%",background:"#111",border:"1px solid #2A2A2A",borderRadius:8,padding:"10px 12px",color:"#F0EDE8",fontFamily:cvc,fontSize:14}}/></div>))}
      <div style={{display:"flex",gap:10,marginTop:4}}><button onClick={()=>setShowAdd(false)} style={{flex:1,padding:"11px",background:"transparent",border:"1px solid #2A2A2A",color:"#888",borderRadius:8,cursor:"pointer",fontFamily:cvc,fontSize:12}}>İptal</button><button onClick={handleCreate} disabled={saving} style={{flex:2,padding:"11px",background:saving?"#333":"#C8973E",border:"none",color:"#000",borderRadius:8,cursor:"pointer",fontFamily:cv,fontSize:16}}>{saving?"KAYDEDİLİYOR...":"EKLE"}</button></div>
    </div></div>)}
  </div>);}