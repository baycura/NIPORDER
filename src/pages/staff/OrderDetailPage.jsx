import { useEffect, useMemo, useState } from "react";
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

  const load = async () => {
    const [{data: ord}, {data: its}, {data: cats}, {data: prods}, {data: hhData}] = await Promise.all([
      supabase.from("orders").select("*").eq("id", orderId).single(),
      supabase.from("order_items").select("*, products(name)").eq("order_id", orderId).order("created_at"),
      supabase.from("categories").select("*").eq("is_active", true).order("sort_order"),
      supabase.from("products").select("*").eq("is_available", true).eq("is_out_of_stock", false).order("sort_order"),
      supabase.rpc("get_active_happy_hour"),
    ]);
    setOrder(ord);
    setItems(its || []);
    if (cats) { setCategories(cats); if (cats.length && !selectedCat) setSelectedCat(cats[0].id); }
    if (prods) setProducts(prods);
    if (hhData?.[0]) setHh(hhData[0]);
    if (ord?.table_id) {
      const { data: tab } = await supabase.from("cafe_tables").select("*").eq("id", ord.table_id).single();
      setTable(tab);
    }
  };

  useEffect(() => { load(); }, [orderId]);

  const calcPrice = (p) => {
    let pct = 0;
    if (hh && (hh.category_ids?.length === 0 || hh.category_ids?.includes(p.category_id))) {
      pct = Number(hh.discount_pct);
    }
    return Math.round(Number(p.price) * (100 - pct) / 100);
  };

  const addItem = async (p) => {
    if (busy) return;
    setBusy(true);
    const finalPrice = calcPrice(p);
    const existing = items.find(i => i.product_id === p.id && i.final_price === finalPrice);
    if (existing) {
      const { error } = await supabase.from("order_items").update({ qty: existing.qty + 1 }).eq("id", existing.id);
      if (error) alert("Hata: " + error.message);
    } else {
      const { error } = await supabase.from("order_items").insert({
        order_id: orderId, product_id: p.id, qty: 1,
        product_price: Number(p.price), final_price: finalPrice, status: "pending",
      });
      if (error) alert("Hata: " + error.message);
    }
    await load();
    await recalcTotal();
    setBusy(false);
  };

  const updateQty = async (item, delta) => {
    if (busy) return;
    setBusy(true);
    const newQty = item.qty + delta;
    if (newQty <= 0) {
      await supabase.from("order_items").delete().eq("id", item.id);
    } else {
      await supabase.from("order_items").update({ qty: newQty }).eq("id", item.id);
    }
    await load();
    await recalcTotal();
    setBusy(false);
  };

  const recalcTotal = async () => {
    const { data: its } = await supabase.from("order_items").select("qty, final_price").eq("order_id", orderId);
    const subtotal = (its || []).reduce((s, it) => s + Number(it.final_price) * it.qty, 0);
    await supabase.from("orders").update({ subtotal, total: subtotal }).eq("id", orderId);
  };

  const sendToKitchen = async () => {
    if (busy || items.length === 0) return;
    setBusy(true);
    await supabase.from("order_items").update({ status: "preparing" }).eq("order_id", orderId).eq("status", "pending");
    await supabase.from("orders").update({ status: "preparing" }).eq("id", orderId);
    setBusy(false);
    alert("Mutfaga gonderildi!");
    navigate("/orders");
  };

  const cancelOrder = async () => {
    if (!confirm("Bu hesabi iptal etmek istediginizden emin misiniz?")) return;
    await supabase.from("order_items").delete().eq("order_id", orderId);
    await supabase.from("orders").delete().eq("id", orderId);
    navigate("/tables");
  };

  if (!order) return <div style={{color:"#888",padding:20,fontFamily:cv}}>Yukleniyor...</div>;

  const visibleProducts = products.filter(p => p.category_id === selectedCat);
  const headTitle = table ? table.name : (order.customer_name ? "👤 " + order.customer_name : "Hesap");

  return (
    <div style={{fontFamily:cv,color:"#F0EDE8",paddingBottom:120}}>
      {/* Header */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
        <button onClick={() => navigate("/tables")} style={{background:"none",border:"none",color:"#C8973E",fontSize:14,cursor:"pointer",padding:0,fontWeight:600}}>← Masalar</button>
        <button onClick={cancelOrder} style={{background:"none",border:"none",color:"#888",fontSize:11,cursor:"pointer",padding:0}}>Iptal Et</button>
      </div>

      <div style={{fontSize:24,fontWeight:800,marginBottom:4}}>{headTitle}</div>
      <div style={{fontSize:11,color:"#888",marginBottom:16}}>{items.length === 0 ? "Bos hesap" : items.reduce((s,i)=>s+i.qty,0) + " urun · ₺" + (order.total||0)}</div>

      {/* Current items */}
      {items.length > 0 && (
        <div style={{background:"#1A1A1A",border:"1px solid #2A2A2A",borderRadius:12,padding:12,marginBottom:14}}>
          {items.map(it => (
            <div key={it.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 0",borderBottom:"1px solid #2A2A2A"}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:14,fontWeight:600,color:"#F0EDE8"}}>{it.products?.name || "Urun"}</div>
                <div style={{fontSize:11,color:"#888",marginTop:2}}>₺{it.final_price} {it.status === "preparing" && "· Mutfakta"}</div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <button onClick={() => updateQty(it, -1)} disabled={it.status === "preparing"} style={{width:28,height:28,background:"#2A2A2A",color:"#F0EDE8",border:"none",borderRadius:6,fontSize:18,cursor:it.status==="preparing"?"not-allowed":"pointer",opacity:it.status==="preparing"?0.4:1}}>−</button>
                <div style={{width:24,textAlign:"center",fontSize:14,fontWeight:700}}>{it.qty}</div>
                <button onClick={() => updateQty(it, +1)} disabled={it.status === "preparing"} style={{width:28,height:28,background:"#C8973E",color:"#000",border:"none",borderRadius:6,fontSize:18,cursor:it.status==="preparing"?"not-allowed":"pointer",opacity:it.status==="preparing"?0.4:1}}>+</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Toggle menu */}
      <button onClick={() => setShowMenu(!showMenu)} style={{width:"100%",padding:"12px",background:showMenu?"#1A1A1A":"#C8973E",color:showMenu?"#888":"#000",border:"1px solid "+(showMenu?"#2A2A2A":"#C8973E"),borderRadius:10,fontSize:13,fontWeight:700,cursor:"pointer",marginBottom:12}}>
        {showMenu ? "Menuyu Gizle ↑" : "+ Urun Ekle"}
      </button>

      {showMenu && (
        <>
          {/* Categories */}
          <div style={{display:"flex",gap:6,overflowX:"auto",marginBottom:12,paddingBottom:4}}>
            {categories.map(c => (
              <button key={c.id} onClick={() => setSelectedCat(c.id)} style={{flexShrink:0,padding:"6px 12px",border:"none",borderRadius:14,fontSize:11,fontWeight:700,background:selectedCat===c.id?"#C8973E":"#222",color:selectedCat===c.id?"#000":"#888",cursor:"pointer",whiteSpace:"nowrap",letterSpacing:"0.5px"}}>
                {c.name?.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Products */}
          <div>
            {visibleProducts.map(p => {
              const fp = calcPrice(p);
              const dis = fp < Number(p.price);
              return (
                <div key={p.id} onClick={() => addItem(p)} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px",background:"#1A1A1A",border:"1px solid #2A2A2A",borderRadius:10,marginBottom:6,cursor:"pointer"}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:14,fontWeight:600,color:"#F0EDE8"}}>{p.name}</div>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    {dis && <span style={{fontSize:11,color:"#888",textDecoration:"line-through"}}>₺{p.price}</span>}
                    <span style={{fontSize:14,fontWeight:700,color:dis?"#C8973E":"#F0EDE8"}}>₺{fp}</span>
                    <div style={{width:28,height:28,background:"#C8973E",color:"#000",borderRadius:6,fontSize:18,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center"}}>+</div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Bottom bar - send to kitchen */}
      {items.some(i => i.status === "pending") && (
        <div style={{position:"fixed",bottom:78,left:14,right:14,zIndex:35}}>
          <button onClick={sendToKitchen} disabled={busy} style={{width:"100%",padding:"16px",background:"#3ECF8E",color:"#000",border:"none",borderRadius:14,fontSize:15,fontWeight:800,cursor:"pointer",boxShadow:"0 4px 16px rgba(62,207,142,0.4)"}}>
            🍳 Mutfaga Gonder · ₺{order.total || 0}
          </button>
        </div>
      )}
    </div>
  );
}
