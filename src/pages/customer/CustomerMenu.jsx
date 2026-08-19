import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../../lib/supabase.js";
import { useAuth } from "../../contexts/AuthContext.jsx";
import { happyHourPrices } from "../../lib/happyHour.js";
import { optionMod } from "../../lib/productOptions.js";
import { PHONE_CODES, toE164 } from "../../lib/phoneCodes.js";

const cv = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";

// Alt sekmeler — QR menu ayni zamanda vitrin: etkinlik/rezervasyon, surusler, shop, blog
const CUST_TABS = [
  { key: "menu",   icon: "🍽", tr: "Menü",     en: "Menu",   ru: "Меню" },
  { key: "events", icon: "🎟", tr: "Etkinlik", en: "Events", ru: "События" },
  { key: "rides",  icon: "🚴", tr: "Sürüş",    en: "Rides",  ru: "Заезды" },
  { key: "vote",   icon: "📊", tr: "Oyla",     en: "Vote",   ru: "Голос" },
  { key: "shop",   icon: "👕", tr: "Shop",     en: "Shop",   ru: "Шоп" },
  { key: "blog",   icon: "📰", tr: "Blog",     en: "Blog",   ru: "Блог" },
];

// Misafir de oy verebilsin: kimlik yerine telefonda saklanan anonim anahtar
function getVoterKey() {
  try {
    let k = localStorage.getItem("nip_voter_key");
    if (!k) {
      k = (crypto.randomUUID && crypto.randomUUID()) ||
        ("v" + Date.now() + Math.random().toString(36).slice(2));
      localStorage.setItem("nip_voter_key", k);
    }
    return k;
  } catch (e) { return "anon-" + Math.random().toString(36).slice(2); }
}
// Etkinlik + surusler dogrudan rezervasyon sisteminin (NIP RESERVE) public verisinden okunur
const RESERVE_URL = "https://diqparjrtvvfxvwxebov.supabase.co";
const RESERVE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRpcXBhcmpydHZ2Znh2d3hlYm92Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5Mzc3OTMsImV4cCI6MjA4OTUxMzc5M30.pNI2yU6LDG8583HBPq-5puxkpEVEAYwhGp9ibJ1WBsI";
const RESERVATION_URL = "https://reservation.notinparis.me";
const RIDES_URL = "https://notinparis.me/pages/rides";
const YOUTUBE_URL = "https://www.youtube.com/@notinparis";
const STRAVA_URL = "https://www.strava.com/clubs/notinparis";
const STRAVA_CLUB_ID = "1100024";
// Surus Strava etkinligiyse "Katil" dogrudan oraya gitsin — kayit orada yapiliyor
const rideLink = (r) =>
  r?.strava_event_id ? "https://www.strava.com/clubs/" + STRAVA_CLUB_ID + "/group_events/" + r.strava_event_id
  : (r?.route_url && /strava\.com/.test(r.route_url)) ? r.route_url
  : RIDES_URL;
const FIND_BIKE_URL = "https://notinparis.me/pages/find-a-bike";
const INSTAGRAM_URL = "https://instagram.com/notinparis.me";
const TIERS = [
  // Kazanc: 20 TL = 1 puan (%5); 1 puan = 1 TL olarak kasada harcanir (cuzdan).
  // Seviye PUANDAN DEGIL toplam harcamadan gelir — puanini harcayan musteri
  // seviye kaybetmesin. DB'deki fn_award_member_points ayni kurali uygular.
  { key: "yeniyuz",   min: 0,     icon: "☕", tr: "Yeni Yüz",  en: "New Face", ru: "Новичок" },
  { key: "mahalleli", min: 10000, icon: "🚲", tr: "Mahalleli", en: "Local",    ru: "Свой в районе" },
  { key: "mudavim",   min: 30000, icon: "⭐", tr: "Müdavim",   en: "Regular",  ru: "Завсегдатай" },
  { key: "aileden",   min: 80000, icon: "🗼", tr: "Aileden",   en: "Family",   ru: "Родной" },
];

const GOOGLE_RATE_URL = "https://share.google/AA07eYRVqpAoNFL8P";

// Web push (kilitli telefonda "siparisin hazir" bildirimi) — public VAPID anahtari
const VAPID_PUBLIC_KEY = "BM2CUicnXTjYU2PNZXrDmBN6qu_FkENcsLiiiYW4xzJh9mm8v27eUEPPAnybqN1uJoO7i2LAbcgl7oAjQomvcVM";
const urlB64ToUint8 = (b64) => {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const base = (b64 + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
};

const T = {
  tr: {
    menu: "MENÜ",
    partyMode: "PARTİ MODU",
    category_empty: "Bu kategoride ürün yok",
    all_group: "Tümü",
    pay_with_points: "Puanlarımla öde",
    points_applied: "Puan karşılığı",
    to_pay_at_register: "Kasada ödenecek",
    points_note: "Kesin tutar ödeme anında bakiyene göre hesaplanır.",
    pf_title: "Birkaç bilgi kaldı",
    pf_sub: "Siparişin hazır olduğunda sana ulaşabilmemiz için adını ve telefonunu alalım.",
    pf_first: "Adın", pf_last: "Soyadın", pf_phone: "Telefon numaran", pf_country: "Ülke kodu",
    pf_save: "Kaydet ve devam et", pf_saving: "Kaydediliyor...",
    pf_signout: "Vazgeç, çıkış yap",
    pf_need_first: "Adını yazar mısın?",
    pf_need_last: "Soyadını yazar mısın?",
    pf_need_phone: "Telefon numaranı kontrol eder misin?",
    pf_error: "Kaydedilemedi:",
    order_hours: "sipariş saatleri",
    order_between: "arası sipariş verilebilir",
    closed_now: "Şu an bu saatler dışındasın",
    multi_select: "birden fazla seçebilirsin",
    other_group: "Diğer",
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
    shared_name: "ADIN (ortak masa — sipariş adınla hazırlanır)",
    name_placeholder: "Örn: Efekan",
    order_note_label: "SİPARİŞ NOTU (mutfak görecek)",
    order_note_placeholder: "Örn: az pişmiş, baharatsız...",
    total: "TOPLAM",
    submit_order: "Siparişi Gönder",
    submitting: "Gönderiliyor...",
    waiter_will_bring: "Garson siparişini masana getirecek",
    notif_promise: "Sipariş hazır olunca bildirim göndereceğiz",
    please_choose: "Lütfen",
    takeaway: "Götür",
    takeaway_all: "Hepsini götür",
    takeaway_hint: "Paket bardakta hazırlanır",
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
    all_group: "All",
    pay_with_points: "Pay with my points",
    points_applied: "Points applied",
    to_pay_at_register: "To pay at the counter",
    points_note: "The final amount is settled against your balance at payment.",
    pf_title: "One last thing",
    pf_sub: "We need your name and phone so we can reach you when your order is ready.",
    pf_first: "First name", pf_last: "Last name", pf_phone: "Phone number", pf_country: "Country code",
    pf_save: "Save and continue", pf_saving: "Saving...",
    pf_signout: "Never mind, sign out",
    pf_need_first: "Please enter your first name.",
    pf_need_last: "Please enter your last name.",
    pf_need_phone: "Please check your phone number.",
    pf_error: "Could not save:",
    order_hours: "ordering hours",
    order_between: "for ordering",
    closed_now: "Outside ordering hours right now",
    multi_select: "choose more than one",
    other_group: "Other",
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
    shared_name: "YOUR NAME (shared table — order is prepared under your name)",
    name_placeholder: "e.g. John",
    order_note_label: "ORDER NOTE (kitchen will see)",
    order_note_placeholder: "e.g. medium-rare, no spice...",
    total: "TOTAL",
    submit_order: "Place Order",
    submitting: "Sending...",
    waiter_will_bring: "Server will bring it to your table",
    notif_promise: "We'll notify you when your order is ready",
    please_choose: "Please choose",
    takeaway: "To go",
    takeaway_all: "All to go",
    takeaway_hint: "Served in a takeaway cup",
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
    all_group: "Все",
    pay_with_points: "Оплатить баллами",
    points_applied: "Баллами",
    to_pay_at_register: "К оплате на кассе",
    points_note: "Точная сумма рассчитывается по балансу в момент оплаты.",
    pf_title: "Осталось немного",
    pf_sub: "Укажите имя и телефон, чтобы мы могли сообщить, когда заказ будет готов.",
    pf_first: "Имя", pf_last: "Фамилия", pf_phone: "Номер телефона", pf_country: "Код страны",
    pf_save: "Сохранить и продолжить", pf_saving: "Сохранение...",
    pf_signout: "Отмена, выйти",
    pf_need_first: "Введите имя.",
    pf_need_last: "Введите фамилию.",
    pf_need_phone: "Проверьте номер телефона.",
    pf_error: "Не удалось сохранить:",
    order_hours: "часы заказа",
    order_between: "приём заказов",
    closed_now: "Сейчас вне часов заказа",
    multi_select: "можно выбрать несколько",
    other_group: "Другое",
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
    shared_name: "ВАШЕ ИМЯ (общий стол — заказ готовится на ваше имя)",
    name_placeholder: "напр.: Иван",
    order_note_label: "ПРИМЕЧАНИЕ К ЗАКАЗУ (увидит кухня)",
    order_note_placeholder: "напр.: средняя прожарка, без специй...",
    total: "ИТОГО",
    submit_order: "Отправить заказ",
    submitting: "Отправляем...",
    waiter_will_bring: "Официант принесёт заказ к вашему столу",
    notif_promise: "Мы сообщим, когда заказ будет готов",
    please_choose: "Пожалуйста, выберите",
    takeaway: "С собой",
    takeaway_all: "Всё с собой",
    takeaway_hint: "Подаётся в стакане с собой",
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

// Secenek gruplari/degerleri DB'de tek (kanonik) dilde saklanir; mutfak ve kasa
// hep ayni degeri gorur. Burasi YALNIZ musteri ekraninda gosterim cevirisidir.
// Sozlukte olmayan degerler (Jägermeister, Macallan...) oldugu gibi gecer.
// Shop alt gruplari (marka kutusu icinde "Tisortler / Sapkalar / Takilar").
// Grup adi urunde Turkce saklanir; burada olmayan grup Turkcesiyle gorunur.
const GROUP_I18N = {
  "Tişörtler":    { en: "T-Shirts",    ru: "Футболки" },
  "Şapkalar":     { en: "Caps",        ru: "Кепки" },
  "Takılar":      { en: "Jewellery",   ru: "Украшения" },
  "Aksesuar":     { en: "Accessories", ru: "Аксессуары" },
  "Giyim":        { en: "Clothing",    ru: "Одежда" },
  "Formalar":     { en: "Jerseys",     ru: "Джерси" },
  "Yelekler":     { en: "Gilets",      ru: "Жилеты" },
  "İçlikler":     { en: "Base Layers", ru: "Термобельё" },
  "Çanta":        { en: "Bags",        ru: "Сумки" },
  "Bardaklar":    { en: "Cups & Mugs", ru: "Стаканы и кружки" },
  "Tabaklar":     { en: "Plates",      ru: "Тарелки" },
  "Tütsü & Koku": { en: "Incense",     ru: "Благовония" },
  "Sabunlar":     { en: "Soaps",       ru: "Мыло" },
  "Bakım":        { en: "Skincare",    ru: "Уход" },
};

const OPT_I18N = {
  "Protein":            { en: "Protein",              ru: "Протеин" },
  "Soslar":             { en: "Sauces",               ru: "Соусы" },
  "İçindekiler":        { en: "Fillings",             ru: "Начинка" },
  "Döner":              { en: "Doner",                ru: "Донер" },
  "Falafel":            { ru: "Фалафель" },
  "Sarımsaklı Mayonez": { en: "Garlic Mayo",          ru: "Чесночный майонез" },
  "Mayonez":            { en: "Mayo",                 ru: "Майонез" },
  "Tatziki":            { en: "Tzatziki",             ru: "Дзадзики" },
  "Köz Biber Sosu":     { en: "Roasted Pepper Sauce", ru: "Соус из печёного перца" },
  "Cheddar":            { ru: "Чеддер" },
  "Karamelize Soğan":   { en: "Caramelised Onion",    ru: "Карамелизованный лук" },
  "Soğan":              { en: "Onion",                ru: "Лук" },
  "Kırmızı Marul":      { en: "Red Lettuce",          ru: "Красный салат" },
  "Coleslaw":           { ru: "Коулслоу" },
  "Turşu":              { en: "Pickles",              ru: "Солёные огурцы" },
  "Milk":            { tr: "Süt",             ru: "Молоко" },
  "Flavor":          { tr: "Aroma",           ru: "Сироп" },
  "Pour size":       { tr: "Ölçü",            ru: "Объём" },
  "Mixer":           { tr: "Mixer",           ru: "Миксер" },
  "Lemon":           { tr: "Limon",           ru: "Лимон" },
  "Type":            { tr: "Tür",             ru: "Вид" },
  "Side":            { tr: "Yanında",         ru: "К кофе" },
  "Style":           { tr: "Servis",          ru: "Подача" },
  "Fruit":           { tr: "Meyve",           ru: "Фрукт" },
  "Beden":           { en: "Size",            ru: "Размер" },
  "Whole milk":      { tr: "Normal süt",      ru: "Обычное молоко" },
  "Lactose-free":    { tr: "Laktozsuz",       ru: "Безлактозное" },
  "Oat":             { tr: "Yulaf",           ru: "Овсяное" },
  "Almond":          { tr: "Badem",           ru: "Миндальное" },
  "Coconut":         { tr: "Hindistan cevizi",ru: "Кокосовое" },
  "Caramel":         { tr: "Karamel",         ru: "Карамель" },
  "Hazelnut":        { tr: "Fındık",          ru: "Фундук" },
  "White Chocolate": { tr: "Beyaz çikolata",  ru: "Белый шоколад" },
  "Strawberry":      { tr: "Çilek",           ru: "Клубника" },
  "Single (4cl)":    { tr: "Tek (4cl)",       ru: "Одинарный (4 сл)" },
  "Double (8cl)":    { tr: "Duble (8cl)",     ru: "Двойной (8 сл)" },
  "Soda":            { ru: "Содовая" },
  "Tonic":           { tr: "Tonik",           ru: "Тоник" },
  "Lemon juice":     { tr: "Limon suyu",      ru: "Лимонный сок" },
  "Lemon slice":     { tr: "Limon dilimi",    ru: "Долька лимона" },
  "No lemon":        { tr: "Limonsuz",        ru: "Без лимона" },
  "Basmati bowl":    { tr: "Basmati kase",    ru: "Боул с басмати" },
  "Pita":            { tr: "Pide",            ru: "Пита" },
  "Wrap":            { tr: "Dürüm",           ru: "Ролл" },
  "Water":           { tr: "Su",              ru: "Вода" },
  "Orange":          { tr: "Portakal",        ru: "Апельсин" },
  "Pomegranate":     { tr: "Nar",             ru: "Гранат" },
  "Grapefruit":      { tr: "Greyfurt",        ru: "Грейпфрут" },
  "Tequila":         { tr: "Tekila",          ru: "Текила" },
  "Small":           { tr: "Küçük",           ru: "Маленький" },
  "Big":             { tr: "Büyük",           ru: "Большой" },
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
    // Ilk giris Ingilizce (turist agirlikli); musteri TR/RU secerse hatirlanir
    try { return localStorage.getItem("nip_lang") || "en"; } catch (e) { return "en"; }
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
  const [customerName, setCustomerName] = useState(() => {
    try { return localStorage.getItem("nip_customer_name") || ""; } catch { return ""; }
  });
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
  const { customer, signInWithGoogle, signOut, loading: authLoading, refreshCustomer } = useAuth();

  // Karsilama ekrani UYE OLMAYANA her aciliste cikar, uyeye hic cikmaz.
  // Cihazda "gordum" kaydi tutmuyoruz: ekranin isi uye olmayana ne
  // kacirdigini anlatmak, uye olunca isi bitiyor.
  // Kapatma yalniz bu acilis icin gecerli — sonraki aciliste yine gelir.
  const [welcomeDismissed, setWelcomeDismissed] = useState(false);
  const forceWelcome = searchParams.get("welcome") === "1";   // onizleme icin
  // authLoading bitmeden karar verilmez; yoksa uyenin ekraninda bir an parliyor
  const showWelcome = forceWelcome
    ? !welcomeDismissed
    : (!welcomeDismissed && !authLoading && !customer);
  const dismissWelcome = () => setWelcomeDismissed(true);

  // UYELIK TAMAMLAMA: Google girisi ad veriyor ama soyad garanti degil,
  // telefon hic gelmiyor. Siparis hazir oldugunda ulasabilmek icin ikisi de
  // zorunlu. Eksikse musteri menuye giremiyor — tek cikis yolu oturumu kapatmak.
  const nameParts = String(customer?.name || "").trim().split(/\s+/).filter(Boolean);
  const profileComplete = !!customer && nameParts.length >= 2 && !!String(customer?.phone || "").trim();
  const needsProfile = !!customer && !authLoading && !profileComplete;

  const [pf, setPf] = useState({ first: "", last: "", dial: "90", tel: "" });
  const [pfBusy, setPfBusy] = useState(false);
  const pfSeeded = useRef(false);
  useEffect(() => {
    // Google'dan gelen adi bir kez on-doldur; kullanici duzelttikten sonra ezme
    if (!needsProfile || pfSeeded.current) return;
    pfSeeded.current = true;
    setPf(f => ({ ...f, first: nameParts[0] || "", last: nameParts.slice(1).join(" ") }));
  }, [needsProfile]);

  const savePf = async () => {
    if (pfBusy) return;
    const first = pf.first.trim(), last = pf.last.trim();
    if (first.length < 2) { alert(t.pf_need_first); return; }
    if (last.length < 2)  { alert(t.pf_need_last); return; }
    const e164 = toE164(pf.dial, pf.tel);
    if (!e164) { alert(t.pf_need_phone); return; }
    setPfBusy(true);
    const patch = { name: first + " " + last, phone: e164 };
    const { error } = await supabase.from("customers").update(patch).eq("id", customer.id);
    setPfBusy(false);
    if (error) { alert(t.pf_error + " " + error.message); return; }
    refreshCustomer(patch);
  };


  // Uye profili karti (uye seridine tiklayinca acilir)
  // Rezervasyona TEK girisle gec: oturum varsa RESERVE'deki kopru fonksiyonu
  // (order-sso) tek kullanimlik giris linki uretir, oraya oturumla inilir.
  // Oturum yoksa ya da kopru duserse duz link — sayfa asla kilitlenmez.
  const resvBusy = useRef(false);
  const openReservation = async (e) => {
    if (e) e.preventDefault();
    if (resvBusy.current) return;
    resvBusy.current = true;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const tok = session?.access_token;
      if (!tok) { window.location.assign(RESERVATION_URL); return; }
      const r = await fetch(RESERVE_URL + "/functions/v1/order-sso", {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: RESERVE_KEY, Authorization: "Bearer " + RESERVE_KEY },
        body: JSON.stringify({ order_token: tok }),
      });
      const j = await r.json().catch(() => ({}));
      window.location.assign(j?.url || RESERVATION_URL);
    } catch (err) {
      window.location.assign(RESERVATION_URL);
    } finally { resvBusy.current = false; }
  };

  // Cuzdan: sepette "puanla ode" istegi. Miktara sunucu karar verir (bakiye
  // odeme aninda degisebilir); buradaki rakam yalnizca onizlemedir.
  const [usePoints, setUsePoints] = useState(false);
  const walletBalance = Number(customer?.points || 0);

  const [profileOpen, setProfileOpen] = useState(false);
  const [profileStats, setProfileStats] = useState(null);
  const openProfile = async () => {
    if (!customer) return;
    setProfileOpen(true); setProfileStats(null);
    try {
      const [{ data: cust }, { data: ords }, { data: openOrds }] = await Promise.all([
        supabase.from("customers").select("name, email, avatar_url, points, outstanding_balance, created_at").eq("id", customer.id).maybeSingle(),
        supabase.from("orders").select("id, total, created_at").eq("customer_id", customer.id).in("status", ["paid", "completed", "served", "closed", "debt"]).order("created_at", { ascending: false }).limit(200),
        // Acik hesap: kapatilmamis siparisler. Uye bunu gorsun ki kasada
        // "benim siparisim su" diyebilsin — kapanmayan siparis puan da kazandirmaz.
        supabase.from("orders").select("id, total, status, created_at").eq("customer_id", customer.id).in("status", ["open", "sent", "preparing", "ready"]).order("created_at", { ascending: false }).limit(20),
      ]);
      const paid = ords || [];
      const totalSpent = paid.reduce((s, o) => s + Number(o.total || 0), 0);
      let top = [];
      if (paid.length) {
        const { data: its } = await supabase.from("order_items").select("product_name, quantity").in("order_id", paid.slice(0, 100).map(o => o.id));
        const cnt = {};
        (its || []).forEach(i => { cnt[i.product_name] = (cnt[i.product_name] || 0) + Number(i.quantity || 1); });
        top = Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 3);
      }
      setProfileStats({ cust: cust || customer, orders: paid.length, totalSpent, top, last: paid[0]?.created_at || null, open: openOrds || [] });
    } catch {
      setProfileStats({ cust: customer, orders: 0, totalSpent: 0, top: [], last: null, open: [] });
    }
  };
  // Uyeye ozel fiyatlar: { product_id: sabit fiyat (TL) }
  // Yeni kayitlar `price` ile gelir; eski `amount` kayitlari liste fiyatindan dusulur.
  const [memberDiscounts, setMemberDiscounts] = useState({});
  useEffect(() => {
    if (!customer?.id) { setMemberDiscounts({}); return; }
    supabase.from("member_discounts").select("product_id, amount, price")
      .eq("customer_id", customer.id).eq("is_active", true)
      .then(({ data }) => {
        const map = {};
        (data || []).forEach(d => {
          if (d.price != null) map[d.product_id] = Number(d.price);
          else if (Number(d.amount) > 0) map[d.product_id] = { legacyAmount: Number(d.amount) };
        });
        setMemberDiscounts(map);
      });
  }, [customer?.id]);

  // Bir urun icin uyeye ozel fiyat (yoksa null)
  const memberPriceFor = (p, mod = 0) => {
    const v = memberDiscounts[p.id];
    if (v == null) return null;
    if (typeof v === "object") return Math.max(0, Math.round(Number(p.price) + mod - v.legacyAmount));
    return Math.max(0, Math.round(Number(v) + mod));
  };

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
      fetch(RESERVE_URL + "/rest/v1/ride_posts?select=title,ride_date,ride_time,pace,distance_km,elevation_m,meet_point,route_url,strava_event_id&ride_date=gte." + today + "&order=ride_date.asc&limit=12",
        { headers: { apikey: RESERVE_KEY } })
        .then(r => r.json())
        .then(d => setFeeds(f => ({ ...f, rides: Array.isArray(d) ? d : [] })))
        .catch(() => setFeeds(f => ({ ...f, rides: [] })));
    }
    if (custTab === "vote" && !feeds.polls && currentStoreId) loadPolls();
    if ((custTab === "shop" || custTab === "blog") && !postFeeds[custTab]) {
      supabase.from("posts").select("*")
        .eq("kind", custTab === "shop" ? "urun" : "blog").eq("is_active", true)
        .order("sort_order").order("created_at", { ascending: false })
        .then(({ data }) => setPostFeeds(f => ({ ...f, [custTab]: data || [] })));
    }
  }, [custTab, currentStoreId]);

  // --- Oylama (Vote sekmesi) ---
  const [pollResults, setPollResults] = useState({}); // { pollId: {total, counts, free_count} }
  const [myVotes, setMyVotes] = useState({});         // { pollId: {option_id, free_text} }
  const [freeAnswer, setFreeAnswer] = useState({});   // { pollId: yazilan metin }
  const [voteBusy, setVoteBusy] = useState(null);

  const loadPolls = async () => {
    const nowIso = new Date().toISOString();
    const { data } = await supabase.from("polls").select("*")
      .eq("store_id", currentStoreId).eq("is_active", true)
      .lte("starts_at", nowIso).order("sort_order").order("created_at", { ascending: false });
    const list = (data || []).filter(p => !p.ends_at || p.ends_at > nowIso);
    setFeeds(f => ({ ...f, polls: list }));
    const vk = getVoterKey();
    for (const p of list) {
      supabase.rpc("poll_results", { p_poll_id: p.id })
        .then(({ data: r }) => setPollResults(s => ({ ...s, [p.id]: r || {} })));
      supabase.rpc("poll_my_vote", { p_poll_id: p.id, p_voter_key: vk })
        .then(({ data: v }) => { if (v && (v.option_id || v.free_text)) setMyVotes(s => ({ ...s, [p.id]: v })); });
    }
  };

  const sendVote = async (poll, optionId, freeText) => {
    if (voteBusy) return;
    setVoteBusy(poll.id);
    const vk = getVoterKey();
    const { data, error } = await supabase.rpc("poll_vote", {
      p_poll_id: poll.id, p_option_id: optionId || null,
      p_free_text: freeText || null, p_voter_key: vk,
    });
    setVoteBusy(null);
    if (error || data?.error) {
      alert(L("Oy gönderilemedi: ", "Could not send vote: ", "Не удалось отправить голос: ") + (data?.error || error?.message || ""));
      return;
    }
    setMyVotes(s => ({ ...s, [poll.id]: { option_id: optionId || null, free_text: freeText || null } }));
    if (freeText) setFreeAnswer(s => ({ ...s, [poll.id]: "" }));
    const { data: r } = await supabase.rpc("poll_results", { p_poll_id: poll.id });
    setPollResults(s => ({ ...s, [poll.id]: r || {} }));
  };

  const pollQ = (p) => (lang === "en" && p?.question_en) ? p.question_en
                     : (lang === "ru" && p?.question_ru) ? p.question_ru : p?.question;
  const optLabel = (o) => (lang === "en" && o?.en) ? o.en : (lang === "ru" && o?.ru) ? o.ru : o?.tr;

  const pName = (p) => (lang === "en" && p?.name_en) ? p.name_en : (lang === "ru" && p?.name_ru) ? p.name_ru : p?.name;
  const pDesc = (p) => (lang === "en" && p?.description_en) ? p.description_en : (lang === "ru" && p?.description_ru) ? p.description_ru : p?.description;
  const cName = (c) => (lang === "en" && c?.name_en) ? c.name_en : (lang === "ru" && c?.name_ru) ? c.name_ru : c?.name;
  // Inline uc-dil yardimcisi: L(tr, en, ru)
  const L = (trS, enS, ruS) => lang === "en" ? enS : lang === "ru" ? ruS : trS;
  // Secenek adi/degeri gosterim cevirisi (kanonik deger degismez, mutfak aynisini gorur)
  const optT = (s) => (OPT_I18N[s] && OPT_I18N[s][lang]) || s;
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
      // staff_only kategoriler (Magaza: tisort, seramik...) musteri menusunde gizli — yalniz kasadan eklenir
      const custCats = (cats || []).filter(c => !c.staff_only);
      const staffOnlyCatIds = new Set((cats || []).filter(c => c.staff_only).map(c => c.id));
      const finalCats = [...custCats];
      const finalProds = [...(prods || []).filter(p => !staffOnlyCatIds.has(p.category_id))];
      if (storeId === PARIS_STORE_UUID) {
        // Doner'in Paris menusunde de gorunecek kategorileri BAYRAKLA secilir.
        // Onceden kategori adina bakiliyordu; ad degisince (Kitchen -> Brunch)
        // mutfak sekmesi sessizce kaybolmustu. Ad artik hicbir yerde kural degil.
        const { data: kCats } = await supabase.from("categories").select("*")
          .eq("is_active", true).eq("store_id", DONER_STORE_UUID).eq("show_in_paris_menu", true);
        if (kCats && kCats.length > 0) {
          finalCats.push(...kCats);
          const { data: kProds } = await supabase.from("products").select("*")
            .eq("is_available", true).eq("store_id", DONER_STORE_UUID)
            .in("category_id", kCats.map(c => c.id)).order("sort_order");
          finalProds.push(...(kProds || []));
        }
        finalCats.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
        // Iki magazanin urunleri ust uste eklendi; her liste kendi icinde
        // siraliydi ama birlesince sira bozuluyor. Brunch gibi karisik
        // kategorilerde (Kruvasan Paris, Menemen doner) menu sirasi sasiyordu.
        finalProds.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
      }
      const finalCatsFiltered = finalCats;
      // Apply category schedule rules (hide categories during certain time windows)
      const now = new Date();
      const dayOfWeek = now.getDay() === 0 ? 7 : now.getDay(); // kurallar 1=Pzt..7=Paz saklanir
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
      // Happy hour fiyatlari: kasa ile ayni hesap (src/lib/happyHour.js)
      setHhProductPrices(happyHourPrices(finalProds, hhRules, new Date()));
      // Ilk sekme: alt kategori degil, ust kategori secilir
      if (!selectedCat) {
        const firstTop = finalCatsAfterSchedule.find(c => !c.parent_id && !c.show_in_shop);
        if (firstTop) setSelectedCat(firstTop.id);
      }
    } catch (e) { console.error("Menu load error", e); }
    setLoading(false);
  };

  useEffect(() => { load(); }, [qrToken, storeSlugParam]);

  useEffect(() => {
    if (!successOrderId) return;
    let stopped = false;
    const checkStatus = async () => {
      if (stopped) return;
      // Misafir siparis listesini okuyamaz (gizlilik) — durum RPC ile sorulur
      const { data: st } = await supabase.rpc("order_public_status", { p_order_id: successOrderId });
      if (!st || !st.item_count) return;
      const allServed = !!st.all_served;
      const anyReady = !!st.any_ready;
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

  // Menude gorunen tum kategoriler (ust + alt).
  const menuCategories = useMemo(
    () => categories.filter(c => !c.show_in_shop), // raf urunleri Menu'de degil Shop sekmesinde
    [categories]);

  // SIPARIS SAATI: kategorinin available_from/until araligi. Kategori GIZLENMEZ —
  // menu her saat okunabilir; saat disinda urunler silik gorunur ve "+" calismaz.
  // (Tamamen gizlemek icin Kategori Zamanlama kurallari var, o ayri bir sey.)
  const catById = useMemo(() => {
    const m = {};
    for (const c of categories) m[c.id] = c;
    return m;
  }, [categories]);
  const orderWindow = (catId) => {
    const c = catById[catId];
    return (c?.available_from && c?.available_until) ? { from: c.available_from, until: c.available_until } : null;
  };
  const hhmm = (s) => String(s || "").slice(0, 5);
  const windowText = (w) => w ? `${hhmm(w.from)} – ${hhmm(w.until)}` : "";
  const closedNow = (catId) => {
    const w = orderWindow(catId);
    return w ? !isInRange(now, w.from, w.until) : false;
  };

  // Bir urun su an sepete eklenebilir mi? Iki sebeple hayir olabilir:
  // kategorisinin siparis saati disindayiz ya da zamanlama kurali onu soldurmus.
  // Eskiden solmus urunun "+" butonu yine calisiyordu — mutfak kapaliyken
  // siparis gecebiliyordu.
  const blockedInfo = (p) => {
    const w = orderWindow(p.category_id);
    if (w && !isInRange(now, w.from, w.until)) return { start: w.from, end: w.until, window: true };
    const f = fadedProdInfo[p.id];
    return f ? { ...f, window: false } : null;
  };

  // Ust sekmeler: parent_id bos olanlar. Ust kategorisi bu listede olmayan bir
  // alt kategori de sekme olur — aksi halde hicbir yerde gorunmezdi. (Doner
  // menusunde "Yiyecekler"in ust kategorisi Paris'te; oradan bakinca yetim kalir.)
  const visibleCategories = useMemo(() => {
    const ids = new Set(menuCategories.map(c => c.id));
    return menuCategories.filter(c => !c.parent_id || !ids.has(c.parent_id));
  }, [menuCategories]);

  // Ust kategori -> alt kategorileri (sort_order'a gore)
  const subCatsByParent = useMemo(() => {
    const m = {};
    const ids = new Set(menuCategories.map(c => c.id));
    for (const c of menuCategories) {
      if (!c.parent_id || !ids.has(c.parent_id)) continue; // yetimler sekme oldu
      (m[c.parent_id] = m[c.parent_id] || []).push(c);
    }
    Object.values(m).forEach(list => list.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)));
    return m;
  }, [menuCategories]);

  // Shop sekmesi: raf/marka kategorileri ve urunleri (siparis edilebilir vitrin)
  // Siralama sort_order ile: Not in Paris (100) en ustte, Ceren Studio (101), digerleri
  const shopCats = useMemo(() =>
    categories.filter(c => c.show_in_shop)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || String(a.name).localeCompare(String(b.name), "tr")),
    [categories]);
  const shopCatIds = useMemo(() => new Set(shopCats.map(c => c.id)), [shopCats]);
  // Marka kutusunda acik olan alt grup: { kategori_id: "Şapkalar" | "__diger" | null }
  const [openGroup, setOpenGroup] = useState({});
  const gLabel = (g) => (GROUP_I18N[g] && GROUP_I18N[g][lang]) || g;
  // Grup secilmemisse hicbir urun gosterilmez (once grup secilir); gruplu urun
  // yoksa tum urunler dogrudan listelenir — eski davranis korunur.
  const visibleShopProds = (sc, prods) => {
    const hasGroups = prods.some(p => p.shop_group);
    if (!hasGroups) return prods;
    const open = openGroup[sc.id];
    if (!open) return [];
    if (open === "__diger") return prods.filter(p => !p.shop_group);
    return prods.filter(p => p.shop_group === open);
  };
  const shopProductsByCat = useMemo(() => {
    const m = {};
    for (const p of products) {
      if (shopCatIds.has(p.category_id)) (m[p.category_id] = m[p.category_id] || []).push(p);
    }
    return m;
  }, [products, shopCatIds]);

  // Secili ust kategorinin altinda hangi alt kategori acik: null = Tumu,
  // "__diger" = alt kategorisi olmayip dogrudan ust kategoride duran urunler.
  const [selectedSub, setSelectedSub] = useState(null);
  useEffect(() => { setSelectedSub(null); }, [selectedCat]);

  const activeSubs = subCatsByParent[selectedCat] || [];
  // Ust kategoride dogrudan duran urun var mi (Kakao, Sahlep gibi)
  const hasDirect = useMemo(
    () => activeSubs.length > 0 && products.some(p => p.category_id === selectedCat),
    [products, selectedCat, activeSubs.length]);

  // Urunler bolum bolum: [{ key, title, items }]. Alt kategori secilmisse tek
  // bolum (basliksiz), "Tumu" ise her alt kategori kendi basligiyla listelenir.
  const productSections = useMemo(() => {
    const party = (list) => {
      if (!partyMode) return list;
      const only = list.filter(p => p.show_in_party_menu);
      return only.length > 0 ? only : list;
    };
    const inCat = (id) => party(products.filter(p => p.category_id === id));

    // hours: bolum basliginin altinda gorunen siparis saati araligi
    const sec = (key, title, catId, items) => ({ key, title, items, hours: windowText(orderWindow(catId)) });

    if (activeSubs.length === 0) return [sec(selectedCat, null, selectedCat, inCat(selectedCat))];
    if (selectedSub === "__diger") return [sec("__diger", null, selectedCat, inCat(selectedCat))];
    if (selectedSub) {
      const sc = activeSubs.find(c => c.id === selectedSub);
      return [sec(selectedSub, null, selectedSub, sc ? inCat(sc.id) : [])];
    }
    const secs = activeSubs.map(sc => sec(sc.id, cName(sc), sc.id, inCat(sc.id)));
    if (hasDirect) secs.push(sec("__diger", t.other_group, selectedCat, inCat(selectedCat)));
    return secs.filter(s => s.items.length > 0);
  }, [products, selectedCat, selectedSub, partyMode, activeSubs, hasDirect, lang, categories, now]);

  const visibleProducts = useMemo(
    () => productSections.flatMap(s => s.items),
    [productSections]);

  const calcPrice = (p, options) => {
    // Secenek fiyat farki (tek + coklu gruplar) — src/lib/productOptions.js
    const mod = optionMod(p, options);
    // Product-based happy hour: use new price directly
    const basePrice = (hhProductPrices[p.id] != null ? Number(hhProductPrices[p.id]) : Number(p.price)) + mod;
    let pct = 0;
    if (hh && (hh.category_ids?.length === 0 || hh.category_ids?.includes(p.category_id))) pct = Number(hh.discount_pct) || 0;
    if (Number(p.instant_discount_pct||0) > pct) pct = Number(p.instant_discount_pct);
    let final = Math.round(basePrice * (100 - pct) / 100);
    // Uye fiyati: kampanya ile karsilastirilir, musteri DUSUK olani oder
    const mp = memberPriceFor(p, mod);
    if (mp != null) final = Math.min(final, mp);
    return final;
  };

  // Ustu cizilecek liste fiyati: yalniz gercekten indirim varsa
  const listPrice = (p, options) => {
    return Math.round(Number(p.price) + optionMod(p, options));
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

  // Take away: yalniz takeaway_cup tanimli urunlerde (sicak -> karton, soguk -> pet).
  // Sert alkollerde ve tabakta servis edilenlerde hic gosterilmez.
  const canTakeaway = (p) => p?.takeaway_cup === "hot" || p?.takeaway_cup === "cold";
  const takeawayLines = useMemo(() => cart.filter(c => canTakeaway(c.product)), [cart]);
  const allTakeaway = takeawayLines.length > 0 && takeawayLines.every(c => c.takeaway);
  const toggleTakeaway = (idx) =>
    setCart(prev => prev.map((c, i) => i === idx ? { ...c, takeaway: !c.takeaway } : c));
  const setAllTakeaway = (val) =>
    setCart(prev => prev.map(c => canTakeaway(c.product) ? { ...c, takeaway: val } : c));

  const onProductTap = (p) => {
    unlockAudio();
    if (p.sold_out_today) { alert(t.sold_out_alert + (p.unavailable_reason || "")); return; }
    // Saat disinda "+" zaten gorunmuyor; yine de tek kapi olsun
    const blk = blockedInfo(p);
    if (blk) { alert(`${hhmm(blk.window ? blk.start : blk.end)} – ${hhmm(blk.window ? blk.end : blk.start)} ${t.order_between}`); return; }
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
      if (group.required && (group.multi?!((optSelected[group.name]||[]).length):!optSelected[group.name])) { alert(t.please_choose + " " + optT(group.name)); return; }
    }
    addToCart(optModal, optSelected, optNote.trim() || null);
    setOptModal(null);
  };

  // Online odeme (PayTR iframe) — Ayarlar'dan acilip kapanir
  const [payToken, setPayToken] = useState(null);
  const [payBusy, setPayBusy] = useState(false);
  const [orderPaid, setOrderPaid] = useState(false);
  const onlinePayEnabled = settings && (settings.online_payment_enabled === true || settings.online_payment_enabled === "true");

  const startPay = async () => {
    if (payBusy || !successOrderId) return;
    setPayBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("paytr?action=token", { body: { order_id: successOrderId } });
      if (error) throw new Error(error.message || "Sunucu hatasi");
      if (data?.error) throw new Error(data.error);
      setPayToken(data.token);
    } catch (e) { alert(L("Ödeme başlatılamadı: ", "Payment could not start: ", "Не удалось начать оплату: ") + (e?.message || e)); }
    setPayBusy(false);
  };

  // Odeme penceresi acikken siparis durumunu izle — PayTR bildirimi 'paid' yapinca kapat
  useEffect(() => {
    if (!payToken || !successOrderId) return;
    const iv = setInterval(async () => {
      const { data } = await supabase.rpc("order_public_status", { p_order_id: successOrderId });
      if (data?.status === "paid") { setOrderPaid(true); setPayToken(null); }
    }, 4000);
    return () => clearInterval(iv);
  }, [payToken, successOrderId]);

  // Siparise ozel push aboneligi: hazir olunca kilitli telefona da bildirim gider.
  // iPhone'da yalnizca ana ekrana eklenmis (PWA) halde calisir; Android Chrome'da direkt calisir.
  const subscribePush = async (orderId) => {
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
      if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlB64ToUint8(VAPID_PUBLIC_KEY),
        });
      }
      await supabase.from("push_subscriptions").insert({ order_id: orderId, subscription: sub.toJSON() });
    } catch (e) { console.log("push aboneligi olmadi:", e?.message || e); }
  };

  const submitOrder = async () => {
    if (submitting || cart.length === 0) return;
    if ((!table || table.shared) && !customerName.trim() && !customer) { alert(t.please_enter_name); return; }
    unlockAudio(); askNotifPermissionSync();
    setSubmitting(true);
    try {
      if (customerName.trim()) { try { localStorage.setItem("nip_customer_name", customerName.trim()); } catch { /* gizli mod */ } }
      const totalVal = cartTotal;
      // Siparis numarasini ISTEMCI uretir: boylece INSERT ... RETURNING gerekmez.
      // Misafirin siparis tablosunu okuma yetkisi yok (gizlilik) — RETURNING kullanilsaydi
      // SELECT policy'si gerekirdi ve bu da tum siparislerin dokulmesine kapi acardi.
      const newOrderId = (crypto.randomUUID && crypto.randomUUID()) ||
        "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, ch => {
          const r = Math.random() * 16 | 0;
          return (ch === "x" ? r : (r & 0x3 | 0x8)).toString(16);
        });
      const { error: ordErr } = await supabase.from("orders").insert({
        id: newOrderId,
        table_id: table ? table.id : null,
        customer_name: customerName.trim() || customer?.name || null,
        customer_id: customer?.id || null,
        subtotal: totalVal, total: totalVal, status: "open",
        note: orderNote.trim() || null,
        use_points: !!(usePoints && customer),
        origin_store_id: currentStoreId,
      });
      if (ordErr) throw ordErr;
      const itemsPayload = cart.map(c => ({
        order_id: newOrderId, product_id: c.product.id, product_name: c.product.name,
        product_price: Number(c.product.price), final_price: calcPrice(c.product, c.options),
        // Shop urunleri (sapka, kolye...) mutfak tabletine dusmez; siparis ekraninda gorunur
        quantity: c.quantity, kitchen_status: "pending", sent_to_kitchen: !shopCatIds.has(c.product.category_id), kitchen_destination_store_id: c.product.kitchen_destination_store_id || c.product.store_id,
        notes: c.note || null, selected_options: c.options || null,
        store_id: c.product.store_id || currentStoreId,
        is_takeaway: !!c.takeaway && canTakeaway(c.product),
      }));
      const { error: itErr } = await supabase.from("order_items").insert(itemsPayload);
      if (itErr) throw itErr;
      subscribePush(newOrderId); // arka planda; basarisiz olsa da siparis akisini etkilemez
      setOrderPaid(false); setPayToken(null);
      setSuccessOrderId(newOrderId);
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

  if (needsProfile) {
    return (
      <div className="nip-customer" style={{fontFamily:cv,background:"#fff",color:"#101214",minHeight:"100vh",display:"flex",flexDirection:"column",justifyContent:"space-between",padding:"34px 28px",maxWidth:520,margin:"0 auto"}}>
        <img src="/icons/logo-mark.png" alt="" style={{width:38,height:"auto"}}/>

        <div>
          <div style={{fontSize:22,fontWeight:800,letterSpacing:"-0.01em"}}>{t.pf_title}</div>
          <div style={{fontSize:14,color:"#5C636B",lineHeight:1.6,marginTop:8}}>{t.pf_sub}</div>

          <div style={{marginTop:26,display:"flex",flexDirection:"column",gap:12}}>
            <input value={pf.first} onChange={e=>setPf({...pf,first:e.target.value})}
              placeholder={t.pf_first} autoComplete="given-name"
              style={{width:"100%",padding:"15px 16px",background:"#F6F7F8",border:"1px solid #E4E7EA",borderRadius:12,fontSize:16,outline:"none",fontFamily:"inherit"}}/>
            <input value={pf.last} onChange={e=>setPf({...pf,last:e.target.value})}
              placeholder={t.pf_last} autoComplete="family-name"
              style={{width:"100%",padding:"15px 16px",background:"#F6F7F8",border:"1px solid #E4E7EA",borderRadius:12,fontSize:16,outline:"none",fontFamily:"inherit"}}/>

            <div style={{display:"flex",gap:8}}>
              <select value={pf.dial} onChange={e=>setPf({...pf,dial:e.target.value})}
                aria-label={t.pf_country}
                style={{flex:"0 0 122px",padding:"15px 8px",background:"#F6F7F8",border:"1px solid #E4E7EA",borderRadius:12,fontSize:16,outline:"none",fontFamily:"inherit"}}>
                {PHONE_CODES.map(c => (
                  <option key={c.iso} value={c.dial}>{c.flag} +{c.dial}</option>
                ))}
              </select>
              <input value={pf.tel} onChange={e=>setPf({...pf,tel:e.target.value})}
                placeholder={t.pf_phone} inputMode="tel" autoComplete="tel-national"
                style={{flex:1,minWidth:0,padding:"15px 16px",background:"#F6F7F8",border:"1px solid #E4E7EA",borderRadius:12,fontSize:16,outline:"none",fontFamily:"inherit"}}/>
            </div>
          </div>
        </div>

        <div>
          <button onClick={savePf} disabled={pfBusy}
            style={{width:"100%",padding:17,borderRadius:999,background:pfBusy?"#8B9198":"#101214",color:"#fff",border:"none",fontSize:15,fontWeight:700,cursor:pfBusy?"default":"pointer",fontFamily:"inherit"}}>
            {pfBusy ? t.pf_saving : t.pf_save}
          </button>
          <button onClick={signOut}
            style={{width:"100%",marginTop:12,background:"none",border:"none",color:"#9AA0A6",fontSize:12.5,cursor:"pointer",fontFamily:"inherit"}}>
            {t.pf_signout}
          </button>
        </div>
      </div>
    );
  }

  if (!loading && showWelcome) {
    // Karsilama: beyaz zemin, kucuk siyah bisiklet, tek buyuk cumle.
    // Vurgulanan kelime Fransiz bayragi mavisi (#0055A4) — "Not in Paris"
    // adiyla oynayan tek seferlik bir saka, o yuzden altin degil.
    const W = {
      tr: { h: ["BU SADECE", "BİR MENÜ", "DEĞİL."],
            p1: "Sürüşleri görebilir, etkinlikler için rezervasyon yapabilir, yarının kahve çekirdeğini seçebilir ve mağazadaki ürünler hakkında bilgi alabilirsin.",
            p2: "Üye olup puan biriktirebilir, üyelere özel happy hour indirimlerinden yararlanabilirsin.",
            go: "Başla" },
      en: { h: ["THIS IS", "NOT JUST", "A MENU."],
            p1: "See the rides, book a place at events, pick tomorrow’s coffee beans and read up on everything in the shop.",
            p2: "Become a member to collect points and use the members-only happy hour discounts.",
            go: "Start" },
      ru: { h: ["ЭТО", "НЕ ПРОСТО", "МЕНЮ."],
            p1: "Смотрите заезды, бронируйте места на события, выбирайте кофе на завтра и узнавайте о товарах магазина.",
            p2: "Станьте участником: копите баллы и пользуйтесь скидками happy hour.",
            go: "Начать" },
    }[lang] || {};
    // Baslik marka yazi tipiyle: Coolvetica Heavy Compressed'te hem Turkce
    // hem Kiril harfler var (790 glif), yani uc dil de ayni yuzle yaziliyor.
    // Rusca kelimeler uzun oldugu icin punto bir tik dusuruluyor.
    const headFont = {
      fontFamily: "'Coolvetica Heavy','Bebas Neue','Barlow Condensed',Impact,sans-serif",
      fontWeight: 400, fontSize: lang === "ru" ? 54 : 62,
      lineHeight: 0.92, letterSpacing: "0.005em", textTransform: "uppercase",
    };
    return (
      <div className="nip-customer" style={{fontFamily:cv,background:"#fff",color:"#101214",minHeight:"100vh",display:"flex",flexDirection:"column",justifyContent:"space-between",padding:"34px 28px",maxWidth:520,margin:"0 auto"}}>
        <img src="/icons/logo-mark.png" alt="Not in Paris" style={{width:38,height:"auto"}}/>

        <div>
          <div style={headFont}>
            {W.h?.[0]}<br/>{W.h?.[1]}<br/><span style={{color:"#0055A4"}}>{W.h?.[2]}</span>
          </div>
          <div style={{fontWeight:300,fontSize:15.5,lineHeight:1.62,color:"#2B3138",marginTop:24}}>{W.p1}</div>
          <div style={{fontWeight:300,fontSize:14,lineHeight:1.62,color:"#6B7278",marginTop:14,paddingTop:14,borderTop:"1px solid #E9EBED"}}>{W.p2}</div>
        </div>

        <div>
          <div style={{display:"flex",gap:16,marginBottom:16}}>
            {["tr","en","ru"].map(k => (
              <button key={k} onClick={() => setLanguage(k)}
                style={{background:"none",border:"none",padding:"4px 0",cursor:"pointer",fontFamily:"inherit",
                        fontSize:11,letterSpacing:"0.12em",fontWeight:700,
                        color:lang===k?"#101214":"#B8BCC1"}}>{k.toUpperCase()}</button>
            ))}
          </div>
          <button onClick={dismissWelcome} style={{width:"100%",padding:17,borderRadius:999,background:"#101214",color:"#fff",border:"none",fontSize:15,fontWeight:700,letterSpacing:"0.02em",cursor:"pointer",fontFamily:"inherit"}}>
            {W.go}
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    // Acilis ekrani: beyaz zeminde siyah bisiklet, hafifce nabiz atar.
    // Animasyon prefers-reduced-motion'da durur (index.css).
    return (
      <div className="nip-customer" style={{fontFamily:cv,background:"#fff",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center"}}>
        <img src="/icons/logo-mark.png" alt="Not in Paris" className="nip-splash-mark"
             style={{width:120,height:"auto",opacity:0.9}}/>
      </div>
    );
  }

  if (successOrderId && !browsing) {
    const bg = orderStage === "ready" ? "#FFF8E1" : orderStage === "served" ? "#E8F5E9" : "#fff";
    const isReady = orderStage === "ready";
    const isServed = orderStage === "served";
    const PayBlock = () => orderPaid ? (
      <div style={{padding:"12px 18px",background:"#E8F5E9",border:"1px solid #A5D6A7",borderRadius:12,fontSize:14,fontWeight:800,color:"#2e7d32",marginBottom:14}}>
        {L("Ödendi ✅ Teşekkürler!","Paid ✅ Thank you!","Оплачено ✅ Спасибо!")}
      </div>
    ) : onlinePayEnabled ? (
      <button onClick={startPay} disabled={payBusy} style={{padding:"14px 28px",background:"#000",color:"#fff",border:"none",borderRadius:12,fontSize:14,fontWeight:800,cursor:"pointer",marginBottom:14,opacity:payBusy?0.6:1}}>
        {payBusy ? L("Açılıyor...","Opening...","Открывается...") : L("💳 Kart ile Öde","💳 Pay by Card","💳 Оплатить картой")}
      </button>
    ) : null;
    return (
      <div className="nip-customer" style={{fontFamily:cv,background:bg,minHeight:"100vh",padding:"40px 20px",color:"#000",transition:"background 0.4s"}}>
        {payToken && (
          <div style={{position:"fixed",inset:0,background:"#fff",zIndex:200,display:"flex",flexDirection:"column"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 16px",borderBottom:"1px solid #eee"}}>
              <div style={{fontSize:14,fontWeight:800}}>{L("Güvenli Ödeme — PayTR","Secure Payment — PayTR","Безопасная оплата — PayTR")}</div>
              <button onClick={()=>setPayToken(null)} style={{background:"#f2f2f2",border:"none",borderRadius:8,padding:"8px 14px",fontSize:13,fontWeight:700,cursor:"pointer"}}>{L("Kapat","Close","Закрыть")}</button>
            </div>
            <iframe src={"https://www.paytr.com/odeme/guvenli/" + payToken} title="PayTR" style={{flex:1,border:"none",width:"100%"}}/>
          </div>
        )}
        <div style={{maxWidth:460,margin:"0 auto",textAlign:"center"}}>
          {isReady ? (
            <>
              <div style={{fontSize:80,marginBottom:14}}>🔔</div>
              <div style={{fontSize:30,fontWeight:900,marginBottom:8,letterSpacing:"-0.5px"}}>{t.order_ready_big}</div>
              <div style={{fontSize:15,color:"#555",marginBottom:24,lineHeight:1.5}}>
                {table ? (table.name + " · ") : ""}{t.pick_from_cashier}
              </div>
              <PayBlock/>
              <div><button onClick={() => { playDing(); vibrate(); }} style={{padding:"12px 24px",background:"#C8973E",color:"#000",border:"none",borderRadius:12,fontSize:13,fontWeight:800,cursor:"pointer"}}>{t.play_again}</button></div>
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
              <PayBlock/>
              <button onClick={() => setBrowsing(true)} style={{padding:"12px 24px",background:orderPaid?"#000":"#f2f2f2",color:orderPaid?"#fff":"#333",border:"none",borderRadius:12,fontSize:13,fontWeight:700,cursor:"pointer"}}>
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
      <div style={{borderBottom:"1px solid #eee",position:"sticky",top:0,background:"#fff",zIndex:20}}>
        {(() => {
          // Duyuru seridi — Ayarlar > Duyuru Seridi'nden yonetilir (uc dilli, TR'ye dusme)
          const annOn = settings && (settings.announcement_enabled === true || settings.announcement_enabled === "true");
          const annText = !annOn ? "" : String((lang === "ru" ? (settings.announcement_ru || settings.announcement_tr) : lang === "en" ? (settings.announcement_en || settings.announcement_tr) : settings.announcement_tr) || "").trim();
          return annText ? (
            <div style={{background:"#000",color:"#E0AB4A",padding:"7px 14px",fontSize:12,fontWeight:700,textAlign:"center",letterSpacing:"0.3px",lineHeight:1.4}}>
              📢 {annText}
            </div>
          ) : null;
        })()}
        <div style={{padding:"20px 16px 10px"}}>
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
        <>
        <div style={{display:"flex",gap:6,overflowX:"auto",marginTop:12,paddingBottom:4}}>
          {visibleCategories.map(c => (
            <button key={c.id} onClick={() => setSelectedCat(c.id)} style={{flexShrink:0,padding:"8px 14px",border:"none",borderRadius:16,fontSize:12,fontWeight:700,background:selectedCat===c.id?"#000":"#f2f2f2",color:selectedCat===c.id?"#fff":"#333",cursor:"pointer",whiteSpace:"nowrap",letterSpacing:"0.3px"}}>
              {c.icon && <span style={{marginRight:4}}>{c.icon}</span>}{cName(c)}
            </button>
          ))}
        </div>
        {activeSubs.length > 0 && (
          <div style={{display:"flex",gap:6,overflowX:"auto",marginTop:8,paddingBottom:2}}>
            {[{id:null,label:t.all_group},
              ...activeSubs.map(sc => ({id:sc.id,label:cName(sc)})),
              ...(hasDirect ? [{id:"__diger",label:t.other_group}] : [])
            ].map(s => (
              <button key={s.id || "__all"} onClick={() => setSelectedSub(s.id)}
                style={{flexShrink:0,padding:"6px 12px",borderRadius:14,fontSize:11,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap",letterSpacing:"0.3px",
                        border:"1px solid " + (selectedSub===s.id ? "#000" : "#ddd"),
                        background:selectedSub===s.id?"#000":"#fff",
                        color:selectedSub===s.id?"#fff":"#555"}}>
                {s.label}
              </button>
            ))}
          </div>
        )}
        </>
        )}
        </div>
      </div>

      {custTab === "menu" && (
      <div style={{padding:"8px 16px",background:"#faf6ee",borderBottom:"1px solid #f0e8d8",display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
        {customer ? (
          <button onClick={openProfile} style={{fontSize:12,color:"#7a5c1e",fontWeight:600,background:"none",border:"none",cursor:"pointer",padding:0,textAlign:"left",fontFamily:"inherit",display:"flex",alignItems:"center",gap:6,width:"100%",justifyContent:"space-between"}}>
            <span>
              ⭐ {L("Merhaba","Hi","Привет")} {customer.name?.split(" ")[0] || ""}
              {Object.keys(memberDiscounts).length > 0 && <span> — {L("üye fiyatların aktif","member prices active","цены для участников активны")}</span>}
            </span>
            <span style={{fontSize:11,fontWeight:800,whiteSpace:"nowrap"}}>{L("Profilim →","My profile →","Профиль →")}</span>
          </button>
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
            <a href={RESERVATION_URL} onClick={openReservation} rel="noreferrer" style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"16px 18px",background:"#000",color:"#fff",borderRadius:14,textDecoration:"none",marginBottom:14}}>
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
                <a key={i} href={RESERVATION_URL} onClick={openReservation} rel="noreferrer" style={{display:"flex",alignItems:"center",gap:10,padding:"14px 2px",borderBottom:"1px solid #f0f0f0",textDecoration:"none",color:"#000"}}>
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
                <a key={i} href={rideLink(r)} target="_blank" rel="noreferrer" style={{display:"flex",alignItems:"center",gap:10,padding:"14px 2px",borderBottom:"1px solid #f0f0f0",textDecoration:"none",color:"#000"}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:15,fontWeight:800,lineHeight:1.3}}>{r.title}</div>
                    <div style={{fontSize:12,color:"#666",marginTop:3}}>
                      {fmtDay(r.ride_date)}{r.ride_time ? " · " + r.ride_time : ""}
                    </div>
                    <div style={{fontSize:11,color:"#888",marginTop:2}}>
                      {[r.pace, r.distance_km ? Math.round(r.distance_km) + " km" : null, r.elevation_m ? Math.round(r.elevation_m) + " m↑" : null, r.meet_point].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  <span style={{fontSize:12,fontWeight:700,flexShrink:0,textAlign:"right"}}>
                    {L("Katıl","Join","Поехали")} →
                    {r.strava_event_id && <span style={{display:"block",fontSize:9,color:"#FC5200",fontWeight:800,letterSpacing:"0.3px"}}>STRAVA</span>}
                  </span>
                </a>
              ))}
              <a href={FIND_BIKE_URL} target="_blank" rel="noreferrer" style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,padding:"14px 16px",background:"#000",color:"#fff",borderRadius:14,textDecoration:"none",marginTop:14}}>
                <span style={{minWidth:0}}>
                  <span style={{fontSize:13,fontWeight:800,display:"block"}}>🚲 {L("Bisiklet bul","Find a Bike","Найти велосипед")}</span>
                  <span style={{fontSize:11,color:"#bbb",display:"block",marginTop:2,lineHeight:1.4}}>
                    {L("Sürüşe bisikletsiz mi geldin? Kiralık ve ikinci el.","No bike for the ride? Rentals and second-hand.","Приехал без велосипеда? Аренда и б/у.")}
                  </span>
                </span>
                <span style={{flexShrink:0}}>→</span>
              </a>
              <a href={STRAVA_URL} target="_blank" rel="noreferrer" style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 16px",background:"#fafafa",border:"1px solid #eee",borderRadius:14,textDecoration:"none",color:"#000",marginTop:10}}>
                <span style={{fontSize:13,fontWeight:800}}>🟠 NIP Cycling Club — Strava</span>
                <span>↗</span>
              </a>
            </>
          )}
          {custTab === "vote" && (
            <>
              {feeds.polls === undefined && <div style={{textAlign:"center",color:"#888",padding:30,fontSize:13}}>...</div>}
              {feeds.polls?.length === 0 && (
                <div style={{textAlign:"center",color:"#888",padding:30,fontSize:13,lineHeight:1.6}}>
                  {L("Şu an açık oylama yok — yakında yeni sorular 🗳","No open polls right now — new questions soon 🗳","Сейчас нет открытых голосований — скоро новые вопросы 🗳")}
                </div>
              )}
              {(feeds.polls || []).map(poll => {
                const res = pollResults[poll.id] || {};
                const mine = myVotes[poll.id];
                const voted = !!(mine && (mine.option_id || mine.free_text));
                const total = Number(res.total || 0);
                return (
                  <div key={poll.id} style={{background:"#fafafa",border:"1px solid #eee",borderRadius:16,padding:"14px 14px 12px",marginBottom:14}}>
                    <div style={{fontSize:15,fontWeight:800,lineHeight:1.35,marginBottom:10}}>{pollQ(poll)}</div>
                    {(poll.options || []).map(o => {
                      const n = Number(res.counts?.[o.id] || 0);
                      const pct = total > 0 ? Math.round((n / total) * 100) : 0;
                      const picked = mine?.option_id === o.id;
                      return (
                        <button key={o.id} onClick={() => sendVote(poll, o.id, null)} disabled={voteBusy === poll.id}
                          style={{position:"relative",overflow:"hidden",width:"100%",textAlign:"left",marginBottom:7,padding:"12px 14px",
                                  background:"#fff",border:"1.5px solid "+(picked?"#000":"#e6e6e6"),borderRadius:12,
                                  fontSize:14,fontWeight:picked?800:600,cursor:"pointer",fontFamily:"inherit",color:"#000"}}>
                          {voted && <span style={{position:"absolute",inset:0,width:pct+"%",background:picked?"#000":"#ececec",opacity:picked?0.09:1,transition:"width .35s"}}/>}
                          <span style={{position:"relative",display:"flex",justifyContent:"space-between",gap:10,alignItems:"center"}}>
                            <span>{picked ? "✓ " : ""}{optLabel(o)}</span>
                            {voted && <span style={{fontSize:12,fontWeight:800,color:"#666",flexShrink:0}}>{L("%" + pct, pct + "%", pct + "%")}</span>}
                          </span>
                        </button>
                      );
                    })}
                    {poll.allow_free_text && (
                      <div style={{display:"flex",gap:6,marginTop:(poll.options||[]).length?8:0}}>
                        <input value={freeAnswer[poll.id] || ""} onChange={e => setFreeAnswer(s => ({ ...s, [poll.id]: e.target.value }))}
                          maxLength={140} placeholder={L("Kendi cevabını yaz…","Write your own answer…","Напишите свой вариант…")}
                          style={{flex:1,minWidth:0,padding:"11px 13px",background:"#fff",border:"1.5px solid #e6e6e6",borderRadius:12,fontSize:14,outline:"none",fontFamily:"inherit"}}/>
                        <button onClick={() => sendVote(poll, null, (freeAnswer[poll.id] || "").trim())}
                          disabled={voteBusy === poll.id || !(freeAnswer[poll.id] || "").trim()}
                          style={{padding:"11px 16px",background:(freeAnswer[poll.id]||"").trim()?"#000":"#ddd",color:(freeAnswer[poll.id]||"").trim()?"#fff":"#999",
                                  border:"none",borderRadius:12,fontSize:13,fontWeight:800,cursor:"pointer",flexShrink:0,fontFamily:"inherit"}}>
                          {L("Gönder","Send","Отправить")}
                        </button>
                      </div>
                    )}
                    {mine?.free_text && (
                      <div style={{fontSize:12,color:"#1a7f37",fontWeight:700,marginTop:8}}>
                        ✓ {L("Cevabın alındı","Your answer is in","Ваш ответ принят")}: “{mine.free_text}”
                      </div>
                    )}
                    <div style={{fontSize:11,color:"#999",marginTop:9,lineHeight:1.5}}>
                      {voted
                        ? L(total + " kişi oy verdi · fikrini değiştirebilirsin", total + " people voted · you can change your mind", "Проголосовало: " + total + " · можно передумать")
                        : L("Oyla, sonucu gör 👀","Vote to see the results 👀","Проголосуйте, чтобы увидеть результаты 👀")}
                    </div>
                  </div>
                );
              })}
              <div style={{fontSize:11,color:"#999",textAlign:"center",marginTop:4,lineHeight:1.6}}>
                {L("Cevaplarını okuyoruz — bazıları menüde ve çalma listesinde karşına çıkacak ♥",
                   "We read every answer — some will show up on the menu and the playlist ♥",
                   "Мы читаем все ответы — часть из них появится в меню и плейлисте ♥")}
              </div>
            </>
          )}
          {custTab === "shop" && shopCats.length > 0 && (
            <div style={{marginBottom:18}}>
              {shopCats.map(sc => {
                const prods = shopProductsByCat[sc.id] || [];
                if (!prods.length) return null;
                const scTag = (["en","ru"].includes(lang) ? sc["shop_tag_" + lang] : sc.shop_tag) || sc.shop_tag;
                const scDesc = (["en","ru"].includes(lang) ? sc["description_" + lang] : sc.description) || sc.description;
                return (
                  <div key={sc.id} style={{marginBottom:16,background:"#fafafa",border:"1px solid #eee",borderRadius:16,padding:"14px 12px 12px"}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",padding:"0 2px"}}>
                      <div style={{fontSize:17,fontWeight:800,letterSpacing:"0.2px"}}>{sc.icon ? sc.icon + " " : ""}{cName(sc)}</div>
                      {scTag && <span style={{fontSize:10,fontWeight:800,letterSpacing:"0.5px",padding:"3px 9px",background:"#000",color:"#fff",borderRadius:20,textTransform:"uppercase"}}>{scTag}</span>}
                    </div>
                    {scDesc && <div style={{fontSize:12,color:"#666",lineHeight:1.5,margin:"5px 2px 0"}}>{scDesc}</div>}

                    {/* Alt gruplar: once "Şapkalar / Takılar" gibi secenekler, secilince o grubun urunleri */}
                    {(() => {
                      const groups = [...new Set(prods.map(p => p.shop_group).filter(Boolean))];
                      if (!groups.length) return null;
                      const open = openGroup[sc.id];
                      return (
                        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:11}}>
                          {groups.map(g => {
                            const sel = open === g;
                            const n = prods.filter(p => p.shop_group === g).length;
                            return (
                              <button key={g} onClick={() => setOpenGroup(s => ({ ...s, [sc.id]: sel ? null : g }))}
                                style={{padding:"9px 14px",background:sel?"#000":"#fff",color:sel?"#fff":"#333",
                                        border:"1.5px solid "+(sel?"#000":"#e2e2e2"),borderRadius:22,fontSize:13,
                                        fontWeight:sel?800:600,cursor:"pointer",fontFamily:"inherit"}}>
                                {gLabel(g)} <span style={{opacity:0.55,fontWeight:600}}>{n}</span>
                              </button>
                            );
                          })}
                          {prods.some(p => !p.shop_group) && (
                            <button onClick={() => setOpenGroup(s => ({ ...s, [sc.id]: open === "__diger" ? null : "__diger" }))}
                              style={{padding:"9px 14px",background:open==="__diger"?"#000":"#fff",color:open==="__diger"?"#fff":"#333",
                                      border:"1.5px solid "+(open==="__diger"?"#000":"#e2e2e2"),borderRadius:22,fontSize:13,
                                      fontWeight:open==="__diger"?800:600,cursor:"pointer",fontFamily:"inherit"}}>
                              {L("Diğer","Other","Другое")} <span style={{opacity:0.55,fontWeight:600}}>{prods.filter(p => !p.shop_group).length}</span>
                            </button>
                          )}
                        </div>
                      );
                    })()}

                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginTop:12}}>
                      {visibleShopProds(sc, prods).map(p => {
                        const fp = calcPrice(p);
                        const soldOut = p.sold_out_today;
                        const cartIdx = cart.findIndex(ci => ci.product.id === p.id && !ci.options);
                        const inCart = cartIdx >= 0 ? cart[cartIdx].quantity : 0;
                        return (
                          <div key={p.id} style={{background:"#fff",border:"1px solid #eee",borderRadius:14,padding:"12px 12px 10px",display:"flex",flexDirection:"column",gap:6,opacity:soldOut?0.45:1}}>
                            {p.image_url && <img src={p.image_url} alt="" style={{width:"100%",height:110,objectFit:"cover",borderRadius:10}}/>}
                            <div style={{fontSize:13,fontWeight:700,lineHeight:1.3,minHeight:34}}>{pName(p)}</div>
                            {pDesc(p) && <div style={{fontSize:11,color:"#777",lineHeight:1.4}}>{pDesc(p)}</div>}
                            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:"auto"}}>
                              <span style={{fontSize:14,fontWeight:800}}>₺{fp}</span>
                              {!soldOut && (inCart > 0 && !p.has_options ? (
                                <div style={{display:"flex",alignItems:"center",gap:6,background:"#000",borderRadius:20,padding:"3px 5px"}}>
                                  <button onClick={() => updateQty(cartIdx, -1)} style={{width:24,height:24,background:"transparent",color:"#fff",border:"none",fontSize:16,cursor:"pointer",fontWeight:700,padding:0}}>−</button>
                                  <span style={{color:"#fff",fontSize:12,fontWeight:800,minWidth:14,textAlign:"center"}}>{inCart}</span>
                                  <button onClick={() => updateQty(cartIdx, +1)} style={{width:24,height:24,background:"transparent",color:"#fff",border:"none",fontSize:16,cursor:"pointer",fontWeight:700,padding:0}}>+</button>
                                </div>
                              ) : (
                                <button onClick={() => onProductTap(p)} style={{width:30,height:30,flexShrink:0,background:"#fff",color:"#000",border:"2px solid #000",borderRadius:7,fontSize:19,fontWeight:900,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",padding:0,lineHeight:1}}>+</button>
                              ))}
                            </div>
                            {p.has_options && !soldOut && <div style={{fontSize:9,color:"#C8973E",fontWeight:700,letterSpacing:"0.4px"}}>{t.optional}</div>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {(custTab === "shop" || custTab === "blog") && (
            <>
              {postFeeds[custTab] === undefined && <div style={{textAlign:"center",color:"#888",padding:30,fontSize:13}}>...</div>}
              {postFeeds[custTab]?.length === 0 && !(custTab === "shop" && shopCats.length > 0) && (
                <div style={{textAlign:"center",color:"#888",padding:30,fontSize:13}}>
                  {L("Yakında ✨","Coming soon ✨","Скоро ✨")}
                </div>
              )}
              {(postFeeds[custTab] || []).map(p => {
                const Card = p.link_url ? "a" : "div";
                return (
                <Card key={p.id} {...(p.link_url ? { href: p.link_url, target: "_blank", rel: "noreferrer" } : {})}
                  style={{display:"block",textDecoration:"none",color:"#000",background:"#fafafa",border:"1px solid #eee",borderRadius:14,overflow:"hidden",marginBottom:14}}>
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
                    <div style={{fontSize:16,fontWeight:800,display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
                      <span>{postTitle(p)}</span>
                      {p.link_url && <span style={{fontSize:14,color:"#888",flexShrink:0}}>↗</span>}
                    </div>
                    {postBody(p) && <div style={{fontSize:13,color:"#444",marginTop:6,lineHeight:1.6,whiteSpace:"pre-wrap"}}>{postBody(p)}</div>}
                    {custTab === "shop" ? (
                      <div style={{display:"inline-block",marginTop:10,padding:"6px 12px",background:"#000",color:"#FFD700",borderRadius:10,fontSize:11,fontWeight:800}}>
                        💳 {L("Kasadan alabilirsin","Available at the counter","Можно купить на кассе")}
                      </div>
                    ) : (
                      <div style={{fontSize:10,color:"#999",marginTop:8}}>{new Date(p.created_at).toLocaleDateString(dateLocale,{day:"numeric",month:"long"})}</div>
                    )}
                  </div>
                </Card>
                );
              })}
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
        {productSections.map(sec => (
        <div key={sec.key}>
        {sec.title && (
          <div style={{fontSize:15,fontWeight:800,letterSpacing:"0.8px",color:"#000",textTransform:"uppercase",padding:"26px 0 4px"}}>{sec.title}</div>
        )}
        {sec.hours && (
          <div style={{fontSize:11,color:"#a0a0a0",fontWeight:600,padding:sec.title?"0 0 6px":"14px 0 6px"}}>
            🕐 {sec.hours} · {t.order_hours}
          </div>
        )}
        {sec.items.map(p => {
          const fp = calcPrice(p);
          const dis = fp < Number(p.price);
          const blocked = blockedInfo(p);
          const isFaded = !!blocked;
          const soldOut = p.sold_out_today;
          const cartIdx = cart.findIndex(c => c.product.id === p.id && !c.options);
          const inCart = cartIdx >= 0 ? cart[cartIdx].quantity : 0;
          return (
            <div key={p.id + "-" + p.category_id} style={{display:"flex",gap:12,padding:"14px 0",borderBottom:"1px solid #f0f0f0",opacity:soldOut||isFaded?0.45:1}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:15,fontWeight:700,color:"#000",lineHeight:1.3}}>{pName(p)}</div>
                {pDesc(p) && <div style={{fontSize:12,color:"#666",marginTop:3,lineHeight:1.4}}>{pDesc(p)}</div>}
                {blocked && (
                  <div style={{fontSize:11,color:"#C8973E",marginTop:3,fontWeight:600}}>
                    {blocked.window
                      ? `${hhmm(blocked.start)} – ${hhmm(blocked.end)} ${t.order_between}`
                      : `${hhmm(blocked.end)} – ${hhmm(blocked.start)} ${t.order_between}`}
                  </div>
                )}
                {p.show_prep_time && p.prep_time_minutes && <div style={{fontSize:12,color:"#888",marginTop:4,display:"flex",alignItems:"center",gap:4}}>⏱ <span>~{p.prep_time_minutes} {L("dk","min","мин")}</span></div>}
                {soldOut && <div style={{fontSize:11,color:"#c44",marginTop:4,fontWeight:600}}>{p.unavailable_reason || t.sold_out}</div>}
                {p.has_options && !soldOut && <div style={{fontSize:10,color:"#C8973E",marginTop:3,fontWeight:700,letterSpacing:"0.5px"}}>{t.optional}</div>}
                <div style={{display:"flex",alignItems:"center",gap:10,marginTop:8}}>
                  {dis && <span style={{fontSize:12,color:"#999",textDecoration:"line-through"}}>₺{p.price}</span>}
                  <span style={{fontSize:15,fontWeight:800,color:dis?"#C8973E":"#000"}}>₺{fp}</span>
                  {p.currency === "EUR" && p.price_eur != null && (
                    <span style={{fontSize:12,color:"#888",fontWeight:600}}>· €{Number(p.price_eur)}</span>
                  )}
                  {memberPriceFor(p) != null && memberPriceFor(p) <= fp && <span style={{fontSize:9,padding:"2px 6px",background:"#000",color:"#FFD700",borderRadius:6,fontWeight:800,letterSpacing:"0.5px"}}>{L("SANA ÖZEL","YOUR PRICE","ВАША ЦЕНА")}</span>}
                </div>
              </div>
              {!soldOut && !isFaded && (
                <div style={{display:"flex",alignItems:"center",flexShrink:0}}>
                  {inCart > 0 && !p.has_options ? (
                    <div style={{display:"flex",alignItems:"center",gap:8,background:"#000",borderRadius:24,padding:"4px 6px"}}>
                      <button onClick={() => updateQty(cartIdx, -1)} style={{width:28,height:28,background:"transparent",color:"#fff",border:"none",borderRadius:"50%",fontSize:18,cursor:"pointer",fontWeight:700}}>−</button>
                      <div style={{minWidth:18,textAlign:"center",color:"#fff",fontSize:14,fontWeight:800}}>{inCart}</div>
                      <button onClick={() => updateQty(cartIdx, +1)} style={{width:28,height:28,background:"transparent",color:"#fff",border:"none",borderRadius:"50%",fontSize:18,cursor:"pointer",fontWeight:700}}>+</button>
                    </div>
                  ) : (
                    <button onClick={() => onProductTap(p)} style={{width:36,height:36,flexShrink:0,background:"#fff",color:"#000",border:"2px solid #000",borderRadius:8,fontSize:22,cursor:"pointer",fontWeight:900,display:"flex",alignItems:"center",justifyContent:"center",padding:0,lineHeight:1}}>+</button>
                  )}
                </div>
              )}
            </div>
          );
        })}
        </div>
        ))}
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

      {profileOpen && customer && (
        <div onClick={() => setProfileOpen(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:120}}>
          <div onClick={e => e.stopPropagation()} style={{background:"#fff",borderRadius:"20px 20px 0 0",padding:"20px 18px 28px",width:"100%",maxWidth:520,maxHeight:"85vh",overflowY:"auto"}}>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16}}>
              {(profileStats?.cust?.avatar_url || customer.avatar_url) ? (
                <img src={profileStats?.cust?.avatar_url || customer.avatar_url} alt="" referrerPolicy="no-referrer" style={{width:48,height:48,borderRadius:"50%",objectFit:"cover"}}/>
              ) : (
                <div style={{width:48,height:48,borderRadius:"50%",background:"#000",color:"#FFD700",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,fontWeight:800}}>{(customer.name || "?")[0]}</div>
              )}
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:17,fontWeight:800}}>{profileStats?.cust?.name || customer.name}</div>
                <div style={{fontSize:11,color:"#888",overflow:"hidden",textOverflow:"ellipsis"}}>{profileStats?.cust?.email || customer.email}</div>
              </div>
              <span style={{fontSize:10,padding:"4px 10px",background:"#000",color:"#FFD700",borderRadius:10,fontWeight:800,letterSpacing:"0.5px"}}>⭐ {L("ÜYE","MEMBER","УЧАСТНИК")}</span>
            </div>

            {!profileStats ? (
              <div style={{textAlign:"center",color:"#888",padding:20,fontSize:13}}>...</div>
            ) : (
              <>
                {(profileStats.open?.length > 0 || Number(profileStats.cust?.outstanding_balance || 0) > 0) && (
                  <div style={{background:"#FFF8E8",border:"1px solid #EAD9AE",borderRadius:14,padding:"12px 14px",marginBottom:14}}>
                    {profileStats.open?.length > 0 && (<>
                      <div style={{fontSize:12,fontWeight:800,color:"#7a5c1e",marginBottom:8}}>
                        🧾 {L("Açık hesabın","Open tab","Открытый счёт")} — ₺{Math.round(profileStats.open.reduce((t,o)=>t+Number(o.total||0),0))}
                      </div>
                      {profileStats.open.map(o => (
                        <div key={o.id} style={{display:"flex",justifyContent:"space-between",fontSize:12,color:"#6b5a2e",padding:"3px 0"}}>
                          <span>{new Date(o.created_at).toLocaleDateString(dateLocale,{day:"numeric",month:"short"})} · {new Date(o.created_at).toLocaleTimeString("tr-TR",{hour:"2-digit",minute:"2-digit"})}</span>
                          <span style={{fontWeight:700}}>₺{Math.round(Number(o.total||0))}</span>
                        </div>
                      ))}
                      <div style={{fontSize:11,color:"#9a8148",marginTop:6,lineHeight:1.5}}>
                        {L("Kasada ödenince kapanır ve puanların işlenir.","Closes when paid at the counter — that's when your points land.","Закрывается при оплате на кассе — тогда начислятся баллы.")}
                      </div>
                    </>)}
                    {Number(profileStats.cust?.outstanding_balance || 0) > 0 && (
                      <div style={{fontSize:12,fontWeight:700,color:"#a04040",marginTop:profileStats.open?.length?8:0}}>
                        📝 {L("Borç","Balance due","Долг")}: ₺{Math.round(Number(profileStats.cust.outstanding_balance))}
                      </div>
                    )}
                  </div>
                )}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:14}}>
                  <div style={{background:"#f7f7f7",borderRadius:12,padding:"12px 8px",textAlign:"center"}}>
                    <div style={{fontSize:20,fontWeight:800}}>{profileStats.orders}</div>
                    <div style={{fontSize:10,color:"#888",fontWeight:700}}>{L("SİPARİŞ","ORDERS","ЗАКАЗЫ")}</div>
                  </div>
                  <div style={{background:"#f7f7f7",borderRadius:12,padding:"12px 8px",textAlign:"center"}}>
                    <div style={{fontSize:20,fontWeight:800}}>₺{Math.round(profileStats.totalSpent)}</div>
                    <div style={{fontSize:10,color:"#888",fontWeight:700}}>{L("HARCAMA","SPENT","ПОТРАЧЕНО")}</div>
                  </div>
                  <div style={{background:"#111",color:"#FFD700",borderRadius:12,padding:"12px 8px",textAlign:"center"}}>
                    <div style={{fontSize:20,fontWeight:800}}>🪙 {Number(profileStats.cust?.points || 0)}</div>
                    <div style={{fontSize:10,color:"#bfa14a",fontWeight:700}}>{L("PUAN = ₺" + Number(profileStats.cust?.points || 0),"PTS = ₺" + Number(profileStats.cust?.points || 0),"= ₺" + Number(profileStats.cust?.points || 0))}</div>
                  </div>
                </div>

                {(() => {
                  // Seviye toplam harcamadan; cuzdan (puan) ayri gosterilir
                  const pts = Number(profileStats.cust?.total_spent || 0);
                  const cur = [...TIERS].reverse().find(t => pts >= t.min) || TIERS[0];
                  const next = TIERS.find(t => t.min > pts);
                  const pct = next ? Math.min(100, Math.round(((pts - cur.min) / (next.min - cur.min)) * 100)) : 100;
                  return (
                    <div style={{background:"#111",color:"#fff",borderRadius:14,padding:"14px 16px",marginBottom:14}}>
                      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:next?8:0}}>
                        <span style={{fontSize:15,fontWeight:800}}>{cur.icon} {L(cur.tr, cur.en, cur.ru)}</span>
                        <span style={{fontSize:11,color:"#bbb"}}>₺{Math.round(pts).toLocaleString("tr-TR")}</span>
                      </div>
                      {next && (<>
                        <div style={{height:6,background:"#333",borderRadius:4,overflow:"hidden"}}>
                          <div style={{width:pct+"%",height:"100%",background:"#E0AB4A"}}/>
                        </div>
                        <div style={{fontSize:11,color:"#bbb",marginTop:6}}>
                          {L("₺" + Math.round(next.min - pts).toLocaleString("tr-TR") + " sonra " + next.icon + " " + next.tr,
                             "₺" + Math.round(next.min - pts).toLocaleString("tr-TR") + " to " + next.icon + " " + next.en,
                             "ещё ₺" + Math.round(next.min - pts).toLocaleString("tr-TR") + " до " + next.icon + " " + next.ru)}
                        </div>
                      </>)}
                    </div>
                  );
                })()}

                {profileStats.top.length > 0 && (
                  <div style={{marginBottom:14}}>
                    <div style={{fontSize:10,color:"#888",letterSpacing:"1.5px",fontWeight:700,marginBottom:6}}>{L("EN ÇOK ALDIKLARIN","YOUR FAVOURITES","ВАШИ ЛЮБИМЫЕ")}</div>
                    {profileStats.top.map(([n, q]) => (
                      <div key={n} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:"1px solid #f0f0f0",fontSize:13}}>
                        <span style={{fontWeight:600}}>{n}</span><span style={{color:"#888"}}>×{q}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{marginBottom:14}}>
                  <div style={{fontSize:10,color:"#888",letterSpacing:"1.5px",fontWeight:700,marginBottom:6}}>{L("SANA ÖZEL FİYATLAR","YOUR MEMBER PRICES","ВАШИ ЦЕНЫ")}</div>
                  {Object.keys(memberDiscounts).length === 0 ? (
                    <div style={{fontSize:12,color:"#999"}}>{L("Henüz tanımlı fiyatın yok","No special prices yet","Особых цен пока нет")}</div>
                  ) : (
                    Object.keys(memberDiscounts).map(pid => {
                      const p = products.find(x => x.id === pid);
                      if (!p) return null;
                      const mp = memberPriceFor(p);
                      return (
                        <div key={pid} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 0",borderBottom:"1px solid #f0f0f0",fontSize:13}}>
                          <span style={{fontWeight:600}}>{pName(p)}</span>
                          <span>
                            <span style={{color:"#999",textDecoration:"line-through",marginRight:8}}>₺{Math.round(Number(p.price))}</span>
                            <span style={{color:"#1a7f37",fontWeight:800}}>₺{mp}</span>
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>

              </>
            )}

            <div style={{display:"flex",gap:8,marginTop:6}}>
              <button onClick={() => setProfileOpen(false)} style={{flex:2,padding:"13px",background:"#000",color:"#fff",border:"none",borderRadius:12,fontSize:14,fontWeight:700,cursor:"pointer"}}>{L("Kapat","Close","Закрыть")}</button>
              <button onClick={async () => { await signOut(); setProfileOpen(false); }} style={{flex:1,padding:"13px",background:"#fff",color:"#c44",border:"1px solid #eee",borderRadius:12,fontSize:13,fontWeight:700,cursor:"pointer"}}>{L("Çıkış","Sign out","Выйти")}</button>
            </div>
          </div>
        </div>
      )}

      {optModal && (
        <div onClick={() => setOptModal(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:100}}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:"18px 18px 0 0",padding:20,width:"100%",maxWidth:500,maxHeight:"85vh",overflowY:"auto"}}>
            <div style={{fontSize:20,fontWeight:800,marginBottom:4}}>{pName(optModal)}</div>
            <div style={{fontSize:13,color:"#666",marginBottom:18}}>₺{calcPrice(optModal, optSelected)}</div>
            {(optModal.options_config?.groups || []).map(group => (
              <div key={group.name} style={{marginBottom:14}}>
                <div style={{fontSize:11,color:"#333",letterSpacing:"1px",fontWeight:700,marginBottom:6}}>
                  {optT(group.name)?.toUpperCase()}{group.required && <span style={{color:"#c44",marginLeft:4}}>*</span>}
                  {group.multi && <span style={{color:"#999",fontWeight:600,marginLeft:6}}>· {t.multi_select}</span>}
                </div>
                <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                  {(group.options || []).map(opt => {
                    // Fiyat farki secenek ustunde gorunur — musteri sepette surprizle karsilasmasin
                    const pm = Number(group.price_modifiers?.[opt] || 0);
                    const sel = group.multi ? (optSelected[group.name]||[]).includes(opt) : optSelected[group.name]===opt;
                    return (
                    <button key={opt} onClick={()=>setOptSelected(group.multi?{...optSelected,[group.name]:((optSelected[group.name]||[]).includes(opt)?(optSelected[group.name]||[]).filter(x=>x!==opt):[...(optSelected[group.name]||[]),opt])}:{...optSelected,[group.name]:opt})} style={{padding:"10px 14px",background:sel?"#000":"#f2f2f2",color:sel?"#fff":"#333",border:"none",borderRadius:10,fontSize:13,fontWeight:700,cursor:"pointer"}}>
                      {optT(opt)}
                      {pm !== 0 && <span style={{fontSize:11,fontWeight:800,marginLeft:5,color:sel?"#E0AB4A":"#a3781f"}}>{pm > 0 ? "+" : "−"}₺{Math.abs(pm)}</span>}
                    </button>
                    );
                  })}
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
            {takeawayLines.length > 1 && (
              <button onClick={() => setAllTakeaway(!allTakeaway)}
                style={{width:"100%",marginBottom:10,padding:"11px",background:allTakeaway?"#000":"#f7f7f7",color:allTakeaway?"#fff":"#444",
                        border:"1px solid "+(allTakeaway?"#000":"#e6e6e6"),borderRadius:12,fontSize:13,fontWeight:800,cursor:"pointer",fontFamily:"inherit"}}>
                {allTakeaway ? "✓ " : ""}🥤 {t.takeaway_all}
              </button>
            )}
            {cart.map((c, idx) => (
              <div key={idx} style={{display:"flex",alignItems:"center",gap:10,padding:"12px 0",borderBottom:"1px solid #f0f0f0"}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:14,fontWeight:700}}>{pName(c.product)}</div>
                  {c.options && <div style={{fontSize:11,color:"#C8973E",marginTop:2,fontWeight:600}}>{Object.values(c.options).flat().map(optT).join(" · ")}</div>}
                  {c.note && <div style={{fontSize:11,color:"#666",fontStyle:"italic",marginTop:2}}>{c.note}</div>}
                  <div style={{fontSize:12,color:"#555",marginTop:3}}>
                    {calcPrice(c.product, c.options) < listPrice(c.product, c.options) && (
                      <span style={{color:"#aaa",textDecoration:"line-through",marginRight:5}}>₺{listPrice(c.product, c.options)}</span>
                    )}
                    ₺{calcPrice(c.product, c.options)} × {c.quantity} = ₺{calcPrice(c.product, c.options) * c.quantity}
                  </div>
                  {canTakeaway(c.product) && (
                    <button onClick={() => toggleTakeaway(idx)}
                      style={{marginTop:6,padding:"6px 12px",background:c.takeaway?"#000":"#f2f2f2",color:c.takeaway?"#fff":"#666",
                              border:"1px solid "+(c.takeaway?"#000":"#e0e0e0"),borderRadius:20,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                      {c.takeaway ? "✓ " : ""}🥤 {t.takeaway}
                    </button>
                  )}
                </div>
                <div style={{display:"flex",alignItems:"center",gap:6,background:"#f2f2f2",borderRadius:20,padding:"3px 5px"}}>
                  <button onClick={() => updateQty(idx, -1)} style={{width:26,height:26,background:"transparent",color:"#000",border:"none",borderRadius:"50%",fontSize:16,cursor:"pointer",fontWeight:700}}>−</button>
                  <div style={{minWidth:18,textAlign:"center",fontSize:13,fontWeight:800}}>{c.quantity}</div>
                  <button onClick={() => updateQty(idx, +1)} style={{width:26,height:26,background:"transparent",color:"#000",border:"none",borderRadius:"50%",fontSize:16,cursor:"pointer",fontWeight:700}}>+</button>
                </div>
              </div>
            ))}
            {(!table || table.shared) && (
              <div style={{marginTop:14}}>
                <div style={{fontSize:11,color:"#333",letterSpacing:"1px",fontWeight:700,marginBottom:6}}>{table?.shared ? t.shared_name : t.your_name}</div>
                <input value={customerName} onChange={e=>setCustomerName(e.target.value)} placeholder={t.name_placeholder} style={{width:"100%",padding:"12px 14px",background:"#f7f7f7",border:"1px solid #eee",borderRadius:10,fontSize:14,outline:"none",fontFamily:"inherit"}}/>
              </div>
            )}
            <div style={{marginTop:14}}>
              <div style={{fontSize:11,color:"#333",letterSpacing:"1px",fontWeight:700,marginBottom:6}}>{t.order_note_label}</div>
              <textarea value={orderNote} onChange={e=>setOrderNote(e.target.value)} placeholder={t.order_note_placeholder} rows={2} style={{width:"100%",padding:"12px 14px",background:"#f7f7f7",border:"1px solid #eee",borderRadius:10,fontSize:14,outline:"none",fontFamily:"inherit",resize:"vertical"}}/>
            </div>
            {customer && walletBalance > 0 && (
              <button onClick={() => setUsePoints(!usePoints)}
                style={{width:"100%",marginTop:14,padding:"12px 14px",display:"flex",justifyContent:"space-between",alignItems:"center",
                        background:usePoints?"#111":"#FFF8E8",color:usePoints?"#FFD700":"#7a5c1e",
                        border:"1px solid "+(usePoints?"#111":"#EAD9AE"),borderRadius:12,fontSize:13,fontWeight:800,cursor:"pointer",fontFamily:"inherit"}}>
                <span>{usePoints ? "✓ " : ""}🪙 {t.pay_with_points}</span>
                <span>{walletBalance} {L("puan","pts","б.")} = ₺{walletBalance}</span>
              </button>
            )}
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:16,padding:"14px 0",borderTop:"2px solid #000"}}>
              <div style={{fontSize:13,color:"#333",letterSpacing:"1px",fontWeight:700}}>{t.total}</div>
              <div style={{fontSize:22,fontWeight:800}}>₺{cartTotal}</div>
            </div>
            {customer && usePoints && walletBalance > 0 && (() => {
              const kullanilacak = Math.min(walletBalance, cartTotal);
              return (
                <div style={{display:"flex",flexDirection:"column",gap:4,marginTop:-8,marginBottom:4,fontSize:13}}>
                  <div style={{display:"flex",justifyContent:"space-between",color:"#a3781f",fontWeight:700}}>
                    <span>🪙 {t.points_applied}</span><span>−₺{kullanilacak}</span>
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",fontWeight:800}}>
                    <span>{t.to_pay_at_register}</span><span>₺{cartTotal - kullanilacak}</span>
                  </div>
                  <div style={{fontSize:11,color:"#999"}}>{t.points_note}</div>
                </div>
              );
            })()}
            {(() => {
              // Isim yazilmadan siparis butonu calismaz (masasiz / ortak masa)
              const nameOk = (table && !table.shared) || !!(customerName.trim() || customer?.name);
              return (
                <button onClick={submitOrder} disabled={submitting || !nameOk} style={{width:"100%",marginTop:14,padding:"16px",background:nameOk?"#C8973E":"#ddd",color:nameOk?"#000":"#999",border:"none",borderRadius:14,fontSize:15,fontWeight:800,cursor:nameOk?"pointer":"not-allowed",opacity:submitting?0.6:1}}>
                  {submitting ? t.submitting : nameOk ? t.submit_order : t.please_enter_name}
                </button>
              );
            })()}
            <div style={{textAlign:"center",fontSize:11,color:"#888",marginTop:10}}>
              {table && !table.shared ? t.waiter_will_bring : t.notif_promise}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
