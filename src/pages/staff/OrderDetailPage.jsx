import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { supabase } from "../../lib/supabase.js";
import { happyHourPrices } from "../../lib/happyHour.js";
import { optionsText, optionMod } from "../../lib/productOptions.js";
import { useAuth } from "../../contexts/AuthContext.jsx";
import Ikon from "../../components/Ikon.jsx";
import UrunSecici from "../../components/UrunSecici.jsx";
import { partiDurumOku } from "../../lib/parti.js";

const cv = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";

export default function OrderDetailPage() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { staffUser } = useAuth(); // ikramda "kim verdi" kaydi icin

  const [order, setOrder] = useState(null);
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [takeawayMode, setTakeawayMode] = useState(false);
  const [optModal, setOptModal] = useState(null); // {p, sel} — secenekli urun secimi
  const [treatModal, setTreatModal] = useState(null); // ikramda "kim veriyor?" secimi
  const [indirimModal, setIndirimModal] = useState(null); // {it, tutar, not} — kalem indirimi (adet basina TL)
  const [staffList, setStaffList] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [memberPrices, setMemberPrices] = useState({});
  const [tables, setTables] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectedCat, setSelectedCat] = useState(null);
  const [prodSearch, setProdSearch] = useState("");
  const [hhPrices, setHhPrices] = useState({}); // happy hour: { urun_id: fiyat }
  const [sonEklenen, setSonEklenen] = useState(null); // { id, ad, adet } — "Geri al" icin
  const [customerNameEdit, setCustomerNameEdit] = useState("");
  const [orderNote, setOrderNote] = useState("");
  // URUN EKLE alt sayfasi. Menu eskiden sayfanin EN ALTINDA duruyordu: 6 kalemli
  // masaya bir urun eklemek icin uye kutusu, not, kalemler ve geri al seridi
  // gecilip listeye iniliyor, eklenen satir ve toplam 800px yukarida kaliyordu.
  // Simdi ekleme kendi katmaninda: acikken toplam ve son eklenen parmagin
  // dibinde. Ekledikten sonra KAPANMAZ (bir masaya art arda 3 urun girilir).
  const [ekleAcik, setEkleAcik] = useState(false);
  // Uye kutusu + siparis notu katlanir: kalemler basliga yaklassin. Bos
  // hesapta acik baslar — uye fiyati urun eklenmeden ONCE baglanmali.
  const [detayAcik, setDetayAcik] = useState(false);
  // Dokunusun alindigini gostermek icin eklenen urun satiri 150ms yanar.
  const [parlayan, setParlayan] = useState(null);
  const otoAcildi = useRef(false); // bos hesapta otomatik acilis TEK sefer

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
    // Uye fiyatlari: order.customer_id'yi izleyen effect okur (asagida).
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
    // Fiyatlar customer_id degisince effect'te yeniden okunur.
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

  // Derin baglanti: Masalar'daki (+) ve baska girisler ?ekle=1 ile gelir. Yalniz
  // mount'ta okunur ve URL'den silinir — odeme sayfasindan geri donuste
  // alt sayfa yeniden acilmasin.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("ekle") === "1") {
      setEkleAcik(true);
      otoAcildi.current = true;
      navigate(location.pathname, { replace: true });
    }
  }, []);

  // Bos acik hesapta (masadan yeni acildi) alt sayfa kendiliginden acilir; bir
  // kez. Realtime tazelemesi items'i yeniden bos getirse bile acmaz.
  useEffect(() => {
    if (loading || !order || otoAcildi.current) return;
    otoAcildi.current = true;
    if (items.length === 0 && order.status !== "paid" && order.status !== "cancelled") {
      setEkleAcik(true);
      setDetayAcik(true);
    }
  }, [loading]);

  // Alt sayfa acikken arkadaki sayfa kaymasin (iOS backdrop'tan kaydiriyor).
  useEffect(() => {
    if (!ekleAcik) return;
    const onceki = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = onceki; };
  }, [ekleAcik]);

  useEffect(() => {
    let t = null;
    const refresh = () => { clearTimeout(t); t = setTimeout(loadOrderOnly, 300); }; // art arda olaylari tek tazelemeye indir
    const ch = supabase.channel("order-detail-" + orderId)
      .on("postgres_changes", {event:"*", schema:"public", table:"order_items", filter:"order_id=eq."+orderId}, refresh)
      .on("postgres_changes", {event:"*", schema:"public", table:"orders", filter:"id=eq."+orderId}, refresh)
      .subscribe();
    return () => { clearTimeout(t); supabase.removeChannel(ch); };
  }, [orderId]);

  // Uye ozel fiyatlari CANLI. Eskiden yalniz ekran acilirken okunuyordu:
  // sahip telefonundan Esra'ya 180'lik bira tanimlarken tablette siparis
  // zaten acikti, kasa yeni fiyati duymadi ve 280 ekledi. Simdi bagli uyenin
  // member_discounts satirlari dinlenir (Uyeler sayfasi sil+yaz yapar, ikisi
  // de olay uretir) ve ekran one gelince de yeniden okunur. Uye
  // baglanip cozulunce de (bu ya da baska cihazdan) buradan gecer.
  useEffect(() => {
    const cid = order?.customer_id;
    if (!cid) { setMemberPrices({}); return; }
    const yenile = () => loadMemberPrices(cid);
    yenile();
    const ch = supabase.channel("uye-fiyat-" + orderId)
      .on("postgres_changes", { event: "*", schema: "public", table: "member_discounts", filter: "customer_id=eq." + cid }, yenile)
      .subscribe();
    const gorunur = () => { if (document.visibilityState === "visible") yenile(); };
    document.addEventListener("visibilitychange", gorunur);
    window.addEventListener("focus", yenile);
    return () => {
      supabase.removeChannel(ch);
      document.removeEventListener("visibilitychange", gorunur);
      window.removeEventListener("focus", yenile);
    };
  }, [order?.customer_id, orderId]);

  // Toplami yerel listeden hesapla, siparise arka planda yaz (UI beklemez)
  // Ikram: fiyat 0'a iner ama kalem/stok/mutfak izi durur. Geri alinirsa
  // fiyat o urunun BU hesaptaki gercek fiyatina doner (kampanya / uye
  // fiyati) — eskiden liste fiyatina donuyordu, uyenin 180'lik birasi
  // ikramdan cikinca 280 oluyordu.
  //
  // "Kim veriyor?" sorusu sart: sahipler (admin) siparis girmiyor ama kendi
  // misafirine ikram ediyor — cocuklar ikrami onlarin adina isaretleyebilsin.
  const ikramsizFiyat = (it) => {
    // product_price zaten happy hour ve secenek farkini icerir (addProduct);
    // ustune kampanya yuzdesi ve uye fiyati, eklerken oldugu sirayla.
    const p = products.find(x => x.id === it.product_id);
    let fp = Number(it.product_price) || 0;
    if (p) {
      fp = fp * (100 - Number(p.instant_discount_pct || 0)) / 100;
      const mp = memberPriceFor(p);
      if (mp != null) fp = Math.min(fp, mp);
    }
    // Kasada verilmis kalem indirimi de geri gelir.
    return Math.max(0, Math.round(fp) - Math.round(Number(it.manual_discount) || 0));
  };

  // Kalem indirimi: adet basina TL. Taban = indirimsiz fiyat (uye/kampanya/
  // happy hour dahil), final = taban − indirim. Kim verdi ve neden kalemde
  // kalir; sifir indirim kaydi temizler. Ikramli kalemde dugme yok (zaten 0).
  const applyDiscount = async (it, tutar, not) => {
    const taban = Math.max(0, Math.round(Number(it.final_price) + (Number(it.manual_discount) || 0)));
    const ind = Math.min(taban, Math.max(0, Math.round(Number(tutar) || 0)));
    const patch = {
      manual_discount: ind,
      final_price: Math.max(0, taban - ind),
      discount_note: ind > 0 ? (String(not || "").trim() || null) : null,
      // Kim verdi kalemde DURMAZ: order_items'i herkes okur. Izi sunucudaki
      // tetik (trg_indirim_denetim) auth.uid()'den alip discount_audit'e
      // yazar; onu yalniz sahip okur (20260906_indirim_denetimi).
    };
    const next = items.map(i => i.id === it.id ? { ...i, ...patch } : i);
    setItems(next); syncTotal(next);
    const { error } = await supabase.from("order_items").update(patch).eq("id", it.id);
    if (error) { alert("İndirim kaydedilemedi: " + error.message); loadOrderOnly(); }
  };
  const toggleTreat = (it) => {
    if (it.is_treat) { applyTreat(it, null); return; } // geri alma tek dokunus
    setTreatModal(it);
  };
  const applyTreat = async (it, verenId) => {
    const patch = verenId
      ? { is_treat: true, final_price: 0, treated_by: verenId }
      : { is_treat: false, final_price: ikramsizFiyat(it), treated_by: null };
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
  // Parti menusu acikken kasa listesi de kisilir. tumMenu = gecici cikis:
  // musteri parti disi bir sey isterse satis engellenmesin.
  const [partiAktif, setPartiAktif] = useState(false);
  const [partiAdet, setPartiAdet] = useState(0);
  const [tumMenu, setTumMenu] = useState(false);
  useEffect(() => {
    const magaza = staffUser?.store_ids?.[0];
    if (!magaza) return;
    let iptal = false;
    supabase.rpc("nip_parti_durum", { p_store_id: magaza }).then(({ data, error }) => {
      if (iptal) return;
      const d = partiDurumOku(data, error);
      setPartiAktif(d.aktif); setPartiAdet(d.urunSayisi);
    });
    return () => { iptal = true; };
  }, [staffUser?.id]);

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
      // Secenek penceresinde beden zaten secildiyse (Shop tisortleri: "Beden"
      // grubu ile variants ayni bedenleri tasir) ikinci kez sorulmaz. Secilen
      // beden tukendiyse yine sorulur ki stokta olana yonlendirsin.
      const secilenler = Object.values(selOpts || {}).flat().map(s => String(s ?? "").trim().toLowerCase());
      let hit = avail.find(v => secilenler.includes(v.name.toLowerCase()));
      if (!hit) {
        const pick = prompt("Beden seç — " + p.name + "\n" + avail.map(v => v.name + " (" + v.stock + " adet)").join(" · "), avail[0].name);
        if (pick == null) return;
        hit = avail.find(v => v.name.toLowerCase() === String(pick).trim().toLowerCase());
        if (!hit) { alert("Geçersiz beden: " + pick); return; }
      }
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
      // Haftalik lig: kalemi kim ekledi. Siparisi baskasi acmis olabilir.
      added_by: staffUser?.id || null,
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
  // Filtreleme/arama turetimi UrunSecici'de (prop'lardan saf uretim).
  const where = order.table_id ? (tables[order.table_id] || "Masa") : null;
  const kapali = order.status === "paid" || order.status === "cancelled";
  // Masaustu: StaffLayout kenar menusu 240px ve alt tab bar yok. Mobilde sabit
  // cubuk tab barin USTUNE oturur (nav ~74px), icerigi ve sekmeleri ortmez.
  const masaustu = typeof window !== "undefined" && window.matchMedia("(min-width:900px)").matches;
  const cubukAlt = masaustu ? 14 : 78;
  const uyeAdi = order.customer_id
    ? (customers.find(c => c.id === order.customer_id)?.name || order.customer_name || "Üye")
    : null;
  const ozelFiyatSayisi = Object.keys(memberPrices).length;

  // Dokunus geri bildirimi: satir 150ms beyaz yanar, titresim. Veri degismez;
  // addProduct oldugu gibi cagrilir (secenek penceresi acilirsa da yanar).
  const urunEkle = (p) => {
    setParlayan(p.id);
    setTimeout(() => setParlayan(cur => cur === p.id ? null : cur), 150);
    try { navigator.vibrate?.(10); } catch (e) { /* yoksay */ }
    addProduct(p);
  };

  // Son eklenen kalemin canli hali: adet kontrolu ve sifira inince geri al.
  // sonEklenen yalniz insert KAYDEDILDIKTEN sonra set edilir (saved.id), bu
  // yuzden buradaki −/+ ve Geri al hic temp id'ye gitmez.
  const sonKalem = sonEklenen ? items.find(i => i.id === sonEklenen.id) : null;
  const sonAdet = (delta) => {
    if (!sonKalem) return;
    if (sonKalem.quantity + delta <= 0) { sonEklenenGeriAl(); return; }
    changeQty(sonKalem.id, delta);
  };

  // GERI AL SERIDI — sayfada ve alt sayfanin altliginda ayni sey. Alt sayfada
  // yeni TOPLAM ve adet kontrolu de var: garsonun dogrulamak istedigi sey
  // hesabin degistigi; ikinci latte icin alt sayfayi kapatip kaleme inmesin.
  // Bilesen degil duz fonksiyon: render icinde tanimli bir bilesen her cizimde
  // yeni tip sayilir ve React alt agaci yeniden kurar.
  const geriAlSeridi = (sheet = false) => {
    if (!sonEklenen || kapali) return null;
    return (
      <div style={{background:"#161616",border:sheet?"none":"1px solid #2A2A2A",borderTop:sheet?"1px solid #2A2A2A":undefined,
                   borderRadius:sheet?0:12,padding:sheet?"10px 14px":"11px 14px",marginBottom:sheet?0:10,
                   display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
        <span style={{flex:1,minWidth:120,fontSize:12,color:"#F0EDE8",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",display:"inline-flex",alignItems:"center",gap:5}}>
          {sheet && <Ikon ad="onay" boy={13}/>}
          {sheet ? <>{sonEklenen.ad} eklendi · Toplam <b>₺{order.total || 0}</b></> : <>Son eklenen: {sonEklenen.ad}{(sonKalem?.quantity || sonEklenen.adet) > 1 ? " ×" + (sonKalem?.quantity || sonEklenen.adet) : ""}</>}
        </span>
        {sheet && sonKalem && (
          <div style={{display:"flex",alignItems:"center",gap:4,background:"#0C0C0C",borderRadius:20,padding:"2px 4px",flexShrink:0}}>
            <button onClick={() => sonAdet(-1)} aria-label="Azalt" style={{width:40,height:40,background:"#2A2A2A",color:"#fff",border:"none",borderRadius:"50%",fontSize:18,cursor:"pointer",fontWeight:700}}>−</button>
            <div style={{minWidth:18,textAlign:"center",fontSize:13,fontWeight:800}}>{sonKalem.quantity}</div>
            <button onClick={() => sonAdet(+1)} aria-label="Artır" style={{width:40,height:40,background:"#2A2A2A",color:"#fff",border:"none",borderRadius:"50%",fontSize:18,cursor:"pointer",fontWeight:700}}>+</button>
          </div>
        )}
        <button onClick={sonEklenenGeriAl}
          style={{fontSize:11,fontWeight:700,border:"1px solid #2A2A2A",background:"transparent",color:"#F0EDE8",
                  padding:"7px 11px",minHeight:36,borderRadius:8,cursor:"pointer",fontFamily:"inherit",flexShrink:0}}>
          Geri al
        </button>
        {!sheet && (
          <button onClick={() => setSonEklenen(null)} aria-label="Kapat"
            style={{background:"none",border:"none",color:"#888888",fontSize:16,lineHeight:1,cursor:"pointer",padding:0,flexShrink:0,fontFamily:"inherit"}}>×</button>
        )}
      </div>
    );
  };

  return (
    <div style={{fontFamily:cv,color:"#F0EDE8",paddingBottom:100}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,flexWrap:"wrap",gap:8}}>
        <button onClick={() => navigate(-1)} style={{background:"none",border:"none",color:"#FFFFFF",fontSize:13,cursor:"pointer",padding:0,display:"inline-flex",alignItems:"center",gap:5}}><Ikon ad="oksol" boy={14}/>Geri</button>
        {order.status !== "cancelled" && order.status !== "paid" && (
          <button onClick={cancelOrder} style={{background:"none",border:"1px solid #2A2A2A",color:"#C87A6A",fontSize:11,borderRadius:6,padding:"5px 10px",cursor:"pointer"}}>İptal Et</button>
        )}
      </div>

      <div style={{marginBottom:14}}>
        <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
          {order.stores?.slug && <span style={{display:"inline-block",background:order.stores.slug==="doner"?"#FFFFFF":"#222222",color:order.stores.slug==="doner"?"#000":"#F0EDE8",padding:"3px 10px",borderRadius:6,fontSize:12,fontWeight:600,letterSpacing:"0.2px"}}>{order.stores.slug==="doner"?"DÖNER":"PARIS"}</span>}
          {where ? (
            <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
              <div style={{fontSize:24,fontWeight:800}}>{where}</div>
              <input value={customerNameEdit} onChange={e=>setCustomerNameEdit(e.target.value)} onBlur={saveCustomerName} placeholder="İsim" style={{background:"#1A1A1A",border:"1px solid #2A2A2A",color:"#F0EDE8",fontSize:14,fontWeight:700,padding:"6px 10px",borderRadius:8,outline:"none",fontFamily:"inherit",width:130}}/>
            </div>
          ) : (
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <Ikon ad="kisi" boy={20}/>
              <input value={customerNameEdit} onChange={e=>setCustomerNameEdit(e.target.value)} onBlur={saveCustomerName} placeholder="Müşteri adı" style={{background:"#1A1A1A",border:"1px solid #2A2A2A",color:"#F0EDE8",fontSize:22,fontWeight:800,padding:"4px 10px",borderRadius:8,outline:"none",fontFamily:"inherit",width:220}}/>
            </div>
          )}
          <div style={{fontSize:12,padding:"3px 8px",background:"#2A2A2A",color:"#aaa",borderRadius:6,fontWeight:600,letterSpacing:"0.2px"}}>{order.status?.toUpperCase()}</div>
        </div>
        <div style={{fontSize:11,color:"#888",marginTop:4}}>{totalItems} ürün · ₺{order.total || 0}</div>
      </div>

      {/* UYE + NOT, KATLANIR. Kapaliyken tek ozet satiri; uye bagliysa beyaz
          kenar (eski sinyal). Icerik ayni JSX — uye kutusu ve not silinmedi. */}
      <div style={{marginBottom:14,background:"#161616",border:"1px solid "+(order?.customer_id?"#FFFFFF":"#2A2A2A"),borderRadius:10}}>
        <button onClick={() => setDetayAcik(v => !v)}
          style={{width:"100%",display:"flex",alignItems:"center",gap:8,padding:"11px 12px",minHeight:44,background:"transparent",border:"none",
                  color:"#F0EDE8",cursor:"pointer",fontFamily:"inherit",textAlign:"left"}}>
          <Ikon ad="kisi" boy={14} style={{flexShrink:0,color:order?.customer_id?"#FFFFFF":"#888"}}/>
          <span style={{flex:1,minWidth:0,fontSize:12.5,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
            <b style={{color:order?.customer_id?"#FFFFFF":"#F0EDE8"}}>Üye: {uyeAdi || "—"}</b>
            {order?.customer_id && <span style={{color:"#888"}}> · {ozelFiyatSayisi > 0 ? ozelFiyatSayisi + " özel fiyat" : "özel fiyat yok"}</span>}
            <span style={{color:"#888"}}> · Not: {order?.note ? order.note : "—"}</span>
          </span>
          <span style={{color:"#888888",display:"flex",flexShrink:0}}><Ikon ad={detayAcik ? "yukari" : "asagi"} boy={14}/></span>
        </button>
        {detayAcik && (
          <div style={{padding:"0 10px 10px"}}>
            {/* Uye bagla: bagli uyenin ozel fiyatlari eklenen urunlere otomatik uygulanir */}
            <div style={{fontSize:12,color:order?.customer_id?"#FFFFFF":"#888",letterSpacing:"0.2px",fontWeight:600,marginBottom:6}}>
              <span style={{display:"inline-flex",alignItems:"center",gap:5}}>{order?.customer_id ? "ÜYE HESABI BAĞLI" : "ÜYE HESABI"}</span>
            </div>
            <select value={order?.customer_id || ""} onChange={e => linkCustomer(e.target.value || null)}
              style={{width:"100%",padding:"10px 12px",background:"#0C0C0C",border:"1px solid "+(order?.customer_id?"#FFFFFF":"#2A2A2A"),borderRadius:8,color:"#F0EDE8",fontSize:14,outline:"none",fontFamily:"inherit"}}>
              <option value="">— Üye değil (misafir) —</option>
              {customers.map(c => (<option key={c.id} value={c.id}>{c.name}{c.phone ? " · " + c.phone : ""}</option>))}
            </select>
            <div style={{fontSize:10,color:"#888888",marginTop:6,lineHeight:1.5}}>
              {order?.customer_id
                ? (ozelFiyatSayisi > 0
                    ? "Bu üyenin " + ozelFiyatSayisi + " özel fiyatı var — eklediğin ürünlere otomatik uygulanır (kampanya daha ucuzsa kampanya)."
                    : "Bu üyeye tanımlı özel fiyat yok; liste fiyatı geçerli.")
                : "Üye seçersen özel fiyatları eklenen ürünlere otomatik iner. Ürünleri eklemeden ÖNCE bağla — eski kalemler yeniden fiyatlanmaz."}
            </div>
            <div style={{marginTop:10}}>
              <input value={orderNote} onChange={e=>setOrderNote(e.target.value)} onBlur={saveOrderNote} placeholder="+ Sipariş notu ekle (mutfak görecek)" style={{width:"100%",boxSizing:"border-box",padding:"10px 14px",background:"transparent",border:"1px dashed #444",color:"#ddd",borderRadius:10,fontSize:13,outline:"none",fontFamily:"inherit"}}/>
            </div>
          </div>
        )}
      </div>

      <div style={{marginBottom:14}}>
        {items.length === 0 && <div style={{color:"#888888",fontSize:12,textAlign:"center",padding:20}}>Henüz ürün yok. Aşağıdaki <b style={{color:"#F0EDE8"}}>+ Ürün Ekle</b>'ye dokun.</div>}
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
                    <span style={{color:"#888888",textDecoration:"line-through",marginRight:5}}>₺{Math.round(Number(it.product_price))}</span>
                  )}
                  {it.is_treat
                    ? <span style={{color:"#F0EDE8",fontWeight:800}}><Ikon ad="hediye" boy={13} style={{marginRight:4}}/>İKRAM{verenAdi(it.treated_by) ? " — " + verenAdi(it.treated_by) : ""} · </span>
                    : <span style={{color:"#888"}}>₺{it.final_price} · </span>}
                  {!it.is_treat && Number(it.manual_discount) > 0 && (
                    <span style={{color:"#F0EDE8",fontWeight:700}}>
                      −₺{Math.round(Number(it.manual_discount))} indirim{it.discount_note ? " · " + it.discount_note : ""} ·{" "}
                    </span>
                  )}
                  <span style={{color:statusColor,fontWeight:700,letterSpacing:"1px"}}>{it.kitchen_status?.toUpperCase()}</span>
                </div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {canTakeaway(prod) && (
                  <button onClick={() => toggleItemTakeaway(it)}
                    style={{marginTop:6,padding:"6px 12px",background:it.is_takeaway?"#FFFFFF":"transparent",color:it.is_takeaway?"#000":"#888",
                            border:"1px solid "+(it.is_takeaway?"#FFFFFF":"#3A3A3A"),borderRadius:20,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                    {it.is_takeaway && <Ikon ad="onay" boy={12} style={{marginRight:4}}/>}<Ikon ad="bardak" boy={12} style={{marginRight:4}}/>Paket
                  </button>
                )}
                <button onClick={() => toggleTreat(it)}
                  style={{marginTop:6,padding:"6px 12px",background:it.is_treat?"#F0EDE8":"transparent",color:it.is_treat?"#000":"#888",
                          border:"1px solid "+(it.is_treat?"#F0EDE8":"#3A3A3A"),borderRadius:20,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                  {it.is_treat && <Ikon ad="onay" boy={12} style={{marginRight:4}}/>}<Ikon ad="hediye" boy={12} style={{marginRight:4}}/>İkram
                </button>
                {/* Kalem indirimi: adet basina TL. Ikramli kalemde anlamsiz, gizli. */}
                {!it.is_treat && (() => {
                  const ind = Math.round(Number(it.manual_discount) || 0);
                  return (
                    <button onClick={() => setIndirimModal({ it, tutar: ind > 0 ? String(ind) : "", not: it.discount_note || "" })}
                      style={{marginTop:6,padding:"6px 12px",background:ind>0?"#F0EDE8":"transparent",color:ind>0?"#000":"#888",
                              border:"1px solid "+(ind>0?"#F0EDE8":"#3A3A3A"),borderRadius:20,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                      <Ikon ad="kampanya" boy={12} style={{marginRight:4}}/>{ind > 0 ? "−₺" + ind + " indirim" : "İndirim"}
                    </button>
                  );
                })()}
                </div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:6,background:"#0C0C0C",borderRadius:20,padding:"3px 5px"}}>
                <button onClick={() => changeQty(it.id, -1)} style={{width:44,height:44,background:"#2A2A2A",color:"#fff",border:"none",borderRadius:"50%",fontSize:20,cursor:"pointer",fontWeight:700}}>−</button>
                <div style={{minWidth:18,textAlign:"center",fontSize:13,fontWeight:800}}>{it.quantity}</div>
                <button onClick={() => changeQty(it.id, +1)} style={{width:44,height:44,background:"#2A2A2A",color:"#fff",border:"none",borderRadius:"50%",fontSize:20,cursor:"pointer",fontWeight:700}}>+</button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Son eklenen kalem — yanlis eklenen urun tek dokunusla geri aliniyor.
          Alt sayfa kapatildiysa ayni isi bu serit yapar. */}
      {geriAlSeridi()}

      {/* SABIT ALT CUBUK: sol "+ Urun Ekle" (birincil), sag "Odeme Al". Kalem
          yokken odeme yerine soluk "Sepet bos" — bos hesap yanlislikla kasaya
          gitmesin. Mobilde tab barin ustunde, masaustunde kenar menunun saginda. */}
      {!kapali && (
        <div style={{position:"fixed",bottom:cubukAlt,left:masaustu?240:0,right:0,zIndex:40,padding:"0 14px",pointerEvents:"none"}}>
          <div style={{display:"flex",gap:8,maxWidth:masaustu?500:undefined,margin:"0 auto",pointerEvents:"auto"}}>
            <button onClick={() => setEkleAcik(true)}
              style={{flex:3,minWidth:0,padding:"14px 10px",minHeight:50,background:"#FFFFFF",color:"#000",border:"none",borderRadius:12,fontSize:14,fontWeight:800,cursor:"pointer",
                      boxShadow:"0 4px 16px rgba(0,0,0,0.5)",display:"inline-flex",alignItems:"center",justifyContent:"center",gap:6,fontFamily:"inherit",whiteSpace:"nowrap"}}>
              <Ikon ad="ekle" boy={16}/>Ürün Ekle
            </button>
            {items.length > 0 ? (
              <button onClick={goToPayment}
                style={{flex:2,minWidth:0,padding:"14px 10px",minHeight:50,background:allReady?"#FFFFFF":"#2A2A2A",color:allReady?"#000":"#F0EDE8",border:"none",borderRadius:12,fontSize:13.5,fontWeight:800,cursor:"pointer",
                        boxShadow:"0 4px 16px rgba(0,0,0,0.5)",display:"inline-flex",alignItems:"center",justifyContent:"center",gap:5,fontFamily:"inherit",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                <Ikon ad={allReady ? "onay" : "kasa"} boy={15}/>Ödeme · ₺{order.total || 0}
              </button>
            ) : (
              <div style={{flex:2,minWidth:0,padding:"14px 10px",minHeight:50,boxSizing:"border-box",background:"#161616",color:"#666",border:"1px solid #2A2A2A",borderRadius:12,fontSize:12.5,fontWeight:700,
                           display:"inline-flex",alignItems:"center",justifyContent:"center",whiteSpace:"nowrap"}}>
                Sepet boş · ₺0
              </div>
            )}
          </div>
        </div>
      )}

      {/* URUN EKLE ALT SAYFASI (z90). Secenek/ikram/indirim pencereleri z100'de
          ustune biner; ic tiklamalar stopPropagation ile kapatmayi tetiklemez.
          Ekledikten sonra ACIK KALIR; Bitti ya da backdrop kapatir. Baslik canli
          (ayni order/items state), altlik = son eklenen + geri al + adet. */}
      {ekleAcik && (
        <div onClick={() => setEkleAcik(false)}
          style={{position:"fixed",top:0,bottom:0,right:0,left:masaustu?240:0,background:"rgba(0,0,0,0.75)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:90}}>
          <div onClick={e => e.stopPropagation()}
            style={{background:"#161616",border:"1px solid #2A2A2A",borderBottom:"none",borderRadius:"16px 16px 0 0",width:"100%",maxWidth:masaustu?500:undefined,
                    maxHeight:"88vh",display:"flex",flexDirection:"column",color:"#F0EDE8",fontFamily:cv}}>
            <div style={{display:"flex",alignItems:"center",gap:10,padding:"12px 14px",borderBottom:"1px solid #2A2A2A",flexShrink:0}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:15,fontWeight:800,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                  {where || order.customer_name || "Hesap"} · {totalItems} ürün · ₺{order.total || 0}
                </div>
                <div style={{fontSize:11,color:order.customer_id?"#FFFFFF":"#888",marginTop:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                  Üye: {uyeAdi || "—"}{order.customer_id && ozelFiyatSayisi > 0 ? " · " + ozelFiyatSayisi + " özel fiyat" : ""}{kapali ? " · " + String(order.status).toUpperCase() : ""}
                </div>
              </div>
              <button onClick={() => setEkleAcik(false)}
                style={{flexShrink:0,minHeight:44,padding:"0 14px",background:"#FFFFFF",color:"#000",border:"none",borderRadius:10,fontSize:13,fontWeight:800,cursor:"pointer",fontFamily:"inherit",display:"inline-flex",alignItems:"center",gap:5}}>
                <Ikon ad="onay" boy={14}/>Bitti
              </button>
            </div>
            <div style={{flex:1,minHeight:0,overflowY:"auto",overscrollBehavior:"contain",padding:"0 14px 14px",WebkitOverflowScrolling:"touch"}}>
              <UrunSecici
                products={products} categories={categories} hhPrices={hhPrices} sikUrunler={sikUrunler}
                partiAktif={partiAktif} partiAdet={partiAdet} tumMenu={tumMenu} onTumMenu={setTumMenu}
                takeawayMode={takeawayMode} onTakeaway={setTakeawayMode}
                prodSearch={prodSearch} onSearch={setProdSearch}
                selectedCat={selectedCat} onCat={setSelectedCat}
                onAdd={urunEkle} kapali={kapali} parlayanId={parlayan}
              />
            </div>
            {/* Hesap baska cihazdan odendiyse (realtime orders kanali) ekleme durur. */}
            {kapali ? (
              <div style={{padding:"12px 14px",borderTop:"1px solid #2A2A2A",fontSize:12,color:"#C87A6A",fontWeight:700,textAlign:"center",flexShrink:0}}>
                Bu hesap kapandı ({order.status.toUpperCase()}) — ürün eklenemez.
              </div>
            ) : (
              <div style={{flexShrink:0}}>{geriAlSeridi(true)}</div>
            )}
          </div>
        </div>
      )}

      {treatModal && (
        <div onClick={() => setTreatModal(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:100}}>
          <div onClick={e => e.stopPropagation()} style={{background:"#161616",border:"1px solid #2A2A2A",borderRadius:"16px 16px 0 0",padding:20,width:"100%",maxWidth:500}}>
            <div style={{fontSize:16,fontWeight:800,color:"#F0EDE8",marginBottom:2}}><Ikon ad="hediye" boy={16} style={{marginRight:6}}/>İkramı kim veriyor?</div>
            <div style={{fontSize:11,color:"#888",marginBottom:14}}>{treatModal.product_name} · ₺{treatModal.final_price} hesaptan düşülecek</div>
            {treatVerenler().map(v => (
              <button key={v.id} onClick={() => { const it = treatModal; setTreatModal(null); applyTreat(it, v.id); }}
                style={{width:"100%",padding:"13px 14px",marginBottom:7,display:"flex",alignItems:"center",gap:10,
                        background: v.ben ? "#161616" : "#222", color: v.ben ? "#F0EDE8" : "#ddd",
                        border:"1px solid " + (v.ben ? "#E8C36A55" : "#333"), borderRadius:10,
                        fontSize:14, fontWeight:700, cursor:"pointer", fontFamily:cv, textAlign:"left"}}>
                <Ikon ad={v.ben ? "kisi" : "yildiz"} boy={14}/>{v.ben ? "Ben — " + v.ad : v.ad}
              </button>
            ))}
            <button onClick={() => setTreatModal(null)} style={{width:"100%",padding:"12px",background:"transparent",color:"#888",border:"1px solid #333",borderRadius:10,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:cv,marginTop:4}}>Vazgeç</button>
          </div>
        </div>
      )}

      {indirimModal && (() => {
        const it = indirimModal.it;
        const taban = Math.max(0, Math.round(Number(it.final_price) + (Number(it.manual_discount) || 0)));
        const tutar = Math.max(0, Math.round(Number(String(indirimModal.tutar).replace(",", ".")) || 0));
        const asiyor = tutar > taban;
        const yeni = Math.max(0, taban - tutar);
        const uygula = (t) => { const m = indirimModal; setIndirimModal(null); applyDiscount(m.it, t, m.not); };
        const kutu = {width:"100%",padding:"12px 14px",background:"#0C0C0C",border:"1px solid #2A2A2A",borderRadius:10,color:"#F0EDE8",fontSize:16,outline:"none",fontFamily:cv,boxSizing:"border-box"};
        return (
          <div onClick={() => setIndirimModal(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:100}}>
            <div onClick={e => e.stopPropagation()} style={{background:"#161616",border:"1px solid #2A2A2A",borderRadius:"16px 16px 0 0",padding:20,width:"100%",maxWidth:500}}>
              <div style={{fontSize:16,fontWeight:800,color:"#F0EDE8",marginBottom:2}}>İndirim — {it.product_name}</div>
              <div style={{fontSize:11,color:"#888",marginBottom:12}}>
                Adet başına TL. Şu an ₺{taban}{it.quantity > 1 ? ` × ${it.quantity} adet` : ""}
              </div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
                {[10, 20, 50, 100].filter(v => v <= taban).map(v => (
                  <button key={v} onClick={() => setIndirimModal(m => ({ ...m, tutar: String(v) }))}
                    style={{padding:"8px 12px",background:tutar === v ? "#F0EDE8" : "transparent",color:tutar === v ? "#000" : "#aaa",
                            border:"1px solid " + (tutar === v ? "#F0EDE8" : "#3A3A3A"),borderRadius:20,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:cv}}>
                    −₺{v}
                  </button>
                ))}
              </div>
              <input type="number" inputMode="numeric" min="0" max={taban} step="1" autoFocus
                value={indirimModal.tutar} onChange={e => setIndirimModal(m => ({ ...m, tutar: e.target.value }))}
                placeholder="İndirim (₺)" style={{...kutu, marginBottom:8, fontWeight:800}} />
              <input value={indirimModal.not} onChange={e => setIndirimModal(m => ({ ...m, not: e.target.value }))}
                placeholder="Neden? (isteğe bağlı — hasar, gecikme, pazarlık…)" style={{...kutu, fontSize:13, marginBottom:12}} />
              <div style={{fontSize:13,color:asiyor ? "#C87A6A" : "#aaa",marginBottom:14,fontVariantNumeric:"tabular-nums"}}>
                {asiyor
                  ? `İndirim fiyatı aşamaz (en fazla ₺${taban})`
                  : <>₺{taban} → <b style={{color:"#F0EDE8"}}>₺{yeni}</b>{it.quantity > 1 ? ` · satır ₺${yeni * it.quantity}` : ""}</>}
              </div>
              <div style={{display:"flex",gap:8}}>
                <button onClick={() => uygula(tutar)} disabled={tutar <= 0 || asiyor}
                  style={{flex:2,padding:"13px",background:(tutar <= 0 || asiyor) ? "#333" : "#FFFFFF",color:(tutar <= 0 || asiyor) ? "#777" : "#000",
                          border:"none",borderRadius:10,fontSize:14,fontWeight:800,cursor:(tutar <= 0 || asiyor) ? "not-allowed" : "pointer",fontFamily:cv}}>
                  Uygula
                </button>
                {Number(it.manual_discount) > 0 && (
                  <button onClick={() => uygula(0)}
                    style={{flex:1,padding:"13px",background:"transparent",color:"#F0EDE8",border:"1px solid #3A3A3A",borderRadius:10,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:cv}}>
                    Kaldır
                  </button>
                )}
                <button onClick={() => setIndirimModal(null)}
                  style={{flex:1,padding:"13px",background:"transparent",color:"#888",border:"1px solid #333",borderRadius:10,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:cv}}>
                  Vazgeç
                </button>
              </div>
            </div>
          </div>
        );
      })()}

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
                  <div style={{fontSize:12,letterSpacing:"0.2px",color:"#8A8580",fontWeight:600,marginBottom:6}}>
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
