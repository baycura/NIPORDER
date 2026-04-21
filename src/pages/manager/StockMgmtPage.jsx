import{useState,useEffect}from"react";import{supabase}from"../../lib/supabase.js";
const cv="'Coolvetica','Bebas Neue',sans-serif";const cvc="'Coolvetica Condensed','Barlow Condensed',sans-serif";
function alertLevel(i){if(i.current_stock<=0)return"out";if(i.current_stock<i.min_stock*.5)return"critical";if(i.current_stock<i.min_stock)return"low";return"ok";}
const AC={out:"#E05A5A",critical:"#E05A5A",low:"#E07A3E",ok:"#3ECF8E"};
const AL={out:"Tükendi",critical:"Kritik",low:"Düşük",ok:"Yeterli"};
function EntryModal({item,staffId,onClose,onDone}){
  const[qty,setQty]=useState("");const[note,setNote]=useState("");const[saving,setSaving]=useState(false);
  const save=async()=>{const n=parseFloat(qty);if(!n||n<=0)return;setSaving(true);const before=item.current_stock;const after=before+n;await supabase.from("stock_movements").insert({stock_item_id:item.id,type:"in",quantity:n,before_stock:before,after_stock:after,note:note||"Stok girişi",staff_id:staffId});await supabase.from("stock_items").update({current_stock:after,updated_at:new Date()}).eq("id",item.id);setSaving(false);onDone();onClose();};
  return(<div onClick={onClose} style={{position:"fixed",inset:0,background:"#000000bb",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center"}}><div onClick={e=>e.stopPropagation()} style={{background:"#161616",border:"1px solid #2A2A2A",borderRadius:16,padding:28,width:360}}>
    <div style={{color:"#F0EDE8",fontFamily:cv,fontSize:22,marginBottom:4}}>Stok Girişi</div>
    <div style={{color:"#888",fontFamily:cvc,fontSize:12,marginBottom:20}}>{item.name} · {item.current_stock} {item.unit}</div>
    <input type="number" value={qty} onChange={e=>setQty(e.target.value)} placeholder="Miktar" style={{width:"100%",background:"#111",border:"1px solid #2A2A2A",borderRadius:8,padding:"11px 14px",color:"#F0EDE8",fontFamily:cvc,fontSize:16,marginBottom:12}}/>
    <input value={note} onChange={e=>setNote(e.target.value)} placeholder="Not (opsiyonel)" style={{width:"100%",background:"#111",border:"1px solid #2A2A2A",borderRadius:8,padding:"10px 14px",color:"#F0EDE8",fontFamily:cvc,fontSize:14,marginBottom:20}}/>
    <div style={{display:"flex",gap:10}}><button onClick={onClose} style={{flex:1,padding:"11px",background:"transparent",border:"1px solid #2A2A2A",color:"#888",borderRadius:8,cursor:"pointer",fontFamily:cvc,fontSize:12}}>İptal</button><button onClick={save} disabled={saving} style={{flex:2,padding:"11px",background:saving?"#333":"#3ECF8E",border:"none",color:"#000",borderRadius:8,cursor:"pointer",fontFamily:cv,fontSize:16}}>{saving?"KAYDEDİLİYOR...":"STOKA EKLE"}</button></div>
  </div></div>);}
export default function StockMgmtPage(){
  const[tab,setTab]=useState("stock");const[items,setItems]=useState([]);const[movements,setMovements]=useState([]);const[loading,setLoading]=useState(true);const[entry,setEntry]=useState(null);const[search,setSearch]=useState("");
  const loadItems=async()=>{const{data}=await supabase.from("stock_items").select("*").order("name");setItems(data||[]);setLoading(false);};
  const loadMov=async()=>{const{data}=await supabase.from("stock_movements").select("*,stock_items(name,unit)").order("created_at",{ascending:false}).limit(50);setMovements(data||[]);setLoading(false);};
  useEffect(()=>{if(tab==="stock")loadItems();else if(tab==="movements")loadMov();},[tab]);
  const alerts=items.filter(i=>alertLevel(i)!=="ok");
  const filtered=items.filter(i=>!search||i.name?.toLowerCase().includes(search.toLowerCase()));
  const typeColor={in:"#3ECF8E",out:"#E07A3E",adjustment:"#C8973E",waste:"#E05A5A"};
  const typeLabel={in:"Giriş",out:"Çıkış",adjustment:"Düzeltme",waste:"Fire"};
  return(<div>
    <h1 style={{color:"#F0EDE8",fontFamily:cv,fontSize:28,letterSpacing:"-0.5px",margin:"0 0 20px"}}>Stok Yönetimi</h1>
    <div style={{display:"flex",gap:6,marginBottom:20}}>{[["stock","Stok"],["movements","Hareketler"]].map(([id,lbl])=>(<button key={id} onClick={()=>setTab(id)} style={{padding:"7px 16px",borderRadius:8,border:"none",fontFamily:cvc,fontSize:11,letterSpacing:"1px",cursor:"pointer",background:tab===id?"#C8973E":"transparent",color:tab===id?"#000":"#888",outline:tab!==id?"1px solid #2A2A2A":"none"}}>{lbl}</button>))}</div>
    {tab==="stock"&&(<div>
      {alerts.length>0&&<div style={{background:"rgba(224,90,90,0.12)",border:"1px solid #E05A5A",borderRadius:10,padding:"10px 16px",marginBottom:16,display:"flex",gap:10}}><span>⚠️</span><span style={{color:"#E05A5A",fontFamily:cvc,fontSize:12}}>{alerts.length} ürün kritik: {alerts.map(a=>a.name).join(", ")}</span></div>}
      <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Ürün ara..." style={{width:"100%",background:"#111",border:"1px solid #2A2A2A",borderRadius:8,padding:"10px 14px",color:"#F0EDE8",fontFamily:cvc,fontSize:14,marginBottom:16}}/>
      {loading&&<div style={{color:"#888",textAlign:"center",padding:40}}>YÜKLENİYOR...</div>}
      <div style={{background:"#1E1E1E",border:"1px solid #2A2A2A",borderRadius:12,overflow:"hidden"}}>
        {filtered.map((item,i)=>{const lvl=alertLevel(item);const color=AC[lvl];return(<div key={item.id} style={{display:"grid",gridTemplateColumns:"1.8fr 1fr 1fr .8fr",padding:"11px 16px",alignItems:"center",borderBottom:i<filtered.length-1?"1px solid #2A2A2A":"none",background:lvl==="critical"||lvl==="out"?"rgba(224,90,90,0.08)":"transparent"}}>
          <span style={{color:"#F0EDE8",fontFamily:cvc,fontSize:13,fontWeight:700}}>{item.name}</span>
          <span style={{color:lvl!=="ok"?"#E05A5A":"#F0EDE8",fontFamily:cv,fontSize:16}}>{item.current_stock} {item.unit}</span>
          <span style={{color:"#888",fontFamily:cvc,fontSize:12}}>{item.min_stock} {item.unit}</span>
          <div style={{display:"flex",gap:6,alignItems:"center"}}><span style={{background:color+"22",color,fontFamily:cvc,fontSize:10,padding:"2px 7px",borderRadius:3}}>{AL[lvl]}</span><button onClick={()=>setEntry(item)} style={{background:"rgba(62,207,142,0.12)",border:"1px solid #3ECF8E",color:"#3ECF8E",borderRadius:5,padding:"3px 8px",cursor:"pointer",fontFamily:cvc,fontSize:10}}>+</button></div>
        </div>);})}
      </div>
      {entry&&<EntryModal item={entry} staffId={null} onClose={()=>setEntry(null)} onDone={loadItems}/>}
    </div>)}
    {tab==="movements"&&(<div style={{background:"#1E1E1E",border:"1px solid #2A2A2A",borderRadius:12,overflow:"hidden"}}>
      {loading&&<div style={{color:"#888",textAlign:"center",padding:24}}>YÜKLENİYOR...</div>}
      {movements.map((m,i)=>(<div key={m.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"11px 16px",borderBottom:i<movements.length-1?"1px solid #2A2A2A":"none"}}>
        <div><div style={{color:"#F0EDE8",fontFamily:cvc,fontSize:13,fontWeight:700}}>{m.stock_items?.name}</div><div style={{color:"#888",fontFamily:cvc,fontSize:11}}>{new Date(m.created_at).toLocaleDateString("tr")}{m.note&&" · "+m.note}</div></div>
        <div style={{textAlign:"right"}}><div style={{color:typeColor[m.type]||"#888",fontFamily:cv,fontSize:16}}>{m.type==="in"?"+":"-"}{m.quantity} {m.stock_items?.unit}</div><span style={{background:(typeColor[m.type]||"#888")+"22",color:typeColor[m.type]||"#888",fontFamily:cvc,fontSize:9,padding:"2px 6px",borderRadius:3}}>{typeLabel[m.type]||m.type}</span></div>
      </div>))}
      {movements.length===0&&!loading&&<div style={{color:"#888",fontFamily:cvc,fontSize:12,textAlign:"center",padding:32}}>Henüz hareket yok</div>}
    </div>)}
  </div>);}