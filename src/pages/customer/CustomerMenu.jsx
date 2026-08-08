import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../../lib/supabase.js";
import { useAuth } from "../../contexts/AuthContext.jsx";

const cv = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";

// Alt sekmeler — QR menu ayni zamanda vitrin: etkinlik/rezervasyon, surusler, shop, blog
const CUST_TABS = [
  { key: "menu",   icon: "🍽", tr: "Menü",     en: "Menu",   ru: "Меню" },
  { key: "events", icon: "🎟", tr: "Etkinlik", en: "Events", ru: "События" },
  { key: "rides",  icon: "🚴", tr: "Sürüş",    en: "Rides",  ru: "Заезды" },
  { key: "shop",   icon: "👕", tr: "Shop",     en: "Shop",   ru: "Шоп" },
  { key: "blog",   icon: "📰", tr: "Blog",     en: "Blog",   ru: "Блог" },
];
// Etkinlik + surusler dogrudan rezervasyon sisteminin (NIP RESERVE) public verisinden okunur
const RESERVE_URL = "https://diqparjrtvvfxvwxebov.supabase.co";
const RESERVE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRpcXBhcmpydHZ2Znh2d3hlYm92Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5Mzc3OTMsImV4cCI6MjA4OTUxMzc5M30.pNI2yU6LDG8583HBPq-5puxkpEVEAYwhGp9ibJ1WBsI";
const RESERVATION_URL = "https://reservation.notinparis.me";
const RIDES_URL = "https://notinparis.me/pages/rides";
const YOUTUBE_URL = "https://www.youtube.com/@notinparis";
const STRAVA_URL = "https://www.strava.com/clubs/notinparis";
const INSTAGRAM_URL = "https://instagram.com/notinparis.me";
const GOOGLE_RATE_URL = "https://www.google.com/maps/search/?api=1&query=Not+in+Paris+Fethiye";

const T = {
  tr: {
    menu: "MENÜ",
    partyMode: "PARTİ MODU",
    category_empty: "Bu kategoride ürün yok",
    sold_out: "Tükendi",
    optional: "SEÇENEKLI",
    cart: "🛒 Sepetim",
    continue: "Devam",
    note_optional: "Örn: buzsuz, sekersiz",
    optional_label: "NOT (OPSİYONEL)",
    cancel: "İptal",
    add_to_cart: "Sepete Ekle",
    my_cart: "Sepetim",
    your_name: "ADIN (garsonlar seni tanısın)",
    name_placeholder: "Örn: Efekan",
    order_note_label: "SİPARİŞ NOTU (mutfak görecek)",
    order_note_placeholder: "Örn: az pişmiş, baharatsız...",
    total: "TOPLAM",
    submit_order: "Siparişi Gönder",
    submitting: "Gönderiliyor...",
    waiter_will_bring: "Garson siparişini masana getirecek",
    notif_promise: "Sipariş hazır olunca bildirim göndereceğiz",
    please_choose: "Lütfen",
    please_enter_name: "Lütfen adını gir",
    sold_out_alert: "Bu ürün şu an tükendi: ",
    order_received: "Siparişin alındı!",
    order_kitchen_msg: "utfağa iletildi. Hazırlanıyor…",
    preparing: "Hazırlanıyor...",
    notif_granted: "🔔 Hazır olunca bildirim alacaksın",
    notif_denied: "⚠️ Bildirim engellendi. Sayfayı açık bırak — hazır olunca ses çalacak.",
    notif_ask: "🔔 Bildirim izni ver",
    back_to_menu: "Menüye dön",
    order_ready_big: "SİPARİŞİN HAZIR!",
    pick_from_cashier: "Kasadan alabilirsin.",
    play_again: "🔊 Tekrar çal",
    enjoy: "Afiyet olsun!",
    thanks: "Tekrar bekleriz ♥",
    new_order: "Yeni sipariş ver",
    submit_failed: "Sipariş gönderilemedi: ",
    notif_title: "🔔 Siparişin hazır!",
    notif_body: "Kasadan alabilirsin — Not In Paris",
    happy_hour: "HAPPY HOUR",
  },
  en: {
    menu: "MENU",
    partyMode: "PARTY MODE",
    category_empty: "No products in this category",
    sold_out: "Sold out",
    optional: "OPTIONS",
    cart: "🛒 Cart",
    continue: "Continue",
    note_optional: "e.g. no ice, no sugar",
    optional_label: "NOTE (OPTIONAL)",
    cancel: "Cancel",
    add_to_cart: "Add to Cart",
    my_cart: "My Cart",
    your_name: "YOUR NAME (so the staff can find you)",
    name_placeholder: "e.g. John",
    order_note_label: "ORDER NOTE (kitchen will see)",
    order_note_placeholder: "e.g. medium-rare, no spice...",
    total: "TOTAL",
    submit_order: "Place Order",
    submitting: "Sending...",
    waiter_will_bring: "Server will bring it to your table",
    notif_promise: "We'll notify you when your order is ready",
    please_choose: "Please choose",
    please_enter_name: "Please enter your name",
    sold_out_alert: "This item is sold out: ",
    order_received: "Order received!",
    order_kitchen_msg: "ent to kitchen. Being prepared…",
    preparing: "Preparing...",
    notif_granted: "🔔 You'll be notified when ready",
    notif_denied: "⚠️ Notifications blocked. Keep this page open — you'll hear a sound when ready.",
    notif_ask: "🔔 Enable notifications",
    back_to_menu: "Back to menu",
    order_ready_big: "YOUR ORDER IS READY!",
    pick_from_cashier: "Pick it up from the cashier.",
    play_again: "🔊 Play again",
    enjoy: "Enjoy your meal!",
    thanks: "See you soon ♥",
    new_order: "Place a new order",
    submit_failed: "Failed to send order: ",
    notif_title: "🔔 Your order is ready!",
    notif_body: "Pick it up from the cashier — Not In Paris",
    happy_hour: "HAPPY HOUR",
  },
  ru: {
    menu: "МЕНЮ",
    partyMode: "PARTY MODE",
    category_empty: "В этой категории пока нет позиций",
    sold_out: "Закончилось",
    optional: "ОПЦИИ",
    cart: "🛒 Корзина",
    continue: "Далее",
    note_optional: "напр.: без льда, без сахара",
    optional_label: "ПРИМЕЧАНИЕ (НЕОБЯЗАТЕЛЬНО)",
    cancel: "Отмена",
    add_to_cart: "В корзину",
    my_cart: "Моя корзина",
    your_name: "ВАШЕ ИМЯ (чтобы официант вас нашёл)",
    name_placeholder: "напр.: Иван",
    order_note_label: "ПРИМЕЧАНИЕ К ЗАКАЗУ (увидит кухня)",
    order_note_placeholder: "напр.: средняя прожарка, без специй...",
    total: "ИТОГО",
    submit_order: "Отправить заказ",
    submitting: "Отправляем...",
    waiter_will_bring: "Официант принесёт заказ к вашему столу",
    notif_promise: "Мы сообщим, когда заказ будет готов",
    please_choose: "Пожалуйста, выберите",
    please_enter_name: "Пожалуйста, введите имя",
    sold_out_alert: "Эта позиция закончилась: ",
    order_kitchen_msg: "тправлено на кухню. Готовится…",
    order_received: "Заказ принят!",
    preparing: "Готовится...",
    notif_granted: "🔔 Сообщим, когда будет готово",
    notif_denied: "⚠️ Уведомления заблокированы. Не закрывайте страницу — прозвучит сигнал.",
    notif_ask: "🔔 Разрешить уведомления",
    back_to_menu: "Вернуться в меню",
    order_ready_big: "ВАШ ЗАКАЗ ГОТОВ!",
    pick_from_cashier: "Заберите на кассе.",
    play_again: "🔊 Повторить",
    enjoy: "Приятного аппетита!",
    thanks: "Ждём вас снова ♥",
    new_order: "Новый заказ",
    submit_failed: "Не удалось отправить заказ: ",
    notif_title: "🔔 Ваш заказ готов!",
    notif_body: "Заберите на кассе — Not In Paris",
    happy_hour: "HAPPY HOUR",
  }
};

function isInRange(now, from, until) {
  if (!from || !until) return false;
  const [fh, fm] = from.split(":").map(Number);
  const [uh, um] = until.split(":").map(Number);
  const h = now.getHours(), m = now.getMinutes();
  const nowMin = h * 60 + m;
  const fromMin = fh * 60 + fm;
  const untilMin = uh * 60 + um;
  if (fromMin <= untilMin) return nowMin >= fromMin && nowMin < untilMin;
  return nowMin >= fromMin || nowMin < untilMin;
}

let _audioCtx = null;
function getAudioCtx() {
  if (!_audioCtx) {
    try { _audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
  }
  return _audioCtx;
}

async function playDing() {
  const ctx = getAudioCtx();
  if (!ctx) return;
  if (ctx.state === "suspended") { try { await ctx.resume(); } catch (e) {} }
  const beep = (freq, start, dur, vol=0.6) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = freq;
    o.connect(g); g.connect(ctx.destination);
    g.gain.setValueAtTime(0.0001, ctx.currentTime + start);
    g.gain.exponentialRampToValueAtTime(vol, ctx.currentTime + start + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
    o.start(ctx.currentTime + start);
    o.stop(ctx.currentTime + start + dur);
  };
  beep(880, 0, 0.18);
  beep(1320, 0.18, 0.35);
}

function vibrate() {
  try { if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 400]); } catch (e) {}
}

function showBrowserNotification(title, body) {
  try {
    if (typeof Notification === "undefined") return;
    if (Notification.permission !== "granted") return;
    const n = new Notification(title, {
      body,
      icon: "/icon512.png",
      badge: "/icon512.png",
      tag: "nip-order",
      requireInteraction: true,
      vibrate: [200,100,200],
    });
    n.onclick = () => { window.focus(); n.close(); };
  } catch (e) {}
}

export default function CustomerMenu() {
  const { qrToken } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const storeSlugParam = (searchParams.get("store") || "paris").toLowerCase();
  const [currentStoreId, setCurrentStoreId] = useState(null);

  const [lang, setLang] = useState(() => {
    try { return localStorage.getItem("nip_lang") || "tr"; } catch (e) { return "tr"; }
  });
  const t = T[lang] || T.tr;
  const setLanguage = (l) => { setLang(l); try { localStorage.setItem("nip_lang", l); } catch (e) {} };

  const [table, setTable] = useState(null);
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [settings, setSettings] = useState(null);
  const [hh, setHh] = useState(null);
  const [hhProductPrices, setHhProductPrices] = useState({});
  const [fadedProdInfo, setFadedProdInfo] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectedCat, setSelectedCat] = useState(null);
  const [cart, setCart] = useState([]);
  const [optModal, setOptModal] = useState(null);
  const [optSelected, setOptSelected] = useState({});
  const [optNote, setOptNote] = useState("");
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [orderNote, setOrderNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [successOrderId, setSuccessOrderId] = useState(null);
  const [orderStage, setOrderStage] = useState("pending");
  const [notifState, setNotifState] = useState(
    typeof Notification !== "undefined" ? Notification.permission : "unsupported"
  );
  const audioUnlockedRef = useRef(false);

  const now = new Date();
  const partyMode = settings && settings.party_mode_enabled &&
    isInRange(now, settings.party_mode_from, settings.party_mode_until);

  // Uye sistemi: Google ile giren musteri + urun bazli sabit (₺) indirimleri
  const { customer, signInWithGoogle } = useAuth();
  const [memberDiscounts, setMemberDiscounts] = useState({});
  useEffect(() => {
    if (!customer?.id) { setMemberDiscounts({}); return; }
    supabase.from("member_discounts").select("product_id, amount")
      .eq("customer_id", customer.id).eq("is_active", true)
      .then(({ data }) => {
        const map = {};
        (data || []).forEach(d => { map[d.product_id] = Number(d.amount) || 0; });
        setMemberDiscounts(map);
      });
  }, [customer?.id]);

  // Alt sekmeler + siparis beklerken gezinme
  const [custTab, setCustTab] = useState("menu");
  const [browsing, setBrowsing] = useState(false);
  const [feeds, setFeeds] = useState({});         // shopify-feed: events/rides
  const [postFeeds, setPostFeeds] = useState({}); // posts: shop(urun)/blog
  useEffect(() => {
    const today = new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 10); // TR gunu
    if (custTab === "events" && !feeds.events) {
      fetch(RESERVE_URL + "/rest/v1/events?select=name,subtitle,date,time,genre,access_type&status=eq.active&date=gte." + today + "&order=date.asc&limit=12",
        { headers: { apikey: RESERVE_KEY } })
        .then(r => r.json())
        .then(d => setFeeds(f => ({ ...f, events: Array.isArray(d) ? d : [] })))
        .catch(() => setFeeds(f => ({ ...f, events: [] })));
    }
    if (custTab === "rides" && !feeds.rides) {
      fetch(RESERVE_URL + "/rest/v1/ride_posts?select=title,ride_date,ride_time,pace,distance_km,elevation_m,meet_point&ride_date=gte." + today + "&order=ride_date.asc&limit=12",
        { headers: { apikey: RESERVE_KEY } })
        .then(r => r.json())
        .then(d => setFeeds(f => ({ ...f, rides: Array.isArray(d) ? d : [] })))
        .catch(() => setFeeds(f => ({ ...f, rides: [] })));
    }
    if ((custTab === "shop" || custTab === "blog") && !postFeeds[custTab]) {
      supabase.from("posts").select("*")
        .eq("kind", custTab === "shop" ? "urun" : "blog").eq("is_active", true)
        .order("sort_order").order("created_at", { ascending: false })
        .then(({ data }) => setPostFeeds(f => ({ ...f, [custTab]: data || [] })));
    }
  }, [custTab]);

  const pName = (p) => (lang === "en" && p?.name_en) ? p.name_en : (lang === "ru" && p?.name_ru) ? p.name_ru : p?.name;
  const pDesc = (p) => (lang === "en" && p?.description_en) ? p.description_en : (lang === "ru" && p?.description_ru) ? p.description_ru : p?.description;
  const cName = (c) => (lang === "en" && c?.name_en) ? c.name_en : (lang === "ru" && c?.name_ru) ? c.name_ru : c?.name;
  // Inline uc-dil yardimcisi: L(tr, en, ru)
  const L = (trS, enS, ruS) => lang === "en" ? enS : lang === "ru" ? ruS : trS;
  const postTitle = (p) => (lang === "en" && p?.title_en) ? p.title_en : (lang === "ru" && p?.title_ru) ? p.title_ru : p?.title;
  const postBody = (p) => (lang === "en" && p?.body_en) ? p.body_en : (lang === "ru" && p?.body_ru) ? p.body_ru : p?.body;
  const dateLocale = lang === "en" ? "en-GB" : lang === "ru" ? "ru-RU" : "tr-TR";
  const fmtDay = (d) => { try { return new Date(d + "T12:00:00").toLocaleDateString(dateLocale, { weekday: "short", day: "numeric", month: "short" }); } catch (e) { return d; } };

  const load = async () => {
    setLoading(true);
    try {
      // 1) Resolve current store: qrToken → cafe_tables.store_id, else URL ?store=slug
      let tab = null;
      let storeId = null;
      if (qrToken) {
        const { data: tt } = await supabase.from("cafe_tables").select("*").eq("qr_token", qrToken).maybeSingle();
        tab = tt || null;
        storeId = tab?.store_id || null;
      }
      if (!storeId) {
        const { data: storeRow } = await supabase.from("stores").select("id").eq("slug", storeSlugParam).maybeSingle();
        storeId = storeRow?.id || null;
      }
      if (!storeId) {
        // Fallback: paris
        const { data: parisRow } = await supabase.from("stores").select("id").eq("slug", "paris").maybeSingle();
        storeId = parisRow?.id || null;
      }
      setCurrentStoreId(storeId);
      setTable(tab);

      // 2) Load store-scoped data in parallel
      const [{data: cats}, {data: prods}, {data: appRows}, hhRes, {data: scheduleRules}, {data: hhRules}] = await Promise.all([
        supabase.from("categories").select("*").eq("is_active", true).eq("store_id", storeId).order("sort_order"),
        supabase.from("products").select("*").eq("is_available", true).eq("store_id", storeId).order("sort_order"),
        supabase.from("app_settings").select("key,value").eq("store_id", storeId),
        Promise.resolve({data: null}),
        supabase.from("category_schedule_rules").select("*").eq("is_active", true).eq("store_id", storeId),
        supabase.from("happy_hour_rules").select("*").eq("is_active", true).eq("store_id", storeId),
      ]);
      // Cross-store: paris view also shows doner Kitchen category + its products
      const PARIS_STORE_UUID = "c3c6e0c7-1821-4edd-993d-ad960cfbc452";
      const DONER_STORE_UUID = "c39da530-7f73-4f69-a752-029bf03790b1";
      const finalCats = [...(cats || [])];
      const finalProds = [...(prods || [])];
      if (storeId === PARIS_STORE_UUID) {
        const { data: kCats } = await supabase.from("categories").select("*").eq("is_active", true).eq("store_id", DONER_STORE_UUID).eq("name_en", "Kitchen");
        if (kCats && kCats.length > 0) {
          finalCats.push(...kCats);
          const kitchenCatId = kCats[0].id;
          const kCatIds = kCats.map(c => c.id);
          const { data: kProds } = await supabase.from("products").select("*").eq("is_available", true).eq("store_id", DONER_STORE_UUID).in("category_id", kCatIds).order("sort_order");
          if (kProds && kProds.length > 0) {
            // Move drinks (Coke, Ayran) to paris Cold Drinks tab as visual alias
            // Skip Water/Soda from doner — paris already has its own Water/Soda in Cold Drinks
            const coldDrinksCat = finalCats.find(c => c.name === "Cold Drinks");
            const drinkAliasNames = ["Coke", "Ayran"];
            const skipNames = ["Water", "Soda"];
            kProds.forEach(p => {
              if (skipNames.includes(p.name)) {
                return; // skip — paris view has its own Water/Soda
              }
              if (coldDrinksCat && drinkAliasNames.includes(p.name)) {
                finalProds.push({ ...p, category_id: coldDrinksCat.id });
              } else {
                finalProds.push(p);
              }
            });
          }
          // Visual alias: also show paris Brunch products under Kitchen tab. Order routing unchanged (same product_id => paris kitchen).
          const brunchCat = finalCats.find(c => c.name === "Brunch" && c.store_id === storeId);
          if (brunchCat) {
            const brunchAliases = finalProds.filter(p => p.category_id === brunchCat.id).map(p => ({ ...p, category_id: kitchenCatId }));
            finalProds.push(...brunchAliases);
          }
        }
        finalCats.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
      }
      // Hide Brunch tab from paris view (all Brunch products visible under Kitchen tab now)
      const finalCatsFiltered = finalCats.filter(c => c.name !== "Brunch");
      // Apply category schedule rules (hide categories during certain time windows)
      const now = new Date();
      const dayOfWeek = now.getDay();
      const minutes = now.getHours() * 60 + now.getMinutes();
      const hiddenCatIds = new Set();
      const hiddenProdIds = new Set();
      const fadedProdInfoLocal = {};
      (scheduleRules || []).forEach(rule => {
        if (!rule.days_of_week?.includes(dayOfWeek)) return;
        const [sh, sm] = rule.start_time.split(":").map(Number);
        const [eh, em] = rule.end_time.split(":").map(Number);
        const startMin = sh * 60 + sm;
        const endMin = eh * 60 + em;
        let inRange;
        if (startMin <= endMin) {
          inRange = minutes >= startMin && minutes < endMin;
        } else {
          inRange = minutes >= startMin || minutes < endMin;
        }
        if (inRange) {
          Object.keys(rule.category_overrides || {}).forEach(cid => hiddenCatIds.add(cid));
          Object.keys(rule.product_overrides || {}).forEach(pid => { hiddenProdIds.add(pid); fadedProdInfoLocal[pid] = { start: rule.start_time, end: rule.end_time }; });
        }
      });
      const finalCatsAfterSchedule = finalCatsFiltered.filter(c => !hiddenCatIds.has(c.id));
      setCategories(finalCatsAfterSchedule);
      setProducts(finalProds);
      setFadedProdInfo(fadedProdInfoLocal);

      // 3) Convert app_settings rows → flat object {key1: value1, key2: value2}
      const settingsObj = {};
      (appRows || []).forEach(row => { settingsObj[row.key] = row.value; });
      setSettings(settingsObj);

      if (hhRes && hhRes.data && hhRes.data[0]) setHh(hhRes.data[0]);
      // Compute product-based happy hour prices from new hhRules query
      const _now = new Date();
      const _dow = _now.getDay() === 0 ? 7 : _now.getDay();
      const _mins = _now.getHours() * 60 + _now.getMinutes();
      const _productPrices = {};
      (hhRules || []).forEach(rule => {
        if (!rule.days_of_week || !rule.days_of_week.includes(_dow)) return;
        const [sh, sm] = rule.start_time.split(":").map(Number);
        const [eh, em] = rule.end_time.split(":").map(Number);
        const sMin = sh * 60 + sm;
        const eMin = eh * 60 + em;
        let inRng;
        if (sMin <= eMin) inRng = _mins >= sMin && _mins < eMin;
        else inRng = _mins >= sMin || _mins < eMin;
        if (inRng) Object.assign(_productPrices, rule.product_overrides || {});
      });
      (finalProds||[]).forEach(function(p){ if(p && p.hh_enabled && p.hh_price!=null && p.hh_price!=='' && p.hh_start && p.hh_end){ var _d=new Date(); var _day=_d.getDay(); var _days=Array.isArray(p.hh_days)?p.hh_days:[0,1,2,3,4,5,6]; if(_days.indexOf(_day)>=0){ var _ps=String(p.hh_start).split(':'); var _pe=String(p.hh_end).split(':'); var _sMin=Number(_ps[0])*60+Number(_ps[1]); var _eMin=Number(_pe[0])*60+Number(_pe[1]); var _cur=_d.getHours()*60+_d.getMinutes(); var _inR=_sMin<=_eMin?(_cur>=_sMin && _cur<_eMin):(_cur>=_sMin || _cur<_eMin); if(_inR) _productPrices[p.id]=Number(p.hh_price); } } });
      setHhProductPrices(_productPrices);
      if (cats && cats.length && !selectedCat) setSelectedCat(cats[0].id);
    } catch (e) { console.error("Menu load error", e); }
    setLoading(false);
  };

  useEffect(() => { load(); }, [qrToken, storeSlugParam]);

  useEffect(() => {
    if (!successOrderId) return;
    let stopped = false;
    const checkStatus = async () => {
      if (stopped) return;
      const { data: items } = await supabase
        .from("order_items").select("kitchen_status").eq("order_id", successOrderId);
      if (!items || items.length === 0) return;
      const allServed = items.every(it => it.kitchen_status === "served");
      const anyReady = items.some(it => it.kitchen_status === "ready" || it.kitchen_status === "served");
      if (allServed) {
        setOrderStage(prev => prev === "served" ? prev : "served");
      } else if (anyReady) {
        setOrderStage(prev => {
          if (prev === "ready" || prev === "served") return prev;
          playDing(); vibrate();
          showBrowserNotification(t.notif_title, t.notif_body);
          setBrowsing(false); // sekmelerde geziyorsa buyuk HAZIR ekranina don
          return "ready";
        });
      }
    };
    checkStatus();
    const poller = setInterval(checkStatus, 3000);
    const ch = supabase
      .channel("customer-order-" + successOrderId)
      .on("postgres_changes", {event:"*", schema:"public", table:"order_items", filter:"order_id=eq." + successOrderId}, checkStatus)
      .subscribe();
    return () => { stopped = true; clearInterval(poller); supabase.removeChannel(ch); };
  }, [successOrderId, lang]);

  const unlockAudio = async () => {
    if (audioUnlockedRef.current) return;
    try {
      const ctx = getAudioCtx();
      if (ctx && ctx.state === "suspended") await ctx.resume();
      if (ctx) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        g.gain.value = 0.001;
        o.connect(g); g.connect(ctx.destination);
        o.start(); o.stop(ctx.currentTime + 0.02);
      }
      audioUnlockedRef.current = true;
    } catch (e) {}
  };

  const askNotifPermissionSync = () => {
    if (typeof Notification === "undefined") return;
    if (Notification.permission !== "default") { setNotifState(Notification.permission); return; }
    try {
      const maybe = Notification.requestPermission((perm) => setNotifState(perm));
      if (maybe && typeof maybe.then === "function") maybe.then(p => setNotifState(p));
    } catch (e) {}
  };

  const visibleCategories = useMemo(() => {
    return categories.filter(c => {
      if (c.available_from && c.available_until && !isInRange(now, c.available_from, c.available_until)) return false;
      return true;
    });
  }, [categories, now]);

  const visibleProducts = useMemo(() => {
    let list = products.filter(p => p.category_id === selectedCat);
    if (partyMode) {
      const partyProducts = list.filter(p => p.show_in_party_menu);
      if (partyProducts.length > 0) list = partyProducts;
    }
    return list;
  }, [products, selectedCat, partyMode]);

  const calcPrice = (p, options) => {
    // Add price modifiers from selected options (e.g. Single/Double pour size)
    let mod = 0;
    if (options && p.options_config?.groups) {
      for (const group of p.options_config.groups) {
        const selectedOpt = options[group.name];
        if (selectedOpt && group.price_modifiers && group.price_modifiers[selectedOpt] != null) {
          mod += Number(group.price_modifiers[selectedOpt]) || 0;
        }
      }
    }
    // Product-based happy hour: use new price directly
    const basePrice = (hhProductPrices[p.id] != null ? Number(hhProductPrices[p.id]) : Number(p.price)) + mod;
    let pct = 0;
    if (hh && (hh.category_ids?.length === 0 || hh.category_ids?.includes(p.category_id))) pct = Number(hh.discount_pct) || 0;
    if (Number(p.instant_discount_pct||0) > pct) pct = Number(p.instant_discount_pct);
    let final = Math.round(basePrice * (100 - pct) / 100);
    // Uye indirimi: normal fiyattan sabit ₺ dusulur; musteriye dusuk olan fiyat gosterilir
    const memberAmt = Number(memberDiscounts[p.id] || 0);
    if (memberAmt > 0) final = Math.min(final, Math.max(0, Math.round(Number(p.price) + mod - memberAmt)));
    return final;
  };

  const cartTotal = useMemo(() => cart.reduce((s, it) => s + calcPrice(it.product, it.options) * it.quantity, 0), [cart, hh, memberDiscounts]);
  const cartCount = useMemo(() => cart.reduce((s, it) => s + it.quantity, 0), [cart]);

  const findInCart = (productId, options, note) => {
    return cart.findIndex(c =>
      c.product.id === productId &&
      JSON.stringify(c.options || null) === JSON.stringify(options || null) &&
      (c.note || "") === (note || "")
    );
  };

  const onProductTap = (p) => {
    unlockAudio();
    if (p.sold_out_today) { alert(t.sold_out_alert + (p.unavailable_reason || "")); return; }
    if (p.has_options && p.options_config) {
      setOptModal(p); setOptSelected({}); setOptNote("");
    } else { addToCart(p, null, null); }
  };

  const addToCart = (product, options, note) => {
    setCart(prev => {
      const idx = findInCart(product.id, options, note);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 };
        return next;
      }
      return [...prev, { product, quantity: 1, options: options || null, note: note || null }];
    });
  };

  const updateQty = (idx, delta) => {
    setCart(prev => {
      const next = [...prev];
      const q = next[idx].quantity + delta;
      if (q <= 0) return next.filter((_, i) => i !== idx);
      next[idx] = { ...next[idx], quantity: q };
      return next;
    });
  };

  const confirmOptions = () => {
    if (!optModal) return;
    const cfg = optModal.options_config || {};
    for (const group of cfg.groups || []) {
      if (group.required && (group.multi?!((optSelected[group.name]||[]).length):!optSelected[group.name])) { alert(t.please_choose + " " + group.name); return; }
    }
    addToCart(optModal, optSelected, optNote.trim() || null);
    setOptModal(null);
  };

  const submitOrder = async () => {
    if (submitting || cart.length === 0) return;
    if (!table && !customerName.trim() && !customer) { alert(t.please_enter_name); return; }
    unlockAudio(); askNotifPermissionSync();
    setSubmitting(true);
    try {
      const totalVal = cartTotal;
      const { data: ord, error: ordErr } = await supabase.from("orders").insert({
        table_id: table ? table.id : null,
        customer_name: table ? null : (customerName.trim() || customer?.name || null),
        customer_id: customer?.id || null,
        subtotal: totalVal, total: totalVal, status: "open",
        note: orderNote.trim() || null,
        origin_store_id: currentStoreId,
      }).select().single();
      if (ordErr) throw ordErr;
      const itemsPayload = cart.map(c => ({
        order_id: ord.id, product_id: c.product.id, product_name: c.product.name,
        product_price: Number(c.product.price), final_price: calcPrice(c.product, c.options),
        quantity: c.quantity, kitchen_status: "pending", sent_to_kitchen: true, kitchen_destination_store_id: c.product.kitchen_destination_store_id || c.product.store_id,
        notes: c.note || null, selected_options: c.options || null,
        store_id: c.product.store_id || currentStoreId,
      }));
      const { error: itErr } = await supabase.from("order_items").insert(itemsPayload);
      if (itErr) throw itErr;
      setSuccessOrderId(ord.id);
      setOrderStage("pending");
      setBrowsing(false); setCustTab("menu");
      setCart([]); setOrderNote(""); setCheckoutOpen(false);
    } catch (e) { alert(t.submit_failed + e.message); }
    setSubmitting(false);
  };

  const LangSwitcher = () => (
    <div style={{display:"flex",gap:4,background:"#f2f2f2",borderRadius:18,padding:3}}>
      <button onClick={() => setLanguage("tr")} style={{padding:"10px 16px",minWidth:48,minHeight:36,background:lang==="tr"?"#000":"transparent",color:lang==="tr"?"#fff":"#666",border:"none",borderRadius:14,fontSize:11,fontWeight:700,cursor:"pointer"}}>🇹🇷 TR</button>
      <button onClick={() => setLanguage("en")} style={{padding:"10px 16px",minWidth:48,minHeight:36,background:lang==="en"?"#000":"transparent",color:lang==="en"?"#fff":"#666",border:"none",borderRadius:14,fontSize:11,fontWeight:700,cursor:"pointer"}}>🇬🇧 EN</button>
      <button onClick={() => setLanguage("ru")} style={{padding:"10px 16px",minWidth:48,minHeight:36,background:lang==="ru"?"#000":"transparent",color:lang==="ru"?"#fff":"#666",border:"none",borderRadius:14,fontSize:11,fontWeight:700,cursor:"pointer"}}>🇷🇺 RU</button>
    </div>
  );

  if (loading) {
    return (<div className="nip-customer" style={{fontFamily:cv,background:"#fff",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",color:"#888"}}>...</div>);
  }

  if (successOrderId && !browsing) {
    const bg = orderStage === "ready" ? "#FFF8E1" : orderStage === "served" ? "#E8F5E9" : "#fff";
    const isReady = orderStage === "ready";
    const isServed = orderStage === "served";
    return (
      <div className="nip-customer" style={{fontFamily:cv,background:bg,minHeight:"100vh",padding:"40px 20px",color:"#000",transition:"background 0.4s"}}>
        <div style={{maxWidth:460,margin:"0 auto",textAlign:"center"}}>
          {isReady ? (
            <>
              <div style={{fontSize:80,marginBottom:14}}>🔔</div>
              <div style={{fontSize:30,fontWeight:900,marginBottom:8,letterSpacing:"-0.5px"}}>{t.order_ready_big}</div>
              <div style={{fontSize:15,color:"#555",marginBottom:24,lineHeight:1.5}}>
                {table ? (table.name + " · ") : ""}{t.pick_from_cashier}
              </div>
              <button onClick={() => { playDing(); vibrate(); }} style={{padding:"12px 24px",background:"#C8973E",color:"#000",border:"none",borderRadius:12,fontSize:13,fontWeight:800,cursor:"pointer"}}>{t.play_again}</button>
            </>
          ) : isServed ? (
            <>
              <div style={{fontSize:72,marginBottom:14}}>🙏</div>
              <div style={{fontSize:26,fontWeight:800,marginBottom:8}}>{t.enjoy}</div>
              <div style={{fontSize:14,color:"#555",marginBottom:24,lineHeight:1.5}}>{t.thanks}</div>
              <button onClick={() => { setSuccessOrderId(null); setOrderStage("pending"); load(); }} style={{padding:"14px 28px",background:"#C8973E",color:"#000",border:"none",borderRadius:12,fontSize:14,fontWeight:800,cursor:"pointer"}}>{t.new_order}</button>
            </>
          ) : (
            <>
              <div style={{fontSize:60,marginBottom:14}}>✅</div>
              <div style={{fontSize:24,fontWeight:800,marginBottom:8}}>{t.order_received}</div>
              <div style={{fontSize:14,color:"#555",marginBottom:18,lineHeight:1.5}}>
                {table ? (table.name + L(": m", ": s", ": о")) : L("M", "S", "О")}{t.order_kitchen_msg}
              </div>
              <div style={{display:"inline-flex",alignItems:"center",gap:8,padding:"10px 16px",background:"#f6f6f6",borderRadius:24,marginBottom:24,fontSize:13,color:"#555"}}>
                <span style={{width:10,height:10,borderRadius:"50%",background:"#C8973E",display:"inline-block"}}></span>
                {t.preparing}
              </div>
              <div style={{marginBottom:10}}>
                {notifState === "granted" ? (
                  <div style={{padding:"10px 14px",background:"#E8F5E9",border:"1px solid #B2DFDB",borderRadius:10,fontSize:12,color:"#2e7d32"}}>{t.notif_granted}</div>
                ) : notifState === "denied" ? (
                  <div style={{padding:"10px 14px",background:"#FFF3E0",border:"1px solid #FFCC80",borderRadius:10,fontSize:11,color:"#E65100",lineHeight:1.5}}>{t.notif_denied}</div>
                ) : (
                  <button onClick={askNotifPermissionSync} style={{padding:"10px 18px",background:"#C8973E",color:"#000",border:"none",borderRadius:10,fontSize:12,fontWeight:800,cursor:"pointer"}}>{t.notif_ask}</button>
                )}
              </div>
              <button onClick={() => setBrowsing(true)} style={{padding:"12px 24px",background:"#000",color:"#fff",border:"none",borderRadius:12,fontSize:13,fontWeight:700,cursor:"pointer"}}>
                {L("Beklerken göz at →","Browse while you wait →","Полистайте, пока ждёте →")}
              </button>
              <div style={{fontSize:11,color:"#999",marginTop:10,lineHeight:1.5}}>
                {L("Etkinlikler, sürüşler, shop & blog — hazır olunca zili çalarız 🔔","Events, rides, shop & blog — we'll ring when it's ready 🔔","События, заезды, шоп и блог — позвоним, когда будет готово 🔔")}
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  const susBarActive = browsing && successOrderId && orderStage === "pending";

  return (
    <div className="nip-customer nip-customer-shell" style={{fontFamily:cv,background:"#fff",minHeight:"100vh",color:"#000",paddingBottom:cart.length>0?156:96}}>
      <div style={{padding:"20px 16px 10px",borderBottom:"1px solid #eee",position:"sticky",top:0,background:"#fff",zIndex:20}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div>
            <div style={{fontSize:24,fontWeight:400,letterSpacing:"0.005em",fontFamily:"'Coolvetica Heavy','Coolvetica Condensed','Barlow Condensed',sans-serif",textTransform:"uppercase"}}>Not in Paris</div>
            <div style={{fontSize:10,color:"#888",letterSpacing:"2px",marginTop:2}}>
              {custTab !== "menu" ? (CUST_TABS.find(x=>x.key===custTab)?.[["en","ru"].includes(lang)?lang:"tr"] || "").toUpperCase() : (table ? table.name?.toUpperCase() : t.menu)}
              {partyMode && custTab === "menu" && <span style={{marginLeft:6,color:"#C8973E",fontWeight:700}}>· {t.partyMode} 🎉</span>}
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            {hh && custTab === "menu" && <div style={{background:"#C8973E",color:"#000",padding:"4px 10px",borderRadius:10,fontSize:10,fontWeight:800,letterSpacing:"0.5px"}}>{t.happy_hour} -%{hh.discount_pct}</div>}
            <LangSwitcher/>
          </div>
        </div>
        {custTab === "menu" && (
        <div style={{display:"flex",gap:6,overflowX:"auto",marginTop:12,paddingBottom:4}}>
          {visibleCategories.map(c => (
            <button key={c.id} onClick={() => setSelectedCat(c.id)} style={{flexShrink:0,padding:"8px 14px",border:"none",borderRadius:16,fontSize:12,fontWeight:700,background:selectedCat===c.id?"#000":"#f2f2f2",color:selectedCat===c.id?"#fff":"#333",cursor:"pointer",whiteSpace:"nowrap",letterSpacing:"0.3px"}}>
              {c.icon && <span style={{marginRight:4}}>{c.icon}</span>}{cName(c)}
            </button>
          ))}
        </div>
        )}
      </div>

      {custTab === "menu" && (
      <div style={{padding:"8px 16px",background:"#faf6ee",borderBottom:"1px solid #f0e8d8",display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
        {customer ? (
          <span style={{fontSize:12,color:"#7a5c1e",fontWeight:600}}>
            ⭐ {L("Merhaba","Hi","Привет")} {customer.name?.split(" ")[0] || ""}
            {Object.keys(memberDiscounts).length > 0 && <span> — {L("üye fiyatların aktif","member prices active","цены для участников активны")}</span>}
          </span>
        ) : (
          <>
            <span style={{fontSize:12,color:"#7a5c1e"}}>⭐ {L("Üye misin?","Member?","Участник клуба?")}</span>
            <button onClick={signInWithGoogle} style={{padding:"6px 12px",background:"#000",color:"#fff",border:"none",borderRadius:10,fontSize:11,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>
              {L("Google ile giriş yap","Sign in with Google","Войти через Google")}
            </button>
          </>
        )}
      </div>
      )}

      {custTab !== "menu" && (
        <div style={{padding:"14px 16px"}}>
          {custTab === "events" && (
            <a href={RESERVATION_URL} target="_blank" rel="noreferrer" style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"16px 18px",background:"#000",color:"#fff",borderRadius:14,textDecoration:"none",marginBottom:14}}>
              <span style={{fontSize:14,fontWeight:800}}>🎟 {L("Rezervasyon yap","Make a reservation","Забронировать")}</span>
              <span style={{fontSize:16}}>→</span>
            </a>
          )}
          {custTab === "events" && (
            <>
              {feeds.events === undefined && <div style={{textAlign:"center",color:"#888",padding:30,fontSize:13}}>...</div>}
              {feeds.events?.length === 0 && (
                <div style={{textAlign:"center",color:"#888",padding:30,fontSize:13,lineHeight:1.6}}>
                  {L("Yaklaşan etkinlikler yakında burada 🎉","Upcoming events will appear here soon 🎉","Скоро здесь появятся события 🎉")}
                </div>
              )}
              {(feeds.events || []).map((ev, i) => (
                <a key={i} href={RESERVATION_URL} target="_blank" rel="noreferrer" style={{display:"flex",alignItems:"center",gap:10,padding:"14px 2px",borderBottom:"1px solid #f0f0f0",textDecoration:"none",color:"#000"}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:15,fontWeight:800,lineHeight:1.3}}>
                      {ev.name}
                      {ev.subtitle && <span style={{fontSize:11,fontWeight:600,color:"#888",marginLeft:6}}>{ev.subtitle}</span>}
                    </div>
                    <div style={{fontSize:12,color:"#666",marginTop:3}}>
                      {fmtDay(ev.date)}{ev.time ? " · " + ev.time : ""}{ev.genre ? " · " + ev.genre : ""}
                    </div>
                  </div>
                  {ev.access_type && ev.access_type !== "open" && (
                    <span style={{fontSize:9,padding:"3px 7px",background:"#000",color:"#fff",borderRadius:6,fontWeight:800,letterSpacing:"0.5px",flexShrink:0}}>{L("ÜYE","MEMBERS","КЛУБ")}</span>
                  )}
                  <span style={{fontSize:12,fontWeight:700,flexShrink:0}}>{L("Rezerve","Reserve","Бронь")} →</span>
                </a>
              ))}
              <a href={YOUTUBE_URL} target="_blank" rel="noreferrer" style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 16px",background:"#fafafa",border:"1px solid #eee",borderRadius:14,textDecoration:"none",color:"#000",marginTop:14}}>
                <span style={{fontSize:13,fontWeight:800}}>▶️ Dance Till They Come — YouTube</span>
                <span>↗</span>
              </a>
            </>
          )}
          {custTab === "rides" && (
            <>
              {feeds.rides === undefined && <div style={{textAlign:"center",color:"#888",padding:30,fontSize:13}}>...</div>}
              {feeds.rides?.length === 0 && (
                <div style={{textAlign:"center",color:"#888",padding:30,fontSize:13,lineHeight:1.6}}>
                  {L("Planlı sürüşler yakında burada 🚴","Planned rides will appear here soon 🚴","Скоро здесь появятся заезды 🚴")}
                </div>
              )}
              {(feeds.rides || []).map((r, i) => (
                <a key={i} href={RIDES_URL} target="_blank" rel="noreferrer" style={{display:"flex",alignItems:"center",gap:10,padding:"14px 2px",borderBottom:"1px solid #f0f0f0",textDecoration:"none",color:"#000"}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:15,fontWeight:800,lineHeight:1.3}}>{r.title}</div>
                    <div style={{fontSize:12,color:"#666",marginTop:3}}>
                      {fmtDay(r.ride_date)}{r.ride_time ? " · " + r.ride_time : ""}
                    </div>
                    <div style={{fontSize:11,color:"#888",marginTop:2}}>
                      {[r.pace, r.distance_km ? Math.round(r.distance_km) + " km" : null, r.elevation_m ? Math.round(r.elevation_m) + " m↑" : null, r.meet_point].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  <span style={{fontSize:12,fontWeight:700,flexShrink:0}}>{L("Katıl","Join","Поехали")} →</span>
                </a>
              ))}
              <a href={STRAVA_URL} target="_blank" rel="noreferrer" style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 16px",background:"#fafafa",border:"1px solid #eee",borderRadius:14,textDecoration:"none",color:"#000",marginTop:14}}>
                <span style={{fontSize:13,fontWeight:800}}>🟠 NIP Cycling Club — Strava</span>
                <span>↗</span>
              </a>
            </>
          )}
          {(custTab === "shop" || custTab === "blog") && (
            <>
              {postFeeds[custTab] === undefined && <div style={{textAlign:"center",color:"#888",padding:30,fontSize:13}}>...</div>}
              {postFeeds[custTab]?.length === 0 && (
                <div style={{textAlign:"center",color:"#888",padding:30,fontSize:13}}>
                  {L("Yakında ✨","Coming soon ✨","Скоро ✨")}
                </div>
              )}
              {(postFeeds[custTab] || []).map(p => (
                <div key={p.id} style={{background:"#fafafa",border:"1px solid #eee",borderRadius:14,overflow:"hidden",marginBottom:14}}>
                  {(p.images || []).length > 0 && (
                    <div style={{display:"flex",gap:6,overflowX:"auto",padding:(p.images.length>1?"10px 10px 0":"0")}}>
                      {p.images.map((u, i) => (
                        <img key={i} src={u} alt="" style={p.images.length > 1
                          ? {width:230,height:230,borderRadius:10,objectFit:"cover",flexShrink:0}
                          : {width:"100%",height:230,objectFit:"cover",display:"block"}}/>
                      ))}
                    </div>
                  )}
                  <div style={{padding:"12px 14px"}}>
                    <div style={{fontSize:16,fontWeight:800}}>{postTitle(p)}</div>
                    {postBody(p) && <div style={{fontSize:13,color:"#444",marginTop:6,lineHeight:1.6,whiteSpace:"pre-wrap"}}>{postBody(p)}</div>}
                    {custTab === "shop" ? (
                      <div style={{display:"inline-block",marginTop:10,padding:"6px 12px",background:"#000",color:"#FFD700",borderRadius:10,fontSize:11,fontWeight:800}}>
                        💳 {L("Kasadan alabilirsin","Available at the counter","Можно купить на кассе")}
                      </div>
                    ) : (
                      <div style={{fontSize:10,color:"#999",marginTop:8}}>{new Date(p.created_at).toLocaleDateString(dateLocale,{day:"numeric",month:"long"})}</div>
                    )}
                  </div>
                </div>
              ))}
              {custTab === "shop" && (
                <a href={INSTAGRAM_URL} target="_blank" rel="noreferrer" style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 16px",background:"#fafafa",border:"1px solid #eee",borderRadius:14,textDecoration:"none",color:"#000",marginTop:4}}>
                  <span style={{fontSize:13,fontWeight:800}}>📷 Instagram — @notinparis.me</span>
                  <span>↗</span>
                </a>
              )}
              {custTab === "blog" && (
                <a href={GOOGLE_RATE_URL} target="_blank" rel="noreferrer" style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 16px",background:"#000",color:"#fff",borderRadius:14,textDecoration:"none",marginTop:4}}>
                  <span style={{fontSize:13,fontWeight:800}}>⭐ {L("Bizi Google'da değerlendir","Rate us on Google","Оцените нас в Google")}</span>
                  <span>↗</span>
                </a>
              )}
            </>
          )}
        </div>
      )}

      {custTab === "menu" && (
      <div style={{padding:"14px 16px"}}>
        {visibleProducts.length === 0 && <div style={{textAlign:"center",color:"#888",padding:40,fontSize:13}}>{t.category_empty}</div>}
        {visibleProducts.map(p => {
          const fp = calcPrice(p);
          const dis = fp < Number(p.price);
          const fadedInfo = fadedProdInfo[p.id];
          const isFaded = !!fadedInfo;
          const soldOut = p.sold_out_today;
          const cartIdx = cart.findIndex(c => c.product.id === p.id && !c.options);
          const inCart = cartIdx >= 0 ? cart[cartIdx].quantity : 0;
          return (
            <div key={p.id + "-" + p.category_id} style={{display:"flex",gap:12,padding:"14px 0",borderBottom:"1px solid #f0f0f0",opacity:soldOut||isFaded?0.45:1}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:15,fontWeight:700,color:"#000",lineHeight:1.3}}>{pName(p)}</div>
                {pDesc(p) && <div style={{fontSize:12,color:"#666",marginTop:3,lineHeight:1.4}}>{pDesc(p)}</div>}
                {isFaded && fadedInfo && <div style={{fontSize:11,color:"#C8973E",marginTop:3,fontWeight:600}}>{fadedInfo.end.slice(0,5)} - {fadedInfo.start.slice(0,5)} arası mevcut</div>}
                {p.show_prep_time && p.prep_time_minutes && <div style={{fontSize:12,color:"#888",marginTop:4,display:"flex",alignItems:"center",gap:4}}>⏱ <span>~{p.prep_time_minutes} dk</span></div>}
                {soldOut && <div style={{fontSize:11,color:"#c44",marginTop:4,fontWeight:600}}>{p.unavailable_reason || t.sold_out}</div>}
                {p.has_options && !soldOut && <div style={{fontSize:10,color:"#C8973E",marginTop:3,fontWeight:700,letterSpacing:"0.5px"}}>{t.optional}</div>}
                <div style={{display:"flex",alignItems:"center",gap:10,marginTop:8}}>
                  {dis && <span style={{fontSize:12,color:"#999",textDecoration:"line-through"}}>₺{p.price}</span>}
                  <span style={{fontSize:15,fontWeight:800,color:dis?"#C8973E":"#000"}}>₺{fp}</span>
                  {Number(memberDiscounts[p.id]||0) > 0 && <span style={{fontSize:9,padding:"2px 6px",background:"#000",color:"#FFD700",borderRadius:6,fontWeight:800,letterSpacing:"0.5px"}}>ÜYE</span>}
                </div>
              </div>
              {!soldOut && (
                <div style={{display:"flex",alignItems:"center",flexShrink:0}}>
                  {inCart > 0 && !p.has_options ? (
                    <div style={{display:"flex",alignItems:"center",gap:8,background:"#000",borderRadius:24,padding:"4px 6px"}}>
                      <button onClick={() => updateQty(cartIdx, -1)} style={{width:28,height:28,background:"transparent",color:"#fff",border:"none",borderRadius:"50%",fontSize:18,cursor:"pointer",fontWeight:700}}>−</button>
                      <div style={{minWidth:18,textAlign:"center",color:"#fff",fontSize:14,fontWeight:800}}>{inCart}</div>
                      <button onClick={() => updateQty(cartIdx, +1)} style={{width:28,height:28,background:"transparent",color:"#fff",border:"none",borderRadius:"50%",fontSize:18,cursor:"pointer",fontWeight:700}}>+</button>
                    </div>
                  ) : (
                    <button onClick={() => onProductTap(p)} style={{width:36,height:36,background:"#000",color:"#fff",border:"none",borderRadius:"50%",fontSize:22,cursor:"pointer",fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",padding:0,lineHeight:1,fontSize:24,fontWeight:300}}>+</button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      )}

      {cart.length > 0 && (
        <div style={{position:"fixed",bottom:susBarActive?128:84,left:14,right:14,zIndex:40}}>
          <button onClick={() => setCheckoutOpen(true)} style={{width:"100%",padding:"16px 20px",background:"#000",color:"#fff",border:"none",borderRadius:14,fontSize:15,fontWeight:800,cursor:"pointer",boxShadow:"0 6px 20px rgba(0,0,0,0.35)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span>{t.cart} ({cartCount})</span>
            <span>₺{cartTotal} · {t.continue} →</span>
          </button>
        </div>
      )}

      {susBarActive && (
        <button onClick={() => setBrowsing(false)} style={{position:"fixed",bottom:76,left:14,right:14,zIndex:45,display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 16px",background:"#C8973E",color:"#000",border:"none",borderRadius:12,fontSize:13,fontWeight:800,cursor:"pointer",boxShadow:"0 4px 16px rgba(0,0,0,0.25)"}}>
          <span>🍳 {L("Siparişin hazırlanıyor","Your order is being prepared","Ваш заказ готовится")}</span>
          <span>→</span>
        </button>
      )}

      <nav style={{position:"fixed",bottom:0,left:0,right:0,background:"#fff",borderTop:"1px solid #eee",display:"flex",justifyContent:"space-around",padding:"8px 0 16px",zIndex:50,boxShadow:"0 -2px 12px rgba(0,0,0,0.06)"}}>
        {CUST_TABS.map(tab => (
          <button key={tab.key} onClick={() => setCustTab(tab.key)} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2,background:"none",border:"none",cursor:"pointer",color:custTab===tab.key?"#000":"#999",padding:"4px 8px",minWidth:52}}>
            <span style={{fontSize:20,filter:custTab===tab.key?"none":"grayscale(1)"}}>{tab.icon}</span>
            <span style={{fontSize:9,fontWeight:custTab===tab.key?800:600,letterSpacing:"0.3px"}}>{tab[["en","ru"].includes(lang)?lang:"tr"]}</span>
          </button>
        ))}
      </nav>

      {optModal && (
        <div onClick={() => setOptModal(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:100}}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:"18px 18px 0 0",padding:20,width:"100%",maxWidth:500,maxHeight:"85vh",overflowY:"auto"}}>
            <div style={{fontSize:20,fontWeight:800,marginBottom:4}}>{pName(optModal)}</div>
            <div style={{fontSize:13,color:"#666",marginBottom:18}}>₺{calcPrice(optModal, optSelected)}</div>
            {(optModal.options_config?.groups || []).map(group => (
              <div key={group.name} style={{marginBottom:14}}>
                <div style={{fontSize:11,color:"#333",letterSpacing:"1px",fontWeight:700,marginBottom:6}}>
                  {group.name?.toUpperCase()}{group.required && <span style={{color:"#c44",marginLeft:4}}>*</span>}
                </div>
                <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                  {(group.options || []).map(opt => (
                    <button key={opt} onClick={()=>setOptSelected(group.multi?{...optSelected,[group.name]:((optSelected[group.name]||[]).includes(opt)?(optSelected[group.name]||[]).filter(x=>x!==opt):[...(optSelected[group.name]||[]),opt])}:{...optSelected,[group.name]:opt})} style={{padding:"10px 14px",background:(group.multi?(optSelected[group.name]||[]).includes(opt):optSelected[group.name]===opt)?"#000":"#f2f2f2",color:(group.multi?(optSelected[group.name]||[]).includes(opt):optSelected[group.name]===opt)?"#fff":"#333",border:"none",borderRadius:10,fontSize:13,fontWeight:700,cursor:"pointer"}}>{opt}</button>
                  ))}
                </div>
              </div>
            ))}
            <div style={{marginBottom:16}}>
              <div style={{fontSize:11,color:"#333",letterSpacing:"1px",fontWeight:700,marginBottom:6}}>{t.optional_label}</div>
              <input value={optNote} onChange={e=>setOptNote(e.target.value)} placeholder={t.note_optional} style={{width:"100%",padding:"12px 14px",background:"#f7f7f7",border:"1px solid #eee",borderRadius:10,fontSize:14,outline:"none",fontFamily:"inherit"}}/>
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={() => setOptModal(null)} style={{flex:1,padding:"14px",background:"#fff",color:"#666",border:"1px solid #ddd",borderRadius:12,fontSize:14,fontWeight:700,cursor:"pointer"}}>{t.cancel}</button>
              <button onClick={confirmOptions} style={{flex:2,padding:"14px",background:"#000",color:"#fff",border:"none",borderRadius:12,fontSize:14,fontWeight:800,cursor:"pointer"}}>{t.add_to_cart}</button>
            </div>
          </div>
        </div>
      )}

      {checkoutOpen && (
        <div onClick={() => setCheckoutOpen(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:110}}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:"18px 18px 0 0",padding:20,width:"100%",maxWidth:520,maxHeight:"92vh",overflowY:"auto"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <div style={{fontSize:20,fontWeight:800}}>{t.my_cart}</div>
              <button onClick={() => setCheckoutOpen(false)} style={{background:"none",border:"none",fontSize:24,cursor:"pointer",padding:0,color:"#666"}}>×</button>
            </div>
            {cart.map((c, idx) => (
              <div key={idx} style={{display:"flex",alignItems:"center",gap:10,padding:"12px 0",borderBottom:"1px solid #f0f0f0"}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:14,fontWeight:700}}>{pName(c.product)}</div>
                  {c.options && <div style={{fontSize:11,color:"#C8973E",marginTop:2,fontWeight:600}}>{Object.values(c.options).flat().join(" · ")}</div>}
                  {c.note && <div style={{fontSize:11,color:"#666",fontStyle:"italic",marginTop:2}}>{c.note}</div>}
                  <div style={{fontSize:12,color:"#555",marginTop:3}}>₺{calcPrice(c.product, c.options)} × {c.quantity} = ₺{calcPrice(c.product, c.options) * c.quantity}</div>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:6,background:"#f2f2f2",borderRadius:20,padding:"3px 5px"}}>
                  <button onClick={() => updateQty(idx, -1)} style={{width:26,height:26,background:"transparent",color:"#000",border:"none",borderRadius:"50%",fontSize:16,cursor:"pointer",fontWeight:700}}>−</button>
                  <div style={{minWidth:18,textAlign:"center",fontSize:13,fontWeight:800}}>{c.quantity}</div>
                  <button onClick={() => updateQty(idx, +1)} style={{width:26,height:26,background:"transparent",color:"#000",border:"none",borderRadius:"50%",fontSize:16,cursor:"pointer",fontWeight:700}}>+</button>
                </div>
              </div>
            ))}
            {!table && (
              <div style={{marginTop:14}}>
                <div style={{fontSize:11,color:"#333",letterSpacing:"1px",fontWeight:700,marginBottom:6}}>{t.your_name}</div>
                <input value={customerName} onChange={e=>setCustomerName(e.target.value)} placeholder={t.name_placeholder} style={{width:"100%",padding:"12px 14px",background:"#f7f7f7",border:"1px solid #eee",borderRadius:10,fontSize:14,outline:"none",fontFamily:"inherit"}}/>
              </div>
            )}
            <div style={{marginTop:14}}>
              <div style={{fontSize:11,color:"#333",letterSpacing:"1px",fontWeight:700,marginBottom:6}}>{t.order_note_label}</div>
              <textarea value={orderNote} onChange={e=>setOrderNote(e.target.value)} placeholder={t.order_note_placeholder} rows={2} style={{width:"100%",padding:"12px 14px",background:"#f7f7f7",border:"1px solid #eee",borderRadius:10,fontSize:14,outline:"none",fontFamily:"inherit",resize:"vertical"}}/>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:16,padding:"14px 0",borderTop:"2px solid #000"}}>
              <div style={{fontSize:13,color:"#333",letterSpacing:"1px",fontWeight:700}}>{t.total}</div>
              <div style={{fontSize:22,fontWeight:800}}>₺{cartTotal}</div>
            </div>
            <button onClick={submitOrder} disabled={submitting} style={{width:"100%",marginTop:14,padding:"16px",background:"#C8973E",color:"#000",border:"none",borderRadius:14,fontSize:15,fontWeight:800,cursor:"pointer",opacity:submitting?0.6:1}}>
              {submitting ? t.submitting : t.submit_order}
            </button>
            <div style={{textAlign:"center",fontSize:11,color:"#888",marginTop:10}}>
              {table ? t.waiter_will_bring : t.notif_promise}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
