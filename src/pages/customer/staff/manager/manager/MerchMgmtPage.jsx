import { useState, useEffect, useRef } from "react";
import { supabase } from "../../lib/supabase.js";

const cv  = "'Coolvetica','Bebas Neue',sans-serif";
const cvc = "'Coolvetica Condensed','Barlow Condensed',sans-serif";

function ProductForm({ product, onSave, onCancel }) {
  const [form, setForm] = useState(product || {
    name_en:"", name_tr:"", tagline_en:"", tagline_tr:"",
    desc_en:"", desc_tr:"", price:"", type:"apparel",
    is_active:true, sort_order:0,
  });
  const [variants, setVariants] = useState(product?.merch_variants || []);
  const [saving,   setSaving]   = useState(false);
  const [uploading,setUploading]= useState(false);
  const fileRef = useRef();

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const addVariant    = () => setVariants(v => [...v, { size:"", stock:0 }]);
  const removeVariant = (i) => setVariants(v => v.filter((_,j) => j !== i));
  const setVariant    = (i, key, val) =>
    setVariants(v => v.map((x,j) => j===i ? { ...x, [key]:val } : x));

  const handleImage = async (file) => {
    if (!file || !product?.id) return;
    setUploading(true);
    const path = `merch/${product.id}/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage
      .from("merch").upload(path, file);
    if (!error) {
      const { data } = supabase.storage.from("merch").getPublicUrl(path);
      await supabase.from("merch_products")
        .update({ image_url: data.publicUrl }).eq("id", product.id);
      set("image_url", data.publicUrl);
    }
    setUploading(false);
  };

  const handleSave = async () => {
    if (!form.name_en || !form.price) return;
    setSaving(true);
    const payload = {
      name_en: form.name_en, name_tr: form.name_tr,
      tagline_en: form.tagline_en, tagline_tr: form.tagline_tr,
      desc_en: form.desc_en, desc_tr: form.desc_tr,
      price: parseFloat(form.price), type: form.type,
      is_active: form.is_active, sort_order: +form.sort_order || 0,
    };

    let productId = product?.id;
    if (productId) {
      await supabase.from("merch_products").update(payload).eq("id", productId);
    } else {
      const { data } = await supabase.from("merch_products")
        .insert(payload).select().single();
      productId = data?.id;
    }

    for (const v of variants) {
      if (!v.size) continue;
      await supabase.from("merch_variants").upsert({
        ...(v.id ? { id:v.id } : {}),
        product_id: productId,
        size: v.size,
        stock: parseInt(v.stock) || 0,
      });
    }

    setSaving(false);
    onSave();
  };

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between",
        alignItems:"center", marginBottom:24 }}>
        <h2 style={{ color:"#F0EDE8", fontFamily:cv, fontSize:24,
          letterSpacing:"-0.5px", margin:0 }}>
          {product ? "ÜRÜNÜ DÜZENLE" : "YENİ ÜRÜN"}
        </h2>
        <div style={{ display:"flex", gap:8 }}>
          <button onClick={onCancel}
            style={{ padding:"9px 16px", background:"transparent",
              border:"1px solid #2A2A2A", color:"#888",
              borderRadius:8, cursor:"pointer", fontFamily:cvc, fontSize:12 }}>
            İptal
          </button>
          <button onClick={handleSave} disabled={saving}
            style={{ padding:"9px 16px",
              background: saving ? "#333" : "#C8973E",
              border:"none", color:"#000", borderRadius:8,
              cursor:"pointer", fontFamily:cvc, fontSize:12, letterSpacing:"1px" }}>
            {saving ? "KAYDEDİLİYOR..." : "KAYDET"}
          </button>
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>
        {/* Sol — Fotoğraf */}
        <div>
          <div style={{ color:"#888", fontFamily:cvc, fontSize:10,
            letterSpacing:"2px", marginBottom:8 }}>ÜRÜN FOTOĞRAFI</div>
          <div onClick={() => product?.id && fileRef.current?.click()}
            style={{ border:`2px dashed ${form.image_url?"#C8973E":"#2A2A2A"}`,
              borderRadius:12, minHeight:260, cursor: product?.id ? "pointer" : "default",
              display:"flex", alignItems:"center", justifyContent:"center",
              background:"#111", overflow:"hidden", position:"relative" }}>
            {form.image_url ? (
              <img src={form.image_url} alt="product"
                style={{ width:"100%", objectFit:"cover", maxHeight:320 }}/>
            ) : (
              <div style={{ textAlign:"center", padding:24 }}>
                <div style={{ fontSize:32, marginBottom:8 }}>📸</div>
                <div style={{ color:"#888", fontFamily:cv, fontSize:16 }}>
                  {product?.id ? "FOTOĞRAF YÜKLE" : "Önce kaydet"}
                </div>
                <div style={{ color:"#444", fontFamily:cvc, fontSize:11, marginTop:4 }}>
                  {product?.id ? "Tıkla veya sürükle · Max 10MB" : "Sonra fotoğraf ekleyebilirsin"}
                </div>
              </div>
            )}
            {uploading && (
              <div style={{ position:"absolute", inset:0, background:"#000000aa",
                display:"flex", alignItems:"center", justifyContent:"center",
                color:"#C8973E", fontFamily:cvc, fontSize:12 }}>
                YÜKLENİYOR...
              </div>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*"
            onChange={e => handleImage(e.target.files[0])}
            style={{ display:"none" }}/>
          {!product?.id && (
            <div style={{ color:"#555", fontFamily:cvc, fontSize:11,
              marginTop:8, textAlign:"center" }}>
              Ürünü kaydettikten sonra fotoğraf yükleyebilirsin
            </div>
          )}
        </div>

        {/* Sağ — Bilgiler */}
        <div>
          {/* Tip + Aktif */}
          <div style={{ display:"flex", gap:10, marginBottom:14 }}>
            <div style={{ flex:1 }}>
              <div style={{ color:"#888", fontFamily:cvc, fontSize:10,
                letterSpacing:"2px", marginBottom:5 }}>TİP</div>
              <select value={form.type} onChange={e => set("type", e.target.value)}
                style={{ width:"100%", background:"#111", border:"1px solid #2A2A2A",
                  borderRadius:8, padding:"10px 12px", color:"#F0EDE8",
                  fontFamily:cvc, fontSize:14 }}>
                <option value="apparel">Giyim</option>
                <option value="accessories">Aksesuar</option>
              </select>
            </div>
            <div onClick={() => set("is_active", !form.is_active)}
              style={{ display:"flex", alignItems:"flex-end",
                paddingBottom:8, cursor:"pointer", gap:8 }}>
              <div style={{ width:40, height:22, borderRadius:11,
                background: form.is_active ? "#3ECF8E" : "#333",
                position:"relative", transition:"background 0.2s" }}>
                <div style={{ width:16, height:16, borderRadius:"50%",
                  background:"#fff", position:"absolute", top:3,
                  left: form.is_active ? 21 : 3, transition:"left 0.2s" }}/>
              </div>
              <span style={{ color: form.is_active ? "#3ECF8E" : "#555",
                fontFamily:cvc, fontSize:11 }}>
                {form.is_active ? "AKTİF" : "PASİF"}
              </span>
            </div>
          </div>

          {[
            ["ÜRÜN ADI (EN)","name_en","NIP Classic Tee"],
            ["ÜRÜN ADI (TR)","name_tr","NIP Classic Tee"],
            ["AÇIKLAMA (EN)","tagline_en","Heavyweight · 100% organic cotton"],
            ["AÇIKLAMA (TR)","tagline_tr","Ağır gramaj · %100 organik pamuk"],
          ].map(([lbl,key,ph]) => (
            <div key={key} style={{ marginBottom:12 }}>
              <div style={{ color:"#888", fontFamily:cvc, fontSize:10,
                letterSpacing:"2px", marginBottom:5 }}>{lbl}</div>
              <input value={form[key]||""} onChange={e=>set(key,e.target.value)}
                placeholder={ph}
                style={{ width:"100%", background:"#111", border:"1px solid #2A2A2A",
                  borderRadius:8, padding:"9px 12px", color:"#F0EDE8",
                  fontFamily:cvc, fontSize:13 }}/>
            </div>
          ))}

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
            <div>
              <div style={{ color:"#888", fontFamily:cvc, fontSize:10,
                letterSpacing:"2px", marginBottom:5 }}>FİYAT (₺)</div>
              <input type="number" value={form.price||""}
                onChange={e=>set("price",e.target.value)}
                placeholder="850"
                style={{ width:"100%", background:"#111", border:"1px solid #2A2A2A",
                  borderRadius:8, padding:"9px 12px", color:"#F0EDE8",
                  fontFamily:cvc, fontSize:13 }}/>
            </div>
            <div>
              <div style={{ color:"#888", fontFamily:cvc, fontSize:10,
                letterSpacing:"2px", marginBottom:5 }}>SIRA</div>
              <input type="number" value={form.sort_order||""}
                onChange={e=>set("sort_order",e.target.value)}
                placeholder="1"
                style={{ width:"100%", background:"#111", border:"1px solid #2A2A2A",
                  borderRadius:8, padding:"9px 12px", color:"#F0EDE8",
                  fontFamily:cvc, fontSize:13 }}/>
            </div>
          </div>
        </div>
      </div>

      {/* Bedenler */}
      <div style={{ background:"#1E1E1E", border:"1px solid #2A2A2A",
        borderRadius:12, padding:16, marginTop:16 }}>
        <div style={{ display:"flex", justifyContent:"space-between",
          alignItems:"center", marginBottom:14 }}>
          <div style={{ color:"#F0EDE8", fontFamily:cv, fontSize:18 }}>
            BEDENLER & STOK
          </div>
          <button onClick={addVariant}
            style={{ padding:"6px 14px", background:"transparent",
              border:"1px solid #C8973E", color:"#C8973E",
              fontFamily:cvc, fontSize:11, letterSpacing:"1px",
              cursor:"pointer", borderRadius:6 }}>+ EKLE</button>
        </div>
        {variants.map((v, i) => (
          <div key={i} style={{ display:"grid",
            gridTemplateColumns:"1fr 1fr auto",
            gap:10, marginBottom:10, alignItems:"center" }}>
            <input value={v.size} placeholder="S / M / ONE SIZE"
              onChange={e => setVariant(i,"size",e.target.value)}
              style={{ background:"#111", border:"1px solid #2A2A2A",
                borderRadius:8, padding:"9px 12px", color:"#F0EDE8",
                fontFamily:cvc, fontSize:13 }}/>
            <input type="number" value={v.stock} placeholder="Stok"
              onChange={e => setVariant(i,"stock",e.target.value)}
              style={{ background:"#111", border:"1px solid #2A2A2A",
                borderRadius:8, padding:"9px 12px", color:"#F0EDE8",
                fontFamily:cvc, fontSize:13 }}/>
            <button onClick={() => removeVariant(i)}
              style={{ background:"rgba(224,90,90,0.12)",
                border:"1px solid #E05A5A", color:"#E05A5A",
                borderRadius:8, width:34, height:34,
                cursor:"pointer", fontSize:16 }}>✕</button>
          </div>
        ))}
        {variants.length === 0 && (
          <div style={{ color:"#444", fontFamily:cvc, fontSize:12,
            textAlign:"center", padding:"16px 0" }}>
            + butonuyla beden ekleyin
          </div>
        )}
      </div>
    </div>
  );
}

export default function MerchMgmtPage() {
  const [products, setProducts] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [editing,  setEditing]  = useState(null);
  const [filter,   setFilter]   = useState("all");

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("merch_products")
      .select("*, merch_variants(*)")
      .order("sort_order");
    setProducts(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const toggleActive = async (p) => {
    await supabase.from("merch_products")
      .update({ is_active: !p.is_active }).eq("id", p.id);
    load();
  };

  const filtered = filter === "all" ? products
    : products.filter(p => p.type === filter);

  if (editing !== null) return (
    <ProductForm
      product={editing === "new" ? null : editing}
      onSave={() => { setEditing(null); load(); }}
      onCancel={() => setEditing(null)}/>
  );

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between",
        alignItems:"center", marginBottom:20 }}>
        <h1 style={{ color:"#F0EDE8", fontFamily:cv, fontSize:28,
          letterSpacing:"-0.5px", margin:0 }}>Merch Yönetimi</h1>
        <button onClick={() => setEditing("new")}
          style={{ padding:"9px 16px", background:"#C8973E", border:"none",
            color:"#000", fontFamily:cvc, fontSize:12,
            letterSpacing:"1px", cursor:"pointer", borderRadius:8 }}>
          + YENİ ÜRÜN
        </button>
      </div>

      <div style={{ display:"flex", gap:6, marginBottom:20 }}>
        {[["all","TÜMÜ"],["apparel","GİYİM"],["accessories","AKSESUAR"]].map(([id,lbl]) => (
          <button key={id} onClick={() => setFilter(id)}
            style={{ padding:"7px 16px", borderRadius:8, border:"none",
              fontFamily:cvc, fontSize:11, letterSpacing:"1px", cursor:"pointer",
              background: filter===id ? "#C8973E" : "transparent",
              color:       filter===id ? "#000"   : "#888",
              outline:     filter!==id ? "1px solid #2A2A2A" : "none" }}>
            {lbl}
          </button>
        ))}
      </div>

      {loading && (
        <div style={{ color:"#888", fontFamily:cvc, fontSize:12,
          textAlign:"center", padding:40 }}>YÜKLENİYOR...</div>
      )}

      <div style={{ display:"grid",
        gridTemplateColumns:"repeat(3,1fr)", gap:14 }}>
        {filtered.map(p => {
          const totalStock = p.merch_variants
            ?.reduce((s,v) => s+(v.stock||0), 0) ?? 0;
          return (
            <div key={p.id} style={{ background:"#1E1E1E",
              border:"1px solid #2A2A2A", borderRadius:12,
              overflow:"hidden" }}>
              <div style={{ height:180, background:"#111",
                position:"relative", overflow:"hidden",
                cursor:"pointer" }}
                onClick={() => setEditing(p)}>
                {p.image_url ? (
                  <img src={p.image_url} alt={p.name_en}
                    style={{ width:"100%", height:"100%", objectFit:"cover" }}/>
                ) : (
                  <div style={{ width:"100%", height:"100%",
                    display:"flex", flexDirection:"column",
                    alignItems:"center", justifyContent:"center", gap:8 }}>
                    <div style={{ fontSize:24, opacity:.3 }}>📸</div>
                    <div style={{ color:"#444", fontFamily:cvc,
                      fontSize:10, letterSpacing:"2px" }}>FOTOĞRAF YOK</div>
                  </div>
                )}
                <div style={{ position:"absolute", top:8, right:8,
                  background: p.is_active ? "rgba(62,207,142,0.9)" : "rgba(51,51,51,0.9)",
                  color: p.is_active ? "#000" : "#888",
                  fontFamily:cvc, fontSize:9, letterSpacing:"1.5px",
                  padding:"3px 8px", borderRadius:4 }}>
                  {p.is_active ? "AKTİF" : "PASİF"}
                </div>
              </div>

              <div style={{ padding:"12px 14px" }}>
                <div style={{ color:"#F0EDE8", fontFamily:cv, fontSize:17,
                  marginBottom:2 }}>{p.name_en}</div>
                <div style={{ color:"#888", fontFamily:cvc,
                  fontSize:11, marginBottom:10 }}>{p.tagline_en}</div>
                <div style={{ display:"flex", justifyContent:"space-between",
                  alignItems:"center", marginBottom:10 }}>
                  <div style={{ color:"#C8973E", fontFamily:cv, fontSize:18 }}>
                    ₺{p.price?.toLocaleString()}
                  </div>
                  <div style={{ color: totalStock<5?"#E05A5A":"#888",
                    fontFamily:cvc, fontSize:11 }}>
                    {totalStock} adet
                  </div>
                </div>
                <div style={{ display:"flex", gap:6 }}>
                  <button onClick={() => setEditing(p)}
                    style={{ flex:1, padding:"7px",
                      background:"rgba(200,151,62,0.12)",
                      border:"1px solid #C8973E", color:"#C8973E",
                      fontFamily:cvc, fontSize:10, letterSpacing:"1px",
                      cursor:"pointer", borderRadius:6 }}>
                    ✏️ DÜZENLE
                  </button>
                  <button onClick={() => toggleActive(p)}
                    style={{ flex:1, padding:"7px", background:"transparent",
                      border:"1px solid #2A2A2A", color:"#888",
                      fontFamily:cvc, fontSize:10, letterSpacing:"1px",
                      cursor:"pointer", borderRadius:6 }}>
                    {p.is_active ? "PASİF YAP" : "AKTİF YAP"}
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {/* Yeni ürün kartı */}
        <div onClick={() => setEditing("new")}
          style={{ background:"#1E1E1E", border:"2px dashed #2A2A2A",
            borderRadius:12, minHeight:300, display:"flex",
            flexDirection:"column", alignItems:"center",
            justifyContent:"center", gap:10, cursor:"pointer" }}>
          <div style={{ fontSize:28, opacity:.3 }}>+</div>
          <div style={{ color:"#444", fontFamily:cv, fontSize:16 }}>YENİ ÜRÜN</div>
        </div>
      </div>
    </div>
  );
}
