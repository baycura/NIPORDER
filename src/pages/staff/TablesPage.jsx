import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase.js";

const cv = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";

export default function TablesPage() {
  const navigate = useNavigate();
  const [tables, setTables] = useState([]);
  const [orders, setOrders]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [editTable, setEditTable] = useState(null);
  const [editName, setEditName] = useState("");
  const [walkinOpen, setWalkinOpen] = useState(false);
  const [walkinName, setWalkinName] = useState("");

  const load = async () => {
    setLoading(true);
    const [{data: tabs}, {data: ords}] = await Promise.all([
      supabase.from("cafe_tables").select("*").order("sort_order").order("name"),
      supabase.from("orders").select("id, table_id, customer_name, total, status, created_at, origin_store_id, stores:origin_store_id(slug, name)").in("status", ["open","sent","preparing","ready"]),
    ]);
    setTables(tabs || []);
    setOrders(ords || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const tableHasOpenOrder = (tableId) => orders.find(o => o.table_id === tableId);

  const filtered = tables.filter(t => {
    if (filter === "all") return true;
    if (filter === "bar") return t.name?.toLowerCase().includes("bar");
    if (filter === "ic")  return t.name?.toLowerCase().match(/^masa/);
    if (filter === "teras") return t.name?.toLowerCase().includes("teras");
    return true;
  });

  const openOrderForTable = async (table) => {
    const existing = tableHasOpenOrder(table.id);
    if (existing) { navigate("/orders/" + existing.id); return; }
    const { data: newOrd, error } = await supabase.from("orders").insert({
      table_id: table.id, status: "open", subtotal: 0, total: 0, discount_amount: 0,
    }).select().single();
    if (error) { alert("Hata: " + error.message); return; }
    navigate("/orders/" + newOrd.id);
  };

  const createWalkinOrder = async () => {
    const name = walkinName.trim();
    if (!name) { alert("İsim giriniz"); return; }
    const { data: newOrd, error } = await supabase.from("orders").insert({
      table_id: null, customer_name: name, status: "open", subtotal: 0, total: 0, discount_amount: 0,
    }).select().single();
    if (error) { alert("Hata: " + error.message); return; }
    setWalkinOpen(false); setWalkinName("");
    navigate("/orders/" + newOrd.id);
  };

  const saveTableName = async () => {
    if (!editTable) return;
    const newName = editName.trim();
    if (!newName) return;
    const { error } = await supabase.from("cafe_tables").update({ name: newName }).eq("id", editTable.id);
    if (error) { alert("Hata: " + error.message); return; }
    setEditTable(null); setEditName("");
    load();
  };

  if (loading) return <div style={{color:"#888",fontFamily:cv,padding:20}}>Yukleniyor...</div>;

  const occupiedCount = tables.filter(t => tableHasOpenOrder(t.id)).length;

  return (
    <div style={{fontFamily:cv,color:"#F0EDE8"}}>
      <div style={{marginBottom:14}}>
        <div style={{fontSize:26,fontWeight:800,color:"#F0EDE8"}}>Masalar</div>
        <div style={{fontSize:12,color:"#888",marginTop:2}}>{occupiedCount}/{tables.length} dolu</div>
      </div>

      <button onClick={() => setWalkinOpen(true)} style={{width:"100%",padding:"14px",background:"linear-gradient(135deg,#C8973E,#E0AB4A)",color:"#000",border:"none",borderRadius:12,fontSize:15,fontWeight:800,marginBottom:16,cursor:"pointer",boxShadow:"0 2px 8px rgba(200,151,62,0.3)"}}>
        + Yeni Hesap (Isimle)
      </button>

      <div style={{display:"flex",gap:8,marginBottom:16,overflowX:"auto"}}>
        {[["all","TUMU"],["bar","BAR"],["ic","IC MEKAN"],["teras","TERAS"]].map(([k,l]) => (
          <button key={k} onClick={() => setFilter(k)} style={{padding:"8px 16px",border:"none",borderRadius:18,fontSize:11,fontWeight:700,letterSpacing:"1px",background:filter===k?"#C8973E":"#222",color:filter===k?"#000":"#888",cursor:"pointer",whiteSpace:"nowrap",flexShrink:0}}>{l}</button>
        ))}
      </div>

      {orders.filter(o => !o.table_id).length > 0 && (
        <div style={{marginBottom:18}}>
          <div style={{fontSize:11,color:"#888",letterSpacing:"1.5px",fontWeight:700,marginBottom:8}}>ACIK HESAPLAR</div>
          {orders.filter(o => !o.table_id).map(o => (
            <div key={o.id} onClick={() => navigate("/orders/" + o.id)} style={{background:"#1A1A1A",border:"1px solid #C8973E",borderRadius:12,padding:14,marginBottom:8,cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                {o.stores?.slug && <div style={{display:"inline-block",background:o.stores.slug==="doner"?"#C8973E":"#3ECF8E",color:"#000",padding:"2px 8px",borderRadius:6,fontSize:10,fontWeight:800,letterSpacing:"0.5px",marginBottom:4}}>{o.stores.slug==="doner"?"🥙 DÖNER":"🗼 PARIS"}</div>}
                <div style={{fontSize:15,fontWeight:700,color:"#F0EDE8"}}>👤 {o.customer_name}</div>
                <div style={{fontSize:11,color:"#888",marginTop:2}}>Acik hesap · ₺{o.total || 0}</div>
              </div>
              <div style={{color:"#C8973E",fontSize:18}}>→</div>
            </div>
          ))}
        </div>
      )}

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",gap:10}}>
        {filtered.map(t => {
          const ord = tableHasOpenOrder(t.id);
          const isOpen = !!ord;
          return (
            <div key={t.id} style={{background:"#1A1A1A",border:"1px solid "+(isOpen?"#C8973E":"#2A2A2A"),borderRadius:12,padding:12,position:"relative"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
                <div style={{fontSize:15,fontWeight:700,color:"#F0EDE8"}}>{t.name}</div>
                <button onClick={(e) => {e.stopPropagation(); setEditTable(t); setEditName(t.name);}} style={{background:"none",border:"none",color:"#666",cursor:"pointer",padding:2,fontSize:13}} title="Duzenle">✏️</button>
              </div>
              <div style={{fontSize:10,color:isOpen?"#C8973E":"#666",marginBottom:10}}>{isOpen ? "DOLU · ₺" + (ord.total||0) : t.capacity ? t.capacity + " kisilik" : "Bos"}</div>
              <button onClick={() => openOrderForTable(t)} style={{width:"100%",padding:"8px",background:isOpen?"#C8973E":"transparent",color:isOpen?"#000":"#C8973E",border:"1px solid #C8973E",borderRadius:8,fontSize:12,fontWeight:700,cursor:"pointer"}}>
                {isOpen ? "Hesabi Ac →" : "Siparis Ac +"}
              </button>
            </div>
          );
        })}
      </div>

      {walkinOpen && (
        <div onClick={() => setWalkinOpen(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100,padding:20}}>
          <div onClick={e => e.stopPropagation()} style={{background:"#1A1A1A",border:"1px solid #2A2A2A",borderRadius:16,padding:24,width:"100%",maxWidth:400}}>
            <div style={{fontSize:20,fontWeight:800,color:"#F0EDE8",marginBottom:6}}>Yeni Acik Hesap</div>
            <div style={{fontSize:12,color:"#888",marginBottom:18}}>Musterinin adini gir (orn: "Efekan", "Sari sapkali abi")</div>
            <input value={walkinName} onChange={e => setWalkinName(e.target.value)} autoFocus placeholder="Musteri adi..."
              onKeyDown={e => e.key === "Enter" && createWalkinOrder()}
              style={{width:"100%",padding:"14px 16px",background:"#0C0C0C",border:"1px solid #C8973E",borderRadius:10,color:"#F0EDE8",fontSize:16,outline:"none",marginBottom:14}}/>
            <div style={{display:"flex",gap:8}}>
              <button onClick={() => setWalkinOpen(false)} style={{flex:1,padding:"12px",background:"transparent",color:"#888",border:"1px solid #333",borderRadius:10,fontSize:14,fontWeight:700,cursor:"pointer"}}>Iptal</button>
              <button onClick={createWalkinOrder} style={{flex:2,padding:"12px",background:"#C8973E",color:"#000",border:"none",borderRadius:10,fontSize:14,fontWeight:800,cursor:"pointer"}}>Hesap Ac</button>
            </div>
          </div>
        </div>
      )}

      {editTable && (
        <div onClick={() => setEditTable(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100,padding:20}}>
          <div onClick={e => e.stopPropagation()} style={{background:"#1A1A1A",border:"1px solid #2A2A2A",borderRadius:16,padding:24,width:"100%",maxWidth:400}}>
            <div style={{fontSize:18,fontWeight:800,color:"#F0EDE8",marginBottom:14}}>Masayi Duzenle</div>
            <input value={editName} onChange={e => setEditName(e.target.value)} autoFocus
              onKeyDown={e => e.key === "Enter" && saveTableName()}
              style={{width:"100%",padding:"14px 16px",background:"#0C0C0C",border:"1px solid #C8973E",borderRadius:10,color:"#F0EDE8",fontSize:16,outline:"none",marginBottom:14}}/>
            <div style={{display:"flex",gap:8}}>
              <button onClick={() => setEditTable(null)} style={{flex:1,padding:"12px",background:"transparent",color:"#888",border:"1px solid #333",borderRadius:10,fontSize:14,fontWeight:700,cursor:"pointer"}}>Iptal</button>
              <button onClick={saveTableName} style={{flex:2,padding:"12px",background:"#C8973E",color:"#000",border:"none",borderRadius:10,fontSize:14,fontWeight:800,cursor:"pointer"}}>Kaydet</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
