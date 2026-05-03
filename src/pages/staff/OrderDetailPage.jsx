import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase.js";

const cv = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";

export default function OrderDetailPage() {
  const { orderId } = useParams();
  const navigate = useNavigate();

  const [order, setOrder] = useState(null);
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [tables, setTables] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectedCat, setSelectedCat] = useState(null);
  const [menuOpen, setMenuOpen] = useState(true);
  const [customerNameEdit, setCustomerNameEdit] = useState("");
  const [orderNote, setOrderNote] = useState("");

  const load = async () => {
    setLoading(true);
    const [{data: o}, {data: its}, {data: cats}, {data: prods}, {data: tabs}] = await Promise.all([
      supabase.from("orders").select("*, stores:origin_store_id(slug, name)").eq("id", orderId).maybeSingle(),
      supabase.from("order_items").select("*").eq("order_id", orderId).order("created_at"),
      supabase.from("categories").select("*").eq("is_active", true).order("sort_order"),
      supabase.from("products").select("*").eq("is_available", true).order("sort_order"),
      supabase.from("cafe_tables").select("id, name"),
    ]);
    setOrder(o);
    setItems(its || []);
    setCategories(cats || []);
    setProducts(prods || []);
    const tMap = {}; (tabs||[]).forEach(t => { tMap[t.id] = t.name; });
    setTables(tMap);
    if (cats && cats.length && !selectedCat) setSelectedCat(cats[0].id);
    if (o) { setCustomerNameEdit(o.customer_name || ""); setOrderNote(o.note || ""); }
    setLoading(false);
  };

  useEffect(() => { load(); }, [orderId]);

  useEffect(() => {
    const ch = supabase.channel("order-detail-" + orderId)
      .on("postgres_changes", {event:"*", schema:"public", table:"order_items", filter:"order_id=eq."+orderId}, load)
      .on("postgres_changes", {event:"*", schema:"public", table:"orders", filter:"id=eq."+orderId}, load)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [orderId]);

  const addProduct = async (p) => {
    const fp = Number(p.price) * (100 - Number(p.instant_discount_pct || 0)) / 100;
    await supabase.from("order_items").insert({
      order_id: orderId,
      product_id: p.id,
      product_name: p.name,
      product_price: Number(p.price),
      final_price: Math.round(fp),
      quantity: 1,
      kitchen_status: "pending",
      sent_to_kitchen: true,
    });
    recalcOrderTotal();
  };

  const changeQty = async (itemId, delta) => {
    const it = items.find(i => i.id === itemId);
    if (!it) return;
    const newQty = it.quantity + delta;
    if (newQty <= 0) {
      if (it.kitchen_status !== "pending") {
        alert("Mutfağa giden urun silinemez. Iptal butonunu kullanin.");
        return;
      }
      await supabase.from("order_items").delete().eq("id", itemId);
    } else {
      await supabase.from("order_items").update({ quantity: newQty }).eq("id", itemId);
    }
    recalcOrderTotal();
  };

  const recalcOrderTotal = async () => {
    const { data: its } = await supabase.from("order_items").select("final_price,quantity").eq("order_id", orderId);
    const sum = (its || []).reduce((s,i) => s + (Number(i.final_price)||0) * (Number(i.quantity)||0), 0);
    await supabase.from("orders").update({ subtotal: sum, total: sum }).eq("id", orderId);
    load();
  };

  const saveCustomerName = async () => {
    await supabase.from("orders").update({ customer_name: customerNameEdit.trim() || null }).eq("id", orderId);
    load();
  };
  const saveOrderNote = async () => {
    await supabase.from("orders").update({ note: orderNote.trim() || null }).eq("id", orderId);
    load();
  };

  const cancelOrder = async () => {
    if (!confirm("Bu siparişi iptal edilsin mi?")) return;
    await supabase.from("orders").update({ status: "cancelled" }).eq("id", orderId);
    navigate("/orders");
  };

  const goToPayment = () => navigate("/payment");

  if (loading) return (<div style={{color:"#888",fontFamily:cv,padding:20}}>Yukleniyor...</div>);
  if (!order) return (<div style={{color:"#888",fontFamily:cv,padding:20}}>Sipariş bulunamadı</div>);

  const totalItems = items.reduce((s,i) => s + (i.quantity||0), 0);
  const anyPending = items.some(i => i.kitchen_status === "pending" || i.kitchen_status === "preparing");
  const allReady = items.length > 0 && items.every(i => i.kitchen_status === "ready" || i.kitchen_status === "served");
  const filteredProducts = products.filter(p => p.category_id === selectedCat);
  const where = order.table_id ? (tables[order.table_id] || "Masa") : null;

  return (
    <div style={{fontFamily:cv,color:"#F0EDE8",paddingBottom:100}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,flexWrap:"wrap",gap:8}}>
        <button onClick={() => navigate(-1)} style={{background:"none",border:"none",color:"#C8973E",fontSize:13,cursor:"pointer",padding:0}}>← Geri</button>
        {order.status !== "cancelled" && order.status !== "paid" && (
          <button onClick={cancelOrder} style={{background:"none",border:"1px solid #553333",color:"#FF6666",fontSize:11,borderRadius:6,padding:"5px 10px",cursor:"pointer"}}>İptal Et</button>
        )}
      </div>

      <div style={{marginBottom:14}}>
        <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
          {order.stores?.slug && <span style={{display:"inline-block",background:order.stores.slug==="doner"?"#C8973E":"#3ECF8E",color:"#000",padding:"3px 10px",borderRadius:6,fontSize:10,fontWeight:800,letterSpacing:"0.5px"}}>{order.stores.slug==="doner"?"🥙 DÖNER":"🗼 PARIS"}</span>}
          {where ? (
            <div style={{fontSize:24,fontWeight:800}}>{where}</div>
          ) : (
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <span style={{fontSize:20}}>👤</span>
              <input value={customerNameEdit} onChange={e=>setCustomerNameEdit(e.target.value)} onBlur={saveCustomerName} placeholder="Müşteri adı" style={{background:"#1A1A1A",border:"1px solid #2A2A2A",color:"#F0EDE8",fontSize:22,fontWeight:800,padding:"4px 10px",borderRadius:8,outline:"none",fontFamily:"inherit",width:220}}/>
            </div>
          )}
          <div style={{fontSize:10,padding:"3px 8px",background:"#2A2A2A",color:"#aaa",borderRadius:6,fontWeight:700,letterSpacing:"1px"}}>{order.status?.toUpperCase()}</div>
        </div>
        <div style={{fontSize:11,color:"#888",marginTop:4}}>{totalItems} urun · ₺{order.total || 0}</div>
      </div>

      <div style={{marginBottom:14}}>
        <input value={orderNote} onChange={e=>setOrderNote(e.target.value)} onBlur={saveOrderNote} placeholder="+ Sipariş notu ekle (mutfak görecek)" style={{width:"100%",padding:"10px 14px",background:"transparent",border:"1px dashed #444",color:"#ddd",borderRadius:10,fontSize:13,outline:"none",fontFamily:"inherit"}}/>
      </div>

      <div style={{marginBottom:14}}>
        {items.length === 0 && <div style={{color:"#666",fontSize:12,textAlign:"center",padding:20}}>Henüz ürün yok. Aşağıdan ekle.</div>}
        {items.map(it => {
          const opts = it.selected_options ? Object.values(it.selected_options).join(" · ") : null;
          const statusColor = it.kitchen_status === "ready" ? "#3ECF8E"
                            : it.kitchen_status === "preparing" ? "#E07A3E"
                            : it.kitchen_status === "served" ? "#5A8FE0" : "#888";
          return (
            <div key={it.id} style={{background:"#1A1A1A",border:"1px solid #2A2A2A",borderRadius:10,padding:12,marginBottom:8,display:"flex",alignItems:"center",gap:10}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:14,fontWeight:700}}>{it.product_name}</div>
                {opts && <div style={{fontSize:11,color:"#C8973E",marginTop:2,fontWeight:600}}>{opts}</div>}
                {it.notes && <div style={{fontSize:11,color:"#aaa",fontStyle:"italic",marginTop:2}}>Not: {it.notes}</div>}
                <div style={{fontSize:11,marginTop:4}}>
                  <span style={{color:"#888"}}>₺{it.final_price} · </span>
                  <span style={{color:statusColor,fontWeight:700,letterSpacing:"1px"}}>{it.kitchen_status?.toUpperCase()}</span>
                </div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:6,background:"#0C0C0C",borderRadius:20,padding:"3px 5px"}}>
                <button onClick={() => changeQty(it.id, -1)} style={{width:26,height:26,background:"transparent",color:"#fff",border:"none",borderRadius:"50%",fontSize:16,cursor:"pointer",fontWeight:700}}>−</button>
                <div style={{minWidth:18,textAlign:"center",fontSize:13,fontWeight:800}}>{it.quantity}</div>
                <button onClick={() => changeQty(it.id, +1)} style={{width:26,height:26,background:"transparent",color:"#fff",border:"none",borderRadius:"50%",fontSize:16,cursor:"pointer",fontWeight:700}}>+</button>
              </div>
            </div>
          );
        })}
      </div>

      {allReady && (
        <div style={{position:"fixed",bottom:14,left:14,right:14,zIndex:40}}>
          <button onClick={goToPayment} style={{width:"100%",padding:"14px",background:"#C8973E",color:"#000",border:"none",borderRadius:12,fontSize:14,fontWeight:800,cursor:"pointer"}}>
            ✓ Servis tamamlandı · Kasaya git
          </button>
        </div>
      )}

      <div style={{background:"#161616",border:"1px solid #2A2A2A",borderRadius:10,padding:10,marginBottom:10}}>
        <button onClick={() => setMenuOpen(!menuOpen)} style={{width:"100%",padding:"6px",background:"transparent",color:"#aaa",border:"none",fontSize:12,cursor:"pointer",fontWeight:700}}>
          {menuOpen ? "Menüyü Gizle ↑" : "+ Ürün Ekle ↓"}
        </button>
        {menuOpen && (
          <>
            <div style={{display:"flex",gap:5,overflowX:"auto",marginTop:10,paddingBottom:4}}>
              {categories.map(c => (
                <button key={c.id} onClick={() => setSelectedCat(c.id)} style={{flexShrink:0,padding:"6px 10px",border:"1px solid "+(selectedCat===c.id?"#C8973E":"#333"),borderRadius:12,fontSize:10,fontWeight:700,background:selectedCat===c.id?"rgba(200,151,62,0.2)":"#1A1A1A",color:selectedCat===c.id?"#C8973E":"#aaa",cursor:"pointer",whiteSpace:"nowrap",letterSpacing:"0.5px"}}>
                  {c.icon}{c.name?.toUpperCase()}
                </button>
              ))}
            </div>
            <div style={{marginTop:10,maxHeight:260,overflowY:"auto"}}>
              {filteredProducts.map(p => (
                <div key={p.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 6px",borderBottom:"1px solid #222"}}>
                  <div>
                    <div style={{fontSize:13,fontWeight:700}}>{p.name}</div>
                    <div style={{fontSize:11,color:"#C8973E",fontWeight:700}}>₺{p.price}</div>
                  </div>
                  <button onClick={() => addProduct(p)} style={{width:28,height:28,background:"#C8973E",color:"#000",border:"none",borderRadius:"50%",fontSize:16,fontWeight:800,cursor:"pointer"}}>+</button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
