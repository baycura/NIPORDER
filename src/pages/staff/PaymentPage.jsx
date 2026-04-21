import{useState,useEffect}from"react";import{supabase}from"../../lib/supabase.js";import{useAuth}from"../../contexts/AuthContext.jsx";
const cv="'Coolvetica','Bebas Neue',sans-serif";const cvc="'Coolvetica Condensed','Barlow Condensed',sans-serif";
const METHODS=[{id:"cash",label:"Nakit",icon:"💵",color:"#3ECF8E"},{id:"card",label:"Kart",icon:"💳",color:"#5A8FE0"},{id:"transfer",label:"Havale",icon:"📱",color:"#C8973E"},{id:"debt",label:"Veresiye",icon:"📋",color:"#E05A5A"}];
function PayModal({order,onClose,onPaid,staffId}){
  const[method,setMethod]=useState("cash");const[loading,setLoading]=useState(false);
  const total=Math.round(order.total||0);
  const handlePay=async()=>{setLoading(true);await supabase.from("payments").insert({order_id:order.id,method,amount:total,staff_id:staffId});await supabase.from("orders").update({status:method==="debt"?"debt":"paid",paid_at:new Date().toISOString()}).eq("id",order.id);setLoading(false);onPaid();onClose();};
  return(<div onClick={onClose} style={{position:"fixed",inset:0,background:"#000000bb",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center"}}>
    <div onClick={e=>e.stopPropagation()} style={{background:"#161616",border:"1px solid #2A2A2A",borderRadius:16,padding:28,width:380}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}><div style={{color:"#F0EDE8",fontFamily:cv,fontSize:22}}>{order.cafe_tables?.name}</div><div style={{color:"#C8973E",fontFamily:cv,fontSize:32}}>₺{total.toLocaleString()}</div></div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:20}}>{METHODS.map(m=>(<button key={m.id} onClick={()=>setMethod(m.id)} style={{padding:"12px",border:`2px solid ${method===m.id?m.color:"#2A2A2A"}`,background:method===m.id?m.color+"22":"transparent",color:method===m.id?m.color:"#888",borderRadius:10,cursor:"pointer",fontFamily:cvc,fontSize:12,display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:18}}>{m.icon}</span>{m.label}</button>))}</div>
      <div style={{display:"flex",gap:10}}><button onClick={onClose} style={{flex:1,padding:"12px",background:"transparent",border:"1px solid #2A2A2A",color:"#888",borderRadius:8,cursor:"pointer",fontFamily:cvc,fontSize:12}}>İptal</button><button onClick={handlePay} disabled={loading} style={{flex:2,padding:"12px",background:loading?"#333":"#3ECF8E",border:"none",color:"#000",fontFamily:cv,fontSize:18,cursor:"pointer",borderRadius:8}}>{loading?"İŞLENİYOR...":`TAHSİL ET · ₺${total.toLocaleString()}`}</button></div>
    </div>
  </div>);}
export default function PaymentPage(){
  const{staffUser}=useAuth();const[orders,setOrders]=useState([]);const[loading,setLoading]=useState(true);const[payOrder,setPayOrder]=useState(null);
  const load=async()=>{const{data}=await supabase.from("orders").select("*,cafe_tables(name),staff(name),order_items(*)").in("status",["open","sent","preparing","ready"]).order("created_at",{ascending:false});setOrders(data||[]);setLoading(false);};
  useEffect(()=>{load();},[]);
  return(<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}><h1 style={{color:"#F0EDE8",fontFamily:cv,fontSize:28,letterSpacing:"-0.5px",margin:0}}>Kasa</h1><div style={{color:"#3ECF8E",fontFamily:cvc,fontSize:13}}>Açık: ₺{Math.round(orders.reduce((s,o)=>s+(o.total||0),0)).toLocaleString()}</div></div>
    {loading&&<div style={{color:"#888",fontFamily:cvc,fontSize:12,textAlign:"center",padding:40}}>YÜKLENİYOR...</div>}
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:12}}>
      {orders.map(o=>(<div key={o.id} style={{background:"#1E1E1E",border:"1px solid #2A2A2A",borderRadius:12,padding:16}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}><div><div style={{color:"#F0EDE8",fontFamily:cv,fontSize:20}}>{o.cafe_tables?.name}</div><div style={{color:"#888",fontFamily:cvc,fontSize:11,marginTop:2}}>{o.staff?.name}</div></div><div style={{color:"#C8973E",fontFamily:cv,fontSize:24}}>₺{Math.round(o.total||0).toLocaleString()}</div></div>
        <div style={{marginBottom:12}}>{(o.order_items||[]).slice(0,3).map((item,i)=>(<div key={i} style={{color:"#888",fontFamily:cvc,fontSize:11,padding:"2px 0"}}>{item.product_name} ×{item.quantity}</div>))}</div>
        <button onClick={()=>setPayOrder(o)} style={{width:"100%",padding:"10px",background:"#3ECF8E",border:"none",color:"#000",fontFamily:cv,fontSize:16,cursor:"pointer",borderRadius:8}}>ÖDEME AL</button>
      </div>))}
    </div>
    {payOrder&&<PayModal order={payOrder} staffId={staffUser?.id} onClose={()=>setPayOrder(null)} onPaid={load}/>}
  </div>);}