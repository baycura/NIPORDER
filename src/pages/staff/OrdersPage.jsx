import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase.js";
import { useAuth } from "../../contexts/AuthContext.jsx";
import Ikon from "../../components/Ikon.jsx";

const cv = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";

const STATUS_LABEL = {
  open: { label:"Yeni", color:"#FFFFFF" },
  sent: { label:"Mutfakta", color:"#FFFFFF" },
  preparing: { label:"Mutfakta", color:"#FFFFFF" },
  ready: { label:"Hazır", color:"#FFFFFF" },
  paid: { label:"Ödenmiş", color:"#888" },
  cancelled: { label:"İptal", color:"#C87A6A" },
  debt: { label:"Borç", color:"#8A8580" },
};

export default function OrdersPage() {
  const navigate = useNavigate();
  const { staffUser } = useAuth();
  const [orders, setOrders] = useState([]);
  const [tables, setTables] = useState([]);
  const [tableMap, setTableMap] = useState({});
  const [filter, setFilter] = useState("active");
  const [loading, setLoading] = useState(true);
  const [newModal, setNewModal] = useState(false);
  const [newMode, setNewMode] = useState("table"); // table | walkin
  const [newTableId, setNewTableId] = useState("");
  const [newCustomerName, setNewCustomerName] = useState("");
  const [busy, setBusy] = useState(false);

  const firstLoad = useRef(true);
  const load = async () => {
    if (firstLoad.current) setLoading(true); // yoklamalarda "Yukleniyor" parlamasin
    let statuses;
    if (filter === "active") statuses = ["open","sent","preparing","ready"];
    else if (filter === "paid") statuses = ["paid","debt"];
    else statuses = ["open","sent","preparing","ready","paid","cancelled","debt"];

    const [{data: ords}, {data: tabs}] = await Promise.all([
      supabase.from("orders").select("*, stores:origin_store_id(slug, name)").in("origin_store_id", staffUser?.store_ids?.length ? staffUser.store_ids : ["00000000-0000-0000-0000-000000000000"])
        .in("status", statuses).order("created_at", {ascending:false}).limit(80),
      supabase.from("cafe_tables").select("id, name, store_id").order("sort_order"),
    ]);
    const tMap = {};
    (tabs || []).forEach(t => { tMap[t.id] = t.name; });
    setTableMap(tMap);
    setTables(tabs || []);
    setOrders(ords || []);
    // Mutfak durumu: siparis basina bekleyen/hazir kalem sayilari (Hazir butonu icin)
    const ids = (ords || []).map(o => o.id);
    if (ids.length) {
      const { data: its } = await supabase.from("order_items").select("order_id, kitchen_status").in("order_id", ids);
      const stats = {};
      (its || []).forEach(i => {
        const s = stats[i.order_id] || (stats[i.order_id] = { unready: 0, ready: 0, total: 0 });
        s.total++;
        if (i.kitchen_status === "pending" || i.kitchen_status === "preparing") s.unready++;
        if (i.kitchen_status === "ready") s.ready++;
      });
      setItemStats(stats);
    } else setItemStats({});
    if (firstLoad.current) { setLoading(false); firstLoad.current = false; }
  };

  const [itemStats, setItemStats] = useState({});

  // Mutfak kontrolu artik siparis ekranindan da yapilabilir (kucuk ekip icin tek ekran)
  const markReady = async (e, orderId) => {
    e.stopPropagation();
    const { error } = await supabase.from("order_items")
      .update({ kitchen_status: "ready" })
      .eq("order_id", orderId)
      .in("kitchen_status", ["pending", "preparing"]);
    if (error) { alert("Hazır işaretlenemedi: " + error.message); return; }
    await supabase.from("orders").update({ status: "ready" }).eq("id", orderId).in("status", ["open", "sent", "preparing"]);
    load();
  };
  const markServed = async (e, orderId) => {
    e.stopPropagation();
    const { error } = await supabase.from("order_items")
      .update({ kitchen_status: "served" }).eq("order_id", orderId);
    if (error) { alert("Hata: " + error.message); return; }
    load();
  };

  useEffect(() => {
    load();
    const ch = supabase.channel("orders-list")
      .on("postgres_changes", {event:"*", schema:"public", table:"orders"}, load)
      .on("postgres_changes", {event:"*", schema:"public", table:"order_items"}, load)
      .subscribe();
    // Telefon kilitlenince canli baglanti kopabiliyor: ekrana donunce tazele + 15 sn'de bir yedek yoklama
    const onWake = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);
    const iv = setInterval(() => { if (document.visibilityState === "visible") load(); }, 15000);
    return () => {
      supabase.removeChannel(ch);
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
      clearInterval(iv);
    };
  }, [filter]);

  const createOrder = async () => {
    if (busy) return;
    if (newMode === "table" && !newTableId) { alert("Masa seç"); return; }
    if (newMode === "walkin" && !newCustomerName.trim()) { alert("Misafir adı gerekli"); return; }
    setBusy(true);
    const table = newMode === "table" ? tables.find(t => t.id === newTableId) : null;
    const originStoreId = newMode === "table" ? table?.store_id : staffUser?.store_ids?.[0];
    if (!originStoreId) {
      setBusy(false);
      alert(newMode === "table" ? "Masa mağaza bilgisi bulunamadı — sayfayı yenileyip tekrar deneyin." : "Hesabınıza mağaza atanmamış.");
      return;
    }
    const payload = {
      status: "open", subtotal: 0, total: 0,
      table_id: newMode === "table" ? newTableId : null,
      customer_name: newMode === "walkin" ? newCustomerName.trim() : null,
      origin_store_id: originStoreId,
      staff_id: staffUser?.id,
    };
    const { data, error } = await supabase.from("orders").insert(payload).select().single();
    setBusy(false);
    if (error) { alert("Hata: " + error.message); return; }
    setNewModal(false);
    setNewTableId(""); setNewCustomerName("");
    navigate("/orders/" + data.id);
  };

  if (loading) return (<div style={{color:"#888",fontFamily:cv,padding:20}}>Yukleniyor...</div>);

  return (
    <div style={{fontFamily:cv,color:"#F0EDE8"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10,flexWrap:"wrap",gap:10}}>
        <div>
          <div style={{fontSize:24,fontWeight:800}}>Siparişler</div>
          <div style={{fontSize:11,color:"#888",letterSpacing:"1px"}}>{orders.length} SIPARIS</div>
        </div>
        <button onClick={() => setNewModal(true)} style={{padding:"10px 16px",background:"#FFFFFF",color:"#000",border:"none",borderRadius:10,fontSize:13,fontWeight:800,cursor:"pointer"}}>+ Yeni Sipariş</button>
      </div>

      <div style={{display:"flex",gap:6,marginBottom:14,overflowX:"auto"}}>
        {[["active","AKTIF"],["paid","ODENMIS"],["all","HEPSI"]].map(([k,l]) => (
          <button key={k} onClick={()=>setFilter(k)} style={{flexShrink:0,padding:"7px 12px",border:"none",borderRadius:16,fontSize:11,fontWeight:700,letterSpacing:"0.5px",background:filter===k?"#FFFFFF":"#222",color:filter===k?"#000":"#888",cursor:"pointer",whiteSpace:"nowrap"}}>{l}</button>
        ))}
      </div>

      {orders.length === 0 && <div style={{textAlign:"center",padding:40,color:"#888888",fontSize:13}}>Hiç sipariş yok</div>}

      {orders.map(o => {
        const st = STATUS_LABEL[o.status] || {label:o.status, color:"#888"};
        const where = o.table_id ? (tableMap[o.table_id] || "Masa") + (o.customer_name ? " · " + o.customer_name : "") : (o.customer_name || "Misafir");
        const waitMin = Math.round((Date.now() - new Date(o.created_at).getTime()) / 60000);
        return (
          <div key={o.id} onClick={() => navigate("/orders/" + o.id)} style={{background:"#1A1A1A",border:"1px solid #2A2A2A",borderRadius:10,padding:12,marginBottom:8,cursor:"pointer",display:"flex",alignItems:"center",gap:10}}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                {o.stores?.slug && <span style={{display:"inline-block",background:o.stores.slug==="doner"?"#FFFFFF":"#222222",color:o.stores.slug==="doner"?"#000":"#F0EDE8",padding:"2px 8px",borderRadius:6,fontSize:12,fontWeight:600,letterSpacing:"0.2px"}}>{o.stores.slug==="doner"?"DÖNER":"PARIS"}</span>}
                <div style={{fontSize:14,fontWeight:700,color:"#F0EDE8"}}>{where}</div>
                <span style={{fontSize:12,padding:"2px 8px",background:st.color+"22",color:st.color,borderRadius:6,fontWeight:600,letterSpacing:"0.2px"}}>{st.label?.toUpperCase()}</span>
              </div>
              <div style={{fontSize:11,color:"#888",marginTop:3}}>
                {new Date(o.created_at).toLocaleString("tr-TR", {hour:"2-digit", minute:"2-digit", day:"2-digit", month:"2-digit"})}
                <span style={{marginLeft:10}}>{waitMin} dk önce</span>
              </div>
            </div>
            <div style={{textAlign:"right",display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6}}>
              <div style={{fontSize:16,fontWeight:800,color:"#FFFFFF"}}>₺{o.total || 0}</div>
              {(() => {
                const s = itemStats[o.id];
                if (!s || o.status === "paid" || o.status === "cancelled" || o.status === "debt") return null;
                if (s.unready > 0) return (
                  <button onClick={(e) => markReady(e, o.id)} style={{padding:"8px 14px",background:"#FFFFFF",color:"#000",border:"none",borderRadius:8,fontSize:12,fontWeight:800,cursor:"pointer",whiteSpace:"nowrap"}}>
                    <Ikon ad="zil" boy={14} style={{marginRight:6}}/>Hazır ({s.unready})
                  </button>
                );
                if (s.ready > 0) return (
                  <button onClick={(e) => markServed(e, o.id)} style={{padding:"8px 14px",background:"transparent",color:"#FFFFFF",border:"1px solid #FFFFFF",borderRadius:8,fontSize:12,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>
                    <Ikon ad="onay" boy={14} style={{marginRight:6}}/>Teslim Edildi
                  </button>
                );
                return null;
              })()}
            </div>
          </div>
        );
      })}

      {newModal && (
        <div onClick={() => setNewModal(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:100}}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#161616",border:"1px solid #2A2A2A",borderRadius:"16px 16px 0 0",padding:20,width:"100%",maxWidth:480}}>
            <div style={{fontSize:18,fontWeight:800,marginBottom:14}}>Yeni Sipariş Aç</div>
            <div style={{display:"flex",gap:6,marginBottom:14}}>
              <button onClick={()=>setNewMode("table")} style={{flex:1,padding:"10px",background:newMode==="table"?"#FFFFFF":"#0C0C0C",color:newMode==="table"?"#000":"#aaa",border:"1px solid #333",borderRadius:10,fontSize:12,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}><Ikon ad="masa" boy={14}/>Masa</button>
              <button onClick={()=>setNewMode("walkin")} style={{flex:1,padding:"10px",background:newMode==="walkin"?"#FFFFFF":"#0C0C0C",color:newMode==="walkin"?"#000":"#aaa",border:"1px solid #333",borderRadius:10,fontSize:12,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}><Ikon ad="kisi" boy={14}/>Misafir / Paket</button>
            </div>
            {newMode === "table" ? (
              <div>
                <div style={{fontSize:12,color:"#888",letterSpacing:"0.2px",fontWeight:600,marginBottom:6}}>Masa seç</div>
                {tables.length === 0 ? (
                  <div style={{color:"#888",fontSize:12,padding:10}}>Henüz masa yok. "Masa Yönetimi"nden ekle.</div>
                ) : (
                  <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                    {tables.map(t => (
                      <button key={t.id} onClick={()=>setNewTableId(t.id)} style={{padding:"10px 14px",background:newTableId===t.id?"#FFFFFF":"#0C0C0C",color:newTableId===t.id?"#000":"#aaa",border:"1px solid #333",borderRadius:10,fontSize:13,fontWeight:700,cursor:"pointer"}}>{t.name}</button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div>
                <div style={{fontSize:12,color:"#888",letterSpacing:"0.2px",fontWeight:600,marginBottom:6}}>Misafir adı</div>
                <input value={newCustomerName} onChange={e=>setNewCustomerName(e.target.value)} placeholder="Örn: Efekan" style={{width:"100%",padding:"10px 12px",background:"#0C0C0C",border:"1px solid #2A2A2A",borderRadius:8,color:"#F0EDE8",fontSize:14,outline:"none",fontFamily:"inherit"}}/>
              </div>
            )}
            <div style={{display:"flex",gap:8,marginTop:16}}>
              <button onClick={()=>setNewModal(false)} style={{flex:1,padding:"12px",background:"transparent",color:"#888",border:"1px solid #333",borderRadius:10,fontSize:14,fontWeight:700,cursor:"pointer"}}>İptal</button>
              <button onClick={createOrder} disabled={busy} style={{flex:2,padding:"12px",background:"#FFFFFF",color:"#000",border:"none",borderRadius:10,fontSize:14,fontWeight:800,cursor:"pointer",opacity:busy?0.6:1}}>{busy?"...":"Aç"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
