import { useEffect, useState } from "react";
import { parseUblInvoice } from "../../lib/ublInvoice.js";
import { supabase } from "../../lib/supabase.js";
import { useAuth } from "../../contexts/AuthContext.jsx";
import Ikon from "../../components/Ikon.jsx";

const cv = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";

// Bir hammadde birim maliyeti onceki alima gore bu yuzdeden fazla artarsa
// "anormal fiyat" uyarisi verilir (sahip icin kacak/israf kontrolu).
const PRICE_ALERT_PCT = 10;

// Sise/paket icerigi: hammadde birimi cinsinden (70cl sise + ml birim = 700)
const contentDefault = (ing, unit) => {
  const ml = Number(ing?.unit_volume_ml) || 0;
  if (!ml) return 1;
  if (unit === "ml") return ml;
  if (unit === "cl") return ml / 10;
  if (unit === "l") return ml / 1000;
  return 1;
};

const blankLine = (unit) => ({ ingredient_id:"", qty:0, unit_cost:0, isNew:false, newName:"", newUnit:unit||"ml",
  buy_mode:"adet", pack_qty:1, content:1, vat_pct:0 });

// Sik kullanilan ambalaj hacimleri — elle yazarken 30L/50L karismasin diye.
// Deger, hammaddenin KENDI biriminde: ml icin 30L = 30000.
const VOLUME_PRESETS = {
  ml: [["33cl",330],["50cl",500],["70cl",700],["1L",1000],["30L fıçı",30000],["50L fıçı",50000]],
  cl: [["33cl",33],["50cl",50],["70cl",70],["1L",100],["30L fıçı",3000],["50L fıçı",5000]],
  l:  [["33cl",0.33],["50cl",0.5],["70cl",0.7],["1L",1],["30L fıçı",30],["50L fıçı",50]],
};

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
  const [xmlInfo, setXmlInfo] = useState(null); // e-Fatura XML ozeti
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
    setLines([blankLine("ml")]); setXmlInfo(null);
    setPhotoFile(null); setPhotoPreview(null);
  };

  // Faturasiz stok girisi: eldeki mevcut urunleri sayip sisteme eklemek icin.
  // Ayni kayit akisini kullanir; birim maliyet 0 birakilirsa mevcut maliyet KORUNUR.
  const openManualStock = () => {
    setModal({mode:"manual"});
    setForm({supplier_name:"Manuel stok girişi", invoice_date: new Date().toISOString().slice(0,10), total_amount:0, notes:"Eldeki stok sayımı"});
    setLines([blankLine("adet")]);
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

  const UNITS = ["ml","cl","l","g","kg","adet","şişe","porsiyon"];

  // e-Fatura XML: kalemler dosyada yazili — OCR'a gerek yok, tahmin payi sifir
  const onXml = async (e) => {
    const file = (e.target.files || [])[0];
    if (!file) return;
    try {
      const parsed = parseUblInvoice(await file.text());
      if (!parsed.lines.length) { alert("XML'de fatura kalemi bulunamadi"); return; }
      setForm(f => ({
        ...f,
        supplier_name: parsed.supplier_name || f.supplier_name,
        invoice_date: parsed.invoice_date || f.invoice_date,
        invoice_no: parsed.invoice_no || f.invoice_no,
      }));
      const newLines = parsed.lines.map(l => {
        const match = matchIngredient(l.name);
        const unit = match?.unit || (UNITS.includes(l.unit) ? l.unit : "adet");
        const base = {
          qty: l.qty, unit_cost: l.unit_cost, buy_mode: "adet",
          pack_qty: Math.max(1, Number(match?.pack_qty) || 1),
          content: match ? contentDefault(match, unit) : 1,
          vat_pct: l.vat_pct, discount_pct: l.discount_pct, list_unit_cost: l.list_unit_cost,
        };
        return match
          ? { ...base, ingredient_id: match.id, isNew: false, newName: "", newUnit: unit }
          : { ...base, ingredient_id: "", isNew: true, newName: l.name, newUnit: unit };
      });
      setLines(newLines);
      const matched = newLines.filter(l => !l.isNew).length;
      const toplam = parsed.lines.reduce((s2, l) => s2 + l.qty * l.unit_cost, 0);
      setXmlInfo({
        no: parsed.invoice_no, adet: newLines.length, eslesen: matched,
        beyan: parsed.grand_total, hesap: Math.round(toplam * 100) / 100,
        currency: parsed.currency,
      });
    } catch (err) {
      alert("XML okunamadi: " + (err?.message || err));
    }
  };
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
        const unit = match?.unit || (UNITS.includes(l.unit) ? l.unit : "adet");
        // Sise hacmi: OCR cl verir; hammadde birimine cevrilir (ml/cl/l)
        const cl = Number(l.content_cl) || 0;
        const content = cl > 0
          ? (unit === "ml" ? cl * 10 : unit === "cl" ? cl : unit === "l" ? cl / 100 : 1)
          : (match ? contentDefault(match, unit) : 1);
        const base = {
          qty: Number(l.qty) || 0,
          unit_cost: Number(l.unit_cost) || 0,
          buy_mode: l.pack_type === "koli" ? "koli" : "adet",
          pack_qty: Math.max(1, Number(l.pack_qty) || Number(match?.pack_qty) || 1),
          content,
          vat_pct: Number(l.vat_pct) || 0,
          // Sadece gosterim: iskonto atlandiginda fark etmek icin
          discount_pct: Number(l.discount_pct) || 0,
          list_unit_cost: Number(l.list_unit_cost) || 0,
        };
        return match
          ? { ...base, ingredient_id: match.id, isNew: false, newName: "", newUnit: unit }
          : { ...base, ingredient_id: "", isNew: true, newName: l.name, newUnit: unit };
      });
      if (newLines.length) {
        setLines(newLines);
        const matched = newLines.filter(l => !l.isNew).length;
        alert(newLines.length + " kalem okundu (" + matched + " mevcut hammaddeyle eslesti). Kontrol edip kaydet.");
      } else {
        alert("Faturada kalem okunamadi — fotografi daha net cekip tekrar dene.");
      }
    } catch (e) {
      alert("AI okuma hatasi: " + (e?.message || e));
    }
    setOcrBusy(false);
  };

  const addLine = () => setLines([...lines, blankLine("ml")]);
  const removeLine = (idx) => setLines(lines.filter((_,i) => i !== idx));
  const updateLine = (idx, field, val) => setLines(lines.map((l,i) => {
    if (i !== idx) return l;
    const next = {...l, [field]: val};
    // Hammadde secilince ambalaj bilgisi (koli ici adet, sise icerigi) otomatik gelsin
    if (field === "ingredient_id") {
      const ing = ingredients.find(x => x.id === val);
      if (ing) {
        next.pack_qty = Number(ing.pack_qty) || 1;
        next.content = contentDefault(ing, ing.unit);
        if (Number(ing.pack_qty) > 1) next.buy_mode = "koli";
      }
    }
    return next;
  }));

  // Bir kalemin stok/maliyet hesabi: koli -> sise -> icerik -> fire
  const lineCalc = (l) => {
    const ing = ingredients.find(i => i.id === l.ingredient_id);
    const unit = l.isNew ? (l.newUnit || "adet") : (ing?.unit || "adet");
    const packQty = l.buy_mode === "koli" ? Math.max(1, Number(l.pack_qty) || 1) : 1;
    const units = (Number(l.qty) || 0) * packQty;              // toplam sise / fici / adet
    const content = Math.max(0, Number(l.content) || 1);       // bir sisenin icerigi (hammadde birimi)
    const gross = units * content;                             // ham miktar
    const waste = (Number(ing?.waste_per_pack) || 0) * units;  // ambalaj basi fire (fici: 5 bardak)
    const usable = Math.max(gross - waste, 0);                 // stoga eklenecek net miktar
    const total = (Number(l.qty) || 0) * (Number(l.unit_cost) || 0);
    const costPerUnit = usable > 0 ? total / usable : 0;
    return { ing, unit, packQty, units, content, gross, waste, usable, total, costPerUnit };
  };

  const linesTotal = lines.reduce((s,l) => s + Number(l.qty||0) * Number(l.unit_cost||0), 0);

  const saveInvoice = async () => {
    if (busy) return;
    if (!form.supplier_name?.trim()) { alert("Tedarikci adi gerekli"); return; }
    if (lines.length === 0) { alert("En az bir kalem ekle"); return; }

    // MUKERRER FATURA KONTROLU. Ayni fatura iki kez girilince hem gider iki kez
    // sayiliyor hem de stok sisiyor; bir kez yasandi (ERBAK, 8 ve 17 Agustos).
    // Engellemiyoruz, soruyoruz — bazen ayni numara elle duzeltilerek girilir.
    const faturaNo = form.invoice_no?.trim() || "";
    if (faturaNo) {
      const { data: ayni } = await supabase.from("supplier_invoices")
        .select("supplier_name, invoice_date, total_amount")
        .eq("store_id", staffUser?.store_ids?.[0]).eq("invoice_no", faturaNo).limit(1);
      const v = ayni?.[0];
      if (v && !confirm(
        `"${faturaNo}" numarali fatura zaten kayitli:\n` +
        `${v.supplier_name} · ${v.invoice_date} · ₺${Math.round(Number(v.total_amount) || 0).toLocaleString("tr-TR")}\n\n` +
        `Yine de kaydedilsin mi? (Gider ve stok iki kez sayilir.)`
      )) return;
    }

    setBusy(true);

    // Fatura fotografi SAKLANMAZ — yalnizca AI okuma icin kullanilir (depolama sismesin)
    const { data: inv, error: invErr } = await supabase.from("supplier_invoices").insert({
      supplier_name: form.supplier_name.trim(),
      invoice_date: form.invoice_date,
      invoice_no: faturaNo || null,
      total_amount: linesTotal,
      notes: form.notes?.trim() || null,
      store_id: staffUser?.store_ids?.[0],
    }).select().single();
    if (invErr) { alert("Hata: " + invErr.message); setBusy(false); return; }

    // Create new ingredients if needed and insert items + bump stock
    const anomalies = [];
    // Ayni faturada ayni yeni hammadde iki satirda gecerse tek kayit acilsin
    const createdThisRun = {};
    const runningStock = {};   // ingredient_id -> bu fatura sonundaki stok
    const costAcc = {};        // ingredient_id -> {cost, qty} agirlikli ortalama icin
    for (const l of lines) {
      let ingId = l.ingredient_id;
      if (l.isNew) {
        const nm = l.newName?.trim();
        if (!nm) continue;
        const key = nm.toLocaleLowerCase("tr");
        if (createdThisRun[key]) {
          ingId = createdThisRun[key];
        } else {
          // Ayni isimde hammadde zaten varsa YENIDEN OLUSTURMA — mukerrer kayit olurdu
          const existing = ingredients.find(i => i.name?.trim().toLocaleLowerCase("tr") === key);
          if (existing) {
            ingId = existing.id;
          } else {
            const { data: newIng, error: e } = await supabase.from("ingredients").insert({
              store_id: staffUser?.store_ids?.[0],
              name: nm, unit: l.newUnit, stock_qty: 0, cost_per_unit: 0,
            }).select().single();
            if (e) { alert("Ingredient hatasi: " + e.message); continue; }
            ingId = newIng.id;
          }
          createdThisRun[key] = ingId;
        }
      }
      if (!ingId) continue;
      const calc = lineCalc(l.isNew ? { ...l, ingredient_id: ingId } : l);
      const qty = calc.usable || Number(l.qty)||0;          // stoga eklenecek NET miktar (fire dusulmus)
      const unitCost = calc.costPerUnit || Number(l.unit_cost)||0;  // gercek birim maliyet
      await supabase.from("supplier_invoice_items").insert({
        invoice_id: inv.id, store_id: inv.store_id, ingredient_id: ingId, qty, unit_cost: unitCost, total_cost: calc.total,
      });
      // Ambalaj bilgisini hammaddeye ogret (bir sonraki faturada hazir gelsin)
      if (!l.isNew && (Number(l.pack_qty) > 1 || Number(l.content) > 1)) {
        const patch = {};
        if (Number(l.pack_qty) > 1) patch.pack_qty = Number(l.pack_qty);
        if (Number(l.content) > 1 && ["ml","cl","l"].includes(calc.unit)) {
          patch.unit_volume_ml = calc.unit === "ml" ? Number(l.content) : calc.unit === "cl" ? Number(l.content)*10 : Number(l.content)*1000;
        }
        if (Object.keys(patch).length) await supabase.from("ingredients").update(patch).eq("id", ingId);
      }
      // Increment stock + update cost (+ anormal fiyat artisi tespiti)
      const ing = ingredients.find(i => i.id === ingId);
      // Ayni hammadde bu faturada birden fazla satirda geciyorsa stok BIRIKMELI;
      // yoksa ikinci satir birincinin eklemesini ezerdi.
      const currentStock = runningStock[ingId] != null ? runningStock[ingId] : (Number(ing?.stock_qty)||0);
      const prevCost = Number(ing?.cost_per_unit)||0;
      const isManual = modal?.mode === "manual";
      if (!isManual && !l.isNew && prevCost > 0 && unitCost > prevCost) {
        const pct = ((unitCost - prevCost) / prevCost) * 100;
        if (pct >= PRICE_ALERT_PCT) anomalies.push({ name: ing?.name || "?", unit: ing?.unit || "", prev: prevCost, now: unitCost, pct });
      }
      runningStock[ingId] = currentStock + qty;
      // Ayni hammadde birden fazla satirda geciyorsa maliyet AGIRLIKLI ORTALAMA
      // olmali. Aksi halde son satir kazanir; bedelsiz (%100 iskontolu) bir satir
      // varsa maliyet sifira duser ve urun bedavaya mal olmus gibi gorunurdu.
      const acc = costAcc[ingId] || { cost: 0, qty: 0 };
      acc.cost += unitCost * qty;
      acc.qty += qty;
      costAcc[ingId] = acc;
      const avgCost = acc.qty > 0 ? acc.cost / acc.qty : 0;

      await supabase.from("ingredients").update({
        stock_qty: runningStock[ingId],
        // Maliyet 0 girildiyse mevcut maliyet korunur (manuel sayimda fiyat zorunlu degil)
        cost_per_unit: avgCost > 0 ? avgCost : prevCost,
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
      ? "Fatura kaydedildi. " + anomalies.length + " üründe anormal fiyat artışı (%" + PRICE_ALERT_PCT + "+) — sahibe Telegram uyarısı gönderildi."
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

      <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
        <button onClick={openNew} style={{padding:"10px 16px",background:"#FFFFFF",color:"#000",border:"none",borderRadius:10,fontSize:13,fontWeight:800,cursor:"pointer"}}>+ Yeni Fatura</button>
        <button onClick={openManualStock} style={{padding:"10px 16px",background:"transparent",color:"#FFFFFF",border:"1px solid #FFFFFF",borderRadius:10,fontSize:13,fontWeight:800,cursor:"pointer",display:"inline-flex",alignItems:"center",gap:7}}><Ikon ad="stok" boy={15}/>Manuel Stok Girişi</button>
      </div>

      {priceAlerts.length > 0 && (
        <div style={{background:"#161616",border:"1px solid #2A2A2A",borderRadius:10,padding:12,marginBottom:12}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
            <div style={{fontSize:13,fontWeight:800,color:"#C87A6A"}}><Ikon ad="uyari" boy={13} style={{marginRight:5}}/>Anormal fiyat artışı (%{PRICE_ALERT_PCT}+)</div>
            <button onClick={()=>setPriceAlerts([])} style={{background:"transparent",border:"none",color:"#C87A6A",fontSize:18,cursor:"pointer",lineHeight:1}}>×</button>
          </div>
          {priceAlerts.map((a,i)=>(
            <div key={i} style={{fontSize:12,color:"#C87A6A",padding:"3px 0"}}>
              <b>{a.name}</b>: ₺{a.prev.toFixed(2)} → <b style={{color:"#C87A6A"}}>₺{a.now.toFixed(2)}</b>{a.unit ? " /"+a.unit : ""} <span style={{color:"#C87A6A",fontWeight:700}}>(+%{a.pct.toFixed(0)})</span>
            </div>
          ))}
          <div style={{fontSize:11,color:"#C87A6A",marginTop:6}}>Bu artışlar kaydedildi ve sahibe Telegram'dan iletildi.</div>
        </div>
      )}

      {invoices.length === 0 && <div style={{textAlign:"center",padding:40,color:"#888888",fontSize:13}}>Henüz fatura yok</div>}

      {invoices.map(inv => (
        <div key={inv.id} style={{background:"#1A1A1A",border:"1px solid #2A2A2A",borderRadius:10,padding:12,marginBottom:8}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10}}>
            <div style={{flex:1}}>
              <div style={{fontSize:14,fontWeight:700,color:"#F0EDE8"}}>{inv.supplier_name}</div>
              <div style={{fontSize:11,color:"#888",marginTop:2}}>
                {new Date(inv.invoice_date).toLocaleDateString("tr-TR")} · {inv.supplier_invoice_items?.length || 0} kalem
                {inv.invoice_no ? " · No " + inv.invoice_no : ""}
              </div>
              {inv.supplier_invoice_items?.length > 0 && (
                <div style={{fontSize:11,color:"#888888",marginTop:4}}>
                  {inv.supplier_invoice_items.map(it => (it.ingredients?.name || "?") + " " + it.qty + (it.ingredients?.unit||"")).join(" · ")}
                </div>
              )}
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:14,fontWeight:800,color:"#FFFFFF"}}>₺{Math.round(Number(inv.total_amount)||0).toLocaleString("tr-TR")}</div>
              <button onClick={()=>del(inv)} style={{marginTop:6,padding:"3px 8px",background:"transparent",color:"#C87A6A",border:"1px solid #2A2A2A",borderRadius:6,fontSize:9,cursor:"pointer"}}>Sil</button>
            </div>
          </div>
        </div>
      ))}

      {modal && (
        <Modal onClose={()=>setModal(null)} title={modal.mode === "manual" ? "Manuel Stok Girişi" : "Yeni Fatura"}>
          <Field label="TEDARIKCI"><input value={form.supplier_name||""} onChange={e=>setForm({...form,supplier_name:e.target.value})} placeholder="orn: Anadolu Efes" style={inputS}/></Field>
          <div style={{display:"flex",gap:8}}>
            <Field label="TARIH"><input type="date" value={form.invoice_date||""} onChange={e=>setForm({...form,invoice_date:e.target.value})} style={inputS}/></Field>
            {modal.mode !== "manual" && (
              <Field label="FATURA NO"><input value={form.invoice_no||""} onChange={e=>setForm({...form,invoice_no:e.target.value})} placeholder="XML'den gelir" style={inputS}/></Field>
            )}
          </div>

          {modal.mode !== "manual" && (
          <div style={{marginBottom:10,background:"rgba(62,207,142,0.07)",border:"1px dashed #FFFFFF",borderRadius:10,padding:12}}>
            <div style={{fontSize:12,color:"#8A8580",letterSpacing:"0.2px",fontWeight:600,marginBottom:5,display:"flex",alignItems:"center",gap:6}}><Ikon ad="belge" boy={13}/>E-FATURA XML YÜKLE (ÖNERİLEN)</div>
            <input type="file" accept=".xml,text/xml,application/xml" onChange={onXml} style={{...inputS, padding:"8px"}}/>
            {xmlInfo && (
              <div style={{marginTop:8,fontSize:11,color:"#F0EDE8",lineHeight:1.6}}>
                <Ikon ad="onay" boy={13} style={{marginRight:5}}/>{xmlInfo.adet} kalem okundu ({xmlInfo.eslesen} mevcut hammaddeyle eşleşti)
                {xmlInfo.no ? " · Fatura no " + xmlInfo.no : ""}
                <br/>Kalem toplamı ₺{xmlInfo.hesap} · faturada yazan ₺{xmlInfo.beyan}
                {xmlInfo.beyan > 0 && Math.abs(xmlInfo.hesap - xmlInfo.beyan) > Math.max(2, xmlInfo.beyan * 0.02)
                  ? <span style={{color:"#8A8580"}}> — fark var, kalemleri kontrol et</span>
                  : <span style={{color:"#FFFFFF"}}> <Ikon ad="onay" boy={12}/> tutuyor</span>}
                {xmlInfo.currency && xmlInfo.currency !== "TRY" ? <span style={{color:"#8A8580"}}><br/><Ikon ad="uyari" boy={12} style={{marginRight:4}}/>Fatura {xmlInfo.currency} — tutarlar TL değil</span> : null}
              </div>
            )}
            <div style={{fontSize:10,color:"#888",marginTop:6,lineHeight:1.5}}>
              TÜRMOB Luca e-Belge portalından faturanın XML'ini indir, buraya yükle. Miktar, iskonto ve KDV dosyada yazılı olduğu için tahmin payı yok.
            </div>
          </div>
          )}

          {modal.mode !== "manual" && (
          <div style={{marginBottom:14,background:"rgba(255,255,255,0.06)",border:"1px dashed #FFFFFF",borderRadius:10,padding:12}}>
            <div style={{fontSize:12,color:"#8A8580",letterSpacing:"0.2px",fontWeight:600,marginBottom:5,display:"flex",alignItems:"center",gap:6}}><Ikon ad="parlak" boy={13}/>FATURA FOTOSUNDAN OTOMATIK DOLDUR</div>
            <input type="file" accept="image/*" capture="environment" onChange={onPhoto} style={{...inputS, padding:"8px"}}/>
            {photoPreview && <img src={photoPreview} alt="" style={{marginTop:8,maxHeight:120,borderRadius:8,objectFit:"cover"}}/>}
            {photoFile && (
              <button onClick={runOcr} disabled={ocrBusy} style={{width:"100%",marginTop:8,padding:"10px",background:ocrBusy?"#555":"#FFFFFF",color:"#000",border:"none",borderRadius:8,fontSize:13,fontWeight:800,cursor:ocrBusy?"wait":"pointer"}}>
                {ocrBusy ? "AI okuyor... (10-30 sn)" : <><Ikon ad="parlak" boy={14} style={{marginRight:6}}/>Fotograftan doldur (AI)</>}
              </button>
            )}
            <div style={{fontSize:10,color:"#888",marginTop:6}}>Fotograf saklanmaz. Birim fiyatlar KDV DAHIL hesaplanir (satirdaki KDV orani uygulanir). Okunan kalemleri kontrol edip kaydet.</div>
          </div>
          )}
          {modal.mode === "manual" && (
            <div style={{marginBottom:14,background:"rgba(111,179,192,0.08)",border:"1px dashed #8A8580",borderRadius:10,padding:10,fontSize:11,color:"#F0EDE8",lineHeight:1.5}}>
              <Ikon ad="stok" boy={13} style={{marginRight:5}}/>Eldeki mevcut stogu sayip giriyorsun — fatura gerekmez. Birim maliyeti bos (0) birakirsan urunun mevcut maliyeti korunur; biliyorsan girmen maliyet hesaplarini iyilestirir.
            </div>
          )}

          <div style={{borderTop:"1px solid #2A2A2A",paddingTop:14,marginBottom:10}}>
            <div style={{fontSize:11,color:"#888",letterSpacing:"1px",marginBottom:8,fontWeight:700}}>Kalemler</div>
            {lines.map((l, idx) => (
              <div key={idx} style={{background:"#0C0C0C",border:"1px solid #2A2A2A",borderRadius:8,padding:10,marginBottom:6}}>
                <div style={{display:"flex",gap:6,marginBottom:6}}>
                  <button onClick={()=>updateLine(idx, "isNew", false)} style={{flex:1,padding:"6px",background:!l.isNew?"#FFFFFF":"#222",color:!l.isNew?"#000":"#888",border:"none",borderRadius:6,fontSize:10,fontWeight:700,cursor:"pointer"}}>Mevcut</button>
                  <button onClick={()=>updateLine(idx, "isNew", true)} style={{flex:1,padding:"6px",background:l.isNew?"#FFFFFF":"#222",color:l.isNew?"#000":"#888",border:"none",borderRadius:6,fontSize:10,fontWeight:700,cursor:"pointer"}}>Yeni</button>
                </div>
                {l.isNew ? (
                  <div style={{display:"flex",gap:6,marginBottom:6}}>
                    <input value={l.newName||""} onChange={e=>updateLine(idx,"newName",e.target.value)} placeholder="Yeni hammadde adi" style={{...inputS, flex:2, padding:"8px"}}/>
                    <select value={l.newUnit||"ml"} onChange={e=>updateLine(idx,"newUnit",e.target.value)} style={{...inputS, flex:1, padding:"8px"}}>
                      {UNITS.map(u=>(<option key={u}>{u}</option>))}
                    </select>
                  </div>
                ) : (
                  <select value={l.ingredient_id||""} onChange={e=>updateLine(idx,"ingredient_id",e.target.value)} style={{...inputS, marginBottom:6, padding:"8px"}}>
                    <option value="">- Hammadde sec -</option>
                    {ingredients.map(i => (<option key={i.id} value={i.id}>{i.name} ({i.unit})</option>))}
                  </select>
                )}
                {(() => {
                  const c = lineCalc(l);
                  const koli = l.buy_mode === "koli";
                  return (<>
                    <div style={{display:"flex",gap:6,marginBottom:6}}>
                      <button onClick={()=>updateLine(idx,"buy_mode","adet")} style={{flex:1,padding:"8px",background:!koli?"#2A2A2A":"#161616",color:!koli?"#F0EDE8":"#777",border:"1px solid "+(!koli?"#555":"#2A2A2A"),borderRadius:8,fontSize:11,fontWeight:700,cursor:"pointer"}}>Şişe / Adet geldi</button>
                      <button onClick={()=>updateLine(idx,"buy_mode","koli")} style={{flex:1,padding:"8px",background:koli?"#2A2A2A":"#161616",color:koli?"#F0EDE8":"#777",border:"1px solid "+(koli?"#555":"#2A2A2A"),borderRadius:8,fontSize:11,fontWeight:700,cursor:"pointer"}}>Koli geldi</button>
                    </div>
                    <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                      <label style={{flex:"1 1 90px"}}>
                        <div style={{fontSize:9,color:"#888888",fontWeight:700,marginBottom:3}}>{koli ? "KAÇ KOLİ" : "KAÇ ADET"}</div>
                        <input type="number" step="0.01" value={l.qty||0} onChange={e=>updateLine(idx,"qty",e.target.value)} style={{...inputS, padding:"8px"}}/>
                      </label>
                      {koli && (
                        <label style={{flex:"1 1 90px"}}>
                          <div style={{fontSize:9,color:"#888888",fontWeight:700,marginBottom:3}}>Koli içi şişe</div>
                          <input type="number" step="1" value={l.pack_qty||1} onChange={e=>updateLine(idx,"pack_qty",e.target.value)} style={{...inputS, padding:"8px"}}/>
                        </label>
                      )}
                      <label style={{flex:"1 1 100px"}}>
                        <div style={{fontSize:9,color:"#888888",fontWeight:700,marginBottom:3}}>ŞİŞE / FIÇI İÇERİĞİ ({c.unit})</div>
                        <input type="number" step="0.01" value={l.content||1} onChange={e=>updateLine(idx,"content",e.target.value)} placeholder={c.unit==="ml"?"70cl = 700":"1"} style={{...inputS, padding:"8px"}}/>
                      </label>
                      <label style={{flex:"1 1 110px"}}>
                        <div style={{fontSize:9,color:"#888888",fontWeight:700,marginBottom:3}}>{koli ? "KOLİ FİYATI ₺" : "ADET FİYATI ₺"} (KDV dahil)</div>
                        <input type="number" step="0.01" value={l.unit_cost||0} onChange={e=>updateLine(idx,"unit_cost",e.target.value)} style={{...inputS, padding:"8px"}}/>
                      </label>
                      <button onClick={()=>removeLine(idx)} style={{background:"transparent",color:"#C87A6A",border:"1px solid #2A2A2A",borderRadius:6,padding:"8px 10px",cursor:"pointer",fontSize:11,alignSelf:"flex-end"}}>Sil</button>
                    </div>
                    {VOLUME_PRESETS[c.unit] && (
                      <div style={{display:"flex",gap:5,marginTop:6,flexWrap:"wrap",alignItems:"center"}}>
                        <span style={{fontSize:12,color:"#888888",fontWeight:600,letterSpacing:"0.2px"}}>HIZLI:</span>
                        {VOLUME_PRESETS[c.unit].map(([label, val]) => (
                          <button key={label} onClick={()=>updateLine(idx,"content",val)}
                            style={{padding:"5px 9px",background:Number(l.content)===val?"#FFFFFF":"#161616",color:Number(l.content)===val?"#000":"#999",
                                    border:"1px solid "+(Number(l.content)===val?"#FFFFFF":"#2A2A2A"),borderRadius:6,fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                            {label}
                          </button>
                        ))}
                      </div>
                    )}
                    {c.units > 0 && (
                      <div style={{marginTop:8,padding:"8px 10px",background:"#12181A",border:"1px solid #2A2A2A",borderRadius:8,fontSize:11,color:"#F0EDE8",lineHeight:1.6}}>
                        <b style={{color:"#F0EDE8"}}>{c.units}</b> {c.unit === "adet" ? "adet" : "şişe/fıçı"}
                        {c.content > 1 && <> × {c.content} {c.unit} = <b style={{color:"#F0EDE8"}}>{c.gross.toLocaleString("tr-TR")} {c.unit}</b></>}
                        {c.waste > 0 && <> · fire −{c.waste.toLocaleString("tr-TR")} {c.unit}</>}
                        <br/>
                        Stoğa eklenecek: <b style={{color:"#F0EDE8"}}>{c.usable.toLocaleString("tr-TR")} {c.unit}</b>
                        {" · "}Birim maliyet: <b style={{color:"#FFFFFF"}}>₺{c.costPerUnit.toFixed(4)}/{c.unit}</b>
                        {" · "}Toplam: <b style={{color:"#FFFFFF"}}>₺{c.total.toFixed(2)}</b>
                        {Number(l.discount_pct) > 0 && (
                          <><br/><span style={{color:"#F0EDE8"}}>
                            İskonto %{Number(l.discount_pct)} düşülmüş
                            {Number(l.list_unit_cost) > 0 && <> — liste ₺{Number(l.list_unit_cost)}, ödenen ₺{Number(l.unit_cost)}</>}
                            {Number(l.discount_pct) >= 100 && <b style={{color:"#FFFFFF"}}> · BEDELSİZ</b>}
                          </span></>
                        )}
                      </div>
                    )}
                  </>);
                })()}
              </div>
            ))}
            <button onClick={addLine} style={{width:"100%",padding:"10px",background:"transparent",color:"#FFFFFF",border:"1px dashed #FFFFFF",borderRadius:8,fontSize:12,fontWeight:700,cursor:"pointer"}}>+ Kalem Ekle</button>
          </div>

          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 14px",background:"rgba(255,255,255,0.1)",borderRadius:10,marginBottom:14}}>
            <div style={{fontSize:11,color:"#8A8580",letterSpacing:"1px",fontWeight:700}}>Toplam</div>
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
const saveBtn = {flex:2,padding:"12px",background:"#FFFFFF",color:"#000",border:"none",borderRadius:10,fontSize:14,fontWeight:800,cursor:"pointer"};

function Field({label, children}) {
  return (<div style={{marginBottom:12}}>
    <div style={{fontSize:12,color:"#888",letterSpacing:"0.2px",fontWeight:600,marginBottom:5}}>{label}</div>
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
