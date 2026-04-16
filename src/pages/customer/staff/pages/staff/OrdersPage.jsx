import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase.js";

const cv  = "'Coolvetica','Bebas Neue',sans-serif";
const cvc = "'Coolvetica Condensed','Barlow Condensed',sans-serif";

const STATUS_COLOR = {
  open:"#E07A3E", sent:"#5A8FE0", preparing:"#C8973E",
  ready:"#3ECF8E", paid:"#3ECF8E", debt:"#E05A5A",
};
const STATUS_LABEL = {
  open:"Açık", sent:"Mutfakta", preparing:"Hazırlanıyor",
  ready:"Hazır", paid:"Ödendi", debt:"Veresiye",
};

export default function OrdersPage() {
  const [orders,  setOrders]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [open,    setOpen]    = useState(null);

  const load = async () => {
    const { data } = await supabase
      .from("orders")
      .select("*, cafe_tables(name), staff(name), order_items(*)")
      .in("status", ["open","sent","preparing","ready"])
      .order("created_at", { ascending:false });
    setOrders(data || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const ch = supabase.channel("orders")
      .on("postgres_changes", { event:"*", schema:"public", table:"orders" }, load)
      .subscribe();
    return () => ch.unsubscribe();
  }, []);

  const sendToKitchen = async (orderId) => {
    await supabase.from("order_items")
      .update({ sent_to_kitchen:true, kitchen_status:"preparing" })
      .eq("order_id", orderId)
      .eq("sent_to_kitchen", false);
    load();
  };

  const cancelOrder = async (orderId) => {
    if (!confirm("İptal etmek istediğinizden emin misiniz?")) return;
    await supabase.from("orders").update({ status:"cancelled" }).eq("id", orderId);
    load();
  };

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between",
        alignItems:"center", marginBottom:20 }}>
        <h1 style={{ color:"#F0EDE8", fontFamily:cv, fontSize:28,
          letterSpacing:"-0.5px", margin:0 }}>Siparişler</h1>
        <div style={{ color:"#888", fontFamily:cvc, fontSize:11 }}>
          {orders.length} açık sipariş
        </div>
      </div>

      {loading && (
        <div style={{ color:"#888", fontFamily:cvc, fontSize:12,
          textAlign:"center", padding:40 }}>YÜKLENİYOR...</div>
      )}

      {orders.length === 0 && !loading && (
        <div style={{ color:"#888", fontFamily:cvc, fontSize:13,
          textAlign:"center", padding:60 }}>Açık sipariş yok</div>
      )}

      {orders.map(order => {
        const sc = STATUS_COLOR[order.status] || "#888";
        const isOpen = open === order.id;
        return (
          <div key={order.id} style={{ background:"#1E1E1E",
            border:`1px solid #2A2A2A`, borderLeft:`3px solid ${sc}`,
            borderRadius:12, marginBottom:10, overflow:"hidden" }}>
            <div onClick={() => setOpen(isOpen ? null : order.id)}
              style={{ padding:"14px 16px", cursor:"pointer",
                display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div>
                <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:4 }}>
                  <span style={{ color:"#F0EDE8", fontFamily:cv, fontSize:17 }}>
                    {order.cafe_tables?.name || "Masa"}
                  </span>
                  <span style={{ background:sc+"22", color:sc, fontFamily:cvc,
                    fontSize:9, letterSpacing:"1px", padding:"2px 7px", borderRadius:3 }}>
                    {STATUS_LABEL[order.status]}
                  </span>
                </div>
                <div style={{ color:"#888", fontFamily:cvc, fontSize:11 }}>
                  {order.staff?.name} · {new Date(order.created_at)
                    .toLocaleTimeString("tr", { hour:"2-digit", minute:"2-digit" })}
                </div>
              </div>
              <div style={{ textAlign:"right" }}>
                <div style={{ color:"#F0EDE8", fontFamily:cv, fontSize:20 }}>
                  ₺{Math.round(order.total || 0).toLocaleString()}
                </div>
                <div style={{ color:"#888", fontSize:14, marginTop:2 }}>
                  {isOpen ? "▲" : "▼"}
                </div>
              </div>
            </div>

            {isOpen && (
              <div style={{ borderTop:"1px solid #2A2A2A", padding:"10px 16px" }}>
                {order.order_items?.map((item, i) => (
                  <div key={i} style={{ display:"flex", justifyContent:"space-between",
                    padding:"5px 0", borderBottom:"1px solid #2A2A2A",
                    color:"#F0EDE8", fontFamily:cvc, fontSize:12 }}>
                    <span>{item.product_name} ×{item.quantity}</span>
                    <span style={{ color:"#C8973E" }}>
                      ₺{(item.final_price * item.quantity).toLocaleString()}
                    </span>
                  </div>
                ))}
                {order.status === "open" && (
                  <div style={{ display:"flex", gap:8, marginTop:10 }}>
                    <button onClick={() => sendToKitchen(order.id)}
                      style={{ flex:1, padding:"8px", background:"#5A8FE0",
                        border:"none", color:"#fff", fontFamily:cvc, fontSize:11,
                        letterSpacing:"1px", cursor:"pointer", borderRadius:6 }}>
                      MUTFAĞA GÖNDER
                    </button>
                    <button onClick={() => cancelOrder(order.id)}
                      style={{ padding:"8px 14px", background:"transparent",
                        border:"1px solid #E05A5A", color:"#E05A5A",
                        fontFamily:cvc, fontSize:11, cursor:"pointer", borderRadius:6 }}>
                      İPTAL
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
