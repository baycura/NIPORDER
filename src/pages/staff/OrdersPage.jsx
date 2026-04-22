import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase.js";

const cv = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";

const STATUS_COLOR = {
  open: "#888", pending: "#888",
  preparing: "#E07A3E", ready: "#3ECF8E",
};

const STATUS_LABEL = {
  open: "Acik", pending: "Beklemede",
  preparing: "Mutfakta", ready: "Hazir",
};

export default function OrdersPage() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [tables, setTables] = useState({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("active");

  const load = async () => {
    setLoading(true);
    const statuses = filter === "active"
      ? ["open","pending","preparing","ready"]
      : filter === "paid"
      ? ["paid"]
      : ["open","pending","preparing","ready","paid"];

    const { data: ords } = await supabase
      .from("orders")
      .select("id, table_id, customer_name, total, status, created_at, paid_at")
      .in("status", statuses)
      .order("created_at", { ascending: false })
      .limit(100);

    const { data: tabs } = await supabase.from("cafe_tables").select("id, name");
    const tabMap = {};
    (tabs || []).forEach(t => { tabMap[t.id] = t.name; });

    setTables(tabMap);
    setOrders(ords || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [filter]);

  const fmtTime = (ts) => {
    const d = new Date(ts);
    return d.toLocaleString("tr-TR", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });
  };

  return (
    <div style={{fontFamily:cv,color:"#F0EDE8"}}>
      <div style={{fontSize:26,fontWeight:800,marginBottom:14}}>Siparisler</div>

      <div style={{display:"flex",gap:8,marginBottom:16,overflowX:"auto"}}>
        {[["active","AKTIF"],["paid","ODENMIS"],["all","HEPSI"]].map(([k,l]) => (
          <button key={k} onClick={() => setFilter(k)} style={{padding:"8px 16px",border:"none",borderRadius:18,fontSize:11,fontWeight:700,letterSpacing:"1px",background:filter===k?"#C8973E":"#222",color:filter===k?"#000":"#888",cursor:"pointer",whiteSpace:"nowrap",flexShrink:0}}>{l}</button>
        ))}
      </div>

      {loading && <div style={{color:"#888"}}>Yukleniyor...</div>}

      {!loading && orders.length === 0 && (
        <div style={{textAlign:"center",padding:40,color:"#888",fontSize:13}}>Hic siparis yok</div>
      )}

      {orders.map(o => {
        const where = o.table_id ? tables[o.table_id] : "👤 " + (o.customer_name || "Misafir");
        const sCol = STATUS_COLOR[o.status] || "#888";
        const sLab = STATUS_LABEL[o.status] || o.status;
        return (
          <div key={o.id} onClick={() => navigate("/orders/" + o.id)} style={{background:"#1A1A1A",border:"1px solid #2A2A2A",borderRadius:10,padding:14,marginBottom:8,cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:14,fontWeight:700,color:"#F0EDE8"}}>{where}</div>
              <div style={{fontSize:11,color:"#666",marginTop:2}}>{fmtTime(o.created_at)}</div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:15,fontWeight:800,color:"#F0EDE8"}}>₺{o.total || 0}</div>
              <div style={{fontSize:10,color:sCol,fontWeight:700,letterSpacing:"1px",marginTop:2}}>{sLab.toUpperCase()}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
