import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase.js";
import { happyHourPrices } from "../../lib/happyHour.js";
import { optionsText, optionMod } from "../../lib/productOptions.js";
import { useAuth } from "../../contexts/AuthContext.jsx";

const cv = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";

export default function OrderDetailPage() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const { staffUser } = useAuth(); // ikramda "kim verdi" kaydi icin

  const [order, setOrder] = useState(null);
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [takeawayMode, setTakeawayMode] = useState(false);
  const [optModal, setOptModal] = useState(null); // {p, sel} — secenekli urun secimi
  const [treatModal, setTreatModal] = useState(null); // ikramda "kim veriyor?" secimi
  const [staffList, setStaffList] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [memberPrices, setMemberPrices] = useState({});
  const [tables, setTables] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectedCat, setSelectedCat] = useState(null);
  const [prodSearch, setProdSearch] = useState("");
  const [hhPrices, setHhPrices] = useState({}); // happy hour: { urun_id: fiyat }
  const [menuOpen, setMenuOpen] = useState(true);
  const [sonEklenen, setSonEklenen] = useState(null); // { id, ad, adet } — "Geri al" icin
  const [customerNameEdit, setCustomerNameEdit] = useState("");
  const [orderNote, setOrderNote] = useState("");

  // Sabit veriler (menü, kategoriler, masalar) yalniz ilk aciliste yuklenir;
  // siparis verisi hafif sorguyla tazelenir — her dokunusta tam yukleme YOK.
  const load = async () => {
    setLoading(true);
    const [{data: o}, {data: its}, {data: cats}, {data: prods}, {data: tabs}, {data: custs}, {data: stf}] = await Promise.all([
      supabase.from("orders").select("*, stores:origin_store_id(slug, name)").eq("id", orderId).maybeSingle(),
      supabase.from("order_items").select("*").eq("order_id", orderId).order("created_at"),
      supabase.from("categories").select("*").eq("is_active", true).order("sort_order"),
      supabase.from("products").select("*").eq("is_available", true).order("sort_order"),
      supabase.from("cafe_tables").select("id, name"),
      supabase.from("customers").select("id, name, phone").order("name"),
      supabase.from("staff").select("id, name, role").eq("is_active", true),
    ]);
    // Happy hour kurallari: kasada da ayni indirimli fiyat uygulanir
    const { data: hhRules } = await supabase.from("happy_hour_rules").select("*").eq("is_active", true);
    setHhPrices(happyHourPrices(prods || [], hhRules || [], new Date()));
    setOrder(o);
    setItems(its || []);
    setCategories(cats || []);
    setProducts(prods || []);
    setCustomers(custs || []);
    setStaffList(stf || []);
    const tMap = {}; (tabs||[]).forEach(t => { tMap[t.id] = t.name; });
    setTables(tMap);
    // Ilk sekme: bos ust kategori degil, icinde urun olan ilk kategori
    if (cats && cats.length && !selectedCat) {
      const withProds = cats.find(c => (prods || []).some(p => p.category_id === c.id));
      setSelectedCat((withProds || cats[0]).id);
    }
    if (o) { setCustomerNameEdit(o.customer_name || ""); setOrderNote(o.note || ""); }
    if (o?.customer_id) loadMemberPrices(o.customer_id); else setMemberPrices({});
    setLoading(false);
  };

  // Uyeye ozel fiyatlar: kasadan eklenen urunlerde de gecerli olmali
  const loadMemberPrices = async (customerId) => {
    const { data } = await supabase.from("member_discounts")
      .select("product_id, amount, price").eq("customer_id", customerId).eq("is_active", true);
    const map = {};
    (data || []).forEach(d => {
      if (d.price != null) map[d.product_id] = Number(d.price);
      else if (Number(d.amount) > 0) map[d.product_id] = { legacyAmount: Number(d.amount) };
    });
    setMemberPrices(map);
  };

  const memberPriceFor = (p) => {
    const v = memberPrices[p.id];
    if (v == null) return null;
    if (typeof v === "object") return Math.max(0, Math.round(Number(p.price) - v.legacyAmount));
    return Math.max(0, Math.round(Number(v)));
  };

  const linkCustomer = async (custId) => {
    const c = customers.find(x => x.id === custId) || null;
    const patch = { customer_id: custId || null };
    if (c?.name) patch.customer_name = c.name;
    const { error } = await supabase.from("orders").update(patch).eq("id", orderId);
    if (error) { alert("Üye bağlanamadı: " + error.message); return; }
    setOrder(prev => prev ? { ...prev, ...patch } : prev);
    if (c?.name) setCustomerNameEdit(c.name);
    if (custId) await loadMemberPrices(custId); else setMemberPrices({});
  };

  const loadOrderOnly = async () => {
    const [{data: o}, {data: its}] = await Promise.all([
      supabase.from("orders").select("*, stores:origin_store_id(slug, name)").eq("id", orderId).maybeSingle(),
      supabase.from("order_items").select("*").eq("order_id", orderId).order("created_at"),
    ]);
    if (o) setOrder(o);
    setItems(its || []);
  };

  useEffect(() => { load(); }, [orderId]);

  useEffect(() => {
    let t = null;
    const refresh = () => { clearTimeout(t); t = setTimeout(loadOrderOnly, 300); }; // art arda olaylari tek tazelemeye indir
    const ch = supabase.channel("order-detail-" + orderId)
      .on("postgres_changes", {event:"*", schema:"public", table:"order_items", filter:"order_id=eq."+orderId}, refresh)
      .on("postgres_changes", {event:"*", schema:"public", table:"orders", filter:"id=eq."+orderId}, refresh)
      .subscribe();
    return () => { clearTimeout(t); supabase.removeChannel(ch); };
  }, [orderId]);

  // Toplami yerel listeden hesapla, siparise arka planda yaz (UI beklemez)
  // Ikram: fiyat 0'a iner ama kalem/stok/mutfak izi durur. Geri alinirsa
  // liste fiyatina doner (uye/kampanya indirimi vardiysa yeniden eklenerek
  // degil — kasada fark edilip duzeltilebilir, nadir durum).
  //
  // "Kim veriyor?" sorusu sart: sahipler (admin) siparis girmiyor ama kendi
  // misafirine ikram ediyor — cocuklar ikrami onlarin adina isaretleyebilsin.
  const toggleTreat = (it) => {
    if (it.is_treat) { applyTreat(it, null); return; } // geri alma tek dokunus
    setTreatModal(it);
  };
  const applyTreat = async (it, verenId) => {
    const patch = verenId
      ? { is_treat: true, final_price: 0, treated_by: verenId }
      : { is_treat: false, final_price: Number(it.product_price) || 0, treated_by: null };
    const next = items.map(i => i.id === it.id ? { ...i, ...patch } : i);
    setItems(next); syncTotal(next);
    const { error } = await supabase.from("order_items").update(patch).eq("id", it.id);
    if (error) { alert("İkram işaretlenemedi: " + error.message); load(); }
  };
  // Secim listesi: islemi yapan + sahipler (admin). Ayni kisi iki kez cikmasin.
  const treatVerenler = () => {
    const liste = [];
    if (staffUser) liste.push({ id: staffUser.id, ad: staffUser.name, ben: true });
    staffList.filter(s => s.role === "admin" && s.id !== staffUser?.id)
      .forEach(s => liste.push({ id: s.id, ad: s.name, ben: false }));
    return liste;
  };
  const verenAdi = (id) => {
    const s = staffList.find(x => x.id === id);
    return s ? s.name.split(" ")[0] : "";
  };

  const syncTotal = (list) => {
    const sum = list.reduce((s,i) => s + (Number(i.final_price)||0) * (Number(i.quantity)||0), 0);
    setOrder(prev => prev ? { ...prev, subtotal: sum, total: sum } : prev);
    supabase.from("orders").update({ subtotal: sum, total: sum }).eq("id", orderId).then(() => {});
    return sum;
  };

  // Take away: sicak icecek -> karton bardak, soguk -> pet. Sert alkolde yok.
  const canTakeaway = (p) => p?.takeaway_cup === "hot" || p?.takeaway_cup === "cold";

  const toggleItemTakeaway = async (it) => {
    const val = !it.is_takeaway;
    setItems(prev => prev.map(i => i.id === it.id ? { ...i, is_takeaway: val } : i));
    if (String(it.id).startsWith("temp-")) return;
    const { error } = await supabase.from("order_items").update({ is_takeaway: val }).eq("id", it.id);
    if (error) {
      setItems(prev => prev.map(i => i.id === it.id ? { ...i, is_takeaway: !val } : i));
      alert("Değiştirilemedi: " + error.message);
    }
  };

  // SIK EKLEDIKLERIN: bu garsonun son 30 gunde en cok ekledigi alti urun.
  // Aksam trafiginde "latte" yazip aramak yerine tek dokunus.
  const [sikUrunler, setSikUrunler] = useState([]);
  useEffect(() => {
    if (!staffUser?.id || !products.length) return;
    const otuzGunOnce = new Date(Date.now() - 30 * 86400000).toISOString();
    supabase.from("order_items")
      .select("product_id, orders!inner(staff_id, created_at)")
      .eq("orders.staff_id", staffUser.id)
      .gte("orders.created_at", otuzGunOnce)
      .limit(2000)
      .then(({ data, error }) => {
        if (error || !data) return;
        const say = {};
        data.forEach(r => { if (r.product_id) say[r.product_id] = (say[r.product_id] || 0) + 1; });
        const ilk = Object.entries(say).sort((a, b) => b[1] - a[1]).slice(0, 6)
          .map(([id]) => products.find(p => p.id === id))
          .filter(p => p && p.is_available);
        setSikUrunler(ilk);
      });
  }, [staffUser?.id, products.length]);

  const addProduct = async (p, selOpts = null) => {
    // Secenekli urun (sarap kadeh/sise, doner malzemeleri...): musteri menusundeki
    // gibi secim sart — yoksa sise sarap kadeh fiyatindan yazilirdi
    if (!selOpts && p.has_options && p.options_config?.groups?.length) {
      setOptModal({ p, sel: {} });
      return;
    }
    // Bedenli raf urunu: hangi beden satildi?
    let variantName = null;
    const vs = Array.isArray(p.variants) ? p.variants.filter(v => v?.name) : [];
    if (vs.length) {
      const avail = vs.filter(v => Number(v.stock) > 0);
      if (!avail.length) { alert(p.name + " — tüm bedenler tükendi"); return; }
      const pick = prompt("Beden seç — " + p.name + "\n" + avail.map(v => v.name + " (" + v.stock + " adet)").join(" · "), avail[0].name);
      if (pick == null) return;
      const hit = avail.find(v => v.name.toLowerCase() === String(pick).trim().toLowerCase());
      if (!hit) { alert("Geçersiz beden: " + pick); return; }
      variantName = hit.name;
    } else if (p.track_stock && Number(p.retail_stock) <= 0) {
      if (!confirm(p.name + " stokta görünmüyor. Yine de eklensin mi?")) return;
    }
    // Fiyati 0 olan urunler (magaza: tisort, seramik...) icin tutar kasada sorulur
    let price = Number(p.price) || 0;
    if (price <= 0) {
      const inp = prompt("Tutar (TL) — " + p.name + (p.brand ? " / " + p.brand : ""));
      if (inp == null) return;
      price = Number(String(inp).replace(",", "."));
      if (!price || price <= 0) { alert("Geçerli bir tutar gir"); return; }
    }
    // Happy hour saatindeyse taban fiyat indirimli fiyattir (menu ile ayni hesap)
    if (hhPrices[p.id] != null && Number(p.price) > 0) price = Number(hhPrices[p.id]);
    // Secenek fiyat farki indirim yuzdesinden ONCE eklenir — musteri menusundeki
    // calcPrice ile ayni sira, iki kanal ayni urune ayni fiyati yazsin
    price += optionMod(p, selOpts);
    // Kampanya fiyati ile uye fiyati karsilastirilir; musteri DUSUK olani oder
    let fp = price * (100 - Number(p.instant_discount_pct || 0)) / 100;
    const mp = memberPriceFor(p);
    if (mp != null) fp = Math.min(fp, mp);
    // Magaza (staff_only kategori) urunleri mutfaga gitmez, bildirim tetiklemez
    const cat = categories.find(c => c.id === p.category_id);
    const isRetail = !!cat?.staff_only || !!p.track_stock;
    const row = {
      order_id: orderId,
      product_id: p.id,
      product_name: p.name + (p.brand ? " (" + p.brand + ")" : "") + (variantName ? " · " + variantName : ""),
      variant_name: variantName,
      product_price: price,
      final_price: Math.round(fp),
      quantity: 1,
      kitchen_status: isRetail ? "served" : "pending",
      sent_to_kitchen: !isRetail,
      store_id: p.store_id || order?.origin_store_id,
      kitchen_destination_store_id: p.kitchen_destination_store_id || p.store_id || order?.origin_store_id,
      // "Paket" modu acikken eklenen icecekler gotur olarak isaretlenir
      is_takeaway: takeawayMode && canTakeaway(p),
      selected_options: selOpts || null,
    };
    // Once ekranda goster (aninda tepki), sonra kaydet
    const tempId = "temp-" + Date.now();
    const optimistic = [...items, { ...row, id: tempId, created_at: new Date().toISOString() }];
    setItems(optimistic);
    syncTotal(optimistic);
    const { data: saved, error } = await supabase.from("order_items").insert(row).select().single();
    if (error) {
      setItems(prev => { const back = prev.filter(i => i.id !== tempId); syncTotal(back); return back; });
      alert("Ürün eklenemedi: " + error.message);
      return;
    }
    setItems(prev => prev.map(i => i.id === tempId ? saved : i));
    // GERI AL icin son eklenen kalem. Yanlis eklenen urunu silmenin tek yolu
    // adedi sifira indirmekti; mutfaga gitmisse hic silinmiyordu.
    setSonEklenen({ id: saved.id, ad: saved.product_name, adet: saved.quantity || 1 });
  };

  // Son eklenen kalemi geri al. Mutfaga gitmisse silmiyoruz — iptal/ikram yolu var.
  const sonEklenenGeriAl = async () => {
    if (!sonEklenen) return;
    const it = items.find(i => i.id === sonEklenen.id);
    if (!it) { setSonEklenen(null); return; }
    if (it.kitchen_status !== "pending") {
      alert("Bu ürün mutfağa gitti, geri alınamaz. İptal ya da İkram kullanın.");
      setSonEklenen(null);
      return;
    }
    const next = items.filter(i => i.id !== sonEklenen.id);
    setItems(next); syncTotal(next); setSonEklenen(null);
    const { error } = await supabase.from("order_items").delete().eq("id", sonEklenen.id);
    if (error) { alert("Geri alınamadı: " + error.message); loadOrderOnly(); }
  };

  const changeQty = async (itemId, delta) => {
    const it = items.find(i => i.id === itemId);
    if (!it) return;
    const newQty = it.quantity + delta;
    if (newQty <= 0) {
      if (it.kitchen_status !== "pending") {
        alert("Mutfağa giden urun silinemez. Iptal butonunu kullanin.");
        return;
      }
      const next = items.filter(i => i.id !== itemId);
      setItems(next); syncTotal(next);
      const { error } = await supabase.from("order_items").delete().eq("id", itemId);
      if (error) { alert("Silinemedi: " + error.message); loadOrderOnly(); }
    } else {
      const next = items.map(i => i.id === itemId ? { ...i, quantity: newQty } : i);
      setItems(next); syncTotal(next);
      const { error } = await supabase.from("order_items").update({ quantity: newQty }).eq("id", itemId);
      if (error) { alert("Güncellenemedi: " + error.message); loadOrderOnly(); }
    }
  };

  const saveCustomerName = async () => {
    await supabase.from("orders").update({ customer_name: customerNameEdit.trim() || null }).eq("id", orderId);
    loadOrderOnly();
  };
  const saveOrderNote = async () => {
    await supabase.from("orders").update({ note: orderNote.trim() || null }).eq("id", orderId);
    loadOrderOnly();
  };

  const cancelOrder = async () => {
    if (!confirm("Bu siparişi iptal edilsin mi?")) return;
    await supabase.from("orders").update({ status: "cancelled" }).eq("id", orderId);
    navigate("/orders");
  };

  // Kasada devamlilik: bu siparisin odeme penceresi direkt acilir
  const goToPayment = () => navigate("/payment?order=" + orderId);

  if (loading) return (<div style={{color:"#888",fontFamily:cv,padding:20}}>Yukleniyor...</div>);
  if (!order) return (<div style={{color:"#888",fontFamily:cv,padding:20}}>Sipariş bulunamadı</div>);

  const totalItems = items.reduce((s,i) => s + (i.quantity||0), 0);
  const anyPending = items.some(i => i.kitchen_status === "pending" || i.kitchen_status === "preparing");
  const allReady = items.length > 0 && items.every(i => i.kitchen_status === "ready" || i.kitchen_status === "served");
  // Arama doluysa kategori fark etmeksizin TUM urunlerde arar (TR harf uyumlu);
  // basiyla eslesenler one gelir. Bossa secili kategorinin listesi.
  const trLow = (s) => String(s || "").toLocaleLowerCase("tr");
  const q = trLow(prodSearch.trim());
  const filteredProducts = q
    ? products
        .filter(p => trLow(p.name).includes(q) || trLow(p.name_en).includes(q) || trLow(p.brand).includes(q))
        .sort((a, b) => (trLow(a.name).startsWith(q) ? 0 : 1) - (trLow(b.name).startsWith(q) ? 0 : 1))
    : products.filter(p => p.category_id === selectedCat);
  const catNameOf = (p) => categories.find(c => c.id === p.category_id)?.name || "";
  // Kasada hiyerarsi yok: yalniz icinde urun olan kategoriler cip olarak cikar,
  // alt kategoriler ust kategorisinin hemen ardinda siralanir.
  const catChips = categories
    .filter(c => products.some(p => p.category_id === c.id))
    .map(c => {
      const par = c.parent_id ? categories.find(x => x.id === c.parent_id) : null;
      return { ...c, _key: (par ? (par.sort_order || 0) : (c.sort_order || 0)) * 1000 + (par ? (c.sort_order || 0) : 0) };
    })
    .sort((a, b) => a._key - b._key);
  const where = order.table_id ? (tables[order.table_id] || "Masa") : null;

  return (
    <div style={{fontFamily:cv,color:"#F0EDE8",paddingBottom:100}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,flexWrap:"wrap",gap:8}}>
        <button onClick={() => navigate(-1)} style={{background:"none",border:"none",color:"#FFFFFF",fontSize:13,cursor:"pointer",padding:0}}>← Geri</button>
        {order.status !== "cancelled" && order.status !== "paid" && (
          <button onClick={cancelOrder} style={{background:"none",border:"1px solid #2A2A2A",color:"#C87A6A",fontSize:11,borderRadius:6,padding:"5px 10px",cursor:"pointer"}}>İptal Et</button>
        )}
      </div>

      <div style={{marginBottom:14}}>
        <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
          {order.stores?.slug && <span style={{display:"inline-block",background:order.stores.slug==="doner"?"#FFFFFF":"#222222",color:order.stores.slug==="doner"?"#000":"#F0EDE8",padding:"3px 10px",borderRadius:6,fontSize:10,fontWeight:800,letterSpacing:"0.5px"}}>{order.stores.slug==="doner"?"🥙 DÖNER":"🗼 PARIS"}</span>}
          {where ? (
            <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
              <div style={{fontSize:24,fontWeight:800}}>{where}</div>
              <input value={customerNameEdit} onChange={e=>setCustomerNameEdit(e.target.value)} onBlur={saveCustomerName} placeholder="👤 İsim" style={{background:"#1A1A1A",border:"1px solid #2A2A2A",color:"#F0EDE8",fontSize:14,fontWeight:700,padding:"6px 10px",borderRadius:8,outline:"none",fontFamily:"inherit",width:130}}/>
            </div>
          ) : (
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <span style={{fontSize:20}}>👤</span>
              <input value={customerNameEdit} onChange={e=>setCustomerNameEdit(e.target.value)} onBlur={saveCustomerName} placeholder="Müşteri adı" style={{background:"#1A1A1A",border:"1px solid #2A2A2A",color:"#F0EDE8",fontSize:22,fontWeight:800,padding:"4px 10px",borderRadius:8,outline:"none",fontFamily:"inherit",width:220}}/>
            </div>
          )}
          <div style={{fontSize:10,padding:"3px 8px",background:"#2A2A2A",color:"#aaa",borderRadius:6,fontWeight:700,letterSpacing:"1px"}}>{order.status?.toUpperCase()}</div>
        </div>
        <div style={{fontSize:11,color:"#888",marginTop:4}}>{totalItems} urun · ₺{order.total || 0}</div>
      </div>

      {/* Uye bagla: bagli uyenin ozel fiyatlari eklenen urunlere otomatik uygulanir */}
      <div style={{marginBottom:14,background:"#161616",border:"1px solid "+(order?.customer_id?"#FFFFFF":"#2A2A2A"),borderRadius:10,padding:10}}>
        <div style={{fontSize:10,color:order?.customer_id?"#FFFFFF":"#888",letterSpacing:"1.5px",fontWeight:700,marginBottom:6}}>
          {order?.customer_id ? "👤 ÜYE HESABI BAĞLI" : "👤 ÜYE HESABI"}
        </div>
        <select value={order?.customer_id || ""} onChange={e => linkCustomer(e.target.value || null)}
          style={{width:"100%",padding:"10px 12px",background:"#0C0C0C",border:"1px solid "+(order?.customer_id?"#FFFFFF":"#2A2A2A"),borderRadius:8,color:"#F0EDE8",fontSize:14,outline:"none",fontFamily:"inherit"}}>
          <option value="">— Üye değil (misafir) —</option>
          {customers.map(c => (<option key={c.id} value={c.id}>{c.name}{c.phone ? " · " + c.phone : ""}</option>))}
        </select>
        <div style={{fontSize:10,color:"#777",marginTop:6,lineHeight:1.5}}>
          {order?.customer_id
            ? (Object.keys(memberPrices).length > 0
                ? "Bu üyenin " + Object.keys(memberPrices).length + " özel fiyatı var — eklediğin ürünlere otomatik uygulanır (kampanya daha ucuzsa kampanya)."
                : "Bu üyeye tanımlı özel fiyat yok; liste fiyatı geçerli.")
            : "Üye seçersen özel fiyatları eklenen ürünlere otomatik iner."}
        </div>
      </div>

      <div style={{marginBottom:14}}>
        <input value={orderNote} onChange={e=>setOrderNote(e.target.value)} onBlur={saveOrderNote} placeholder="+ Sipariş notu ekle (mutfak görecek)" style={{width:"100%",padding:"10px 14px",background:"transparent",border:"1px dashed #444",color:"#ddd",borderRadius:10,fontSize:13,outline:"none",fontFamily:"inherit"}}/>
      </div>

      <div style={{marginBottom:14}}>
        {items.length === 0 && <div style={{color:"#666",fontSize:12,textAlign:"center",padding:20}}>Henüz ürün yok. Aşağıdan ekle.</div>}
        {items.map(it => {
          const opts = optionsText(it.selected_options);
          const prod = products.find(p => p.id === it.product_id);
          const statusColor = it.kitchen_status === "ready" ? "#FFFFFF"
                            : it.kitchen_status === "preparing" ? "#FFFFFF"
                            : it.kitchen_status === "served" ? "#8A8580" : "#888";
          return (
            <div key={it.id} style={{background:"#1A1A1A",border:"1px solid #2A2A2A",borderRadius:10,padding:12,marginBottom:8,display:"flex",alignItems:"center",gap:10}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:14,fontWeight:700}}>{it.product_name}</div>
                {opts && <div style={{fontSize:11,color:"#FFFFFF",marginTop:2,fontWeight:600}}>{opts}</div>}
                {it.notes && <div style={{fontSize:11,color:"#aaa",fontStyle:"italic",marginTop:2}}>Not: {it.notes}</div>}
                <div style={{fontSize:11,marginTop:4}}>
                  {Number(it.final_price) < Number(it.product_price) && (
                    <span style={{color:"#666",textDecoration:"line-through",marginRight:5}}>₺{Math.round(Number(it.product_price))}</span>
                  )}
                  {it.is_treat
                    ? <span style={{color:"#F0EDE8",fontWeight:800}}>🎁 İKRAM{verenAdi(it.treated_by) ? " — " + verenAdi(it.treated_by) : ""} · </span>
                    : <span style={{color:"#888"}}>₺{it.final_price} · </span>}
                  <span style={{color:statusColor,fontWeight:700,letterSpacing:"1px"}}>{it.kitchen_status?.toUpperCase()}</span>
                </div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {canTakeaway(prod) && (
                  <button onClick={() => toggleItemTakeaway(it)}
                    style={{marginTop:6,padding:"6px 12px",background:it.is_takeaway?"#FFFFFF":"transparent",color:it.is_takeaway?"#000":"#888",
                            border:"1px solid "+(it.is_takeaway?"#FFFFFF":"#3A3A3A"),borderRadius:20,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                    {it.is_takeaway ? "✓ 🥤 Paket" : "🥤 Paket"}
                  </button>
                )}
                <button onClick={() => toggleTreat(it)}
                  style={{marginTop:6,padding:"6px 12px",background:it.is_treat?"#F0EDE8":"transparent",color:it.is_treat?"#000":"#888",
                          border:"1px solid "+(it.is_treat?"#F0EDE8":"#3A3A3A"),borderRadius:20,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                  {it.is_treat ? "✓ 🎁 İkram" : "🎁 İkram"}
                </button>
                </div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:6,background:"#0C0C0C",borderRadius:20,padding:"3px 5px"}}>
                <button onClick={() => changeQty(it.id, -1)} style={{width:40,height:40,background:"#2A2A2A",color:"#fff",border:"none",borderRadius:"50%",fontSize:20,cursor:"pointer",fontWeight:700}}>−</button>
                <div style={{minWidth:18,textAlign:"center",fontSize:13,fontWeight:800}}>{it.quantity}</div>
                <button onClick={() => changeQty(it.id, +1)} style={{width:40,height:40,background:"#2A2A2A",color:"#fff",border:"none",borderRadius:"50%",fontSize:20,cursor:"pointer",fontWeight:700}}>+</button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Son eklenen kalem — yanlis eklenen urun tek dokunusla geri aliniyor. */}
      {sonEklenen && order.status !== "paid" && order.status !== "cancelled" && (
        <div style={{background:"#161616",border:"1px solid #2A2A2A",borderRadius:12,padding:"11px 14px",marginBottom:10,display:"flex",alignItems:"center",gap:12}}>
          <span style={{flex:1,minWidth:0,fontSize:12,color:"#F0EDE8",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
            Son eklenen: {sonEklenen.ad}{sonEklenen.adet > 1 ? " ×" + sonEklenen.adet : ""}
          </span>
          <button onClick={sonEklenenGeriAl}
            style={{fontSize:11,fontWeight:700,border:"1px solid #2A2A2A",background:"transparent",color:"#F0EDE8",
                    padding:"7px 11px",borderRadius:8,cursor:"pointer",fontFamily:"inherit",flexShrink:0}}>
            Geri al
          </button>
          <button onClick={() => setSonEklenen(null)} aria-label="Kapat"
            style={{background:"none",border:"none",color:"#666",fontSize:16,lineHeight:1,cursor:"pointer",padding:0,flexShrink:0,fontFamily:"inherit"}}>×</button>
        </div>
      )}

      {items.length > 0 && order.status !== "paid" && order.status !== "cancelled" && (
        <div style={{position:"fixed",bottom:14,left:14,right:14,zIndex:40}}>
          <button onClick={goToPayment} style={{width:"100%",padding:"14px",background:allReady?"#FFFFFF":"#2A2A2A",color:allReady?"#000":"#F0EDE8",border:"none",borderRadius:12,fontSize:14,fontWeight:800,cursor:"pointer",boxShadow:"0 4px 16px rgba(0,0,0,0.4)"}}>
            {allReady ? "✓ Servis tamamlandı · " : ""}💰 Ödeme Al · ₺{order.total || 0}
          </button>
        </div>
      )}

      <div style={{background:"#161616",border:"1px solid #2A2A2A",borderRadius:10,padding:10,marginBottom:10}}>
        <button onClick={() => setMenuOpen(!menuOpen)} style={{width:"100%",padding:"6px",background:"transparent",color:"#aaa",border:"none",fontSize:12,cursor:"pointer",fontWeight:700}}>
          {menuOpen ? "Menüyü Gizle ↑" : "+ Ürün Ekle ↓"}
        </button>
        {menuOpen && (
          <>
            <button onClick={() => setTakeawayMode(!takeawayMode)}
              style={{width:"100%",marginTop:10,padding:"12px",background:takeawayMode?"#FFFFFF":"#1A1A1A",color:takeawayMode?"#000":"#999",
                      border:"1px solid "+(takeawayMode?"#FFFFFF":"#333"),borderRadius:10,fontSize:13,fontWeight:800,cursor:"pointer",fontFamily:"inherit"}}>
              {takeawayMode ? "✓ 🥤 PAKET MODU AÇIK — eklenen içecekler götür" : "🥤 Paket (take away)"}
            </button>
            <div style={{position:"relative",marginTop:10}}>
              <input value={prodSearch} onChange={e=>setProdSearch(e.target.value)} placeholder="🔍 Ürün ara (tüm kategorilerde) — örn: latte, efes, şapka"
                style={{width:"100%",padding:"12px 40px 12px 14px",background:"#0C0C0C",border:"1px solid "+(q?"#FFFFFF":"#2A2A2A"),borderRadius:10,color:"#F0EDE8",fontSize:14,outline:"none",fontFamily:"inherit"}}/>
              {q && (
                <button onClick={() => setProdSearch("")} style={{position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",width:28,height:28,background:"#2A2A2A",color:"#aaa",border:"none",borderRadius:8,fontSize:14,cursor:"pointer",lineHeight:1}}>×</button>
              )}
            </div>
            {!q && sikUrunler.length > 0 && (
              <div style={{marginTop:12,display:"flex",flexDirection:"column",gap:9}}>
                <div style={{fontSize:10,color:"#8A8580",letterSpacing:"1.5px",fontWeight:700,textTransform:"uppercase"}}>Sık eklediklerin</div>
                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                  {sikUrunler.map(p => (
                    <button key={p.id} onClick={() => addProduct(p)}
                      style={{fontSize:12.5,fontWeight:700,border:"1px solid #2A2A2A",background:"transparent",color:"#F0EDE8",
                              borderRadius:20,padding:"10px 14px",cursor:"pointer",fontFamily:"inherit"}}>
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {!q && (
            <div style={{display:"flex",gap:5,overflowX:"auto",marginTop:10,paddingBottom:4}}>
              {catChips.map(c => (
                <button key={c.id} onClick={() => setSelectedCat(c.id)} style={{flexShrink:0,padding:"6px 10px",border:"1px solid "+(selectedCat===c.id?"#FFFFFF":"#333"),borderRadius:12,fontSize:10,fontWeight:700,background:selectedCat===c.id?"rgba(255,255,255,0.2)":"#1A1A1A",color:selectedCat===c.id?"#FFFFFF":"#aaa",cursor:"pointer",whiteSpace:"nowrap",letterSpacing:"0.5px"}}>
                  {c.icon}{c.name?.toUpperCase()}
                </button>
              ))}
            </div>
            )}
            {q && <div style={{fontSize:11,color:"#888",marginTop:8}}>{filteredProducts.length} sonuç{filteredProducts.length===0?" — yazımı kontrol et":""}</div>}
            <div style={{marginTop:10,maxHeight:380,overflowY:"auto"}}>
              {filteredProducts.map(p => (
                <div key={p.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 8px",borderBottom:"1px solid #222",gap:10}}>
                  <div>
                    <div style={{fontSize:15,fontWeight:700}}>{p.name}{p.brand && <span style={{color:"#888",fontWeight:600}}> · {p.brand}</span>}</div>
                    {q && <div style={{fontSize:10,color:"#777",marginTop:1,letterSpacing:"0.5px"}}>{catNameOf(p)}</div>}
                    {p.track_stock && <div style={{fontSize:11,color:Number(p.retail_stock)>0?"#8A8580":"#C87A6A",marginTop:2,fontWeight:600}}>Stok: {p.retail_stock||0} adet{Array.isArray(p.variants)&&p.variants.length?" · "+p.variants.filter(v=>Number(v.stock)>0).map(v=>v.name).join("/"):""}</div>}
                    <div style={{fontSize:13,color:"#FFFFFF",fontWeight:700,marginTop:2}}>
                      {hhPrices[p.id] != null && Number(p.price) > 0 ? (
                        <>
                          <span style={{color:"#666",textDecoration:"line-through",fontWeight:600,marginRight:6}}>₺{Math.round(Number(p.price))}</span>
                          <span>₺{Math.round(Number(hhPrices[p.id]))}</span>
                          <span style={{marginLeft:6,fontSize:9,padding:"2px 6px",background:"#FFFFFF",color:"#000",borderRadius:5,letterSpacing:"0.5px"}}>HAPPY HOUR</span>
                        </>
                      ) : (Number(p.price) > 0 ? "₺" + p.price : "Serbest tutar")}
                    </div>
                  </div>
                  <button onClick={() => addProduct(p)} style={{width:46,height:46,background:"#FFFFFF",color:"#000",border:"none",borderRadius:"50%",fontSize:24,fontWeight:800,cursor:"pointer",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",lineHeight:1}}>+</button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {treatModal && (
        <div onClick={() => setTreatModal(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:100}}>
          <div onClick={e => e.stopPropagation()} style={{background:"#161616",border:"1px solid #2A2A2A",borderRadius:"16px 16px 0 0",padding:20,width:"100%",maxWidth:500}}>
            <div style={{fontSize:16,fontWeight:800,color:"#F0EDE8",marginBottom:2}}>🎁 İkramı kim veriyor?</div>
            <div style={{fontSize:11,color:"#888",marginBottom:14}}>{treatModal.product_name} · ₺{treatModal.final_price} hesaptan düşülecek</div>
            {treatVerenler().map(v => (
              <button key={v.id} onClick={() => { const it = treatModal; setTreatModal(null); applyTreat(it, v.id); }}
                style={{width:"100%",padding:"13px 14px",marginBottom:7,display:"flex",alignItems:"center",gap:10,
                        background: v.ben ? "#161616" : "#222", color: v.ben ? "#F0EDE8" : "#ddd",
                        border:"1px solid " + (v.ben ? "#E8C36A55" : "#333"), borderRadius:10,
                        fontSize:14, fontWeight:700, cursor:"pointer", fontFamily:cv, textAlign:"left"}}>
                {v.ben ? "👤 Ben — " + v.ad : "⭐ " + v.ad}
              </button>
            ))}
            <button onClick={() => setTreatModal(null)} style={{width:"100%",padding:"12px",background:"transparent",color:"#888",border:"1px solid #333",borderRadius:10,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:cv,marginTop:4}}>Vazgeç</button>
          </div>
        </div>
      )}

      {optModal && (() => {
        const gruplar = optModal.p.options_config?.groups || [];
        const sec = (g, opt) => setOptModal(m => {
          const sel = { ...m.sel };
          if (g.multi) {
            const cur = Array.isArray(sel[g.name]) ? sel[g.name] : [];
            sel[g.name] = cur.includes(opt) ? cur.filter(x => x !== opt) : [...cur, opt];
          } else sel[g.name] = sel[g.name] === opt ? undefined : opt;
          return { ...m, sel };
        });
        const secili = (g, opt) => g.multi
          ? (Array.isArray(optModal.sel[g.name]) && optModal.sel[g.name].includes(opt))
          : optModal.sel[g.name] === opt;
        const eksik = gruplar.some(g => g.required &&
          (g.multi ? !(optModal.sel[g.name]?.length) : !optModal.sel[g.name]));
        const toplam = (Number(hhPrices[optModal.p.id] ?? optModal.p.price) || 0) + optionMod(optModal.p, optModal.sel);
        return (
          <div onClick={() => setOptModal(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:100}}>
            <div onClick={e => e.stopPropagation()} style={{background:"#161616",border:"1px solid #2A2A2A",borderRadius:"16px 16px 0 0",padding:20,width:"100%",maxWidth:500,maxHeight:"80vh",overflowY:"auto"}}>
              <div style={{fontSize:16,fontWeight:800,color:"#F0EDE8",marginBottom:4}}>{optModal.p.name}</div>
              <div style={{fontSize:11,color:"#888",marginBottom:14}}>Seçenekleri işaretle{gruplar.some(g=>g.multi) ? " (çoklu seçim olabilir)" : ""}</div>
              {gruplar.map(g => (
                <div key={g.name} style={{marginBottom:14}}>
                  <div style={{fontSize:10,letterSpacing:"1.5px",color:"#8A8580",fontWeight:700,marginBottom:6}}>
                    {g.name.toLocaleUpperCase("tr-TR")}{g.required ? " *" : ""}
                  </div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                    {(g.options || []).map(opt => {
                      const fark = Number(g.price_modifiers?.[opt]) || 0;
                      return (
                        <button key={opt} onClick={() => sec(g, opt)}
                          style={{padding:"9px 13px",borderRadius:9,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:cv,
                                  background: secili(g,opt) ? "#FFFFFF" : "#222",
                                  color: secili(g,opt) ? "#000" : "#ccc",
                                  border: "1px solid " + (secili(g,opt) ? "#FFFFFF" : "#333")}}>
                          {opt}{fark ? ` +₺${fark}` : ""}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              <div style={{display:"flex",gap:8,marginTop:6}}>
                <button onClick={() => setOptModal(null)} style={{flex:1,padding:"13px",background:"transparent",color:"#888",border:"1px solid #333",borderRadius:10,fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:cv}}>Vazgeç</button>
                <button disabled={eksik}
                  onClick={() => { const m = optModal; setOptModal(null); addProduct(m.p, m.sel); }}
                  style={{flex:2,padding:"13px",background:eksik?"#333":"#FFFFFF",color:eksik?"#777":"#000",border:"none",borderRadius:10,fontSize:14,fontWeight:800,cursor:eksik?"not-allowed":"pointer",fontFamily:cv}}>
                  {eksik ? "Zorunlu seçim var" : `Ekle · ₺${Math.round(toplam)}`}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
