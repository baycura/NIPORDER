import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase.js";
import { useAuth } from "../../contexts/AuthContext.jsx";

const cv = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";

const ROLES_BASE = [
  { key: "manager", label: "Yonetici (Operasyon)" },
  { key: "waiter",  label: "Garson/Kasiyer" },
  { key: "kitchen", label: "Mutfak" },
];

const roleColor = { admin:"#FFD700", manager:"#C8973E", owner:"#C8973E", waiter:"#3ECF8E", kitchen:"#E07A3E", cashier:"#5A8FE0" };

export default function StaffMgmtPage() {
  const { isAdmin } = useAuth();
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [pwModal, setPwModal] = useState(null);
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const ROLES = isAdmin ? [{ key:"admin", label:"Sahip (Tam yetki)" }, ...ROLES_BASE] : ROLES_BASE;

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("staff").select("*").order("name");
    setStaff(data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const openNew = () => {
    setModal({ mode: "new" });
    setForm({ name:"", email:"", password:"", role:"manager", display_role:"Yönetici", phone:"", is_active:true });
  };

  const openEdit = (s) => {
    setModal({ mode: "edit", data: s });
    setForm({
      name: s.name || "", email: s.email || "",
      role: s.role || "manager",
      display_role: s.display_role || "Yönetici",
      phone: s.phone || "",
      is_active: s.is_active !== false,
    });
  };

  const saveStaff = async () => {
    if (busy) return;
    if (!form.name?.trim()) { alert("Isim gerekli"); return; }
    setBusy(true);

    if (modal.mode === "new") {
      if (!form.email?.trim() || !form.password?.trim()) { alert("Email ve sifre gerekli"); setBusy(false); return; }
      const { data: newId, error } = await supabase.rpc("admin_create_staff_with_auth", {
        p_email: form.email.trim(),
        p_password: form.password,
        p_name: form.name.trim(),
        p_role: form.role,
      });
      if (error) { alert("Hata: " + error.message); setBusy(false); return; }
      // Update display_role + phone after creation
      await supabase.from("staff").update({
        display_role: form.display_role || "Yönetici",
        phone: form.phone?.trim() || null,
      }).eq("id", newId);
    } else {
      const payload = {
        name: form.name.trim(),
        email: form.email?.trim() || null,
        phone: form.phone?.trim() || null,
        role: form.role,
        display_role: form.display_role || "Yönetici",
        is_active: form.is_active,
      };
      const { error } = await supabase.from("staff").update(payload).eq("id", modal.data.id);
      if (error) { alert("Hata: " + error.message); setBusy(false); return; }
    }
    setModal(null); setBusy(false); load();
  };

  const resetPassword = async () => {
    if (!pwModal || !newPassword || newPassword.length < 6) { alert("En az 6 karakter sifre gir"); return; }
    if (busy) return;
    setBusy(true);
    const { error } = await supabase.rpc("admin_set_user_password", {
      p_email: pwModal.email,
      p_new_password: newPassword,
    });
    setBusy(false);
    if (error) { alert("Hata: " + error.message); return; }
    alert(pwModal.name + " icin yeni sifre belirlendi:\n\n" + newPassword + "\n\nLutfen bu sifreyi personel ile paylasin.");
    setPwModal(null); setNewPassword("");
  };

  const toggleActive = async (s) => {
    await supabase.from("staff").update({ is_active: !s.is_active }).eq("id", s.id);
    load();
  };

  const deleteStaff = async (s) => {
    if (!confirm('"' + s.name + '" silinsin mi?')) return;
    const { error } = await supabase.from("staff").delete().eq("id", s.id);
    if (error) { alert("Hata: " + error.message); return; }
    load();
  };

  if (loading) return (<div style={{color:"#888",fontFamily:cv,padding:20}}>Yukleniyor...</div>);

  return (
    <div style={{fontFamily:cv,color:"#F0EDE8"}}>
      <div style={{fontSize:24,fontWeight:800,marginBottom:4}}>Personel Yonetimi</div>
      <div style={{fontSize:11,color:"#888",letterSpacing:"1px",marginBottom:18}}>{staff.length} PERSONEL</div>

      <button onClick={openNew} style={{padding:"10px 16px",background:"#C8973E",color:"#000",border:"none",borderRadius:10,fontSize:13,fontWeight:800,cursor:"pointer",marginBottom:16}}>+ Yeni Personel</button>

      <div>
        {staff.map(s => {
          const color = roleColor[s.role] || "#888";
          const displayRole = s.display_role || "Yönetici";
          return (
            <div key={s.id} style={{background:"#1A1A1A",border:"1px solid #2A2A2A",borderRadius:10,padding:14,marginBottom:8,opacity:s.is_active===false?0.5:1}}>
              <div style={{display:"flex",alignItems:"flex-start",gap:12}}>
                <div style={{width:44,height:44,borderRadius:"50%",background:color+"33",color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,fontWeight:800,flexShrink:0}}>{s.name?.[0]||"?"}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:15,fontWeight:700,color:"#F0EDE8"}}>{s.name}</div>
                  <div style={{fontSize:11,color,letterSpacing:"1px",marginTop:2,fontWeight:600}}>{displayRole?.toUpperCase()}{s.role === "admin" && <span style={{color:"#FFD700",marginLeft:6}}>★</span>}</div>
                  {s.email && <div style={{fontSize:11,color:"#888",marginTop:3}}>{s.email}</div>}
                  {s.phone && <div style={{fontSize:11,color:"#888"}}>{s.phone}</div>}
                  {s.last_login && <div style={{fontSize:10,color:"#666",marginTop:3}}>Son giris: {new Date(s.last_login).toLocaleDateString("tr-TR")}</div>}
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:4,flexShrink:0}}>
                  <button onClick={() => openEdit(s)} style={{padding:"5px 9px",background:"#222",color:"#aaa",border:"1px solid #333",borderRadius:6,fontSize:10,cursor:"pointer",fontWeight:700}}>Duzenle</button>
                  {s.email && <button onClick={() => { setPwModal(s); setNewPassword(""); }} style={{padding:"5px 9px",background:"rgba(200,151,62,0.15)",color:"#C8973E",border:"1px solid #C8973E",borderRadius:6,fontSize:10,cursor:"pointer",fontWeight:700}}>Sifre</button>}
                  <button onClick={() => toggleActive(s)} style={{padding:"5px 9px",background:s.is_active===false?"#553355":"transparent",color:s.is_active===false?"#FFB0FF":"#888",border:"1px solid #333",borderRadius:6,fontSize:10,cursor:"pointer"}}>{s.is_active===false?"Pasif":"Aktif"}</button>
                  <button onClick={() => deleteStaff(s)} style={{padding:"5px 9px",background:"transparent",color:"#FF6666",border:"1px solid #553333",borderRadius:6,fontSize:10,cursor:"pointer"}}>Sil</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {modal && (
        <Modal onClose={() => setModal(null)} title={modal.mode==="new"?"Yeni Personel":"Personeli Duzenle"}>
          <Field label="AD SOYAD"><input value={form.name||""} onChange={e=>setForm({...form,name:e.target.value})} style={inputS}/></Field>
          <Field label="EMAIL"><input type="email" value={form.email||""} onChange={e=>setForm({...form,email:e.target.value})} disabled={modal.mode==="edit"} style={{...inputS, opacity:modal.mode==="edit"?0.6:1}}/></Field>
          {modal.mode==="new" && <Field label="SIFRE (en az 6 karakter)"><input type="text" value={form.password||""} onChange={e=>setForm({...form,password:e.target.value})} placeholder="orn: garson2026" style={inputS}/></Field>}
          <Field label="TELEFON"><input value={form.phone||""} onChange={e=>setForm({...form,phone:e.target.value})} style={inputS}/></Field>

          <Field label="GORUNEN UNVAN (uygulamada gozukur)"><input value={form.display_role||""} onChange={e=>setForm({...form,display_role:e.target.value})} placeholder="Yönetici" style={inputS}/></Field>

          <Field label="GERCEK YETKI">
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {ROLES.map(r => (
                <button key={r.key} onClick={()=>setForm({...form,role:r.key})} style={{flex:"1 1 calc(50% - 6px)",minWidth:120,padding:"10px",background:form.role===r.key?(r.key==="admin"?"#FFD700":"#C8973E"):"#222",color:form.role===r.key?"#000":"#888",border:"1px solid "+(form.role===r.key?(r.key==="admin"?"#FFD700":"#C8973E"):"#333"),borderRadius:8,fontSize:11,fontWeight:700,cursor:"pointer"}}>{r.label}</button>
              ))}
            </div>
          </Field>

          <div style={{display:"flex",gap:8,marginTop:10}}>
            <button onClick={() => setModal(null)} style={cancelBtn}>Iptal</button>
            <button onClick={saveStaff} disabled={busy} style={{...saveBtn,opacity:busy?0.6:1}}>{busy?"Kaydediliyor...":"Kaydet"}</button>
          </div>
        </Modal>
      )}

      {pwModal && (
        <Modal onClose={() => setPwModal(null)} title={"Sifre Sifirla: " + pwModal.name}>
          <div style={{background:"rgba(200,151,62,0.1)",border:"1px solid rgba(200,151,62,0.3)",borderRadius:8,padding:12,marginBottom:16,fontSize:12,color:"#ddd",lineHeight:1.5}}>
            Yeni bir sifre belirle. Kullanici bu sifreyle giris yapabilir.
          </div>
          <Field label="YENI SIFRE (en az 6 karakter)"><input autoFocus type="text" value={newPassword} onChange={e=>setNewPassword(e.target.value)} placeholder="orn: garson2026" style={inputS}/></Field>
          <div style={{display:"flex",gap:8,marginTop:10}}>
            <button onClick={() => setPwModal(null)} style={cancelBtn}>Iptal</button>
            <button onClick={resetPassword} disabled={busy} style={{...saveBtn,opacity:busy?0.6:1}}>{busy?"Kaydediliyor...":"Sifreyi Belirle"}</button>
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
