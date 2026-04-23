import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase.js";

const cv = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";

function playAlarm() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const tone = (freq, start, dur, vol=0.3) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = "square";
      gain.gain.setValueAtTime(0, ctx.currentTime + start);
      gain.gain.linearRampToValueAtTime(vol, ctx.currentTime + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + dur);
    };
    tone(1000, 0, 0.15);
    tone(1400, 0.18, 0.25);
  } catch (e) {}
}

export default function KitchenPage() {
  const [orders, setOrders] = useState([]);
  const [items, setItems] = useState([]);
  const [tables, setTables] = useState({});
  const [loading, setLoading] = useState(true);
  const [muted, setMuted] = useState(() => localStorage.getItem("nip_kitchen_muted") === "1");
  const knownItemsRef = useRef(new Set());
  const initialLoadRef = useRef(true);

  const load = async () => {
    setLoading(true);
    const [{data: ords}, {data: its}, {data: tabs}] = await Promise.all([
      supabase.from("orders").select("*").in("status", ["preparing","ready","open","sent"]).order("created_at"),
      supabase.from("order_items").select("*, products(name, category_id, categories(name))").in("kitchen_status", ["preparing","ready"]).order("created_at"),
      supabase.from("cafe_tables").select("id, name"),
    ]);
    const tabMap = {};
    (tabs || []).forEach(t => { tabMap[t.id] = t.name; });
    setTables(tabMap);
    setOrders(ords || []);

    const newItems = its || [];
    if (!initialLoadRef.current) {
      const fresh = newItems.filter(it =>
        !knownItemsRef.current.has(it.id) && it.kitchen_status === "preparing"
      );
      if (fresh.length > 0 && !muted) playAlarm();
    }
    knownItemsRef.current = new Set(newItems.map(i => i.id));
    initialLoadRef.current = false;
    setItems(newItems);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const ch = supabase.channel("kitchen").on("postgres_changes", {event:"*", schema:"public", table:"order_items"}, load).subscribe();
    return () => supabase.removeChannel(ch);
  }, []);

  const markReady = async (item) => {
    await supabase.from("order_items").update({ kitchen_status: "ready" }).eq("id", item.id);
    // Auto-bump orders.status to "ready" when all items of that order are ready
    const orderItems = items.filter(i => i.order_id === item.order_id);
    const allWillBeReady = orderItems.every(i => i.id === item.id || i.kitchen_status === "ready");
    if (allWillBeReady) {
      await supabase.from("orders").update({ status: "ready" }).eq("id", item.order_id);
    }
    load();
  };

  const markDone = async (orderId) => {
    await supabase.from("order_items").update({ kitchen_status: "served" }).eq("order_id", orderId).in("kitchen_status", ["preparing","ready"]);
    load();
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    localStorage.setItem("nip_kitchen_muted", next ? "1" : "0");
  };

  if (loading) return (<div style={{color:"#888",fontFamily:cv,padding:20}}>Yükleniyor...</div>);

  const ordersWithItems = orders.filter(o => items.some(i => i.order_id === o.id));

  return (
    <div style={{fontFamily:cv,color:"#F0EDE8"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
        <div style={{fontSize:24,fontWeight:800}}>Mutfak</div>
        <button onClick={toggleMute} style={{padding:"6px 12px",background:muted?"#552222":"#183D2D",border:"1px solid "+(muted?"#FF4444":"#3ECF8E"),borderRadius:10,color:muted?"#FF8888":"#88FFC8",cursor:"pointer",fontSize:14,fontWeight:700}}>{muted?"🔇":"🔊"}</button>
      </div>
      <div style={{fontSize:11,color:"#888",letterSpacing:"1px",marginBottom:18}}>{ordersWithItems.length} AKTIF HESAP · {items.length} URUN</div>

      {ordersWithItems.length === 0 && <div style={{textAlign:"center",padding:40,color:"#666",fontSize:13}}>Bekleyen ürün yok</div>}

      {ordersWithItems.map(o => {
        const oItems = items.filter(i => i.order_id === o.id);
        const where = o.table_id ? tables[o.table_id] : "👤 " + (o.customer_name || "Misafir");
        const waitMin = Math.round((Date.now() - new Date(o.created_at).getTime()) / 60000);
        return (
          <div key={o.id} style={{background:"#1A1A1A",border:"1px solid #2A2A2A",borderRadius:12,padding:14,marginBottom:12}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,paddingBottom:10,borderBottom:"1px solid #2A2A2A"}}>
              <div style={{fontSize:16,fontWeight:800,color:"#F0EDE8"}}>{where}</div>
              <div style={{fontSize:11,color:waitMin>15?"#FF8866":"#888",fontWeight:600}}>{waitMin} dk</div>
            </div>
            {o.notes && <div style={{background:"rgba(200,151,62,0.15)",border:"1px solid rgba(200,151,62,0.4)",borderRadius:8,padding:8,marginBottom:8,fontSize:12,color:"#FFD27A"}}>SİPARİŞ NOTU: {o.notes}</div>}
            {oItems.map(it => {
              const isReady = it.kitchen_status === "ready";
              return (
                <div key={it.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 0",borderBottom:"1px solid rgba(42,42,42,0.5)"}}>
                  <div style={{flex:1}}>
                    <div style={{fontSize:14,fontWeight:700,color:isReady?"#3ECF8E":"#F0EDE8"}}>{it.quantity}× {it.products?.name || it.product_name || "Ürün"}</div>
                    {it.selected_options && <div style={{fontSize:11,color:"#C8973E",marginTop:2,fontWeight:600}}>{Object.values(it.selected_options).join(", ")}</div>}
                    {it.notes && <div style={{fontSize:11,color:"#FFD27A",marginTop:2,fontStyle:"italic"}}>Not: {it.notes}</div>}
                    {it.products?.categories?.name && <div style={{fontSize:10,color:"#666",marginTop:2,letterSpacing:"1px"}}>{it.products.categories.name.toUpperCase()}</div>}
                  </div>
                  {!isReady ? (
                    <button onClick={() => markReady(it)} style={{padding:"8px 14px",background:"#3ECF8E",color:"#000",border:"none",borderRadius:8,fontSize:12,fontWeight:800,cursor:"pointer"}}>Hazır</button>
                  ) : (
                    <span style={{fontSize:11,color:"#3ECF8E",fontWeight:700,letterSpacing:"1px"}}>✓ HAZIR</span>
                  )}
                </div>
              );
            })}
            {oItems.every(i => i.kitchen_status === "ready") && (
              <button onClick={() => markDone(o.id)} style={{width:"100%",padding:"10px",background:"transparent",color:"#888",border:"1px solid #333",borderRadius:8,fontSize:12,fontWeight:700,cursor:"pointer",marginTop:10}}>Servis edildi → kapat</button>
            )}
          </div>
        );
      })}
    </div>
  );
}
