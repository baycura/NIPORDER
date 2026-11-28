// Personel panelinin TEK menu tanimi: alt bar, masaustu kenar menusu ve
// MENU merkezi (HubPage) hep buradan beslenir. Bir sayfa eklerken yalniz
// buraya yazilir — eski cekmecede Merch'in hic listelenmemesi gibi "menusuz
// sayfa" kazalari boyle onlenir.
//
// Gorunurluk kurallari App.jsx'teki PrivateRoute'larla birebir ayni olmali:
// rota erisimi degisirse burasi da degismeli, yoksa kullanici tiklayip
// yonlendirmeyle geri dusen kart gorur.
//
// icon: components/Ikon.jsx setindeki ad. Emoji YAZMA — emoji her cihazda
// baska cizilir ve paletin disina duser. Yeni bir ad gerekiyorsa once
// Ikon.jsx'e cizimi eklenir.
//
// ozellik: sayfa bir modulun parcasiysa modulun adi (lib/profil.js). Kapali
// profilde menuden dusmesi icin — baska isletme kurulumunda Shopify, parti,
// surus gibi NIP'e ozel sayfalar gorunmez.
import { ozellik } from "./profil.js";

export const GRUPLAR = [
  {
    ad: "GÜNLÜK İŞLER",
    items: [
      { to: "/tables",   icon: "masa", label: "Masalar",   deny: ["viewer"] },
      { to: "/orders",   icon: "siparis", label: "Sipariş",   deny: ["viewer"] },
      { to: "/kitchen",  icon: "mutfak", label: "Mutfak",    deny: ["viewer", "parttime"] },
      { to: "/payment",  icon: "kasa", label: "Kasa",      deny: ["viewer"] },
      { to: "/cash-count", icon: "nakit", label: "Kasa Sayımı", deny: ["viewer", "kitchen"] },
      { to: "/myshift",  icon: "vardiya", label: "Vardiyam",  deny: ["viewer"] },
      { to: "/stock",    icon: "stok", label: "Stok",      deny: ["parttime"] },
      { to: "/stock-count", icon: "sayim", label: "Stok Sayımı", deny: ["viewer", "kitchen", "parttime"] },
      { to: "/expenses", icon: "gider", label: "Giderler" },
      { to: "/invoices", icon: "fatura", label: "Faturalar", deny: ["viewer", "parttime"] },
      { to: "/tasks",    icon: "gorev", label: "Görevler",  deny: ["viewer", "parttime"] },
    ],
  },
  {
    ad: "MENÜ & ÜRÜNLER", manager: true,
    items: [
      // yetki: yonetici olmayan, bu ek yetkiyle (staff.yetkiler) karti gorur;
      // darLabel o kisiye yazilan addir (sayfa onda dar acilir).
      { to: "/menu-mgmt",         icon: "menu", label: "Menü Yönetimi", yetki: "menu_fiyat", darLabel: "Ürün Ekle · Fiyat" },
      { to: "/party-menu",        icon: "kampanya", label: "Parti Menüsü", ozellik: "parti" },
      { to: "/recipes",           icon: "recete", label: "Reçeteler" },
      { to: "/stock-mgmt",        icon: "arsiv", label: "Stok Yönetimi" },
      { to: "/product-stock",     icon: "stok", label: "Ürün Stoku" },
      { to: "/costs",             icon: "gider", label: "Eksik Maliyetler" },
      { to: "/retail",            icon: "raf", label: "Ürünler (Raf)", ozellik: "raf" },
      // Konsinye hesaplari: yoneticiler de gorur (odendi yalniz sahip)
      { to: "/konsinye",          icon: "raf", label: "Konsinye Hesabı" },
      // Merch sayfasi menuden kaldirildi: merch_products tisortlerin hicbir
      // yere bagli olmayan kopyasiydi (kasa/Shop/sayim products'a bakar), oraya
      // girilen stok kayboluyordu. Rota duruyor, menuden ulasilmiyor.
      { to: "/category-schedule", icon: "saat", label: "Kategori Saatleri" },
    ],
  },
  {
    ad: "ÜYELER & KAMPANYA", manager: true,
    items: [
      { to: "/members",    icon: "uye", label: "Üyeler & Borç", ozellik: "uyeBorc" },
      { to: "/happy-hour", icon: "kampanya", label: "Happy Hour", ozellik: "happyHour" },
      { to: "/polls",      icon: "oylama", label: "Oylamalar", ozellik: "oylama" },
      { to: "/rides",      icon: "surus", label: "Sürüşler", ozellik: "surus" },
      // Rezervasyon sitesi ayri projede calismaya devam ediyor; bu sayfa ona
      // sahibin kendi yetkisiyle baglanir (lib/reserve.js). Yazma yetkisi
      // RESERVE'deki profiles.is_admin'e bagli — menu goruntusu manager, yetki
      // o tarafta.
      { to: "/reserve",    icon: "etkinlik", label: "Rezervasyon", ozellik: "rezervasyon" },
      { to: "/content",    icon: "blog", label: "Vitrin & Blog", ozellik: "icerik" },
    ],
  },
  {
    ad: "PARA & PERSONEL", admin: true, sari: true,
    items: [
      { to: "/reports",        icon: "rapor", label: "Raporlar" },
      { to: "/sales",          icon: "sepet", label: "Satış Raporu" },
      { to: "/profit",         icon: "puan", label: "Ürün Kârlılığı" },
      { to: "/cash-history",   icon: "takvim", label: "Kasa Geçmişi" },
      { to: "/shifts",         icon: "takvim", label: "Vardiyalar" },
      { to: "/discounts",      icon: "kampanya", label: "İndirim ve ikram" },
      { to: "/corrections",    icon: "cop", label: "İptal & Düzeltme" },
      { to: "/settlement",     icon: "mutfakodeme", label: "Mutfağa Ödenecek", ozellik: "mutfakHakedis" },
      { to: "/fixed-expenses", icon: "kilit", label: "Sabit Giderler" },
      { to: "/staff-mgmt",     icon: "personel", label: "Personel" },
    ],
  },
  {
    ad: "SİSTEM", manager: true,
    items: [
      { to: "/tables-mgmt",     icon: "plan", label: "Masa Yönetimi" },
      { to: "/qr-codes",        icon: "qr", label: "QR Kodlar" },
      { to: "/settings",        icon: "ayar", label: "Ayarlar" },
      { to: "/kitchen-display", icon: "ekran", label: "Mutfak Ekranı (Tablet)", external: true },
    ],
  },
];

// Gozlemci (aile) kendi kucuk dunyasinda: 3 sayfa, degismedi
// kisa: YALNIZ telefondaki alt barda yazilan ad ("MUTFAĞA ÖDENECEK" 360px'te
// tasiyordu). Menu sayfasi ve kenar menusu tam label'i kullanir.
const VIEWER_GRUP = [{
  ad: "GÖRÜNÜM",
  items: [
    { to: "/reports",    icon: "rapor", label: "Raporlar", kisa: "Rapor" },
    { to: "/sales",      icon: "sepet", label: "Satış Raporu", kisa: "Satış" },
    { to: "/settlement", icon: "mutfakodeme", label: "Mutfağa Ödenecek", kisa: "Mutfak", ozellik: "mutfakHakedis" },
    { to: "/expenses",   icon: "gider", label: "Giderler", kisa: "Gider" },
    { to: "/stock",      icon: "stok", label: "Stok", kisa: "Stok" },
  ],
}];

const profildeVar = (i) => ozellik(i.ozellik);

// yetkiler: staff.yetkiler (ek yetkiler). Grubu goremeyen kisi, o grubun
// yalniz kendi ek yetkisine bagli kartlarini gorur (App.jsx'teki
// PrivateRoute yetki= ile ayni kural).
export function gorunurGruplar({ role, isManager, isAdmin, isViewer, yetkiler = [] }) {
  if (isViewer) return VIEWER_GRUP.map(g => ({ ...g, items: g.items.filter(profildeVar) }));
  const ekYetkili = (i) => !!i.yetki && yetkiler.includes(i.yetki);
  return GRUPLAR
    .map(g => {
      const grupAcik = (!g.manager || isManager) && (!g.admin || isAdmin);
      const items = g.items
        .filter(i => grupAcik || ekYetkili(i))
        .filter(i => !(i.deny || []).includes(role)).filter(profildeVar)
        .map(i => (!grupAcik && i.darLabel) ? { ...i, label: i.darLabel } : i);
      return { ...g, items };
    })
    .filter(g => g.items.length > 0);
}

// Alt bar: 5 yuva. BUGUN ve MENU sabit fikirdir; aradakiler rol varsayilani.
// (Kisisellestirme — basili tutup sabitleme — bilerek sonraki surume birakildi.)
export function altBar({ isManager, isAdmin, isViewer, isParttime }) {
  if (isViewer) return VIEWER_GRUP[0].items.filter(profildeVar);
  if (isParttime) return [
    { to: "/tables",   icon: "masa", label: "Masalar" },
    { to: "/orders",   icon: "siparis", label: "Sipariş" },
    { to: "/payment",  icon: "kasa", label: "Kasa" },
    { to: "/expenses", icon: "gider", label: "Giderler" },
    // Parttime'in alt barinda /hub yok — gorunurGruplar yalniz masaustu
    // kenar menusunde ve HubPage'de render ediliyor (StaffLayout.jsx:115).
    // Kapanisi fiilen yapan kisi bu; sayima baska yoldan ulasamaz.
    // Ek yetkili part-time (staff.yetkiler) kartina sag ustteki ad
    // dugmesiyle acilan Menü'den (HubPage) ulasir; alt bar degismez.
    { to: "/cash-count", icon: "nakit", label: "Sayım" },
  ];
  if (isManager) return [
    { to: "/today",   icon: "ev", label: "Bugün" },
    { to: "/tables",  icon: "masa", label: "Masalar" },
    { to: "/payment", icon: "kasa", label: "Kasa" },
    isAdmin ? { to: "/reports", icon: "rapor", label: "Rapor" }
            : { to: "/orders",  icon: "siparis", label: "Sipariş" },
    { to: "/hub",     icon: "hamburger", label: "Menü" },
  ];
  return [
    { to: "/tables",  icon: "masa", label: "Masalar" },
    { to: "/orders",  icon: "siparis", label: "Sipariş" },
    { to: "/payment", icon: "kasa", label: "Kasa" },
    { to: "/kitchen", icon: "mutfak", label: "Mutfak" },
    { to: "/hub",     icon: "hamburger", label: "Menü" },
  ];
}
