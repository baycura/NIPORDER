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

export const GRUPLAR = [
  {
    ad: "GÜNLÜK İŞLER",
    items: [
      { to: "/tables",   icon: "masa", label: "Masalar",   deny: ["viewer"] },
      { to: "/orders",   icon: "siparis", label: "Sipariş",   deny: ["viewer"] },
      { to: "/kitchen",  icon: "mutfak", label: "Mutfak",    deny: ["viewer", "parttime"] },
      { to: "/payment",  icon: "kasa", label: "Kasa",      deny: ["viewer"] },
      { to: "/cash-count", icon: "nakit", label: "Kasa Sayımı", deny: ["viewer", "kitchen"] },
      { to: "/myshift",  icon: "vardiya", label: "Vardiyam",  deny: ["viewer", "parttime"] },
      { to: "/stock",    icon: "stok", label: "Stok",      deny: ["parttime"] },
      { to: "/expenses", icon: "gider", label: "Giderler" },
      { to: "/invoices", icon: "fatura", label: "Faturalar", deny: ["viewer", "parttime"] },
      { to: "/tasks",    icon: "gorev", label: "Görevler",  deny: ["viewer", "parttime"] },
    ],
  },
  {
    ad: "MENÜ & ÜRÜNLER", manager: true,
    items: [
      { to: "/menu-mgmt",         icon: "menu", label: "Menü Yönetimi" },
      { to: "/recipes",           icon: "recete", label: "Reçeteler" },
      { to: "/stock-mgmt",        icon: "arsiv", label: "Stok Yönetimi" },
      { to: "/costs",             icon: "gider", label: "Eksik Maliyetler" },
      { to: "/retail",            icon: "raf", label: "Ürünler (Raf)" },
      { to: "/merch-mgmt",        icon: "merch", label: "Merch" },
      { to: "/category-schedule", icon: "saat", label: "Kategori Saatleri" },
    ],
  },
  {
    ad: "ÜYELER & KAMPANYA", manager: true,
    items: [
      { to: "/members",    icon: "uye", label: "Üyeler & Borç" },
      { to: "/happy-hour", icon: "kampanya", label: "Happy Hour" },
      { to: "/polls",      icon: "oylama", label: "Oylamalar" },
      { to: "/content",    icon: "blog", label: "Vitrin & Blog" },
    ],
  },
  {
    ad: "PARA & PERSONEL", admin: true, sari: true,
    items: [
      { to: "/reports",        icon: "rapor", label: "Raporlar" },
      { to: "/profit",         icon: "puan", label: "Ürün Kârlılığı" },
      { to: "/cash-history",   icon: "takvim", label: "Kasa Geçmişi" },
      { to: "/shifts",         icon: "takvim", label: "Vardiyalar" },
      { to: "/settlement",     icon: "mutfakodeme", label: "Mutfağa Ödenecek" },
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
const VIEWER_GRUP = [{
  ad: "GÖRÜNÜM",
  items: [
    { to: "/reports",    icon: "rapor", label: "Raporlar" },
    { to: "/settlement", icon: "mutfakodeme", label: "Mutfağa Ödenecek" },
    { to: "/expenses",   icon: "gider", label: "Giderler" },
    { to: "/stock",      icon: "stok", label: "Stok" },
  ],
}];

export function gorunurGruplar({ role, isManager, isAdmin, isViewer }) {
  if (isViewer) return VIEWER_GRUP;
  return GRUPLAR
    .filter(g => (!g.manager || isManager) && (!g.admin || isAdmin))
    .map(g => ({ ...g, items: g.items.filter(i => !(i.deny || []).includes(role)) }))
    .filter(g => g.items.length > 0);
}

// Alt bar: 5 yuva. BUGUN ve MENU sabit fikirdir; aradakiler rol varsayilani.
// (Kisisellestirme — basili tutup sabitleme — bilerek sonraki surume birakildi.)
export function altBar({ isManager, isAdmin, isViewer, isParttime }) {
  if (isViewer) return VIEWER_GRUP[0].items;
  if (isParttime) return [
    { to: "/tables",   icon: "masa", label: "Masalar" },
    { to: "/orders",   icon: "siparis", label: "Sipariş" },
    { to: "/payment",  icon: "kasa", label: "Kasa" },
    { to: "/expenses", icon: "gider", label: "Giderler" },
    // Parttime'in alt barinda /hub yok — gorunurGruplar yalniz masaustu
    // kenar menusunde ve HubPage'de render ediliyor (StaffLayout.jsx:115).
    // Kapanisi fiilen yapan kisi bu; sayima baska yoldan ulasamaz.
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
