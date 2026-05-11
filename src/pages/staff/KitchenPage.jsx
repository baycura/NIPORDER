import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase.js";
import { useAuth } from "../../contexts/AuthContext.jsx";

const cv = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";

// Loud, distinctive ding using Web Audio (3 notes, square wave, high volume)
async function playLoudDing(ctxRef) {
  let ctx = ctxRef?.current;
  if (!ctx) {
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch (e) { return; }
    if (ctxRef) ctxRef.current = ctx;
  }
  if (ctx.state === "suspended") {
    try { await ctx.resume(); } catch (e) {}
  }
  const beep = (freq, start, dur, vol=0.6) => {
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = "square"; o.frequency.value = freq;
    o.connect(g); g.connect(ctx.destination);
    g.gain.setValueAtTime(0.0001, ctx.currentTime + start);
    g.gain.exponentialRampToValueAtTime(vol, ctx.currentTime + start + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
    o.start(ctx.currentTime + start); o.stop(ctx.currentTime + start + dur);
  };
  // Loud 3-tone alarm: high-low-high
  beep(1320, 0, 0.18, 0.7);
  beep(880, 0.20, 0.18, 0.7);
  beep(1760, 0.42, 0.30, 0.7);
}

export default function KitchenPage() {
  const { staffUser } = useAuth();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [flash, setFlash] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [unlocked, setUnlocked] = useState(false);
  const [wakeLockOn, setWakeLockOn] = useState(false);
  const audioCtxRef = useRef(null);
  const knownItemIdsRef = useRef(new Set());
  const wakeLockRef = useRef(null);

  const load = async () => {
    const { data: orders } = await supabase
      .from("orders")
      .select("id, table_id, customer_name, created_at, status, note, origin_store_id, stores:origin_store_id(slug, name)")
      .in("origin_store_id", staffUser?.store_ids?.length ? staffUser.store_ids : ["00000000-0000-0000-0000-000000000000"])
      .in("status", ["open","sent","preparing","ready"])
      .order("created_at", {ascending:true});

    if (!orders || orders.length === 0) { setTickets([]); setLoading(false); return; }

    const { data: items } = await supabase
      .from("order_items").select("*")
      .in("order_id", orders.map(o => o.id))
      .in("kitchen_status", ["pending","preparing","ready"])
      .order("created_at", {ascending:true});

    const { data: tabs } = await supabase.from("cafe_tables").select("id,name");
    const tabMap = {}; (tabs||[]).forEach(t => { tabMap[t.id] = t.name; });

    const itemsByOrder = {};
    (items||[]).forEach(it => {
      if (!itemsByOrder[it.order_id]) itemsByOrder[it.order_id] = [];
      itemsByOrder[it.order_id].push(it);
    });

    const visible = orders
      .filter(o => itemsByOrder[o.id] && itemsByOrder[o.id].length > 0)
      .map(o => ({
        order: o, items: itemsByOrder[o.id],
        where: o.table_id ? (tabMap[o.table_id] || "Masa") : "👤 " + (o.customer_name || "Misafir"),
        storeSlug: o.stores?.slug,
      }));

    setTickets(visible);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel("kitchen-page")
      .on("postgres_changes", {event:"*", schema:"public", table:"order_items"}, (payload) => {
        if (payload.eventType === "INSERT" && payload.new?.kitchen_status === "pending") {
          if (!knownItemIdsRef.current.has(payload.new.id)) {
            knownItemIdsRef.current.add(payload.new.id);
            if (soundOn) playLoudDing(audioCtxRef);
            setFlash(true); setTimeout(() => setFlash(false), 1500);
          }
        }
        load();
      })
      .on("postgres_changes", {event:"*", schema:"public", table:"orders"}, load)
      .subscribe();

    // Polling fallback (every 4s)
    const poller = setInterval(async () => {
      const { data: newItems } = await supabase
        .from("order_items").select("id,kitchen_status,created_at")
        .eq("kitchen_status", "pending").order("created_at", {ascending:false}).limit(10);
      if (newItems && newItems.length) {
        let foundNew = false;
        newItems.forEach(it => {
          if (!knownItemIdsRef.current.has(it.id)) {
            knownItemIdsRef.current.add(it.id);
            foundNew = true;
          }
        });
        if (foundNew) {
          if (soundOn) playLoudDing(audioCtxRef);
          setFlash(true); setTimeout(() => setFlash(false), 1500);
          load();
        }
      }
    }, 4000);

    return () => { supabase.removeChannel(ch); clearInterval(poller); };
  }, [soundOn]);

  // Populate known ids from initial load
  useEffect(() => {
    tickets.forEach(t => t.items.forEach(it => knownItemIdsRef.current.add(it.id)));
  }, [tickets]);

  const unlockEverything = async () => {
    // 1. Audio
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (audioCtxRef.current.state === "suspended") {
        await audioCtxRef.current.resume();
      }
      // Play silent tick to fully wake the audio engine
      const o = audioCtxRef.current.createOscillator(); const g = audioCtxRef.current.createGain();
      g.gain.value = 0.001; o.connect(g); g.connect(audioCtxRef.current.destination);
      o.start(); o.stop(audioCtxRef.current.currentTime + 0.02);
    } catch (e) { console.error("audio unlock failed", e); }
    // 2. Wake Lock
    if ("wakeLock" in navigator && !wakeLockRef.current) {
      try {
        wakeLockRef.current = await navigator.wakeLock.request("screen");
        setWakeLockOn(true);
        wakeLockRef.current.addEventListener("release", () => {
          setWakeLockOn(false); wakeLockRef.current = null;
        });
      } catch (e) {}
    }
    setUnlocked(true);
  };

  // Reacquire wake lock when tab becomes visible
  useEffect(() => {
    const handler = async () => {
      if (document.visibilityState === "visible" && wakeLockOn && !wakeLockRef.current && "wakeLock" in navigator) {
        try { wakeLockRef.current = await navigator.wakeLock.request("screen"); } catch (e) {}
      }
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [wakeLockOn]);

  // Ticket-level actions: act on ALL items in an order in one click
  const startPreparingAll = async (orderId) => {
    await supabase.from("order_items")
      .update({ kitchen_status: "preparing" })
      .eq("order_id", orderId)
      .eq("kitchen_status", "pending");
    load();
  };
  const markAllReady = async (orderId) => {
    await supabase.from("order_items")
      .update({ kitchen_status: "ready" })
      .eq("order_id", orderId)
      .in("kitchen_status", ["pending","preparing"]);
    load();
  };
  const markServedAndClose = async (orderId) => {
    await supabase.from("order_items")
      .update({ kitchen_status: "served" })
      .eq("order_id", orderId);
    load();
  };

  if (loading) return (<div style={{color:"#888",fontFamily:cv,padding:20}}>Yukleniyor...</div>);

  const totalItems = tickets.reduce((s,t) => s + t.items.length, 0);

  return (
    <div style={{fontFamily:cv,color:"#F0EDE8",position:"relative",minHeight:"80vh"}}>
      {flash && (
        <div style={{position:"fixed",top:0,left:0,right:0,padding:"18px 20px",background:"#ff4444",color:"#fff",fontSize:20,fontWeight:900,textAlign:"center",letterSpacing:"2px",zIndex:200,animation:"flash 0.2s ease-in-out 6"}}>
          🔔 YENİ SİPARİŞ!
          <style>{`@keyframes flash { 0%,100%{background:#ff4444} 50%{background:#ffaa00} }`}</style>
        </div>
      )}

      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,flexWrap:"wrap",gap:8}}>
        <div>
          <div style={{fontSize:24,fontWeight:800}}>Mutfak</div>
          <div style={{fontSize:11,color:"#888",letterSpacing:"1px"}}>{tickets.length} AKTIF HESAP · {totalItems} URUN</div>
        </div>
        <div style={{display:"flex",gap:6}}>
          <button onClick={() => { setSoundOn(!soundOn); unlockEverything(); }} style={{padding:"8px 12px",background:soundOn?"#3ECF8E":"#444",color:soundOn?"#000":"#aaa",border:"none",borderRadius:8,fontSize:11,fontWeight:700,cursor:"pointer",letterSpacing:"1px"}}>
            {soundOn ? "🔊 SES AÇIK" : "🔇 SES KAPALI"}
          </button>
          <button onClick={() => { unlockEverything(); playLoudDing(audioCtxRef); }} style={{padding:"8px 12px",background:"#222",color:"#aaa",border:"1px solid #444",borderRadius:8,fontSize:11,fontWeight:700,cursor:"pointer"}}>🔔 Test</button>
          <button onClick={unlockEverything} style={{padding:"8px 12px",background:wakeLockOn?"#C8973E":"#444",color:wakeLockOn?"#000":"#aaa",border:"none",borderRadius:8,fontSize:11,fontWeight:700,cursor:"pointer",letterSpacing:"1px"}}>
            {wakeLockOn ? "💡 EKRAN AÇIK" : "💤 Aktifleştir"}
          </button>
        </div>
      </div>

      {!unlocked && (
        <div onClick={unlockEverything} style={{background:"#3D2D18",border:"1px solid #C8973E",color:"#FFD088",padding:"12px 16px",borderRadius:10,fontSize:13,marginBottom:14,cursor:"pointer",fontWeight:700}}>
          👆 Ses ve uyku engeli için buraya bir kez tıklayın (ZORUNLU)
        </div>
      )}

      {tickets.length === 0 && <div style={{textAlign:"center",padding:60,color:"#666",fontSize:14}}>Aktif sipariş yok</div>}

      {tickets.map(t => {
        const waitMin = Math.round((Date.now() - new Date(t.order.created_at).getTime()) / 60000);
        const urgent = waitMin >= 15;
        const allPending = t.items.every(it => it.kitchen_status === "pending");
        const allReady = t.items.every(it => it.kitchen_status === "ready");
        const anyPending = t.items.some(it => it.kitchen_status === "pending");
        const anyPreparing = t.items.some(it => it.kitchen_status === "preparing");
        const stage = allReady ? "ready" : (anyPending ? "pending" : "preparing");

        const cardBg = stage === "ready" ? "#0A2A18" : (stage === "preparing" ? "#2A1F0A" : "#1A1A1A");
        const cardBorder = urgent ? "#ff3333" : (stage === "ready" ? "#3ECF8E" : (stage === "preparing" ? "#E07A3E" : "#2A2A2A"));

        return (
          <div key={t.order.id} style={{background:cardBg,border:"2px solid "+cardBorder,borderRadius:14,padding:14,marginBottom:12}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <div style={{flex:1,minWidth:0}}>
                {t.storeSlug && <div style={{display:"inline-block",background:t.storeSlug==="doner"?"#C8973E":"#3ECF8E",color:"#000",padding:"2px 8px",borderRadius:6,fontSize:10,fontWeight:800,letterSpacing:"0.5px",marginBottom:4}}>{t.storeSlug==="doner"?"🥙 DÖNER":"🗼 PARIS"}</div>}
                <div style={{fontSize:16,fontWeight:800}}>{t.where}</div>
              </div>
              <div style={{fontSize:13,color:urgent?"#ff6666":"#C8973E",fontWeight:800}}>{waitMin} dk</div>
            </div>

            {t.order.note && (
              <div style={{background:"#3D2D18",border:"1px solid #C8973E",borderRadius:8,padding:"8px 12px",marginBottom:10,fontSize:12,color:"#FFD088"}}>
                📝 <strong>Not:</strong> {t.order.note}
              </div>
            )}

            {t.items.map(it => {
              const opts = it.selected_options ? Object.values(it.selected_options).join(" · ") : null;
              const itemColor = it.kitchen_status === "ready" ? "#3ECF8E"
                              : it.kitchen_status === "preparing" ? "#E07A3E"
                              : "#F0EDE8";
              return (
                <div key={it.id} style={{padding:"8px 0",borderTop:"1px solid #2A2A2A"}}>
                  <div style={{fontSize:15,fontWeight:700,color:itemColor}}>
                    {it.quantity}× {it.product_name}
                    {it.kitchen_status === "ready" && <span style={{marginLeft:8,fontSize:11,color:"#3ECF8E"}}>✓</span>}
                  </div>
                  {opts && <div style={{fontSize:12,color:"#C8973E",marginTop:2,fontWeight:600}}>{opts}</div>}
                  {it.notes && <div style={{fontSize:12,color:"#aaa",fontStyle:"italic",marginTop:2}}>Not: {it.notes}</div>}
                </div>
              );
            })}

            <div style={{marginTop:12,display:"flex",gap:6}}>
              {anyPending && (
                <button onClick={() => startPreparingAll(t.order.id)} style={{flex:1,padding:"14px",background:"#E07A3E",color:"#000",border:"none",borderRadius:10,fontSize:14,fontWeight:800,cursor:"pointer",letterSpacing:"0.5px"}}>
                  🔥 Hazırlamaya başla
                </button>
              )}
              {!anyPending && !allReady && (
                <button onClick={() => markAllReady(t.order.id)} style={{flex:1,padding:"14px",background:"#3ECF8E",color:"#000",border:"none",borderRadius:10,fontSize:14,fontWeight:800,cursor:"pointer",letterSpacing:"0.5px"}}>
                  ✓ Hepsi Hazır
                </button>
              )}
              {allReady && (
                <button onClick={() => markServedAndClose(t.order.id)} style={{flex:1,padding:"14px",background:"#5A8FE0",color:"#000",border:"none",borderRadius:10,fontSize:14,fontWeight:800,cursor:"pointer",letterSpacing:"0.5px"}}>
                  ✓ Servis Edildi → Kapat
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
