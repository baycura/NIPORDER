import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase.js";
import { useAuth } from "../../contexts/AuthContext.jsx";

const cv = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";

const PRESETS = [
  { name: "Bar 1",   capacity: 2, sort_order: 10 },
  { name: "Bar 2",   capacity: 2, sort_order: 20 },
  { name: "Masa 1",  capacity: 2, sort_order: 100 },
  { name: "Masa 2",  capacity: 4, sort_order: 110 },
  { name: "Masa 3",  capacity: 4, sort_order: 120 },
  { name: "Teras 1", capacity: 6, sort_order: 200 },
  { name: "Teras 2", capacity: 4, sort_order: 210 },
];

export default function TablesMgmtPage() {
  const { staffUser } = useAuth();
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [tName, setTName] = useState("");
  const [tCap, setTCap] = useState("");
  const [tSort, setTSort] = useState("");

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("cafe_tables").select("*").in("store_id", staffUser?.store_ids?.length ? staffUser.store_ids : ["00000000-0000-0000-0000-000000000000"]).order("sort_order").order("name");
    setTables(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openNew = () => {
    setModal({mode:"new"});
    setTName(""); setTCap("4");
    const maxSort = Math.max(...tables.map(t => t.sort_order || 0), 0);
    setTSort(String(maxSort + 10));
  };

  const openEdit = (t) => {
    setModal({mode:"edit", data:t});
    setTName(t.name); setTCap(String(t.capacity || 4)); setTSort(String(t.sort_order || 0));
  };

  const saveTable = async () => {
    const name = tName.trim();
    if (!name) { alert("Masa adi gerekli"); return; }
    const payload = {
      name,
      capacity: Number(tCap) || 4,
      sort_order: Number(tSort) || 0,
      store_id: editing?.store_id || staffUser?.store_ids?.[0],
      is_walkin: false,
    };
    if (modal.mode === "new") {
      const { error } = await supabase.from("cafe_tables").insert(payload);
      if (error) { alert("Hata: " + error.message); return; }
    } else {
      const { error } = await supabase.from("cafe_tables").update(payload).eq("id", modal.data.id);
      if (error) { alert("Hata: " + error.message); return; }
    }
    setModal(null); load();
  };

  const deleteTable = async (t) => {
    if (!confirm('"' + t.name + '" silinsin mi?')) return;
    const { error } = await supabase.from("cafe_tables").delete().eq("id", t.id);
    if (error) { alert("Hata: " + error.message); return; }
    load();
  };

  const addAllPresets = async () => {
    if (!confirm("7 hazir masayi ekle (Bar 1-2, Masa 1-3, Teras 1-2)?")) return;
    const { error } = await supabase.from("cafe_tables").insert(PRESETS.map(p => ({...p, store_id: staffUser?.store_ids?.[0], is_walkin: false})));
    if (error) { alert("Hata: " + error.message); return; }
    load();
  };

  if (loading) return (<div style={{color:"#888",fontFamily:cv,padding:20}}>Yukleniyor...</div>);

  return (
    <div style={{fontFamily:cv,color:"#F0EDE8"}}>
      <div style={{fontSize:24,fontWeight:800,marginBottom:4}}>Masa Yonetimi</div>
      <div style={{fontSize:11,color:"#888",letterSpacing:"1px",marginBottom:18}}>{tables.length} MASA</div>

      <div style={{display:"flex",gap:8,marginBottom:18,flexWrap:"wrap"}}>
        <button onClick={openNew} style={{padding:"10px 16px",background:"#C8973E",color:"#000",border:"none",borderRadius:10,fontSize:13,fontWeight:800,cursor:"pointer"}}>+ Yeni Masa</button>
        {tables.length === 0 && (
          <button onClick={addAllPresets} style={{padding:"10px 16px",background:"transparent",color:"#C8973E",border:"1px dashed #C8973E",borderRadius:10,fontSize:13,fontWeight:700,cursor:"pointer"}}>Hazir masalari ekle (7)</button>
        )}
      </div>

      {tables.length === 0 && (
        <div style={{textAlign:"center",padding:40,color:"#666",fontSize:13}}>
          Henuz masa yok. Yeni masa ekle veya hazir seti kullan.
        </div>
      )}

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:8}}>
        {tables.map(t => (
          <div key={t.id} style={{background:"#1A1A1A",border:"1px solid #2A2A2A",borderRadius:10,padding:12}}>
            <div style={{fontSize:14,fontWeight:700,color:"#F0EDE8",marginBottom:4}}>{t.name}</div>
            <div style={{fontSize:11,color:"#888",marginBottom:10}}>{t.capacity || 4} kisilik · sira {t.sort_order || 0}</div>
            <div style={{display:"flex",gap:4}}>
              <button onClick={() => openEdit(t)} style={{flex:1,padding:"6px",background:"#222",color:"#aaa",border:"1px solid #333",borderRadius:6,fontSize:11,cursor:"pointer"}}>Duzenle</button>
              <button onClick={() => deleteTable(t)} style={{flex:1,padding:"6px",background:"transparent",color:"#FF6666",border:"1px solid #553333",borderRadius:6,fontSize:11,cursor:"pointer"}}>Sil</button>
            </div>
          </div>
        ))}
      </div>

      {modal && (
        <div onClick={() => setModal(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:100}}>
          <div onClick={e => e.stopPropagation()} style={{background:"#161616",border:"1px solid #2A2A2A",borderRadius:"16px 16px 0 0",padding:20,width:"100%",maxWidth:500}}>
            <div style={{fontSize:18,fontWeight:800,color:"#F0EDE8",marginBottom:16}}>{modal.mode==="new"?"Yeni Masa":"Masayi Duzenle"}</div>
            <Field label="MASA ADI"><input autoFocus value={tName} onChange={e=>setTName(e.target.value)} placeholder="Bar 1, Masa 3, Teras 2..." style={inputS}/></Field>
            <div style={{display:"flex",gap:8}}>
              <Field label="KAPASITE" style={{flex:1}}><input type="number" value={tCap} onChange={e=>setTCap(e.target.value)} style={inputS}/></Field>
              <Field label="SIRA" style={{flex:1}}><input type="number" value={tSort} onChange={e=>setTSort(e.target.value)} style={inputS}/></Field>
            </div>
            <div style={{display:"flex",gap:8,marginTop:10}}>
              <button onClick={() => setModal(null)} style={{flex:1,padding:"12px",background:"transparent",color:"#888",border:"1px solid #333",borderRadius:10,fontSize:14,fontWeight:700,cursor:"pointer"}}>Iptal</button>
              <button onClick={saveTable} style={{flex:2,padding:"12px",background:"#C8973E",color:"#000",border:"none",borderRadius:10,fontSize:14,fontWeight:800,cursor:"pointer"}}>Kaydet</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const inputS = {width:"100%",padding:"10px 12px",background:"#0C0C0C",border:"1px solid #2A2A2A",borderRadius:8,color:"#F0EDE8",fontSize:14,outline:"none",fontFamily:"inherit"};

function Field({label, children, style={}}) {
  return (<div style={{marginBottom:12,...style}}>
    <div style={{fontSize:10,color:"#888",letterSpacing:"1.5px",fontWeight:700,marginBottom:5}}>{label}</div>
    {children}
  </div>);
}
