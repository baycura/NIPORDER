import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase.js";
import { useAuth } from "../../contexts/AuthContext.jsx";
import Ikon from "../../components/Ikon.jsx";
import Bildirim, { useSonListe } from "../../components/Bildirim.jsx";
import KasaSayKarti from "../../components/KasaSayKarti.jsx";
import { misafirHesapAc } from "../../lib/misafirHesap.js";
import { tl, sure } from "../../lib/para.js";
import { personelHata } from "../../lib/errorText.js";

const cv = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";

const AKTIF_DURUMLAR = ["open", "sent", "preparing", "ready"];

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
  useSonListe("/orders");
  const [busy, setBusy] = useState(false);
  // yukHata: liste cekilemedi (serit cikar, eski liste ekranda kalir).
  // hata: bir islem basarisiz oldu — { m: metin, n: sayac } kisa bildirim.
  const [yukHata, setYukHata] = useState(false);
  const [hata, setHata] = useState(null);
  const hataGoster = (m) => setHata({ m, n: Date.now() });
  // Hazir / Teslim Edildi: su an isaretlenen hesaplar (cift dokunus korumasi).
  const [isaretlenen, setIsaretlenen] = useState([]);

  const firstLoad = useRef(true);
  const load = async () => {
    if (firstLoad.current) setLoading(true); // yoklamalarda "Yukleniyor" parlamasin
    let statuses;
    if (filter === "active") statuses = ["open","sent","preparing","ready"];
    else if (filter === "paid") statuses = ["paid","debt"];
    else statuses = ["open","sent","preparing","ready","paid","cancelled","debt"];

    const [{data: ords, error: e1}, {data: tabs, error: e2}] = await Promise.all([
      supabase.from("orders").select("*, stores:origin_store_id(slug, name)").in("origin_store_id", staffUser?.store_ids?.length ? staffUser.store_ids : ["00000000-0000-0000-0000-000000000000"])
        .in("status", statuses).order("created_at", {ascending:false}).limit(80),
      supabase.from("cafe_tables").select("id, name, store_id").order("sort_order"),
    ]);
    // Baglanti koptuysa liste SILINMEZ: 15 sn'lik yoklama eskiden listeyi
    // bosaltip "Hiç sipariş yok" yaziyordu. Eski liste kalir, serit cikar.
    if (e1 || e2) {
      setYukHata(true);
      if (firstLoad.current) { setLoading(false); firstLoad.current = false; }
      return;
    }
    setYukHata(false);
    const tMap = {};
    (tabs || []).forEach(t => { tMap[t.id] = t.name; });
    setTableMap(tMap);
    setTables(tabs || []);
    setOrders(ords || []);
    // Mutfak durumu: siparis basina bekleyen/hazir kalem sayilari (Hazir butonu icin)
    const ids = (ords || []).map(o => o.id);
    if (ids.length) {
      const { data: its, error: e3 } = await supabase.from("order_items").select("order_id, kitchen_status").in("order_id", ids);
      // Kalem durumu okunamadiysa eski sayilar kalir (Hazir dugmeleri kaybolmasin).
      if (e3) {
        setYukHata(true);
        if (firstLoad.current) { setLoading(false); firstLoad.current = false; }
        return;
      }
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
  // Cift dokunus korumasi: ayni hesap isaretlenirken ikinci dokunus yok sayilir;
  // liste tazelenene kadar dugme soluk kalir. Baska hesabin dugmesi calisir.
  const isaretle = async (orderId, is) => {
    if (isaretlenen.includes(orderId)) return;
    setIsaretlenen(l => [...l, orderId]);
    try { await is(); }
    finally { setIsaretlenen(l => l.filter(x => x !== orderId)); }
  };
  const markReady = (e, orderId) => {
    e.stopPropagation();
    return isaretle(orderId, async () => {
      const { error } = await supabase.from("order_items")
        .update({ kitchen_status: "ready" })
        .eq("order_id", orderId)
        .in("kitchen_status", ["pending", "preparing"]);
      if (error) { hataGoster(personelHata(error)); return; }
      await supabase.from("orders").update({ status: "ready" }).eq("id", orderId).in("status", ["open", "sent", "preparing"]);
      await load();
    });
  };
  const markServed = (e, orderId) => {
    e.stopPropagation();
    return isaretle(orderId, async () => {
      const { error } = await supabase.from("order_items")
        .update({ kitchen_status: "served" }).eq("order_id", orderId);
      if (error) { hataGoster(personelHata(error)); return; }
      await load();
    });
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

  // TEK DOKUNUS "Misafir N" (lib/misafirHesap.js). Eskiden ana dugme
  // "Misafir / Paket" penceresini aciyor ve numarasiz "Misafir" yaziyordu:
  // 30 gunde 758 hesabin 367'si ayni adla acildi, listede birbirine karisti.
  // Masa ya da isim gerekiyorsa yandaki "Masa / İsim" bugunku pencereyi acar.
  const [misafirBusy, setMisafirBusy] = useState(false);
  const misafirAc = async () => {
    if (misafirBusy) return;
    setMisafirBusy(true);
    const { data, error } = await misafirHesapAc({ staffUser });
    setMisafirBusy(false);
    if (error || !data) { hataGoster(personelHata(error)); return; }
    navigate("/orders/" + data.id);
  };

  const createOrder = async () => {
    if (busy) return;
    // Masa secilmeden "Aç" dugmesi zaten pasif; bu satir yalniz emniyet.
    if (newMode === "table" && !newTableId) return;
    // Isim ZORUNLU DEGIL. Tezgahta siparisi alan, hazirlayan ve odemeyi alan
    // ayni kisi; her musteride klavye acip isim yazdirmak siranin onunde
    // kaybedilen saniye demek. Bos birakilirsa "Misafir" olarak acilir.
    setBusy(true);
    const table = newMode === "table" ? tables.find(t => t.id === newTableId) : null;
    const originStoreId = newMode === "table" ? table?.store_id : staffUser?.store_ids?.[0];
    if (!originStoreId) {
      setBusy(false);
      hataGoster(newMode === "table" ? "Masa mağaza bilgisi bulunamadı — sayfayı yenileyip tekrar deneyin." : "Hesabınıza mağaza atanmamış.");
      return;
    }
    const payload = {
      status: "open", subtotal: 0, total: 0,
      table_id: newMode === "table" ? newTableId : null,
      customer_name: newMode === "walkin" ? (newCustomerName.trim() || "Misafir") : null,
      origin_store_id: originStoreId,
      staff_id: staffUser?.id,
    };
    const { data, error } = await supabase.from("orders").insert(payload).select().single();
    setBusy(false);
    if (error) { hataGoster(personelHata(error)); return; }
    setNewModal(false);
    setNewTableId(""); setNewCustomerName("");
    navigate("/orders/" + data.id);
  };

  if (loading) return (<div style={{color:"#888",fontFamily:cv,padding:20}}>Yükleniyor…</div>);

  return (
    <div style={{fontFamily:cv,color:"#F0EDE8"}}>
      <Bildirim/>
      {hata && <Bildirim tur="hata" metin={hata.m} key={hata.n}/>}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10,flexWrap:"wrap",gap:10}}>
        <div>
          <div style={{fontSize:24,fontWeight:800}}>Siparişler</div>
          <div style={{fontSize:11,color:"#888",letterSpacing:"1px"}}>{orders.length} SİPARİŞ</div>
        </div>
        <div style={{display:"flex",gap:6}}>
          <button onClick={() => setNewModal(true)} style={{minHeight:44,padding:"10px 12px",background:"transparent",color:"#F0EDE8",border:"1px solid #3A3A3A",borderRadius:10,fontSize:12.5,fontWeight:700,cursor:"pointer"}}>Masa / İsim</button>
          <button onClick={misafirAc} disabled={misafirBusy} style={{minHeight:44,padding:"0 18px",background:"#FFFFFF",color:"#000",border:"none",borderRadius:10,fontSize:15,fontWeight:800,cursor:"pointer",opacity:misafirBusy?0.6:1}}>{misafirBusy ? "Açılıyor…" : "+ Misafir"}</button>
        </div>
      </div>

      {yukHata && (
        <div role="alert" style={{display:"flex",alignItems:"center",gap:10,background:"#1A1A1A",border:"1px solid #C87A6A",borderRadius:12,padding:"10px 14px",fontSize:13,marginBottom:12}}>
          <Ikon ad="uyari" boy={16}/>
          <span style={{flex:1}}>Bağlantı kurulamadı — liste güncel olmayabilir.</span>
          <button onClick={() => load()} style={{minHeight:44,padding:"0 14px",background:"transparent",color:"#F0EDE8",border:"1px solid #3A3A3A",borderRadius:10,fontWeight:700,fontFamily:"inherit"}}>Tekrar dene</button>
        </div>
      )}

      <KasaSayKarti/>

      <div style={{display:"flex",gap:6,marginBottom:14,overflowX:"auto"}}>
        {[["active","AKTİF"],["paid","ÖDENMİŞ"],["all","TÜMÜ"]].map(([k,l]) => (
          <button key={k} onClick={()=>setFilter(k)} aria-pressed={filter === k} style={{flexShrink:0,padding:"0 16px",minHeight:44,border:"none",borderRadius:22,fontSize:13,fontWeight:700,letterSpacing:"0.5px",background:filter===k?"#FFFFFF":"#222",color:filter===k?"#000":"#A8A39C",cursor:"pointer",whiteSpace:"nowrap"}}>{l}</button>
        ))}
      </div>

      {orders.length === 0 && !yukHata && <div style={{textAlign:"center",padding:40,color:"#888888",fontSize:13}}>Hiç sipariş yok</div>}

      {orders.map(o => {
        const st = STATUS_LABEL[o.status] || {label:o.status, color:"#888"};
        const where = o.table_id ? (tableMap[o.table_id] || "Masa") + (o.customer_name ? " · " + o.customer_name : "") : (o.customer_name || "Misafir");
        // Sure yalniz acik hesapta anlamli; kapali hesapta tarih zaten ustte.
        const aktif = AKTIF_DURUMLAR.includes(o.status);
        const isaretli = isaretlenen.includes(o.id);
        return (
          <div key={o.id} onClick={() => navigate("/orders/" + o.id)} style={{background:"#1A1A1A",border:"1px solid #2A2A2A",borderRadius:12,padding:"13px 15px",marginBottom:8,cursor:"pointer",display:"flex",alignItems:"center",gap:10}}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                {o.stores?.slug && <span style={{display:"inline-block",background:o.stores.slug==="doner"?"#FFFFFF":"#222222",color:o.stores.slug==="doner"?"#000":"#F0EDE8",padding:"2px 8px",borderRadius:6,fontSize:12,fontWeight:600,letterSpacing:"0.2px"}}>{o.stores.slug==="doner"?"DÖNER":"PARIS"}</span>}
                <div style={{fontSize:16,fontWeight:700,color:"#F0EDE8"}}>{where}</div>
                <span style={{fontSize:12,padding:"2px 8px",background:st.color+"22",color:st.color,borderRadius:6,fontWeight:600,letterSpacing:"0.2px"}}>{st.label?.toLocaleUpperCase("tr-TR")}</span>
              </div>
              <div style={{fontSize:12,color:"#888",marginTop:3}}>
                {new Date(o.created_at).toLocaleString("tr-TR", {hour:"2-digit", minute:"2-digit", day:"2-digit", month:"2-digit"})}
                {aktif && <span style={{marginLeft:10}}>{sure(o.created_at)} önce</span>}
              </div>
            </div>
            <div style={{textAlign:"right",display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6}}>
              <div style={{fontSize:16,fontWeight:800,color:"#FFFFFF",fontVariantNumeric:"tabular-nums"}}>{tl(o.total)}</div>
              {(() => {
                const s = itemStats[o.id];
                if (!s || o.status === "paid" || o.status === "cancelled" || o.status === "debt") return null;
                if (s.unready > 0) return (
                  <button onClick={(e) => markReady(e, o.id)} disabled={isaretli} style={{minHeight:44,padding:"8px 14px",background:"#FFFFFF",color:"#000",border:"none",borderRadius:8,fontSize:13,fontWeight:800,cursor:"pointer",whiteSpace:"nowrap",opacity:isaretli?0.5:1}}>
                    <Ikon ad="zil" boy={14} style={{marginRight:6}}/>Hazır ({s.unready})
                  </button>
                );
                if (s.ready > 0) return (
                  <button onClick={(e) => markServed(e, o.id)} disabled={isaretli} style={{minHeight:44,padding:"8px 14px",background:"transparent",color:"#FFFFFF",border:"1px solid #FFFFFF",borderRadius:8,fontSize:13,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap",opacity:isaretli?0.5:1}}>
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
                <div style={{fontSize:12,color:"#888",letterSpacing:"0.2px",fontWeight:600,marginBottom:6}}>Misafir adı <span style={{color:"#666",fontWeight:400}}>— boş bırakabilirsin</span></div>
                <input value={newCustomerName} onChange={e=>setNewCustomerName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&createOrder()} placeholder="Tanıdıksa adı, değilse boş geç" style={{width:"100%",padding:"10px 12px",background:"#0C0C0C",border:"1px solid #2A2A2A",borderRadius:8,color:"#F0EDE8",fontSize:14,outline:"none",fontFamily:"inherit"}}/>
              </div>
            )}
            <div style={{display:"flex",gap:8,marginTop:16}}>
              <button onClick={()=>setNewModal(false)} style={{flex:1,padding:"12px",background:"transparent",color:"#888",border:"1px solid #333",borderRadius:10,fontSize:14,fontWeight:700,cursor:"pointer"}}>İptal</button>
              <button onClick={createOrder} disabled={busy || (newMode === "table" && !newTableId)} style={{flex:2,padding:"12px",background:"#FFFFFF",color:"#000",border:"none",borderRadius:10,fontSize:14,fontWeight:800,cursor:"pointer",opacity:(busy || (newMode === "table" && !newTableId))?0.6:1}}>{busy?"...":"Aç"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
