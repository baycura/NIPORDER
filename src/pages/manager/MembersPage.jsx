import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase.js";
import { useAuth } from "../../contexts/AuthContext.jsx";

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
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("customers").select("*").in("store_id", staffUser?.store_ids?.length ? staffUser.store_ids : ["00000000-0000-0000-0000-000000000000"]).order("outstanding_balance", { ascending: false });
    setMembers(data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const openNew = () => {
    setModal({ mode: "new" });
    setForm({ name:"", email:"", phone:"", tier:"bronze", admin_discount:0, outstanding_balance:0, notes:"" });
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
    if (modal.mode === "new") {
      const { error } = await supabase.from("customers").insert({ ...payload, store_id: staffUser?.store_ids?.[0] });
      if (error) { alert("Hata: " + error.message); setBusy(false); return; }
    } else {
      const { error } = await supabase.from("customers").update(payload).eq("id", modal.data.id);
      if (error) { alert("Hata: " + error.message); setBusy(false); return; }
    }
    setModal(null); setBusy(false); load();
  };

  const recordPayment = async () => {
    const amt = Number(payAmount);
    if (!amt || amt <= 0) { alert("Gecerli tutar gir"); return; }
    if (busy) return;
    const newBalance = Math.max(0, Number(modal.data.outstanding_balance || 0) - amt);
    if (!confirm('"' + modal.data.name + '" icin ₺' + amt + ' odeme alindi. Kalan borc: ₺' + newBalance)) return;
    setBusy(true);
    const { error } = await supabase.from("customers").update({ outstanding_balance: newBalance }).eq("id", modal.data.id);
    setBusy(false);
    if (error) { alert("Hata: " + error.message); return; }
    setPayAmount("");
    setForm({...form, outstanding_balance: newBalance});
    alert("Odeme kaydedildi. Yeni borc: ₺" + newBalance);
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
        <div style={{background:"linear-gradient(135deg,#C8973E22,#E0AB4A22)",border:"1px solid #C8973E",borderRadius:12,padding:14,marginBottom:14,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontSize:11,color:"#C8973E",letterSpacing:"1.5px",fontWeight:700}}>TOPLAM ACIK BORC</div>
            <div style={{fontSize:22,color:"#F0EDE8",fontWeight:800,marginTop:2}}>₺{totalDebt.toLocaleString("tr-TR")}</div>
          </div>
        </div>
      )}

      <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Isim ara..." style={{width:"100%",padding:"12px 14px",background:"#1A1A1A",border:"1px solid #2A2A2A",borderRadius:10,color:"#F0EDE8",fontSize:14,outline:"none",marginBottom:10,fontFamily:"inherit"}}/>

      <div style={{display:"flex",gap:6,marginBottom:14,overflowX:"auto"}}>
        {[["debtors","BORCLULAR"],["members","UYELER"],["imported","ESKI SISTEM"],["all","HEPSI"]].map(([k,l]) => (
          <button key={k} onClick={()=>setFilter(k)} style={{flexShrink:0,padding:"7px 12px",border:"none",borderRadius:16,fontSize:11,fontWeight:700,letterSpacing:"0.5px",background:filter===k?"#C8973E":"#222",color:filter===k?"#000":"#888",cursor:"pointer",whiteSpace:"nowrap"}}>{l}</button>
        ))}
      </div>

      <button onClick={openNew} style={{padding:"10px 16px",background:"#C8973E",color:"#000",border:"none",borderRadius:10,fontSize:13,fontWeight:800,cursor:"pointer",marginBottom:14}}>+ Yeni Musteri</button>

      {filtered.length === 0 && <div style={{textAlign:"center",padding:30,color:"#666",fontSize:12}}>Kayit yok</div>}

      {filtered.map(m => {
        const hasDebt = Number(m.outstanding_balance) > 0;
        return (
          <div key={m.id} onClick={() => openEdit(m)} style={{background:"#1A1A1A",border:"1px solid "+(hasDebt?"#C8973E":"#2A2A2A"),borderRadius:10,padding:12,marginBottom:8,cursor:"pointer",display:"flex",gap:12,alignItems:"center"}}>
            {m.avatar_url ? <img src={m.avatar_url} alt="" style={{width:38,height:38,borderRadius:"50%",flexShrink:0}}/> : <div style={{width:38,height:38,borderRadius:"50%",background:"#333",color:"#888",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:700,flexShrink:0}}>{m.name?.[0]||"?"}</div>}
            <div style={{flex:1,minWidth:0}}>
              <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                <div style={{fontSize:14,fontWeight:700,color:"#F0EDE8"}}>{m.name}</div>
                {m.admin_discount > 0 && <span style={{fontSize:9,padding:"2px 6px",background:"#2A3D52",color:"#B0D0FF",borderRadius:6,fontWeight:700}}>-%{m.admin_discount}</span>}
                {m.auth_user_id && <span style={{fontSize:9,padding:"2px 6px",background:"#C8973E33",color:"#FFD27A",borderRadius:6,fontWeight:700}}>UYE</span>}
                {m.imported_from_old_system && <span style={{fontSize:9,padding:"2px 6px",background:"#223322",color:"#B0FFB0",borderRadius:6,fontWeight:700}}>ESKI</span>}
              </div>
              {m.email && <div style={{fontSize:11,color:"#888",marginTop:2}}>{m.email}</div>}
              <div style={{fontSize:10,color:"#666",marginTop:2}}>{m.visit_count || 0} siparis</div>
            </div>
            {hasDebt && (
              <div style={{textAlign:"right",flexShrink:0}}>
                <div style={{fontSize:9,color:"#888",letterSpacing:"1px",fontWeight:700}}>BORC</div>
                <div style={{fontSize:16,color:"#C8973E",fontWeight:800}}>₺{Number(m.outstanding_balance).toLocaleString("tr-TR")}</div>
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

          <div style={{background:"#222",border:"1px solid #333",borderRadius:10,padding:12,marginBottom:12}}>
            <div style={{fontSize:10,color:"#888",letterSpacing:"1.5px",fontWeight:700,marginBottom:8}}>OZEL INDIRIM</div>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <input type="number" min="0" max="50" value={form.admin_discount||0} onChange={e=>setForm({...form,admin_discount:e.target.value})} style={{...inputS,flex:1}}/>
              <span style={{fontSize:20,color:"#C8973E",fontWeight:700}}>%</span>
            </div>
            <div style={{fontSize:10,color:"#666",marginTop:6}}>NOT: Bu musteriye ozel indirim. Uye indirimi yerine bu uygulanir.</div>
          </div>

          <div style={{background:"#2A1818",border:"1px solid #553333",borderRadius:10,padding:12,marginBottom:12}}>
            <div style={{fontSize:10,color:"#FFB0B0",letterSpacing:"1.5px",fontWeight:700,marginBottom:8}}>ACIK BORC</div>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
              <input type="number" value={form.outstanding_balance||0} onChange={e=>setForm({...form,outstanding_balance:e.target.value})} style={{...inputS,flex:1}}/>
              <span style={{fontSize:16,color:"#C8973E",fontWeight:700}}>₺</span>
            </div>
            {modal.mode === "edit" && (
              <div>
                <div style={{fontSize:10,color:"#888",letterSpacing:"1px",fontWeight:700,marginBottom:5}}>ODEME AL (borctan dus)</div>
                <div style={{display:"flex",gap:6}}>
                  <input type="number" value={payAmount} onChange={e=>setPayAmount(e.target.value)} placeholder="0" style={{...inputS,flex:1}}/>
                  <button onClick={recordPayment} style={{padding:"10px 14px",background:"#3ECF8E",color:"#000",border:"none",borderRadius:8,fontSize:12,fontWeight:800,cursor:"pointer",whiteSpace:"nowrap"}}>Odeme Al</button>
                </div>
              </div>
            )}
          </div>

          <Field label="NOTLAR"><textarea value={form.notes||""} onChange={e=>setForm({...form,notes:e.target.value})} rows={3} style={{...inputS,resize:"vertical"}}/></Field>

          <div style={{display:"flex",gap:8,marginTop:10}}>
            <button onClick={() => setModal(null)} style={cancelBtn}>Iptal</button>
            {modal.mode==="edit" && <button onClick={() => { deleteMember(modal.data); setModal(null); }} style={{padding:"12px 14px",background:"transparent",color:"#FF6666",border:"1px solid #553333",borderRadius:10,fontSize:12,fontWeight:700,cursor:"pointer"}}>Sil</button>}
            <button onClick={saveMember} disabled={busy} style={{...saveBtn,opacity:busy?0.6:1}}>{busy?"...":"Kaydet"}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

const inputS = {width:"100%",padding:"10px 12px",background:"#0C0C0C",border:"1px solid #2A2A2A",borderRadius:8,color:"#F0EDE8",fontSize:14,outline:"none",fontFamily:"inherit"};
const cancelBtn = {flex:1,padding:"12px",background:"transparent",color:"#888",border:"1px solid #333",borderRadius:10,fontSize:14,fontWeight:700,cursor:"pointer"};
const saveBtn = {flex:2,padding:"12px",background:"#C8973E",color:"#000",border:"none",borderRadius:10,fontSize:14,fontWeight:800,cursor:"pointer"};

function Field({label, children}) {
  return (<div style={{marginBottom:12}}>
    <div style={{fontSize:10,color:"#888",letterSpacing:"1.5px",fontWeight:700,marginBottom:5}}>{label}</div>
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
