import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase.js";
import { useAuth } from "../../contexts/AuthContext.jsx";
import Ikon from "../../components/Ikon.jsx";
import StokEkleSheet, { stokGeriAl } from "../../components/StokEkleSheet.jsx";
import SayiGirisi from "../../components/SayiGirisi.jsx";

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
  // Modaldeki stok kutulari mevcudun UZERINE yazar (beden sayilari dahil).
  // Gelen yeni parti icin satirdaki "+ Stok": sunucuda stok = stok + miktar.
  const [ekle, setEkle] = useState(null);
  const [sonGiris, setSonGiris] = useState(null);

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
  // Donen deger: silindi mi. Pencere ancak silme gerceklestiyse kapanir.
  const delBrand = async (b) => {
    const n = products.filter(p => p.brand_id === b.id).length;
    if (!confirm('"' + b.name + '" markası silinsin mi?' + (n ? "\n\n" + n + " ürün markasız kalacak (silinmez)." : ""))) return false;
    const { error } = await supabase.from("brands").delete().eq("id", b.id);
    if (error) { alert("Hata: " + error.message); return false; }
    load();
    return true;
  };

  // ---- Ürünler ----
  const openNewProduct = (brandId) => {
    setStokIlk(null);
    setProdModal({ mode: "new" });
    setForm({ name: "", name_en: "", brand_id: brandId || "", price: "", retail_stock: 0, sizeSet: "Tek beden", variants: [], is_available: true });
  };
  // Stok imzasi: modal acilirken ne gorduysek o. Kaydederken ayniysa stok
  // alanlarina HIC dokunmayiz — yoksa yalniz fiyati duzeltmek bile modal
  // acikken satilan urunu rafa geri koyardi (ve o yanlis sayi Shopify'a giderdi).
  const stokImzasi = (rs, vs) => JSON.stringify([Number(rs) || 0, (vs || []).map(v => [v.name, Number(v.stock) || 0])]);
  const [stokIlk, setStokIlk] = useState(null);

  const openEditProduct = (p) => {
    const vs = Array.isArray(p.variants) ? p.variants : [];
    // Imza kaydetmedeki ile AYNI kaynaktan kurulmali: bedenli urunde toplam
    // bedenlerden hesaplanir. retail_stock ile beden toplami ayrismis olabilir
    // (satis tetigi ikisini bagimsiz kirpiyor) ve imza tutmazsa koruma calismaz.
    setStokIlk(stokImzasi(vs.length ? vs.reduce((s, v) => s + (Number(v.stock) || 0), 0) : p.retail_stock, vs));
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
    // Eski bedenin tum alanlari korunur: shopify_variant_id / inventory_item_id
    // silinirse urun Shopify ile baglantisini kaybeder, stok magazaya gitmez.
    const variants = sizes.map(s => {
      const eski = prev.find(v => v.name === s);
      return eski ? { ...eski, stock: Number(eski.stock) || 0 } : { name: s, stock: 0 };
    });
    setForm(f => ({ ...f, sizeSet: key, variants }));
  };
  const setVariantStock = (name, val) => setForm(f => ({ ...f, variants: (f.variants || []).map(v => v.name === name ? { ...v, stock: Math.max(0, Number(val) || 0) } : v) }));

  const saveProduct = async () => {
    if (busy) return;
    if (!form.name?.trim()) { alert("Ürün adı gerekli"); return; }
    if (!category) { alert("Önce Menü Yönetimi'nden 'Yalnız kasada' işaretli bir kategori açın"); return; }
    setBusy(true);
    const variants = (form.variants || []).filter(v => v.name);
    const totalFromVariants = variants.reduce((s, v) => s + (Number(v.stock) || 0), 0);
    const stokDegismedi = prodModal.mode === "edit" && stokIlk != null
      && stokImzasi(variants.length ? totalFromVariants : form.retail_stock, variants) === stokIlk;
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
      // Stoga dokunulmadiysa yazma: satis bu modal acikken olmus olabilir.
      ...(stokDegismedi ? {} : {
        retail_stock: variants.length ? totalFromVariants : (Number(form.retail_stock) || 0),
        variants: variants.length ? variants : null,
      }),
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
  const stokEkleAc = (p) => {
    const vs = Array.isArray(p.variants) ? p.variants.filter(v => v?.name) : [];
    setEkle({ tur:"urun", id:p.id, ad:p.name, stok:Number(p.retail_stock)||0, bedenler:vs, takipsiz: p.track_stock !== true, storeId: p.store_id });
  };
  const girisBitti = (s) => { setEkle(null); setSonGiris(s); load(); };
  const geriAl = async () => {
    if (!sonGiris) return;
    const { error } = await stokGeriAl(sonGiris);
    if (error) { alert("Geri alinamadi: " + error.message); return; }
    setSonGiris(null); load();
  };

  // Donen deger: silindi mi. Pencerenin dibindeki "Bu urunu sil" buna bakar —
  // onay kutusunda "Iptal" denince pencere ACIK kalmali, yoksa kaydedilmemis
  // fiyat degisikligi sessizce ucuyordu.
  const delProduct = async (p) => {
    if (!confirm('"' + p.name + '" silinsin mi?')) return false;
    const { error } = await supabase.from("products").delete().eq("id", p.id);
    if (error) { alert("Silinemedi (geçmiş siparişlerde kullanılmış olabilir): " + error.message); return false; }
    load();
    return true;
  };

  if (loading) return (<div style={{ color: "#888", fontFamily: cv, padding: 20 }}>Yukleniyor...</div>);

  const unbranded = products.filter(p => !p.brand_id);
  const totalStock = products.reduce((s, p) => s + (Number(p.retail_stock) || 0), 0);
  const stockValue = products.reduce((s, p) => s + (Number(p.retail_stock) || 0) * (Number(p.price) || 0), 0);

  // SAHIP: "Arayuz cok komplike, kafa karistirici." Kartta eskiden ayni anda
  // Duzenle, Sil, uc rozet ve cok satira tasan beden rozetleri vardi; listedeki
  // "Sil"e yanlislikla dokunmak urunu goturuyordu. Artik: karta dokun =
  // duzenle, silme urun penceresinin dibinde, kartta yalniz gunluk is olan
  // "+ Stok" kaliyor. Veri akisi, stok hesaplari ve sorgular aynen duruyor.
  const ProductRow = ({ p }) => {
    const vs = Array.isArray(p.variants) ? p.variants : [];
    const stok = Number(p.retail_stock) || 0;
    const low = Number(p.retail_stock) <= 2;
    // "Tukendi" rozeti bedenli urunde BEDEN TOPLAMINDAN hesaplanir: retail_stock
    // ile beden toplami ayrisabiliyor (satis tetigi ikisini bagimsiz kirpiyor),
    // ayrisinca kart ustte "Tukendi" derken altta "M 4" yaziyordu.
    const bedenToplam = vs.reduce((s, v) => s + (Number(v.stock) || 0), 0);
    const bitti = vs.length ? bedenToplam <= 0 : stok <= 0;
    // Rozet enflasyonu yerine tek silik satir: aksiyon gerektirmeyen bilgiler
    // (kapali, serbest tutar) alt nota iner. "Kapali" kelimesi Menu
    // Yonetimi'ndekiyle ayni — ayni alan iki ekranda iki isim tasimasin.
    // Fiyat da alt satirda: bu bir STOK ekrani, ust satirda adin yaninda duran
    // tek sayi stok olsun. Fiyat ustteyken telefonda urun adi "Fethiye Lo..."
    // diye kirpiliyordu.
    const notlar = [
      Number(p.price) > 0 ? "₺" + p.price : "Serbest tutar",
      p.is_available === false && "Kapalı",
    ].filter(Boolean);
    return (
      // role/tabIndex/Enter: kart tiklanabilir bir div oldu; klavyeyle gezen
      // masaustu kullanicisi urun duzenlemeye ulasamaz olmasin.
      <div onClick={() => openEditProduct(p)} role="button" tabIndex={0} aria-label={p.name + " — düzenle"}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openEditProduct(p); } }}
        style={{ background: "#161616", border: "1px solid #2A2A2A", borderRadius: 10, padding: "10px 12px", marginBottom: 8, display: "flex", alignItems: "center", gap: 10, cursor: "pointer", opacity: p.is_available === false ? 0.55 : 1 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#F0EDE8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
            {bitti && <span style={{ fontSize: 9, padding: "2px 6px", background: "rgba(200,122,106,0.15)", color: "#C87A6A", borderRadius: 6, fontWeight: 700, flexShrink: 0 }}>Tükendi</span>}
            {low && !bitti && <span style={{ fontSize: 9, padding: "2px 6px", background: "#2A2A2A", color: "#F0EDE8", borderRadius: 6, fontWeight: 700, flexShrink: 0 }}>Azalan</span>}
            <div style={{ marginLeft: "auto", fontSize: 15, color: "#FFFFFF", fontWeight: 800, flexShrink: 0, whiteSpace: "nowrap" }}>
              {stok}<span style={{ color: "#8A8580", fontWeight: 700, fontSize: 11, marginLeft: 3 }}>adet</span>
            </div>
          </div>
          {/* Bu satir SARAR, kirpilmaz: alti bedenli tisortte "hangi beden
              bitti" listeden bakilan isin kendisi, uc noktaya kurban gitmesin. */}
          {(vs.length > 0 || notlar.length > 0) && (
            <div style={{ fontSize: 11, color: "#8A8580", marginTop: 3, lineHeight: 1.6 }}>
              {vs.map((v, i) => (
                <span key={v.name} style={{ color: Number(v.stock) < 0 ? "#C87A6A" : Number(v.stock) > 0 ? "#8A8580" : "#555" }}>
                  {i > 0 ? " · " : ""}{v.name} {v.stock}
                </span>
              ))}
              {vs.length > 0 && notlar.length > 0 ? " · " : ""}{notlar.join(" · ")}
            </div>
          )}
        </div>
        {/* stopPropagation sart: yoksa stok sayfasi ile birlikte urun duzenleme
            penceresi de acilir. */}
        {/* Dokunma hedefi 44 px kalir: kartin tamami tiklanabilir oldugu icin
            isabetsiz dokunus artik duzenleme penceresini aciyor — hedefi
            kucultmek en sik yapilan isi (mal girisi) riske atardi. */}
        <button onClick={(e) => { e.stopPropagation(); stokEkleAc(p); }} title="Stoğa ekle"
          style={{ padding: "10px 12px", minHeight: 44, background: "transparent", color: "#FFFFFF", border: "1px solid #FFFFFF", borderRadius: 9, fontSize: 12, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 5, flexShrink: 0, fontFamily: "inherit" }}>
          <Ikon ad="ekle" boy={13} /> Stok
        </button>
        <Ikon ad="oksag" boy={14} style={{ color: "#555", flexShrink: 0 }} />
      </div>
    );
  };

  return (
    <div style={{ fontFamily: cv, color: "#F0EDE8" }}>
      <div style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }}>Ürünler (Raf)</div>
      <div style={{ fontSize: 11, color: "#888", letterSpacing: "1px", marginBottom: 14 }}>
        {brands.length} MARKA · {products.length} ÜRÜN · {totalStock} ADET STOK
      </div>

      {sonGiris && (
        <div style={{ background: "#161616", border: "1px solid #FFFFFF", borderRadius: 12, padding: "11px 14px", marginBottom: 12, display: "flex", alignItems: "center", gap: 10 }}>
          <Ikon ad="onayli" boy={16} style={{ color: "#FFFFFF", flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0, fontSize: 13 }}>
            <b>{sonGiris.kalem}{sonGiris.beden ? " · " + sonGiris.beden : ""}</b> · {Number(sonGiris.onceki)} → <b>{Number(sonGiris.sonraki)}</b> adet kaydedildi
          </div>
          <button onClick={geriAl} style={{ padding: "8px 12px", minHeight: 38, background: "transparent", color: "#C87A6A", border: "1px solid #2A2A2A", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", flexShrink: 0, fontFamily: "inherit" }}>Geri al</button>
          <button onClick={() => setSonGiris(null)} aria-label="Kapat" style={{ background: "transparent", border: "none", color: "#666", cursor: "pointer", padding: 4, flexShrink: 0 }}><Ikon ad="kapat" boy={13} /></button>
        </div>
      )}

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
          "Yalnız kasada" işaretli bir kategori bulunamadı. Menü Yönetimi'nden bir kategori açıp "Yalnız kasada" kutusunu işaretleyin.
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
                <div style={{ fontSize: 16, fontWeight: 800, color: "#F0EDE8" }}><Ikon ad={open ? "asagi" : "sag"} boy={15} style={{marginRight:7}}/>{b.name}</div>
                <div style={{ fontSize: 11, color: "#888", marginTop: 3 }}>
                  {list.length} ürün · {bStock} adet stok{b.description ? " · " + b.description : ""}
                </div>
              </div>
              {/* Marka silme de listeden kalkti, marka penceresinin dibine indi.
                  stopPropagation olmadan Duzenle'ye basmak markayi acip kapatir. */}
              <button onClick={(e) => { e.stopPropagation(); openEditBrand(b); }} style={{ padding: "6px 10px", background: "transparent", color: "#8A8580", border: "1px solid #2A2A2A", borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>Markayı düzenle</button>
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
          <Field label="MARKA ADI"><input value={brandForm.name || ""} onChange={e => setBrandForm(f => ({ ...f, name: e.target.value }))} placeholder="örn: Not in Paris, Rapha, Seramik Atölyesi" style={inputS} /></Field>
          <Field label="AÇIKLAMA (opsiyonel)"><input value={brandForm.description || ""} onChange={e => setBrandForm(f => ({ ...f, description: e.target.value }))} placeholder="örn: kendi üretimimiz" style={inputS} /></Field>
          <Field label="SIRA (küçük = önce)"><SayiGirisi kip="tam" value={brandForm.sort_order || 100} onChange={v => setBrandForm(f => ({ ...f, sort_order: v }))} style={inputS} /></Field>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button onClick={() => setBrandModal(null)} style={cancelBtn}>İptal</button>
            <button onClick={saveBrand} disabled={busy} style={{ ...saveBtn, opacity: busy ? 0.6 : 1 }}>{busy ? "..." : "Kaydet"}</button>
          </div>
          {/* Silme listede degil burada: yanlislikla dokunulan "Sil" markayi
              goturuyordu. */}
          {brandModal.mode !== "new" && (
            <button onClick={async () => { const b = brandModal.data; if (await delBrand(b)) setBrandModal(null); }} style={silBtn}>Bu markayı sil</button>
          )}
        </Modal>
      )}

      {prodModal && (
        <Modal onClose={() => setProdModal(null)} title={prodModal.mode === "new" ? "Yeni Ürün" : "Ürünü Düzenle"}>
          <Field label="ÜRÜN ADI"><input value={form.name || ""} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="örn: Bisiklet Forması" style={inputS} /></Field>
          <Field label="İNGİLİZCE ADI (opsiyonel)"><input value={form.name_en || ""} onChange={e => setForm(f => ({ ...f, name_en: e.target.value }))} placeholder="e.g. Cycling Jersey" style={inputS} /></Field>
          <Field label="MARKA">
            <select value={form.brand_id || ""} onChange={e => setForm(f => ({ ...f, brand_id: e.target.value }))} style={inputS}>
              <option value="">- Markasız -</option>
              {brands.map(b => (<option key={b.id} value={b.id}>{b.name}</option>))}
            </select>
          </Field>
          <Field label="SATIŞ FİYATI (₺) — 0 girersen kasada sorulur">
            <SayiGirisi kip="para" value={form.price ?? ""} onChange={v => setForm(f => ({ ...f, price: v }))} style={inputS} />
          </Field>

          <Field label="BEDEN">
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {Object.keys(SIZE_SETS).map(k => (
                <button key={k} onClick={() => setSizeSet(k)} style={{ padding: "8px 12px", background: form.sizeSet === k ? "#FFFFFF" : "#222", color: form.sizeSet === k ? "#000" : "#888", border: "1px solid " + (form.sizeSet === k ? "#FFFFFF" : "#333"), borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{k}</button>
              ))}
            </div>
          </Field>

          {prodModal.mode === "edit" && (
            <div style={{ background: "#0C0C0C", border: "1px solid #2A2A2A", borderRadius: 10, padding: "10px 12px", marginBottom: 12, fontSize: 12, color: "#8A8580", lineHeight: 1.6 }}>
              Aşağıdaki stok kutuları mevcudun <b style={{ color: "#F0EDE8" }}>üzerine yazar</b>. Yeni gelen partiyi eklemek için modalı kapatıp ürün satırındaki <b style={{ color: "#F0EDE8" }}>+ Stok</b>'u kullan.
            </div>
          )}

          {(form.variants || []).length > 0 ? (
            <Field label="BEDEN BAZINDA STOK (adet)">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(90px,1fr))", gap: 8 }}>
                {(form.variants || []).map(v => (
                  <div key={v.name} style={{ background: "#0C0C0C", border: "1px solid #2A2A2A", borderRadius: 8, padding: 8 }}>
                    <div style={{ fontSize: 11, color: "#FFFFFF", fontWeight: 800, marginBottom: 4, textAlign: "center" }}>{v.name}</div>
                    <SayiGirisi kip="tam" min={0} value={v.stock} onChange={deger => setVariantStock(v.name, deger)} style={{ ...inputS, padding: "6px", textAlign: "center" }} />
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 11, color: "#888", marginTop: 6 }}>
                Toplam: <b style={{ color: "#F0EDE8" }}>{(form.variants || []).reduce((s, v) => s + (Number(v.stock) || 0), 0)}</b> adet · Kasada beden seçimi zorunlu olur, satışta o bedenden düşer.
              </div>
            </Field>
          ) : (
            <Field label="STOK (adet)"><SayiGirisi kip="tam" min={0} value={form.retail_stock || 0} onChange={v => setForm(f => ({ ...f, retail_stock: v }))} style={inputS} /></Field>
          )}

          <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, cursor: "pointer" }}>
            <input type="checkbox" checked={form.is_available !== false} onChange={e => setForm(f => ({ ...f, is_available: e.target.checked }))} style={{ width: 18, height: 18, accentColor: "#FFFFFF" }} />
            <span style={{ fontSize: 13, color: "#F0EDE8" }}>Satışta (kasada listelensin)</span>
          </label>

          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button onClick={() => setProdModal(null)} style={cancelBtn}>İptal</button>
            <button onClick={saveProduct} disabled={busy} style={{ ...saveBtn, opacity: busy ? 0.6 : 1 }}>{busy ? "..." : "Kaydet"}</button>
          </div>
          {/* Silme listede degil burada: karttaki "Sil" dugmesine yanlislikla
              dokunmak urunu goturuyordu. */}
          {prodModal.mode !== "new" && (
            <button onClick={async () => { const p = prodModal.data; if (await delProduct(p)) setProdModal(null); }} style={silBtn}>Bu ürünü sil</button>
          )}
        </Modal>
      )}

      {ekle && (
        <StokEkleSheet kalem={ekle} storeId={storeId} onKapat={() => setEkle(null)} onBitti={girisBitti} />
      )}
    </div>
  );
}

const inputS = { width: "100%", padding: "10px 12px", background: "#0C0C0C", border: "1px solid #2A2A2A", borderRadius: 8, color: "#F0EDE8", fontSize: 14, outline: "none", fontFamily: "inherit" };
const cancelBtn = { flex: 1, padding: "12px", background: "transparent", color: "#888", border: "1px solid #333", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: "pointer" };
const saveBtn = { flex: 2, padding: "12px", background: "#FFFFFF", color: "#000", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 800, cursor: "pointer" };
const silBtn = { width: "100%", marginTop: 10, padding: "11px", background: "transparent", color: "#C87A6A", border: "1px solid #2A2A2A", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" };

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
