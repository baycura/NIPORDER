import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase.js";

const cv = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";
const UNITS = ["ml","l","g","kg","adet","sise","kasa"];

export default function StockMgmtPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("ingredients").select("*").order("name");
    setItems(data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const openNew = () => { setModal({mode:"new"}); setForm({name:"", unit:"ml", stock_qty:0, cost_per_unit:0, waste_pct:0}); };
  const openEdit = (i) => { setModal({mode:"edit", data:i}); setForm({name:i.name, unit:i.unit, stock_qty:Number(i.stock_qty)||0, cost_per_unit:Number(i.cost_per_unit)||0, waste_pct:Number(i.waste_pct)||0}); };

  const save = async () => {
    if (busy) return;
    if (!form.name?.trim()) { alert("Isim gerekli"); return; }
    setBusy(true);
    const payload = {
      name: form.name.trim(), unit: form.unit,
      stock_qty: Number(form.stock_qty)||0,
      cost_per_unit: Number(form.cost_per_unit)||0,
      waste_pct: Number(form.waste_pct)||0,
    };
    if (modal.mode === "new") {
      const { error } = await supabase.from("ingredients").insert(payload);
      if (error) { alert("Hata: " + error.message); setBusy(false); return; }
    } else {
      const { error } = await supabase.from("ingredients").update(payload).eq("id", modal.data.id);
      if (error) { alert("Hata: " + error.message); setBusy(false); return; }
    }
    setModal(null); setBusy(false); load();
  };

  const del = async (i) => {
    if (!confirm('"' + i.name + '" silinsin mi?')) return;
    await supabase.from("ingredients").delete().eq("id", i.id);
    load();
  };

  if (loading) return (<div style={{color:"#888",fontFamily:cv,padding:20}}>Yukleniyor...</div>);

  const totalValue = items.reduce((s,i) => s + (Number(i.stock_qty)||0) * (Number(i.cost_per_unit)||0), 0);
  const lowStock = items.filter(i => Number(i.stock_qty) < 10).length;

  return (
    <div style={{fontFamily:cv,color:"#F0EDE8"}}>
      <div style={{fontSize:24,fontWeight:800,marginBottom:4}}>Stok Yonetimi</div>
      <div style={{fontSize:11,color:"#888",letterSpacing:"1px",marginBottom:14}}>{items.length} HAMMADDE · {lowStock} AZALAN</div>

      {totalValue > 0 && (
        <div style={{background:"linear-gradient(135deg,#C8973E22,#E0AB4A22)",border:"1px solid #C8973E",borderRadius:12,padding:14,marginBottom:14,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontSize:11,color:"#C8973E",letterSpacing:"1.5px",fontWeight:700}}>TOPLAM STOK DEGERI</div>
            <div style={{fontSize:22,color:"#F0EDE8",fontWeight:800,marginTop:2}}>₺{Math.round(totalValue).toLocaleString("tr-TR")}</div>
          </div>
        </div>
      )}

      <button onClick={openNew} style={{padding:"10px 16px",background:"#C8973E",color:"#000",border:"none",borderRadius:10,fontSize:13,fontWeight:800,cursor:"pointer",marginBottom:14}}>+ Yeni Hammadde</button>

      {items.length === 0 && <div style={{textAlign:"center",padding:40,color:"#666",fontSize:13}}>Hic hammadde yok. Ekle veya fatura yukle.</div>}

      {items.map(i => {
        const value = (Number(i.stock_qty)||0) * (Number(i.cost_per_unit)||0);
        const isLow = Number(i.stock_qty) < 10;
        return (
          <div key={i.id} style={{background:"#1A1A1A",border:"1px solid "+(isLow?"#552222":"#2A2A2A"),borderRadius:10,padding:12,marginBottom:8}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                  <div style={{fontSize:14,fontWeight:700,color:"#F0EDE8"}}>{i.name}</div>
                  {isLow && <span style={{fontSize:9,padding:"2px 6px",background:"#552222",color:"#FFB0B0",borderRadius:6,fontWeight:700}}>AZALAN</span>}
                  {i.waste_pct > 0 && <span style={{fontSize:9,padding:"2px 6px",background:"#3D2D18",color:"#FFD088",borderRadius:6,fontWeight:700}}>FIRE %{i.waste_pct}</span>}
                </div>
                <div style={{fontSize:12,color:"#888",marginTop:3}}>
                  <span style={{color:isLow?"#FFB0B0":"#F0EDE8",fontWeight:700}}>{i.stock_qty}</span> {i.unit}
                  {i.cost_per_unit > 0 && <span style={{marginLeft:8}}>· ₺{i.cost_per_unit}/{i.unit}</span>}
                  {value > 0 && <span style={{marginLeft:8,color:"#C8973E"}}>· deger ₺{Math.round(value)}</span>}
                </div>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:4,flexShrink:0}}>
                <button onClick={() => openEdit(i)} style={{padding:"5px 9px",background:"#222",color:"#aaa",border:"1px solid #333",borderRadius:6,fontSize:10,cursor:"pointer"}}>Duzenle</button>
                <button onClick={() => del(i)} style={{padding:"5px 9px",background:"transparent",color:"#FF6666",border:"1px solid #553333",borderRadius:6,fontSize:10,cursor:"pointer"}}>Sil</button>
              </div>
            </div>
          </div>
        );
      })}

      {modal && (
        <Modal onClose={() => setModal(null)} title={modal.mode==="new"?"Yeni Hammadde":"Hammaddeyi Duzenle"}>
          <Field label="AD"><input value={form.name||""} onChange={e=>setForm({...form,name:e.target.value})} placeholder="orn: Bud Ficinin" style={inputS}/></Field>
          <Field label="BIRIM">
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {UNITS.map(u => (
                <button key={u} onClick={()=>setForm({...form,unit:u})} style={{padding:"8px 14px",background:form.unit===u?"#C8973E":"#222",color:form.unit===u?"#000":"#888",border:"1px solid "+(form.unit===u?"#C8973E":"#333"),borderRadius:8,fontSize:12,fontWeight:700,cursor:"pointer"}}>{u}</button>
              ))}
            </div>
          </Field>
          <Field label={"STOK MIKTARI (" + form.unit + ")"}><input type="number" step="0.01" value={form.stock_qty||0} onChange={e=>setForm({...form,stock_qty:e.target.value})} style={inputS}/></Field>
          <Field label={"BIRIM MALIYET (₺ / " + form.unit + ")"}><input type="number" step="0.01" value={form.cost_per_unit||0} onChange={e=>setForm({...form,cost_per_unit:e.target.value})} style={inputS}/></Field>
          <Field label="FIRE ORANI (%)"><input type="number" step="0.1" min="0" max="100" value={form.waste_pct||0} onChange={e=>setForm({...form,waste_pct:e.target.value})} placeholder="orn: 3 = %3 fire" style={inputS}/></Field>
          <div style={{display:"flex",gap:8,marginTop:10}}>
            <button onClick={() => setModal(null)} style={cancelBtn}>Iptal</button>
            <button onClick={save} disabled={busy} style={{...saveBtn,opacity:busy?0.6:1}}>{busy?"...":"Kaydet"}</button>
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
