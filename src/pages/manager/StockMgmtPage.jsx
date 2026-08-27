import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase.js";
import { useAuth } from "../../contexts/AuthContext.jsx";
import Ikon from "../../components/Ikon.jsx";
import { paketIkilemi, ikilemMetni, birimYaz, anlasilirYaz } from "../../lib/birimMaliyet.js";

const cv = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";
const UNITS = ["ml","cl","l","g","kg","adet","şişe","porsiyon"];
const VOL_UNITS = ["ml","cl","l"];

export default function StockMgmtPage() {
  const { staffUser } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("ingredients").select("*").in("store_id", staffUser?.store_ids?.length ? staffUser.store_ids : ["00000000-0000-0000-0000-000000000000"]).order("name");
    setItems(data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const openNew = () => { setModal({mode:"new"}); setForm({name:"", unit:"ml", stock_qty:0, cost_per_unit:0, waste_pct:0, pack_qty:1, unit_volume_ml:"", waste_per_pack:0, is_consumable:false}); };
  const openEdit = (i) => { setModal({mode:"edit", data:i}); setForm({name:i.name, unit:i.unit, stock_qty:Number(i.stock_qty)||0, cost_per_unit:Number(i.cost_per_unit)||0, waste_pct:Number(i.waste_pct)||0, pack_qty:Number(i.pack_qty)||1, unit_volume_ml:i.unit_volume_ml??"", waste_per_pack:Number(i.waste_per_pack)||0, is_consumable:!!i.is_consumable}); };

  const save = async () => {
    if (busy) return;
    if (!form.name?.trim()) { alert("Isim gerekli"); return; }

    // Fatura geldiginde guncellenen hane burasi. Yeni rakam eskisinin ~paket
    // kati ise paket fiyati girilmis olma ihtimali cok yuksek — pipet boyle
    // kacmisti. Otomatik bolmuyoruz, soruyoruz.
    let maliyet = Number(form.cost_per_unit) || 0;
    const ik = modal.mode === "edit" ? paketIkilemi(maliyet, modal.data) : null;
    if (ik?.kesin) {
      const paketMi = confirm(
        ikilemMetni(ik, form.unit) +
        `\n\nEski birim maliyet ${birimYaz(modal.data.cost_per_unit)} idi.\n\n` +
        `TAMAM = paket fiyati, ${birimYaz(ik.birim)} olarak kaydet\n` +
        `İPTAL = adet fiyati, girdigim gibi kaydet`
      );
      if (paketMi) { maliyet = ik.birim; setForm(f => ({ ...f, cost_per_unit: ik.birim })); }
    }

    setBusy(true);
    const payload = {
      name: form.name.trim(), unit: form.unit, store_id: staffUser?.store_ids?.[0],
      stock_qty: Number(form.stock_qty)||0,
      cost_per_unit: maliyet,
      waste_pct: Number(form.waste_pct)||0,
      pack_qty: Number(form.pack_qty)||1,
      unit_volume_ml: form.unit_volume_ml === "" || form.unit_volume_ml == null ? null : Number(form.unit_volume_ml),
      waste_per_pack: Number(form.waste_per_pack)||0,
      is_consumable: !!form.is_consumable,
    };
    if (modal.mode === "new") {
      const { error } = await supabase.from("ingredients").insert({ ...payload, store_id: staffUser?.store_ids?.[0] });
      if (error) { alert("Hata: " + error.message); setBusy(false); return; }
    } else {
      const { error } = await supabase.from("ingredients").update(payload).eq("id", modal.data.id);
      if (error) { alert("Hata: " + error.message); setBusy(false); return; }
    }
    setModal(null); setBusy(false); load();
  };

  const del = async (i) => {
    if (!confirm('"' + i.name + '" silinsin mi?')) return;
    const { error } = await supabase.from("ingredients").delete().eq("id", i.id);
    if (error) { alert("Silinemedi: " + error.message); return; }
    load();
  };

  if (loading) return (<div style={{color:"#888",fontFamily:cv,padding:20}}>Yukleniyor...</div>);

  const totalValue = items.reduce((s,i) => s + (Number(i.stock_qty)||0) * (Number(i.cost_per_unit)||0), 0);
  const lowStock = items.filter(i => Number(i.stock_qty) < 10).length;

  return (
    <div style={{fontFamily:cv,color:"#F0EDE8"}}>
      <div style={{fontSize:24,fontWeight:800,marginBottom:4}}>Stok Yonetimi</div>
      <div style={{fontSize:11,color:"#888",letterSpacing:"1px",marginBottom:14}}>{items.length} HAMMADDE · {lowStock} AZALAN</div>

      {/* Rafi saymak icin buraya gelinirdi: her malzeme tek tek acilir, sayi
          ustune yazilirdi. Sayim ekrani ayni isi karsilastirarak ve kayit
          birakarak yapiyor — dogru kapiya yonlendir. */}
      <div onClick={()=>navigate("/stock-count")} style={{background:"#161616",border:"1px solid #2A2A2A",borderRadius:12,padding:"12px 14px",marginBottom:14,display:"flex",alignItems:"center",gap:10,cursor:"pointer"}}>
        <Ikon ad="sayim" boy={18} style={{color:"#8A8580",flexShrink:0}}/>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:14,fontWeight:700}}>Rafı mı sayacaksın?</div>
          <div style={{fontSize:12,color:"#666",marginTop:2,lineHeight:1.5}}>Stok Sayımı ekranı beklenen ile saydığını yan yana gösterir, farkı kaydeder.</div>
        </div>
        <Ikon ad="oksag" boy={14} style={{color:"#666",flexShrink:0}}/>
      </div>

      {totalValue > 0 && (
        <div style={{background:"#161616",border:"1px solid #FFFFFF",borderRadius:12,padding:14,marginBottom:14,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontSize:11,color:"#8A8580",letterSpacing:"1.5px",fontWeight:700}}>Toplam stok değeri</div>
            <div style={{fontSize:22,color:"#F0EDE8",fontWeight:800,marginTop:2}}>₺{Math.round(totalValue).toLocaleString("tr-TR")}</div>
          </div>
        </div>
      )}

      <button onClick={openNew} style={{padding:"10px 16px",background:"#FFFFFF",color:"#000",border:"none",borderRadius:10,fontSize:13,fontWeight:800,cursor:"pointer",marginBottom:14}}>+ Yeni Hammadde</button>

      {items.length === 0 && <div style={{textAlign:"center",padding:40,color:"#888888",fontSize:13}}>Hic hammadde yok. Ekle veya fatura yukle.</div>}

      {items.map(i => {
        const value = (Number(i.stock_qty)||0) * (Number(i.cost_per_unit)||0);
        const isLow = Number(i.stock_qty) < 10;
        return (
          <div key={i.id} style={{background:"#1A1A1A",border:"1px solid "+(isLow?"#2A2A2A":"#2A2A2A"),borderRadius:10,padding:12,marginBottom:8}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                  <div style={{fontSize:14,fontWeight:700,color:"#F0EDE8"}}>{i.name}</div>
                  {isLow && <span style={{fontSize:9,padding:"2px 6px",background:"#2A2A2A",color:"#C87A6A",borderRadius:6,fontWeight:700}}>Azalan</span>}
                  {i.waste_pct > 0 && <span style={{fontSize:9,padding:"2px 6px",background:"#2A2A2A",color:"#F0EDE8",borderRadius:6,fontWeight:700}}>FIRE %{i.waste_pct}</span>}
                  {i.is_consumable && <span style={{fontSize:9,padding:"2px 6px",background:"#2A2A2A",color:"#F0EDE8",borderRadius:6,fontWeight:700}}>Sarf</span>}
                  {Number(i.unit_volume_ml) > 0 && <span style={{fontSize:9,padding:"2px 6px",background:"#22262E",color:"#8A8580",borderRadius:6,fontWeight:700}}>{Number(i.pack_qty)>1 ? i.pack_qty+"x" : ""}{Number(i.unit_volume_ml)>=1000 ? (Number(i.unit_volume_ml)/1000)+"L" : i.unit_volume_ml+"ml"}</span>}
                </div>
                <div style={{fontSize:12,color:"#888",marginTop:3}}>
                  <span style={{color:isLow?"#C87A6A":"#F0EDE8",fontWeight:700}}>{i.stock_qty}</span> {i.unit}
                  {i.cost_per_unit > 0 && <span style={{marginLeft:8}}>· ₺{i.cost_per_unit}/{i.unit}</span>}
                  {value > 0 && <span style={{marginLeft:8,color:"#FFFFFF"}}>· deger ₺{Math.round(value)}</span>}
                </div>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:4,flexShrink:0}}>
                <button onClick={() => openEdit(i)} style={{padding:"5px 9px",background:"#222",color:"#aaa",border:"1px solid #333",borderRadius:6,fontSize:10,cursor:"pointer"}}>Duzenle</button>
                <button onClick={() => del(i)} style={{padding:"5px 9px",background:"transparent",color:"#C87A6A",border:"1px solid #2A2A2A",borderRadius:6,fontSize:10,cursor:"pointer"}}>Sil</button>
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
                <button key={u} onClick={()=>setForm({...form,unit:u})} style={{padding:"8px 14px",background:form.unit===u?"#FFFFFF":"#222",color:form.unit===u?"#000":"#888",border:"1px solid "+(form.unit===u?"#FFFFFF":"#333"),borderRadius:8,fontSize:12,fontWeight:700,cursor:"pointer"}}>{u}</button>
              ))}
            </div>
          </Field>
          <Field label={"STOK MIKTARI (" + form.unit + ")"}><input type="number" step="0.01" value={form.stock_qty||0} onChange={e=>setForm({...form,stock_qty:e.target.value})} style={inputS}/></Field>
          <Field label={"BIRIM MALIYET (₺ / " + form.unit + ")"}>
            <input type="number" step="0.01" value={form.cost_per_unit||0} onChange={e=>setForm({...form,cost_per_unit:e.target.value})} style={inputS}/>
            {/* Mililitre/gram maliyeti tek basina okunmaz; litre/kilo fiyatina
                cevrilince yanlislik goze carpar (Sut ₺205/litre yaziyordu). */}
            {anlasilirYaz(form.cost_per_unit, form.unit) && (
              <div style={{fontSize:12,color:"#F0EDE8",marginTop:5,fontWeight:700}}>
                = {anlasilirYaz(form.cost_per_unit, form.unit)}
                <span style={{color:"#666",fontWeight:400}}> — aldigin fiyatla ayni mi?</span>
              </div>
            )}
            {/* Paketli malzemede iki okuma da mumkun; rakam yazilirken gorunsun. */}
            {(() => {
              const ik = paketIkilemi(form.cost_per_unit, { pack_qty: form.pack_qty, cost_per_unit: modal.data?.cost_per_unit });
              if (!ik) return null;
              return (
                <div style={{fontSize:11,color:ik.kesin?"#C87A6A":"#666",marginTop:5,lineHeight:1.5}}>
                  {ik.paket}'li paket · girdigin rakam paket fiyatiysa birim maliyet <b style={{color:"#F0EDE8"}}>{birimYaz(ik.birim)}</b> olmali
                  {ik.kesin && <> — eskisinin tam {ik.paket} kati, kaydederken sorulacak</>}
                </div>
              );
            })()}
          </Field>
          <Field label="FIRE ORANI (%)"><input type="number" step="0.1" min="0" max="100" value={form.waste_pct||0} onChange={e=>setForm({...form,waste_pct:e.target.value})} placeholder="orn: 3 = %3 dokulme/fire" style={inputS}/></Field>

          <div style={{background:"#0C0C0C",border:"1px solid #2A2A2A",borderRadius:10,padding:12,marginBottom:12}}>
            <div style={{fontSize:12,color:"#8A8580",letterSpacing:"0.2px",fontWeight:600,marginBottom:8,display:"flex",alignItems:"center",gap:6}}><Ikon ad="stok" boy={13}/>AMBALAJ (fatura girisi bunu kullanir)</div>
            <Field label="KOLI ICI ADET (koli gelmiyorsa 1)">
              <input type="number" min="1" step="1" value={form.pack_qty||1} onChange={e=>setForm({...form,pack_qty:e.target.value})} placeholder="orn: 24 sise/koli" style={inputS}/>
            </Field>
            <Field label="BIR SISE / FICI HACMI (ml)">
              <input type="number" step="1" value={form.unit_volume_ml||""} onChange={e=>setForm({...form,unit_volume_ml:e.target.value})} placeholder="70cl sise = 700 · 30L fici = 30000" style={inputS}/>
            </Field>
            <Field label={"AMBALAJ BASINA FIRE (" + form.unit + ")"}>
              <input type="number" step="1" value={form.waste_per_pack||0} onChange={e=>setForm({...form,waste_per_pack:e.target.value})} placeholder="Fici: 5 bardak fire = 5 x bardak ml" style={inputS}/>
            </Field>
            {VOL_UNITS.includes(form.unit) && (
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {[["5 x 500ml bardak",2500],["5 x 330ml bardak",1650],["Fire yok",0]].map(([lbl,val]) => (
                  <button key={lbl} onClick={()=>setForm({...form,waste_per_pack:val})} style={{padding:"7px 10px",background:"#222",color:"#aaa",border:"1px solid #333",borderRadius:8,fontSize:11,fontWeight:700,cursor:"pointer"}}>{lbl}</button>
                ))}
              </div>
            )}
            {Number(form.unit_volume_ml) > 0 && Number(form.pack_qty) > 0 && (
              <div style={{fontSize:11,color:"#888",marginTop:8,lineHeight:1.5}}>
                1 koli = {form.pack_qty} x {form.unit_volume_ml} ml = <b style={{color:"#FFFFFF"}}>{(Number(form.pack_qty)*Number(form.unit_volume_ml)).toLocaleString("tr-TR")} ml</b>
                {Number(form.waste_per_pack) > 0 && <> · ambalaj basi fire {form.waste_per_pack} {form.unit}</>}
              </div>
            )}
          </div>

          <label style={{display:"flex",alignItems:"center",gap:8,marginBottom:12,cursor:"pointer"}}>
            <input type="checkbox" checked={!!form.is_consumable} onChange={e=>setForm({...form,is_consumable:e.target.checked})} style={{width:18,height:18,accentColor:"#FFFFFF"}}/>
            <span style={{fontSize:13,color:"#F0EDE8"}}>Sarf malzeme (buz, pet bardak, pipet...) — recetelere tek dokunusla eklenir</span>
          </label>
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
