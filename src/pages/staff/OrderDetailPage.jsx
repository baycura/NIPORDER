import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase.js";

const cv = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";

export default function OrderDetailPage() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [items, setItems] = useState([]);
  const [table, setTable] = useState(null);
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [selectedCat, setSelectedCat] = useState(null);
  const [hh, setHh] = useState(null);
  const [showMenu, setShowMenu] = useState(true);
  const [busy, setBusy] = useState(false);
  const [optModal, setOptModal] = useState(null);
  const [optSelected, setOptSelected] = useState({});
  const [optNote, setOptNote] = useState("");
  const [editingNote, setEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");

  const load = async () => {
    const [{data: ord}, {data: its}, {data: cats}, {data: prods}, hhRes] = await Promise.all([
      supabase.from("orders").select("*").eq("id", orderId).single(),
      supabase.from("order_items").select("*, products(name)").eq("order_id", orderId).order("created_at"),
      supabase.from("categories").select("*").eq("is_active", true).order("sort_order"),
      supabase.from("products").select("*").eq("is_available", true).order("sort_order"),
      supabase.rpc("get_active_happy_hour").then(r => r).catch(() => ({data: null})),
    ]);
    setOrder(ord);
    setItems(its || []);
    if (cats) { setCategories(cats); if (cats.length && !selectedCat) setSelectedCat(cats[0].id); }
    if (prods) setProducts(prods);
    if (hhRes?.data?.[0]) setHh(hhRes.data[0]);
    if (ord?.table_id) {
      const { data: tab } = await supabase.from("cafe_tables").select("*").eq("id", ord.table_id).single();
      setTable(tab);
    }
  };

  useEffect(() => { load(); }, [orderId]);

  const calcPrice = (p) => {
    let pct = 0;
    if (hh && (hh.category_ids?.length === 0 || hh.category_ids?.includes(p.category_id))) pct = Number(hh.discount_pct);
    if (Number(p.instant_discount_pct) > pct) pct = Number(p.instant_discount_pct);
    return Math.round(Number(p.price) * (100 - pct) / 100);
  };

  const onProductTap = (p) => {
    if (p.sold_out_today) { alert("Bu urun bugun tukendi: " + (p.unavailable_reason || "")); return; }
    if (p.has_options && p.options_config) { setOptModal(p); setOptSelected({}); setOptNote(""); }
    else { addItem(p, null, null); }
  };

  const addItem = async (p, options, note) => {
    if (busy) return;
    setBusy(true);
    const finalPrice = calcPrice(p);
    const { error } = await supabase.from("order_items").insert({
      order_id: orderId, product_id: p.id, quantity: 1,
      product_name: p.name, product_price: Number(p.price), final_price: finalPrice,
      kitchen_status: "pending", sent_to_kitchen: false,
      notes: note || null, selected_options: options || null,
    });
    if (error) alert("Hata: " + error.message);
    await load(); await recalcTotal(); setBusy(false);
  };

  const confirmOptions = async () => {
    if (!optModal) return;
    const cfg = optModal.options_config || {};
    for (const group of cfg.groups || []) {
      if (group.required && !optSelected[group.name]) { alert("Lutfen " + group.name + " sec"); return; }
    }
    await addItem(optModal, optSelected, optNote.trim() || null);
    setOptModal(null);
  };

  const updateQty = async (item, delta) => {
    if (busy) return;
    setBusy(true);
    const newQty = item.quantity + delta;
    if (newQty <= 0) await supabase.from("order_items").delete().eq("id", item.id);
    else await supabase.from("order_items").update({ quantity: newQty }).eq("id", item.id);
    await load(); await recalcTotal(); setBusy(false);
  };

  const recalcTotal = async () => {
    const { data: its } = await supabase.from("order_items").select("quantity, final_price").eq("order_id", orderId);
    const subtotal = (its || []).reduce((s, it) => s + Number(it.final_price) * (it.quantity||0), 0);
    await supabase.from("orders").update({ subtotal, total: subtotal }).eq("id", orderId);
  };

  const sendToKitchen = async () => {
    if (busy || items.length === 0) return;
    setBusy(true);
    await supabase.from("order_items").update({ kitchen_status: "preparing", sent_to_kitchen: true }).eq("order_id", orderId).eq("kitchen_status", "pending");
    await supabase.from("orders").update({ status: "preparing" }).eq("id", orderId);
    setBusy(false);
    navigate("/orders");
  };

  const cancelOrder = async () => {
    if (!confirm("Iptal?")) return;
    await supabase.from("order_items").delete().eq("order_id", orderId);
    await supabase.from("orders").delete().eq("id", orderId);
    navigate("/tables");
  };

  const saveNote = async () => {
    await supabase.from("orders").update({ notes: noteDraft.trim() || null }).eq("id", orderId);
    setEditingNote(false); load();
  };

  const saveName = async () => {
    const n = nameDraft.trim();
    if (!n) { setEditingName(false); return; }
    await supabase.from("orders").update({ customer_name: n }).eq("id", orderId);
    setEditingName(false); load();
  };

  if (!order) return (<div style={{color:"#888",padding:20,fontFamily:cv}}>Yukleniyor...</div>);

  const visibleProducts = products.filter(p => p.category_id === selectedCat);
  const headTitle = table ? table.name : (order.customer_name ? "👤 " + order.customer_name : "Hesap");
  const pendingCount = items.filter(i => i.kitchen_status === "pending" || !i.sent_to_kitchen).length;

  return (
    <div style={{fontFamily:cv,color:"#F0EDE8",paddingBottom:120}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
        <button onClick={() => navigate("/tables")} style={{background:"none",border:"none",color:"#C8973E",fontSize:14,cursor:"pointer",padding:0,fontWeight:600}}>← Masalar</button>
        <button onClick={cancelOrder} style={{background:"none",border:"none",color:"#888",fontSize:11,cursor:"pointer",padding:0}}>Iptal Et</button>
      </div>

      <div style={{fontSize:24,fontWeight:800,marginBottom:4,display:"flex",alignItems:"center",gap:8}}>
        {editingName ? (
          <input autoFocus value={nameDraft} onChange={e=>setNameDraft(e.target.value)} onBlur={saveName} onKeyDown={e=>e.key==="Enter"&&saveName()} style={{flex:1,padding:"6px 10px",background:"#0C0C0C",border:"1px solid #C8973E",borderRadius:8,color:"#F0EDE8",fontSize:20,fontWeight:800,outline:"none",fontFamily:"inherit"}}/>
        ) : (
          <>
            <span>{headTitle}</span>
            {!table && <button onClick={()=>{setEditingName(true); setNameDraft(order.customer_name||"");}} style={{background:"none",border:"none",color:"#666",fontSize:14,cursor:"pointer"}}>✏</button>}
          </>
        )}
      </div>
      <div style={{fontSize:11,color:"#888",marginBottom:10}}>{items.length === 0 ? "Bos hesap" : items.reduce((s,i)=>s+(i.quantity||0),0) + " urun · ₺" + (order.total||0)}</div>

      {editingNote ? (
        <div style={{background:"#1A1A1A",border:"1px solid #C8973E",borderRadius:10,padding:10,marginBottom:14}}>
          <textarea autoFocus value={noteDraft} onChange={e=>setNoteDraft(e.target.value)} placeholder="Siparis notu..." rows={2} style={{width:"100%",padding:"8px",background:"#0C0C0C",border:"1px solid #2A2A2A",borderRadius:6,color:"#F0EDE8",fontSize:13,outline:"none",resize:"vertical",fontFamily:"inherit"}}/>
          <div style={{display:"flex",gap:6,marginTop:8}}>
            <button onClick={()=>setEditingNote(false)} style={{padding:"6px 10px",background:"transparent",color:"#888",border:"1px solid #333",borderRadius:6,fontSize:11,cursor:"pointer"}}>Vazgec</button>
            <button onClick={saveNote} style={{padding:"6px 10px",background:"#C8973E",color:"#000",border:"none",borderRadius:6,fontSize:11,fontWeight:700,cursor:"pointer"}}>Kaydet</button>
          </div>
        </div>
      ) : order.notes ? (
        <div onClick={()=>{setEditingNote(true); setNoteDraft(order.notes||"");}} style={{background:"rgba(200,151,62,0.1)",border:"1px solid rgba(200,151,62,0.3)",borderRadius:10,padding:10,marginBottom:14,cursor:"pointer"}}>
          <div style={{fontSize:10,color:"#C8973E",letterSpacing:"1px",fontWeight:700,marginBottom:3}}>NOT</div>
          <div style={{fontSize:13,color:"#F0EDE8"}}>{order.notes}</div>
        </div>
      ) : (
        <button onClick={()=>{setEditingNote(true); setNoteDraft("");}} style={{width:"100%",padding:"10px",background:"transparent",color:"#666",border:"1px dashed #333",borderRadius:8,fontSize:12,cursor:"pointer",marginBottom:14}}>+ Siparis notu ekle</button>
      )}

      {items.length > 0 && (
        <div style={{background:"#1A1A1A",border:"1px solid #2A2A2A",borderRadius:12,padding:12,marginBottom:14}}>
          {items.map(it => {
            const editable = it.kitchen_status === "pending" && !it.sent_to_kitchen;
            return (<div key={it.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 0",borderBottom:"1px solid #2A2A2A"}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:14,fontWeight:600,color:"#F0EDE8"}}>{it.products?.name || it.product_name || "Urun"}</div>
                {it.selected_options && <div style={{fontSize:10,color:"#C8973E",marginTop:2}}>{Object.values(it.selected_options).join(", ")}</div>}
                {it.notes && <div style={{fontSize:10,color:"#FFD27A",marginTop:2,fontStyle:"italic"}}>Not: {it.notes}</div>}
                <div style={{fontSize:11,color:"#888",marginTop:2}}>₺{it.final_price} {it.kitchen_status === "preparing" && "· Mutfakta"}{it.kitchen_status === "ready" && "· Hazir"}</div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <button onClick={() => updateQty(it, -1)} disabled={!editable} style={{width:28,height:28,background:"#2A2A2A",color:"#F0EDE8",border:"none",borderRadius:6,fontSize:18,cursor:editable?"pointer":"not-allowed",opacity:editable?1:0.4}}>−</button>
                <div style={{width:24,textAlign:"center",fontSize:14,fontWeight:700}}>{it.quantity}</div>
                <button onClick={() => updateQty(it, +1)} disabled={!editable} style={{width:28,height:28,background:"#C8973E",color:"#000",border:"none",borderRadius:6,fontSize:18,cursor:editable?"pointer":"not-allowed",opacity:editable?1:0.4}}>+</button>
              </div>
            </div>);
          })}
        </div>
      )}

      <button onClick={() => setShowMenu(!showMenu)} style={{width:"100%",padding:"12px",background:showMenu?"#1A1A1A":"#C8973E",color:showMenu?"#888":"#000",border:"1px solid "+(showMenu?"#2A2A2A":"#C8973E"),borderRadius:10,fontSize:13,fontWeight:700,cursor:"pointer",marginBottom:12}}>
        {showMenu ? "Menuyu Gizle ↑" : "+ Urun Ekle"}
      </button>

      {showMenu && (<>
        <div style={{display:"flex",gap:6,overflowX:"auto",marginBottom:12,paddingBottom:4}}>
          {categories.map(c => (
            <button key={c.id} onClick={() => setSelectedCat(c.id)} style={{flexShrink:0,padding:"6px 12px",border:"none",borderRadius:14,fontSize:11,fontWeight:700,background:selectedCat===c.id?"#C8973E":"#222",color:selectedCat===c.id?"#000":"#888",cursor:"pointer",whiteSpace:"nowrap",letterSpacing:"0.5px"}}>
              {c.icon && <span style={{marginRight:3}}>{c.icon}</span>}{c.name?.toUpperCase()}
            </button>
          ))}
        </div>
        <div>
          {visibleProducts.map(p => {
            const fp = calcPrice(p);
            const dis = fp < Number(p.price);
            const soldOut = p.sold_out_today;
            return (
              <div key={p.id} onClick={() => onProductTap(p)} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px",background:"#1A1A1A",border:"1px solid "+(soldOut?"#552222":"#2A2A2A"),borderRadius:10,marginBottom:6,cursor:"pointer",opacity:soldOut?0.5:1}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:14,fontWeight:600,color:"#F0EDE8"}}>{p.name}</div>
                  {soldOut && <div style={{fontSize:10,color:"#FFB0B0",marginTop:2}}>{p.unavailable_reason || "Tukendi"}</div>}
                  {p.has_options && <div style={{fontSize:10,color:"#C8973E",marginTop:2}}>Secenekli</div>}
                </div>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  {dis && <span style={{fontSize:11,color:"#888",textDecoration:"line-through"}}>₺{p.price}</span>}
                  <span style={{fontSize:14,fontWeight:700,color:dis?"#C8973E":"#F0EDE8"}}>₺{fp}</span>
                  <div style={{width:28,height:28,background:soldOut?"#333":"#C8973E",color:soldOut?"#666":"#000",borderRadius:6,fontSize:18,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center"}}>+</div>
                </div>
              </div>
            );
          })}
        </div>
      </>)}

      {pendingCount > 0 && (
        <div style={{position:"fixed",bottom:78,left:14,right:14,zIndex:35}}>
          <button onClick={sendToKitchen} disabled={busy} style={{width:"100%",padding:"16px",background:"#3ECF8E",color:"#000",border:"none",borderRadius:14,fontSize:15,fontWeight:800,cursor:"pointer",boxShadow:"0 4px 16px rgba(62,207,142,0.4)"}}>
            🍳 Mutfaga Gonder · ₺{order.total || 0}
          </button>
        </div>
      )}

      {optModal && (
        <div onClick={() => setOptModal(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:100}}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#161616",border:"1px solid #2A2A2A",borderRadius:"16px 16px 0 0",padding:20,width:"100%",maxWidth:500,maxHeight:"90vh",overflowY:"auto"}}>
            <div style={{fontSize:18,fontWeight:800,color:"#F0EDE8",marginBottom:4}}>{optModal.name}</div>
            <div style={{fontSize:11,color:"#888",marginBottom:16}}>₺{calcPrice(optModal)}</div>
            {(optModal.options_config?.groups || []).map(group => (
              <div key={group.name} style={{marginBottom:14}}>
                <div style={{fontSize:10,color:"#888",letterSpacing:"1.5px",fontWeight:700,marginBottom:6}}>{group.name?.toUpperCase()}</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                  {(group.options || []).map(opt => (
                    <button key={opt} onClick={()=>setOptSelected({...optSelected, [group.name]: opt})} style={{padding:"10px 14px",background:optSelected[group.name]===opt?"#C8973E":"#222",color:optSelected[group.name]===opt?"#000":"#aaa",border:"1px solid "+(optSelected[group.name]===opt?"#C8973E":"#333"),borderRadius:10,fontSize:13,fontWeight:700,cursor:"pointer"}}>{opt}</button>
                  ))}
                </div>
              </div>
            ))}
            <div style={{marginBottom:14}}>
              <div style={{fontSize:10,color:"#888",letterSpacing:"1.5px",fontWeight:700,marginBottom:6}}>NOT (OPSIYONEL)</div>
              <input value={optNote} onChange={e=>setOptNote(e.target.value)} placeholder="orn: buzsuz" style={{width:"100%",padding:"10px 12px",background:"#0C0C0C",border:"1px solid #2A2A2A",borderRadius:8,color:"#F0EDE8",fontSize:13,outline:"none",fontFamily:"inherit"}}/>
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={() => setOptModal(null)} style={{flex:1,padding:"12px",background:"transparent",color:"#888",border:"1px solid #333",borderRadius:10,fontSize:14,fontWeight:700,cursor:"pointer"}}>Iptal</button>
              <button onClick={confirmOptions} style={{flex:2,padding:"12px",background:"#C8973E",color:"#000",border:"none",borderRadius:10,fontSize:14,fontWeight:800,cursor:"pointer"}}>Sepete Ekle</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
