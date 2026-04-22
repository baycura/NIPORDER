import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase.js";

const cv = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";
const card = {background:"#1A1A1A",border:"1px solid #2A2A2A",borderRadius:12,padding:14,marginBottom:8};
const inputS = {width:"100%",padding:"10px 12px",background:"#0C0C0C",border:"1px solid #2A2A2A",borderRadius:8,color:"#F0EDE8",fontSize:14,outline:"none",fontFamily:cv};
const btnGold = {padding:"10px 14px",background:"#C8973E",color:"#000",border:"none",borderRadius:8,fontSize:13,fontWeight:700,cursor:"pointer"};
const btnGhost = {padding:"6px 10px",background:"transparent",color:"#888",border:"1px solid #333",borderRadius:6,fontSize:11,fontWeight:600,cursor:"pointer"};
const btnDanger = {padding:"6px 10px",background:"transparent",color:"#FF6464",border:"1px solid #FF6464",borderRadius:6,fontSize:11,fontWeight:600,cursor:"pointer"};

const PRESETS = [
  { name:"Bar 1", capacity:2 },
  { name:"Bar 2", capacity:2 },
  { name:"Masa 1", capacity:2 },
  { name:"Masa 2", capacity:4 },
  { name:"Masa 3", capacity:4 },
  { name:"Teras 1", capacity:6 },
  { name:"Teras 2", capacity:4 },
];

export default function TablesMgmtPage() {
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);   // {id?, name, capacity, sort_order}
  const [bulkOpen, setBulkOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("cafe_tables").select("*").order("sort_order").order("name");
    setTables(data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const newTable = () => setModal({ name:"", capacity:2, sort_order:(tables.at(-1)?.sort_order||0)+10 });
  const editTable = (t) => setModal({...t});
  const saveTable = async () => {
    const t = modal;
    if (!t.name.trim()) { alert("Masa adi girin"); return; }
    const payload = {
      name: t.name.trim(),
      capacity: Number(t.capacity)||2,
      sort_order: Number(t.sort_order)||0,
    };
    const { error } = t.id
      ? await supabase.from("cafe_tables").update(payload).eq("id", t.id)
      : await supabase.from("cafe_tables").insert(payload);
    if (error) { alert("Hata: "+error.message); return; }
    setModal(null); load();
  };
  const deleteTable = async (t) => {
    if (!confirm("'"+t.name+"' masasini silmek istediginizden emin misiniz?")) return;
    const { error } = await supabase.from("cafe_tables").delete().eq("id", t.id);
    if (error) { alert("Hata: "+error.message); return; }
    load();
  };

  const addPreset = async (preset) => {
    const sort_order = (tables.at(-1)?.sort_order||0)+10;
    const { error } = await supabase.from("cafe_tables").insert({...preset, sort_order});
    if (error) { alert("Hata: "+error.message); return; }
    load();
  };

  if (loading) return <div style={{color:"#888",padding:20,fontFamily:cv}}>Yukleniyor...</div>;

  return (
    <div style={{fontFamily:cv,color:"#F0EDE8"}}>
      <div style={{fontSize:26,fontWeight:800,marginBottom:4}}>Masa Yonetimi</div>
      <div style={{fontSize:12,color:"#888",marginBottom:18}}>Tek tek masa ekle veya hazir setlerden sec</div>

      <button onClick={newTable} style={{...btnGold,width:"100%",padding:"14px",fontSize:15,marginBottom:10}}>+ Yeni Masa Ekle</button>

      <button onClick={()=>setBulkOpen(!bulkOpen)} style={{...btnGhost,width:"100%",padding:"12px",fontSize:13,marginBottom:14}}>{bulkOpen?"Hazir Setleri Gizle ↑":"Hazir Setlerden Hizli Ekle ↓"}</button>

      {bulkOpen && (
        <div style={{...card,padding:10,marginBottom:14}}>
          <div style={{fontSize:11,color:"#888",letterSpacing:"1px",fontWeight:700,marginBottom:8}}>HIZLI EKLE</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(110px,1fr))",gap:6}}>
            {PRESETS.map((p,i) => (
              <button key={i} onClick={()=>addPreset(p)} style={{padding:"10px 8px",background:"#0C0C0C",color:"#F0EDE8",border:"1px solid #2A2A2A",borderRadius:8,fontSize:12,fontWeight:600,cursor:"pointer",textAlign:"left"}}>
                <div style={{fontSize:13,fontWeight:700}}>+ {p.name}</div>
                <div style={{fontSize:10,color:"#888",marginTop:2}}>{p.capacity} kisilik</div>
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{fontSize:13,letterSpacing:"1.5px",fontWeight:700,color:"#888",marginBottom:8}}>MEVCUT MASALAR ({tables.length})</div>
      {tables.length === 0 && (
        <div style={{...card,textAlign:"center",color:"#666",padding:30}}>Henuz masa yok. Yukaridan ekle.</div>
      )}
      {tables.map(t => (
        <div key={t.id} style={{...card,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontSize:15,fontWeight:700,color:"#F0EDE8"}}>{t.name}</div>
            <div style={{fontSize:11,color:"#888",marginTop:2}}>{t.capacity||2} kisilik · sira: {t.sort_order||0}</div>
          </div>
          <div style={{display:"flex",gap:6}}>
            <button onClick={()=>editTable(t)} style={btnGhost}>Duzenle</button>
            <button onClick={()=>deleteTable(t)} style={btnDanger}>Sil</button>
          </div>
        </div>
      ))}

      {modal && (
        <div onClick={()=>setModal(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100,padding:14}}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#1A1A1A",border:"1px solid #2A2A2A",borderRadius:16,padding:20,width:"100%",maxWidth:400}}>
            <div style={{fontSize:18,fontWeight:800,color:"#F0EDE8",marginBottom:14}}>{modal.id?"Masayi Duzenle":"Yeni Masa"}</div>
            <div style={{marginBottom:10}}>
              <div style={{fontSize:11,color:"#888",letterSpacing:"1px",fontWeight:700,marginBottom:5}}>AD</div>
              <input style={inputS} value={modal.name} onChange={e=>setModal({...modal,name:e.target.value})} autoFocus placeholder="Bar 1, Masa 5, Teras 2..."/>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
              <div>
                <div style={{fontSize:11,color:"#888",letterSpacing:"1px",fontWeight:700,marginBottom:5}}>KAPASITE</div>
                <input type="number" min="1" max="20" style={inputS} value={modal.capacity} onChange={e=>setModal({...modal,capacity:e.target.value})}/>
              </div>
              <div>
                <div style={{fontSize:11,color:"#888",letterSpacing:"1px",fontWeight:700,marginBottom:5}}>SIRA</div>
                <input type="number" style={inputS} value={modal.sort_order} onChange={e=>setModal({...modal,sort_order:e.target.value})}/>
              </div>
            </div>
            <div style={{display:"flex",gap:8,marginTop:16}}>
              <button onClick={()=>setModal(null)} style={{flex:1,padding:"12px",background:"transparent",color:"#888",border:"1px solid #333",borderRadius:10,fontSize:14,fontWeight:700,cursor:"pointer"}}>Iptal</button>
              <button onClick={saveTable} style={{flex:2,padding:"12px",background:"#C8973E",color:"#000",border:"none",borderRadius:10,fontSize:14,fontWeight:800,cursor:"pointer"}}>Kaydet</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
