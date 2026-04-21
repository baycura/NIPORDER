import{useState,useEffect}from"react";import{supabase}from"../../lib/supabase.js";import{useAuth}from"../../contexts/AuthContext.jsx";
const cv="'Coolvetica','Bebas Neue',sans-serif";const cvc="'Coolvetica Condensed','Barlow Condensed',sans-serif";
export default function MyShiftPage(){
  const{staffUser}=useAuth();const[orders,setOrders]=useState([]);const[shift,setShift]=useState(null);const[loading,setLoading]=useState(true);
  useEffect(()=>{if(!staffUser?.id)return;const today=new Date().toISOString().split("T")[0];
    Promise.all([supabase.from("orders").select("*,cafe_tables(name),order_items(*)").eq("staff_id",staffUser.id).eq("status","paid").gte("paid_at",today+"T00:00:00").order("paid_at",{ascending:false}),supabase.from("shifts").select("*").eq("staff_id",staffUser.id).eq("date",today).maybeSingle()])
    .then(([{data:o},{data:s}])=>{setOrders(o||[]);setShift(s);setLoading(false);});
  },[staffUser]);
  const revenue=orders.reduce((s,o)=>s+(o.total||0),0);const orderCount=orders.length;const avg=orderCount>0?Math.round(revenue/orderCount):0;
  const checkedIn=shift?.checked_in_at?new Date(shift.checked_in_at).toLocaleTimeString("tr",{hour:"2-digit",minute:"2-digit"}):"—";
  const workedMins=shift?.checked_in_at?Math.floor((Date.now()-new Date(shift.checked_in_at))/60000):0;
  const workedStr=workedMins>0?`${Math.floor(workedMins/60)}s ${workedMins%60}dk`:"—";
  const handleCheckIn=async()=>{const today=new Date().toISOString().split("T")[0];const{data}=await supabase.from("shifts").upsert({staff_id:staffUser.id,date:today,checked_in_at:new Date().toISOString(),status:"active"},{onConflict:"staff_id,date"}).select().single();setShift(data);};
  return(<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24}}>
      <h1 style={{color:"#F0EDE8",fontFamily:cv,fontSize:28,letterSpacing:"-0.5px",margin:0}}>Vardiyam</h1>
      {!shift?.checked_in_at&&<button onClick={handleCheckIn} style={{padding:"10px 18px",background:"#3ECF8E",border:"none",color:"#000",fontFamily:cv,fontSize:16,cursor:"pointer",borderRadius:8}}>VARDIYAYA GİR</button>}
    </div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:24}}>
      {[["BUGÜNKÜ CİRO",`₺${Math.round(revenue).toLocaleString()}`,"#3ECF8E","💰"],["SİPARİŞ",orderCount.toString(),"#C8973E","📋"],["ORT. SEPET",`₺${avg.toLocaleString()}`,"#F0EDE8","📊"]].map(([l,v,c,icon])=>(<div key={l} style={{background:"#1E1E1E",border:"1px solid #2A2A2A",borderRadius:12,padding:16}}><div style={{display:"flex",justifyContent:"space-between"}}><div><div style={{color:"#888",fontFamily:cvc,fontSize:10,letterSpacing:"1.5px",marginBottom:4}}>{l}</div><div style={{color:c,fontFamily:cv,fontSize:26}}>{v}</div></div><span style={{fontSize:22,opacity:.5}}>{icon}</span></div></div>))}
    </div>
    <div style={{background:"#1E1E1E",border:"1px solid #2A2A2A",borderRadius:12,padding:18,marginBottom:24}}>
      <div style={{color:"#F0EDE8",fontFamily:cv,fontSize:18,marginBottom:14}}>Vardiya Bilgisi</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12}}>
        {[["GİRİŞ",checkedIn],["SÜRE",workedStr],["DURUM",shift?.status==="active"?"Aktif":"—"]].map(([l,v])=>(<div key={l} style={{background:"#111",borderRadius:8,padding:"10px 12px"}}><div style={{color:"#444",fontFamily:cvc,fontSize:9,letterSpacing:"1.5px",marginBottom:4}}>{l}</div><div style={{color:"#F0EDE8",fontFamily:cvc,fontSize:14,fontWeight:700}}>{v}</div></div>))}
      </div>
    </div>
    <div style={{color:"#F0EDE8",fontFamily:cv,fontSize:18,marginBottom:12}}>Son Siparişlerim</div>
    {loading&&<div style={{color:"#888",fontFamily:cvc,fontSize:12,textAlign:"center",padding:24}}>YÜKLENİYOR...</div>}
    {orders.map(o=>(<div key={o.id} style={{background:"#1E1E1E",border:"1px solid #2A2A2A",borderRadius:10,padding:"12px 16px",marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <div><div style={{color:"#F0EDE8",fontFamily:cvc,fontSize:13,fontWeight:700}}>{o.cafe_tables?.name}</div><div style={{color:"#888",fontFamily:cvc,fontSize:11,marginTop:2}}>{(o.order_items||[]).slice(0,2).map(i=>i.product_name).join(", ")}</div></div>
      <div style={{color:"#C8973E",fontFamily:cv,fontSize:18}}>₺{Math.round(o.total||0).toLocaleString()}</div>
    </div>))}
  </div>);}