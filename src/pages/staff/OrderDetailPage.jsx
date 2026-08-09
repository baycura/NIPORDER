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
  const [takeawayMode, setTakeawayMode] = useState(false);
  const [tables, setTables] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectedCat, setSelectedCat] = useState(null);
  const [menuOpen, setMenuOpen] = useState(true);
  const [customerNameEdit, setCustomerNameEdit] = useState("");
  const [orderNote, setOrderNote] = useState("");

  // Sabit veriler (menü, kategoriler, masalar) yalniz ilk aciliste yuklenir;
  // siparis verisi hafif sorguyla tazelenir — her dokunusta tam yukleme YOK.
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

  const loadOrderOnly = async () => {
    const [{data: o}, {data: its}] = await Promise.all([
      supabase.from("orders").select("*, stores:origin_store_id(slug, name)").eq("id", orderId).maybeSingle(),
      supabase.from("order_items").select("*").eq("order_id", orderId).order("created_at"),
    ]);
    if (o) setOrder(o);
    setItems(its || []);
  };

  useEffect(() => { load(); }, [orderId]);

  useEffect(() => {
    let t = null;
    const refresh = () => { clearTimeout(t); t = setTimeout(loadOrderOnly, 300); }; // art arda olaylari tek tazelemeye indir
    const ch = supabase.channel("order-detail-" + orderId)
      .on("postgres_changes", {event:"*", schema:"public", table:"order_items", filter:"order_id=eq."+orderId}, refresh)
      .on("postgres_changes", {event:"*", schema:"public", table:"orders", filter:"id=eq."+orderId}, refresh)
      .subscribe();
    return () => { clearTimeout(t); supabase.removeChannel(ch); };
  }, [orderId]);

  // Toplami yerel listeden hesapla, siparise arka planda yaz (UI beklemez)
  const syncTotal = (list) => {
    const sum = list.reduce((s,i) => s + (Number(i.final_price)||0) * (Number(i.quantity)||0), 0);
    setOrder(prev => prev ? { ...prev, subtotal: sum, total: sum } : prev);
    supabase.from("orders").update({ subtotal: sum, total: sum }).eq("id", orderId).then(() => {});
    return sum;
  };

  // Take away: sicak icecek -> karton bardak, soguk -> pet. Sert alkolde yok.
  const canTakeaway = (p) => p?.takeaway_cup === "hot" || p?.takeaway_cup === "cold";

  const toggleItemTakeaway = async (it) => {
    const val = !it.is_takeaway;
    setItems(prev => prev.map(i => i.id === it.id ? { ...i, is_takeaway: val } : i));
    if (String(it.id).startsWith("temp-")) return;
    const { error } = await supabase.from("order_items").update({ is_takeaway: val }).eq("id", it.id);
    if (error) {
      setItems(prev => prev.map(i => i.id === it.id ? { ...i, is_takeaway: !val } : i));
      alert("Değiştirilemedi: " + error.message);
    }
  };

  const addProduct = async (p) => {
    // Bedenli raf urunu: hangi beden satildi?
    let variantName = null;
    const vs = Array.isArray(p.variants) ? p.variants.filter(v => v?.name) : [];
    if (vs.length) {
      const avail = vs.filter(v => Number(v.stock) > 0);
      if (!avail.length) { alert(p.name + " — tüm bedenler tükendi"); return; }
      const pick = prompt("Beden seç — " + p.name + "\n" + avail.map(v => v.name + " (" + v.stock + " adet)").join(" · "), avail[0].name);
      if (pick == null) return;
      const hit = avail.find(v => v.name.toLowerCase() === String(pick).trim().toLowerCase());
      if (!hit) { alert("Geçersiz beden: " + pick); return; }
      variantName = hit.name;
    } else if (p.track_stock && Number(p.retail_stock) <= 0) {
      if (!confirm(p.name + " stokta görünmüyor. Yine de eklensin mi?")) return;
    }
    // Fiyati 0 olan urunler (magaza: tisort, seramik...) icin tutar kasada sorulur
    let price = Number(p.price) || 0;
    if (price <= 0) {
      const inp = prompt("Tutar (TL) — " + p.name + (p.brand ? " / " + p.brand : ""));
      if (inp == null) return;
      price = Number(String(inp).replace(",", "."));
      if (!price || price <= 0) { alert("Geçerli bir tutar gir"); return; }
    }
    const fp = price * (100 - Number(p.instant_discount_pct || 0)) / 100;
    // Magaza (staff_only kategori) urunleri mutfaga gitmez, bildirim tetiklemez
    const cat = categories.find(c => c.id === p.category_id);
    const isRetail = !!cat?.staff_only || !!p.track_stock;
    const row = {
      order_id: orderId,
      product_id: p.id,
      product_name: p.name + (p.brand ? " (" + p.brand + ")" : "") + (variantName ? " · " + variantName : ""),
      variant_name: variantName,
      product_price: price,
      final_price: Math.round(fp),
      quantity: 1,
      kitchen_status: isRetail ? "served" : "pending",
      sent_to_kitchen: !isRetail,
      store_id: p.store_id || order?.origin_store_id,
      kitchen_destination_store_id: p.kitchen_destination_store_id || p.store_id || order?.origin_store_id,
      // "Paket" modu acikken eklenen icecekler gotur olarak isaretlenir
      is_takeaway: takeawayMode && canTakeaway(p),
    };
    // Once ekranda goster (aninda tepki), sonra kaydet
    const tempId = "temp-" + Date.now();
    const optimistic = [...items, { ...row, id: tempId, created_at: new Date().toISOString() }];
    setItems(optimistic);
    syncTotal(optimistic);
    const { data: saved, error } = await supabase.from("order_items").insert(row).select().single();
    if (error) {
      setItems(prev => { const back = prev.filter(i => i.id !== tempId); syncTotal(back); return back; });
      alert("Ürün eklenemedi: " + error.message);
      return;
    }
    setItems(prev => prev.map(i => i.id === tempId ? saved : i));
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
      const next = items.filter(i => i.id !== itemId);
      setItems(next); syncTotal(next);
      const { error } = await supabase.from("order_items").delete().eq("id", itemId);
      if (error) { alert("Silinemedi: " + error.message); loadOrderOnly(); }
    } else {
      const next = items.map(i => i.id === itemId ? { ...i, quantity: newQty } : i);
      setItems(next); syncTotal(next);
      const { error } = await supabase.from("order_items").update({ quantity: newQty }).eq("id", itemId);
      if (error) { alert("Güncellenemedi: " + error.message); loadOrderOnly(); }
    }
  };

  const saveCustomerName = async () => {
    await supabase.from("orders").update({ customer_name: customerNameEdit.trim() || null }).eq("id", orderId);
    loadOrderOnly();
  };
  const saveOrderNote = async () => {
    await supabase.from("orders").update({ note: orderNote.trim() || null }).eq("id", orderId);
    loadOrderOnly();
  };

  const cancelOrder = async () => {
    if (!confirm("Bu siparişi iptal edilsin mi?")) return;
    await supabase.from("orders").update({ status: "cancelled" }).eq("id", orderId);
    navigate("/orders");
  };

  // Kasada devamlilik: bu siparisin odeme penceresi direkt acilir
  const goToPayment = () => navigate("/payment?order=" + orderId);

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
            <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
              <div style={{fontSize:24,fontWeight:800}}>{where}</div>
              <input value={customerNameEdit} onChange={e=>setCustomerNameEdit(e.target.value)} onBlur={saveCustomerName} placeholder="👤 İsim" style={{background:"#1A1A1A",border:"1px solid #2A2A2A",color:"#F0EDE8",fontSize:14,fontWeight:700,padding:"6px 10px",borderRadius:8,outline:"none",fontFamily:"inherit",width:130}}/>
            </div>
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
          const prod = products.find(p => p.id === it.product_id);
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
                {canTakeaway(prod) && (
                  <button onClick={() => toggleItemTakeaway(it)}
                    style={{marginTop:6,padding:"6px 12px",background:it.is_takeaway?"#C8973E":"transparent",color:it.is_takeaway?"#000":"#888",
                            border:"1px solid "+(it.is_takeaway?"#C8973E":"#3A3A3A"),borderRadius:20,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                    {it.is_takeaway ? "✓ 🥤 Paket" : "🥤 Paket"}
                  </button>
                )}
              </div>
              <div style={{display:"flex",alignItems:"center",gap:6,background:"#0C0C0C",borderRadius:20,padding:"3px 5px"}}>
                <button onClick={() => changeQty(it.id, -1)} style={{width:40,height:40,background:"#2A2A2A",color:"#fff",border:"none",borderRadius:"50%",fontSize:20,cursor:"pointer",fontWeight:700}}>−</button>
                <div style={{minWidth:18,textAlign:"center",fontSize:13,fontWeight:800}}>{it.quantity}</div>
                <button onClick={() => changeQty(it.id, +1)} style={{width:40,height:40,background:"#2A2A2A",color:"#fff",border:"none",borderRadius:"50%",fontSize:20,cursor:"pointer",fontWeight:700}}>+</button>
              </div>
            </div>
          );
        })}
      </div>

      {items.length > 0 && order.status !== "paid" && order.status !== "cancelled" && (
        <div style={{position:"fixed",bottom:14,left:14,right:14,zIndex:40}}>
          <button onClick={goToPayment} style={{width:"100%",padding:"14px",background:allReady?"#3ECF8E":"#C8973E",color:"#000",border:"none",borderRadius:12,fontSize:14,fontWeight:800,cursor:"pointer",boxShadow:"0 4px 16px rgba(0,0,0,0.4)"}}>
            {allReady ? "✓ Servis tamamlandı · " : ""}💰 Ödeme Al · ₺{order.total || 0}
          </button>
        </div>
      )}

      <div style={{background:"#161616",border:"1px solid #2A2A2A",borderRadius:10,padding:10,marginBottom:10}}>
        <button onClick={() => setMenuOpen(!menuOpen)} style={{width:"100%",padding:"6px",background:"transparent",color:"#aaa",border:"none",fontSize:12,cursor:"pointer",fontWeight:700}}>
          {menuOpen ? "Menüyü Gizle ↑" : "+ Ürün Ekle ↓"}
        </button>
        {menuOpen && (
          <>
            <button onClick={() => setTakeawayMode(!takeawayMode)}
              style={{width:"100%",marginTop:10,padding:"12px",background:takeawayMode?"#C8973E":"#1A1A1A",color:takeawayMode?"#000":"#999",
                      border:"1px solid "+(takeawayMode?"#C8973E":"#333"),borderRadius:10,fontSize:13,fontWeight:800,cursor:"pointer",fontFamily:"inherit"}}>
              {takeawayMode ? "✓ 🥤 PAKET MODU AÇIK — eklenen içecekler götür" : "🥤 Paket (take away)"}
            </button>
            <div style={{display:"flex",gap:5,overflowX:"auto",marginTop:10,paddingBottom:4}}>
              {categories.map(c => (
                <button key={c.id} onClick={() => setSelectedCat(c.id)} style={{flexShrink:0,padding:"6px 10px",border:"1px solid "+(selectedCat===c.id?"#C8973E":"#333"),borderRadius:12,fontSize:10,fontWeight:700,background:selectedCat===c.id?"rgba(200,151,62,0.2)":"#1A1A1A",color:selectedCat===c.id?"#C8973E":"#aaa",cursor:"pointer",whiteSpace:"nowrap",letterSpacing:"0.5px"}}>
                  {c.icon}{c.name?.toUpperCase()}
                </button>
              ))}
            </div>
            <div style={{marginTop:10,maxHeight:380,overflowY:"auto"}}>
              {filteredProducts.map(p => (
                <div key={p.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 8px",borderBottom:"1px solid #222",gap:10}}>
                  <div>
                    <div style={{fontSize:15,fontWeight:700}}>{p.name}{p.brand && <span style={{color:"#888",fontWeight:600}}> · {p.brand}</span>}</div>
                    {p.track_stock && <div style={{fontSize:11,color:Number(p.retail_stock)>0?"#6FB3C0":"#c66",marginTop:2,fontWeight:600}}>Stok: {p.retail_stock||0} adet{Array.isArray(p.variants)&&p.variants.length?" · "+p.variants.filter(v=>Number(v.stock)>0).map(v=>v.name).join("/"):""}</div>}
                    <div style={{fontSize:13,color:"#C8973E",fontWeight:700,marginTop:2}}>{Number(p.price) > 0 ? "₺" + p.price : "Serbest tutar"}</div>
                  </div>
                  <button onClick={() => addProduct(p)} style={{width:46,height:46,background:"#C8973E",color:"#000",border:"none",borderRadius:"50%",fontSize:24,fontWeight:800,cursor:"pointer",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",lineHeight:1}}>+</button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
