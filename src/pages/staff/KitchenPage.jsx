import{useState,useEffect}from"react";import{supabase}from"../../lib/supabase.js";
const cv="'Coolvetica','Bebas Neue',sans-serif";const cvc="'Coolvetica Condensed','Barlow Condensed',sans-serif";
const COL={preparing:{label:"Hazırlanıyor",color:"#E07A3E",bg:"rgba(224,122,62,0.12)"},ready:{label:"Hazır ✓",color:"#3ECF8E",bg:"rgba(62,207,142,0.12)"}};
export default function KitchenPage(){
  const[items,setItems]=useState([]);const[loading,setLoading]=useState(true);
  const load=async()=>{const{data}=await supabase.from("order_items").select("*,orders(cafe_tables(name),staff(name),created_at)").eq("sent_to_kitchen",true).in("kitchen_status",["preparing","ready"]).order("created_at");setItems(data||[]);setLoading(false);};
  useEffect(()=>{load();const ch=supabase.channel("kitchen").on("postgres_changes",{event:"*",schema:"public",table:"order_items"},load).subscribe();return()=>ch.unsubscribe();},[]);
  const advance=async(id,status)=>{const next=status==="preparing"?"ready":"done";await supabase.from("order_items").update({kitchen_status:next}).eq("id",id);load();};
  return(<div>
    <h1 style={{color:"#F0EDE8",fontFamily:cv,fontSize:28,letterSpacing:"-0.5px",margin:"0 0 24px"}}>Mutfak Ekranı</h1>
    {loading&&<div style={{color:"#888",fontFamily:cvc,fontSize:12,textAlign:"center",padding:40}}>YÜKLENİYOR...</div>}
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
      {["preparing","ready"].map(col=>(<div key={col}>
        <div style={{color:COL[col].color,fontFamily:cvc,fontSize:10,letterSpacing:"2px",marginBottom:10,fontWeight:700}}>{COL[col].label.toUpperCase()} ({items.filter(i=>i.kitchen_status===col).length})</div>
        {items.filter(i=>i.kitchen_status===col).map(item=>(<div key={item.id} style={{background:COL[col].bg,border:`1.5px solid ${COL[col].color}`,borderRadius:12,padding:14,marginBottom:10}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}><span style={{color:"#F0EDE8",fontFamily:cv,fontSize:18}}>{item.orders?.cafe_tables?.name||"?"}</span><span style={{color:"#888",fontFamily:cvc,fontSize:11}}>{item.orders?.staff?.name}</span></div>
          <div style={{color:"#F0EDE8",fontFamily:cvc,fontSize:14,padding:"6px 0",borderBottom:"1px solid rgba(255,255,255,.07)",marginBottom:8}}>{item.product_name}{item.quantity>1&&<span style={{color:COL[col].color,marginLeft:6}}>×{item.quantity}</span>}</div>
          {item.note&&<div style={{color:"#E07A3E",fontFamily:cvc,fontSize:11,marginBottom:8}}>📝 {item.note}</div>}
          <button onClick={()=>advance(item.id,col)} style={{width:"100%",padding:"8px",border:"none",background:COL[col].color,color:"#000",fontFamily:cvc,fontSize:11,letterSpacing:"1px",cursor:"pointer",borderRadius:6,fontWeight:700}}>{col==="preparing"?"HAZIR ✓":"TESLİM EDİLDİ"}</button>
        </div>))}
        {items.filter(i=>i.kitchen_status===col).length===0&&<div style={{color:"#444",fontFamily:cvc,fontSize:11,textAlign:"center",padding:"24px 0"}}>BOŞ</div>}
      </div>))}
    </div>
  </div>);}