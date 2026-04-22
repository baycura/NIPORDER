import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase.js";

const cv = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";

const STATUS_LABEL = {
  open: { label:"Yeni", color:"#3ECF8E" },
  pending: { label:"Yeni", color:"#3ECF8E" },
  preparing: { label:"Mutfakta", color:"#E07A3E" },
  ready: { label:"Hazır", color:"#C8973E" },
  served: { label:"Servis edildi", color:"#5A8FE0" },
  paid: { label:"Ödenmiş", color:"#888" },
};

export default function OrdersPage() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [tables, setTables] = useState({});
  const [filter, setFilter] = useState("active"); // active | paid | all
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    let statuses;
    if (filter === "active") statuses = ["open","pending","preparing","ready","served"];
    else if (filter === "paid") statuses = ["paid"];
    else statuses = ["open","pending","preparing","ready","served","paid","cancelled"];

    const [{data: ords}, {data: tabs}] = await Promise.all([
      supabase.from("orders").select("*").in("status", statuses).order("created_at", {ascending:false}).limit(80),
      supabase.from("cafe_tables").select("id, name"),
    ]);
    const tabMap = {};
    (tabs || []).forEach(t => { tabMap[t.id] = t.name; });
    setTables(tabMap);
    setOrders(ords || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const ch = supabase.channel("orders-list").on("postgres_changes", {event:"*", schema:"public", table:"orders"}, load).subscribe();
    return () => supabase.removeChannel(ch);
  }, [filter]);

  if (loading) return (<div style={{color:"#888",fontFamily:cv,padding:20}}>Yukleniyor...</div>);

  return (
    <div style={{fontFamily:cv,color:"#F0EDE8"}}>
      <div style={{fontSize:24,fontWeight:800,marginBottom:4}}>Siparişler</div>
      <div style={{fontSize:11,color:"#888",letterSpacing:"1px",marginBottom:14}}>{orders.length} SIPARIS</div>

      <div style={{display:"flex",gap:6,marginBottom:14,overflowX:"auto"}}>
        {[["active","AKTIF"],["paid","ODENMIS"],["all","HEPSI"]].map(([k,l]) => (
          <button key={k} onClick={()=>setFilter(k)} style={{flexShrink:0,padding:"7px 12px",border:"none",borderRadius:16,fontSize:11,fontWeight:700,letterSpacing:"0.5px",background:filter===k?"#C8973E":"#222",color:filter===k?"#000":"#888",cursor:"pointer",whiteSpace:"nowrap"}}>{l}</button>
        ))}
      </div>

      {orders.length === 0 && <div style={{textAlign:"center",padding:40,color:"#666",fontSize:13}}>Hic siparis yok</div>}

      {orders.map(o => {
        const st = STATUS_LABEL[o.status] || {label:o.status, color:"#888"};
        const where = o.table_id ? (tables[o.table_id] || "Masa") : "👤 " + (o.customer_name || "Misafir");
        const waitMin = Math.round((Date.now() - new Date(o.created_at).getTime()) / 60000);
        return (
          <div key={o.id} onClick={() => navigate("/orders/" + o.id)} style={{background:"#1A1A1A",border:"1px solid #2A2A2A",borderRadius:10,padding:12,marginBottom:8,cursor:"pointer",display:"flex",alignItems:"center",gap:10}}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                <div style={{fontSize:14,fontWeight:700,color:"#F0EDE8"}}>{where}</div>
                <span style={{fontSize:9,padding:"2px 8px",background:st.color+"22",color:st.color,borderRadius:6,fontWeight:700,letterSpacing:"1px"}}>{st.label?.toUpperCase()}</span>
              </div>
              <div style={{fontSize:11,color:"#888",marginTop:3}}>
                {new Date(o.created_at).toLocaleString("tr-TR", {hour:"2-digit", minute:"2-digit", day:"2-digit", month:"2-digit"})}
                <span style={{marginLeft:10}}>{waitMin} dk önce</span>
              </div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:16,fontWeight:800,color:"#C8973E"}}>₺{o.total || 0}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
