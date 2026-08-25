import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase.js";
import { useAuth } from "../../contexts/AuthContext.jsx";

const cv = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";

export default function TablesPage() {
  const navigate = useNavigate();
  const { staffUser } = useAuth();
  const [tables, setTables] = useState([]);
  const [orders, setOrders]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [editTable, setEditTable] = useState(null);
  const [editName, setEditName] = useState("");
  const [walkinOpen, setWalkinOpen] = useState(false);
  const [walkinName, setWalkinName] = useState("");
  // Ortak masada birden fazla hesap var; satira dokununca kisiler aciliyor.
  const [acikOrtak, setAcikOrtak] = useState({});

  // "38 dk" / "1 sa 12 dk"
  const sure = (iso) => {
    const dk = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
    if (dk < 60) return dk + " dk";
    return Math.floor(dk / 60) + " sa " + (dk % 60) + " dk";
  };
  const kalemAdedi = (o) => Number(o.order_items?.[0]?.count || 0);

  const load = async () => {
    setLoading(true);
    const [{data: tabs}, {data: ords}] = await Promise.all([
      supabase.from("cafe_tables").select("*").in("store_id", staffUser?.store_ids?.length ? staffUser.store_ids : ["00000000-0000-0000-0000-000000000000"]).order("sort_order").order("name"),
      supabase.from("orders").select("id, table_id, customer_name, total, status, created_at, origin_store_id, stores:origin_store_id(slug, name), staff:staff_id(name), order_items(count)").in("origin_store_id", staffUser?.store_ids?.length ? staffUser.store_ids : ["00000000-0000-0000-0000-000000000000"]).in("status", ["open","sent","preparing","ready"]),
    ]);
    setTables(tabs || []);
    setOrders(ords || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const tableOrders = (tableId) => orders.filter(o => o.table_id === tableId);
  const tableHasOpenOrder = (tableId) => orders.find(o => o.table_id === tableId);

  const filtered = tables.filter(t => {
    if (filter === "all") return true;
    if (filter === "dis") return t.section === "Dış" || t.name?.toLowerCase().startsWith("dış");
    if (filter === "cam") return t.name?.toLowerCase().includes("cam");
    if (filter === "cowork") return t.name?.toLowerCase().includes("co-work");
    return true;
  });

  const openOrderForTable = async (table) => {
    // Ortak masada her kisi ayri hesap acar; normal masada acik hesap varsa ona gidilir
    const existing = table.shared ? null : tableHasOpenOrder(table.id);
    if (existing) { navigate("/orders/" + existing.id); return; }
    const { data: newOrd, error } = await supabase.from("orders").insert({
      table_id: table.id, origin_store_id: table.store_id, staff_id: staffUser?.id, status: "open", subtotal: 0, total: 0, discount_amount: 0,
    }).select().single();
    if (error) { alert("Hata: " + error.message); return; }
    navigate("/orders/" + newOrd.id);
  };

  const createWalkinOrder = async () => {
    const name = walkinName.trim();
    if (!name) { alert("İsim giriniz"); return; }
    const { data: newOrd, error } = await supabase.from("orders").insert({
      table_id: null, customer_name: name, origin_store_id: staffUser?.store_ids?.[0], staff_id: staffUser?.id, status: "open", subtotal: 0, total: 0, discount_amount: 0,
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
  const acikToplam = orders.reduce((s, o) => s + Number(o.total || 0), 0);

  // ACIK HESAPLAR TEK LISTE. Eskiden masasiz hesaplar ayri bir bolumdeydi ve
  // dolu masalar bos masalarla ayni izgarada duruyordu; garson servis sirasinda
  // hangi hesabin acik oldugunu izgarayi tarayarak buluyordu.
  const acikSatirlar = [];
  orders.filter(o => !o.table_id).forEach(o => acikSatirlar.push({
    key: "o" + o.id, ad: (o.customer_name || "İsimsiz"),
    alt: "Masasız · " + sure(o.created_at), tutar: Number(o.total || 0),
    magaza: o.stores?.slug, git: () => navigate("/orders/" + o.id),
  }));
  filtered.forEach(t => {
    const ords = tableOrders(t.id);
    if (!ords.length) return;
    const toplam = ords.reduce((s, o) => s + Number(o.total || 0), 0);
    if (ords.length === 1 && !t.shared) {
      const o = ords[0];
      const adet = kalemAdedi(o);
      acikSatirlar.push({
        key: "t" + t.id, ad: t.name, tutar: toplam, magaza: o.stores?.slug,
        alt: [sure(o.created_at), o.staff?.name, adet ? adet + " ürün" : null].filter(Boolean).join(" · "),
        git: () => navigate("/orders/" + o.id),
      });
    } else {
      acikSatirlar.push({
        key: "t" + t.id, ad: t.name + " · " + ords.length + " kişi", tutar: toplam, masa: t, ords,
        alt: ords.map(o => (o.customer_name || "İsimsiz") + " ₺" + (o.total || 0)).join(" · "),
      });
    }
  });
  const bosMasalar = filtered.filter(t => tableOrders(t.id).length === 0);

  return (
    <div style={{fontFamily:cv,color:"#F0EDE8"}}>
      <div style={{marginBottom:14}}>
        <div style={{fontSize:24,fontWeight:800,color:"#F0EDE8",letterSpacing:"-0.4px"}}>Masalar</div>
        <div style={{fontSize:11,color:"#8A8580",letterSpacing:"1.5px",fontWeight:700,marginTop:3,textTransform:"uppercase"}}>
          {occupiedCount}/{tables.length} dolu{acikToplam > 0 ? " · ₺" + acikToplam.toLocaleString("tr-TR") : ""}
        </div>
      </div>

      <button onClick={() => setWalkinOpen(true)} style={{width:"100%",padding:"14px",background:"#FFFFFF",color:"#000",border:"none",borderRadius:12,fontSize:15,fontWeight:800,marginBottom:16,cursor:"pointer",boxShadow:"0 2px 8px rgba(255,255,255,0.3)"}}>
        + Yeni Hesap (Isimle)
      </button>

      <div style={{display:"flex",gap:8,marginBottom:16,overflowX:"auto"}}>
        {[["all","TUMU"],["dis","DIŞ"],["cam","ÖN CAM"],["cowork","CO-WORK"]].map(([k,l]) => (
          <button key={k} onClick={() => setFilter(k)} style={{padding:"8px 16px",border:"none",borderRadius:18,fontSize:11,fontWeight:700,letterSpacing:"1px",background:filter===k?"#FFFFFF":"#222",color:filter===k?"#000":"#888",cursor:"pointer",whiteSpace:"nowrap",flexShrink:0}}>{l}</button>
        ))}
      </div>

      {acikSatirlar.length > 0 && (
        <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:20}}>
          <div style={{fontSize:11,color:"#8A8580",letterSpacing:"1.5px",fontWeight:700,textTransform:"uppercase"}}>
            Açık hesaplar — satıra dokun
          </div>
          {acikSatirlar.map((s, i) => {
            const ortak = !!s.ords;
            const acik = ortak && acikOrtak[s.key];
            return (
              <div key={s.key}>
                {/* KARTIN HER YERI hesabi aciyor. Eskiden yalnizca alttaki kucuk
                    dugme calisiyordu; servis sirasinda en cok iskalanan yer burasiydi. */}
                <div onClick={ortak ? () => setAcikOrtak(p => ({...p, [s.key]: !p[s.key]})) : s.git}
                  style={{background:"#1A1A1A",border:"1px solid "+(i===0?"#FFFFFF":"#2A2A2A"),borderRadius:12,
                          padding:"13px 15px",cursor:"pointer",display:"flex",alignItems:"center",gap:12}}>
                  <div style={{flex:1,minWidth:0}}>
                    {s.magaza && <div style={{display:"inline-block",background:s.magaza==="doner"?"#FFFFFF":"#222222",color:s.magaza==="doner"?"#000":"#F0EDE8",padding:"2px 8px",borderRadius:6,fontSize:12,fontWeight:600,letterSpacing:"0.2px",marginBottom:4}}>{s.magaza==="doner"?"🥙 DÖNER":"🗼 PARIS"}</div>}
                    <div style={{fontSize:17,fontWeight:800,color:"#F0EDE8",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.ad}</div>
                    <div style={{fontSize:12,color:"#888",marginTop:3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.alt}</div>
                  </div>
                  <span style={{fontSize:18,fontWeight:800,fontVariantNumeric:"tabular-nums"}}>₺{s.tutar.toLocaleString("tr-TR")}</span>
                  <span style={{color:"#888888",fontSize:15}}>{ortak ? (acik ? "⌄" : "›") : "›"}</span>
                </div>
                {acik && (
                  <div style={{display:"flex",flexDirection:"column",gap:6,padding:"8px 0 0 12px"}}>
                    {s.ords.map(o => (
                      <div key={o.id} onClick={() => navigate("/orders/" + o.id)}
                        style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:"#0C0C0C",
                                border:"1px solid #2A2A2A",borderRadius:8,padding:"10px 12px",cursor:"pointer"}}>
                        <span style={{fontSize:13,fontWeight:700,color:"#F0EDE8"}}>{o.customer_name || "İsimsiz"}</span>
                        <span style={{fontSize:13,fontWeight:800,fontVariantNumeric:"tabular-nums"}}>₺{o.total || 0} ›</span>
                      </div>
                    ))}
                    <button onClick={() => openOrderForTable(s.masa)}
                      style={{padding:"10px",background:"transparent",color:"#F0EDE8",border:"1px solid #2A2A2A",
                              borderRadius:8,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                      + Yeni kişi
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {bosMasalar.length > 0 && (
        <>
          <div style={{fontSize:11,color:"#8A8580",letterSpacing:"1.5px",fontWeight:700,textTransform:"uppercase",marginBottom:10}}>
            Boş masalar
          </div>
          {/* Bos masalar artik ekranin yarisini kaplayan kartlar degil, kucuk kutucuklar. */}
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {bosMasalar.map(t => (
              <div key={t.id} style={{display:"flex",alignItems:"center",border:"1px solid #2A2A2A",borderRadius:10,overflow:"hidden"}}>
                <button onClick={() => openOrderForTable(t)}
                  style={{padding:"11px 14px",background:"transparent",color:"#F0EDE8",border:"none",
                          fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                  {t.name}{t.shared && <span style={{marginLeft:6,fontSize:12,color:"#8A8580",fontWeight:600,letterSpacing:"0.2px"}}>Ortak</span>}
                </button>
                <button onClick={(e) => {e.stopPropagation(); setEditTable(t); setEditName(t.name);}}
                  title="Adını değiştir"
                  style={{padding:"11px 9px 11px 3px",background:"transparent",border:"none",color:"#888888",
                          cursor:"pointer",fontSize:11,fontFamily:"inherit"}}>✏️</button>
              </div>
            ))}
          </div>
        </>
      )}

      {walkinOpen && (
        <div onClick={() => setWalkinOpen(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100,padding:20}}>
          <div onClick={e => e.stopPropagation()} style={{background:"#1A1A1A",border:"1px solid #2A2A2A",borderRadius:16,padding:24,width:"100%",maxWidth:400}}>
            <div style={{fontSize:20,fontWeight:800,color:"#F0EDE8",marginBottom:6}}>Yeni Acik Hesap</div>
            <div style={{fontSize:12,color:"#888",marginBottom:18}}>Musterinin adini gir (orn: "Efekan", "Sari sapkali abi")</div>
            <input value={walkinName} onChange={e => setWalkinName(e.target.value)} autoFocus placeholder="Musteri adi..."
              onKeyDown={e => e.key === "Enter" && createWalkinOrder()}
              style={{width:"100%",padding:"14px 16px",background:"#0C0C0C",border:"1px solid #FFFFFF",borderRadius:10,color:"#F0EDE8",fontSize:16,outline:"none",marginBottom:14}}/>
            <div style={{display:"flex",gap:8}}>
              <button onClick={() => setWalkinOpen(false)} style={{flex:1,padding:"12px",background:"transparent",color:"#888",border:"1px solid #333",borderRadius:10,fontSize:14,fontWeight:700,cursor:"pointer"}}>Iptal</button>
              <button onClick={createWalkinOrder} style={{flex:2,padding:"12px",background:"#FFFFFF",color:"#000",border:"none",borderRadius:10,fontSize:14,fontWeight:800,cursor:"pointer"}}>Hesap Ac</button>
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
              style={{width:"100%",padding:"14px 16px",background:"#0C0C0C",border:"1px solid #FFFFFF",borderRadius:10,color:"#F0EDE8",fontSize:16,outline:"none",marginBottom:14}}/>
            <div style={{display:"flex",gap:8}}>
              <button onClick={() => setEditTable(null)} style={{flex:1,padding:"12px",background:"transparent",color:"#888",border:"1px solid #333",borderRadius:10,fontSize:14,fontWeight:700,cursor:"pointer"}}>Iptal</button>
              <button onClick={saveTableName} style={{flex:2,padding:"12px",background:"#FFFFFF",color:"#000",border:"none",borderRadius:10,fontSize:14,fontWeight:800,cursor:"pointer"}}>Kaydet</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
