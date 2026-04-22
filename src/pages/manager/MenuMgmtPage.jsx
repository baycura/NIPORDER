import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase.js";

const cv = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";
const card = {background:"#1A1A1A",border:"1px solid #2A2A2A",borderRadius:12,padding:14,marginBottom:10};
const inputS = {width:"100%",padding:"10px 12px",background:"#0C0C0C",border:"1px solid #2A2A2A",borderRadius:8,color:"#F0EDE8",fontSize:14,outline:"none",fontFamily:cv};
const btnGold = {padding:"10px 14px",background:"#C8973E",color:"#000",border:"none",borderRadius:8,fontSize:13,fontWeight:700,cursor:"pointer"};
const btnGhost = {padding:"10px 14px",background:"transparent",color:"#888",border:"1px solid #333",borderRadius:8,fontSize:13,fontWeight:600,cursor:"pointer"};
const btnDanger = {padding:"6px 10px",background:"transparent",color:"#FF6464",border:"1px solid #FF6464",borderRadius:6,fontSize:11,fontWeight:600,cursor:"pointer"};

export default function MenuMgmtPage() {
  const [categories, setCategories] = useState([]);
  const [products, setProducts]     = useState([]);
  const [selCat, setSelCat]         = useState(null);
  const [loading, setLoading]       = useState(true);

  // Modals
  const [catModal, setCatModal]     = useState(null);  // {id?,name,sort_order,icon,available_from,available_until}
  const [prodModal, setProdModal]   = useState(null);  // {id?,name,description,price,category_id,sort_order,...}

  const load = async () => {
    setLoading(true);
    const [{data:cats},{data:prods}] = await Promise.all([
      supabase.from("categories").select("*").order("sort_order"),
      supabase.from("products").select("*").order("sort_order"),
    ]);
    setCategories(cats||[]);
    setProducts(prods||[]);
    if (!selCat && cats?.length) setSelCat(cats[0].id);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  // CATEGORY OPS
  const newCategory = () => setCatModal({ name:"", sort_order: (categories.at(-1)?.sort_order||0)+10, icon:"", available_from:"", available_until:"", is_active:true });
  const editCategory = (c) => setCatModal({...c, available_from: c.available_from||"", available_until: c.available_until||""});
  const saveCategory = async () => {
    const c = catModal;
    if (!c.name.trim()) { alert("Kategori adi girin"); return; }
    const payload = {
      name: c.name.trim(), sort_order: Number(c.sort_order)||0,
      icon: c.icon||null,
      available_from: c.available_from||null,
      available_until: c.available_until||null,
      is_active: c.is_active !== false,
    };
    const { error } = c.id
      ? await supabase.from("categories").update(payload).eq("id", c.id)
      : await supabase.from("categories").insert(payload);
    if (error) { alert("Hata: "+error.message); return; }
    setCatModal(null); load();
  };
  const deleteCategory = async (c) => {
    const cnt = products.filter(p => p.category_id === c.id).length;
    if (cnt > 0) { alert("Bu kategoride "+cnt+" urun var. Once urunleri silin/tasiyın."); return; }
    if (!confirm("'"+c.name+"' kategorisini silmek istediginizden emin misiniz?")) return;
    const { error } = await supabase.from("categories").delete().eq("id", c.id);
    if (error) { alert("Hata: "+error.message); return; }
    load();
  };
  const toggleCatActive = async (c) => {
    await supabase.from("categories").update({is_active: !c.is_active}).eq("id", c.id);
    load();
  };

  // PRODUCT OPS
  const newProduct = () => {
    if (!selCat) { alert("Once bir kategori secin"); return; }
    setProdModal({ name:"", description:"", price:0, category_id:selCat, sort_order:(products.filter(p=>p.category_id===selCat).at(-1)?.sort_order||0)+10, is_available:true, is_out_of_stock:false, sold_out_today:false, instant_discount_pct:0, show_in_party_menu:false });
  };
  const editProduct = (p) => setProdModal({...p, description: p.description||"", instant_discount_pct: p.instant_discount_pct||0});
  const saveProduct = async () => {
    const p = prodModal;
    if (!p.name.trim()) { alert("Urun adi girin"); return; }
    if (!p.price || isNaN(Number(p.price))) { alert("Gecerli bir fiyat girin"); return; }
    const payload = {
      name: p.name.trim(), description: p.description||null,
      price: Number(p.price), category_id: p.category_id,
      sort_order: Number(p.sort_order)||0,
      is_available: p.is_available !== false,
      is_out_of_stock: !!p.is_out_of_stock,
      sold_out_today: !!p.sold_out_today,
      instant_discount_pct: Number(p.instant_discount_pct)||0,
      show_in_party_menu: !!p.show_in_party_menu,
    };
    const { error } = p.id
      ? await supabase.from("products").update(payload).eq("id", p.id)
      : await supabase.from("products").insert(payload);
    if (error) { alert("Hata: "+error.message); return; }
    setProdModal(null); load();
  };
  const deleteProduct = async (p) => {
    if (!confirm("'"+p.name+"' urununu silmek istediginizden emin misiniz?")) return;
    const { error } = await supabase.from("products").delete().eq("id", p.id);
    if (error) { alert("Hata: "+error.message); return; }
    load();
  };
  const toggleSoldOut = async (p) => {
    await supabase.from("products").update({sold_out_today: !p.sold_out_today}).eq("id", p.id);
    load();
  };
  const toggleAvailable = async (p) => {
    await supabase.from("products").update({is_available: !p.is_available}).eq("id", p.id);
    load();
  };

  if (loading) return <div style={{color:"#888",padding:20,fontFamily:cv}}>Yukleniyor...</div>;

  const visibleProducts = products.filter(p => p.category_id === selCat);

  return (
    <div style={{fontFamily:cv,color:"#F0EDE8"}}>
      <div style={{fontSize:26,fontWeight:800,marginBottom:4}}>Menu Yonetimi</div>
      <div style={{fontSize:12,color:"#888",marginBottom:18}}>Kategorileri ve urunleri ekle/duzenle/sil</div>

      {/* Categories list */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
        <div style={{fontSize:13,letterSpacing:"1.5px",fontWeight:700,color:"#888"}}>KATEGORILER</div>
        <button onClick={newCategory} style={btnGold}>+ Yeni Kategori</button>
      </div>

      <div style={{display:"flex",gap:8,overflowX:"auto",paddingBottom:6,marginBottom:14}}>
        {categories.map(c => (
          <div key={c.id} onClick={() => setSelCat(c.id)}
            style={{flexShrink:0,padding:"10px 14px",borderRadius:10,cursor:"pointer",border:"1px solid "+(selCat===c.id?"#C8973E":"#2A2A2A"),background:selCat===c.id?"rgba(200,151,62,0.12)":"#1A1A1A",minWidth:140,opacity:c.is_active?1:0.4}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
              <div style={{fontSize:14,fontWeight:700,color:"#F0EDE8"}}>{c.icon} {c.name}</div>
            </div>
            <div style={{fontSize:10,color:"#666"}}>{products.filter(p=>p.category_id===c.id).length} urun</div>
            {(c.available_from || c.available_until) && (
              <div style={{fontSize:9,color:"#888",marginTop:3}}>{c.available_from?.slice(0,5)||"--"} → {c.available_until?.slice(0,5)||"--"}</div>
            )}
            <div style={{display:"flex",gap:4,marginTop:8}}>
              <button onClick={(e)=>{e.stopPropagation(); editCategory(c);}} style={{...btnGhost,padding:"4px 8px",fontSize:10,flex:1}}>Duzenle</button>
              <button onClick={(e)=>{e.stopPropagation(); toggleCatActive(c);}} style={{...btnGhost,padding:"4px 8px",fontSize:10,color:c.is_active?"#888":"#3ECF8E",borderColor:c.is_active?"#333":"#3ECF8E"}}>{c.is_active?"Gizle":"Goster"}</button>
              <button onClick={(e)=>{e.stopPropagation(); deleteCategory(c);}} style={{...btnDanger,padding:"4px 8px",fontSize:10}}>Sil</button>
            </div>
          </div>
        ))}
      </div>

      {/* Products of selected category */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,marginTop:20}}>
        <div style={{fontSize:13,letterSpacing:"1.5px",fontWeight:700,color:"#888"}}>URUNLER ({visibleProducts.length})</div>
        <button onClick={newProduct} style={btnGold}>+ Yeni Urun</button>
      </div>

      {visibleProducts.length === 0 && (
        <div style={{...card,textAlign:"center",color:"#666",padding:30}}>Bu kategoride henuz urun yok</div>
      )}

      {visibleProducts.map(p => (
        <div key={p.id} style={{...card,opacity:p.is_available?(p.sold_out_today?0.6:1):0.4}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
            <div style={{flex:1}}>
              <div style={{fontSize:15,fontWeight:700,color:"#F0EDE8"}}>{p.name}</div>
              {p.description && <div style={{fontSize:12,color:"#888",marginTop:2}}>{p.description}</div>}
              <div style={{display:"flex",alignItems:"center",gap:10,marginTop:8,flexWrap:"wrap"}}>
                <span style={{fontSize:16,fontWeight:800,color:"#C8973E"}}>₺{p.price}</span>
                {p.instant_discount_pct > 0 && (
                  <span style={{fontSize:10,padding:"2px 6px",background:"#FF4444",color:"#fff",borderRadius:4,fontWeight:700}}>%{p.instant_discount_pct} INDIRIM</span>
                )}
                {p.sold_out_today && <span style={{fontSize:10,padding:"2px 6px",background:"#FF6464",color:"#fff",borderRadius:4,fontWeight:700}}>BUGUN TUKENDI</span>}
                {!p.is_available && <span style={{fontSize:10,padding:"2px 6px",background:"#444",color:"#888",borderRadius:4,fontWeight:700}}>GIZLI</span>}
                {p.show_in_party_menu && <span style={{fontSize:10,padding:"2px 6px",background:"#7B5CFF",color:"#fff",borderRadius:4,fontWeight:700}}>🎉 PARTY</span>}
              </div>
            </div>
          </div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            <button onClick={() => editProduct(p)} style={btnGhost}>Duzenle</button>
            <button onClick={() => toggleSoldOut(p)} style={{...btnGhost,color:p.sold_out_today?"#3ECF8E":"#888"}}>{p.sold_out_today?"Stoga Geri Al":"Bugun Tukendi"}</button>
            <button onClick={() => toggleAvailable(p)} style={{...btnGhost,color:p.is_available?"#888":"#3ECF8E"}}>{p.is_available?"Menuden Gizle":"Menuye Goster"}</button>
            <button onClick={() => deleteProduct(p)} style={btnDanger}>Sil</button>
          </div>
        </div>
      ))}

      {/* CATEGORY MODAL */}
      {catModal && (
        <Modal onClose={()=>setCatModal(null)} title={catModal.id?"Kategoriyi Duzenle":"Yeni Kategori"}>
          <Field label="Ad"><input style={inputS} value={catModal.name} onChange={e=>setCatModal({...catModal,name:e.target.value})} autoFocus/></Field>
          <Field label="Ikon (emoji)"><input style={inputS} value={catModal.icon} onChange={e=>setCatModal({...catModal,icon:e.target.value})} placeholder="🍺"/></Field>
          <Field label="Sira"><input type="number" style={inputS} value={catModal.sort_order} onChange={e=>setCatModal({...catModal,sort_order:e.target.value})}/></Field>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <Field label="Aktif Saat (basla)"><input type="time" style={inputS} value={catModal.available_from} onChange={e=>setCatModal({...catModal,available_from:e.target.value})}/></Field>
            <Field label="Aktif Saat (bitis)"><input type="time" style={inputS} value={catModal.available_until} onChange={e=>setCatModal({...catModal,available_until:e.target.value})}/></Field>
          </div>
          <div style={{fontSize:11,color:"#888",marginTop:4,marginBottom:14}}>Bos birakilirsa 7/24 aktif. Saat disinda musterilere "Mutfak Kapali" olarak gosterilir.</div>
          <ModalActions onCancel={()=>setCatModal(null)} onSave={saveCategory}/>
        </Modal>
      )}

      {/* PRODUCT MODAL */}
      {prodModal && (
        <Modal onClose={()=>setProdModal(null)} title={prodModal.id?"Urunu Duzenle":"Yeni Urun"}>
          <Field label="Ad"><input style={inputS} value={prodModal.name} onChange={e=>setProdModal({...prodModal,name:e.target.value})} autoFocus/></Field>
          <Field label="Aciklama"><textarea style={{...inputS,minHeight:60,resize:"vertical"}} value={prodModal.description} onChange={e=>setProdModal({...prodModal,description:e.target.value})}/></Field>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <Field label="Fiyat (₺)"><input type="number" style={inputS} value={prodModal.price} onChange={e=>setProdModal({...prodModal,price:e.target.value})}/></Field>
            <Field label="Sira"><input type="number" style={inputS} value={prodModal.sort_order} onChange={e=>setProdModal({...prodModal,sort_order:e.target.value})}/></Field>
          </div>
          <Field label="Kategori">
            <select style={inputS} value={prodModal.category_id} onChange={e=>setProdModal({...prodModal,category_id:e.target.value})}>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Anlik Indirim (%)"><input type="number" min="0" max="99" style={inputS} value={prodModal.instant_discount_pct} onChange={e=>setProdModal({...prodModal,instant_discount_pct:e.target.value})}/></Field>
          <div style={{display:"flex",flexDirection:"column",gap:8,marginTop:10}}>
            <Toggle label="Menuye goster" checked={prodModal.is_available} onChange={v=>setProdModal({...prodModal,is_available:v})}/>
            <Toggle label="Bugun tukendi" checked={prodModal.sold_out_today} onChange={v=>setProdModal({...prodModal,sold_out_today:v})}/>
            <Toggle label="🎉 Party menusunde goster" checked={prodModal.show_in_party_menu} onChange={v=>setProdModal({...prodModal,show_in_party_menu:v})}/>
          </div>
          <ModalActions onCancel={()=>setProdModal(null)} onSave={saveProduct}/>
        </Modal>
      )}
    </div>
  );
}

function Modal({title, onClose, children}) {
  return (
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100,padding:14}}>
      <div onClick={e=>e.stopPropagation()} style={{background:"#1A1A1A",border:"1px solid #2A2A2A",borderRadius:16,padding:20,width:"100%",maxWidth:480,maxHeight:"90vh",overflowY:"auto"}}>
        <div style={{fontSize:18,fontWeight:800,color:"#F0EDE8",marginBottom:14}}>{title}</div>
        {children}
      </div>
    </div>
  );
}

function Field({label, children}) {
  return (
    <div style={{marginBottom:12}}>
      <div style={{fontSize:11,color:"#888",letterSpacing:"1px",fontWeight:700,marginBottom:5}}>{label.toUpperCase()}</div>
      {children}
    </div>
  );
}

function Toggle({label, checked, onChange}) {
  return (
    <label style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 12px",background:"#0C0C0C",border:"1px solid #2A2A2A",borderRadius:8,cursor:"pointer"}}>
      <span style={{fontSize:13,color:"#F0EDE8"}}>{label}</span>
      <div style={{position:"relative",width:42,height:24,background:checked?"#C8973E":"#2A2A2A",borderRadius:12,transition:"0.2s"}}>
        <div style={{position:"absolute",width:18,height:18,background:"#fff",borderRadius:"50%",top:3,left:checked?21:3,transition:"0.2s"}}/>
        <input type="checkbox" checked={checked} onChange={e=>onChange(e.target.checked)} style={{opacity:0,position:"absolute",inset:0,cursor:"pointer"}}/>
      </div>
    </label>
  );
}

function ModalActions({onCancel, onSave}) {
  return (
    <div style={{display:"flex",gap:8,marginTop:16}}>
      <button onClick={onCancel} style={{flex:1,padding:"12px",background:"transparent",color:"#888",border:"1px solid #333",borderRadius:10,fontSize:14,fontWeight:700,cursor:"pointer"}}>Iptal</button>
      <button onClick={onSave} style={{flex:2,padding:"12px",background:"#C8973E",color:"#000",border:"none",borderRadius:10,fontSize:14,fontWeight:800,cursor:"pointer"}}>Kaydet</button>
    </div>
  );
}
