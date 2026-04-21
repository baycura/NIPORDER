import{useState,useEffect}from"react";import{supabase}from"../../lib/supabase.js";
const cv="'Coolvetica','Bebas Neue',sans-serif";const cvc="'Coolvetica Condensed','Barlow Condensed',sans-serif";
export default function ReportsPage(){
  const[period,setPeriod]=useState("week");const[orders,setOrders]=useState([]);const[topItems,setTopItems]=useState([]);const[loading,setLoading]=useState(true);
  useEffect(()=>{(async()=>{setLoading(true);const days=period==="week"?7:period==="month"?30:90;const start=new Date();start.setDate(start.getDate()-days);
    const{data}=await supabase.from("orders").select("*,order_items(*)").eq("status","paid").gte("paid_at",start.toISOString());
    setOrders(data||[]);const map={};(data||[]).forEach(o=>(o.order_items||[]).forEach(item=>{if(!map[item.product_name])map[item.product_name]={name:item.product_name,qty:0,revenue:0};map[item.product_name].qty+=item.quantity;map[item.product_name].revenue+=item.final_price*item.quantity;}));
    setTopItems(Object.values(map).sort((a,b)=>b.revenue-a.revenue).slice(0,8));setLoading(false);})();},[period]);
  const totalRevenue=orders.reduce((s,o)=>s+(o.total||0),0);const totalDiscount=orders.reduce((s,o)=>s+(o.discount_amount||0),0);const avgOrder=orders.length>0?totalRevenue/orders.length:0;
  const byDay={};orders.forEach(o=>{const day=new Date(o.paid_at).toLocaleDateString("tr",{weekday:"short",day:"numeric"});byDay[day]=(byDay[day]||0)+(o.total||0);});
  const dayEntries=Object.entries(byDay).slice(-7);const maxDay=Math.max(...dayEntries.map(([,v])=>v),1);
  return(<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
      <h1 style={{color:"#F0EDE8",fontFamily:cv,fontSize:28,letterSpacing:"-0.5px",margin:0}}>Raporlar</h1>
      <div style={{display:"flex",gap:6}}>{[["week","7 Gün"],["month","30 Gün"],["quarter","90 Gün"]].map(([id,lbl])=>(<button key={id} onClick={()=>setPeriod(id)} style={{padding:"6px 14px",borderRadius:8,border:"none",fontFamily:cvc,fontSize:11,letterSpacing:"1px",cursor:"pointer",background:period===id?"#C8973E":"transparent",color:period===id?"#000":"#888",outline:period!==id?"1px solid #2A2A2A":"none"}}>{lbl}</button>))}</div>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:24}}>
      {[["CİRO",`₺${Math.round(totalRevenue).toLocaleString()}`,"#3ECF8E","💰"],["SİPARİŞ",orders.length.toString(),"#5A8FE0","📋"],["ORT. SEPET",`₺${Math.round(avgOrder).toLocaleString()}`,"#C8973E","📊"],["İNDİRİM",`₺${Math.round(totalDiscount).toLocaleString()}`,"#E05A5A","🏷️"]].map(([l,v,c,icon])=>(<div key={l} style={{background:"#1E1E1E",border:"1px solid #2A2A2A",borderRadius:12,padding:16}}><div style={{display:"flex",justifyContent:"space-between"}}><div><div style={{color:"#888",fontFamily:cvc,fontSize:10,letterSpacing:"1.5px",marginBottom:4}}>{l}</div><div style={{color:c,fontFamily:cv,fontSize:24}}>{v}</div></div><span style={{fontSize:22,opacity:.5}}>{icon}</span></div></div>))}
    </div>
    <div style={{display:"grid",gridTemplateColumns:"1.6fr 1fr",gap:16}}>
      <div style={{background:"#1E1E1E",border:"1px solid #2A2A2A",borderRadius:12,padding:20}}>
        <div style={{color:"#F0EDE8",fontFamily:cv,fontSize:16,marginBottom:16}}>Günlük Ciro</div>
        {loading?<div style={{color:"#888",fontFamily:cvc,fontSize:12,textAlign:"center",padding:20}}>YÜKLENİYOR...</div>:
        <div style={{display:"flex",alignItems:"flex-end",gap:8,height:160}}>
          {dayEntries.map(([day,val],i)=>(<div key={day} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4,height:"100%",justifyContent:"flex-end"}}>
            <div style={{color:"#888",fontFamily:cvc,fontSize:9}}>₺{(val/1000).toFixed(1)}k</div>
            <div style={{width:"100%",borderRadius:"4px 4px 0 0",minHeight:4,background:i===dayEntries.length-1?"#C8973E":"#C8973E44",height:`${(val/maxDay)*100}%`}}/>
            <div style={{color:"#888",fontFamily:cvc,fontSize:9}}>{day}</div>
          </div>))}
        </div>}
      </div>
      <div style={{background:"#1E1E1E",border:"1px solid #2A2A2A",borderRadius:12,padding:20}}>
        <div style={{color:"#F0EDE8",fontFamily:cv,fontSize:16,marginBottom:14}}>En Çok Satan</div>
        {topItems.map((item,i)=>(<div key={i} style={{marginBottom:12}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}><span style={{color:"#F0EDE8",fontFamily:cvc,fontSize:12}}>{item.name}</span><span style={{color:"#C8973E",fontFamily:cvc,fontSize:12}}>{item.qty} adet</span></div><div style={{background:"#2A2A2A",borderRadius:3,height:3}}><div style={{background:"#C8973E",height:"100%",borderRadius:3,width:`${(item.qty/(topItems[0]?.qty||1))*100}%`}}/></div></div>))}
      </div>
    </div>
  </div>);}