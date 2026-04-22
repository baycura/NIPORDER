import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase.js";

const cv = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";

export default function KitchenDisplayPage() {
  const [orders, setOrders] = useState([]);
  const [items, setItems] = useState([]);
  const [tables, setTables] = useState({});
  const [now, setNow] = useState(Date.now());

  const load = async () => {
    const [{data: ords}, {data: its}, {data: tabs}] = await Promise.all([
      supabase.from("orders").select("*").in("status", ["preparing","ready"]).order("created_at"),
      supabase.from("order_items").select("*, products(name)").in("status", ["preparing","ready"]).order("created_at"),
      supabase.from("cafe_tables").select("id, name"),
    ]);
    const tabMap = {};
    (tabs || []).forEach(t => { tabMap[t.id] = t.name; });
    setTables(tabMap);
    setOrders(ords || []);
    setItems(its || []);
  };

  useEffect(() => {
    load();
    const ch = supabase.channel("kitchen-display").on("postgres_changes", {event:"*", schema:"public", table:"order_items"}, load).on("postgres_changes", {event:"*", schema:"public", table:"orders"}, load).subscribe();
    const tickInterval = setInterval(() => setNow(Date.now()), 10000);
    return () => { supabase.removeChannel(ch); clearInterval(tickInterval); };
  }, []);

  const markReady = async (item) => {
    await supabase.from("order_items").update({ status: "ready" }).eq("id", item.id);
    load();
  };

  const markServed = async (orderId) => {
    await supabase.from("order_items").update({ status: "served" }).eq("order_id", orderId).in("status", ["preparing","ready"]);
    load();
  };

  // Calculate columns by order status urgency
  const orderCards = orders.map(o => {
    const oItems = items.filter(i => i.order_id === o.id);
    if (oItems.length === 0) return null;
    const where = o.table_id ? tables[o.table_id] : (o.customer_name || "Misafir");
    const waitMs = now - new Date(o.created_at).getTime();
    const waitMin = Math.floor(waitMs / 60000);
    const allReady = oItems.every(i => i.status === "ready");
    const urgency = allReady ? "ready" : waitMin > 15 ? "urgent" : waitMin > 7 ? "warning" : "fresh";
    return { o, oItems, where, waitMin, urgency, allReady };
  }).filter(Boolean);

  // Sort: urgent first, then warning, then fresh, ready last
  const urgencyOrder = { urgent: 0, warning: 1, fresh: 2, ready: 3 };
  orderCards.sort((a,b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency]);

  const URG_STYLE = {
    urgent:  { bg:"#3D1818", border:"#FF4444", label:"#FF8888", labelTxt:"GECIKTI" },
    warning: { bg:"#3D2D18", border:"#FFAA00", label:"#FFD088", labelTxt:"BEKLIYOR" },
    fresh:   { bg:"#1A1A1A", border:"#2A2A2A", label:"#aaaaaa", labelTxt:"YENI" },
    ready:   { bg:"#183D2D", border:"#3ECF8E", label:"#88FFC8", labelTxt:"HAZIR" },
  };

  return (
    <div style={{fontFamily:cv,minHeight:"100vh",background:"#0A0A0A",color:"#F0EDE8",padding:"16px",position:"fixed",inset:0,overflow:"auto"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,paddingBottom:10,borderBottom:"2px solid #C8973E"}}>
        <div style={{display:"flex",alignItems:"center",gap:14}}>
          <div style={{width:48,height:48,borderRadius:12,background:"#C8973E",display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,color:"#000",fontWeight:900}}>🍳</div>
          <div>
            <div style={{fontSize:24,fontWeight:900,letterSpacing:"1px"}}>MUTFAK</div>
            <div style={{fontSize:11,color:"#888",letterSpacing:"2px"}}>{orderCards.length} HESAP · {orderCards.reduce((s,c)=>s+c.oItems.length,0)} URUN</div>
          </div>
        </div>
        <div style={{textAlign:"right"}}>
          <div style={{fontSize:32,fontWeight:900,color:"#C8973E",fontVariantNumeric:"tabular-nums"}}>{new Date(now).toLocaleTimeString("tr-TR", {hour:"2-digit", minute:"2-digit"})}</div>
          <div style={{fontSize:10,color:"#888",letterSpacing:"2px"}}>NOT IN PARIS</div>
        </div>
      </div>

      {orderCards.length === 0 && (
        <div style={{textAlign:"center",padding:80,color:"#444"}}>
          <div style={{fontSize:80,marginBottom:20}}>✨</div>
          <div style={{fontSize:24,fontWeight:700,letterSpacing:"3px"}}>BEKLEYEN YOK</div>
          <div style={{fontSize:12,color:"#666",marginTop:10,letterSpacing:"2px"}}>Yeni siparis bekleniyor...</div>
        </div>
      )}

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(340px, 1fr))",gap:14}}>
        {orderCards.map(({o, oItems, where, waitMin, urgency, allReady}) => {
          const s = URG_STYLE[urgency];
          return (
            <div key={o.id} style={{background:s.bg,border:"3px solid "+s.border,borderRadius:14,padding:16,position:"relative"}}>
              <div style={{position:"absolute",top:-10,right:14,padding:"3px 10px",background:s.border,color:"#000",fontSize:10,fontWeight:900,letterSpacing:"2px",borderRadius:6}}>{s.labelTxt}</div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12,paddingBottom:10,borderBottom:"1px solid rgba(255,255,255,0.1)"}}>
                <div style={{fontSize:22,fontWeight:900,color:"#F0EDE8"}}>{where}</div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:24,fontWeight:900,color:s.label,fontVariantNumeric:"tabular-nums"}}>{waitMin}′</div>
                  <div style={{fontSize:9,color:"#888",letterSpacing:"1px"}}>BEKLEME</div>
                </div>
              </div>
              {o.notes && (
                <div style={{background:"rgba(200,151,62,0.15)",border:"1px solid rgba(200,151,62,0.4)",borderRadius:8,padding:8,marginBottom:10}}>
                  <div style={{fontSize:9,color:"#FFD27A",letterSpacing:"1.5px",fontWeight:700,marginBottom:2}}>SIPARIS NOTU</div>
                  <div style={{fontSize:14,color:"#F0EDE8",fontWeight:600}}>{o.notes}</div>
                </div>
              )}
              <div>
                {oItems.map(it => {
                  const isReady = it.status === "ready";
                  return (
                    <div key={it.id} onClick={() => !isReady && markReady(it)} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 12px",margin:"6px 0",background:isReady?"rgba(62,207,142,0.12)":"rgba(255,255,255,0.03)",border:"1px solid "+(isReady?"#3ECF8E":"transparent"),borderRadius:8,cursor:isReady?"default":"pointer",userSelect:"none"}}>
                      <div style={{flex:1}}>
                        <div style={{fontSize:18,fontWeight:800,color:isReady?"#88FFC8":"#F0EDE8"}}>
                          <span style={{color:isReady?"#88FFC8":"#C8973E",marginRight:8}}>{it.qty}×</span>{it.products?.name || "Urun"}
                        </div>
                        {it.selected_options && <div style={{fontSize:12,color:"#C8973E",marginTop:3,fontWeight:700}}>{Object.values(it.selected_options).join(" · ")}</div>}
                        {it.notes && <div style={{fontSize:11,color:"#FFD27A",marginTop:3,fontStyle:"italic"}}>✎ {it.notes}</div>}
                      </div>
                      {isReady ? (
                        <div style={{fontSize:22,color:"#3ECF8E"}}>✓</div>
                      ) : (
                        <div style={{padding:"6px 12px",background:"#3ECF8E",color:"#000",borderRadius:6,fontSize:11,fontWeight:900,letterSpacing:"1px"}}>HAZIR</div>
                      )}
                    </div>
                  );
                })}
              </div>
              {allReady && (
                <button onClick={() => markServed(o.id)} style={{width:"100%",padding:"12px",marginTop:10,background:"#3ECF8E",color:"#000",border:"none",borderRadius:10,fontSize:13,fontWeight:900,letterSpacing:"2px",cursor:"pointer"}}>SERVIS EDILDI →</button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
