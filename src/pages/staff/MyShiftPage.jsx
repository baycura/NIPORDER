import{useState,useEffect}from"react";import{useNavigate}from"react-router-dom";import{supabase}from"../../lib/supabase.js";import{useAuth}from"../../contexts/AuthContext.jsx";
import{businessDayStart,businessDayKey}from"../../lib/businessDay.js";
import Ikon from "../../components/Ikon.jsx";
import { onayla } from "../../lib/onayla.js";
import { baslikStil } from "../../theme/panel.js";
import HaftalikLig from "../../components/HaftalikLig.jsx";
import TelegramBagla from "../../components/TelegramBagla.jsx";
import Bildirim from "../../components/Bildirim.jsx";
import { tl } from "../../lib/para.js";
import { personelHata } from "../../lib/errorText.js";
const cv="'Coolvetica','Bebas Neue',sans-serif";const cvc="'Coolvetica Condensed','Barlow Condensed',sans-serif";
export default function MyShiftPage(){
  const{staffUser}=useAuth();const navigate=useNavigate();const[orders,setOrders]=useState([]);const[shift,setShift]=useState(null);const[loading,setLoading]=useState(true);
  // yukHata: vardiya kaydi okunamadi. O durumda "Vardiyaya gir" GOSTERILMEZ:
  // dugme var olan giris saatinin ustune yazardi.
  const[yukHata,setYukHata]=useState(false);const[hata,setHata]=useState(null);const[mesgul,setMesgul]=useState(false);
  const hataGoster=(err)=>setHata({m:personelHata(err),n:Date.now()});
  // Bu vardiyada SENIN verdigin ikramlar. Siparisi baskasi acmis olabilir, o
  // yuzden siparisin staff_id'sine degil kalemin treated_by alanina bakiyoruz.
  const[ikramlar,setIkramlar]=useState([]);
  const yukle=()=>{if(!staffUser?.id)return;
    // Isletme gunu 03:00'te baslar: gece 01'de bakan garson dunun vardiyasini gorur
    const bizDate=businessDayKey(new Date());const bizStart=businessDayStart().toISOString();
    setLoading(true);
    Promise.all([supabase.from("orders").select("*,cafe_tables(name),order_items(*)").eq("staff_id",staffUser.id).eq("status","paid").gte("paid_at",bizStart).order("paid_at",{ascending:false}),supabase.from("shifts").select("*").eq("staff_id",staffUser.id).eq("date",bizDate).maybeSingle()])
    .then(([o,s])=>{
      // supabase-js reject etmez: hata {error} olarak doner. Okunamayan vardiya
      // "hic girilmemis" gibi gorunmesin.
      if(!o.error)setOrders(o.data||[]);
      if(s.error){setYukHata(true);}else{setYukHata(false);setShift(s.data);}
      setLoading(false);
    },()=>{setYukHata(true);setLoading(false);});
    supabase.from("order_items").select("product_name,quantity,final_price,orders!inner(created_at)")
      .eq("treated_by",staffUser.id).gte("orders.created_at",bizStart)
      .then(({data})=>setIkramlar(data||[]),()=>{});
  };
  useEffect(()=>{yukle();},[staffUser]);
  const revenue=orders.reduce((s,o)=>s+(o.total||0),0);const orderCount=orders.length;const avg=orderCount>0?Math.round(revenue/orderCount):0;
  const checkedIn=shift?.checked_in_at?new Date(shift.checked_in_at).toLocaleTimeString("tr",{hour:"2-digit",minute:"2-digit"}):"—";
  // Vardiya bittiyse sure cikis saatine kadar sayilir (eskiden "simdi"ye kadar artiyordu).
  const bitti=shift?.status==="done"&&!!shift?.checked_out_at;
  const saatYaz=(iso)=>new Date(iso).toLocaleTimeString("tr",{hour:"2-digit",minute:"2-digit"});
  const cikisSaati=bitti?saatYaz(shift.checked_out_at):null;
  const workedMins=shift?.checked_in_at?Math.max(0,Math.floor(((bitti?new Date(shift.checked_out_at).getTime():Date.now())-new Date(shift.checked_in_at).getTime())/60000)):0;
  const workedStr=workedMins>0?(workedMins<60?`${workedMins} dk`:`${Math.floor(workedMins/60)} sa ${workedMins%60} dk`):"—";
  const handleCheckIn=async()=>{if(mesgul)return;setMesgul(true);const today=businessDayKey(new Date());const{data,error}=await supabase.from("shifts").upsert({staff_id:staffUser.id,date:today,checked_in_at:new Date().toISOString(),status:"active",store_id:staffUser?.store_ids?.[0]},{onConflict:"staff_id,date"}).select().single();setMesgul(false);if(error){hataGoster(error);return;}setShift(data);};
  const handleCheckOut=async()=>{
    if(mesgul)return;
    if(!(await onayla("Vardiyadan çıkış yapılsın mı? (Bildirimler kesilir)")))return;
    setMesgul(true);
    const today=businessDayKey(new Date());
    const{data,error}=await supabase.from("shifts").update({status:"done",checked_out_at:new Date().toISOString()}).eq("staff_id",staffUser.id).eq("date",today).select().single();
    setMesgul(false);
    // Cikis yazilamadiysa vardiya ekranda ACIK kalir (eskiden kayit ekrandan
    // silinip "Vardiyaya gir" cikiyordu; garson ciktigini saniyordu).
    if(error||!data){hataGoster(error||{message:"not found"});return;}
    setShift(data);
    // KAPANIS KURALI: dukkani kapatan vardiyada kim varsa kasayi o sayar.
    // "Son cikan" tespiti BILEREK yok: part-time'in vardiyasi ilk siparisle
    // otomatik acilir ve cikis ekranini goremedigi icin gece 03:00 cron'una
    // kadar hep aktif kalir — aktif-vardiya-kalmadi sarti hic saglanmazdi
    // (adversarial inceleme bulgusu). Bunun yerine: aksam cikisi + kapanis
    // sayimi yok = sor. Cikisi bloke etmez; atlanirsa 04:30 bekcisi sahibe
    // Telegram'dan haber verir.
    try{
      const saat=new Date().getHours();
      if(saat>=20||saat<7){
        const magaza=staffUser?.store_ids?.[0];
        if(magaza){
          // Gun sunucudan: 03:00-07:00 arasi gec kapanista "kasa gunu" dune kayar.
          const{data:oz}=await supabase.rpc("kasa_gun_ozeti",{p_store_id:magaza});
          const gun=(Array.isArray(oz)?oz[0]:oz)?.isletme_gunu;
          if(gun){
            // error kontrolu sart: supabase-js reject ETMEZ, hata {count:null}
            // olarak doner — kontrolsuz birakilsa ag hatasi "sayilmamis"
            // sanilip asilsiz uyari cikardi (inceleme bulgusu).
            const{count:sayim,error:hata}=await supabase.from("cash_counts")
              .select("id",{count:"exact",head:true})
              .eq("store_id",magaza).eq("business_day",gun).eq("tur","kapanis");
            if(!hata&&(sayim||0)===0&&(await onayla("Bu gecenin kapanış sayımı henüz yapılmadı.\nDükkanı kapatan sayar — şimdi sayalım mı?")))navigate("/cash-count");
          }
        }
      }
    }catch(e){/* kontrol basarisizsa cikis yine de tamamlanmis olsun */}
  };
  return(<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24}}>
      <h1 style={baslikStil}>Vardiyam</h1>
      {(loading||yukHata) ? null : !shift?.checked_in_at
        ? <button onClick={handleCheckIn} disabled={mesgul} style={{padding:"0 18px",minHeight:44,background:"#FFFFFF",border:"none",color:"#000",fontFamily:cv,fontSize:16,cursor:"pointer",borderRadius:8,opacity:mesgul?0.6:1}}>Vardiyaya gir</button>
        : shift?.status==="active"
          ? <button onClick={handleCheckOut} disabled={mesgul} style={{padding:"0 18px",minHeight:44,background:"#C87A6A",border:"none",color:"#fff",fontFamily:cv,fontSize:16,fontWeight:700,cursor:"pointer",borderRadius:8,opacity:mesgul?0.6:1}}>Vardiyadan çık</button>
          : <button onClick={handleCheckIn} disabled={mesgul} style={{padding:"0 18px",minHeight:44,background:"#FFFFFF",border:"none",color:"#000",fontFamily:cv,fontSize:16,cursor:"pointer",borderRadius:8,opacity:mesgul?0.6:1}}>Tekrar gir</button>}
    </div>
    {hata&&<Bildirim tur="hata" metin={hata.m} key={hata.n}/>}
    {yukHata&&(
      <div role="alert" style={{display:"flex",alignItems:"center",gap:10,background:"#1A1A1A",border:"1px solid #C87A6A",borderRadius:12,padding:"10px 14px",fontSize:13,marginBottom:16,color:"#F0EDE8",fontFamily:cv}}>
        <Ikon ad="uyari" boy={16}/>
        <span style={{flex:1}}>Bağlantı kurulamadı — vardiya bilgisi okunamadı.</span>
        <button onClick={yukle} style={{minHeight:44,padding:"0 14px",background:"transparent",color:"#F0EDE8",border:"1px solid #3A3A3A",borderRadius:10,fontWeight:700,fontFamily:"inherit",cursor:"pointer"}}>Tekrar dene</button>
      </div>
    )}
    {yukHata ? null : !shift?.checked_in_at ? (
      <div style={{background:"#1A1A1A",border:"1px solid #2A2A2A",borderRadius:10,padding:"9px 14px",marginBottom:16,color:"#8A8580",fontFamily:cv,fontSize:12}}>
        Unutursan dert değil: bugünkü ilk siparişin ya da tahsilatınla vardiyan kendiliğinden açılır. Düğme, tam giriş saatini kaydetmek isteyenler için.
      </div>
    ) : (
      <div style={{background:"#1A1A1A",border:"1px solid "+(bitti?"#2A2A2A":"#FFFFFF"),borderRadius:10,padding:"11px 14px",marginBottom:16,display:"flex",alignItems:"baseline",justifyContent:"space-between",gap:10,flexWrap:"wrap"}}>
        <div>
          <div style={{color:"#8A8580",fontFamily:cvc,fontSize:12,letterSpacing:"0.2px",fontWeight:600}}>{bitti?"Vardiya bitti":"Vardiya açık"}</div>
          <div style={{color:"#F0EDE8",fontFamily:cv,fontSize:22,marginTop:4}}>{checkedIn} → {bitti?cikisSaati:"şimdi"}</div>
          <div style={{color:"#8A8580",fontFamily:cv,fontSize:12,marginTop:4}}>{bitti?"Çıkış kaydedildi. Bildirimler kesildi.":"İlk siparişinle kendiliğinden açılır — unutsan da tutuyor"}</div>
        </div>
        <span style={{color:"#F0EDE8",fontFamily:cv,fontSize:18}}>{workedStr}</span>
      </div>
    )}
    {/* Haftalik lig: herkesin satisi yan yana, tatli rekabet. */}
    <HaftalikLig />
    <TelegramBagla bagliysaGoster/>
    {ikramlar.length>0&&(
      <div style={{background:"#1A1A1A",border:"1px solid #2A2A2A",borderRadius:12,padding:"13px 15px",marginBottom:16}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",gap:10}}>
          <div style={{color:"#8A8580",fontFamily:cvc,fontSize:12,letterSpacing:"0.2px",fontWeight:600}}>Bu vardiyada ikram ettiklerin</div>
          <span style={{color:"#F0EDE8",fontFamily:cv,fontSize:16}}>{tl(ikramlar.reduce((s,i)=>s+Number(i.final_price||0)*Number(i.quantity||1),0))}</span>
        </div>
        <div style={{color:"#F0EDE8",fontFamily:cv,fontSize:13,marginTop:6,lineHeight:1.5}}>
          {ikramlar.map(i=>i.product_name+(Number(i.quantity||1)>1?" ×"+i.quantity:"")).join(" · ")}
        </div>
      </div>
    )}
    <div style={{display:"grid",gridTemplateColumns:"repeat(3,minmax(0,1fr))",gap:8,marginBottom:24}}>
      {[["BUGÜNKÜ CİRO",tl(revenue),"#FFFFFF","kasa"],["SİPARİŞ",orderCount.toString(),"#FFFFFF","siparis"],["ORT. SEPET",tl(avg),"#F0EDE8","oylama"]].map(([l,v,c,icon])=>(<div key={l} style={{background:"#1E1E1E",border:"1px solid #2A2A2A",borderRadius:12,padding:"12px 10px",minWidth:0}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:4}}><div style={{color:"#888",fontFamily:cvc,fontSize:12,letterSpacing:"0.2px",marginBottom:4,minWidth:0}}>{l}</div><Ikon ad={icon} boy={18} style={{opacity:.5,flexShrink:0}}/></div><div style={{color:c,fontFamily:cv,fontSize:"clamp(17px,5.6vw,26px)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{v}</div></div>))}
    </div>
    <div style={{background:"#1E1E1E",border:"1px solid #2A2A2A",borderRadius:12,padding:18,marginBottom:24}}>
      <div style={{color:"#F0EDE8",fontFamily:cv,fontSize:18,marginBottom:14}}>Vardiya Bilgisi</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,minmax(0,1fr))",gap:8}}>
        {[["GİRİŞ",checkedIn],["SÜRE",workedStr],["DURUM",shift?.status==="active"?"Aktif":shift?.status==="done"?"Bitti":"—"]].map(([l,v])=>(<div key={l} style={{background:"#111",borderRadius:8,padding:"10px 12px"}}><div style={{color:"#888888",fontFamily:cvc,fontSize:12,letterSpacing:"0.2px",marginBottom:4}}>{l}</div><div style={{color:"#F0EDE8",fontFamily:cvc,fontSize:14,fontWeight:700}}>{v}</div></div>))}
      </div>
    </div>
    <div style={{color:"#F0EDE8",fontFamily:cv,fontSize:18,marginBottom:12}}>Son Siparişlerim</div>
    {loading&&<div style={{color:"#888",fontFamily:cvc,fontSize:12,textAlign:"center",padding:24}}>Yükleniyor…</div>}
    {orders.map(o=>(<div key={o.id} style={{background:"#1E1E1E",border:"1px solid #2A2A2A",borderRadius:10,padding:"12px 16px",marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <div><div style={{color:"#F0EDE8",fontFamily:cvc,fontSize:13,fontWeight:700}}>{o.cafe_tables?.name}</div><div style={{color:"#888",fontFamily:cvc,fontSize:11,marginTop:2}}>{(o.order_items||[]).slice(0,2).map(i=>i.product_name).join(", ")}</div></div>
      <div style={{color:"#FFFFFF",fontFamily:cv,fontSize:18}}>{tl(o.total)}</div>
    </div>))}
  </div>);}