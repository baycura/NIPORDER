import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase.js";

const cv = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";

export default function MenuMgmtPage() {
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCat, setSelectedCat] = useState(null);
  const [catModal, setCatModal] = useState(null);
  const [prodModal, setProdModal] = useState(null);
  const [catForm, setCatForm] = useState({});
  const [prodForm, setProdForm] = useState({});
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{data: cats}, {data: prods}] = await Promise.all([
      supabase.from("categories").select("*").order("sort_order"),
      supabase.from("products").select("*").order("sort_order"),
    ]);
    setCategories(cats || []);
    setProducts(prods || []);
    if (cats && cats.length && !selectedCat) setSelectedCat(cats[0].id);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  // -------- CATEGORIES --------
  const openNewCat = () => { setCatModal({mode:"new"}); setCatForm({name:"", icon:"", sort_order:100, available_from:"", available_until:"", is_active:true}); };
  const openEditCat = (c) => { setCatModal({mode:"edit", data:c}); setCatForm({name:c.name||"", icon:c.icon||"", sort_order:c.sort_order||100, available_from:c.available_from||"", available_until:c.available_until||"", is_active:c.is_active!==false}); };

  const saveCat = async () => {
    if (busy) return;
    if (!catForm.name?.trim()) { alert("Kategori adi gerekli"); return; }
    setBusy(true);
    const payload = {
      name: catForm.name.trim(), icon: catForm.icon || null,
      sort_order: Number(catForm.sort_order)||100,
      available_from: catForm.available_from || null,
      available_until: catForm.available_until || null,
      is_active: catForm.is_active,
    };
    const res = catModal.mode === "new"
      ? await supabase.from("categories").insert(payload)
      : await supabase.from("categories").update(payload).eq("id", catModal.data.id);
    if (res.error) { alert("Hata: " + res.error.message); setBusy(false); return; }
    setCatModal(null); setBusy(false); load();
  };

  const delCat = async (c) => {
    const prodCount = products.filter(p => p.category_id === c.id).length;
    if (prodCount > 0) { alert("Bu kategoride " + prodCount + " urun var. Once urunleri sil/tasi."); return; }
    if (!confirm('"' + c.name + '" silinsin mi?')) return;
    await supabase.from("categories").delete().eq("id", c.id);
    load();
  };

  // -------- PRODUCTS --------
  const openNewProd = () => {
    if (!selectedCat) { alert("Once kategori sec"); return; }
    setProdModal({mode:"new"});
    setProdForm({
      name:"", description:"", price:0, instant_discount_pct:0,
      sold_out_today:false, unavailable_reason:"",
      show_in_party_menu:false, is_available:true,
      category_id: selectedCat,
      has_options:false,
      options_config:{groups:[]},
    });
  };

  const openEditProd = (p) => {
    setProdModal({mode:"edit", data:p});
    setProdForm({
      name:p.name||"", description:p.description||"",
      price:Number(p.price)||0,
      instant_discount_pct:Number(p.instant_discount_pct)||0,
      sold_out_today:!!p.sold_out_today,
      unavailable_reason:p.unavailable_reason||"",
      show_in_party_menu:!!p.show_in_party_menu,
      is_available:p.is_available!==false,
      category_id:p.category_id,
      has_options:!!p.has_options,
      options_config:p.options_config || {groups:[]},
    });
  };

  const saveProd = async () => {
    if (busy) return;
    if (!prodForm.name?.trim()) { alert("Urun adi gerekli"); return; }
    // Validate options_config groups
    if (prodForm.has_options) {
      const groups = (prodForm.options_config && prodForm.options_config.groups) || [];
      for (const g of groups) {
        if (!g.name?.trim()) { alert("Secenek grubu adi bos olamaz"); return; }
        if (!g.options || g.options.length === 0) { alert(g.name + " grubunun hic secenegi yok"); return; }
      }
    }
    setBusy(true);
    const payload = {
      name: prodForm.name.trim(),
      description: prodForm.description?.trim() || null,
      price: Number(prodForm.price)||0,
      instant_discount_pct: Number(prodForm.instant_discount_pct)||0,
      sold_out_today: prodForm.sold_out_today,
      unavailable_reason: prodForm.unavailable_reason?.trim() || null,
      show_in_party_menu: prodForm.show_in_party_menu,
      is_available: prodForm.is_available,
      category_id: prodForm.category_id,
      has_options: prodForm.has_options,
      options_config: prodForm.has_options ? prodForm.options_config : null,
    };
    const res = prodModal.mode === "new"
      ? await supabase.from("products").insert(payload)
      : await supabase.from("products").update(payload).eq("id", prodModal.data.id);
    if (res.error) { alert("Hata: " + res.error.message); setBusy(false); return; }
    setProdModal(null); setBusy(false); load();
  };

  const delProd = async (p) => {
    if (!confirm('"' + p.name + '" silinsin mi?')) return;
    await supabase.from("products").delete().eq("id", p.id);
    load();
  };

  // -------- Option groups editor --------
  const addGroup = () => {
    const gs = [...((prodForm.options_config && prodForm.options_config.groups) || [])];
    gs.push({name:"", required:true, options:[]});
    setProdForm({...prodForm, options_config:{groups:gs}});
  };
  const updateGroup = (idx, key, val) => {
    const gs = [...((prodForm.options_config && prodForm.options_config.groups) || [])];
    gs[idx] = {...gs[idx], [key]:val};
    setProdForm({...prodForm, options_config:{groups:gs}});
  };
  const removeGroup = (idx) => {
    const gs = ((prodForm.options_config && prodForm.options_config.groups) || []).filter((_,i)=>i!==idx);
    setProdForm({...prodForm, options_config:{groups:gs}});
  };
  const addOption = (gIdx, opt) => {
    const txt = (opt||"").trim();
    if (!txt) return;
    const gs = [...((prodForm.options_config && prodForm.options_config.groups) || [])];
    const opts = [...(gs[gIdx].options||[])];
    if (opts.includes(txt)) return;
    opts.push(txt);
    gs[gIdx] = {...gs[gIdx], options:opts};
    setProdForm({...prodForm, options_config:{groups:gs}});
  };
  const removeOption = (gIdx, optIdx) => {
    const gs = [...((prodForm.options_config && prodForm.options_config.groups) || [])];
    gs[gIdx] = {...gs[gIdx], options:(gs[gIdx].options||[]).filter((_,i)=>i!==optIdx)};
    setProdForm({...prodForm, options_config:{groups:gs}});
  };
  const applyBedenPreset = () => {
    setProdForm({...prodForm, has_options:true, options_config:{groups:[{name:"Beden", required:true, options:["XS","S","M","L","XL","XXL"]}]}});
  };

  if (loading) return (<div style={{color:"#888",fontFamily:cv,padding:20}}>Yukleniyor...</div>);

  const visibleProducts = products.filter(p => p.category_id === selectedCat);

  return (
    <div style={{fontFamily:cv,color:"#F0EDE8"}}>
      <div style={{fontSize:24,fontWeight:800,marginBottom:4}}>Menü Yönetimi</div>
      <div style={{fontSize:11,color:"#888",letterSpacing:"1px",marginBottom:18}}>{categories.length} KATEGORI · {products.length} URUN</div>

      {/* Categories row */}
      <div style={{display:"flex",gap:6,overflowX:"auto",marginBottom:12,paddingBottom:4}}>
        {categories.map(c => (
          <button key={c.id} onClick={() => setSelectedCat(c.id)} style={{flexShrink:0,padding:"8px 12px",border:"1px solid "+(selectedCat===c.id?"#C8973E":"#333"),borderRadius:14,fontSize:12,fontWeight:700,background:selectedCat===c.id?"rgba(200,151,62,0.2)":"#1A1A1A",color:selectedCat===c.id?"#C8973E":"#aaa",cursor:"pointer",whiteSpace:"nowrap",opacity:c.is_active===false?0.5:1}}>
            {c.icon && <span style={{marginRight:4}}>{c.icon}</span>}{c.name}
          </button>
        ))}
        <button onClick={openNewCat} style={{flexShrink:0,padding:"8px 12px",border:"1px dashed #555",borderRadius:14,fontSize:12,fontWeight:700,background:"transparent",color:"#888",cursor:"pointer",whiteSpace:"nowrap"}}>+ Kategori</button>
      </div>

      {selectedCat && (() => {
        const cat = categories.find(c => c.id === selectedCat);
        return (
          <div style={{background:"#1A1A1A",border:"1px solid #2A2A2A",borderRadius:10,padding:12,marginBottom:14,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{fontSize:14,fontWeight:700}}>{cat?.icon} {cat?.name}</div>
              {cat?.available_from && <div style={{fontSize:10,color:"#888",marginTop:3}}>Saat: {cat.available_from?.substring(0,5)}-{cat.available_until?.substring(0,5)}</div>}
            </div>
            <div style={{display:"flex",gap:6}}>
              <button onClick={()=>openEditCat(cat)} style={{padding:"5px 9px",background:"#222",color:"#aaa",border:"1px solid #333",borderRadius:6,fontSize:10,cursor:"pointer"}}>Düzenle</button>
              <button onClick={()=>delCat(cat)} style={{padding:"5px 9px",background:"transparent",color:"#FF6666",border:"1px solid #553333",borderRadius:6,fontSize:10,cursor:"pointer"}}>Sil</button>
            </div>
          </div>
        );
      })()}

      <button onClick={openNewProd} style={{padding:"10px 16px",background:"#C8973E",color:"#000",border:"none",borderRadius:10,fontSize:13,fontWeight:800,cursor:"pointer",marginBottom:14}}>+ Yeni Ürün</button>

      {visibleProducts.length === 0 && <div style={{textAlign:"center",padding:30,color:"#666",fontSize:12}}>Bu kategoride urun yok</div>}

      {visibleProducts.map(p => (
        <div key={p.id} style={{background:"#1A1A1A",border:"1px solid #2A2A2A",borderRadius:10,padding:12,marginBottom:8,opacity:p.is_available===false?0.5:1}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10}}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                <div style={{fontSize:14,fontWeight:700,color:"#F0EDE8"}}>{p.name}</div>
                {p.sold_out_today && <span style={{fontSize:9,padding:"2px 6px",background:"#552222",color:"#FFB0B0",borderRadius:6,fontWeight:700}}>TUKENDI</span>}
                {p.show_in_party_menu && <span style={{fontSize:9,padding:"2px 6px",background:"#3D2D5C",color:"#D0B0FF",borderRadius:6,fontWeight:700}}>PARTI</span>}
                {p.has_options && <span style={{fontSize:9,padding:"2px 6px",background:"#2D3D5C",color:"#B0D0FF",borderRadius:6,fontWeight:700}}>SEÇENEKLI</span>}
                {p.instant_discount_pct > 0 && <span style={{fontSize:9,padding:"2px 6px",background:"#3D2D18",color:"#FFD088",borderRadius:6,fontWeight:700}}>-%{p.instant_discount_pct}</span>}
              </div>
              {p.description && <div style={{fontSize:11,color:"#888",marginTop:3}}>{p.description}</div>}
              <div style={{fontSize:13,color:"#C8973E",fontWeight:700,marginTop:4}}>₺{p.price}</div>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:4}}>
              <button onClick={()=>openEditProd(p)} style={{padding:"5px 9px",background:"#222",color:"#aaa",border:"1px solid #333",borderRadius:6,fontSize:10,cursor:"pointer"}}>Düzenle</button>
              <button onClick={()=>delProd(p)} style={{padding:"5px 9px",background:"transparent",color:"#FF6666",border:"1px solid #553333",borderRadius:6,fontSize:10,cursor:"pointer"}}>Sil</button>
            </div>
          </div>
        </div>
      ))}

      {/* CATEGORY MODAL */}
      {catModal && (
        <Modal onClose={()=>setCatModal(null)} title={catModal.mode==="new"?"Yeni Kategori":"Kategoriyi Düzenle"}>
          <Field label="AD"><input value={catForm.name||""} onChange={e=>setCatForm({...catForm,name:e.target.value})} style={inputS}/></Field>
          <Field label="IKON (emoji)"><input value={catForm.icon||""} onChange={e=>setCatForm({...catForm,icon:e.target.value})} placeholder="👕" style={inputS}/></Field>
          <Field label="SIRA (kucuk=once)"><input type="number" value={catForm.sort_order||0} onChange={e=>setCatForm({...catForm,sort_order:e.target.value})} style={inputS}/></Field>
          <div style={{display:"flex",gap:8}}>
            <Field label="BASLANGIC SAATI"><input type="time" value={catForm.available_from||""} onChange={e=>setCatForm({...catForm,available_from:e.target.value})} style={inputS}/></Field>
            <Field label="BITIS SAATI"><input type="time" value={catForm.available_until||""} onChange={e=>setCatForm({...catForm,available_until:e.target.value})} style={inputS}/></Field>
          </div>
          <label style={{display:"flex",alignItems:"center",gap:8,marginBottom:12,cursor:"pointer"}}>
            <input type="checkbox" checked={catForm.is_active!==false} onChange={e=>setCatForm({...catForm,is_active:e.target.checked})}/>
            <span style={{fontSize:13,color:"#F0EDE8"}}>Aktif</span>
          </label>
          <div style={{display:"flex",gap:8,marginTop:10}}>
            <button onClick={()=>setCatModal(null)} style={cancelBtn}>İptal</button>
            <button onClick={saveCat} disabled={busy} style={{...saveBtn,opacity:busy?0.6:1}}>{busy?"...":"Kaydet"}</button>
          </div>
        </Modal>
      )}

      {/* PRODUCT MODAL */}
      {prodModal && (
        <Modal onClose={()=>setProdModal(null)} title={prodModal.mode==="new"?"Yeni Ürün":"Ürünü Düzenle"}>
          <Field label="AD"><input value={prodForm.name||""} onChange={e=>setProdForm({...prodForm,name:e.target.value})} style={inputS}/></Field>
          <Field label="AÇIKLAMA"><textarea value={prodForm.description||""} onChange={e=>setProdForm({...prodForm,description:e.target.value})} rows={2} style={{...inputS,resize:"vertical"}}/></Field>
          <Field label="FIYAT (₺)"><input type="number" step="0.01" value={prodForm.price||0} onChange={e=>setProdForm({...prodForm,price:e.target.value})} style={inputS}/></Field>
          <Field label="ANLIK INDIRIM (%)"><input type="number" step="1" min="0" max="99" value={prodForm.instant_discount_pct||0} onChange={e=>setProdForm({...prodForm,instant_discount_pct:e.target.value})} style={inputS}/></Field>

          {/* OPTIONS SYSTEM */}
          <div style={{background:"#0C0C0C",border:"1px solid "+(prodForm.has_options?"#C8973E":"#2A2A2A"),borderRadius:10,padding:12,marginBottom:12}}>
            <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",marginBottom:prodForm.has_options?10:0}}>
              <input type="checkbox" checked={!!prodForm.has_options} onChange={e=>setProdForm({...prodForm,has_options:e.target.checked, options_config: e.target.checked ? (prodForm.options_config||{groups:[]}) : {groups:[]}})}/>
              <span style={{fontSize:13,color:"#F0EDE8",fontWeight:700}}>Seçenekli ürün (beden/renk vb)</span>
            </label>

            {prodForm.has_options && (
              <div style={{marginTop:4}}>
                <div style={{display:"flex",gap:6,marginBottom:10,flexWrap:"wrap"}}>
                  <button onClick={applyBedenPreset} style={{padding:"6px 10px",background:"#3D2D18",color:"#FFD088",border:"1px solid #C8973E",borderRadius:6,fontSize:10,cursor:"pointer",fontWeight:700}}>+ Beden şablonu</button>
                  <button onClick={addGroup} style={{padding:"6px 10px",background:"#222",color:"#aaa",border:"1px solid #444",borderRadius:6,fontSize:10,cursor:"pointer",fontWeight:700}}>+ Yeni grup</button>
                </div>

                {((prodForm.options_config && prodForm.options_config.groups) || []).map((g, gIdx) => (
                  <div key={gIdx} style={{background:"#161616",border:"1px solid #333",borderRadius:8,padding:10,marginBottom:8}}>
                    <div style={{display:"flex",gap:6,marginBottom:8}}>
                      <input value={g.name||""} onChange={e=>updateGroup(gIdx,"name",e.target.value)} placeholder="Grup adi (ör: Beden, Renk)" style={{...inputS,flex:1,padding:"8px 10px",fontSize:13}}/>
                      <button onClick={()=>removeGroup(gIdx)} style={{padding:"8px 10px",background:"transparent",color:"#FF6666",border:"1px solid #553333",borderRadius:6,fontSize:11,cursor:"pointer"}}>Sil</button>
                    </div>
                    <label style={{display:"flex",alignItems:"center",gap:6,marginBottom:8,cursor:"pointer"}}>
                      <input type="checkbox" checked={!!g.required} onChange={e=>updateGroup(gIdx,"required",e.target.checked)}/>
                      <span style={{fontSize:11,color:"#aaa"}}>Zorunlu seçim</span>
                    </label>

                    <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:6}}>
                      {(g.options||[]).map((opt, oIdx) => (
                        <div key={oIdx} style={{display:"flex",alignItems:"center",gap:4,padding:"4px 8px",background:"#2A2A2A",borderRadius:6,fontSize:11,color:"#F0EDE8"}}>
                          <span>{opt}</span>
                          <button onClick={()=>removeOption(gIdx,oIdx)} style={{background:"none",border:"none",color:"#FF6666",fontSize:13,cursor:"pointer",padding:0,lineHeight:1}}>×</button>
                        </div>
                      ))}
                    </div>
                    <OptionInput onAdd={(v)=>addOption(gIdx,v)}/>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{background:"#0C0C0C",border:"1px solid #2A2A2A",borderRadius:10,padding:12,marginBottom:12}}>
            <label style={{display:"flex",alignItems:"center",gap:8,marginBottom:8,cursor:"pointer"}}>
              <input type="checkbox" checked={!!prodForm.sold_out_today} onChange={e=>setProdForm({...prodForm,sold_out_today:e.target.checked})}/>
              <span style={{fontSize:13,color:"#F0EDE8"}}>Bugün tükendi</span>
            </label>
            {prodForm.sold_out_today && (<input value={prodForm.unavailable_reason||""} onChange={e=>setProdForm({...prodForm,unavailable_reason:e.target.value})} placeholder="Neden (musteri gorecek)" style={{...inputS,fontSize:13}}/>)}
          </div>

          <label style={{display:"flex",alignItems:"center",gap:8,marginBottom:10,cursor:"pointer"}}>
            <input type="checkbox" checked={!!prodForm.show_in_party_menu} onChange={e=>setProdForm({...prodForm,show_in_party_menu:e.target.checked})}/>
            <span style={{fontSize:13,color:"#F0EDE8"}}>Sadece parti menüsünde</span>
          </label>

          <label style={{display:"flex",alignItems:"center",gap:8,marginBottom:12,cursor:"pointer"}}>
            <input type="checkbox" checked={prodForm.is_available!==false} onChange={e=>setProdForm({...prodForm,is_available:e.target.checked})}/>
            <span style={{fontSize:13,color:"#F0EDE8"}}>Menüde aktif</span>
          </label>

          <div style={{display:"flex",gap:8,marginTop:10}}>
            <button onClick={()=>setProdModal(null)} style={cancelBtn}>İptal</button>
            <button onClick={saveProd} disabled={busy} style={{...saveBtn,opacity:busy?0.6:1}}>{busy?"...":"Kaydet"}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function OptionInput({onAdd}) {
  const [val, setVal] = useState("");
  const submit = () => { if (val.trim()) { onAdd(val.trim()); setVal(""); } };
  return (
    <div style={{display:"flex",gap:6}}>
      <input value={val} onChange={e=>setVal(e.target.value)} onKeyDown={e=>{ if (e.key==="Enter") { e.preventDefault(); submit(); }}} placeholder="Seçenek ekle (örn: S, M, L) + Enter" style={{flex:1,padding:"6px 10px",background:"#0C0C0C",border:"1px solid #2A2A2A",borderRadius:6,color:"#F0EDE8",fontSize:12,outline:"none",fontFamily:"inherit"}}/>
      <button onClick={submit} style={{padding:"6px 12px",background:"#C8973E",color:"#000",border:"none",borderRadius:6,fontSize:11,fontWeight:700,cursor:"pointer"}}>Ekle</button>
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
    <div onClick={e => e.stopPropagation()} style={{background:"#161616",border:"1px solid #2A2A2A",borderRadius:"16px 16px 0 0",padding:20,width:"100%",maxWidth:520,maxHeight:"92vh",overflowY:"auto"}}>
      <div style={{fontSize:18,fontWeight:800,color:"#F0EDE8",marginBottom:16}}>{title}</div>
      {children}
    </div>
  </div>);
}
