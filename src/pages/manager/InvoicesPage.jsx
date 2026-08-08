import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase.js";
import { useAuth } from "../../contexts/AuthContext.jsx";

const cv = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";

// Bir hammadde birim maliyeti onceki alima gore bu yuzdeden fazla artarsa
// "anormal fiyat" uyarisi verilir (sahip icin kacak/israf kontrolu).
const PRICE_ALERT_PCT = 10;

export default function InvoicesPage() {
  const { staffUser } = useAuth();
  const [invoices, setInvoices] = useState([]);
  const [ingredients, setIngredients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [lines, setLines] = useState([]);
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [priceAlerts, setPriceAlerts] = useState([]);

  const load = async () => {
    setLoading(true);
    const [{data: invs}, {data: ings}] = await Promise.all([
      supabase.from("supplier_invoices").select("*, supplier_invoice_items(*, ingredients(name, unit))").in("store_id", staffUser?.store_ids?.length ? staffUser.store_ids : ["00000000-0000-0000-0000-000000000000"]).order("invoice_date", {ascending: false}),
      supabase.from("ingredients").select("*").in("store_id", staffUser?.store_ids?.length ? staffUser.store_ids : ["00000000-0000-0000-0000-000000000000"]).order("name"),
    ]);
    setInvoices(invs || []);
    setIngredients(ings || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const openNew = () => {
    setModal({mode:"new"});
    setForm({supplier_name:"", invoice_date: new Date().toISOString().slice(0,10), total_amount:0, notes:""});
    setLines([{ingredient_id:"", qty:0, unit_cost:0, isNew:false, newName:"", newUnit:"ml"}]);
    setPhotoFile(null); setPhotoPreview(null);
  };

  const onPhoto = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setPhotoFile(f);
    const reader = new FileReader();
    reader.onload = () => setPhotoPreview(reader.result);
    reader.readAsDataURL(f);
  };

  // Fotograf kucultme: AI'ye tam cozunurluk gondermeye gerek yok (foto saklanmiyor)
  const resizeToBase64 = (file, maxDim = 1600) => new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.85).split(",")[1]);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Fotograf okunamadi")); };
    img.src = url;
  });

  // Turkce karakterleri sadelestirip mevcut hammaddeyle eslestir
  const normName = (s) => (s || "").toLocaleLowerCase("tr-TR")
    .replace(/ç/g,"c").replace(/ğ/g,"g").replace(/ı/g,"i").replace(/ö/g,"o").replace(/ş/g,"s").replace(/ü/g,"u")
    .replace(/[^a-z0-9 ]/g," ").replace(/\s+/g," ").trim();
  const matchIngredient = (name) => {
    const n = normName(name);
    if (!n) return null;
    let best = null, bestScore = 0;
    for (const ing of ingredients) {
      const m = normName(ing.name);
      let score = 0;
      if (m === n) score = 100;
      else if (m.includes(n) || n.includes(m)) score = 80;
      else {
        const toks = n.split(" ").filter(t => t.length > 2);
        const hit = toks.filter(t => m.includes(t)).length;
        if (toks.length) score = 60 * hit / toks.length;
      }
      if (score > bestScore) { bestScore = score; best = ing; }
    }
    return bestScore >= 50 ? best : null;
  };

  const UNITS = ["ml","l","g","kg","adet","sise","kasa"];
  const runOcr = async () => {
    if (!photoFile) { alert("Once fatura fotografi sec"); return; }
    if (ocrBusy) return;
    setOcrBusy(true);
    try {
      const image = await resizeToBase64(photoFile);
      const { data, error } = await supabase.functions.invoke("invoice-ocr", { body: { image, media_type: "image/jpeg" } });
      if (error) throw new Error(error.message || "Sunucu hatasi");
      if (data?.error) throw new Error(data.error);
      setForm(f => ({
        ...f,
        supplier_name: data.supplier_name || f.supplier_name,
        invoice_date: /^\d{4}-\d{2}-\d{2}$/.test(data.invoice_date || "") ? data.invoice_date : f.invoice_date,
      }));
      const newLines = (data.lines || []).filter(l => l?.name).map(l => {
        const match = matchIngredient(l.name);
        return match
          ? { ingredient_id: match.id, qty: Number(l.qty) || 0, unit_cost: Number(l.unit_cost) || 0, isNew: false, newName: "", newUnit: match.unit || "adet" }
          : { ingredient_id: "", qty: Number(l.qty) || 0, unit_cost: Number(l.unit_cost) || 0, isNew: true, newName: l.name, newUnit: UNITS.includes(l.unit) ? l.unit : "adet" };
      });
      if (newLines.length) {
        setLines(newLines);
        const matched = newLines.filter(l => !l.isNew).length;
        alert("✅ " + newLines.length + " kalem okundu (" + matched + " mevcut hammaddeyle eslesti). Kontrol edip kaydet.");
      } else {
        alert("Faturada kalem okunamadi — fotografi daha net cekip tekrar dene.");
      }
    } catch (e) {
      alert("AI okuma hatasi: " + (e?.message || e));
    }
    setOcrBusy(false);
  };

  const addLine = () => setLines([...lines, {ingredient_id:"", qty:0, unit_cost:0, isNew:false, newName:"", newUnit:"ml"}]);
  const removeLine = (idx) => setLines(lines.filter((_,i) => i !== idx));
  const updateLine = (idx, field, val) => setLines(lines.map((l,i) => i===idx ? {...l, [field]: val} : l));

  const linesTotal = lines.reduce((s,l) => s + Number(l.qty||0) * Number(l.unit_cost||0), 0);

  const saveInvoice = async () => {
    if (busy) return;
    if (!form.supplier_name?.trim()) { alert("Tedarikci adi gerekli"); return; }
    if (lines.length === 0) { alert("En az bir kalem ekle"); return; }
    setBusy(true);

    // Fatura fotografi SAKLANMAZ — yalnizca AI okuma icin kullanilir (depolama sismesin)
    const { data: inv, error: invErr } = await supabase.from("supplier_invoices").insert({
      supplier_name: form.supplier_name.trim(),
      invoice_date: form.invoice_date,
      total_amount: linesTotal,
      notes: form.notes?.trim() || null,
      store_id: staffUser?.store_ids?.[0],
    }).select().single();
    if (invErr) { alert("Hata: " + invErr.message); setBusy(false); return; }

    // Create new ingredients if needed and insert items + bump stock
    const anomalies = [];
    for (const l of lines) {
      let ingId = l.ingredient_id;
      if (l.isNew) {
        if (!l.newName?.trim()) continue;
        const { data: newIng, error: e } = await supabase.from("ingredients").insert({
          store_id: staffUser?.store_ids?.[0],
          name: l.newName.trim(), unit: l.newUnit, stock_qty: 0, cost_per_unit: Number(l.unit_cost)||0,
        }).select().single();
        if (e) { alert("Ingredient hatasi: " + e.message); continue; }
        ingId = newIng.id;
      }
      if (!ingId) continue;
      const qty = Number(l.qty)||0;
      const unitCost = Number(l.unit_cost)||0;
      await supabase.from("supplier_invoice_items").insert({
        invoice_id: inv.id, store_id: inv.store_id, ingredient_id: ingId, qty, unit_cost: unitCost, total_cost: qty * unitCost,
      });
      // Increment stock + update cost (+ anormal fiyat artisi tespiti)
      const ing = ingredients.find(i => i.id === ingId);
      const currentStock = Number(ing?.stock_qty)||0;
      const prevCost = Number(ing?.cost_per_unit)||0;
      if (!l.isNew && prevCost > 0 && unitCost > prevCost) {
        const pct = ((unitCost - prevCost) / prevCost) * 100;
        if (pct >= PRICE_ALERT_PCT) anomalies.push({ name: ing?.name || "?", unit: ing?.unit || "", prev: prevCost, now: unitCost, pct });
      }
      await supabase.from("ingredients").update({
        stock_qty: currentStock + qty,
        cost_per_unit: unitCost,
      }).eq("id", ingId);
    }

    setPriceAlerts(anomalies);
    if (anomalies.length) {
      // Sahibe Telegram uyarisi (arka planda; basarisiz olsa da kayit tamam)
      supabase.functions.invoke("telegram?action=price_alert", {
        body: { supplier: form.supplier_name.trim(), alerts: anomalies },
      }).catch(() => {});
    }
    setBusy(false); setModal(null); load();
    alert(anomalies.length
      ? "Fatura kaydedildi. ⚠️ " + anomalies.length + " üründe anormal fiyat artışı (%" + PRICE_ALERT_PCT + "+) — sahibe Telegram uyarısı gönderildi."
      : "Fatura kaydedildi! Stok guncellendi.");
  };

  const del = async (inv) => {
    if (!confirm("Fatura silinsin mi? (Stok geri alinmaz)")) return;
    await supabase.from("supplier_invoices").delete().eq("id", inv.id);
    load();
  };

  if (loading) return (<div style={{color:"#888",fontFamily:cv,padding:20}}>Yukleniyor...</div>);

  const totalSpent = invoices.reduce((s,i) => s + Number(i.total_amount||0), 0);

  return (
    <div style={{fontFamily:cv,color:"#F0EDE8"}}>
      <div style={{fontSize:24,fontWeight:800,marginBottom:4}}>Faturalar</div>
      <div style={{fontSize:11,color:"#888",letterSpacing:"1px",marginBottom:14}}>{invoices.length} FATURA · TOPLAM ₺{Math.round(totalSpent).toLocaleString("tr-TR")}</div>

      <button onClick={openNew} style={{padding:"10px 16px",background:"#C8973E",color:"#000",border:"none",borderRadius:10,fontSize:13,fontWeight:800,cursor:"pointer",marginBottom:14}}>+ Yeni Fatura</button>

      {priceAlerts.length > 0 && (
        <div style={{background:"#3A1A1A",border:"1px solid #7A3A3A",borderRadius:10,padding:12,marginBottom:12}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
            <div style={{fontSize:13,fontWeight:800,color:"#FF9F80"}}>⚠️ Anormal fiyat artışı (%{PRICE_ALERT_PCT}+)</div>
            <button onClick={()=>setPriceAlerts([])} style={{background:"transparent",border:"none",color:"#FF9F80",fontSize:18,cursor:"pointer",lineHeight:1}}>×</button>
          </div>
          {priceAlerts.map((a,i)=>(
            <div key={i} style={{fontSize:12,color:"#F0C0B0",padding:"3px 0"}}>
              <b>{a.name}</b>: ₺{a.prev.toFixed(2)} → <b style={{color:"#FF7A5A"}}>₺{a.now.toFixed(2)}</b>{a.unit ? " /"+a.unit : ""} <span style={{color:"#FF5A5A",fontWeight:700}}>(+%{a.pct.toFixed(0)})</span>
            </div>
          ))}
          <div style={{fontSize:11,color:"#B08070",marginTop:6}}>Bu artışlar kaydedildi ve sahibe Telegram'dan iletildi.</div>
        </div>
      )}

      {invoices.length === 0 && <div style={{textAlign:"center",padding:40,color:"#666",fontSize:13}}>Henuz fatura yok</div>}

      {invoices.map(inv => (
        <div key={inv.id} style={{background:"#1A1A1A",border:"1px solid #2A2A2A",borderRadius:10,padding:12,marginBottom:8}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10}}>
            <div style={{flex:1}}>
              <div style={{fontSize:14,fontWeight:700,color:"#F0EDE8"}}>{inv.supplier_name}</div>
              <div style={{fontSize:11,color:"#888",marginTop:2}}>{new Date(inv.invoice_date).toLocaleDateString("tr-TR")} · {inv.supplier_invoice_items?.length || 0} kalem</div>
              {inv.supplier_invoice_items?.length > 0 && (
                <div style={{fontSize:11,color:"#666",marginTop:4}}>
                  {inv.supplier_invoice_items.map(it => (it.ingredients?.name || "?") + " " + it.qty + (it.ingredients?.unit||"")).join(" · ")}
                </div>
              )}
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:14,fontWeight:800,color:"#C8973E"}}>₺{Math.round(Number(inv.total_amount)||0).toLocaleString("tr-TR")}</div>
              <button onClick={()=>del(inv)} style={{marginTop:6,padding:"3px 8px",background:"transparent",color:"#FF6666",border:"1px solid #553333",borderRadius:6,fontSize:9,cursor:"pointer"}}>Sil</button>
            </div>
          </div>
        </div>
      ))}

      {modal && (
        <Modal onClose={()=>setModal(null)} title="Yeni Fatura">
          <Field label="TEDARIKCI"><input value={form.supplier_name||""} onChange={e=>setForm({...form,supplier_name:e.target.value})} placeholder="orn: Anadolu Efes" style={inputS}/></Field>
          <div style={{display:"flex",gap:8}}>
            <Field label="TARIH"><input type="date" value={form.invoice_date||""} onChange={e=>setForm({...form,invoice_date:e.target.value})} style={inputS}/></Field>
          </div>

          <div style={{marginBottom:14,background:"rgba(200,151,62,0.06)",border:"1px dashed #C8973E",borderRadius:10,padding:12}}>
            <div style={{fontSize:10,color:"#C8973E",letterSpacing:"1.5px",fontWeight:700,marginBottom:5}}>🤖 FATURA FOTOSUNDAN OTOMATIK DOLDUR</div>
            <input type="file" accept="image/*" capture="environment" onChange={onPhoto} style={{...inputS, padding:"8px"}}/>
            {photoPreview && <img src={photoPreview} alt="" style={{marginTop:8,maxHeight:120,borderRadius:8,objectFit:"cover"}}/>}
            {photoFile && (
              <button onClick={runOcr} disabled={ocrBusy} style={{width:"100%",marginTop:8,padding:"10px",background:ocrBusy?"#555":"#C8973E",color:"#000",border:"none",borderRadius:8,fontSize:13,fontWeight:800,cursor:ocrBusy?"wait":"pointer"}}>
                {ocrBusy ? "AI okuyor... (10-30 sn)" : "🤖 Fotograftan doldur (AI)"}
              </button>
            )}
            <div style={{fontSize:10,color:"#888",marginTop:6}}>Fotograf saklanmaz — yalnizca kalemleri okumak icin kullanilir. Okunan kalemleri kontrol edip kaydet.</div>
          </div>

          <div style={{borderTop:"1px solid #2A2A2A",paddingTop:14,marginBottom:10}}>
            <div style={{fontSize:11,color:"#888",letterSpacing:"1px",marginBottom:8,fontWeight:700}}>KALEMLER</div>
            {lines.map((l, idx) => (
              <div key={idx} style={{background:"#0C0C0C",border:"1px solid #2A2A2A",borderRadius:8,padding:10,marginBottom:6}}>
                <div style={{display:"flex",gap:6,marginBottom:6}}>
                  <button onClick={()=>updateLine(idx, "isNew", false)} style={{flex:1,padding:"6px",background:!l.isNew?"#C8973E":"#222",color:!l.isNew?"#000":"#888",border:"none",borderRadius:6,fontSize:10,fontWeight:700,cursor:"pointer"}}>Mevcut</button>
                  <button onClick={()=>updateLine(idx, "isNew", true)} style={{flex:1,padding:"6px",background:l.isNew?"#C8973E":"#222",color:l.isNew?"#000":"#888",border:"none",borderRadius:6,fontSize:10,fontWeight:700,cursor:"pointer"}}>Yeni</button>
                </div>
                {l.isNew ? (
                  <div style={{display:"flex",gap:6,marginBottom:6}}>
                    <input value={l.newName||""} onChange={e=>updateLine(idx,"newName",e.target.value)} placeholder="Yeni hammadde adi" style={{...inputS, flex:2, padding:"8px"}}/>
                    <select value={l.newUnit||"ml"} onChange={e=>updateLine(idx,"newUnit",e.target.value)} style={{...inputS, flex:1, padding:"8px"}}>
                      {["ml","l","g","kg","adet","sise","kasa"].map(u=>(<option key={u}>{u}</option>))}
                    </select>
                  </div>
                ) : (
                  <select value={l.ingredient_id||""} onChange={e=>updateLine(idx,"ingredient_id",e.target.value)} style={{...inputS, marginBottom:6, padding:"8px"}}>
                    <option value="">- Hammadde sec -</option>
                    {ingredients.map(i => (<option key={i.id} value={i.id}>{i.name} ({i.unit})</option>))}
                  </select>
                )}
                <div style={{display:"flex",gap:6,alignItems:"center"}}>
                  <input type="number" step="0.01" value={l.qty||0} onChange={e=>updateLine(idx,"qty",e.target.value)} placeholder="Miktar" style={{...inputS, padding:"8px", flex:1}}/>
                  <span style={{color:"#888"}}>×</span>
                  <input type="number" step="0.01" value={l.unit_cost||0} onChange={e=>updateLine(idx,"unit_cost",e.target.value)} placeholder="Birim fiyat" style={{...inputS, padding:"8px", flex:1}}/>
                  <span style={{color:"#C8973E",fontWeight:700,fontSize:12,whiteSpace:"nowrap"}}>= ₺{(Number(l.qty)*Number(l.unit_cost)||0).toFixed(2)}</span>
                  <button onClick={()=>removeLine(idx)} style={{background:"transparent",color:"#FF6666",border:"1px solid #553333",borderRadius:6,padding:"6px 10px",cursor:"pointer",fontSize:11}}>Sil</button>
                </div>
              </div>
            ))}
            <button onClick={addLine} style={{width:"100%",padding:"10px",background:"transparent",color:"#C8973E",border:"1px dashed #C8973E",borderRadius:8,fontSize:12,fontWeight:700,cursor:"pointer"}}>+ Kalem Ekle</button>
          </div>

          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 14px",background:"rgba(200,151,62,0.1)",borderRadius:10,marginBottom:14}}>
            <div style={{fontSize:11,color:"#C8973E",letterSpacing:"1px",fontWeight:700}}>TOPLAM</div>
            <div style={{fontSize:18,color:"#F0EDE8",fontWeight:800}}>₺{Math.round(linesTotal).toLocaleString("tr-TR")}</div>
          </div>

          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>setModal(null)} style={cancelBtn}>Iptal</button>
            <button onClick={saveInvoice} disabled={busy} style={{...saveBtn,opacity:busy?0.6:1}}>{busy?"Yukleniyor...":"Faturayı Kaydet"}</button>
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
    <div onClick={e => e.stopPropagation()} style={{background:"#161616",border:"1px solid #2A2A2A",borderRadius:"16px 16px 0 0",padding:20,width:"100%",maxWidth:560,maxHeight:"95vh",overflowY:"auto"}}>
      <div style={{fontSize:18,fontWeight:800,color:"#F0EDE8",marginBottom:16}}>{title}</div>
      {children}
    </div>
  </div>);
}
