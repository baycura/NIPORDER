import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase.js";

const cv = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";

export default function RecipesMgmtPage() {
  const [products, setProducts] = useState([]);
  const [ingredients, setIngredients] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{data: prods}, {data: ings}, {data: recs}] = await Promise.all([
      supabase.from("products").select("id, name, price, category_id, categories(name)").order("name"),
      supabase.from("ingredients").select("*").order("name"),
      supabase.from("recipes").select("*"),
    ]);
    setProducts(prods || []);
    setIngredients(ings || []);
    setRecipes(recs || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const productRecipes = (productId) => recipes.filter(r => r.product_id === productId);

  const calcCost = (productId) => {
    const recs = productRecipes(productId);
    return recs.reduce((sum, r) => {
      const ing = ingredients.find(i => i.id === r.ingredient_id);
      if (!ing) return sum;
      const wasted = Number(r.qty_per_unit) * (1 + Number(ing.waste_pct||0)/100);
      return sum + wasted * Number(ing.cost_per_unit||0);
    }, 0);
  };

  const openAdd = () => {
    if (!selectedProduct) return;
    setModal({mode:"new", productId: selectedProduct.id});
    setForm({ ingredient_id: ingredients[0]?.id || "", qty_per_unit: "" });
  };

  const openEdit = (r) => {
    setModal({mode:"edit", data:r, productId: selectedProduct.id});
    setForm({ ingredient_id: r.ingredient_id, qty_per_unit: r.qty_per_unit });
  };

  const save = async () => {
    if (busy) return;
    if (!form.ingredient_id || !form.qty_per_unit) { alert("Hammadde ve miktar gerekli"); return; }
    setBusy(true);
    const payload = {
      product_id: modal.productId,
      ingredient_id: form.ingredient_id,
      qty_per_unit: Number(form.qty_per_unit),
    };
    if (modal.mode === "new") {
      const { error } = await supabase.from("recipes").insert(payload);
      if (error) { alert("Hata: " + error.message); setBusy(false); return; }
    } else {
      const { error } = await supabase.from("recipes").update({ qty_per_unit: payload.qty_per_unit }).eq("id", modal.data.id);
      if (error) { alert("Hata: " + error.message); setBusy(false); return; }
    }
    setModal(null); setBusy(false); load();
  };

  const del = async (r) => {
    if (!confirm("Recete kaldirilsin mi?")) return;
    await supabase.from("recipes").delete().eq("id", r.id);
    load();
  };

  if (loading) return (<div style={{color:"#888",fontFamily:cv,padding:20}}>Yukleniyor...</div>);

  const filtered = products.filter(p => !search || p.name?.toLowerCase().includes(search.toLowerCase()));

  return (
    <div style={{fontFamily:cv,color:"#F0EDE8"}}>
      <div style={{fontSize:24,fontWeight:800,marginBottom:4}}>Reçeteler</div>
      <div style={{fontSize:11,color:"#888",letterSpacing:"1px",marginBottom:14}}>{recipes.length} RECETE · {products.length} URUN</div>

      <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Urun ara..." style={{width:"100%",padding:"12px 14px",background:"#1A1A1A",border:"1px solid #2A2A2A",borderRadius:10,color:"#F0EDE8",fontSize:14,outline:"none",marginBottom:12,fontFamily:"inherit"}}/>

      {selectedProduct ? (
        <div>
          <button onClick={()=>setSelectedProduct(null)} style={{background:"none",border:"none",color:"#C8973E",fontSize:13,cursor:"pointer",padding:0,marginBottom:10,fontWeight:600}}>← Tum urunler</button>
          <div style={{background:"#1A1A1A",border:"1px solid #C8973E",borderRadius:12,padding:14,marginBottom:14}}>
            <div style={{fontSize:18,fontWeight:800,color:"#F0EDE8"}}>{selectedProduct.name}</div>
            <div style={{display:"flex",gap:14,marginTop:6,fontSize:12,color:"#888"}}>
              <span>Satis: <span style={{color:"#C8973E",fontWeight:700}}>₺{selectedProduct.price}</span></span>
              <span>Maliyet: <span style={{color:"#FFB0B0",fontWeight:700}}>₺{calcCost(selectedProduct.id).toFixed(2)}</span></span>
              <span>Kar: <span style={{color:"#3ECF8E",fontWeight:700}}>₺{(Number(selectedProduct.price) - calcCost(selectedProduct.id)).toFixed(2)}</span></span>
            </div>
          </div>

          <button onClick={openAdd} disabled={ingredients.length===0} style={{padding:"10px 16px",background:"#C8973E",color:"#000",border:"none",borderRadius:10,fontSize:13,fontWeight:800,cursor:"pointer",marginBottom:12,opacity:ingredients.length===0?0.5:1}}>+ Hammadde Ekle</button>

          {ingredients.length === 0 && <div style={{textAlign:"center",padding:30,color:"#666",fontSize:12}}>Once "Stok Yonetimi" sayfasindan hammadde ekle.</div>}

          {productRecipes(selectedProduct.id).map(r => {
            const ing = ingredients.find(i => i.id === r.ingredient_id);
            if (!ing) return null;
            const wasted = Number(r.qty_per_unit) * (1 + Number(ing.waste_pct||0)/100);
            const cost = wasted * Number(ing.cost_per_unit||0);
            return (
              <div key={r.id} style={{background:"#1A1A1A",border:"1px solid #2A2A2A",borderRadius:10,padding:12,marginBottom:8,display:"flex",alignItems:"center",gap:10}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:14,fontWeight:700,color:"#F0EDE8"}}>{ing.name}</div>
                  <div style={{fontSize:11,color:"#888",marginTop:2}}>{r.qty_per_unit} {ing.unit} {ing.waste_pct > 0 && <span style={{color:"#FFD088"}}>(+%{ing.waste_pct} fire = {wasted.toFixed(2)} {ing.unit})</span>}</div>
                  {cost > 0 && <div style={{fontSize:11,color:"#C8973E",marginTop:2,fontWeight:600}}>Maliyet: ₺{cost.toFixed(2)}</div>}
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:4}}>
                  <button onClick={()=>openEdit(r)} style={{padding:"5px 9px",background:"#222",color:"#aaa",border:"1px solid #333",borderRadius:6,fontSize:10,cursor:"pointer"}}>Duzenle</button>
                  <button onClick={()=>del(r)} style={{padding:"5px 9px",background:"transparent",color:"#FF6666",border:"1px solid #553333",borderRadius:6,fontSize:10,cursor:"pointer"}}>Sil</button>
                </div>
              </div>
            );
          })}
          {productRecipes(selectedProduct.id).length === 0 && <div style={{textAlign:"center",padding:30,color:"#666",fontSize:12}}>Bu urun icin recete yok</div>}
        </div>
      ) : (
        <div>
          {filtered.map(p => {
            const recCount = productRecipes(p.id).length;
            const cost = calcCost(p.id);
            return (
              <div key={p.id} onClick={()=>setSelectedProduct(p)} style={{background:"#1A1A1A",border:"1px solid #2A2A2A",borderRadius:10,padding:12,marginBottom:8,cursor:"pointer",display:"flex",alignItems:"center",gap:10}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:14,fontWeight:700,color:"#F0EDE8"}}>{p.name}</div>
                  <div style={{fontSize:11,color:"#888",marginTop:2}}>
                    {p.categories?.name && <span style={{marginRight:8}}>{p.categories.name}</span>}
                    {recCount > 0 ? <span style={{color:"#3ECF8E"}}>{recCount} hammadde</span> : <span style={{color:"#666"}}>Recete yok</span>}
                  </div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:13,fontWeight:700,color:"#C8973E"}}>₺{p.price}</div>
                  {cost > 0 && <div style={{fontSize:10,color:"#888",marginTop:2}}>maliyet ₺{cost.toFixed(2)}</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modal && (
        <Modal onClose={()=>setModal(null)} title={modal.mode==="new"?"Hammadde Ekle":"Receteyi Duzenle"}>
          <Field label="HAMMADDE">
            <select value={form.ingredient_id||""} onChange={e=>setForm({...form,ingredient_id:e.target.value})} disabled={modal.mode==="edit"} style={inputS}>
              <option value="">- Sec -</option>
              {ingredients.map(i => (<option key={i.id} value={i.id}>{i.name} ({i.unit})</option>))}
            </select>
          </Field>
          <Field label={"BIRIM BASINA MIKTAR (" + (ingredients.find(i => i.id === form.ingredient_id)?.unit || "") + ")"}>
            <input type="number" step="0.01" value={form.qty_per_unit||""} onChange={e=>setForm({...form,qty_per_unit:e.target.value})} placeholder="orn: 500 (1 bardak Bud Draft = 500 ml)" style={inputS}/>
          </Field>
          <div style={{display:"flex",gap:8,marginTop:10}}>
            <button onClick={()=>setModal(null)} style={cancelBtn}>Iptal</button>
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
