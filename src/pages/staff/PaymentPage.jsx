import { useEffect, useState, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../../lib/supabase.js";
import { useAuth } from "../../contexts/AuthContext.jsx";

const cv = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";

// Hesabin ne kadar suredir acik oldugu. 12 saati gecen hesap "unutulmus" sayilir.
const BAYAT_SAAT = 12;
const saatFarki = (iso) => {
  const dk = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (dk < 60) return dk + " dk önce açıldı";
  const sa = Math.floor(dk / 60);
  if (sa < 24) return sa + " saat önce açıldı";
  return Math.floor(sa / 24) + " gün önce açıldı";
};
const bayatMi = (iso) => (Date.now() - new Date(iso).getTime()) > BAYAT_SAAT * 3600 * 1000;

export default function PaymentPage() {
  const navigate = useNavigate();
  const { staffUser } = useAuth();
  const [orders, setOrders] = useState([]);
  const [tables, setTables] = useState({});
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [method, setMethod] = useState("cash");
  const [amount, setAmount] = useState("");
  const [customerId, setCustomerId] = useState(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [uyeAcik, setUyeAcik] = useState(false); // nakit/kartta uye secici kapali baslar
  const [customers, setCustomers] = useState([]);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{data: ords}, {data: tabs}, {data: custs}] = await Promise.all([
      supabase.from("orders").select("id, table_id, customer_name, customer_id, use_points, staff_id, total, status, created_at, origin_store_id, stores:origin_store_id(slug, name)").in("origin_store_id", staffUser?.store_ids?.length ? staffUser.store_ids : ["00000000-0000-0000-0000-000000000000"]).in("status", ["open","sent","preparing","ready"]).order("created_at", { ascending: false }),
      supabase.from("cafe_tables").select("id, name").in("store_id", staffUser?.store_ids?.length ? staffUser.store_ids : ["00000000-0000-0000-0000-000000000000"]),
      supabase.from("customers").select("id, name, phone, points, outstanding_balance").order("name"),
    ]);
    const tabMap = {};
    (tabs || []).forEach(t => { tabMap[t.id] = t.name; });
    setTables(tabMap);
    setOrders(ords || []);
    setCustomers(custs || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  // Unutulmus hesap: gun icinde kapatilmayip ekranda kalan siparis. Odeme
  // alinmadigi icin "tahsil et" yanlis olur; kasa gecmisine sahte ciro yazmasin
  // diye iptal ediyoruz. Silmiyoruz — kalemler ve saat kaydi duruyor.
  const cancelOrder = async (o) => {
    const nerede = o.table_id ? (tables[o.table_id] || "Masa") : (o.customer_name || "Misafir");
    const uyeNotu = o.customer_id ? "\n⭐ Bu sipariş bir ÜYEYE bağlı — iptal edilirse puan kazanamaz." : "";
    if (!confirm(`"${nerede}" hesabı iptal edilsin mi?\n₺${o.total || 0} · ${saatFarki(o.created_at)}${uyeNotu}\n\nCiroya YAZILMAZ. Ödeme alındıysa bunun yerine "Tahsil Et" kullan.`)) return;
    const { error } = await supabase.from("orders").update({ status: "cancelled" }).eq("id", o.id);
    if (error) { alert("İptal edilemedi: " + error.message); return; }
    setOrders(prev => prev.filter(x => x.id !== o.id));
  };

  const [memberPts, setMemberPts] = useState(null); // {points, name} — modal acilinca cekilir
  const [usePoints, setUsePoints] = useState(false);
  const openPay = (o) => {
    setModal(o); setMethod("cash"); setAmount(String(o.total || 0));
    setCustomerId(null); setCustomerSearch(""); setUyeAcik(false);
    setUsePoints(!!o.use_points); setMemberPts(null);
    // Uyeye bagli siparis: cuzdan bakiyesi gosterilir, kasiyer puanla kapatabilir
    if (o.customer_id) {
      supabase.from("customers").select("name, points").eq("id", o.customer_id).maybeSingle()
        .then(({ data }) => setMemberPts(data ? { name: data.name, points: Number(data.points || 0) } : null));
    }
  };

  // Siparise bagli uye. QR'dan uye olarak acildiysa modal.customer_id dolu gelir
  // ve kasiyer degistiremez; degilse kasiyer tahsilat aninda secebilir.
  const uyeId = modal?.customer_id || customerId;
  const uyeKilitli = !!modal?.customer_id;

  // Kasada secilen uyenin puani da cekilir ki "puanla ode" onun icin de calissin.
  const secUye = (id) => {
    const yeni = customerId === id ? null : id;
    setCustomerId(yeni);
    if (!yeni) { setMemberPts(null); setUsePoints(false); return; }
    const c = customers.find(x => x.id === yeni);
    setMemberPts(c ? { name: c.name, points: Number(c.points || 0) } : null);
  };

  // Puan onizlemesi: dusum sunucuda (tetikleyici) yapilir, bu yalnizca kasiyerin
  // musteriden isteyecegi NAKIT tutari gosterir.
  const ptsCover = (o) => Math.min(Number(memberPts?.points || 0), Math.floor(Number(o?.total || 0)));

  // Siparis ekranindaki "Odeme Al" butonundan gelindi: ?order=<id> ile modali direkt ac
  const [searchParams] = useSearchParams();
  const autoOpened = useRef(false);
  useEffect(() => {
    const oid = searchParams.get("order");
    if (!oid || autoOpened.current || !orders.length) return;
    const o = orders.find(x => x.id === oid);
    if (o) { autoOpened.current = true; openPay(o); }
  }, [orders]);

  // Puan anahtari acilip kapandiginda odenecek tutar yeniden hesaplanir.
  useEffect(() => {
    if (!modal) return;
    const kalan = usePoints ? Math.max(0, Number(modal.total || 0) - ptsCover(modal)) : Number(modal.total || 0);
    setAmount(String(kalan));
  }, [usePoints]);

  // Bakiye modal acildiktan sonra gelirse ya da kasada uye secilirse tutar
  // YALNIZCA puan kullaniliyorken guncellenir. Aksi halde kasiyerin elle
  // yazdigi tutar, uye secildigi anda sessizce siparis toplamina donerdi.
  useEffect(() => {
    if (!modal || !usePoints) return;
    setAmount(String(Math.max(0, Number(modal.total || 0) - ptsCover(modal))));
  }, [memberPts]);

  const completePayment = async () => {
    if (busy) return;
    const amt = Number(amount);
    // Puan tum tutari karsiliyorsa nakit 0 olabilir
    if ((!amt || amt <= 0) && !(usePoints && ptsCover(modal) >= Number(modal.total || 0))) { alert("Gecerli tutar gir"); return; }

    if (method === "debt") {
      if (!customerId) { alert("Borc icin musteri sec"); return; }
      setBusy(true);
      const cust = customers.find(c => c.id === customerId);
      const newBalance = Number(cust?.outstanding_balance || 0) + amt;
      const [custRes, ordRes] = await Promise.all([
        supabase.from("customers").update({ outstanding_balance: newBalance }).eq("id", customerId).select("id"),
        supabase.from("orders").update({ status: "paid", paid_at: new Date().toISOString(), customer_id: customerId, use_points: false,
          ...(modal.staff_id ? {} : { staff_id: staffUser?.id || null }) }).eq("id", modal.id),
      ]);
      // Bakiye yazilamazsa borc kaybolur — sessiz gecilmemeli
      if (custRes.error || !custRes.data?.length) {
        alert("Veresiye bakiyesi güncellenemedi" + (custRes.error ? ": " + custRes.error.message : " (yetki yok)"));
        setBusy(false); return;
      }
      if (ordRes.error) { alert("Sipariş kapatılamadı: " + ordRes.error.message); setBusy(false); return; }
      // store_id ZORUNLU (NOT NULL). customer_id bu tabloda YOK — musteri zaten
      // siparise bagli; gonderilirse PostgREST 400 doner ve kayit hic yazilmaz.
      const { error: payErr } = await supabase.from("payments").insert({
        order_id: modal.id, amount: amt, method: "debt",
        store_id: modal.origin_store_id || staffUser?.store_ids?.[0],
        staff_id: staffUser?.id || null,
      });
      setBusy(false);
      if (custRes.error || ordRes.error) { alert("Hata: " + (custRes.error?.message || ordRes.error?.message)); return; }
      if (payErr) alert("Uyari: odeme kaydi yazilamadi — " + payErr.message);
      alert("Borc kaydedildi: ₺" + amt + " (Kalan: ₺" + newBalance + ")");
    } else {
      setBusy(true);
      // Puan tum tutari karsiladiysa nakit 0 — bos odeme kaydi atilmaz.
      // staff_id: tahsil eden — vardiya istatistigi ve otomatik vardiya
      // acilisi (shift_auto_checkin tetikleyicisi) buna dayanir.
      const { error: payErr } = amt > 0 ? await supabase.from("payments").insert({
        order_id: modal.id, amount: amt, method,
        store_id: modal.origin_store_id || staffUser?.store_ids?.[0],
        staff_id: staffUser?.id || null,
      }) : { error: null };
      // QR ile musterinin actigi siparislerde staff_id bos kalir; tahsil eden
      // damgalanir ki satis "personelsiz" kalmasin. Garsonun actigi siparis
      // garsona kayitli kalir — kasiyer ezmez.
      const { error } = await supabase.from("orders").update({
        status: "paid", paid_at: new Date().toISOString(),
        use_points: !!(usePoints && uyeId),
        // Kasada uye secildiyse siparise yazilir — puan ancak bu alan doluysa
        // islenir (fn_award_member_points customer_id bos ise hic calismaz).
        // Siparis zaten bir uyeye bagliysa (QR) kasiyer ustune yazamaz.
        ...(!uyeKilitli && customerId ? { customer_id: customerId } : {}),
        ...(modal.staff_id ? {} : { staff_id: staffUser?.id || null }),
      }).eq("id", modal.id);
      setBusy(false);
      if (error) { alert("Hata: " + error.message); return; }
      if (payErr) alert("Uyari: odeme kaydi yazilamadi — " + payErr.message);
      const kazanilan = uyeId
        ? Math.floor((Number(modal.total || 0) - (usePoints ? ptsCover(modal) : 0)) / 20)
        : 0;
      alert((method === "cash" ? "Nakit tahsil edildi" : "Kart ile tahsil edildi")
        + (uyeId ? "\n⭐ " + (memberPts?.name || "Üye") + " · +" + kazanilan + " puan" : ""));
    }
    setModal(null); load();
  };

  if (loading) return (<div style={{color:"#888",fontFamily:cv,padding:20}}>Yukleniyor...</div>);

  // Isimle ya da telefonun son haneleriyle aranir — kasada en hizli yol
  // "telefonunuzun son 4 hanesi?" diye sorup yazmak.
  const filteredCustomers = customers.filter(c => {
    const q = customerSearch.trim().toLowerCase();
    if (!q) return true;
    if (c.name?.toLowerCase().includes(q)) return true;
    const rakam = q.replace(/\D/g, "");
    if (!rakam) return false;
    return String(c.phone || "").replace(/\D/g, "").includes(rakam);
  });

  return (
    <div style={{fontFamily:cv,color:"#F0EDE8"}}>
      <div style={{fontSize:24,fontWeight:800,marginBottom:4}}>Kasa</div>
      <div style={{fontSize:11,color:"#888",letterSpacing:"1px",marginBottom:18}}>
        {orders.length} BEKLEYEN HESAP
        {orders.filter(o => bayatMi(o.created_at)).length > 0 &&
          <span style={{color:"#C8973E"}}> · {orders.filter(o => bayatMi(o.created_at)).length} UNUTULMUŞ</span>}
      </div>

      {orders.length === 0 && <div style={{textAlign:"center",padding:40,color:"#666",fontSize:13}}>Bekleyen hesap yok</div>}

      {orders.map(o => {
        const where = o.table_id ? (tables[o.table_id] || "Masa") + (o.customer_name ? " · 👤 " + o.customer_name : "") : "👤 " + (o.customer_name || "Misafir");
        const storeSlug = o.stores?.slug;
        const storeBadge = storeSlug === "doner" ? "🥙 DÖNER" : storeSlug === "paris" ? "🗼 PARIS" : null;
        const storeBadgeColor = storeSlug === "doner" ? "#C8973E" : "#3ECF8E";
        const eski = bayatMi(o.created_at);
        return (
          <div key={o.id} style={{background:"#1A1A1A",border:"1px solid "+(eski?"#4A3A1A":"#2A2A2A"),borderRadius:10,padding:14,marginBottom:8,display:"flex",alignItems:"center",gap:12}}>
            <div style={{flex:1,minWidth:0}}>
              {storeBadge && <div style={{display:"inline-block",background:storeBadgeColor,color:"#000",padding:"2px 8px",borderRadius:6,fontSize:10,fontWeight:800,letterSpacing:"0.5px",marginBottom:4,marginRight:4}}>{storeBadge}</div>}
              {o.customer_id && <div style={{display:"inline-block",background:"#000",color:"#FFD700",padding:"2px 8px",borderRadius:6,fontSize:10,fontWeight:800,letterSpacing:"0.5px",marginBottom:4}}>⭐ ÜYE · puan kazanacak</div>}
              <div style={{fontSize:14,fontWeight:700,color:"#F0EDE8"}}>{where}</div>
              <div style={{fontSize:11,color: eski ? "#C8973E" : "#888",marginTop:2}}>
                {new Date(o.created_at).toLocaleTimeString("tr-TR", {hour:"2-digit", minute:"2-digit"})}
                {eski && " · ⏳ " + saatFarki(o.created_at)}
              </div>
            </div>
            <div style={{fontSize:16,fontWeight:800,color:"#F0EDE8"}}>₺{o.total || 0}</div>
            <div style={{display:"flex",flexDirection:"column",gap:5}}>
              <button onClick={() => openPay(o)} style={{padding:"8px 14px",background:"#3ECF8E",color:"#000",border:"none",borderRadius:8,fontSize:12,fontWeight:800,cursor:"pointer"}}>Tahsil Et</button>
              {eski && <button onClick={() => cancelOrder(o)} style={{padding:"6px 14px",background:"transparent",color:"#a06060",border:"1px solid #553333",borderRadius:8,fontSize:11,fontWeight:700,cursor:"pointer"}}>İptal</button>}
            </div>
          </div>
        );
      })}

      {modal && (
        <div onClick={() => setModal(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:100}}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#161616",border:"1px solid #2A2A2A",borderRadius:"16px 16px 0 0",padding:20,width:"100%",maxWidth:500,maxHeight:"90vh",overflowY:"auto"}}>
            <div style={{fontSize:18,fontWeight:800,color:"#F0EDE8",marginBottom:16}}>Odeme Al</div>

            <div style={{background:"#0C0C0C",border:"1px solid #2A2A2A",borderRadius:10,padding:14,marginBottom:14}}>
              {modal.stores?.slug && <div style={{display:"inline-block",background:modal.stores.slug==="doner"?"#C8973E":"#3ECF8E",color:"#000",padding:"2px 8px",borderRadius:6,fontSize:10,fontWeight:800,letterSpacing:"0.5px",marginBottom:6}}>{modal.stores.slug==="doner"?"🥙 DÖNER":"🗼 PARIS"}</div>}
              <div style={{fontSize:11,color:"#888",marginBottom:4}}>{modal.table_id ? (tables[modal.table_id] || "Masa") + (modal.customer_name ? " · 👤 " + modal.customer_name : "") : "👤 " + (modal.customer_name || "Misafir")}</div>
              <div style={{fontSize:24,color:"#F0EDE8",fontWeight:800}}>₺{modal.total || 0}</div>
            </div>

            <div style={{display:"flex",gap:6,marginBottom:14}}>
              {[["cash","💵 Nakit"],["card","💳 Kart"],["debt","📝 Borç"]].map(([k,l]) => (
                <button key={k} onClick={()=>setMethod(k)} style={{flex:1,padding:"14px 10px",background:method===k?"#C8973E":"#222",color:method===k?"#000":"#888",border:"1px solid "+(method===k?"#C8973E":"#333"),borderRadius:10,fontSize:12,fontWeight:700,cursor:"pointer"}}>{l}</button>
              ))}
            </div>

            {/* UYE. Bu kutu eskiden yalniz "Borc" secilince cikiyordu; nakit ve
                kartta hesap hicbir uyeye baglanmadigi icin ciro isimsiz gidiyor
                ve kimse puan kazanmiyordu. Artik her yontemde secilebiliyor —
                borcta zorunlu, nakit/kartta istege bagli ve kapali baslar. */}
            {uyeKilitli ? (
              <div style={{marginBottom:12,padding:"11px 13px",background:"#0C0C0C",border:"1px solid #4A3A1A",borderRadius:10,display:"flex",alignItems:"center",justifyContent:"space-between",gap:10}}>
                <span style={{fontSize:13,color:"#FFD700",fontWeight:700}}>⭐ {memberPts?.name || modal.customer_name || "Üye"}</span>
                <span style={{fontSize:11,color:"#888"}}>siparişe bağlı</span>
              </div>
            ) : (method === "debt" || uyeAcik) ? (
              <div style={{marginBottom:12,background:method==="debt"?"#2A1818":"#0C0C0C",border:"1px solid "+(method==="debt"?"#553333":"#2A2A2A"),borderRadius:10,padding:12}}>
                <div style={{fontSize:10,color:method==="debt"?"#FFB0B0":"#888",letterSpacing:"1.5px",fontWeight:700,marginBottom:8}}>
                  {method==="debt" ? "MÜŞTERİ SEÇ · ZORUNLU" : "ÜYE SEÇ · İSTEĞE BAĞLI"}
                </div>
                <input value={customerSearch} onChange={e=>setCustomerSearch(e.target.value)} placeholder="İsim ya da telefonun son haneleri..." style={{width:"100%",padding:"10px 12px",background:"#0C0C0C",border:"1px solid #2A2A2A",borderRadius:8,color:"#F0EDE8",fontSize:13,outline:"none",marginBottom:8,fontFamily:"inherit"}}/>
                <div style={{maxHeight:160,overflowY:"auto"}}>
                  {filteredCustomers.slice(0,30).map(c => (
                    <div key={c.id} onClick={()=>secUye(c.id)} style={{padding:"8px 10px",background:customerId===c.id?"rgba(200,151,62,0.2)":"transparent",border:"1px solid "+(customerId===c.id?"#C8973E":"transparent"),borderRadius:6,cursor:"pointer",marginBottom:4,display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
                      <div style={{fontSize:13,color:"#F0EDE8",minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.name}</div>
                      <div style={{display:"flex",gap:8,alignItems:"center",flexShrink:0}}>
                        {Number(c.points) > 0 && <div style={{fontSize:11,color:"#FFD700",fontWeight:700}}>{c.points}p</div>}
                        {Number(c.outstanding_balance) > 0 && <div style={{fontSize:11,color:"#C8973E",fontWeight:700}}>₺{c.outstanding_balance}</div>}
                      </div>
                    </div>
                  ))}
                  {filteredCustomers.length === 0 && <div style={{fontSize:12,color:"#666",padding:"10px 2px"}}>Eşleşen üye yok</div>}
                </div>
                <div style={{fontSize:10,color:"#888",marginTop:6}}>
                  {method==="debt"
                    ? "NOT: Odeme yapilmaz, bu tutar musterinin borc hesabina eklenir."
                    : "Üye seçilirse bu hesap ona yazılır ve puan kazanır. En hızlısı: “telefonunuzun son 4 hanesi?”"}
                </div>
              </div>
            ) : customerId ? (
              <div style={{marginBottom:12,padding:"11px 13px",background:"#0C0C0C",border:"1px solid #4A3A1A",borderRadius:10,display:"flex",alignItems:"center",justifyContent:"space-between",gap:10}}>
                <span style={{fontSize:13,color:"#FFD700",fontWeight:700}}>⭐ {memberPts?.name || "Üye"}</span>
                <button onClick={()=>secUye(customerId)} style={{padding:"5px 10px",background:"transparent",color:"#888",border:"1px solid #333",borderRadius:7,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Kaldır</button>
              </div>
            ) : (
              <button onClick={()=>setUyeAcik(true)} style={{width:"100%",marginBottom:12,padding:"11px 13px",background:"transparent",color:"#888",border:"1px dashed #3A3A3A",borderRadius:10,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                ⭐ Üye bağla — puan kazansın
              </button>
            )}

            {uyeId && memberPts && memberPts.points > 0 && method !== "debt" && (
              <button onClick={() => setUsePoints(!usePoints)}
                style={{width:"100%",marginBottom:12,padding:"12px 14px",display:"flex",justifyContent:"space-between",alignItems:"center",
                        background:usePoints?"#000":"#1E1A0E",color:usePoints?"#FFD700":"#C8973E",
                        border:"1px solid "+(usePoints?"#FFD700":"#4A3A1A"),borderRadius:10,fontSize:13,fontWeight:800,cursor:"pointer",fontFamily:"inherit"}}>
                <span>{usePoints ? "✓ " : ""}🪙 Puanla öde — {memberPts.name}</span>
                <span>{memberPts.points} puan</span>
              </button>
            )}
            {uyeId && usePoints && memberPts && (
              <div style={{marginBottom:12,padding:"10px 12px",background:"#0C0C0C",border:"1px solid #2A2A2A",borderRadius:10,fontSize:12,color:"#aaa",display:"flex",justifyContent:"space-between"}}>
                <span>🪙 Puan: −₺{ptsCover(modal)}</span>
                <span style={{color:"#3ECF8E",fontWeight:800}}>Nakit/kart: ₺{Math.max(0, Number(modal.total||0) - ptsCover(modal))}</span>
              </div>
            )}
            <div style={{marginBottom:12}}>
              <div style={{fontSize:10,color:"#888",letterSpacing:"1.5px",fontWeight:700,marginBottom:5}}>TUTAR (₺)</div>
              <input type="number" value={amount} onChange={e=>setAmount(e.target.value)} style={{width:"100%",padding:"14px 16px",background:"#0C0C0C",border:"1px solid #2A2A2A",borderRadius:10,color:"#F0EDE8",fontSize:20,fontWeight:700,outline:"none",fontFamily:"inherit"}}/>
            </div>


            <div style={{display:"flex",gap:8}}>
              <button onClick={() => setModal(null)} style={{flex:1,padding:"14px",background:"transparent",color:"#888",border:"1px solid #333",borderRadius:10,fontSize:14,fontWeight:700,cursor:"pointer"}}>Iptal</button>
              <button onClick={completePayment} disabled={busy} style={{flex:2,padding:"14px",background:"#3ECF8E",color:"#000",border:"none",borderRadius:10,fontSize:14,fontWeight:800,cursor:"pointer",opacity:busy?0.6:1}}>{busy?"Kaydediliyor...":(method==="debt"?"Borca Yaz":"Tahsilat")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
