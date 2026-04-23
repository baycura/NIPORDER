import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../../lib/supabase.js";

const cv = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";

function isInRange(now, from, until) {
  if (!from || !until) return false;
  const [fh, fm] = from.split(":").map(Number);
  const [uh, um] = until.split(":").map(Number);
  const h = now.getHours(), m = now.getMinutes();
  const nowMin = h * 60 + m;
  const fromMin = fh * 60 + fm;
  const untilMin = uh * 60 + um;
  if (fromMin <= untilMin) return nowMin >= fromMin && nowMin < untilMin;
  return nowMin >= fromMin || nowMin < untilMin;
}

// Play notification sound via Web Audio API (no file needed)
function playDing() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const play = (freq, start, dur) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = "sine";
      gain.gain.setValueAtTime(0, ctx.currentTime + start);
      gain.gain.linearRampToValueAtTime(0.35, ctx.currentTime + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + dur);
    };
    play(880, 0, 0.22);
    play(1175, 0.18, 0.32);
  } catch (e) { /* ignore */ }
}

function vibrate(pattern) {
  try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) {}
}

function showNotification(title, body) {
  try {
    if (!("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    const n = new Notification(title, {
      body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: "niporder-status",
      renotify: true,
      requireInteraction: true,
    });
    n.onclick = () => { window.focus(); n.close(); };
  } catch (e) { /* ignore */ }
}

export default function CustomerMenu() {
  const { qrToken } = useParams();

  const [table, setTable] = useState(null);
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [settings, setSettings] = useState(null);
  const [hh, setHh] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedCat, setSelectedCat] = useState(null);
  const [cart, setCart] = useState([]);
  const [optModal, setOptModal] = useState(null);
  const [optSelected, setOptSelected] = useState({});
  const [optNote, setOptNote] = useState("");
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Order tracking state
  const [activeOrder, setActiveOrder] = useState(null); // { id, items, status }
  const [orderState, setOrderState] = useState("idle"); // idle | placed | preparing | ready | served
  const [notifPermission, setNotifPermission] = useState(
    typeof Notification !== "undefined" ? Notification.permission : "default"
  );
  const subRef = useRef(null);
  const prevStateRef = useRef("idle");

  const now = new Date();
  const partyMode = settings && settings.party_mode_enabled && isInRange(now, settings.party_mode_from, settings.party_mode_until);

  const load = async () => {
    setLoading(true);
    try {
      let tab = null;
      if (qrToken) {
        const { data: t } = await supabase.from("cafe_tables").select("*").eq("qr_token", qrToken).maybeSingle();
        tab = t || null;
      }
      setTable(tab);

      const [{data: cats}, {data: prods}, {data: app}, hhRes] = await Promise.all([
        supabase.from("categories").select("*").eq("is_active", true).order("sort_order"),
        supabase.from("products").select("*").eq("is_available", true).order("sort_order"),
        supabase.from("app_settings").select("*").limit(1).maybeSingle(),
        supabase.rpc("get_active_happy_hour").then(r => r).catch(() => ({data: null})),
      ]);
      setCategories(cats || []);
      setProducts(prods || []);
      setSettings(app || {});
      if (hhRes && hhRes.data && hhRes.data[0]) setHh(hhRes.data[0]);
      if (cats && cats.length && !selectedCat) setSelectedCat(cats[0].id);
    } catch (e) { console.error("Menu load error", e); }
    setLoading(false);
  };

  useEffect(() => { load(); }, [qrToken]);

  // Cleanup subscription on unmount
  useEffect(() => () => {
    if (subRef.current) { supabase.removeChannel(subRef.current); subRef.current = null; }
  }, []);

  const visibleCategories = useMemo(() => categories.filter(c => {
    if (c.available_from && c.available_until && !isInRange(new Date(), c.available_from, c.available_until)) return false;
    return true;
  }), [categories]);

  const visibleProducts = useMemo(() => {
    let list = products.filter(p => p.category_id === selectedCat);
    if (partyMode) {
      const partyProducts = list.filter(p => p.show_in_party_menu);
      if (partyProducts.length > 0) list = partyProducts;
    }
    return list;
  }, [products, selectedCat, partyMode]);

  const calcPrice = (p) => {
    let pct = 0;
    if (hh && (hh.category_ids?.length === 0 || hh.category_ids?.includes(p.category_id))) pct = Number(hh.discount_pct) || 0;
    if (Number(p.instant_discount_pct||0) > pct) pct = Number(p.instant_discount_pct);
    return Math.round(Number(p.price) * (100 - pct) / 100);
  };

  const cartTotal = useMemo(() => cart.reduce((s, it) => s + calcPrice(it.product) * it.quantity, 0), [cart, hh]);
  const cartCount = useMemo(() => cart.reduce((s, it) => s + it.quantity, 0), [cart]);

  const findInCart = (productId, options, note) => cart.findIndex(c =>
    c.product.id === productId &&
    JSON.stringify(c.options || null) === JSON.stringify(options || null) &&
    (c.note || "") === (note || "")
  );

  const onProductTap = (p) => {
    if (p.sold_out_today) { alert("Bu ürün şu an tükendi: " + (p.unavailable_reason || "")); return; }
    if (p.has_options && p.options_config) {
      setOptModal(p); setOptSelected({}); setOptNote("");
    } else {
      addToCart(p, null, null);
    }
  };

  const addToCart = (product, options, note) => {
    setCart(prev => {
      const idx = findInCart(product.id, options, note);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 };
        return next;
      }
      return [...prev, { product, quantity: 1, options: options || null, note: note || null }];
    });
  };

  const updateQty = (idx, delta) => {
    setCart(prev => {
      const next = [...prev];
      const q = next[idx].quantity + delta;
      if (q <= 0) return next.filter((_, i) => i !== idx);
      next[idx] = { ...next[idx], quantity: q };
      return next;
    });
  };

  const confirmOptions = () => {
    if (!optModal) return;
    const cfg = optModal.options_config || {};
    for (const group of cfg.groups || []) {
      if (group.required && !optSelected[group.name]) { alert("Lütfen " + group.name + " seç"); return; }
    }
    addToCart(optModal, optSelected, optNote.trim() || null);
    setOptModal(null);
  };

  // Subscribe to order_items kitchen_status changes for this order
  const startOrderTracking = (orderId) => {
    if (subRef.current) supabase.removeChannel(subRef.current);

    const ch = supabase.channel("customer-order-" + orderId)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "order_items", filter: "order_id=eq." + orderId },
        async () => { await refreshOrderState(orderId); }
      )
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders", filter: "id=eq." + orderId },
        async () => { await refreshOrderState(orderId); }
      )
      .subscribe();
    subRef.current = ch;
    refreshOrderState(orderId);
  };

  const refreshOrderState = async (orderId) => {
    const { data: items } = await supabase.from("order_items").select("*").eq("order_id", orderId);
    const { data: ord } = await supabase.from("orders").select("*").eq("id", orderId).maybeSingle();
    if (!items || items.length === 0) return;

    setActiveOrder({ id: orderId, items, order: ord });

    // Compute aggregate customer-facing state from items
    const allServed = items.every(i => i.kitchen_status === "served");
    const anyReady = items.some(i => i.kitchen_status === "ready");
    const anyPreparing = items.some(i => i.kitchen_status === "preparing");
    const allReady = items.every(i => i.kitchen_status === "ready" || i.kitchen_status === "served");

    let next;
    if (ord?.status === "paid") next = "paid";
    else if (ord?.status === "cancelled") next = "cancelled";
    else if (allServed) next = "served";
    else if (allReady) next = "ready";
    else if (anyReady && anyPreparing) next = "partial_ready";
    else if (anyPreparing) next = "preparing";
    else next = "placed";

    const prev = prevStateRef.current;
    if (next !== prev) {
      prevStateRef.current = next;
      setOrderState(next);

      // Notify on important transitions
      if (next === "ready") {
        playDing();
        vibrate([200, 100, 200, 100, 400]);
        showNotification("🔔 Siparişin hazır!", "Kasadan alabilirsin.");
      } else if (next === "partial_ready") {
        playDing();
        vibrate([150, 80, 150]);
        showNotification("☕ Bir ürünün hazır", "Sipariş kısmen hazırlandı.");
      } else if (next === "preparing" && prev === "placed") {
        // Soft buzz only, no big alert
        vibrate([80]);
      } else if (next === "served") {
        vibrate([100, 60, 100]);
      }
    }
  };

  const requestNotificationPermission = async () => {
    if (!("Notification" in window)) return "denied";
    if (Notification.permission === "granted") return "granted";
    if (Notification.permission === "denied") return "denied";
    const p = await Notification.requestPermission();
    setNotifPermission(p);
    return p;
  };

  const submitOrder = async () => {
    if (submitting || cart.length === 0) return;
    if (!table && !customerName.trim()) { alert("Lütfen adını gir"); return; }
    setSubmitting(true);
    try {
      // Ask permission BEFORE insert (user gesture still active from button click)
      await requestNotificationPermission();

      const totalVal = cartTotal;
      const { data: ord, error: ordErr } = await supabase.from("orders").insert({
        table_id: table ? table.id : null,
        customer_name: table ? null : customerName.trim(),
        subtotal: totalVal,
        total: totalVal,
        status: "open",
      }).select().single();
      if (ordErr) throw ordErr;

      const itemsPayload = cart.map(c => ({
        order_id: ord.id,
        product_id: c.product.id,
        product_name: c.product.name,
        product_price: Number(c.product.price),
        final_price: calcPrice(c.product),
        quantity: c.quantity,
        kitchen_status: "pending",
        sent_to_kitchen: false,
        notes: c.note || null,
        selected_options: c.options || null,
      }));
      const { error: itErr } = await supabase.from("order_items").insert(itemsPayload);
      if (itErr) throw itErr;

      // Start tracking this order
      prevStateRef.current = "placed";
      setOrderState("placed");
      setCart([]);
      setCheckoutOpen(false);
      startOrderTracking(ord.id);
    } catch (e) {
      alert("Sipariş gönderilemedi: " + e.message);
    }
    setSubmitting(false);
  };

  const resetOrder = () => {
    if (subRef.current) { supabase.removeChannel(subRef.current); subRef.current = null; }
    setActiveOrder(null);
    setOrderState("idle");
    prevStateRef.current = "idle";
    load();
  };

  if (loading) {
    return (<div style={{fontFamily:cv,background:"#fff",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",color:"#888"}}>Yükleniyor...</div>);
  }

  // ========== ORDER STATUS VIEW ==========
  if (activeOrder) {
    const items = activeOrder.items || [];
    const itemCount = items.reduce((s, i) => s + (i.quantity || 0), 0);
    const totalPrice = items.reduce((s, i) => s + Number(i.final_price) * (i.quantity||0), 0);

    const stateInfo = {
      placed:         { emoji:"📝", title:"Siparişin alındı",          subtitle:"Garson birazdan mutfağa gönderecek", bg:"#fff",   ring:"#e5e5e5",  pulse:false },
      preparing:      { emoji:"👨‍🍳", title:"Hazırlanıyor...",          subtitle:"Ekibimiz siparişini hazırlıyor",     bg:"#FFF9E6", ring:"#F5C518", pulse:true  },
      partial_ready:  { emoji:"☕", title:"Bir ürünün hazır",           subtitle:"Diğerleri birazdan gelecek",          bg:"#FFF9E6", ring:"#F5C518", pulse:false },
      ready:          { emoji:"🔔", title:"SİPARİŞİN HAZIR!",           subtitle:"Kasadan alabilirsin",                 bg:"#E8F8EF", ring:"#3ECF8E", pulse:true  },
      served:         { emoji:"🙏", title:"Afiyet olsun!",              subtitle:"Başka bir şey ister misin?",          bg:"#fff",   ring:"#C8973E",  pulse:false },
      paid:           { emoji:"✅", title:"Ödeme alındı",               subtitle:"Teşekkür ederiz!",                    bg:"#fff",   ring:"#3ECF8E",  pulse:false },
      cancelled:      { emoji:"❌", title:"Sipariş iptal edildi",       subtitle:"Herhangi bir sorun varsa garsona sor", bg:"#FFF0F0", ring:"#D44",   pulse:false },
    };
    const si = stateInfo[orderState] || stateInfo.placed;

    return (
      <div style={{fontFamily:cv,background:si.bg,minHeight:"100vh",color:"#000",padding:"32px 18px",transition:"background 0.3s"}}>
        <div style={{maxWidth:460,margin:"0 auto"}}>
          {/* Notification permission banner */}
          {notifPermission !== "granted" && orderState !== "served" && orderState !== "paid" && (
            <div onClick={async () => {
              const p = await requestNotificationPermission();
              if (p !== "granted") alert("Bildirim izni vermezsen sipariş hazır olunca haber veremeyiz. Tarayıcı ayarlarından da verebilirsin.");
            }} style={{background:"#000",color:"#fff",padding:"12px 14px",borderRadius:12,marginBottom:18,cursor:"pointer",display:"flex",alignItems:"center",gap:10,fontSize:13,fontWeight:600}}>
              <span style={{fontSize:20}}>🔔</span>
              <span style={{flex:1}}>Sipariş hazır olunca haber verelim</span>
              <span style={{color:"#C8973E",fontWeight:800}}>AÇ</span>
            </div>
          )}

          {/* Status hero */}
          <div style={{textAlign:"center",padding:"32px 20px",background:"#fff",borderRadius:20,border:"3px solid " + si.ring,boxShadow:"0 8px 30px rgba(0,0,0,0.06)",position:"relative",overflow:"hidden"}}>
            {si.pulse && (
              <div style={{position:"absolute",inset:0,background:si.ring,opacity:0.08,animation:"nipPulse 1.6s ease-in-out infinite"}}/>
            )}
            <div style={{fontSize:72,marginBottom:10,position:"relative",animation:si.pulse?"nipBob 1.8s ease-in-out infinite":"none"}}>{si.emoji}</div>
            <div style={{fontSize:24,fontWeight:900,marginBottom:6,letterSpacing:"0.3px",position:"relative"}}>{si.title}</div>
            <div style={{fontSize:14,color:"#555",lineHeight:1.5,position:"relative"}}>{si.subtitle}</div>

            {table && <div style={{fontSize:11,color:"#888",letterSpacing:"2px",marginTop:14,fontWeight:700}}>{table.name?.toUpperCase()}</div>}
            {!table && activeOrder.order?.customer_name && <div style={{fontSize:11,color:"#888",letterSpacing:"2px",marginTop:14,fontWeight:700}}>{activeOrder.order.customer_name.toUpperCase()}</div>}
          </div>

          {/* Items list */}
          <div style={{marginTop:18,background:"#fff",borderRadius:14,border:"1px solid #eee",padding:14}}>
            <div style={{fontSize:11,color:"#888",letterSpacing:"1.5px",fontWeight:700,marginBottom:10}}>SİPARİŞ DETAYI</div>
            {items.map((it) => {
              const badge = {
                pending:   { label:"Kuyrukta",    color:"#888",   bg:"#f2f2f2" },
                preparing: { label:"Hazırlanıyor", color:"#B8860B", bg:"#FFF6D6" },
                ready:     { label:"Hazır",       color:"#1A8754", bg:"#E8F8EF" },
                served:    { label:"Servis edildi",color:"#444",    bg:"#eee"   },
              }[it.kitchen_status] || { label: it.kitchen_status, color:"#888", bg:"#f2f2f2" };
              return (
                <div key={it.id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 0",borderBottom:"1px solid #f5f5f5"}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:14,fontWeight:700}}>{it.quantity}× {it.product_name}</div>
                    {it.selected_options && <div style={{fontSize:11,color:"#C8973E",marginTop:2,fontWeight:600}}>{Object.values(it.selected_options).join(" · ")}</div>}
                    {it.notes && <div style={{fontSize:11,color:"#666",fontStyle:"italic",marginTop:2}}>Not: {it.notes}</div>}
                  </div>
                  <span style={{fontSize:10,padding:"4px 10px",background:badge.bg,color:badge.color,borderRadius:10,fontWeight:700,letterSpacing:"0.5px",whiteSpace:"nowrap"}}>
                    {badge.label.toUpperCase()}
                  </span>
                </div>
              );
            })}
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:10,paddingTop:10,borderTop:"2px solid #000"}}>
              <div style={{fontSize:12,color:"#333",letterSpacing:"1px",fontWeight:700}}>TOPLAM · {itemCount} ürün</div>
              <div style={{fontSize:18,fontWeight:900}}>₺{totalPrice}</div>
            </div>
          </div>

          <button onClick={resetOrder} style={{width:"100%",marginTop:18,padding:"14px",background:"#fff",color:"#000",border:"2px solid #000",borderRadius:12,fontSize:14,fontWeight:800,cursor:"pointer"}}>
            + Sipariş Ekle / Yeni Ürün
          </button>

          <div style={{textAlign:"center",fontSize:11,color:"#888",marginTop:14,letterSpacing:"1px"}}>
            NOT IN PARIS
          </div>
        </div>

        <style>{`
          @keyframes nipPulse {
            0%, 100% { opacity: 0.08; }
            50% { opacity: 0.22; }
          }
          @keyframes nipBob {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-6px); }
          }
        `}</style>
      </div>
    );
  }

  // ========== MENU VIEW ==========
  return (
    <div style={{fontFamily:cv,background:"#fff",minHeight:"100vh",color:"#000",paddingBottom:cart.length>0?96:24}}>
      <div style={{padding:"20px 16px 10px",borderBottom:"1px solid #eee",position:"sticky",top:0,background:"#fff",zIndex:20}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div>
            <div style={{fontSize:18,fontWeight:800,letterSpacing:"0.5px"}}>NOT IN PARIS</div>
            <div style={{fontSize:10,color:"#888",letterSpacing:"2px",marginTop:2}}>
              {table ? table.name?.toUpperCase() : "MENÜ"}
              {partyMode && <span style={{marginLeft:6,color:"#C8973E",fontWeight:700}}>· PARTİ MODU 🎉</span>}
            </div>
          </div>
          {hh && <div style={{background:"#C8973E",color:"#000",padding:"4px 10px",borderRadius:10,fontSize:10,fontWeight:800,letterSpacing:"0.5px"}}>HAPPY HOUR -%{hh.discount_pct}</div>}
        </div>

        <div style={{display:"flex",gap:6,overflowX:"auto",marginTop:12,paddingBottom:4}}>
          {visibleCategories.map(c => (
            <button key={c.id} onClick={() => setSelectedCat(c.id)} style={{flexShrink:0,padding:"8px 14px",border:"none",borderRadius:16,fontSize:12,fontWeight:700,background:selectedCat===c.id?"#000":"#f2f2f2",color:selectedCat===c.id?"#fff":"#333",cursor:"pointer",whiteSpace:"nowrap",letterSpacing:"0.3px"}}>
              {c.icon && <span style={{marginRight:4}}>{c.icon}</span>}{c.name}
            </button>
          ))}
        </div>
      </div>

      <div style={{padding:"14px 16px"}}>
        {visibleProducts.length === 0 && <div style={{textAlign:"center",color:"#888",padding:40,fontSize:13}}>Bu kategoride ürün yok</div>}
        {visibleProducts.map(p => {
          const fp = calcPrice(p);
          const dis = fp < Number(p.price);
          const soldOut = p.sold_out_today;
          const cartIdx = cart.findIndex(c => c.product.id === p.id && !c.options);
          const inCart = cartIdx >= 0 ? cart[cartIdx].quantity : 0;
          return (
            <div key={p.id} style={{display:"flex",gap:12,padding:"14px 0",borderBottom:"1px solid #f0f0f0",opacity:soldOut?0.45:1}}>
              {p.image_url && <img src={p.image_url} alt="" style={{width:72,height:72,borderRadius:10,objectFit:"cover",flexShrink:0}}/>}
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:15,fontWeight:700,color:"#000",lineHeight:1.3}}>{p.name}</div>
                {p.description && <div style={{fontSize:12,color:"#666",marginTop:3,lineHeight:1.4}}>{p.description}</div>}
                {soldOut && <div style={{fontSize:11,color:"#c44",marginTop:4,fontWeight:600}}>{p.unavailable_reason || "Tükendi"}</div>}
                {p.has_options && !soldOut && <div style={{fontSize:10,color:"#C8973E",marginTop:3,fontWeight:700,letterSpacing:"0.5px"}}>SEÇENEKLİ</div>}
                <div style={{display:"flex",alignItems:"center",gap:10,marginTop:8}}>
                  {dis && <span style={{fontSize:12,color:"#999",textDecoration:"line-through"}}>₺{p.price}</span>}
                  <span style={{fontSize:15,fontWeight:800,color:dis?"#C8973E":"#000"}}>₺{fp}</span>
                </div>
              </div>
              {!soldOut && (
                <div style={{display:"flex",alignItems:"center",flexShrink:0}}>
                  {inCart > 0 && !p.has_options ? (
                    <div style={{display:"flex",alignItems:"center",gap:8,background:"#000",borderRadius:24,padding:"4px 6px"}}>
                      <button onClick={() => updateQty(cartIdx, -1)} style={{width:28,height:28,background:"transparent",color:"#fff",border:"none",borderRadius:"50%",fontSize:18,cursor:"pointer",fontWeight:700}}>−</button>
                      <div style={{minWidth:18,textAlign:"center",color:"#fff",fontSize:14,fontWeight:800}}>{inCart}</div>
                      <button onClick={() => updateQty(cartIdx, +1)} style={{width:28,height:28,background:"transparent",color:"#fff",border:"none",borderRadius:"50%",fontSize:18,cursor:"pointer",fontWeight:700}}>+</button>
                    </div>
                  ) : (
                    <button onClick={() => onProductTap(p)} style={{width:36,height:36,background:"#000",color:"#fff",border:"none",borderRadius:"50%",fontSize:22,cursor:"pointer",fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center"}}>+</button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {cart.length > 0 && (
        <div style={{position:"fixed",bottom:14,left:14,right:14,zIndex:40}}>
          <button onClick={() => setCheckoutOpen(true)} style={{width:"100%",padding:"16px 20px",background:"#000",color:"#fff",border:"none",borderRadius:14,fontSize:15,fontWeight:800,cursor:"pointer",boxShadow:"0 6px 20px rgba(0,0,0,0.35)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span>🛒 Sepetim ({cartCount})</span>
            <span>₺{cartTotal} · Devam →</span>
          </button>
        </div>
      )}

      {optModal && (
        <div onClick={() => setOptModal(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:100}}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:"18px 18px 0 0",padding:20,width:"100%",maxWidth:500,maxHeight:"85vh",overflowY:"auto"}}>
            <div style={{fontSize:20,fontWeight:800,marginBottom:4}}>{optModal.name}</div>
            <div style={{fontSize:13,color:"#666",marginBottom:18}}>₺{calcPrice(optModal)}</div>
            {(optModal.options_config?.groups || []).map(group => (
              <div key={group.name} style={{marginBottom:14}}>
                <div style={{fontSize:11,color:"#333",letterSpacing:"1px",fontWeight:700,marginBottom:6}}>
                  {group.name?.toUpperCase()}{group.required && <span style={{color:"#c44",marginLeft:4}}>*</span>}
                </div>
                <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                  {(group.options || []).map(opt => (
                    <button key={opt} onClick={()=>setOptSelected({...optSelected, [group.name]: opt})} style={{padding:"10px 14px",background:optSelected[group.name]===opt?"#000":"#f2f2f2",color:optSelected[group.name]===opt?"#fff":"#333",border:"none",borderRadius:10,fontSize:13,fontWeight:700,cursor:"pointer"}}>{opt}</button>
                  ))}
                </div>
              </div>
            ))}
            <div style={{marginBottom:16}}>
              <div style={{fontSize:11,color:"#333",letterSpacing:"1px",fontWeight:700,marginBottom:6}}>NOT (OPSİYONEL)</div>
              <input value={optNote} onChange={e=>setOptNote(e.target.value)} placeholder="Örn: buzsuz, sekersiz" style={{width:"100%",padding:"12px 14px",background:"#f7f7f7",border:"1px solid #eee",borderRadius:10,fontSize:14,outline:"none",fontFamily:"inherit"}}/>
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={() => setOptModal(null)} style={{flex:1,padding:"14px",background:"#fff",color:"#666",border:"1px solid #ddd",borderRadius:12,fontSize:14,fontWeight:700,cursor:"pointer"}}>İptal</button>
              <button onClick={confirmOptions} style={{flex:2,padding:"14px",background:"#000",color:"#fff",border:"none",borderRadius:12,fontSize:14,fontWeight:800,cursor:"pointer"}}>Sepete Ekle</button>
            </div>
          </div>
        </div>
      )}

      {checkoutOpen && (
        <div onClick={() => setCheckoutOpen(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:110}}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:"18px 18px 0 0",padding:20,width:"100%",maxWidth:520,maxHeight:"92vh",overflowY:"auto"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <div style={{fontSize:20,fontWeight:800}}>Sepetim</div>
              <button onClick={() => setCheckoutOpen(false)} style={{background:"none",border:"none",fontSize:24,cursor:"pointer",padding:0,color:"#666"}}>×</button>
            </div>

            {cart.map((c, idx) => (
              <div key={idx} style={{display:"flex",alignItems:"center",gap:10,padding:"12px 0",borderBottom:"1px solid #f0f0f0"}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:14,fontWeight:700}}>{c.product.name}</div>
                  {c.options && <div style={{fontSize:11,color:"#C8973E",marginTop:2,fontWeight:600}}>{Object.values(c.options).join(" · ")}</div>}
                  {c.note && <div style={{fontSize:11,color:"#666",fontStyle:"italic",marginTop:2}}>Not: {c.note}</div>}
                  <div style={{fontSize:12,color:"#555",marginTop:3}}>₺{calcPrice(c.product)} × {c.quantity} = ₺{calcPrice(c.product) * c.quantity}</div>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:6,background:"#f2f2f2",borderRadius:20,padding:"3px 5px"}}>
                  <button onClick={() => updateQty(idx, -1)} style={{width:26,height:26,background:"transparent",color:"#000",border:"none",borderRadius:"50%",fontSize:16,cursor:"pointer",fontWeight:700}}>−</button>
                  <div style={{minWidth:18,textAlign:"center",fontSize:13,fontWeight:800}}>{c.quantity}</div>
                  <button onClick={() => updateQty(idx, +1)} style={{width:26,height:26,background:"transparent",color:"#000",border:"none",borderRadius:"50%",fontSize:16,cursor:"pointer",fontWeight:700}}>+</button>
                </div>
              </div>
            ))}

            {!table && (
              <div style={{marginTop:14}}>
                <div style={{fontSize:11,color:"#333",letterSpacing:"1px",fontWeight:700,marginBottom:6}}>ADIN (garsonlar seni tanısın)</div>
                <input value={customerName} onChange={e=>setCustomerName(e.target.value)} placeholder="Örn: Efekan" style={{width:"100%",padding:"12px 14px",background:"#f7f7f7",border:"1px solid #eee",borderRadius:10,fontSize:14,outline:"none",fontFamily:"inherit"}}/>
              </div>
            )}

            <div style={{marginTop:14,padding:"12px 14px",background:"#FFF9E6",borderRadius:10,fontSize:12,color:"#7A5A00",display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:18}}>🔔</span>
              <span>Siparişin hazır olduğunda <strong>bildirim göndereceğiz</strong>.</span>
            </div>

            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:16,padding:"14px 0",borderTop:"2px solid #000"}}>
              <div style={{fontSize:13,color:"#333",letterSpacing:"1px",fontWeight:700}}>TOPLAM</div>
              <div style={{fontSize:22,fontWeight:800}}>₺{cartTotal}</div>
            </div>

            <button onClick={submitOrder} disabled={submitting} style={{width:"100%",marginTop:14,padding:"16px",background:"#C8973E",color:"#000",border:"none",borderRadius:14,fontSize:15,fontWeight:800,cursor:"pointer",opacity:submitting?0.6:1}}>
              {submitting ? "Gönderiliyor..." : "Siparişi Gönder"}
            </button>
            <div style={{textAlign:"center",fontSize:11,color:"#888",marginTop:10}}>
              {table ? "Garson siparişini masana getirecek" : "Garson kısa sürede yanına gelecek"}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
