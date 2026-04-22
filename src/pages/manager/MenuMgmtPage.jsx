import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase.js";

const cv = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";

export default function MenuMgmtPage() {
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [selectedCat, setSelectedCat] = useState(null);
  const [loading, setLoading] = useState(true);

  const [catModal, setCatModal] = useState(null);
  const [catName, setCatName] = useState("");
  const [catIcon, setCatIcon] = useState("");
  const [catFrom, setCatFrom] = useState("");
  const [catUntil, setCatUntil] = useState("");
  const [catActive, setCatActive] = useState(true);

  const [prodModal, setProdModal] = useState(null);
  const [pName, setPName] = useState("");
  const [pDesc, setPDesc] = useState("");
  const [pPrice, setPPrice] = useState("");
  const [pDiscount, setPDiscount] = useState(0);
  const [pSoldOut, setPSoldOut] = useState(false);
  const [pReason, setPReason] = useState("");
  const [pParty, setPParty] = useState(false);
  const [pAvailable, setPAvailable] = useState(true);

  const load = async () => {
    setLoading(true);
    const [{data: cats}, {data: prods}] = await Promise.all([
      supabase.from("categories").select("*").order("sort_order"),
      supabase.from("products").select("*").order("sort_order"),
    ]);
    setCategories(cats || []);
    setProducts(prods || []);
    if (cats?.length && !selectedCat) setSelectedCat(cats[0].id);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openCatNew = () => {
    setCatModal({mode:"new"});
    setCatName(""); setCatIcon(""); setCatFrom(""); setCatUntil(""); setCatActive(true);
  };
  const openCatEdit = (c) => {
    setCatModal({mode:"edit", data:c});
    setCatName(c.name); setCatIcon(c.icon||"");
    setCatFrom(c.available_from?.substring(0,5) || "");
    setCatUntil(c.available_until?.substring(0,5) || "");
    setCatActive(c.is_active !== false);
  };
  const saveCat = async () => {
    const name = catName.trim();
    if (!name) { alert("Kategori adi gerekli"); return; }
    const payload = {
      name, icon: catIcon || null,
      available_from: catFrom || null,
      available_until: catUntil || null,
      is_active: catActive,
    };
    if (catModal.mode === "new") {
      const maxSort = Math.max(...categories.map(c => c.sort_order || 0), 0);
      payload.sort_order = maxSort + 10;
      const { error } = await supabase.from("categories").insert(payload);
      if (error) { alert("Hata: " + error.message); return; }
    } else {
      const { error } = await supabase.from("categories").update(payload).eq("id", catModal.data.id);
      if (error) { alert("Hata: " + error.message); return; }
    }
    setCatModal(null); load();
  };
  const deleteCat = async (c) => {
    const prodCount = products.filter(p => p.category_id === c.id).length;
    if (prodCount > 0) { alert("Once icindeki " + prodCount + " urunu silin/tasiyin"); return; }
    if (!confirm('"' + c.name + '" kategorisi silinsin mi?')) return;
    const { error } = await supabase.from("categories").delete().eq("id", c.id);
    if (error) { alert("Hata: " + error.message); return; }
    load();
  };

  const openProdNew = () => {
    if (!selectedCat) { alert("Once kategori secin"); return; }
    setProdModal({mode:"new"});
    setPName(""); setPDesc(""); setPPrice(""); setPDiscount(0);
    setPSoldOut(false); setPReason(""); setPParty(false); setPAvailable(true);
  };
  const openProdEdit = (p) => {
    setProdModal({mode:"edit", data:p});
    setPName(p.name); setPDesc(p.description||"");
    setPPrice(String(p.price));
    setPDiscount(Number(p.instant_discount_pct)||0);
    setPSoldOut(!!p.sold_out_today);
    setPReason(p.unavailable_reason||"");
    setPParty(!!p.show_in_party_menu);
    setPAvailable(p.is_available !== false);
  };
  const saveProd = async () => {
    const name = pName.trim();
    if (!name) { alert("Urun adi gerekli"); return; }
    const price = Number(pPrice);
    if (!price || price <= 0) { alert("Gecerli fiyat gir"); return; }
    const payload = {
      name, description: pDesc.trim() || null, price,
      category_id: prodModal.mode === "new" ? selectedCat : prodModal.data.category_id,
      is_available: pAvailable,
      sold_out_today: pSoldOut,
      unavailable_reason: pReason.trim() || null,
      instant_discount_pct: Number(pDiscount) || 0,
      show_in_party_menu: pParty,
    };
    if (prodModal.mode === "new") {
      const catProds = products.filter(x => x.category_id === selectedCat);
      const maxSort = Math.max(...catProds.map(x => x.sort_order || 0), 0);
      payload.sort_order = maxSort + 10;
      payload.is_out_of_stock = false;
      const { error } = await supabase.from("products").insert(payload);
      if (error) { alert("Hata: " + error.message); return; }
    } else {
      const { error } = await supabase.from("products").update(payload).eq("id", prodModal.data.id);
      if (error) { alert("Hata: " + error.message); return; }
    }
    setProdModal(null); load();
  };
  const deleteProd = async (p) => {
    if (!confirm('"' + p.name + '" silinsin mi?')) return;
    const { error } = await supabase.from("products").delete().eq("id", p.id);
    if (error) { alert("Hata: " + error.message); return; }
    load();
  };
  const toggleSoldOut = async (p) => {
    await supabase.from("products").update({ sold_out_today: !p.sold_out_today }).eq("id", p.id);
    load();
  };

  if (loading) return (<div style={{color:"#888",fontFamily:cv,padding:20}}>Yukleniyor...</div>);

  const visibleProds = products.filter(p => p.category_id === selectedCat);
  const sel = categories.find(c => c.id === selectedCat);

  return (
    <div style={{fontFamily:cv,color:"#F0EDE8"}}>
      <div style={{fontSize:24,fontWeight:800,marginBottom:4}}>Menu Yonetimi</div>
      <div style={{fontSize:11,color:"#888",letterSpacing:"1px",marginBottom:18}}>KATEGORILER, URUNLER, FIYATLAR</div>

      <div style={{display:"flex",gap:6,overflowX:"auto",marginBottom:10,paddingBottom:4}}>
        {categories.map(c => (
          <button key={c.id} onClick={() => setSelectedCat(c.id)} style={{flexShrink:0,padding:"8px 14px",border:"none",borderRadius:16,fontSize:12,fontWeight:700,letterSpacing:"0.5px",background:selectedCat===c.id?"#C8973E":"#222",color:selectedCat===c.id?"#000":(c.is_active===false?"#555":"#aaa"),cursor:"pointer",whiteSpace:"nowrap",opacity:c.is_active===false?0.5:1}}>
            {c.icon && <span style={{marginRight:4}}>{c.icon}</span>}{c.name?.toUpperCase()}
          </button>
        ))}
        <button onClick={openCatNew} style={{flexShrink:0,padding:"8px 14px",border:"1px dashed #C8973E",background:"transparent",color:"#C8973E",borderRadius:16,fontSize:12,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>+ Kategori</button>
      </div>

      {sel && (
        <div style={{display:"flex",gap:8,marginBottom:16}}>
          <button onClick={() => openCatEdit(sel)} style={{padding:"6px 10px",background:"#222",color:"#888",border:"1px solid #333",borderRadius:8,fontSize:11,cursor:"pointer"}}>Kategoriyi Duzenle</button>
          <button onClick={() => deleteCat(sel)} style={{padding:"6px 10px",background:"transparent",color:"#FF6666",border:"1px solid #553333",borderRadius:8,fontSize:11,cursor:"pointer"}}>Sil</button>
        </div>
      )}

      <div style={{marginBottom:12,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{fontSize:13,color:"#888",fontWeight:600}}>{visibleProds.length} urun</div>
        <button onClick={openProdNew} style={{padding:"10px 16px",background:"#C8973E",color:"#000",border:"none",borderRadius:10,fontSize:13,fontWeight:800,cursor:"pointer"}}>+ Yeni Urun</button>
      </div>

      <div>
        {visibleProds.map(p => (
          <div key={p.id} style={{background:"#1A1A1A",border:"1px solid "+(p.sold_out_today?"#552222":"#2A2A2A"),borderRadius:10,padding:12,marginBottom:8,opacity:p.is_available===false?0.4:1}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                  <div style={{fontSize:14,fontWeight:700,color:"#F0EDE8"}}>{p.name}</div>
                  {p.sold_out_today && <span style={{fontSize:9,padding:"2px 6px",background:"#552222",color:"#FFB0B0",borderRadius:6,letterSpacing:"1px",fontWeight:700}}>TUKENDI</span>}
                  {p.show_in_party_menu && <span style={{fontSize:9,padding:"2px 6px",background:"#4A2552",color:"#E0B0FF",borderRadius:6,letterSpacing:"1px",fontWeight:700}}>PARTI</span>}
                  {p.instant_discount_pct > 0 && <span style={{fontSize:9,padding:"2px 6px",background:"#223355",color:"#B0D0FF",borderRadius:6,letterSpacing:"1px",fontWeight:700}}>-%{p.instant_discount_pct}</span>}
                </div>
                {p.description && <div style={{fontSize:11,color:"#777",marginTop:3}}>{p.description}</div>}
                <div style={{fontSize:12,color:"#C8973E",marginTop:4,fontWeight:700}}>₺{p.price}</div>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:4,flexShrink:0}}>
                <button onClick={() => toggleSoldOut(p)} style={{padding:"4px 8px",background:p.sold_out_today?"#552222":"transparent",color:p.sold_out_today?"#FFB0B0":"#888",border:"1px solid "+(p.sold_out_today?"#552222":"#333"),borderRadius:6,fontSize:10,cursor:"pointer",fontWeight:700,whiteSpace:"nowrap"}}>{p.sold_out_today ? "✓ TUKENDI" : "Tukendi"}</button>
                <button onClick={() => openProdEdit(p)} style={{padding:"4px 8px",background:"#222",color:"#aaa",border:"1px solid #333",borderRadius:6,fontSize:10,cursor:"pointer"}}>Duzenle</button>
                <button onClick={() => deleteProd(p)} style={{padding:"4px 8px",background:"transparent",color:"#FF6666",border:"1px solid #553333",borderRadius:6,fontSize:10,cursor:"pointer"}}>Sil</button>
              </div>
            </div>
          </div>
        ))}
        {visibleProds.length === 0 && <div style={{textAlign:"center",padding:40,color:"#666",fontSize:12}}>Bu kategoride urun yok</div>}
      </div>

      {catModal && (
        <Modal onClose={() => setCatModal(null)} title={catModal.mode==="new"?"Yeni Kategori":"Kategoriyi Duzenle"}>
          <Field label="AD"><input value={catName} onChange={e=>setCatName(e.target.value)} style={inputS}/></Field>
          <Field label="IKON (emoji)"><input value={catIcon} onChange={e=>setCatIcon(e.target.value)} placeholder="emoji" style={inputS}/></Field>
          <div style={{display:"flex",gap:8}}>
            <Field label="BASLANGIC SAATI" style={{flex:1}}><input type="time" value={catFrom} onChange={e=>setCatFrom(e.target.value)} style={inputS}/></Field>
            <Field label="BITIS SAATI" style={{flex:1}}><input type="time" value={catUntil} onChange={e=>setCatUntil(e.target.value)} style={inputS}/></Field>
          </div>
          <Toggle checked={catActive} onChange={setCatActive} label="Aktif"/>
          <ModalFooter onCancel={() => setCatModal(null)} onSave={saveCat}/>
        </Modal>
      )}

      {prodModal && (
        <Modal onClose={() => setProdModal(null)} title={prodModal.mode==="new"?"Yeni Urun":"Urunu Duzenle"}>
          <Field label="AD"><input value={pName} onChange={e=>setPName(e.target.value)} style={inputS}/></Field>
          <Field label="ACIKLAMA"><input value={pDesc} onChange={e=>setPDesc(e.target.value)} style={inputS}/></Field>
          <Field label="FIYAT"><input type="number" value={pPrice} onChange={e=>setPPrice(e.target.value)} style={inputS}/></Field>
          <Field label="ANLIK INDIRIM (%)"><input type="number" min="0" max="100" value={pDiscount} onChange={e=>setPDiscount(e.target.value)} style={inputS}/></Field>
          <Toggle checked={pSoldOut} onChange={setPSoldOut} label="Bugun tukendi"/>
          {pSoldOut && <Field label="NEDEN (musteri gorecek)"><input value={pReason} onChange={e=>setPReason(e.target.value)} placeholder="orn: Mutfak kapali" style={inputS}/></Field>}
          <Toggle checked={pParty} onChange={setPParty} label="Sadece parti menusunde"/>
          <Toggle checked={pAvailable} onChange={setPAvailable} label="Menude aktif"/>
          <ModalFooter onCancel={() => setProdModal(null)} onSave={saveProd}/>
        </Modal>
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

function Toggle({checked, onChange, label}) {
  return (<label style={{display:"flex",alignItems:"center",gap:10,marginBottom:12,cursor:"pointer",userSelect:"none"}}>
    <div style={{position:"relative",width:42,height:24,borderRadius:12,background:checked?"#C8973E":"#333",transition:"0.2s"}}>
      <div style={{position:"absolute",top:3,left:checked?21:3,width:18,height:18,borderRadius:"50%",background:"#fff",transition:"0.2s"}}/>
    </div>
    <input type="checkbox" checked={checked} onChange={e=>onChange(e.target.checked)} style={{display:"none"}}/>
    <span style={{fontSize:13,color:"#F0EDE8"}}>{label}</span>
  </label>);
}

function Modal({title, children, onClose}) {
  return (<div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:100,padding:0}}>
    <div onClick={e => e.stopPropagation()} style={{background:"#161616",border:"1px solid #2A2A2A",borderRadius:"16px 16px 0 0",padding:20,width:"100%",maxWidth:500,maxHeight:"90vh",overflowY:"auto"}}>
      <div style={{fontSize:18,fontWeight:800,color:"#F0EDE8",marginBottom:16}}>{title}</div>
      {children}
    </div>
  </div>);
}

function ModalFooter({onCancel, onSave}) {
  return (<div style={{display:"flex",gap:8,marginTop:10}}>
    <button onClick={onCancel} style={{flex:1,padding:"12px",background:"transparent",color:"#888",border:"1px solid #333",borderRadius:10,fontSize:14,fontWeight:700,cursor:"pointer"}}>Iptal</button>
    <button onClick={onSave} style={{flex:2,padding:"12px",background:"#C8973E",color:"#000",border:"none",borderRadius:10,fontSize:14,fontWeight:800,cursor:"pointer"}}>Kaydet</button>
  </div>);
}
