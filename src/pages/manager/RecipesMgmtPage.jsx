import { useEffect, useState, useMemo } from "react";
import { supabase } from "../../lib/supabase.js";
import { useAuth } from "../../contexts/AuthContext.jsx";

const cv = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";
const UNITS = ["ml", "cl", "l", "g", "kg", "adet", "şişe", "porsiyon"];

// Malzeme eklenince kullanilacak varsayilan miktar
const defaultQty = (ing) => {
  if (ing.unit === "g") return 150;
  if (ing.unit === "ml") return 40;
  if (ing.unit === "cl") return 4;
  if (ing.unit === "l") return 0.2;
  return 1;
};

// Hizli miktar secimleri — isletmenin STANDART OLCUSUNE gore uretilir (Ayarlar'dan degisir).
// Bunlar sadece kisayol; miktari her zaman elle de yazabilirsin.
const presetsFor = (unit, pourCl) => {
  const p = Number(pourCl) || 4;
  const half = p / 2;
  return unit === "ml"
      ? [["Tek " + p + "cl", p * 10], ["Duble " + (p * 2) + "cl", p * 20], ["Yarım " + half + "cl", half * 10], ["Splash 1cl", 10], ["Top 10cl", 100], ["200", 200], ["330", 330], ["500", 500]]
    : unit === "cl"
      ? [["Tek " + p, p], ["Duble " + p * 2, p * 2], ["Yarım " + half, half], ["Splash 1", 1], ["Bardak 20", 20]]
    : unit === "g" ? [["Buz 150g", 150], ["Buz 250g", 250], ["5 g", 5], ["10 g", 10]]
    : unit === "adet" ? [["1", 1], ["2", 2], ["½", 0.5]]
    : [];
};

export default function RecipesMgmtPage() {
  const { staffUser } = useAuth();
  const [products, setProducts] = useState([]);
  const [kitchenCount, setKitchenCount] = useState(0);
  const [ingredients, setIngredients] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [search, setSearch] = useState("");
  const [ingSearch, setIngSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [pourCl, setPourCl] = useState(4);          // isletmenin standart olcusu (Ayarlar)
  const [aiText, setAiText] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiPreview, setAiPreview] = useState(null);
  const [copyFrom, setCopyFrom] = useState("");
  const [listFilter, setListFilter] = useState("all");

  const storeId = staffUser?.store_ids?.[0];

  const load = async () => {
    setLoading(true);
    const [{ data: prods }, { data: ings }, { data: recs }, { data: setting }] = await Promise.all([
      supabase.from("products").select("id, name, price, category_id, track_stock, kitchen_consignment, takeaway_cup, takeaway_straw, categories(name)").order("name"),
      supabase.from("ingredients").select("*").order("name"),
      supabase.from("recipes").select("*").in("store_id", staffUser?.store_ids?.length ? staffUser.store_ids : ["00000000-0000-0000-0000-000000000000"]),
      supabase.from("app_settings").select("value").eq("key", "house_pour_cl").maybeSingle(),
    ]);
    setPourCl(Number(setting?.value) || 4);
    // Raf urunlerinin recetesi olmaz. NIP Kitchen envanteri de burada gorunmez:
    // mutfak hazirliyor, maliyetini biz tutmuyoruz — "recetesi yok" listesini
    // bosuna sisirmesinler.
    setProducts((prods || []).filter(p => !p.track_stock && !p.kitchen_consignment));
    setKitchenCount((prods || []).filter(p => p.kitchen_consignment).length);
    setIngredients(ings || []);
    setRecipes(recs || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const productRecipes = (productId) => recipes.filter(r => r.product_id === productId);

  const lineCost = (r) => {
    const ing = ingredients.find(i => i.id === r.ingredient_id);
    if (!ing) return 0;
    const withWaste = Number(r.qty_per_unit) * (1 + Number(ing.waste_pct || 0) / 100);
    return withWaste * Number(ing.cost_per_unit || 0);
  };
  const calcCost = (productId) => productRecipes(productId).reduce((s, r) => s + lineCost(r), 0);

  // --- Recete satiri ekle / cikar / miktar guncelle (aninda tepki) ---
  const addIngredient = async (ing, qty) => {
    if (!selectedProduct) return;
    const exists = recipes.find(r => r.product_id === selectedProduct.id && r.ingredient_id === ing.id);
    if (exists) { alert(ing.name + " zaten reçetede — miktarını aşağıdan düzenleyebilirsin."); return; }
    const payload = { product_id: selectedProduct.id, ingredient_id: ing.id, qty_per_unit: qty ?? defaultQty(ing), store_id: storeId };
    const temp = { ...payload, id: "temp-" + Date.now() };
    setRecipes(prev => [...prev, temp]);
    setIngSearch("");
    const { data, error } = await supabase.from("recipes").insert(payload).select().single();
    if (error) { setRecipes(prev => prev.filter(r => r.id !== temp.id)); alert("Hata: " + error.message); return; }
    setRecipes(prev => prev.map(r => r.id === temp.id ? data : r));
  };

  const removeRecipe = async (r) => {
    setRecipes(prev => prev.filter(x => x.id !== r.id));
    const { error } = await supabase.from("recipes").delete().eq("id", r.id);
    if (error) { alert("Hata: " + error.message); load(); }
  };

  const setQty = async (r, val) => {
    const qty = Math.max(0, Number(val) || 0);
    setRecipes(prev => prev.map(x => x.id === r.id ? { ...x, qty_per_unit: qty } : x));
    if (String(r.id).startsWith("temp-")) return;
    const { error } = await supabase.from("recipes").update({ qty_per_unit: qty }).eq("id", r.id);
    if (error) { alert("Hata: " + error.message); load(); }
  };

  // Sadece parti gecesi tuketilen sarf (PET bardak): satis aninda
  // fn_is_party_now() bakip uygular ya da atlar.
  const setPartyOnly = async (r, val) => {
    setRecipes(prev => prev.map(x => x.id === r.id ? { ...x, party_only: val } : x));
    if (String(r.id).startsWith("temp-")) return;
    const { error } = await supabase.from("recipes").update({ party_only: val }).eq("id", r.id);
    if (error) { alert("Hata: " + error.message); load(); }
  };

  const toggleConsumable = async (ing) => {
    const existing = recipes.find(r => r.product_id === selectedProduct.id && r.ingredient_id === ing.id);
    if (existing) return removeRecipe(existing);
    return addIngredient(ing);
  };

  // Aramada bulunamayan malzemeyi aninda olustur
  const createIngredient = async (name) => {
    if (busy) return;
    const unit = prompt("Birim seç: " + UNITS.join(" / "), "ml");
    if (unit === null) return;
    if (!UNITS.includes(unit.trim())) { alert("Geçersiz birim"); return; }
    setBusy(true);
    const { data, error } = await supabase.from("ingredients")
      .insert({ name: name.trim(), unit: unit.trim(), stock_qty: 0, cost_per_unit: 0, store_id: storeId })
      .select().single();
    setBusy(false);
    if (error) { alert("Hata: " + error.message); return; }
    setIngredients(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name, "tr")));
    addIngredient(data);
  };

  // AI: serbest metinden recete kur
  const runAi = async () => {
    if (aiBusy || !aiText.trim()) return;
    setAiBusy(true); setAiPreview(null);
    try {
      const { data, error } = await supabase.functions.invoke("recipe-parse", {
        body: { text: aiText, product_name: selectedProduct?.name || "" },
      });
      if (error) throw new Error(error.message || "Sunucu hatasi");
      if (data?.error) throw new Error(data.error);
      if (!data.lines?.length) { alert("Malzeme çıkarılamadı — biraz daha açık yaz."); setAiBusy(false); return; }
      setAiPreview(data.lines);
    } catch (e) { alert("AI hatası: " + (e?.message || e)); }
    setAiBusy(false);
  };

  const applyAi = async () => {
    if (!aiPreview) return;
    setAiBusy(true);
    for (const l of aiPreview) {
      let ing = ingredients.find(i => i.id === l.ingredient_id);
      if (!ing && l.new_name) {
        const { data } = await supabase.from("ingredients")
          .insert({ name: l.new_name, unit: l.new_unit || "ml", stock_qty: 0, cost_per_unit: 0, store_id: storeId })
          .select().single();
        if (data) { ing = data; setIngredients(prev => [...prev, data]); }
      }
      if (!ing) continue;
      if (recipes.find(r => r.product_id === selectedProduct.id && r.ingredient_id === ing.id)) continue;
      const { data: rec } = await supabase.from("recipes")
        .insert({ product_id: selectedProduct.id, ingredient_id: ing.id, qty_per_unit: l.qty || defaultQty(ing), store_id: storeId })
        .select().single();
      if (rec) setRecipes(prev => [...prev, rec]);
    }
    setAiBusy(false); setAiPreview(null); setAiText("");
  };

  // Toplu: bir sarf malzemeyi bir kategorideki TUM urunlere ekle (orn. buz -> tum kokteyller)
  const bulkAddConsumable = async (ingId, categoryId) => {
    const ing = ingredients.find(i => i.id === ingId);
    if (!ing || !categoryId) return;
    const targets = products.filter(p => p.category_id === categoryId);
    const rows = targets
      .filter(p => !recipes.find(r => r.product_id === p.id && r.ingredient_id === ing.id))
      .map(p => ({ product_id: p.id, ingredient_id: ing.id, qty_per_unit: defaultQty(ing), store_id: storeId }));
    if (!rows.length) { alert("Bu kategorideki tüm ürünlerde zaten ekli"); return; }
    if (!confirm(ing.name + " → " + rows.length + " ürüne eklenecek. Devam?")) return;
    setBusy(true);
    const { data, error } = await supabase.from("recipes").insert(rows).select();
    setBusy(false);
    if (error) { alert("Hata: " + error.message); return; }
    setRecipes(prev => [...prev, ...(data || [])]);
    alert("✅ " + (data?.length || 0) + " ürüne eklendi");
  };

  // Baska bir urunun recetesini kopyala (highball'lar birbirinin ayni)
  const copyRecipe = async (fromId) => {
    if (!fromId || !selectedProduct) return;
    const src = recipes.filter(r => r.product_id === fromId);
    if (!src.length) { alert("O üründe reçete yok"); return; }
    setBusy(true);
    const mine = recipes.filter(r => r.product_id === selectedProduct.id);
    const rows = src
      .filter(r => !mine.find(m => m.ingredient_id === r.ingredient_id))
      .map(r => ({ product_id: selectedProduct.id, ingredient_id: r.ingredient_id, qty_per_unit: r.qty_per_unit, store_id: storeId }));
    if (!rows.length) { setBusy(false); alert("Tüm malzemeler zaten ekli"); return; }
    const { data, error } = await supabase.from("recipes").insert(rows).select();
    setBusy(false); setCopyFrom("");
    if (error) { alert("Hata: " + error.message); return; }
    setRecipes(prev => [...prev, ...(data || [])]);
  };

  const consumables = useMemo(() => ingredients.filter(i => i.is_consumable), [ingredients]);
  const searchResults = useMemo(() => {
    const q = ingSearch.trim().toLocaleLowerCase("tr");
    if (!q) return [];
    return ingredients.filter(i => !i.is_consumable && i.name.toLocaleLowerCase("tr").includes(q)).slice(0, 12);
  }, [ingSearch, ingredients]);

  if (loading) return (<div style={{ color: "#888", fontFamily: cv, padding: 20 }}>Yukleniyor...</div>);

  const noRecipe = products.filter(p => productRecipes(p.id).length === 0).length;
  const filtered = products
    .filter(p => !search || p.name?.toLowerCase().includes(search.toLowerCase()))
    .filter(p => listFilter === "all" ? true : listFilter === "missing" ? productRecipes(p.id).length === 0 : productRecipes(p.id).length > 0);

  // ---------- ÜRÜN DETAY: kolay reçete arayüzü ----------
  if (selectedProduct) {
    const rows = productRecipes(selectedProduct.id);
    const cost = calcCost(selectedProduct.id);            // parti gecesi (en yuksek) maliyet
    const partyExtra = rows.filter(r => r.party_only).reduce((s, r) => s + lineCost(r), 0);
    const normalCost = cost - partyExtra;                 // normal gunlerde gecerli maliyet
    const price = Number(selectedProduct.price) || 0;
    const profit = price - cost;
    const margin = price > 0 ? Math.round((profit / price) * 100) : 0;

    return (
      <div style={{ fontFamily: cv, color: "#F0EDE8", paddingBottom: 40 }}>
        <button onClick={() => { setSelectedProduct(null); setIngSearch(""); }} style={{ background: "none", border: "none", color: "#C8973E", fontSize: 13, cursor: "pointer", padding: 0, marginBottom: 10, fontWeight: 600 }}>← Tüm ürünler</button>

        <div style={{ background: "#1A1A1A", border: "1px solid #C8973E", borderRadius: 12, padding: 14, marginBottom: 14 }}>
          <div style={{ fontSize: 18, fontWeight: 800 }}>{selectedProduct.name}</div>
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <Stat label="SATIŞ" value={"₺" + price} color="#F0EDE8" />
            <Stat label="MALİYET" value={"₺" + cost.toFixed(2)} color="#FFB0B0" />
            <Stat label="KÂR" value={"₺" + profit.toFixed(2)} color="#3ECF8E" />
            <Stat label="MARJ" value={"%" + margin} color={margin >= 70 ? "#3ECF8E" : margin >= 50 ? "#E0AB4A" : "#FF8888"} />
          </div>
          {partyExtra > 0 && (
            <div style={{ fontSize: 11, color: "#888", marginTop: 10, lineHeight: 1.6 }}>
              Yukarıdaki rakamlar <b style={{ color: "#C8973E" }}>parti gecesine</b> göre (en yüksek maliyet).
              Normal günlerde maliyet <b style={{ color: "#F0EDE8" }}>₺{normalCost.toFixed(2)}</b>,
              kâr <b style={{ color: "#3ECF8E" }}>₺{(price - normalCost).toFixed(2)}</b>.
            </div>
          )}
          {selectedProduct.takeaway_cup && (
            <div style={{ fontSize: 11, color: "#888", marginTop: 8, lineHeight: 1.6, paddingTop: 8, borderTop: "1px solid #2A2A2A" }}>
              🥤 Take away seçilirse otomatik eklenir:{" "}
              <b style={{ color: "#C8973E" }}>
                {selectedProduct.takeaway_cup === "hot" ? "karton bardak" : "pet bardak"}
                {selectedProduct.takeaway_straw ? " + pipet" : ""}
              </b>
              . Bunlar reçeteye yazılmaz, satış anında stoktan düşer.
            </div>
          )}
        </div>

        {/* AI ile reçete kur */}
        <div style={{ background: "#161616", border: "1px solid #2A2A3A", borderRadius: 12, padding: 12, marginBottom: 12 }}>
          <div style={{ fontSize: 10, color: "#B8C6F0", letterSpacing: "1.5px", fontWeight: 700, marginBottom: 8 }}>🤖 REÇETEYİ YAZ, AI KURSUN</div>
          <textarea
            value={aiText} onChange={e => setAiText(e.target.value)} rows={2}
            placeholder={"örn: 3cl gin, 3cl campari, 3cl kırmızı vermut, buz, portakal kabuğu"}
            style={{ width: "100%", padding: "12px 14px", background: "#0C0C0C", border: "1px solid #2A2A2A", borderRadius: 10, color: "#F0EDE8", fontSize: 15, outline: "none", fontFamily: "inherit", resize: "vertical" }}
          />
          <button onClick={runAi} disabled={aiBusy || !aiText.trim()} style={{ width: "100%", marginTop: 8, padding: "11px", background: aiBusy ? "#555" : "#2A2A3A", color: "#B8C6F0", border: "1px solid #3A3A5A", borderRadius: 10, fontSize: 13, fontWeight: 800, cursor: aiBusy ? "wait" : "pointer" }}>
            {aiBusy ? "AI okuyor..." : "🤖 Malzemeleri çıkar"}
          </button>
          {aiPreview && (
            <div style={{ marginTop: 10, background: "#0C0C0C", border: "1px solid #2A2A3A", borderRadius: 10, padding: 10 }}>
              {aiPreview.map((l, i) => {
                const ing = ingredients.find(x => x.id === l.ingredient_id);
                return (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #1A1A1A", fontSize: 13 }}>
                    <span style={{ fontWeight: 600 }}>
                      {ing ? ing.name : <span style={{ color: "#8FD8E8" }}>＋ {l.new_name} <span style={{ color: "#666" }}>(yeni)</span></span>}
                    </span>
                    <span style={{ color: "#C8973E", fontWeight: 700 }}>{l.qty} {ing?.unit || l.new_unit}</span>
                  </div>
                );
              })}
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button onClick={() => setAiPreview(null)} style={{ flex: 1, padding: "10px", background: "transparent", color: "#888", border: "1px solid #333", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Vazgeç</button>
                <button onClick={applyAi} disabled={aiBusy} style={{ flex: 2, padding: "10px", background: "#C8973E", color: "#000", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 800, cursor: "pointer" }}>{aiBusy ? "..." : "Reçeteye ekle"}</button>
              </div>
            </div>
          )}
        </div>

        {/* Başka üründen kopyala */}
        {products.filter(p => p.id !== selectedProduct.id && productRecipes(p.id).length > 0).length > 0 && (
          <div style={{ background: "#161616", border: "1px solid #2A2A2A", borderRadius: 12, padding: 12, marginBottom: 12 }}>
            <div style={{ fontSize: 10, color: "#C8973E", letterSpacing: "1.5px", fontWeight: 700, marginBottom: 8 }}>📋 BAŞKA ÜRÜNDEN KOPYALA</div>
            <div style={{ display: "flex", gap: 8 }}>
              <select value={copyFrom} onChange={e => setCopyFrom(e.target.value)} style={{ flex: 1, padding: "10px 12px", background: "#0C0C0C", border: "1px solid #2A2A2A", borderRadius: 8, color: "#F0EDE8", fontSize: 14, outline: "none", fontFamily: "inherit" }}>
                <option value="">- Ürün seç -</option>
                {products.filter(p => p.id !== selectedProduct.id && productRecipes(p.id).length > 0).map(p => (
                  <option key={p.id} value={p.id}>{p.name} ({productRecipes(p.id).length} malzeme)</option>
                ))}
              </select>
              <button onClick={() => copyRecipe(copyFrom)} disabled={!copyFrom || busy} style={{ padding: "10px 16px", background: copyFrom ? "#C8973E" : "#222", color: copyFrom ? "#000" : "#666", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 800, cursor: copyFrom ? "pointer" : "default" }}>Kopyala</button>
            </div>
            <div style={{ fontSize: 10, color: "#666", marginTop: 6 }}>Benzer ürünlerde (highball'lar, kahveler) tek tıkla aynı reçeteyi al, sonra farklı malzemeyi değiştir.</div>
          </div>
        )}

        {/* Malzeme ara & ekle */}
        <div style={{ background: "#161616", border: "1px solid #2A2A2A", borderRadius: 12, padding: 12, marginBottom: 12 }}>
          <div style={{ fontSize: 10, color: "#C8973E", letterSpacing: "1.5px", fontWeight: 700, marginBottom: 8 }}>🔎 MALZEME EKLE</div>
          <input
            value={ingSearch}
            onChange={e => setIngSearch(e.target.value)}
            placeholder="Yaz ve seç: gin, limon suyu, şeker şurubu, tonik..."
            style={{ width: "100%", padding: "12px 14px", background: "#0C0C0C", border: "1px solid #2A2A2A", borderRadius: 10, color: "#F0EDE8", fontSize: 15, outline: "none", fontFamily: "inherit" }}
          />
          {ingSearch.trim() && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
              {searchResults.map(ing => (
                <button key={ing.id} onClick={() => addIngredient(ing)} style={{ padding: "10px 12px", background: "#222", color: "#F0EDE8", border: "1px solid #3A3A3A", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                  + {ing.name} <span style={{ color: "#888", fontWeight: 600 }}>({ing.unit})</span>
                </button>
              ))}
              {searchResults.length === 0 && (
                <button onClick={() => createIngredient(ingSearch)} disabled={busy} style={{ padding: "10px 12px", background: "#1E3A42", color: "#8FD8E8", border: "1px dashed #3E7A8A", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                  ＋ "{ingSearch.trim()}" adında yeni malzeme oluştur
                </button>
              )}
            </div>
          )}
        </div>

        {/* Sarf malzemeler — tek dokunuş */}
        {consumables.length > 0 && (
          <div style={{ background: "#12181A", border: "1px solid #1E3A42", borderRadius: 12, padding: 12, marginBottom: 12 }}>
            <div style={{ fontSize: 10, color: "#8FD8E8", letterSpacing: "1.5px", fontWeight: 700, marginBottom: 8 }}>🧊 SARF MALZEMELER</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {consumables.map(ing => {
                const on = !!rows.find(r => r.ingredient_id === ing.id);
                return (
                  <button key={ing.id} onClick={() => toggleConsumable(ing)} style={{ display: "flex", alignItems: "center", gap: 7, padding: "10px 12px", background: on ? "#1E3A42" : "#161616", color: on ? "#8FD8E8" : "#888", border: "1px solid " + (on ? "#3E7A8A" : "#2A2A2A"), borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                    <span style={{ width: 16, height: 16, borderRadius: 4, border: "2px solid " + (on ? "#8FD8E8" : "#555"), background: on ? "#8FD8E8" : "transparent", color: "#12181A", fontSize: 12, lineHeight: "12px", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900 }}>{on ? "✓" : ""}</span>
                    {ing.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Reçete satırları — miktar satır içinde düzenlenir */}
        <div style={{ fontSize: 10, color: "#888", letterSpacing: "1.5px", fontWeight: 700, marginBottom: 8 }}>REÇETE ({rows.length} MALZEME)</div>
        {rows.length === 0 && <div style={{ textAlign: "center", padding: 24, color: "#666", fontSize: 12, background: "#161616", borderRadius: 10, marginBottom: 10 }}>Henüz malzeme yok — yukarıdan arayıp ekle.</div>}

        {rows.map(r => {
          const ing = ingredients.find(i => i.id === r.ingredient_id);
          if (!ing) return null;
          const presets = presetsFor(ing.unit, pourCl);
          const c = lineCost(r);
          const step = ing.unit === "adet" ? 1 : ing.unit === "cl" ? 0.5 : ing.unit === "l" ? 0.05 : 5;
          return (
            <div key={r.id} style={{ background: "#1A1A1A", border: "1px solid #2A2A2A", borderRadius: 10, padding: 12, marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{ing.name}</div>
                  <div style={{ fontSize: 11, color: c > 0 ? "#C8973E" : "#775544", marginTop: 2, fontWeight: 600 }}>
                    {c > 0 ? "₺" + c.toFixed(2) : "⚠ maliyet girilmemiş"}
                    {Number(ing.waste_pct) > 0 && <span style={{ color: "#FFD088" }}> · +%{ing.waste_pct} fire</span>}
                  </div>
                </div>
                <button onClick={() => removeRecipe(r)} style={{ padding: "8px 12px", background: "transparent", color: "#FF6666", border: "1px solid #553333", borderRadius: 8, fontSize: 11, cursor: "pointer", flexShrink: 0 }}>Sil</button>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button onClick={() => setQty(r, Number(r.qty_per_unit) - step)} style={qtyBtn}>−</button>
                <input type="number" step="0.01" value={r.qty_per_unit} onChange={e => setQty(r, e.target.value)}
                  style={{ width: 90, padding: "10px", background: "#0C0C0C", border: "1px solid #3A3A3A", borderRadius: 8, color: "#F0EDE8", fontSize: 16, textAlign: "center", outline: "none", fontFamily: "inherit", fontWeight: 700 }} />
                <span style={{ color: "#888", fontSize: 13, fontWeight: 700 }}>{ing.unit}</span>
                <button onClick={() => setQty(r, Number(r.qty_per_unit) + step)} style={qtyBtn}>+</button>
                <span style={{ color: "#555", fontSize: 10, marginLeft: 4 }}>istediğin değeri yazabilirsin</span>
              </div>
              {presets.length > 0 && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                  {presets.map(([lbl, val]) => (
                    <button key={lbl} onClick={() => setQty(r, val)} style={{ padding: "6px 10px", background: Number(r.qty_per_unit) === val ? "#C8973E" : "#222", color: Number(r.qty_per_unit) === val ? "#000" : "#999", border: "1px solid " + (Number(r.qty_per_unit) === val ? "#C8973E" : "#333"), borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>{lbl}</button>
                  ))}
                </div>
              )}
              {ing.is_consumable && (
                <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, paddingTop: 10, borderTop: "1px solid #262626", cursor: "pointer", userSelect: "none" }}>
                  <input type="checkbox" checked={!!r.party_only} onChange={e => setPartyOnly(r, e.target.checked)}
                    style={{ width: 18, height: 18, accentColor: "#C8973E", cursor: "pointer" }} />
                  <span style={{ fontSize: 12, color: r.party_only ? "#C8973E" : "#888", fontWeight: r.party_only ? 700 : 500 }}>
                    🎉 Sadece parti gecesi kullanılır
                  </span>
                </label>
              )}
              {r.party_only && (
                <div style={{ fontSize: 10, color: "#666", marginTop: 5, lineHeight: 1.5 }}>
                  Yalnız Ayarlar&apos;daki parti gün ve saatlerinde stoktan düşer; diğer zamanlarda hiç sayılmaz.
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // ---------- ÜRÜN LİSTESİ ----------
  return (
    <div style={{ fontFamily: cv, color: "#F0EDE8" }}>
      <div style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }}>Reçeteler</div>
      <div style={{ fontSize: 11, color: "#888", letterSpacing: "1px", marginBottom: 14 }}>
        {recipes.length} SATIR · {products.length} ÜRÜN{noRecipe > 0 ? " · " + noRecipe + " ÜRÜNÜN REÇETESİ YOK" : ""}
      </div>
      {kitchenCount > 0 && (
        <div style={{ fontSize: 11, color: "#777", background: "#141414", border: "1px solid #242424", borderRadius: 8, padding: "8px 10px", marginBottom: 14, lineHeight: 1.5 }}>
          🥙 {kitchenCount} ürün <b>NIP Kitchen envanteri</b> — mutfak hazırlıyor, maliyeti bizde tutulmuyor. Bu listede yer almazlar.
        </div>
      )}

      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Ürün ara..." style={{ width: "100%", padding: "12px 14px", background: "#1A1A1A", border: "1px solid #2A2A2A", borderRadius: 10, color: "#F0EDE8", fontSize: 14, outline: "none", marginBottom: 10, fontFamily: "inherit" }} />

      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        {[["all", "TÜMÜ"], ["missing", "REÇETESİ YOK (" + noRecipe + ")"], ["done", "REÇETELİ"]].map(([k, l]) => (
          <button key={k} onClick={() => setListFilter(k)} style={{ padding: "8px 14px", border: "none", borderRadius: 16, fontSize: 11, fontWeight: 700, letterSpacing: "0.5px", background: listFilter === k ? "#C8973E" : "#222", color: listFilter === k ? "#000" : "#888", cursor: "pointer" }}>{l}</button>
        ))}
      </div>

      {consumables.length > 0 && (
        <details style={{ background: "#12181A", border: "1px solid #1E3A42", borderRadius: 12, padding: 12, marginBottom: 12 }}>
          <summary style={{ fontSize: 11, color: "#8FD8E8", letterSpacing: "1.5px", fontWeight: 700, cursor: "pointer" }}>🧊 TOPLU SARF EKLE (buz → tüm kokteyller gibi)</summary>
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <select id="bulk-ing" style={{ flex: "1 1 130px", padding: "10px", background: "#0C0C0C", border: "1px solid #2A2A2A", borderRadius: 8, color: "#F0EDE8", fontSize: 13, fontFamily: "inherit" }}>
              {consumables.map(i => (<option key={i.id} value={i.id}>{i.name}</option>))}
            </select>
            <select id="bulk-cat" style={{ flex: "1 1 130px", padding: "10px", background: "#0C0C0C", border: "1px solid #2A2A2A", borderRadius: 8, color: "#F0EDE8", fontSize: 13, fontFamily: "inherit" }}>
              {[...new Map(products.filter(p => p.category_id).map(p => [p.category_id, p.categories?.name || "Kategori"])).entries()]
                .map(([id, name]) => (<option key={id} value={id}>{name}</option>))}
            </select>
            <button onClick={() => bulkAddConsumable(document.getElementById("bulk-ing").value, document.getElementById("bulk-cat").value)}
              disabled={busy} style={{ padding: "10px 16px", background: "#C8973E", color: "#000", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 800, cursor: "pointer" }}>Uygula</button>
          </div>
        </details>
      )}

      {filtered.map(p => {
        const n = productRecipes(p.id).length;
        const cost = calcCost(p.id);
        const price = Number(p.price) || 0;
        const margin = price > 0 && cost > 0 ? Math.round(((price - cost) / price) * 100) : null;
        return (
          <div key={p.id} onClick={() => setSelectedProduct(p)} style={{ background: "#1A1A1A", border: "1px solid #2A2A2A", borderRadius: 10, padding: 12, marginBottom: 8, cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{p.name}</div>
              <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>
                {p.categories?.name && <span style={{ marginRight: 8 }}>{p.categories.name}</span>}
                {n > 0 ? <span style={{ color: "#3ECF8E" }}>{n} malzeme</span> : <span style={{ color: "#775544" }}>reçete yok</span>}
              </div>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#C8973E" }}>₺{p.price}</div>
              {cost > 0 && <div style={{ fontSize: 10, color: "#888", marginTop: 2 }}>maliyet ₺{cost.toFixed(2)}{margin !== null ? " · %" + margin : ""}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const qtyBtn = { width: 44, height: 44, background: "#2A2A2A", color: "#fff", border: "none", borderRadius: 10, fontSize: 22, cursor: "pointer", fontWeight: 700, flexShrink: 0 };

function Stat({ label, value, color }) {
  return (
    <div style={{ background: "#0C0C0C", borderRadius: 10, padding: "8px 12px", flex: "1 1 70px", textAlign: "center" }}>
      <div style={{ fontSize: 9, color: "#777", letterSpacing: "1px", fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 800, color, marginTop: 2 }}>{value}</div>
    </div>
  );
}
