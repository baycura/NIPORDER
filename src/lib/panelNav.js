// Personel panelinin TEK menu tanimi: alt bar, masaustu kenar menusu ve
// MENU merkezi (HubPage) hep buradan beslenir. Bir sayfa eklerken yalniz
// buraya yazilir — eski cekmecede Merch'in hic listelenmemesi gibi "menusuz
// sayfa" kazalari boyle onlenir.
//
// Gorunurluk kurallari App.jsx'teki PrivateRoute'larla birebir ayni olmali:
// rota erisimi degisirse burasi da degismeli, yoksa kullanici tiklayip
// yonlendirmeyle geri dusen kart gorur.

export const GRUPLAR = [
  {
    ad: "GÜNLÜK İŞLER",
    items: [
      { to: "/tables",   icon: "🪑", label: "Masalar",   deny: ["viewer"] },
      { to: "/orders",   icon: "📋", label: "Sipariş",   deny: ["viewer"] },
      { to: "/kitchen",  icon: "🍳", label: "Mutfak",    deny: ["viewer", "parttime"] },
      { to: "/payment",  icon: "💰", label: "Kasa",      deny: ["viewer"] },
      { to: "/myshift",  icon: "⏱",  label: "Vardiyam",  deny: ["viewer", "parttime"] },
      { to: "/stock",    icon: "📦", label: "Stok",      deny: ["parttime"] },
      { to: "/expenses", icon: "💸", label: "Giderler" },
      { to: "/invoices", icon: "🧾", label: "Faturalar", deny: ["viewer", "parttime"] },
      { to: "/tasks",    icon: "✅", label: "Görevler",  deny: ["viewer", "parttime"] },
    ],
  },
  {
    ad: "MENÜ & ÜRÜNLER", manager: true,
    items: [
      { to: "/menu-mgmt",         icon: "🍽",  label: "Menü Yönetimi" },
      { to: "/recipes",           icon: "📝", label: "Reçeteler" },
      { to: "/stock-mgmt",        icon: "🗃",  label: "Stok Yönetimi" },
      { to: "/retail",            icon: "🛍",  label: "Ürünler (Raf)" },
      { to: "/merch-mgmt",        icon: "👕", label: "Merch" },
      { to: "/category-schedule", icon: "⏰", label: "Kategori Saatleri" },
    ],
  },
  {
    ad: "ÜYELER & KAMPANYA", manager: true,
    items: [
      { to: "/members",    icon: "🌟", label: "Üyeler & Borç" },
      { to: "/happy-hour", icon: "🎉", label: "Happy Hour" },
      { to: "/polls",      icon: "🗳",  label: "Oylamalar" },
      { to: "/content",    icon: "📰", label: "Vitrin & Blog" },
    ],
  },
  {
    ad: "PARA & PERSONEL", admin: true, sari: true,
    items: [
      { to: "/reports",        icon: "📈", label: "Raporlar" },
      { to: "/settlement",     icon: "🥙", label: "Mutfağa Ödenecek" },
      { to: "/fixed-expenses", icon: "🔒", label: "Sabit Giderler" },
      { to: "/staff-mgmt",     icon: "👥", label: "Personel" },
    ],
  },
  {
    ad: "SİSTEM", manager: true,
    items: [
      { to: "/tables-mgmt",     icon: "🛠",  label: "Masa Yönetimi" },
      { to: "/qr-codes",        icon: "📱", label: "QR Kodlar" },
      { to: "/settings",        icon: "⚙",   label: "Ayarlar" },
      { to: "/kitchen-display", icon: "📺", label: "Mutfak Ekranı (Tablet)", external: true },
    ],
  },
];

// Gozlemci (aile) kendi kucuk dunyasinda: 3 sayfa, degismedi
const VIEWER_GRUP = [{
  ad: "GÖRÜNÜM",
  items: [
    { to: "/reports",    icon: "📈", label: "Raporlar" },
    { to: "/settlement", icon: "🥙", label: "Mutfağa Ödenecek" },
    { to: "/expenses",   icon: "💸", label: "Giderler" },
    { to: "/stock",      icon: "📦", label: "Stok" },
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
    { to: "/tables",   icon: "🪑", label: "Masalar" },
    { to: "/orders",   icon: "📋", label: "Sipariş" },
    { to: "/payment",  icon: "💰", label: "Kasa" },
    { to: "/expenses", icon: "💸", label: "Giderler" },
  ];
  if (isManager) return [
    { to: "/today",   icon: "🏠", label: "Bugün" },
    { to: "/tables",  icon: "🪑", label: "Masalar" },
    { to: "/payment", icon: "💰", label: "Kasa" },
    isAdmin ? { to: "/reports", icon: "📈", label: "Rapor" }
            : { to: "/orders",  icon: "📋", label: "Sipariş" },
    { to: "/hub",     icon: "☰",  label: "Menü" },
  ];
  return [
    { to: "/tables",  icon: "🪑", label: "Masalar" },
    { to: "/orders",  icon: "📋", label: "Sipariş" },
    { to: "/payment", icon: "💰", label: "Kasa" },
    { to: "/kitchen", icon: "🍳", label: "Mutfak" },
    { to: "/hub",     icon: "☰",  label: "Menü" },
  ];
}
