import{useState,useEffect,useRef}from"react";import{supabase}from"../../lib/supabase.js";
const cv="'Coolvetica','Bebas Neue',sans-serif";const cvc="'Coolvetica Condensed','Barlow Condensed',sans-serif";
export default function MerchMgmtPage(){
  const[products,setProducts]=useState([]);const[loading,setLoading]=useState(true);const[editing,setEditing]=useState(null);const[form,setForm]=useState({name_en:"",name_tr:"",price:"",type:"apparel",is_active:true});const[variants,setVariants]=useState([]);const[saving,setSaving]=useState(false);const fileRef=useRef();
  const load=async()=>{const{data}=await supabase.from("merch_products").select("*,merch_variants(*)").order("sort_order");setProducts(data||[]);setLoading(false);};
  useEffect(()=>{load();},[]);
  const openEdit=p=>{setEditing(p||{});setForm(p?{name_en:p.name_en||"",name_tr:p.name_tr||"",price:p.price||"",type:p.type||"apparel",is_active:p.is_active!==false}:{name_en:"",name_tr:"",price:"",type:"apparel",is_active:true});setVariants(p?.merch_variants||[]);};
  const handleSave=async()=>{if(!form.name_en||!form.price)return;setSaving(true);const payload={name_en:form.name_en,name_tr:form.name_tr,price:+form.price,type:form.type,is_active:form.is_active};let pid=editing?.id;if(pid){await supabase.from("merch_products").update(payload).eq("id",pid);}else{const{data}=await supabase.from("merch_products").insert(payload).select().single();pid=data?.id;}
    for(const v of variants){if(!v.size)continue;await supabase.from("merch_variants").upsert({...(v.id?{id:v.id}:{}),product_id:pid,size:v.size,stock:parseInt(v.stock)||0});}
    setSaving(false);setEditing(null);load();};
  const toggleActive=async p=>{await supabase.from("merch_products").update({is_active:!p.is_active}).eq("id",p.id);load();};
  if(editing!==null)return(<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24}}><h2 style={{color:"#F0EDE8",fontFamily:cv,fontSize:24,margin:0}}>{editing?.id?"DÜZENLE":"YENİ ÜRÜN"}</h2><div style={{display:"flex",gap:8}}><button onClick={()=>setEditing(null)} style={{padding:"9px 16px",background:"transparent",border:"1px solid #2A2A2A",color:"#888",borderRadius:8,cursor:"pointer",fontFamily:cvc,fontSize:12}}>İptal</button><button onClick={handleSave} disabled={saving} style={{padding:"9px 16px",background:saving?"#333":"#C8973E",border:"none",color:"#000",borderRadius:8,cursor:"pointer",fontFamily:cvc,fontSize:12,letterSpacing:"1px"}}>{saving?"KAYDEDİLİYOR...":"KAYDET"}</button></div></div>
    {[["ÜRÜN ADI (EN)","name_en","NIP Classic Tee"],["ÜRÜN ADI (TR)","name_tr","NIP Classic Tee"],["FİYAT (₺)","price","850"]].map(([l,k,p])=>(<div key={k} style={{marginBottom:14}}><div style={{color:"#888",fontFamily:cvc,fontSize:10,letterSpacing:"2px",marginBottom:5}}>{l}</div><input value={form[k]||""} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))} placeholder={p} style={{width:"100%",background:"#111",border:"1px solid #2A2A2A",borderRadius:8,padding:"9px 12px",color:"#F0EDE8",fontFamily:cvc,fontSize:13}}/></div>))}
    <div style={{marginBottom:20}}><div style={{color:"#888",fontFamily:cvc,fontSize:10,letterSpacing:"2px",marginBottom:5}}>TİP</div><select value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))} style={{width:"100%",background:"#111",border:"1px solid #2A2A2A",borderRadius:8,padding:"9px 12px",color:"#F0EDE8",fontFamily:cvc,fontSize:13}}><option value="apparel">Giyim</option><option value="accessories">Aksesuar</option></select></div>
    <div style={{background:"#1E1E1E",border:"1px solid #2A2A2A",borderRadius:12,padding:16}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}><div style={{color:"#F0EDE8",fontFamily:cv,fontSize:18}}>BEDENLER</div><button onClick={()=>setVariants(v=>[...v,{size:"",stock:0}])} style={{padding:"5px 12px",background:"transparent",border:"1px solid #C8973E",color:"#C8973E",fontFamily:cvc,fontSize:10,letterSpacing:"1px",cursor:"pointer",borderRadius:5}}>+ EKLE</button></div>
      {variants.map((v,i)=>(<div key={i} style={{display:"grid",gridTemplateColumns:"1fr 1fr auto",gap:10,marginBottom:10,alignItems:"center"}}>
        <input value={v.size} placeholder="S / M / L" onChange={e=>setVariants(vs=>vs.map((x,j)=>j===i?{...x,size:e.target.value}:x))} style={{background:"#111",border:"1px solid #2A2A2A",borderRadius:8,padding:"8px 10px",color:"#F0EDE8",fontFamily:cvc,fontSize:13}}/>
        <input type="number" value={v.stock} placeholder="Stok" onChange={e=>setVariants(vs=>vs.map((x,j)=>j===i?{...x,stock:e.target.value}:x))} style={{background:"#111",border:"1px solid #2A2A2A",borderRadius:8,padding:"8px 10px",color:"#F0EDE8",fontFamily:cvc,fontSize:13}}/>
        <button onClick={()=>setVariants(vs=>vs.filter((_,j)=>j!==i))} style={{background:"rgba(224,90,90,0.12)",border:"1px solid #E05A5A",color:"#E05A5A",borderRadius:7,width:32,height:32,cursor:"pointer",fontSize:14}}>✕</button>
      </div>))}
    </div>
  </div>);
  return(<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}><h1 style={{color:"#F0EDE8",fontFamily:cv,fontSize:28,letterSpacing:"-0.5px",margin:0}}>Merch Yönetimi</h1><button onClick={()=>openEdit(null)} style={{padding:"9px 16px",background:"#C8973E",border:"none",color:"#000",fontFamily:cvc,fontSize:12,letterSpacing:"1px",cursor:"pointer",borderRadius:8}}>+ YENİ ÜRÜN</button></div>
    {loading&&<div style={{color:"#888",textAlign:"center",padding:40}}>YÜKLENİYOR...</div>}
    <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:14}}>
      {products.map(p=>{const stock=p.merch_variants?.reduce((s,v)=>s+(v.stock||0),0)??0;return(<div key={p.id} style={{background:"#1E1E1E",border:"1px solid #2A2A2A",borderRadius:12,overflow:"hidden"}}>
        <div style={{height:180,background:"#111",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}} onClick={()=>openEdit(p)}>
          {p.image_url?<img src={p.image_url} alt={p.name_en} style={{width:"100%",height:"100%",objectFit:"cover"}}/>:<div style={{textAlign:"center"}}><div style={{fontSize:24,opacity:.3}}>📸</div><div style={{color:"#444",fontFamily:cvc,fontSize:10,letterSpacing:"2px",marginTop:6}}>FOTOĞRAF YOK</div></div>}
        </div>
        <div style={{padding:"12px 14px"}}>
          <div style={{color:"#F0EDE8",fontFamily:cv,fontSize:17,marginBottom:2}}>{p.name_en}</div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}><div style={{color:"#C8973E",fontFamily:cv,fontSize:18}}>₺{p.price?.toLocaleString()}</div><div style={{color:stock<5?"#E05A5A":"#888",fontFamily:cvc,fontSize:11}}>{stock} adet</div></div>
          <div style={{display:"flex",gap:6}}><button onClick={()=>openEdit(p)} style={{flex:1,padding:"7px",background:"rgba(200,151,62,0.12)",border:"1px solid #C8973E",color:"#C8973E",fontFamily:cvc,fontSize:10,letterSpacing:"1px",cursor:"pointer",borderRadius:6}}>✏️ DÜZENLE</button><button onClick={()=>toggleActive(p)} style={{flex:1,padding:"7px",background:"transparent",border:"1px solid #2A2A2A",color:"#888",fontFamily:cvc,fontSize:10,cursor:"pointer",borderRadius:6}}>{p.is_active?"PASİF YAP":"AKTİF YAP"}</button></div>
        </div>
      </div>);})}
      <div onClick={()=>openEdit(null)} style={{background:"#1E1E1E",border:"2px dashed #2A2A2A",borderRadius:12,minHeight:300,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:10,cursor:"pointer"}}><div style={{fontSize:28,opacity:.3}}>+</div><div style={{color:"#444",fontFamily:cv,fontSize:16}}>YENİ ÜRÜN</div></div>
    </div>
  </div>);}