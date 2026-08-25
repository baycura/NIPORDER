import{useState,useEffect}from"react";import{supabase}from"../../lib/supabase.js";import{useAuth}from"../../contexts/AuthContext.jsx";
import{businessDayStart,businessDayKey}from"../../lib/businessDay.js";
const cv="'Coolvetica','Bebas Neue',sans-serif";const cvc="'Coolvetica Condensed','Barlow Condensed',sans-serif";
export default function MyShiftPage(){
  const{staffUser}=useAuth();const[orders,setOrders]=useState([]);const[shift,setShift]=useState(null);const[loading,setLoading]=useState(true);
  // Bu vardiyada SENIN verdigin ikramlar. Siparisi baskasi acmis olabilir, o
  // yuzden siparisin staff_id'sine degil kalemin treated_by alanina bakiyoruz.
  const[ikramlar,setIkramlar]=useState([]);
  useEffect(()=>{if(!staffUser?.id)return;
    // Isletme gunu 03:00'te baslar: gece 01'de bakan garson dunun vardiyasini gorur
    const bizDate=businessDayKey(new Date());const bizStart=businessDayStart().toISOString();
    Promise.all([supabase.from("orders").select("*,cafe_tables(name),order_items(*)").eq("staff_id",staffUser.id).eq("status","paid").gte("paid_at",bizStart).order("paid_at",{ascending:false}),supabase.from("shifts").select("*").eq("staff_id",staffUser.id).eq("date",bizDate).maybeSingle()])
    .then(([{data:o},{data:s}])=>{setOrders(o||[]);setShift(s);setLoading(false);});
    supabase.from("order_items").select("product_name,quantity,final_price,orders!inner(created_at)")
      .eq("treated_by",staffUser.id).gte("orders.created_at",bizStart)
      .then(({data})=>setIkramlar(data||[]));
  },[staffUser]);
  const revenue=orders.reduce((s,o)=>s+(o.total||0),0);const orderCount=orders.length;const avg=orderCount>0?Math.round(revenue/orderCount):0;
  const checkedIn=shift?.checked_in_at?new Date(shift.checked_in_at).toLocaleTimeString("tr",{hour:"2-digit",minute:"2-digit"}):"—";
  const workedMins=shift?.checked_in_at?Math.floor((Date.now()-new Date(shift.checked_in_at))/60000):0;
  const workedStr=workedMins>0?`${Math.floor(workedMins/60)}s ${workedMins%60}dk`:"—";
  const handleCheckIn=async()=>{const today=businessDayKey(new Date());const{data,error}=await supabase.from("shifts").upsert({staff_id:staffUser.id,date:today,checked_in_at:new Date().toISOString(),status:"active",store_id:staffUser?.store_ids?.[0]},{onConflict:"staff_id,date"}).select().single();if(error){alert("Vardiyaya girilemedi: "+error.message);return;}setShift(data);};
  const handleCheckOut=async()=>{if(!confirm("Vardiyadan çıkış yapılsın mı? (Bildirimler kesilir)"))return;const today=businessDayKey(new Date());const{data}=await supabase.from("shifts").update({status:"done",checked_out_at:new Date().toISOString()}).eq("staff_id",staffUser.id).eq("date",today).select().single();setShift(data);};
  return(<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24}}>
      <h1 style={{color:"#F0EDE8",fontFamily:cv,fontSize:28,letterSpacing:"-0.5px",margin:0}}>Vardiyam</h1>
      {!shift?.checked_in_at
        ? <button onClick={handleCheckIn} style={{padding:"10px 18px",background:"#FFFFFF",border:"none",color:"#000",fontFamily:cv,fontSize:16,cursor:"pointer",borderRadius:8}}>Vardiyaya gir</button>
        : shift?.status==="active"
          ? <button onClick={handleCheckOut} style={{padding:"10px 18px",background:"#C87A6A",border:"none",color:"#fff",fontFamily:cv,fontSize:16,fontWeight:700,cursor:"pointer",borderRadius:8}}>Vardiyadan çık</button>
          : <button onClick={handleCheckIn} style={{padding:"10px 18px",background:"#FFFFFF",border:"none",color:"#000",fontFamily:cv,fontSize:16,cursor:"pointer",borderRadius:8}}>Tekrar gir</button>}
    </div>
    {!shift?.checked_in_at ? (
      <div style={{background:"#1A1A1A",border:"1px solid #2A2A2A",borderRadius:10,padding:"9px 14px",marginBottom:16,color:"#8A8580",fontFamily:cv,fontSize:12}}>
        Unutursan dert değil: bugünkü ilk siparişin ya da tahsilatınla vardiyan kendiliğinden açılır. Düğme, tam giriş saatini kaydetmek isteyenler için.
      </div>
    ) : (
      <div style={{background:"#1A1A1A",border:"1px solid #FFFFFF",borderRadius:10,padding:"11px 14px",marginBottom:16,display:"flex",alignItems:"baseline",justifyContent:"space-between",gap:10,flexWrap:"wrap"}}>
        <div>
          <div style={{color:"#8A8580",fontFamily:cvc,fontSize:12,letterSpacing:"0.2px",fontWeight:600}}>Vardiya açık</div>
          <div style={{color:"#F0EDE8",fontFamily:cv,fontSize:22,marginTop:4}}>{checkedIn} → şimdi</div>
          <div style={{color:"#8A8580",fontFamily:cv,fontSize:12,marginTop:4}}>İlk siparişinle kendiliğinden açılır — unutsan da tutuyor</div>
        </div>
        <span style={{color:"#F0EDE8",fontFamily:cv,fontSize:18}}>{workedStr}</span>
      </div>
    )}
    {staffUser?.telegram_chat_id
      ? <div style={{background:"#161616",border:"1px solid #2A2A2A",borderRadius:10,padding:"10px 14px",marginBottom:16,color:"#FFFFFF",fontFamily:cvc,fontSize:12,fontWeight:700,letterSpacing:"0.5px"}}>✈️ Telegram bildirimleri açık — vardiyadayken siparişler telefonuna gelir</div>
      : <a href={"https://t.me/BaycuraBot?start="+staffUser?.id} target="_blank" rel="noreferrer" style={{display:"block",background:"#1C2B3A",border:"1px solid #2E4A66",borderRadius:10,padding:"12px 14px",marginBottom:16,color:"#5FB0E8",fontFamily:cvc,fontSize:13,fontWeight:700,letterSpacing:"0.5px",textDecoration:"none",textAlign:"center"}}>✈️ Telegram bildirimlerini aç — sipariş geldiğinde telefonuna mesaj gelsin</a>}
    {ikramlar.length>0&&(
      <div style={{background:"#1A1A1A",border:"1px solid #2A2A2A",borderRadius:12,padding:"13px 15px",marginBottom:16}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",gap:10}}>
          <div style={{color:"#8A8580",fontFamily:cvc,fontSize:12,letterSpacing:"0.2px",fontWeight:600}}>Bu vardiyada ikram ettiklerin</div>
          <span style={{color:"#F0EDE8",fontFamily:cv,fontSize:16}}>₺{Math.round(ikramlar.reduce((s,i)=>s+Number(i.final_price||0)*Number(i.quantity||1),0)).toLocaleString("tr-TR")}</span>
        </div>
        <div style={{color:"#F0EDE8",fontFamily:cv,fontSize:13,marginTop:6,lineHeight:1.5}}>
          {ikramlar.map(i=>i.product_name+(Number(i.quantity||1)>1?" ×"+i.quantity:"")).join(" · ")}
        </div>
      </div>
    )}
    <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:24}}>
      {[["BUGÜNKÜ CİRO",`₺${Math.round(revenue).toLocaleString()}`,"#FFFFFF","💰"],["SİPARİŞ",orderCount.toString(),"#FFFFFF","📋"],["ORT. SEPET",`₺${avg.toLocaleString()}`,"#F0EDE8","📊"]].map(([l,v,c,icon])=>(<div key={l} style={{background:"#1E1E1E",border:"1px solid #2A2A2A",borderRadius:12,padding:16}}><div style={{display:"flex",justifyContent:"space-between"}}><div><div style={{color:"#888",fontFamily:cvc,fontSize:12,letterSpacing:"0.2px",marginBottom:4}}>{l}</div><div style={{color:c,fontFamily:cv,fontSize:26}}>{v}</div></div><span style={{fontSize:22,opacity:.5}}>{icon}</span></div></div>))}
    </div>
    {!staffUser?.telegram_chat_id&&(
      <a href={"https://t.me/BaycuraBot?start="+staffUser?.id} target="_blank" rel="noreferrer" style={{display:"flex",alignItems:"center",gap:10,background:"#1C2733",border:"1px solid #2AABEE",borderRadius:12,padding:"14px 16px",marginBottom:24,textDecoration:"none"}}>
        <span style={{fontSize:22}}>✈️</span>
        <div style={{flex:1}}>
          <div style={{color:"#F0EDE8",fontFamily:cvc,fontSize:14,fontWeight:700}}>Telegram bildirimlerini aç</div>
          <div style={{color:"#8AB4D8",fontFamily:cvc,fontSize:11,marginTop:2}}>Vardiyadayken yeni sipariş ve "hazır" bildirimleri telefonuna gelsin</div>
        </div>
        <span style={{color:"#2AABEE",fontSize:18}}>›</span>
      </a>
    )}
    <a href={"https://t.me/BaycuraBot?start="+staffUser?.id} target="_blank" rel="noreferrer" style={{display:"flex",alignItems:"center",gap:10,background:"#17212B",border:"1px solid #2AABEE",borderRadius:12,padding:"12px 16px",marginBottom:24,textDecoration:"none"}}>
      <span style={{fontSize:22}}>✈️</span>
      <div>
        <div style={{color:"#2AABEE",fontFamily:cvc,fontSize:13,fontWeight:700}}>Telegram bildirimlerini aç</div>
        <div style={{color:"#888",fontFamily:cvc,fontSize:11,marginTop:2}}>Vardiyadayken yeni sipariş ve "hazır" bildirimleri telefonuna gelsin</div>
      </div>
    </a>
    <div style={{background:"#1E1E1E",border:"1px solid #2A2A2A",borderRadius:12,padding:18,marginBottom:24}}>
      <div style={{color:"#F0EDE8",fontFamily:cv,fontSize:18,marginBottom:14}}>Vardiya Bilgisi</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12}}>
        {[["GİRİŞ",checkedIn],["SÜRE",workedStr],["DURUM",shift?.status==="active"?"Aktif":shift?.status==="done"?"Bitti":"—"]].map(([l,v])=>(<div key={l} style={{background:"#111",borderRadius:8,padding:"10px 12px"}}><div style={{color:"#888888",fontFamily:cvc,fontSize:12,letterSpacing:"0.2px",marginBottom:4}}>{l}</div><div style={{color:"#F0EDE8",fontFamily:cvc,fontSize:14,fontWeight:700}}>{v}</div></div>))}
      </div>
    </div>
    <div style={{color:"#F0EDE8",fontFamily:cv,fontSize:18,marginBottom:12}}>Son Siparişlerim</div>
    {loading&&<div style={{color:"#888",fontFamily:cvc,fontSize:12,textAlign:"center",padding:24}}>Yükleniyor...</div>}
    {orders.map(o=>(<div key={o.id} style={{background:"#1E1E1E",border:"1px solid #2A2A2A",borderRadius:10,padding:"12px 16px",marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <div><div style={{color:"#F0EDE8",fontFamily:cvc,fontSize:13,fontWeight:700}}>{o.cafe_tables?.name}</div><div style={{color:"#888",fontFamily:cvc,fontSize:11,marginTop:2}}>{(o.order_items||[]).slice(0,2).map(i=>i.product_name).join(", ")}</div></div>
      <div style={{color:"#FFFFFF",fontFamily:cv,fontSize:18}}>₺{Math.round(o.total||0).toLocaleString()}</div>
    </div>))}
  </div>);}