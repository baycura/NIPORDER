import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../../lib/supabase.js";

const cv = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";

const T = {
  tr: {
    menu: "MENÜ",
    partyMode: "PARTİ MODU",
    category_empty: "Bu kategoride ürün yok",
    sold_out: "Tükendi",
    optional: "SEÇENEKLI",
    cart: "🛒 Sepetim",
    continue: "Devam",
    note_optional: "Örn: buzsuz, sekersiz",
    optional_label: "NOT (OPSİYONEL)",
    cancel: "İptal",
    add_to_cart: "Sepete Ekle",
    my_cart: "Sepetim",
    your_name: "ADIN (garsonlar seni tanısın)",
    name_placeholder: "Örn: Efekan",
    order_note_label: "SİPARİŞ NOTU (mutfak görecek)",
    order_note_placeholder: "Örn: az pişmiş, baharatsız...",
    total: "TOPLAM",
    submit_order: "Siparişi Gönder",
    submitting: "Gönderiliyor...",
    waiter_will_bring: "Garson siparişini masana getirecek",
    notif_promise: "Sipariş hazır olunca bildirim göndereceğiz",
    please_choose: "Lütfen",
    please_enter_name: "Lütfen adını gir",
    sold_out_alert: "Bu ürün şu an tükendi: ",
    order_received: "Siparişin alındı!",
    order_kitchen_msg: "utfağa iletildi. Hazırlanıyor…",
    preparing: "Hazırlanıyor...",
    notif_granted: "🔔 Hazır olunca bildirim alacaksın",
    notif_denied: "⚠️ Bildirim engellendi. Sayfayı açık bırak — hazır olunca ses çalacak.",
    notif_ask: "🔔 Bildirim izni ver",
    back_to_menu: "Menüye dön",
    order_ready_big: "SİPARİŞİN HAZIR!",
    pick_from_cashier: "Kasadan alabilirsin.",
    play_again: "🔊 Tekrar çal",
    enjoy: "Afiyet olsun!",
    thanks: "Tekrar bekleriz ♥",
    new_order: "Yeni sipariş ver",
    submit_failed: "Sipariş gönderilemedi: ",
    notif_title: "🔔 Siparişin hazır!",
    notif_body: "Kasadan alabilirsin — Not In Paris",
    happy_hour: "HAPPY HOUR",
  },
  en: {
    menu: "MENU",
    partyMode: "PARTY MODE",
    category_empty: "No products in this category",
    sold_out: "Sold out",
    optional: "OPTIONS",
    cart: "🛒 Cart",
    continue: "Continue",
    note_optional: "e.g. no ice, no sugar",
    optional_label: "NOTE (OPTIONAL)",
    cancel: "Cancel",
    add_to_cart: "Add to Cart",
    my_cart: "My Cart",
    your_name: "YOUR NAME (so the staff can find you)",
    name_placeholder: "e.g. John",
    order_note_label: "ORDER NOTE (kitchen will see)",
    order_note_placeholder: "e.g. medium-rare, no spice...",
    total: "TOTAL",
    submit_order: "Place Order",
    submitting: "Sending...",
    waiter_will_bring: "Server will bring it to your table",
    notif_promise: "We'll notify you when your order is ready",
    please_choose: "Please choose",
    please_enter_name: "Please enter your name",
    sold_out_alert: "This item is sold out: ",
    order_received: "Order received!",
    order_kitchen_msg: "ent to kitchen. Being prepared…",
    preparing: "Preparing...",
    notif_granted: "🔔 You'll be notified when ready",
    notif_denied: "⚠️ Notifications blocked. Keep this page open — you'll hear a sound when ready.",
    notif_ask: "🔔 Enable notifications",
    back_to_menu: "Back to menu",
    order_ready_big: "YOUR ORDER IS READY!",
    pick_from_cashier: "Pick it up from the cashier.",
    play_again: "🔊 Play again",
    enjoy: "Enjoy your meal!",
    thanks: "See you soon ♥",
    new_order: "Place a new order",
    submit_failed: "Failed to send order: ",
    notif_title: "🔔 Your order is ready!",
    notif_body: "Pick it up from the cashier — Not In Paris",
    happy_hour: "HAPPY HOUR",
  }
};

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

let _audioCtx = null;
function getAudioCtx() {
  if (!_audioCtx) {
    try { _audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
  }
  return _audioCtx;
}

async function playDing() {
  const ctx = getAudioCtx();
  if (!ctx) return;
  if (ctx.state === "suspended") { try { await ctx.resume(); } catch (e) {} }
  const beep = (freq, start, dur, vol=0.6) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = freq;
    o.connect(g); g.connect(ctx.destination);
    g.gain.setValueAtTime(0.0001, ctx.currentTime + start);
    g.gain.exponentialRampToValueAtTime(vol, ctx.currentTime + start + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
    o.start(ctx.currentTime + start);
    o.stop(ctx.currentTime + start + dur);
  };
  beep(880, 0, 0.18);
  beep(1320, 0.18, 0.35);
}

function vibrate() {
  try { if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 400]); } catch (e) {}
}

function showBrowserNotification(title, body) {
  try {
    if (typeof Notification === "undefined") return;
    if (Notification.permission !== "granted") return;
    const n = new Notification(title, {
      body,
      icon: "/icon512.png",
      badge: "/icon512.png",
      tag: "nip-order",
      requireInteraction: true,
      vibrate: [200,100,200],
    });
    n.onclick = () => { window.focus(); n.close(); };
  } catch (e) {}
}

export default function CustomerMenu() {
  const { qrToken } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const storeSlugParam = (searchParams.get("store") || "paris").toLowerCase();
  const [currentStoreId, setCurrentStoreId] = useState(null);

  const [lang, setLang] = useState(() => {
    try { return localStorage.getItem("nip_lang") || "tr"; } catch (e) { return "tr"; }
  });
  const t = T[lang] || T.tr;
  const setLanguage = (l) => { setLang(l); try { localStorage.setItem("nip_lang", l); } catch (e) {} };

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
  const [orderNote, setOrderNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [successOrderId, setSuccessOrderId] = useState(null);
  const [orderStage, setOrderStage] = useState("pending");
  const [notifState, setNotifState] = useState(
    typeof Notification !== "undefined" ? Notification.permission : "unsupported"
  );
  const audioUnlockedRef = useRef(false);

  const now = new Date();
  const partyMode = settings && settings.party_mode_enabled &&
    isInRange(now, settings.party_mode_from, settings.party_mode_until);

  const pName = (p) => (lang === "en" && p?.name_en) ? p.name_en : p?.name;
  const pDesc = (p) => (lang === "en" && p?.description_en) ? p.description_en : p?.description;
  const cName = (c) => (lang === "en" && c?.name_en) ? c.name_en : c?.name;

  const load = async () => {
    setLoading(true);
    try {
      // 1) Resolve current store: qrToken → cafe_tables.store_id, else URL ?store=slug
      let tab = null;
      let storeId = null;
      if (qrToken) {
        const { data: tt } = await supabase.from("cafe_tables").select("*").eq("qr_token", qrToken).maybeSingle();
        tab = tt || null;
        storeId = tab?.store_id || null;
      }
      if (!storeId) {
        const { data: storeRow } = await supabase.from("stores").select("id").eq("slug", storeSlugParam).maybeSingle();
        storeId = storeRow?.id || null;
      }
      if (!storeId) {
        // Fallback: paris
        const { data: parisRow } = await supabase.from("stores").select("id").eq("slug", "paris").maybeSingle();
        storeId = parisRow?.id || null;
      }
      setCurrentStoreId(storeId);
      setTable(tab);

      // 2) Load store-scoped data in parallel
      const [{data: cats}, {data: prods}, {data: appRows}, hhRes] = await Promise.all([
        supabase.from("categories").select("*").eq("is_active", true).eq("store_id", storeId).order("sort_order"),
        supabase.from("products").select("*").eq("is_available", true).eq("store_id", storeId).order("sort_order"),
        supabase.from("app_settings").select("key,value").eq("store_id", storeId),
        supabase.rpc("get_active_happy_hour").then(r => r).catch(() => ({data: null})),
      ]);
      // Cross-store: paris view also shows doner Kitchen category + its products
      const PARIS_STORE_UUID = "c3c6e0c7-1821-4edd-993d-ad960cfbc452";
      const DONER_STORE_UUID = "c39da530-7f73-4f69-a752-029bf03790b1";
      const finalCats = [...(cats || [])];
      const finalProds = [...(prods || [])];
      if (storeId === PARIS_STORE_UUID) {
        const { data: kCats } = await supabase.from("categories").select("*").eq("is_active", true).eq("store_id", DONER_STORE_UUID).eq("name", "Kitchen");
        if (kCats && kCats.length > 0) {
          finalCats.push(...kCats);
          const kitchenCatId = kCats[0].id;
          const kCatIds = kCats.map(c => c.id);
          const { data: kProds } = await supabase.from("products").select("*").eq("is_available", true).in("category_id", kCatIds).order("sort_order");
          if (kProds && kProds.length > 0) finalProds.push(...kProds);
          // Visual alias: also show paris Brunch products under Kitchen tab. Order routing unchanged (same product_id => paris kitchen).
          const brunchCat = finalCats.find(c => c.name === "Brunch" && c.store_id === storeId);
          if (brunchCat) {
            const brunchAliases = finalProds.filter(p => p.category_id === brunchCat.id).map(p => ({ ...p, category_id: kitchenCatId }));
            finalProds.push(...brunchAliases);
          }
        }
        finalCats.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
      }
      setCategories(finalCats);
      setProducts(finalProds);

      // 3) Convert app_settings rows → flat object {key1: value1, key2: value2}
      const settingsObj = {};
      (appRows || []).forEach(row => { settingsObj[row.key] = row.value; });
      setSettings(settingsObj);

      if (hhRes && hhRes.data && hhRes.data[0]) setHh(hhRes.data[0]);
      if (cats && cats.length && !selectedCat) setSelectedCat(cats[0].id);
    } catch (e) { console.error("Menu load error", e); }
    setLoading(false);
  };

  useEffect(() => { load(); }, [qrToken, storeSlugParam]);

  useEffect(() => {
    if (!successOrderId) return;
    let stopped = false;
    const checkStatus = async () => {
      if (stopped) return;
      const { data: items } = await supabase
        .from("order_items").select("kitchen_status").eq("order_id", successOrderId);
      if (!items || items.length === 0) return;
      const allServed = items.every(it => it.kitchen_status === "served");
      const anyReady = items.some(it => it.kitchen_status === "ready" || it.kitchen_status === "served");
      if (allServed) {
        setOrderStage(prev => prev === "served" ? prev : "served");
      } else if (anyReady) {
        setOrderStage(prev => {
          if (prev === "ready" || prev === "served") return prev;
          playDing(); vibrate();
          showBrowserNotification(t.notif_title, t.notif_body);
          return "ready";
        });
      }
    };
    checkStatus();
    const poller = setInterval(checkStatus, 3000);
    const ch = supabase
      .channel("customer-order-" + successOrderId)
      .on("postgres_changes", {event:"*", schema:"public", table:"order_items", filter:"order_id=eq." + successOrderId}, checkStatus)
      .subscribe();
    return () => { stopped = true; clearInterval(poller); supabase.removeChannel(ch); };
  }, [successOrderId, lang]);

  const unlockAudio = async () => {
    if (audioUnlockedRef.current) return;
    try {
      const ctx = getAudioCtx();
      if (ctx && ctx.state === "suspended") await ctx.resume();
      if (ctx) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        g.gain.value = 0.001;
        o.connect(g); g.connect(ctx.destination);
        o.start(); o.stop(ctx.currentTime + 0.02);
      }
      audioUnlockedRef.current = true;
    } catch (e) {}
  };

  const askNotifPermissionSync = () => {
    if (typeof Notification === "undefined") return;
    if (Notification.permission !== "default") { setNotifState(Notification.permission); return; }
    try {
      const maybe = Notification.requestPermission((perm) => setNotifState(perm));
      if (maybe && typeof maybe.then === "function") maybe.then(p => setNotifState(p));
    } catch (e) {}
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

  const calcPrice = (p, options) => {
    let basePrice = Number(p.price);
    // Add price modifiers from selected options (e.g. Single/Double pour size)
    if (options && p.options_config?.groups) {
      for (const group of p.options_config.groups) {
        const selectedOpt = options[group.name];
        if (selectedOpt && group.price_modifiers && group.price_modifiers[selectedOpt] != null) {
          basePrice += Number(group.price_modifiers[selectedOpt]) || 0;
        }
      }
    }
    let pct = 0;
    if (hh && (hh.category_ids?.length === 0 || hh.category_ids?.includes(p.category_id))) pct = Number(hh.discount_pct) || 0;
    if (Number(p.instant_discount_pct||0) > pct) pct = Number(p.instant_discount_pct);
    return Math.round(basePrice * (100 - pct) / 100);
  };

  const cartTotal = useMemo(() => cart.reduce((s, it) => s + calcPrice(it.product, it.options) * it.quantity, 0), [cart, hh]);
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
    if (p.sold_out_today) { alert(t.sold_out_alert + (p.unavailable_reason || "")); return; }
    if (p.has_options && p.options_config) {
      setOptModal(p); setOptSelected({}); setOptNote("");
    } else { addToCart(p, null, null); }
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
      if (group.required && !optSelected[group.name]) { alert(t.please_choose + " " + group.name); return; }
    }
    addToCart(optModal, optSelected, optNote.trim() || null);
    setOptModal(null);
  };

  const submitOrder = async () => {
    if (submitting || cart.length === 0) return;
    if (!table && !customerName.trim()) { alert(t.please_enter_name); return; }
    unlockAudio(); askNotifPermissionSync();
    setSubmitting(true);
    try {
      const totalVal = cartTotal;
      const { data: ord, error: ordErr } = await supabase.from("orders").insert({
        table_id: table ? table.id : null,
        customer_name: table ? null : customerName.trim(),
        subtotal: totalVal, total: totalVal, status: "open",
        note: orderNote.trim() || null,
        origin_store_id: currentStoreId,
      }).select().single();
      if (ordErr) throw ordErr;
      const itemsPayload = cart.map(c => ({
        order_id: ord.id, product_id: c.product.id, product_name: c.product.name,
        product_price: Number(c.product.price), final_price: calcPrice(c.product, c.options),
        quantity: c.quantity, kitchen_status: "pending", sent_to_kitchen: true,
        notes: c.note || null, selected_options: c.options || null,
        store_id: c.product.store_id || currentStoreId,
      }));
      const { error: itErr } = await supabase.from("order_items").insert(itemsPayload);
      if (itErr) throw itErr;
      setSuccessOrderId(ord.id);
      setOrderStage("pending");
      setCart([]); setOrderNote(""); setCheckoutOpen(false);
    } catch (e) { alert(t.submit_failed + e.message); }
    setSubmitting(false);
  };

  const LangSwitcher = () => (
    <div style={{display:"flex",gap:4,background:"#f2f2f2",borderRadius:18,padding:3}}>
      <button onClick={() => setLanguage("tr")} style={{padding:"4px 10px",background:lang==="tr"?"#000":"transparent",color:lang==="tr"?"#fff":"#666",border:"none",borderRadius:14,fontSize:11,fontWeight:700,cursor:"pointer"}}>🇹🇷 TR</button>
      <button onClick={() => setLanguage("en")} style={{padding:"4px 10px",background:lang==="en"?"#000":"transparent",color:lang==="en"?"#fff":"#666",border:"none",borderRadius:14,fontSize:11,fontWeight:700,cursor:"pointer"}}>🇬🇧 EN</button>
    </div>
  );

  if (loading) {
    return (<div className="nip-customer" style={{fontFamily:cv,background:"#fff",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",color:"#888"}}>...</div>);
  }

  if (successOrderId) {
    const bg = orderStage === "ready" ? "#FFF8E1" : orderStage === "served" ? "#E8F5E9" : "#fff";
    const isReady = orderStage === "ready";
    const isServed = orderStage === "served";
    return (
      <div className="nip-customer" style={{fontFamily:cv,background:bg,minHeight:"100vh",padding:"40px 20px",color:"#000",transition:"background 0.4s"}}>
        <div style={{maxWidth:460,margin:"0 auto",textAlign:"center"}}>
          {isReady ? (
            <>
              <div style={{fontSize:80,marginBottom:14}}>🔔</div>
              <div style={{fontSize:30,fontWeight:900,marginBottom:8,letterSpacing:"-0.5px"}}>{t.order_ready_big}</div>
              <div style={{fontSize:15,color:"#555",marginBottom:24,lineHeight:1.5}}>
                {table ? (table.name + " · ") : ""}{t.pick_from_cashier}
              </div>
              <button onClick={() => { playDing(); vibrate(); }} style={{padding:"12px 24px",background:"#C8973E",color:"#000",border:"none",borderRadius:12,fontSize:13,fontWeight:800,cursor:"pointer"}}>{t.play_again}</button>
            </>
          ) : isServed ? (
            <>
              <div style={{fontSize:72,marginBottom:14}}>🙏</div>
              <div style={{fontSize:26,fontWeight:800,marginBottom:8}}>{t.enjoy}</div>
              <div style={{fontSize:14,color:"#555",marginBottom:24,lineHeight:1.5}}>{t.thanks}</div>
              <button onClick={() => { setSuccessOrderId(null); setOrderStage("pending"); load(); }} style={{padding:"14px 28px",background:"#C8973E",color:"#000",border:"none",borderRadius:12,fontSize:14,fontWeight:800,cursor:"pointer"}}>{t.new_order}</button>
            </>
          ) : (
            <>
              <div style={{fontSize:60,marginBottom:14}}>✅</div>
              <div style={{fontSize:24,fontWeight:800,marginBottom:8}}>{t.order_received}</div>
              <div style={{fontSize:14,color:"#555",marginBottom:18,lineHeight:1.5}}>
                {table ? (table.name + (lang==="en"?": s":": m")) : (lang==="en"?"S":"M")}{t.order_kitchen_msg}
              </div>
              <div style={{display:"inline-flex",alignItems:"center",gap:8,padding:"10px 16px",background:"#f6f6f6",borderRadius:24,marginBottom:24,fontSize:13,color:"#555"}}>
                <span style={{width:10,height:10,borderRadius:"50%",background:"#C8973E",display:"inline-block"}}></span>
                {t.preparing}
              </div>
              <div style={{marginBottom:10}}>
                {notifState === "granted" ? (
                  <div style={{padding:"10px 14px",background:"#E8F5E9",border:"1px solid #B2DFDB",borderRadius:10,fontSize:12,color:"#2e7d32"}}>{t.notif_granted}</div>
                ) : notifState === "denied" ? (
                  <div style={{padding:"10px 14px",background:"#FFF3E0",border:"1px solid #FFCC80",borderRadius:10,fontSize:11,color:"#E65100",lineHeight:1.5}}>{t.notif_denied}</div>
                ) : (
                  <button onClick={askNotifPermissionSync} style={{padding:"10px 18px",background:"#C8973E",color:"#000",border:"none",borderRadius:10,fontSize:12,fontWeight:800,cursor:"pointer"}}>{t.notif_ask}</button>
                )}
              </div>
              <button onClick={() => { setSuccessOrderId(null); setOrderStage("pending"); load(); }} style={{padding:"10px 22px",background:"transparent",color:"#888",border:"1px solid #ddd",borderRadius:10,fontSize:12,cursor:"pointer"}}>{t.back_to_menu}</button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="nip-customer nip-customer-shell" style={{fontFamily:cv,background:"#fff",minHeight:"100vh",color:"#000",paddingBottom:cart.length>0?96:24}}>
      <div style={{padding:"20px 16px 10px",borderBottom:"1px solid #eee",position:"sticky",top:0,background:"#fff",zIndex:20}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div>
            <div style={{fontSize:18,fontWeight:800,letterSpacing:"0.5px"}}>NOT IN PARIS</div>
            <div style={{fontSize:10,color:"#888",letterSpacing:"2px",marginTop:2}}>
              {table ? table.name?.toUpperCase() : t.menu}
              {partyMode && <span style={{marginLeft:6,color:"#C8973E",fontWeight:700}}>· {t.partyMode} 🎉</span>}
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            {hh && <div style={{background:"#C8973E",color:"#000",padding:"4px 10px",borderRadius:10,fontSize:10,fontWeight:800,letterSpacing:"0.5px"}}>{t.happy_hour} -%{hh.discount_pct}</div>}
            <LangSwitcher/>
          </div>
        </div>
        <div style={{display:"flex",gap:6,overflowX:"auto",marginTop:12,paddingBottom:4}}>
          {visibleCategories.map(c => (
            <button key={c.id} onClick={() => setSelectedCat(c.id)} style={{flexShrink:0,padding:"8px 14px",border:"none",borderRadius:16,fontSize:12,fontWeight:700,background:selectedCat===c.id?"#000":"#f2f2f2",color:selectedCat===c.id?"#fff":"#333",cursor:"pointer",whiteSpace:"nowrap",letterSpacing:"0.3px"}}>
              {c.icon && <span style={{marginRight:4}}>{c.icon}</span>}{cName(c)}
            </button>
          ))}
        </div>
      </div>

      <div style={{padding:"14px 16px"}}>
        {visibleProducts.length === 0 && <div style={{textAlign:"center",color:"#888",padding:40,fontSize:13}}>{t.category_empty}</div>}
        {visibleProducts.map(p => {
          const fp = calcPrice(p);
          const dis = fp < Number(p.price);
          const soldOut = p.sold_out_today;
          const cartIdx = cart.findIndex(c => c.product.id === p.id && !c.options);
          const inCart = cartIdx >= 0 ? cart[cartIdx].quantity : 0;
          return (
            <div key={p.id + "-" + p.category_id} style={{display:"flex",gap:12,padding:"14px 0",borderBottom:"1px solid #f0f0f0",opacity:soldOut?0.45:1}}>
              {p.image_url && <img src={p.image_url} alt="" style={{width:72,height:72,borderRadius:10,objectFit:"cover",flexShrink:0}}/>}
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:15,fontWeight:700,color:"#000",lineHeight:1.3}}>{pName(p)}</div>
                {pDesc(p) && <div style={{fontSize:12,color:"#666",marginTop:3,lineHeight:1.4}}>{pDesc(p)}</div>}
                {soldOut && <div style={{fontSize:11,color:"#c44",marginTop:4,fontWeight:600}}>{p.unavailable_reason || t.sold_out}</div>}
                {p.has_options && !soldOut && <div style={{fontSize:10,color:"#C8973E",marginTop:3,fontWeight:700,letterSpacing:"0.5px"}}>{t.optional}</div>}
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
            <span>{t.cart} ({cartCount})</span>
            <span>₺{cartTotal} · {t.continue} →</span>
          </button>
        </div>
      )}

      {optModal && (
        <div onClick={() => setOptModal(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:100}}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:"18px 18px 0 0",padding:20,width:"100%",maxWidth:500,maxHeight:"85vh",overflowY:"auto"}}>
            <div style={{fontSize:20,fontWeight:800,marginBottom:4}}>{pName(optModal)}</div>
            <div style={{fontSize:13,color:"#666",marginBottom:18}}>₺{calcPrice(optModal, optSelected)}</div>
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
              <div style={{fontSize:11,color:"#333",letterSpacing:"1px",fontWeight:700,marginBottom:6}}>{t.optional_label}</div>
              <input value={optNote} onChange={e=>setOptNote(e.target.value)} placeholder={t.note_optional} style={{width:"100%",padding:"12px 14px",background:"#f7f7f7",border:"1px solid #eee",borderRadius:10,fontSize:14,outline:"none",fontFamily:"inherit"}}/>
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={() => setOptModal(null)} style={{flex:1,padding:"14px",background:"#fff",color:"#666",border:"1px solid #ddd",borderRadius:12,fontSize:14,fontWeight:700,cursor:"pointer"}}>{t.cancel}</button>
              <button onClick={confirmOptions} style={{flex:2,padding:"14px",background:"#000",color:"#fff",border:"none",borderRadius:12,fontSize:14,fontWeight:800,cursor:"pointer"}}>{t.add_to_cart}</button>
            </div>
          </div>
        </div>
      )}

      {checkoutOpen && (
        <div onClick={() => setCheckoutOpen(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:110}}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:"18px 18px 0 0",padding:20,width:"100%",maxWidth:520,maxHeight:"92vh",overflowY:"auto"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <div style={{fontSize:20,fontWeight:800}}>{t.my_cart}</div>
              <button onClick={() => setCheckoutOpen(false)} style={{background:"none",border:"none",fontSize:24,cursor:"pointer",padding:0,color:"#666"}}>×</button>
            </div>
            {cart.map((c, idx) => (
              <div key={idx} style={{display:"flex",alignItems:"center",gap:10,padding:"12px 0",borderBottom:"1px solid #f0f0f0"}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:14,fontWeight:700}}>{pName(c.product)}</div>
                  {c.options && <div style={{fontSize:11,color:"#C8973E",marginTop:2,fontWeight:600}}>{Object.values(c.options).join(" · ")}</div>}
                  {c.note && <div style={{fontSize:11,color:"#666",fontStyle:"italic",marginTop:2}}>{c.note}</div>}
                  <div style={{fontSize:12,color:"#555",marginTop:3}}>₺{calcPrice(c.product, c.options)} × {c.quantity} = ₺{calcPrice(c.product, c.options) * c.quantity}</div>
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
                <div style={{fontSize:11,color:"#333",letterSpacing:"1px",fontWeight:700,marginBottom:6}}>{t.your_name}</div>
                <input value={customerName} onChange={e=>setCustomerName(e.target.value)} placeholder={t.name_placeholder} style={{width:"100%",padding:"12px 14px",background:"#f7f7f7",border:"1px solid #eee",borderRadius:10,fontSize:14,outline:"none",fontFamily:"inherit"}}/>
              </div>
            )}
            <div style={{marginTop:14}}>
              <div style={{fontSize:11,color:"#333",letterSpacing:"1px",fontWeight:700,marginBottom:6}}>{t.order_note_label}</div>
              <textarea value={orderNote} onChange={e=>setOrderNote(e.target.value)} placeholder={t.order_note_placeholder} rows={2} style={{width:"100%",padding:"12px 14px",background:"#f7f7f7",border:"1px solid #eee",borderRadius:10,fontSize:14,outline:"none",fontFamily:"inherit",resize:"vertical"}}/>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:16,padding:"14px 0",borderTop:"2px solid #000"}}>
              <div style={{fontSize:13,color:"#333",letterSpacing:"1px",fontWeight:700}}>{t.total}</div>
              <div style={{fontSize:22,fontWeight:800}}>₺{cartTotal}</div>
            </div>
            <button onClick={submitOrder} disabled={submitting} style={{width:"100%",marginTop:14,padding:"16px",background:"#C8973E",color:"#000",border:"none",borderRadius:14,fontSize:15,fontWeight:800,cursor:"pointer",opacity:submitting?0.6:1}}>
              {submitting ? t.submitting : t.submit_order}
            </button>
            <div style={{textAlign:"center",fontSize:11,color:"#888",marginTop:10}}>
              {table ? t.waiter_will_bring : t.notif_promise}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
