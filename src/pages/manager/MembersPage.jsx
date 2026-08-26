import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase.js";
import { useAuth } from "../../contexts/AuthContext.jsx";
import Ikon from "../../components/Ikon.jsx";

const cv = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";

export default function MembersPage() {
  const { staffUser } = useAuth();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("debtors");
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [payAmount, setPayAmount] = useState("");
  // Veresiye tahsilati NAKIT de olabilir; hangisi oldugu kasa sayimini
  // dogrudan etkiliyor, o yuzden secim zorunlu bir alan.
  const [payMethod, setPayMethod] = useState("cash");
  const [busy, setBusy] = useState(false);
  const [products, setProducts] = useState([]);
  const [prodSearch, setProdSearch] = useState("");
  const [prodDiscounts, setProdDiscounts] = useState({});
  const [stats, setStats] = useState(null);

  const storeFilter = staffUser?.store_ids?.length ? staffUser.store_ids : ["00000000-0000-0000-0000-000000000000"];

  const load = async () => {
    setLoading(true);
    const [{ data }, { data: prods }] = await Promise.all([
      supabase.from("customers").select("*").order("outstanding_balance", { ascending: false }),
      supabase.from("products").select("id, name, price").in("store_id", storeFilter).eq("is_available", true).order("name"),
    ]);
    // store_id bos olanlar da listelensin (menuden Google ile girenler magazasiz olusur)
    setMembers((data || []).filter(m => !m.store_id || storeFilter.includes(m.store_id)));
    setProducts(prods || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const PAID = ["paid", "completed", "served", "closed"];
  const loadStats = async (customerId) => {
    const { data: ords } = await supabase.from("orders").select("id, total, status, created_at").eq("customer_id", customerId).order("created_at", { ascending: false }).limit(300);
    const all = ords || [];
    const paid = all.filter(o => PAID.includes(o.status));
    const st = { count: all.length, spent: paid.reduce((s, o) => s + Number(o.total || 0), 0), last: all[0]?.created_at || null, top: [] };
    const ids = all.slice(0, 200).map(o => o.id);
    if (ids.length) {
      const { data: items } = await supabase.from("order_items").select("product_name, quantity").in("order_id", ids);
      const cnt = {};
      (items || []).forEach(it => { const n = it.product_name || "?"; cnt[n] = (cnt[n] || 0) + Number(it.quantity || 1); });
      st.top = Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 3);
    }
    setStats(st);
  };

  const openNew = () => {
    setModal({ mode: "new" });
    setForm({ name:"", email:"", phone:"", tier:"bronze", admin_discount:0, outstanding_balance:0, notes:"" });
    setProdSearch(""); setProdDiscounts({}); setStats(null);
  };

  const openEdit = (m) => {
    setModal({ mode: "edit", data: m });
    setForm({
      name: m.name || "", email: m.email || "", phone: m.phone || "",
      tier: m.tier || "bronze",
      admin_discount: Number(m.admin_discount) || 0,
      outstanding_balance: Number(m.outstanding_balance) || 0,
      notes: m.notes || "",
    });
    setPayAmount("");
    setProdSearch(""); setProdDiscounts({}); setStats(null);
    supabase.from("member_discounts").select("product_id, amount, price").eq("customer_id", m.id).eq("is_active", true)
      .then(({ data }) => {
        const map = {};
        const byId = {};
        products.forEach(p => { byId[p.id] = p; });
        (data || []).forEach(d => {
          // Yeni kayitlar price ile gelir; eski `amount` kayitlarini net fiyata cevir
          if (d.price != null) map[d.product_id] = String(Math.round(Number(d.price)));
          else {
            const liste = Number(byId[d.product_id]?.price) || 0;
            map[d.product_id] = String(Math.max(0, Math.round(liste - (Number(d.amount) || 0))));
          }
        });
        setProdDiscounts(map);
      });
    loadStats(m.id);
  };

  const saveMember = async () => {
    if (busy) return;
    if (!form.name?.trim()) { alert("Isim gerekli"); return; }
    setBusy(true);
    const payload = {
      name: form.name.trim(),
      email: form.email?.trim() || null,
      phone: form.phone?.trim() || null,
      tier: form.tier,
      admin_discount: Number(form.admin_discount) || 0,
      outstanding_balance: Number(form.outstanding_balance) || 0,
      notes: form.notes?.trim() || null,
    };
    let customerId = modal.mode === "edit" ? modal.data.id : null;
    if (modal.mode === "new") {
      const { data: created, error } = await supabase.from("customers").insert({ ...payload, store_id: staffUser?.store_ids?.[0] }).select().single();
      if (error) { alert("Hata: " + error.message); setBusy(false); return; }
      customerId = created?.id || null;
    } else {
      const { error } = await supabase.from("customers").update(payload).eq("id", modal.data.id);
      if (error) { alert("Hata: " + error.message); setBusy(false); return; }
    }
    // Uye urun indirimlerini kaydet (tam liste yeniden yazilir)
    if (customerId) {
      const { error: dd } = await supabase.from("member_discounts").delete().eq("customer_id", customerId);
      if (dd) { alert("Eski üye fiyatları temizlenemedi: " + dd.message); setBusy(false); return; }
      // Artik net fiyat kaydediliyor (price); amount eski kayitlar icin duruyor
      const rows = Object.entries(prodDiscounts)
        .filter(([, v]) => v !== "" && v != null && Number(v) >= 0)
        .map(([pid, v]) => ({ customer_id: customerId, product_id: pid, price: Number(v), amount: 0, is_active: true }));
      if (rows.length) {
        const { error: de } = await supabase.from("member_discounts").insert(rows);
        if (de) alert("Uye indirimleri kaydedilemedi: " + de.message);
      }
    }
    setModal(null); setBusy(false); load();
  };

  // Veresiye tahsilati da tek islemde: bakiye dusumu + payments satiri birlikte
  // yazilir. payments satiri olmadan cekmeceye giren nakit hicbir yerde
  // gorunmuyordu ve gun sonu kasa sayimi sistematik "fazla" verirdi.
  const recordPayment = async () => {
    const amt = Number(payAmount);
    if (!amt || amt <= 0) { alert("Geçerli tutar gir"); return; }
    if (busy) return;
    const newBalance = Math.max(0, Number(modal.data.outstanding_balance || 0) - amt);
    if (!confirm('"' + modal.data.name + '" için ₺' + amt + ' ödeme alındı. Kalan borç: ₺' + newBalance)) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("nip_borc_tahsil", {
      p_customer_id: modal.data.id, p_amount: amt, p_method: payMethod,
    });
    setBusy(false);
    if (error) { alert("Tahsilat yapılamadı: " + error.message); return; }
    const kalan = Number(data ?? newBalance);
    setPayAmount("");
    setForm({ ...form, outstanding_balance: kalan });
    alert("Ödeme kaydedildi. Yeni borç: ₺" + kalan);
    load();
  };

  const deleteMember = async (m) => {
    if (!confirm('"' + m.name + '" silinsin mi?')) return;
    const { error } = await supabase.from("customers").delete().eq("id", m.id);
    if (error) { alert("Hata: " + error.message); return; }
    load();
  };

  const filtered = members.filter(m => {
    if (search) {
      const s = search.toLowerCase();
      if (!m.name?.toLowerCase().includes(s) && !m.email?.toLowerCase().includes(s)) return false;
    }
    if (filter === "debtors") return Number(m.outstanding_balance) > 0;
    if (filter === "members") return !!m.auth_user_id;
    if (filter === "imported") return !!m.imported_from_old_system;
    return true;
  });

  const totalDebt = members.reduce((s, m) => s + Number(m.outstanding_balance || 0), 0);
  const debtorCount = members.filter(m => Number(m.outstanding_balance) > 0).length;

  if (loading) return (<div style={{color:"#888",fontFamily:cv,padding:20}}>Yukleniyor...</div>);

  return (
    <div style={{fontFamily:cv,color:"#F0EDE8"}}>
      <div style={{fontSize:24,fontWeight:800,marginBottom:4}}>Uyeler & Borclular</div>
      <div style={{fontSize:11,color:"#888",letterSpacing:"1px",marginBottom:14}}>{members.length} KAYITLI · {debtorCount} BORCLU</div>

      {totalDebt > 0 && (
        <div style={{background:"#161616",border:"1px solid #FFFFFF",borderRadius:12,padding:14,marginBottom:14,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontSize:11,color:"#8A8580",letterSpacing:"1.5px",fontWeight:700}}>Toplam açık borç</div>
            <div style={{fontSize:22,color:"#F0EDE8",fontWeight:800,marginTop:2}}>₺{totalDebt.toLocaleString("tr-TR")}</div>
          </div>
        </div>
      )}

      <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Isim ara..." style={{width:"100%",padding:"12px 14px",background:"#1A1A1A",border:"1px solid #2A2A2A",borderRadius:10,color:"#F0EDE8",fontSize:14,outline:"none",marginBottom:10,fontFamily:"inherit"}}/>

      <div style={{display:"flex",gap:6,marginBottom:14,overflowX:"auto"}}>
        {[["debtors","BORCLULAR"],["members","UYELER"],["imported","ESKI SISTEM"],["all","HEPSI"]].map(([k,l]) => (
          <button key={k} onClick={()=>setFilter(k)} style={{flexShrink:0,padding:"7px 12px",border:"none",borderRadius:16,fontSize:11,fontWeight:700,letterSpacing:"0.5px",background:filter===k?"#FFFFFF":"#222",color:filter===k?"#000":"#888",cursor:"pointer",whiteSpace:"nowrap"}}>{l}</button>
        ))}
      </div>

      <button onClick={openNew} style={{padding:"10px 16px",background:"#FFFFFF",color:"#000",border:"none",borderRadius:10,fontSize:13,fontWeight:800,cursor:"pointer",marginBottom:14}}>+ Yeni Musteri</button>

      {filtered.length === 0 && <div style={{textAlign:"center",padding:30,color:"#888888",fontSize:12}}>Kayıt yok</div>}

      {filtered.map(m => {
        const hasDebt = Number(m.outstanding_balance) > 0;
        return (
          <div key={m.id} onClick={() => openEdit(m)} style={{background:"#1A1A1A",border:"1px solid "+(hasDebt?"#FFFFFF":"#2A2A2A"),borderRadius:10,padding:12,marginBottom:8,cursor:"pointer",display:"flex",gap:12,alignItems:"center"}}>
            {m.avatar_url ? <img src={m.avatar_url} alt="" style={{width:38,height:38,borderRadius:"50%",flexShrink:0}}/> : <div style={{width:38,height:38,borderRadius:"50%",background:"#333",color:"#888",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:700,flexShrink:0}}>{m.name?.[0]||"?"}</div>}
            <div style={{flex:1,minWidth:0}}>
              <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                <div style={{fontSize:14,fontWeight:700,color:"#F0EDE8"}}>{m.name}</div>
                {m.admin_discount > 0 && <span style={{fontSize:9,padding:"2px 6px",background:"#2A2A2A",color:"#F0EDE8",borderRadius:6,fontWeight:700}}>-%{m.admin_discount}</span>}
                {m.auth_user_id && <span style={{fontSize:9,padding:"2px 6px",background:"#222222",color:"#F0EDE8",borderRadius:6,fontWeight:700}}>Üye</span>}
                {m.imported_from_old_system && <span style={{fontSize:9,padding:"2px 6px",background:"#2A2A2A",color:"#F0EDE8",borderRadius:6,fontWeight:700}}>Eski</span>}
              </div>
              {m.email && <div style={{fontSize:11,color:"#888",marginTop:2}}>{m.email}</div>}
              <div style={{fontSize:10,color:"#888888",marginTop:2}}>{m.visit_count || 0} siparis</div>
            </div>
            {hasDebt && (
              <div style={{textAlign:"right",flexShrink:0}}>
                <div style={{fontSize:12,color:"#888",letterSpacing:"0.2px",fontWeight:600}}>Borç</div>
                <div style={{fontSize:16,color:"#FFFFFF",fontWeight:800}}>₺{Number(m.outstanding_balance).toLocaleString("tr-TR")}</div>
              </div>
            )}
          </div>
        );
      })}

      {modal && (
        <Modal onClose={() => setModal(null)} title={modal.mode==="new"?"Yeni Musteri":(modal.data?.name || "Musteri")}>
          <Field label="AD SOYAD"><input value={form.name||""} onChange={e=>setForm({...form,name:e.target.value})} style={inputS}/></Field>
          <div style={{display:"flex",gap:8}}>
            <Field label="EMAIL"><input value={form.email||""} onChange={e=>setForm({...form,email:e.target.value})} style={inputS}/></Field>
          </div>
          <Field label="TELEFON"><input value={form.phone||""} onChange={e=>setForm({...form,phone:e.target.value})} style={inputS}/></Field>

          {modal.mode === "edit" && stats && (
            <div style={{background:"#152015",border:"1px solid #2A2A2A",borderRadius:10,padding:12,marginBottom:12}}>
              <div style={{fontSize:12,color:"#F0EDE8",letterSpacing:"0.2px",fontWeight:600,marginBottom:8}}>Müşteri karnesi</div>
              <div style={{display:"flex",gap:14,flexWrap:"wrap",fontSize:12,color:"#ddd"}}>
                <div><span style={{color:"#888"}}>Siparis:</span> <b>{stats.count}</b></div>
                <div><span style={{color:"#888"}}>Harcama:</span> <b>₺{Math.round(stats.spent).toLocaleString("tr-TR")}</b></div>
                <div><span style={{color:"#888"}}>Son:</span> <b>{stats.last ? new Date(stats.last).toLocaleDateString("tr-TR") : "—"}</b></div>
              </div>
              {stats.top.length > 0 && <div style={{fontSize:11,color:"#F0EDE8",marginTop:6}}>Favoriler: {stats.top.map(([n, q]) => n + " ×" + q).join(", ")}</div>}
            </div>
          )}

          <div style={{background:"#161616",border:"1px solid #FFFFFF",borderRadius:10,padding:12,marginBottom:12}}>
            <div style={{fontSize:12,color:"#FFFFFF",letterSpacing:"0.2px",fontWeight:600,marginBottom:4}}>Üyeye özel fiyatlar (₺)</div>
            <div style={{fontSize:10,color:"#888",marginBottom:8,lineHeight:1.6}}>
              Ürünü işaretle, bu üyenin ödeyeceği <b style={{color:"#FFFFFF"}}>net fiyatı</b> yaz — yüzde yok, küsürat yok.
              Üye menüde liste fiyatını üstü çizili, kendi fiyatını yanında görür.
              <br/>Happy hour / kampanya bu fiyattan <b style={{color:"#FFFFFF"}}>daha ucuzsa</b> kampanya geçerli olur; değilse üye kendi fiyatını öder — yani her zaman düşük olanı öder.
            </div>
            <input value={prodSearch} onChange={e=>setProdSearch(e.target.value)} placeholder="Urun ara..." style={{...inputS, marginBottom:8, padding:"8px 10px"}}/>
            <div style={{maxHeight:220,overflowY:"auto",border:"1px solid #2A2A2A",borderRadius:8,padding:"4px 8px",background:"#111"}}>
              {products.filter(p => !prodSearch || p.name?.toLowerCase().includes(prodSearch.toLowerCase())).map(p => {
                const sel = prodDiscounts[p.id] !== undefined;
                const val = prodDiscounts[p.id];
                const liste = Math.round(Number(p.price));
                const uye = Number(val);
                return (
                  <div key={p.id} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 0",borderBottom:"1px solid #1E1E1E"}}>
                    <input type="checkbox" checked={sel} onChange={e => { const pd = {...prodDiscounts}; if (e.target.checked) pd[p.id] = pd[p.id] ?? String(liste); else delete pd[p.id]; setProdDiscounts(pd); }} style={{accentColor:"#FFFFFF"}}/>
                    <div style={{flex:1,fontSize:12,color:"#ddd",minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.name} <span style={{color:"#888888",fontSize:11}}>₺{liste}</span></div>
                    {sel && (<div style={{display:"flex",alignItems:"center",gap:3}}>
                      <span style={{color:"#888",fontSize:11}}>₺</span>
                      <input type="number" min="0" value={val} onChange={e=>setProdDiscounts({...prodDiscounts, [p.id]: e.target.value})} style={{width:70,padding:5,background:"#0C0C0C",color:"#FFFFFF",border:"1px solid #FFFFFF",borderRadius:5,fontSize:12}}/>
                      <span style={{color:val === "" ? "#666" : uye < liste ? "#FFFFFF" : "#C87A6A",fontSize:11,fontWeight:700,whiteSpace:"nowrap"}}>
                        {val === "" ? "fiyat gir" : uye < liste ? "−₺" + (liste - uye) : uye === liste ? "indirim yok" : "liste üstü!"}
                      </span>
                    </div>)}
                  </div>
                );
              })}
              {products.length === 0 && <div style={{color:"#888888",textAlign:"center",padding:12,fontSize:11}}>Ürün bulunamadı</div>}
            </div>
          </div>

          <div style={{background:"#222",border:"1px solid #333",borderRadius:10,padding:12,marginBottom:12}}>
            <div style={{fontSize:12,color:"#888",letterSpacing:"0.2px",fontWeight:600,marginBottom:8}}>Özel indirim</div>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <input type="number" min="0" max="50" value={form.admin_discount||0} onChange={e=>setForm({...form,admin_discount:e.target.value})} style={{...inputS,flex:1}}/>
              <span style={{fontSize:20,color:"#FFFFFF",fontWeight:700}}>%</span>
            </div>
            <div style={{fontSize:10,color:"#888888",marginTop:6}}>NOT: Bu musteriye ozel indirim. Uye indirimi yerine bu uygulanir.</div>
          </div>

          <div style={{background:"#161616",border:"1px solid #2A2A2A",borderRadius:10,padding:12,marginBottom:12}}>
            <div style={{fontSize:12,color:"#C87A6A",letterSpacing:"0.2px",fontWeight:600,marginBottom:8}}>Açık borç</div>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
              <input type="number" value={form.outstanding_balance||0} onChange={e=>setForm({...form,outstanding_balance:e.target.value})} style={{...inputS,flex:1}}/>
              <span style={{fontSize:16,color:"#FFFFFF",fontWeight:700}}>₺</span>
            </div>
            {modal.mode === "edit" && (
              <div>
                <div style={{fontSize:12,color:"#888",letterSpacing:"0.2px",fontWeight:600,marginBottom:5}}>Ödeme al (borçtan düş)</div>
                <div style={{display:"flex",gap:6,marginBottom:6}}>
                  {[["cash","nakit","Nakit"],["card","kart","Kart"]].map(([k,ik,l]) => (
                    <button key={k} onClick={()=>setPayMethod(k)} style={{flex:1,minHeight:40,padding:"10px",
                            background:payMethod===k?"#FFFFFF":"transparent",color:payMethod===k?"#000":"#888888",
                            border:"1px solid "+(payMethod===k?"#FFFFFF":"#2A2A2A"),borderRadius:8,fontSize:12,
                            fontWeight:700,cursor:"pointer",fontFamily:"inherit",display:"flex",
                            alignItems:"center",justifyContent:"center",gap:6}}>
                      <Ikon ad={ik} boy={14}/>{l}
                    </button>
                  ))}
                </div>
                <div style={{display:"flex",gap:6}}>
                  <input type="number" value={payAmount} onChange={e=>setPayAmount(e.target.value)} placeholder="0" style={{...inputS,flex:1}}/>
                  <button onClick={recordPayment} style={{padding:"10px 14px",minHeight:44,background:"#FFFFFF",color:"#000",border:"none",borderRadius:8,fontSize:12,fontWeight:800,cursor:"pointer",whiteSpace:"nowrap"}}>Ödeme Al</button>
                </div>
              </div>
            )}
          </div>

          <Field label="NOTLAR"><textarea value={form.notes||""} onChange={e=>setForm({...form,notes:e.target.value})} rows={3} style={{...inputS,resize:"vertical"}}/></Field>

          <div style={{display:"flex",gap:8,marginTop:10}}>
            <button onClick={() => setModal(null)} style={cancelBtn}>Iptal</button>
            {modal.mode==="edit" && <button onClick={() => { deleteMember(modal.data); setModal(null); }} style={{padding:"12px 14px",background:"transparent",color:"#C87A6A",border:"1px solid #2A2A2A",borderRadius:10,fontSize:12,fontWeight:700,cursor:"pointer"}}>Sil</button>}
            <button onClick={saveMember} disabled={busy} style={{...saveBtn,opacity:busy?0.6:1}}>{busy?"...":"Kaydet"}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

const inputS = {width:"100%",padding:"10px 12px",background:"#0C0C0C",border:"1px solid #2A2A2A",borderRadius:8,color:"#F0EDE8",fontSize:14,outline:"none",fontFamily:"inherit"};
const cancelBtn = {flex:1,padding:"12px",background:"transparent",color:"#888",border:"1px solid #333",borderRadius:10,fontSize:14,fontWeight:700,cursor:"pointer"};
const saveBtn = {flex:2,padding:"12px",background:"#FFFFFF",color:"#000",border:"none",borderRadius:10,fontSize:14,fontWeight:800,cursor:"pointer"};

function Field({label, children}) {
  return (<div style={{marginBottom:12}}>
    <div style={{fontSize:12,color:"#888",letterSpacing:"0.2px",fontWeight:600,marginBottom:5}}>{label}</div>
    {children}
  </div>);
}

function Modal({title, children, onClose}) {
  return (<div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:100}}>
    <div onClick={e => e.stopPropagation()} style={{background:"#161616",border:"1px solid #2A2A2A",borderRadius:"16px 16px 0 0",padding:20,width:"100%",maxWidth:500,maxHeight:"90vh",overflowY:"auto"}}>
      <div style={{fontSize:18,fontWeight:800,color:"#F0EDE8",marginBottom:16}}>{title}</div>
      {children}
    </div>
  </div>);
}
