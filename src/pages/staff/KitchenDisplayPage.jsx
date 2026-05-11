import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase.js";
import { useAuth } from "../../contexts/AuthContext.jsx";

const cv = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";

function playDing() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const play = (freq, start, dur, vol=0.4) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = "square"; o.frequency.value = freq;
      o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.0001, ctx.currentTime + start);
      g.gain.exponentialRampToValueAtTime(vol, ctx.currentTime + start + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
      o.start(ctx.currentTime + start); o.stop(ctx.currentTime + start + dur);
    };
    play(1200, 0, 0.15); play(900, 0.18, 0.18); play(1400, 0.40, 0.22);
  } catch (e) {}
}

export default function KitchenDisplayPage() {
  const { staffUser } = useAuth();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [flash, setFlash] = useState(false);
  const audioUnlockedRef = useRef(false);
  const wakeLockRef = useRef(null);
  const knownItemIdsRef = useRef(new Set());

  const load = async () => {
    const { data: orders } = await supabase
      .from("orders")
      .select("id, table_id, customer_name, created_at, status, origin_store_id, stores:origin_store_id(slug, name)")
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
        where: o.table_id ? (tabMap[o.table_id] || "Masa") : (o.customer_name || "Misafir"),
        storeSlug: o.stores?.slug,
      }));

    setTickets(visible);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel("kitchen-display")
      .on("postgres_changes", {event:"*", schema:"public", table:"order_items"}, (payload) => {
        if (payload.eventType === "INSERT" && payload.new?.kitchen_status === "pending") {
          if (!knownItemIdsRef.current.has(payload.new.id)) {
            knownItemIdsRef.current.add(payload.new.id);
            playDing();
            setFlash(true);
            setTimeout(() => setFlash(false), 1500);
          }
        }
        load();
      })
      .on("postgres_changes", {event:"*", schema:"public", table:"orders"}, load)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, []);

  useEffect(() => {
    tickets.forEach(t => t.items.forEach(it => knownItemIdsRef.current.add(it.id)));
  }, [tickets]);

  const unlock = async () => {
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
      try { wakeLockRef.current = await navigator.wakeLock.request("screen"); } catch (e) {}
    }
  };

  if (loading) return (<div style={{fontFamily:cv,background:"#000",color:"#888",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center"}}>Yukleniyor...</div>);

  return (
    <div style={{fontFamily:cv,background:"#000",color:"#fff",minHeight:"100vh",padding:16}} onClick={unlock}>
      {flash && (
        <div style={{position:"fixed",top:0,left:0,right:0,padding:"30px",background:"#ff3333",color:"#fff",fontSize:36,fontWeight:900,textAlign:"center",letterSpacing:"4px",zIndex:200}}>
          🔔 YENİ SİPARİŞ!
        </div>
      )}

      {!audioUnlockedRef.current && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.95)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:300,cursor:"pointer"}}>
          <div style={{textAlign:"center",color:"#C8973E"}}>
            <div style={{fontSize:80,marginBottom:20}}>🔊</div>
            <div style={{fontSize:28,fontWeight:900}}>Mutfak Ekranı</div>
            <div style={{fontSize:16,color:"#888",marginTop:10}}>Ses ve uyku engeli için ekrana dokun</div>
          </div>
        </div>
      )}

      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <div>
          <div style={{fontSize:32,fontWeight:900,letterSpacing:"-1px"}}>MUTFAK</div>
          <div style={{fontSize:12,color:"#666",letterSpacing:"2px"}}>{tickets.length} AKTIF HESAP</div>
        </div>
        <div style={{fontSize:14,color:"#666"}}>{new Date().toLocaleTimeString("tr-TR",{hour:"2-digit",minute:"2-digit"})}</div>
      </div>

      {tickets.length === 0 && <div style={{textAlign:"center",padding:80,color:"#444",fontSize:20}}>Aktif sipariş yok</div>}

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:12}}>
        {tickets.map(t => {
          const waitMin = Math.round((Date.now() - new Date(t.order.created_at).getTime()) / 60000);
          const urgent = waitMin >= 15;
          return (
            <div key={t.order.id} style={{background:urgent?"#3d0808":"#141414",border:"2px solid "+(urgent?"#ff3333":"#222"),borderRadius:12,padding:14}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <div style={{flex:1,minWidth:0}}>
                  {t.storeSlug && <div style={{display:"inline-block",background:t.storeSlug==="doner"?"#C8973E":"#3ECF8E",color:"#000",padding:"2px 8px",borderRadius:6,fontSize:10,fontWeight:800,letterSpacing:"0.5px",marginBottom:4}}>{t.storeSlug==="doner"?"🥙 DÖNER":"🗼 PARIS"}</div>}
                  <div style={{fontSize:18,fontWeight:800}}>{t.where}</div>
                </div>
                <div style={{fontSize:20,fontWeight:900,color:urgent?"#ff6666":"#C8973E"}}>{waitMin}'</div>
              </div>
              {t.items.map(it => {
                const opts = it.selected_options ? Object.values(it.selected_options).join(" · ") : null;
                return (
                  <div key={it.id} style={{padding:"8px 0",borderTop:"1px solid #333"}}>
                    <div style={{fontSize:16,fontWeight:700,color:it.kitchen_status==="ready"?"#3ECF8E":it.kitchen_status==="preparing"?"#E07A3E":"#fff"}}>
                      {it.quantity}× {it.product_name}
                      <span style={{fontSize:10,marginLeft:8,letterSpacing:"1px",color:"#888"}}>{it.kitchen_status?.toUpperCase()}</span>
                    </div>
                    {opts && <div style={{fontSize:13,color:"#C8973E",marginTop:2,fontWeight:600}}>{opts}</div>}
                    {it.notes && <div style={{fontSize:12,color:"#aaa",fontStyle:"italic",marginTop:2}}>Not: {it.notes}</div>}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
