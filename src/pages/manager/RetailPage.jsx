import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase.js";
import { useAuth } from "../../contexts/AuthContext.jsx";

const cv = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";
const SIZE_SETS = {
  "Tişört / Giyim": ["XS", "S", "M", "L", "XL", "XXL"],
  "Bisiklet kıyafeti": ["XS", "S", "M", "L", "XL"],
  "Tek beden": [],
};

export default function RetailPage() {
  const { staffUser } = useAuth();
  const [brands, setBrands] = useState([]);
  const [products, setProducts] = useState([]);
  const [category, setCategory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [openBrand, setOpenBrand] = useState(null);
  const [brandModal, setBrandModal] = useState(null);
  const [brandForm, setBrandForm] = useState({});
  const [prodModal, setProdModal] = useState(null);
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);

  const storeId = staffUser?.store_ids?.[0];

  const load = async () => {
    setLoading(true);
    const [{ data: brs }, { data: cats }] = await Promise.all([
      supabase.from("brands").select("*").in("store_id", staffUser?.store_ids?.length ? staffUser.store_ids : ["00000000-0000-0000-0000-000000000000"]).order("sort_order").order("name"),
      supabase.from("categories").select("*").eq("staff_only", true).order("sort_order"),
    ]);
    const cat = (cats || [])[0] || null;
    setCategory(cat);
    let prods = [];
    if (cat) {
      const { data } = await supabase.from("products").select("*").eq("category_id", cat.id).order("sort_order").order("name");
      prods = data || [];
    }
    setBrands(brs || []);
    setProducts(prods);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  // ---- Markalar ----
  const openNewBrand = () => { setBrandModal({ mode: "new" }); setBrandForm({ name: "", description: "", sort_order: 100 }); };
  const openEditBrand = (b) => { setBrandModal({ mode: "edit", data: b }); setBrandForm({ name: b.name, description: b.description || "", sort_order: b.sort_order || 100 }); };
  const saveBrand = async () => {
    if (busy) return;
    if (!brandForm.name?.trim()) { alert("Marka adı gerekli"); return; }
    setBusy(true);
    const payload = { name: brandForm.name.trim(), description: brandForm.description?.trim() || null, sort_order: Number(brandForm.sort_order) || 100, store_id: storeId };
    const { error } = brandModal.mode === "new"
      ? await supabase.from("brands").insert(payload)
      : await supabase.from("brands").update(payload).eq("id", brandModal.data.id);
    setBusy(false);
    if (error) { alert("Hata: " + error.message); return; }
    setBrandModal(null); load();
  };
  const delBrand = async (b) => {
    const n = products.filter(p => p.brand_id === b.id).length;
    if (!confirm('"' + b.name + '" markası silinsin mi?' + (n ? "\n\n" + n + " ürün markasız kalacak (silinmez)." : ""))) return;
    const { error } = await supabase.from("brands").delete().eq("id", b.id);
    if (error) { alert("Hata: " + error.message); return; }
    load();
  };

  // ---- Ürünler ----
  const openNewProduct = (brandId) => {
    setProdModal({ mode: "new" });
    setForm({ name: "", name_en: "", brand_id: brandId || "", price: "", retail_stock: 0, sizeSet: "Tek beden", variants: [], is_available: true });
  };
  const openEditProduct = (p) => {
    const vs = Array.isArray(p.variants) ? p.variants : [];
    setProdModal({ mode: "edit", data: p });
    setForm({
      name: p.name || "", name_en: p.name_en || "", brand_id: p.brand_id || "", price: p.price ?? "",
      retail_stock: Number(p.retail_stock) || 0,
      sizeSet: vs.length ? "Tişört / Giyim" : "Tek beden",
      variants: vs, is_available: p.is_available !== false,
    });
  };
  const setSizeSet = (key) => {
    const sizes = SIZE_SETS[key] || [];
    const prev = form.variants || [];
    const variants = sizes.map(s => ({ name: s, stock: Number(prev.find(v => v.name === s)?.stock) || 0 }));
    setForm({ ...form, sizeSet: key, variants });
  };
  const setVariantStock = (name, val) => setForm({ ...form, variants: (form.variants || []).map(v => v.name === name ? { ...v, stock: Math.max(0, Number(val) || 0) } : v) });

  const saveProduct = async () => {
    if (busy) return;
    if (!form.name?.trim()) { alert("Ürün adı gerekli"); return; }
    if (!category) { alert("Önce Menü Yönetimi'nden 'Yalnız kasada' işaretli bir kategori açın"); return; }
    setBusy(true);
    const variants = (form.variants || []).filter(v => v.name);
    const totalFromVariants = variants.reduce((s, v) => s + (Number(v.stock) || 0), 0);
    const payload = {
      name: form.name.trim(),
      name_en: form.name_en?.trim() || null,
      brand_id: form.brand_id || null,
      brand: brands.find(b => b.id === form.brand_id)?.name || null,
      price: Number(form.price) || 0,
      category_id: category.id,
      store_id: storeId,
      kitchen_destination_store_id: storeId,
      track_stock: true,
      retail_stock: variants.length ? totalFromVariants : (Number(form.retail_stock) || 0),
      variants: variants.length ? variants : null,
      is_available: form.is_available !== false,
      has_options: variants.length > 0,
      options_config: variants.length
        ? { groups: [{ name: "Beden", options: variants.map(v => v.name), required: true, price_modifiers: Object.fromEntries(variants.map(v => [v.name, 0])) }] }
        : null,
    };
    const { error } = prodModal.mode === "new"
      ? await supabase.from("products").insert(payload)
      : await supabase.from("products").update(payload).eq("id", prodModal.data.id);
    setBusy(false);
    if (error) { alert("Hata: " + error.message); return; }
    setProdModal(null); load();
  };
  const delProduct = async (p) => {
    if (!confirm('"' + p.name + '" silinsin mi?')) return;
    const { error } = await supabase.from("products").delete().eq("id", p.id);
    if (error) { alert("Silinemedi (geçmiş siparişlerde kullanılmış olabilir): " + error.message); return; }
    load();
  };

  if (loading) return (<div style={{ color: "#888", fontFamily: cv, padding: 20 }}>Yukleniyor...</div>);

  const unbranded = products.filter(p => !p.brand_id);
  const totalStock = products.reduce((s, p) => s + (Number(p.retail_stock) || 0), 0);
  const stockValue = products.reduce((s, p) => s + (Number(p.retail_stock) || 0) * (Number(p.price) || 0), 0);

  const ProductRow = ({ p }) => {
    const vs = Array.isArray(p.variants) ? p.variants : [];
    const low = Number(p.retail_stock) <= 2;
    return (
      <div style={{ background: "#161616", border: "1px solid " + (low ? "#2A2A2A" : "#2A2A2A"), borderRadius: 10, padding: 12, marginBottom: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#F0EDE8" }}>
              {p.name}
              {p.is_available === false && <span style={{ marginLeft: 6, fontSize: 9, padding: "2px 6px", background: "#333", color: "#999", borderRadius: 6, fontWeight: 700 }}>Pasif</span>}
              {low && <span style={{ marginLeft: 6, fontSize: 9, padding: "2px 6px", background: "#2A2A2A", color: "#F0EDE8", borderRadius: 6, fontWeight: 700 }}>Azalan</span>}
            </div>
            <div style={{ fontSize: 12, color: "#888", marginTop: 3 }}>
              {Number(p.price) > 0 ? <span style={{ color: "#FFFFFF", fontWeight: 700 }}>₺{p.price}</span> : <span>Serbest tutar</span>}
              <span style={{ marginLeft: 10 }}>Stok: <b style={{ color: low ? "#F0EDE8" : "#F0EDE8" }}>{p.retail_stock || 0}</b> adet</span>
            </div>
            {vs.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 7 }}>
                {vs.map(v => (
                  <span key={v.name} style={{ fontSize: 11, padding: "4px 9px", background: Number(v.stock) > 0 ? "#22262E" : "#161616", color: Number(v.stock) > 0 ? "#8A8580" : "#8A8580", borderRadius: 8, fontWeight: 700 }}>
                    {v.name}: {v.stock}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
            <button onClick={() => openEditProduct(p)} style={{ padding: "6px 10px", background: "#222", color: "#aaa", border: "1px solid #333", borderRadius: 6, fontSize: 11, cursor: "pointer" }}>Düzenle</button>
            <button onClick={() => delProduct(p)} style={{ padding: "6px 10px", background: "transparent", color: "#C87A6A", border: "1px solid #2A2A2A", borderRadius: 6, fontSize: 11, cursor: "pointer" }}>Sil</button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={{ fontFamily: cv, color: "#F0EDE8" }}>
      <div style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }}>Ürünler (Raf)</div>
      <div style={{ fontSize: 11, color: "#888", letterSpacing: "1px", marginBottom: 14 }}>
        {brands.length} MARKA · {products.length} ÜRÜN · {totalStock} ADET STOK
      </div>

      {stockValue > 0 && (
        <div style={{ background: "#161616", border: "1px solid #FFFFFF", borderRadius: 12, padding: 14, marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: "#8A8580", letterSpacing: "1.5px", fontWeight: 700 }}>RAF STOK DEĞERİ (satış fiyatıyla)</div>
          <div style={{ fontSize: 22, color: "#F0EDE8", fontWeight: 800, marginTop: 2 }}>₺{Math.round(stockValue).toLocaleString("tr-TR")}</div>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <button onClick={openNewBrand} style={{ padding: "10px 16px", background: "#FFFFFF", color: "#000", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 800, cursor: "pointer" }}>+ Yeni Marka</button>
        <button onClick={() => openNewProduct("")} style={{ padding: "10px 16px", background: "transparent", color: "#FFFFFF", border: "1px solid #FFFFFF", borderRadius: 10, fontSize: 13, fontWeight: 800, cursor: "pointer" }}>+ Yeni Ürün</button>
      </div>

      {!category && (
        <div style={{ background: "#161616", border: "1px solid #2A2A2A", borderRadius: 10, padding: 14, marginBottom: 14, fontSize: 12, color: "#C87A6A", lineHeight: 1.6 }}>
          "Yalnız kasada" işaretli bir kategori bulunamadı. Menü Yönetimi'nden bir kategori açıp "🛍 Yalnız kasada" kutusunu işaretleyin.
        </div>
      )}

      {brands.length === 0 && <div style={{ textAlign: "center", padding: 30, color: "#888888", fontSize: 13 }}>Henüz marka yok. "+ Yeni Marka" ile başlayın (örn. Not in Paris, Rapha...).</div>}

      {brands.map(b => {
        const list = products.filter(p => p.brand_id === b.id);
        const open = openBrand === b.id;
        const bStock = list.reduce((s, p) => s + (Number(p.retail_stock) || 0), 0);
        return (
          <div key={b.id} style={{ background: "#1A1A1A", border: "1px solid #2A2A2A", borderRadius: 12, marginBottom: 10, overflow: "hidden" }}>
            <div onClick={() => setOpenBrand(open ? null : b.id)} style={{ padding: 14, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: "#F0EDE8" }}>{open ? "▾" : "▸"} {b.name}</div>
                <div style={{ fontSize: 11, color: "#888", marginTop: 3 }}>
                  {list.length} ürün · {bStock} adet stok{b.description ? " · " + b.description : ""}
                </div>
              </div>
              <div style={{ display: "flex", gap: 4, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                <button onClick={() => openEditBrand(b)} style={{ padding: "6px 10px", background: "#222", color: "#aaa", border: "1px solid #333", borderRadius: 6, fontSize: 11, cursor: "pointer" }}>Düzenle</button>
                <button onClick={() => delBrand(b)} style={{ padding: "6px 10px", background: "transparent", color: "#C87A6A", border: "1px solid #2A2A2A", borderRadius: 6, fontSize: 11, cursor: "pointer" }}>Sil</button>
              </div>
            </div>
            {open && (
              <div style={{ padding: "0 12px 12px" }}>
                {list.map(p => <ProductRow key={p.id} p={p} />)}
                {list.length === 0 && <div style={{ color: "#888888", fontSize: 12, padding: "6px 0 12px" }}>Bu markada ürün yok.</div>}
                <button onClick={() => openNewProduct(b.id)} style={{ width: "100%", padding: "10px", background: "transparent", color: "#FFFFFF", border: "1px dashed #FFFFFF", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>+ {b.name} ürünü ekle</button>
              </div>
            )}
          </div>
        );
      })}

      {unbranded.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 11, color: "#888", letterSpacing: "1.5px", fontWeight: 700, marginBottom: 8 }}>Markasız ürünler</div>
          {unbranded.map(p => <ProductRow key={p.id} p={p} />)}
        </div>
      )}

      {brandModal && (
        <Modal onClose={() => setBrandModal(null)} title={brandModal.mode === "new" ? "Yeni Marka" : "Markayı Düzenle"}>
          <Field label="MARKA ADI"><input value={brandForm.name || ""} onChange={e => setBrandForm({ ...brandForm, name: e.target.value })} placeholder="örn: Not in Paris, Rapha, Seramik Atölyesi" style={inputS} /></Field>
          <Field label="AÇIKLAMA (opsiyonel)"><input value={brandForm.description || ""} onChange={e => setBrandForm({ ...brandForm, description: e.target.value })} placeholder="örn: kendi üretimimiz" style={inputS} /></Field>
          <Field label="SIRA (küçük = önce)"><input type="number" value={brandForm.sort_order || 100} onChange={e => setBrandForm({ ...brandForm, sort_order: e.target.value })} style={inputS} /></Field>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button onClick={() => setBrandModal(null)} style={cancelBtn}>İptal</button>
            <button onClick={saveBrand} disabled={busy} style={{ ...saveBtn, opacity: busy ? 0.6 : 1 }}>{busy ? "..." : "Kaydet"}</button>
          </div>
        </Modal>
      )}

      {prodModal && (
        <Modal onClose={() => setProdModal(null)} title={prodModal.mode === "new" ? "Yeni Ürün" : "Ürünü Düzenle"}>
          <Field label="ÜRÜN ADI"><input value={form.name || ""} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="örn: Bisiklet Forması" style={inputS} /></Field>
          <Field label="İNGİLİZCE ADI (opsiyonel)"><input value={form.name_en || ""} onChange={e => setForm({ ...form, name_en: e.target.value })} placeholder="e.g. Cycling Jersey" style={inputS} /></Field>
          <Field label="MARKA">
            <select value={form.brand_id || ""} onChange={e => setForm({ ...form, brand_id: e.target.value })} style={inputS}>
              <option value="">- Markasız -</option>
              {brands.map(b => (<option key={b.id} value={b.id}>{b.name}</option>))}
            </select>
          </Field>
          <Field label="SATIŞ FİYATI (₺) — 0 girersen kasada sorulur">
            <input type="number" step="0.01" value={form.price ?? ""} onChange={e => setForm({ ...form, price: e.target.value })} style={inputS} />
          </Field>

          <Field label="BEDEN">
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {Object.keys(SIZE_SETS).map(k => (
                <button key={k} onClick={() => setSizeSet(k)} style={{ padding: "8px 12px", background: form.sizeSet === k ? "#FFFFFF" : "#222", color: form.sizeSet === k ? "#000" : "#888", border: "1px solid " + (form.sizeSet === k ? "#FFFFFF" : "#333"), borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{k}</button>
              ))}
            </div>
          </Field>

          {(form.variants || []).length > 0 ? (
            <Field label="BEDEN BAZINDA STOK (adet)">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(90px,1fr))", gap: 8 }}>
                {(form.variants || []).map(v => (
                  <div key={v.name} style={{ background: "#0C0C0C", border: "1px solid #2A2A2A", borderRadius: 8, padding: 8 }}>
                    <div style={{ fontSize: 11, color: "#FFFFFF", fontWeight: 800, marginBottom: 4, textAlign: "center" }}>{v.name}</div>
                    <input type="number" min="0" value={v.stock} onChange={e => setVariantStock(v.name, e.target.value)} style={{ ...inputS, padding: "6px", textAlign: "center" }} />
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 11, color: "#888", marginTop: 6 }}>
                Toplam: <b style={{ color: "#F0EDE8" }}>{(form.variants || []).reduce((s, v) => s + (Number(v.stock) || 0), 0)}</b> adet · Kasada beden seçimi zorunlu olur, satışta o bedenden düşer.
              </div>
            </Field>
          ) : (
            <Field label="STOK (adet)"><input type="number" min="0" value={form.retail_stock || 0} onChange={e => setForm({ ...form, retail_stock: e.target.value })} style={inputS} /></Field>
          )}

          <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, cursor: "pointer" }}>
            <input type="checkbox" checked={form.is_available !== false} onChange={e => setForm({ ...form, is_available: e.target.checked })} style={{ width: 18, height: 18, accentColor: "#FFFFFF" }} />
            <span style={{ fontSize: 13, color: "#F0EDE8" }}>Satışta (kasada listelensin)</span>
          </label>

          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button onClick={() => setProdModal(null)} style={cancelBtn}>İptal</button>
            <button onClick={saveProduct} disabled={busy} style={{ ...saveBtn, opacity: busy ? 0.6 : 1 }}>{busy ? "..." : "Kaydet"}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

const inputS = { width: "100%", padding: "10px 12px", background: "#0C0C0C", border: "1px solid #2A2A2A", borderRadius: 8, color: "#F0EDE8", fontSize: 14, outline: "none", fontFamily: "inherit" };
const cancelBtn = { flex: 1, padding: "12px", background: "transparent", color: "#888", border: "1px solid #333", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: "pointer" };
const saveBtn = { flex: 2, padding: "12px", background: "#FFFFFF", color: "#000", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 800, cursor: "pointer" };

function Field({ label, children }) {
  return (<div style={{ marginBottom: 12 }}>
    <div style={{ fontSize:12, color: "#888", letterSpacing:"0.2px", fontWeight:600, marginBottom: 5 }}>{label}</div>
    {children}
  </div>);
}

function Modal({ title, children, onClose }) {
  return (<div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 100 }}>
    <div onClick={e => e.stopPropagation()} style={{ background: "#161616", border: "1px solid #2A2A2A", borderRadius: "16px 16px 0 0", padding: 20, width: "100%", maxWidth: 500, maxHeight: "90vh", overflowY: "auto" }}>
      <div style={{ fontSize: 18, fontWeight: 800, color: "#F0EDE8", marginBottom: 16 }}>{title}</div>
      {children}
    </div>
  </div>);
}
