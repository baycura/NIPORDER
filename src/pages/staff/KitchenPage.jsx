import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase.js";

const cv = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";

function playDing() {
  // Strategy 1: HTMLAudioElement with inline wav (works on Safari/Firefox/Chrome/mobile)
  try {
    const wavB64 = "UklGRtwCAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YbYCAAAAAP////8AAAEAAAAAAP//AAAAAP//AAAAAAAAAAABAAAA/////wAAAAABAAAAAAAAAAAAAAAAAAAAAAABAAAA/////wAAAQAAAAAAAAAAAP//AAD/////AQABAAAAAAD//wAAAAAAAP//AAD//wEAAAABAAEAAAABAAEAAQABAP//AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAA//8AAAEAAAD//wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//8AAP//AAD//wAA//8AAP//AAAAAAAAAQABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAD/////AAAAAAAAAAAAAAAAAAABAAEAAQABAAAA//8AAAAA//8AAAAAAQAAAAEAAAAAAAAAAAD//wAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAD//wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
    const audio = new Audio("data:audio/wav;base64," + wavB64);
    audio.volume = 0.6; audio.play().catch(()=>{});
  } catch (e) {}
  // Strategy 2: Web Audio API (louder, more aggressive tone)
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const play = (freq, start, dur, vol=0.35) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = "square"; o.frequency.value = freq;
      o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.0001, ctx.currentTime + start);
      g.gain.exponentialRampToValueAtTime(vol, ctx.currentTime + start + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
      o.start(ctx.currentTime + start); o.stop(ctx.currentTime + start + dur);
    };
    play(1200, 0, 0.15); play(900, 0.18, 0.18); play(1400, 0.40, 0.22);
  } catch (e) { console.error("audio error", e); }
}

export default function KitchenPage() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [flash, setFlash] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [wakeLockOn, setWakeLockOn] = useState(false);
  const audioUnlockedRef = useRef(false);
  const knownItemIdsRef = useRef(new Set());
  const wakeLockRef = useRef(null);

  const load = async () => {
    const { data: orders } = await supabase
      .from("orders")
      .select("id, table_id, customer_name, created_at, status")
      .in("status", ["open","sent","preparing","ready"])
      .order("created_at", {ascending:true});

    if (!orders || orders.length === 0) { setTickets([]); setLoading(false); return; }

    const { data: items } = await supabase
      .from("order_items")
      .select("*")
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

    const visibleTickets = orders
      .filter(o => itemsByOrder[o.id] && itemsByOrder[o.id].length > 0)
      .map(o => ({
        order: o,
        items: itemsByOrder[o.id],
        where: o.table_id ? (tabMap[o.table_id] || "Masa") : "👤 " + (o.customer_name || "Misafir"),
      }));

    setTickets(visibleTickets);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel("kitchen-page")
      .on("postgres_changes", {event:"*", schema:"public", table:"order_items"}, (payload) => {
        // If it is a new pending item we have not seen, play ding + flash
        if (payload.eventType === "INSERT" && payload.new?.kitchen_status === "pending") {
          if (!knownItemIdsRef.current.has(payload.new.id)) {
            knownItemIdsRef.current.add(payload.new.id);
            if (soundOn) playDing();
            setFlash(true);
            setTimeout(() => setFlash(false), 1200);
          }
        }
        load();
      })
      .on("postgres_changes", {event:"*", schema:"public", table:"orders"}, load)
      .subscribe();
    // Polling fallback: every 4s reload and check for new pending items
    const poller = setInterval(async () => {
      const { data: newItems } = await supabase
        .from("order_items").select("id,kitchen_status,created_at")
        .eq("kitchen_status", "pending").order("created_at", {ascending:false}).limit(5);
      if (newItems && newItems.length) {
        let foundNew = false;
        newItems.forEach(it => {
          if (!knownItemIdsRef.current.has(it.id)) {
            knownItemIdsRef.current.add(it.id);
            foundNew = true;
          }
        });
        if (foundNew) {
          if (soundOn) playDing();
          setFlash(true); setTimeout(() => setFlash(false), 1500);
          load();
        }
      }
    }, 4000);
    return () => { supabase.removeChannel(ch); clearInterval(poller); };
  }, [soundOn]);

  // Populate knownItemIds on initial load so we don't ding for existing items
  useEffect(() => {
    tickets.forEach(t => t.items.forEach(it => knownItemIdsRef.current.add(it.id)));
  }, [tickets]);

  const unlockAudioAndWakeLock = async () => {
    if (!audioUnlockedRef.current) {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const o = ctx.createOscillator(); const g = ctx.createGain();
        g.gain.value = 0.001; o.connect(g); g.connect(ctx.destination);
        o.start(); o.stop(ctx.currentTime + 0.01);
        audioUnlockedRef.current = true;
      } catch (e) {}
    }
    if ("wakeLock" in navigator && !wakeLockRef.current) {
      try {
        wakeLockRef.current = await navigator.wakeLock.request("screen");
        setWakeLockOn(true);
        wakeLockRef.current.addEventListener("release", () => {
          setWakeLockOn(false); wakeLockRef.current = null;
        });
      } catch (e) { console.error("wakeLock error", e); }
    }
  };

  useEffect(() => {
    const onVisibilityChange = async () => {
      if (document.visibilityState === "visible" && wakeLockOn && !wakeLockRef.current && "wakeLock" in navigator) {
        try { wakeLockRef.current = await navigator.wakeLock.request("screen"); } catch (e) {}
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [wakeLockOn]);

  const startPreparing = async (itemId) => {
    await supabase.from("order_items").update({ kitchen_status: "preparing" }).eq("id", itemId);
    load();
  };
  const markReady = async (itemId) => {
    await supabase.from("order_items").update({ kitchen_status: "ready" }).eq("id", itemId);
    load();
  };
  const markServed = async (orderId) => {
    await supabase.from("order_items").update({ kitchen_status: "served" }).eq("order_id", orderId);
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
          <button onClick={() => { setSoundOn(!soundOn); unlockAudioAndWakeLock(); }} style={{padding:"8px 12px",background:soundOn?"#3ECF8E":"#444",color:"#000",border:"none",borderRadius:8,fontSize:11,fontWeight:700,cursor:"pointer",letterSpacing:"1px"}}>
            {soundOn ? "🔊 SES AÇIK" : "🔇 SES KAPALI"}
          </button>
          <button onClick={unlockAudioAndWakeLock} style={{padding:"8px 12px",background:wakeLockOn?"#C8973E":"#444",color:wakeLockOn?"#000":"#aaa",border:"none",borderRadius:8,fontSize:11,fontWeight:700,cursor:"pointer",letterSpacing:"1px"}}>
            {wakeLockOn ? "💡 EKRAN AÇIK" : "💤 Aktifleştir"}
          </button>
        </div>
      </div>

      {!audioUnlockedRef.current && (
        <div onClick={unlockAudioAndWakeLock} style={{background:"#3D2D18",border:"1px solid #C8973E",color:"#FFD088",padding:"10px 14px",borderRadius:10,fontSize:12,marginBottom:14,cursor:"pointer"}}>
          👆 Ses ve ekran uyanık kalsın için buraya bir kez tıklayın
        </div>
      )}

      {tickets.length === 0 && <div style={{textAlign:"center",padding:60,color:"#666",fontSize:14}}>Aktif sipariş yok</div>}

      {tickets.map(t => {
        const waitMin = Math.round((Date.now() - new Date(t.order.created_at).getTime()) / 60000);
        const urgent = waitMin >= 15;
        const allReady = t.items.every(it => it.kitchen_status === "ready");
        return (
          <div key={t.order.id} style={{background:"#1A1A1A",border:"1px solid "+(urgent?"#a00":"#2A2A2A"),borderRadius:12,padding:14,marginBottom:10}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <div style={{fontSize:15,fontWeight:700}}>{t.where}</div>
              <div style={{fontSize:12,color:urgent?"#ff6666":"#C8973E",fontWeight:700}}>{waitMin} dk</div>
            </div>

            {t.items.map(it => {
              const opts = it.selected_options ? Object.values(it.selected_options).join(" · ") : null;
              return (
                <div key={it.id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 0",borderTop:"1px solid #222"}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:14,fontWeight:700,color: it.kitchen_status==="ready"?"#3ECF8E":"#F0EDE8"}}>
                      {it.quantity}× {it.product_name}
                    </div>
                    {opts && <div style={{fontSize:11,color:"#C8973E",marginTop:2,fontWeight:600}}>{opts}</div>}
                    {it.notes && <div style={{fontSize:11,color:"#aaa",fontStyle:"italic",marginTop:2}}>Not: {it.notes}</div>}
                  </div>
                  <div style={{display:"flex",gap:6}}>
                    {it.kitchen_status === "pending" && (
                      <button onClick={() => startPreparing(it.id)} style={{padding:"8px 14px",background:"#E07A3E",color:"#000",border:"none",borderRadius:8,fontSize:11,fontWeight:800,cursor:"pointer"}}>Hazırlamaya başla</button>
                    )}
                    {it.kitchen_status === "preparing" && (
                      <button onClick={() => markReady(it.id)} style={{padding:"8px 14px",background:"#3ECF8E",color:"#000",border:"none",borderRadius:8,fontSize:11,fontWeight:800,cursor:"pointer"}}>Hazır</button>
                    )}
                    {it.kitchen_status === "ready" && (
                      <span style={{padding:"6px 10px",color:"#3ECF8E",fontSize:11,fontWeight:800}}>✓ HAZIR</span>
                    )}
                  </div>
                </div>
              );
            })}

            {allReady && (
              <button onClick={() => markServed(t.order.id)} style={{width:"100%",marginTop:10,padding:"10px",background:"transparent",color:"#aaa",border:"1px dashed #555",borderRadius:8,fontSize:12,fontWeight:700,cursor:"pointer"}}>Servis edildi → kapat</button>
            )}
          </div>
        );
      })}
    </div>
  );
}
