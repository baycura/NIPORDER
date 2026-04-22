import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase.js";

const cv = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";

export default function PaymentPage() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [tables, setTables] = useState({});
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [method, setMethod] = useState("cash");
  const [amount, setAmount] = useState("");
  const [customerId, setCustomerId] = useState(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customers, setCustomers] = useState([]);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{data: ords}, {data: tabs}, {data: custs}] = await Promise.all([
      supabase.from("orders").select("id, table_id, customer_name, total, status, created_at").in("status", ["open","sent","preparing","ready"]).order("created_at", { ascending: false }),
      supabase.from("cafe_tables").select("id, name"),
      supabase.from("customers").select("id, name, outstanding_balance").order("name"),
    ]);
    const tabMap = {};
    (tabs || []).forEach(t => { tabMap[t.id] = t.name; });
    setTables(tabMap);
    setOrders(ords || []);
    setCustomers(custs || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const openPay = (o) => {
    setModal(o); setMethod("cash"); setAmount(String(o.total || 0));
    setCustomerId(null); setCustomerSearch("");
  };

  const completePayment = async () => {
    if (busy) return;
    const amt = Number(amount);
    if (!amt || amt <= 0) { alert("Gecerli tutar gir"); return; }

    if (method === "debt") {
      if (!customerId) { alert("Borc icin musteri sec"); return; }
      setBusy(true);
      const cust = customers.find(c => c.id === customerId);
      const newBalance = Number(cust?.outstanding_balance || 0) + amt;
      const [custRes, ordRes] = await Promise.all([
        supabase.from("customers").update({ outstanding_balance: newBalance }).eq("id", customerId),
        supabase.from("orders").update({ status: "paid", paid_at: new Date().toISOString(), customer_id: customerId }).eq("id", modal.id),
      ]);
      await supabase.from("payments").insert({ order_id: modal.id, amount: amt, method: "debt", customer_id: customerId });
      setBusy(false);
      if (custRes.error || ordRes.error) { alert("Hata: " + (custRes.error?.message || ordRes.error?.message)); return; }
      alert("Borc kaydedildi: ₺" + amt + " (Kalan: ₺" + newBalance + ")");
    } else {
      setBusy(true);
      await supabase.from("payments").insert({ order_id: modal.id, amount: amt, method });
      const { error } = await supabase.from("orders").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", modal.id);
      setBusy(false);
      if (error) { alert("Hata: " + error.message); return; }
      alert(method === "cash" ? "Nakit tahsil edildi" : "Kart ile tahsil edildi");
    }
    setModal(null); load();
  };

  if (loading) return (<div style={{color:"#888",fontFamily:cv,padding:20}}>Yukleniyor...</div>);

  const filteredCustomers = customers.filter(c => {
    if (!customerSearch) return true;
    return c.name?.toLowerCase().includes(customerSearch.toLowerCase());
  });

  return (
    <div style={{fontFamily:cv,color:"#F0EDE8"}}>
      <div style={{fontSize:24,fontWeight:800,marginBottom:4}}>Kasa</div>
      <div style={{fontSize:11,color:"#888",letterSpacing:"1px",marginBottom:18}}>{orders.length} BEKLEYEN HESAP</div>

      {orders.length === 0 && <div style={{textAlign:"center",padding:40,color:"#666",fontSize:13}}>Bekleyen hesap yok</div>}

      {orders.map(o => {
        const where = o.table_id ? tables[o.table_id] : "👤 " + (o.customer_name || "Misafir");
        return (
          <div key={o.id} style={{background:"#1A1A1A",border:"1px solid #2A2A2A",borderRadius:10,padding:14,marginBottom:8,display:"flex",alignItems:"center",gap:12}}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:14,fontWeight:700,color:"#F0EDE8"}}>{where}</div>
              <div style={{fontSize:11,color:"#888",marginTop:2}}>{new Date(o.created_at).toLocaleTimeString("tr-TR", {hour:"2-digit", minute:"2-digit"})}</div>
            </div>
            <div style={{fontSize:16,fontWeight:800,color:"#F0EDE8"}}>₺{o.total || 0}</div>
            <button onClick={() => openPay(o)} style={{padding:"8px 14px",background:"#3ECF8E",color:"#000",border:"none",borderRadius:8,fontSize:12,fontWeight:800,cursor:"pointer"}}>Tahsil Et</button>
          </div>
        );
      })}

      {modal && (
        <div onClick={() => setModal(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:100}}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#161616",border:"1px solid #2A2A2A",borderRadius:"16px 16px 0 0",padding:20,width:"100%",maxWidth:500,maxHeight:"90vh",overflowY:"auto"}}>
            <div style={{fontSize:18,fontWeight:800,color:"#F0EDE8",marginBottom:16}}>Odeme Al</div>

            <div style={{background:"#0C0C0C",border:"1px solid #2A2A2A",borderRadius:10,padding:14,marginBottom:14}}>
              <div style={{fontSize:11,color:"#888",marginBottom:4}}>{modal.table_id ? tables[modal.table_id] : "👤 " + (modal.customer_name || "Misafir")}</div>
              <div style={{fontSize:24,color:"#F0EDE8",fontWeight:800}}>₺{modal.total || 0}</div>
            </div>

            <div style={{display:"flex",gap:6,marginBottom:14}}>
              {[["cash","💵 Nakit"],["card","💳 Kart"],["debt","📝 Borç"]].map(([k,l]) => (
                <button key={k} onClick={()=>setMethod(k)} style={{flex:1,padding:"14px 10px",background:method===k?"#C8973E":"#222",color:method===k?"#000":"#888",border:"1px solid "+(method===k?"#C8973E":"#333"),borderRadius:10,fontSize:12,fontWeight:700,cursor:"pointer"}}>{l}</button>
              ))}
            </div>

            <div style={{marginBottom:12}}>
              <div style={{fontSize:10,color:"#888",letterSpacing:"1.5px",fontWeight:700,marginBottom:5}}>TUTAR (₺)</div>
              <input type="number" value={amount} onChange={e=>setAmount(e.target.value)} style={{width:"100%",padding:"14px 16px",background:"#0C0C0C",border:"1px solid #2A2A2A",borderRadius:10,color:"#F0EDE8",fontSize:20,fontWeight:700,outline:"none",fontFamily:"inherit"}}/>
            </div>

            {method === "debt" && (
              <div style={{marginBottom:12,background:"#2A1818",border:"1px solid #553333",borderRadius:10,padding:12}}>
                <div style={{fontSize:10,color:"#FFB0B0",letterSpacing:"1.5px",fontWeight:700,marginBottom:8}}>MUSTERI SEC</div>
                <input value={customerSearch} onChange={e=>setCustomerSearch(e.target.value)} placeholder="Musteri ara..." style={{width:"100%",padding:"10px 12px",background:"#0C0C0C",border:"1px solid #2A2A2A",borderRadius:8,color:"#F0EDE8",fontSize:13,outline:"none",marginBottom:8,fontFamily:"inherit"}}/>
                <div style={{maxHeight:160,overflowY:"auto"}}>
                  {filteredCustomers.slice(0,30).map(c => (
                    <div key={c.id} onClick={()=>setCustomerId(c.id)} style={{padding:"8px 10px",background:customerId===c.id?"rgba(200,151,62,0.2)":"transparent",border:"1px solid "+(customerId===c.id?"#C8973E":"transparent"),borderRadius:6,cursor:"pointer",marginBottom:4,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <div style={{fontSize:13,color:"#F0EDE8"}}>{c.name}</div>
                      {Number(c.outstanding_balance) > 0 && <div style={{fontSize:11,color:"#C8973E",fontWeight:700}}>₺{c.outstanding_balance}</div>}
                    </div>
                  ))}
                </div>
                <div style={{fontSize:10,color:"#888",marginTop:6}}>NOT: Odeme yapilmaz, bu tutar musterinin borc hesabina eklenir.</div>
              </div>
            )}

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
