import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase.js";

const cv = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";

export default function KitchenPage() {
  const [orders, setOrders] = useState([]);
  const [items, setItems] = useState([]);
  const [tables, setTables] = useState({});
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [{data: ords}, {data: its}, {data: tabs}] = await Promise.all([
      supabase.from("orders").select("*").in("status", ["preparing","ready"]).order("created_at"),
      supabase.from("order_items").select("*, products(name, category_id, categories(name))").in("status", ["preparing","ready"]).order("created_at"),
      supabase.from("cafe_tables").select("id, name"),
    ]);
    const tabMap = {};
    (tabs || []).forEach(t => { tabMap[t.id] = t.name; });
    setTables(tabMap);
    setOrders(ords || []);
    setItems(its || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const ch = supabase.channel("kitchen").on("postgres_changes", {event:"*", schema:"public", table:"order_items"}, load).subscribe();
    return () => supabase.removeChannel(ch);
  }, []);

  const markReady = async (item) => {
    await supabase.from("order_items").update({ status: "ready" }).eq("id", item.id);
    load();
  };

  const markDone = async (orderId) => {
    await supabase.from("order_items").update({ status: "served" }).eq("order_id", orderId).in("status", ["preparing","ready"]);
    load();
  };

  if (loading) return (<div style={{color:"#888",fontFamily:cv,padding:20}}>Yukleniyor...</div>);

  return (
    <div style={{fontFamily:cv,color:"#F0EDE8"}}>
      <div style={{fontSize:24,fontWeight:800,marginBottom:4}}>Mutfak</div>
      <div style={{fontSize:11,color:"#888",letterSpacing:"1px",marginBottom:18}}>{orders.length} AKTIF HESAP · {items.length} URUN</div>

      {orders.length === 0 && <div style={{textAlign:"center",padding:40,color:"#666",fontSize:13}}>Bekleyen urun yok</div>}

      {orders.map(o => {
        const oItems = items.filter(i => i.order_id === o.id);
        if (oItems.length === 0) return null;
        const where = o.table_id ? tables[o.table_id] : "👤 " + (o.customer_name || "Misafir");
        const waitMin = Math.round((Date.now() - new Date(o.created_at).getTime()) / 60000);
        return (
          <div key={o.id} style={{background:"#1A1A1A",border:"1px solid #2A2A2A",borderRadius:12,padding:14,marginBottom:12}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,paddingBottom:10,borderBottom:"1px solid #2A2A2A"}}>
              <div style={{fontSize:16,fontWeight:800,color:"#F0EDE8"}}>{where}</div>
              <div style={{fontSize:11,color:waitMin>15?"#FF8866":"#888",fontWeight:600}}>{waitMin} dk</div>
            </div>
            {oItems.map(it => {
              const isReady = it.status === "ready";
              return (
                <div key={it.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 0",borderBottom:"1px solid rgba(42,42,42,0.5)"}}>
                  <div style={{flex:1}}>
                    <div style={{fontSize:14,fontWeight:700,color:isReady?"#3ECF8E":"#F0EDE8"}}>{it.qty}× {it.products?.name || "Urun"}</div>
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
            {oItems.every(i => i.status === "ready") && (
              <button onClick={() => markDone(o.id)} style={{width:"100%",padding:"10px",background:"transparent",color:"#888",border:"1px solid #333",borderRadius:8,fontSize:12,fontWeight:700,cursor:"pointer",marginTop:10}}>Servis edildi → kapat</button>
            )}
          </div>
        );
      })}
    </div>
  );
}
