import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase.js";

const cv = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";

// Party mode hours helper (crosses midnight handling)
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

// Web Audio API — simple ding sound
function playDing() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const play = (freq, start, dur) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = "sine"; o.frequency.value = freq;
      o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.0001, ctx.currentTime + start);
      g.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + start + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
      o.start(ctx.currentTime + start); o.stop(ctx.currentTime + start + dur);
    };
    play(880, 0, 0.18); play(1320, 0.18, 0.35);
  } catch (e) {}
}

function vibrate() {
  try { if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 400]); } catch (e) {}
}

function showBrowserNotification(title, body) {
  try {
    if (typeof Notification === "undefined") return;
    if (Notification.permission !== "granted") return;
    const n = new Notification(title, {
      body, icon: "/logo.png", badge: "/logo.png", tag: "nip-order",
      requireInteraction: true, vibrate: [200,100,200],
    });
    n.onclick = () => { window.focus(); n.close(); };
  } catch (e) {}
}

export default function CustomerMenu() {
  const { qrToken } = useParams();
  const navigate = useNavigate();

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
  const [successOrderId, setSuccessOrderId] = useState(null);
  const [orderStage, setOrderStage] = useState("pending"); // pending | ready | served
  const [notifGranted, setNotifGranted] = useState(false);
  const audioUnlockedRef = useRef(false);

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
    } catch (e) {
      console.error("Menu load error", e);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [qrToken]);

  // Realtime subscription to order items for the submitted order
  useEffect(() => {
    if (!successOrderId) return;
    const ch = supabase
      .channel("customer-order-" + successOrderId)
      .on("postgres_changes",
          {event:"*", schema:"public", table:"order_items", filter:"order_id=eq." + successOrderId},
          async () => {
            const { data: items } = await supabase
              .from("order_items").select("kitchen_status").eq("order_id", successOrderId);
            if (!items || items.length === 0) return;
            const allServed = items.every(it => it.kitchen_status === "served");
            const anyReady = items.some(it => it.kitchen_status === "ready");
            if (allServed) {
              setOrderStage("served");
            } else if (anyReady && orderStage !== "ready") {
              setOrderStage("ready");
              playDing();
              vibrate();
              showBrowserNotification("🔔 Siparişin hazır!", "Kasadan alabilirsin — Not In Paris");
            }
          })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [successOrderId, orderStage]);

  // Unlock audio context on first user interaction
  const unlockAudio = () => {
    if (audioUnlockedRef.current) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator(); const g = ctx.createGain();
      g.gain.value = 0.001; o.connect(g); g.connect(ctx.destination);
      o.start(); o.stop(ctx.currentTime + 0.01);
      audioUnlockedRef.current = true;
    } catch (e) {}
  };

  const requestNotifPermission = async () => {
    if (typeof Notification === "undefined") return false;
    if (Notification.permission === "granted") { setNotifGranted(true); return true; }
    if (Notification.permission === "denied") { setNotifGranted(false); return false; }
    try {
      const p = await Notification.requestPermission();
      setNotifGranted(p === "granted");
      return p === "granted";
    } catch (e) { return false; }
  };

  const visibleCategories = useMemo(() => {
    return categories.filter(c => {
      if (c.available_from && c.available_until && !isInRange(now, c.available_from, c.available_until)) return false;
      return true;
    });
  }, [categories, now]);

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

  const findInCart = (productId, options, note) => {
    return cart.findIndex(c =>
      c.product.id === productId &&
      JSON.stringify(c.options || null) === JSON.stringify(options || null) &&
      (c.note || "") === (note || "")
    );
  };

  const onProductTap = (p) => {
    unlockAudio();
    if (p.sold_out_today) {
      alert("Bu ürün şu an tükendi: " + (p.unavailable_reason || ""));
      return;
    }
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
      if (group.required && !optSelected[group.name]) {
        alert("Lütfen " + group.name + " seç"); return;
      }
    }
    addToCart(optModal, optSelected, optNote.trim() || null);
    setOptModal(null);
  };

  const submitOrder = async () => {
    if (submitting || cart.length === 0) return;
    if (!table && !customerName.trim()) { alert("Lütfen adını gir"); return; }
    unlockAudio();
    setSubmitting(true);
    try {
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

      setSuccessOrderId(ord.id);
      setOrderStage("pending");
      setCart([]);
      setCheckoutOpen(false);
      // Request notification permission after order is safely recorded
      setTimeout(() => { requestNotifPermission(); }, 400);
    } catch (e) {
      alert("Sipariş gönderilemedi: " + e.message);
    }
    setSubmitting(false);
  };

  if (loading) {
    return (<div style={{fontFamily:cv,background:"#fff",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",color:"#888"}}>Yükleniyor...</div>);
  }

  if (successOrderId) {
    const bg = orderStage === "ready" ? "#FFF8E1" : orderStage === "served" ? "#E8F5E9" : "#fff";
    const isReady = orderStage === "ready";
    const isServed = orderStage === "served";
    return (
      <div style={{fontFamily:cv,background:bg,minHeight:"100vh",padding:"40px 20px",color:"#000",transition:"background 0.4s"}}>
        <div style={{maxWidth:460,margin:"0 auto",textAlign:"center"}}>
          {isReady ? (
            <>
              <div style={{fontSize:80,marginBottom:14,animation:"pulse 1s infinite"}}>🔔</div>
              <div style={{fontSize:30,fontWeight:900,marginBottom:8,letterSpacing:"-0.5px"}}>SİPARİŞİN HAZIR!</div>
              <div style={{fontSize:15,color:"#555",marginBottom:24,lineHeight:1.5}}>
                {table ? (table.name + " · ") : ""}Kasadan alabilirsin.
              </div>
              <button onClick={() => { playDing(); vibrate(); }} style={{padding:"12px 24px",background:"#C8973E",color:"#000",border:"none",borderRadius:12,fontSize:13,fontWeight:800,cursor:"pointer",marginRight:8}}>🔊 Tekrar çal</button>
            </>
          ) : isServed ? (
            <>
              <div style={{fontSize:72,marginBottom:14}}>🙏</div>
              <div style={{fontSize:26,fontWeight:800,marginBottom:8}}>Afiyet olsun!</div>
              <div style={{fontSize:14,color:"#555",marginBottom:24,lineHeight:1.5}}>Tekrar bekleriz ♥</div>
              <button onClick={() => { setSuccessOrderId(null); setOrderStage("pending"); load(); }} style={{padding:"14px 28px",background:"#C8973E",color:"#000",border:"none",borderRadius:12,fontSize:14,fontWeight:800,cursor:"pointer"}}>Yeni sipariş ver</button>
            </>
          ) : (
            <>
              <div style={{fontSize:60,marginBottom:14}}>✅</div>
              <div style={{fontSize:24,fontWeight:800,marginBottom:8}}>Siparişin alındı!</div>
              <div style={{fontSize:14,color:"#555",marginBottom:18,lineHeight:1.5}}>
                {table ? (table.name + " için m") : "M"}utfağa iletildi. Hazırlanıyor…
              </div>
              <div style={{display:"inline-flex",alignItems:"center",gap:8,padding:"10px 16px",background:"#f6f6f6",borderRadius:24,marginBottom:24,fontSize:13,color:"#555"}}>
                <span style={{width:10,height:10,borderRadius:"50%",background:"#C8973E",display:"inline-block",animation:"pulse 1s infinite"}}></span>
                Hazırlanıyor...
              </div>
              <div style={{marginBottom:10}}>
                {notifGranted ? (
                  <div style={{padding:"10px 14px",background:"#E8F5E9",border:"1px solid #B2DFDB",borderRadius:10,fontSize:12,color:"#2e7d32"}}>
                    🔔 Hazır olunca bildirim alacaksın
                  </div>
                ) : (
                  <button onClick={requestNotifPermission} style={{padding:"10px 18px",background:"#fff",color:"#333",border:"1px solid #ccc",borderRadius:10,fontSize:12,fontWeight:700,cursor:"pointer"}}>🔔 Bildirim izni ver</button>
                )}
              </div>
              <button onClick={() => { setSuccessOrderId(null); setOrderStage("pending"); load(); }} style={{padding:"10px 22px",background:"transparent",color:"#888",border:"1px solid #ddd",borderRadius:10,fontSize:12,cursor:"pointer"}}>Menüye dön</button>
            </>
          )}
          <style>{`@keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.5;transform:scale(0.9)} }`}</style>
        </div>
      </div>
    );
  }

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
                {p.has_options && !soldOut && <div style={{fontSize:10,color:"#C8973E",marginTop:3,fontWeight:700,letterSpacing:"0.5px"}}>SEÇENEKLI</div>}
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

            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:16,padding:"14px 0",borderTop:"2px solid #000"}}>
              <div style={{fontSize:13,color:"#333",letterSpacing:"1px",fontWeight:700}}>TOPLAM</div>
              <div style={{fontSize:22,fontWeight:800}}>₺{cartTotal}</div>
            </div>

            <button onClick={submitOrder} disabled={submitting} style={{width:"100%",marginTop:14,padding:"16px",background:"#C8973E",color:"#000",border:"none",borderRadius:14,fontSize:15,fontWeight:800,cursor:"pointer",opacity:submitting?0.6:1}}>
              {submitting ? "Gönderiliyor..." : "Siparişi Gönder"}
            </button>
            <div style={{textAlign:"center",fontSize:11,color:"#888",marginTop:10}}>
              {table ? "Garson siparişini masana getirecek" : "Sipariş hazır olunca bildirim göndereceğiz"}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
