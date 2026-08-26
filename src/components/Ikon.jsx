// Ikon — uygulamanin cizgi ikon seti.
//
// Emojiler yerine tek bir set: her ikon 24x24 kutuda, 1.8 kalinlikta,
// yuvarlak uclu, currentColor ile cizilir. Boyle olunca ikon icinde
// bulundugu metnin rengini ve kalinligini alir — koyu personel panelinde
// beyaz, acik musteri menusunde siyah gorunur; ayri bir renk gecmeye
// gerek kalmaz.
//
// Neden emoji degil:
//   - Emoji her cihazda baska cizilir (Apple/Android/Windows uc ayri set),
//     bir kismi renkli bir kismi degil; ekran hicbir zaman ayni gorunmez.
//   - Emoji renkleri paletin disinda kalir, tasarimi dagitir.
//   - Kucuk boyda (16-20px) emoji detaylari lapa olur, cizgi ikon okunur.
//
// Kullanim:  <Ikon ad="masa" />            varsayilan 20px
//            <Ikon ad="kasa" boy={26} />   alt bar gibi buyuk yerlerde
//            <Ikon ad="uyari" style={{color:"#C87A6A"}} />
//
// Bilincli olarak DEGISMEYENLER: telefon kodlarindaki ulke bayraklari
// (lib/phoneCodes.js) ve veritabanindan gelen kategori/gider ikonlari —
// onlar veri, arayuz degil.

const CIZ = {
  // — Gunluk isler —
  masa: <><ellipse cx="12" cy="7.4" rx="8" ry="2.6" /><path d="M4 7.4v1.2c0 1.5 3.6 2.6 8 2.6s8-1.1 8-2.6V7.4" /><path d="M12 11.2v7.2" /><path d="M7.6 20.4h8.8" /></>,
  siparis: <><path d="M9 3.5h6v3.2H9z" /><path d="M15 5.1h2.2a1.8 1.8 0 0 1 1.8 1.8v11.8a1.8 1.8 0 0 1-1.8 1.8H6.8A1.8 1.8 0 0 1 5 18.7V6.9a1.8 1.8 0 0 1 1.8-1.8H9" /><path d="M8.8 11h6.4M8.8 15h4.4" /></>,
  mutfak: <><path d="M2.6 10.6h13.2v1.1a6.6 6.6 0 0 1-13.2 0z" /><path d="M15.8 11.2h5.6" /><path d="M6.6 7.4c0-1.2 1.1-1.4 1.1-2.6M10.8 7.4c0-1.2 1.1-1.4 1.1-2.6" /></>,
  kasa: <><path d="M3.5 7.6a2.1 2.1 0 0 1 2.1-2.1H18a2.1 2.1 0 0 1 2.1 2.1v8.8A2.1 2.1 0 0 1 18 18.5H5.6a2.1 2.1 0 0 1-2.1-2.1z" /><path d="M16 11.2h4.1v3.6H16a1.8 1.8 0 0 1 0-3.6z" /></>,
  vardiya: <><circle cx="12" cy="13.6" r="6.6" /><path d="M12 10.2v3.4l2.2 1.6" /><path d="M9.6 3.5h4.8" /><path d="M12 3.5v3.5" /></>,
  stok: <><path d="M20.4 8.4v7.2L12 20.3 3.6 15.6V8.4L12 3.7z" /><path d="M3.6 8.4 12 13.1l8.4-4.7" /><path d="M12 13.1v7.2" /></>,
  gider: <><rect x="2.8" y="6.4" width="12.4" height="8.4" rx="1.8" /><path d="M6 10.6h6" /><path d="M18.4 12.2v7.2" /><path d="M15.6 16.8l2.8 2.8 2.8-2.8" /></>,
  fatura: <><path d="M6 3.6h12v17.2l-2.4-1.6-2.4 1.6-2.4-1.6-2.4 1.6L6 20.8z" /><path d="M9.2 8.4h5.6M9.2 12.4h5.6" /></>,
  gorev: <><rect x="3.5" y="3.5" width="17" height="17" rx="3.4" /><path d="M8 12.4l2.8 2.8L16.2 9.4" /></>,
  sayim: <><rect x="8" y="2.8" width="8" height="3.8" rx="1.2" /><path d="M16 4.9h2.1A1.9 1.9 0 0 1 20 6.8v12.1a1.9 1.9 0 0 1-1.9 1.9H5.9A1.9 1.9 0 0 1 4 18.9V6.8a1.9 1.9 0 0 1 1.9-1.9H8" /><path d="M8.2 13.4l2.4 2.4 4.6-4.6" /></>,

  // — Menu & urunler —
  menu: <><path d="M6 3.2v5.6a2.2 2.2 0 0 0 4.4 0V3.2" /><path d="M8.2 9v11.8" /><path d="M16.6 3.2c-1.6 1-2.7 3.1-2.7 5.7 0 2.1 1.1 3.2 2.7 3.2s2.7-1.1 2.7-3.2c0-2.6-1.1-4.7-2.7-5.7z" /><path d="M16.6 12.1v8.7" /></>,
  recete: <><path d="M19 12.6V6a2.2 2.2 0 0 0-2.2-2.2H6A2.2 2.2 0 0 0 3.8 6v12a2.2 2.2 0 0 0 2.2 2.2h6" /><path d="M7.6 8.4h7.2M7.6 12.4h5" /><path d="M18.4 14.8 21 17.4l-4.1 4.1h-2.6v-2.6z" /></>,
  arsiv: <><rect x="3" y="4" width="18" height="4.2" rx="1.4" /><path d="M5 8.2v10.2a2.1 2.1 0 0 0 2.1 2.1h9.8a2.1 2.1 0 0 0 2.1-2.1V8.2" /><path d="M10 12.4h4" /></>,
  raf: <><path d="M4.8 8h14.4l-1.2 12.5H6z" /><path d="M8.8 8V6.4a3.2 3.2 0 0 1 6.4 0V8" /></>,
  merch: <><path d="M8.6 3.6 5 5.6 3.4 9.6l3.1 1.5v9.3h11v-9.3l3.1-1.5L19 5.6l-3.4-2" /><path d="M8.6 3.6a3.4 3.4 0 0 0 6.8 0" /></>,
  saat: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.2V12l3.2 2.1" /></>,
  takvim: <><rect x="3.2" y="5.2" width="17.6" height="15.6" rx="2.2" /><path d="M3.2 10.2h17.6" /><path d="M8 3.2v4M16 3.2v4" /></>,

  // — Uyeler & kampanya —
  uye: <><circle cx="12" cy="9" r="5.4" /><path d="M8.4 13.6 7 21l5-2.6 5 2.6-1.4-7.4" /></>,
  kampanya: <><path d="M4.4 4.6h15.2l-7.6 8.2z" /><path d="M12 12.8v6.6" /><path d="M8.4 19.4h7.2" /></>,
  oylama: <><path d="M6 20.5V11.2M12 20.5V4M18 20.5v-6.4" /></>,
  blog: <><rect x="3" y="5" width="18" height="14" rx="2.2" /><path d="M6.8 9.2h6M6.8 12.6h10.4M6.8 16h10.4" /></>,

  // — Para & personel —
  rapor: <><path d="M3.8 19.4h16.4" /><path d="M6.4 15.6 10.6 11l3 2.6L19 7.2" /><path d="M19 10.6V7.2h-3.4" /></>,
  mutfakodeme: <><path d="M6.4 12.6a3.5 3.5 0 1 1 1.3-6.8 4.6 4.6 0 0 1 8.6 0 3.5 3.5 0 1 1 1.3 6.8z" /><path d="M6.4 12.6V18a2.2 2.2 0 0 0 2.2 2.2h6.8A2.2 2.2 0 0 0 17.6 18v-5.4" /><path d="M6.4 16.2h11.2" /></>,
  kilit: <><rect x="4.4" y="10.2" width="15.2" height="10.2" rx="2.6" /><path d="M8 10.2V7.6a4 4 0 0 1 8 0v2.6" /></>,
  personel: <><circle cx="9" cy="8" r="3.6" /><path d="M2.6 19.6a6.4 6.4 0 0 1 12.8 0" /><path d="M15.8 5.1a3.6 3.6 0 0 1 0 5.8" /><path d="M17.4 13.8a6.4 6.4 0 0 1 4 5.8" /></>,

  // — Sistem —
  plan: <><rect x="3.2" y="3.2" width="7.4" height="7.4" rx="1.6" /><rect x="13.4" y="3.2" width="7.4" height="7.4" rx="1.6" /><rect x="3.2" y="13.4" width="7.4" height="7.4" rx="1.6" /><rect x="13.4" y="13.4" width="7.4" height="7.4" rx="1.6" /></>,
  qr: <><rect x="3.4" y="3.4" width="6.8" height="6.8" rx="1.2" /><rect x="13.8" y="3.4" width="6.8" height="6.8" rx="1.2" /><rect x="3.4" y="13.8" width="6.8" height="6.8" rx="1.2" /><path d="M13.8 13.8h3.2v3.2h-3.2z" /><path d="M20.6 13.8v3.4M17.2 20.6h3.4" /></>,
  ayar: <><path d="M3.6 6.4h9.2M17 6.4h3.4M3.6 12h2.6M10 12h10.4M3.6 17.6h7.6M15.4 17.6h5" /><circle cx="14.9" cy="6.4" r="2.1" /><circle cx="8.1" cy="12" r="2.1" /><circle cx="13.5" cy="17.6" r="2.1" /></>,
  ekran: <><rect x="2.6" y="4.4" width="18.8" height="12.6" rx="2.2" /><path d="M9 20.6h6M12 17v3.6" /></>,
  ev: <><path d="M3.4 10.6 12 3.4l8.6 7.2" /><path d="M5.6 9.4v9.4a1.8 1.8 0 0 0 1.8 1.8h9.2a1.8 1.8 0 0 0 1.8-1.8V9.4" /><path d="M9.6 20.6v-6.2h4.8v6.2" /></>,
  hamburger: <><path d="M3.8 6.8h16.4M3.8 12h16.4M3.8 17.2h16.4" /></>,
  cikis: <><path d="M14 20.4H6a1.8 1.8 0 0 1-1.8-1.8V5.4A1.8 1.8 0 0 1 6 3.6h8" /><path d="M10.4 12h10.2" /><path d="M16.8 8.2 20.6 12l-3.8 3.8" /></>,

  // — Gider kategorileri & yonetim —
  yaprak: <><path d="M4.4 19.6C3 15 5.4 8.8 10 6.4c3-1.6 6.6-1.6 9.6-1.6.4 4.4-.6 9.4-4 12.2-2.8 2.4-7.6 3-11.2 2.6z" /><path d="M4.6 19.4C7 15.4 11 11.6 16 9.4" /></>,
  bira: <><path d="M5 7.4h9.6v11.2a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z" /><path d="M14.6 10h2.8a2.4 2.4 0 0 1 0 4.8h-2.8" /><path d="M8 11v6M11.6 11v6" /><path d="M5 7.4a2.4 2.4 0 0 1 2.4-2.4 2.4 2.4 0 0 1 4.8 0 2.4 2.4 0 0 1 2.4 2.4" /></>,
  temizlik: <><path d="M8.4 3.4h4.2v4.2H8.4z" /><path d="M6.4 7.6h8.2l1.4 5.4H5z" /><path d="M5 13h11l-.8 6a1.8 1.8 0 0 1-1.8 1.6H7.6A1.8 1.8 0 0 1 5.8 19z" /><path d="M18.6 4.4h2.8v4.2h-2.8z" /></>,
  alet: <><path d="M14.6 6.6a4 4 0 0 1 5.4-3.8l-2.8 2.8 1.8 1.8 2.8-2.8a4 4 0 0 1-5 5.2L6.4 20.2a2 2 0 0 1-2.8-2.8L14 7.4a4 4 0 0 1 .6-.8z" /></>,
  belge: <><path d="M13.4 3.6H7a1.8 1.8 0 0 0-1.8 1.8v13.2A1.8 1.8 0 0 0 7 20.4h10a1.8 1.8 0 0 0 1.8-1.8V9z" /><path d="M13.4 3.6V9h5.4" /><path d="M8.6 13h6.8M8.6 16.4h4.4" /></>,

  // — Musteri sekmeleri —
  etkinlik: <><path d="M3.4 8.6A1.6 1.6 0 0 1 5 7h14a1.6 1.6 0 0 1 1.6 1.6v1.9a2.6 2.6 0 0 0 0 5.1v1.8A1.6 1.6 0 0 1 19 19H5a1.6 1.6 0 0 1-1.6-1.6v-1.8a2.6 2.6 0 0 0 0-5.1z" /><path d="M14.4 7.4v2M14.4 14.6v2" /></>,
  surus: <><circle cx="5.6" cy="16.6" r="3.4" /><circle cx="18.4" cy="16.6" r="3.4" /><path d="M5.6 16.6h6.6l3-7.6h2.4" /><path d="M12.2 16.6 15.2 9" /><path d="M15.2 9l3.2 7.6" /><path d="M9.6 9h4" /></>,

  // — Ortak eylemler —
  ara: <><circle cx="10.6" cy="10.6" r="6.4" /><path d="M15.4 15.4 20.4 20.4" /></>,
  onay: <><path d="M4.6 12.4l5 5 9.8-10.8" /></>,
  onayli: <><circle cx="12" cy="12" r="8.5" /><path d="M8.2 12.2l2.6 2.6 5-5.4" /></>,
  uyari: <><path d="M10.3 4.2a2 2 0 0 1 3.4 0l7.6 13.3a2 2 0 0 1-1.7 3H4.4a2 2 0 0 1-1.7-3z" /><path d="M12 9.4v4.4M12 17.2h.01" /></>,
  zil: <><path d="M18 9.4a6 6 0 0 0-12 0c0 4.8-2.4 6.4-2.4 6.4h16.8S18 14.2 18 9.4z" /><path d="M10.3 19a2 2 0 0 0 3.4 0" /></>,
  sepet: <><circle cx="9.6" cy="19.8" r="1.5" /><circle cx="18" cy="19.8" r="1.5" /><path d="M2.6 3.6h2.6l2.5 12.1a1.6 1.6 0 0 0 1.6 1.3h8.4a1.6 1.6 0 0 0 1.6-1.3l1.5-7.9H6.1" /></>,
  kart: <><rect x="2.6" y="5" width="18.8" height="14" rx="2.6" /><path d="M2.6 10h18.8" /><path d="M6.4 15h3.2" /></>,
  nakit: <><rect x="2.6" y="6" width="18.8" height="12" rx="2.2" /><circle cx="12" cy="12" r="2.8" /><path d="M6 10v4M18 10v4" /></>,
  veresiye: <><rect x="4" y="3.8" width="16" height="16.4" rx="2" /><path d="M8 8.6h8M8 12.4h8M8 16.2h4.4" /></>,
  puan: <><circle cx="12" cy="12" r="8.5" /><path d="M10.4 6.6v10.8c3.2 0 5.6-2.4 5.6-5.4" /><path d="M15 10.2 8 13" /></>,
  yildiz: <><path d="M12 3.4l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17.5l-5.4 2.8 1-6.1-4.4-4.3 6.1-.9z" /></>,
  kisi: <><circle cx="12" cy="8" r="3.8" /><path d="M4.6 20.2a7.4 7.4 0 0 1 14.8 0" /></>,
  hediye: <><rect x="3" y="8.8" width="18" height="4.2" rx="1.2" /><path d="M5.2 13v6.4a1.6 1.6 0 0 0 1.6 1.6h10.4a1.6 1.6 0 0 0 1.6-1.6V13" /><path d="M12 8.8v12.2" /><path d="M12 8.8C10 8.8 7.4 8.4 7.4 6.4A2.4 2.4 0 0 1 12 5a2.4 2.4 0 0 1 4.6 1.4c0 2-2.6 2.4-4.6 2.4z" /></>,
  bardak: <><path d="M5.2 7.4h13.6l-1.4 12a1.8 1.8 0 0 1-1.8 1.6H8.4a1.8 1.8 0 0 1-1.8-1.6z" /><path d="M4 7.4h16" /><path d="M12 3.2v4.2" /></>,
  ses: <><path d="M4 9.4h3.4L12 5.4v13.2L7.4 14.6H4z" /><path d="M15.4 9.6a3.6 3.6 0 0 1 0 4.8M17.9 7a7.2 7.2 0 0 1 0 10" /></>,
  kalp: <><path d="M12 20.2s-7.6-4.8-7.6-9.8a4.5 4.5 0 0 1 7.6-3.1 4.5 4.5 0 0 1 7.6 3.1c0 5-7.6 9.8-7.6 9.8z" /></>,
  yenile: <><path d="M20.4 12a8.4 8.4 0 1 1-2.5-6" /><path d="M20.6 4.4v5.2h-5.2" /></>,
  kalem: <><path d="M16.6 3.8 20.2 7.4 8.4 19.2l-4.6 1 1-4.6z" /><path d="M14.4 6 18 9.6" /></>,
  ucak: <><path d="M21 3.4 2.8 10.6l6.6 2.6 2.6 6.6z" /><path d="M21 3.4 9.4 13.2" /></>,
  cop: <><path d="M4 7h16" /><path d="M9.4 7V5.2A1.2 1.2 0 0 1 10.6 4h2.8a1.2 1.2 0 0 1 1.2 1.2V7" /><path d="M6.4 7l1 12.2A1.8 1.8 0 0 0 9.2 21h5.6a1.8 1.8 0 0 0 1.8-1.8L17.6 7" /></>,
  kamera: <><rect x="2.6" y="6.6" width="18.8" height="13" rx="2.6" /><circle cx="12" cy="13.2" r="3.8" /><path d="M8.6 6.6 9.9 4h4.2l1.3 2.6" /></>,
  disari: <><path d="M7 17 17 7" /><path d="M8.6 7H17v8.4" /></>,
  oksag: <><path d="M4 12h15" /><path d="M13.4 6.4 19.4 12l-6 5.6" /></>,
  oksol: <><path d="M20 12H5" /><path d="M10.6 6.4 4.6 12l6 5.6" /></>,
  kapat: <><path d="M6.2 6.2l11.6 11.6M17.8 6.2 6.2 17.8" /></>,
  ekle: <><path d="M12 5v14M5 12h14" /></>,
  asagi: <><path d="M6 9.4 12 15.4 18 9.4" /></>,
  sessiz: <><path d="M4 9.4h3.4L12 5.4v13.2L7.4 14.6H4z" /><path d="M16.4 10.2 21 14.8M21 10.2l-4.6 4.6" /></>,
  ampul: <><path d="M9 17.4a6.4 6.4 0 1 1 6 0v1.6a1.6 1.6 0 0 1-1.6 1.6h-2.8A1.6 1.6 0 0 1 9 19z" /><path d="M9.4 17.4h5.2" /></>,
  not: <><path d="M5 4.4h14v11.2l-4 4H5z" /><path d="M19 15.6h-4v4" /><path d="M8.4 9h7.2M8.4 12.4h4.4" /></>,
  yukari: <><path d="M18 14.6 12 8.6 6 14.6" /></>,
  sag: <><path d="M9.4 5.6 15.4 12 9.4 18.4" /></>,
  bekleme: <><path d="M7 3.6h10M7 20.4h10" /><path d="M7.6 3.6v3.1c0 1.4 4.4 3.7 4.4 5.3 0-1.6 4.4-3.9 4.4-5.3V3.6" /><path d="M7.6 20.4v-3.1c0-1.4 4.4-3.7 4.4-5.3 0 1.6 4.4 3.9 4.4 5.3v3.1" /></>,
  parlak: <><path d="M11.4 3.4 13 8.3l4.9 1.6-4.9 1.6-1.6 4.9-1.6-4.9L4.9 9.9l4.9-1.6z" /><path d="M18.4 15.2l.7 2.1 2.1.7-2.1.7-.7 2.1-.7-2.1-2.1-.7 2.1-.7z" /></>,
  kahve: <><path d="M4.4 6.6h12.2v6.6a4.6 4.6 0 0 1-4.6 4.6H9a4.6 4.6 0 0 1-4.6-4.6z" /><path d="M16.6 8.2h1.8a2.6 2.6 0 0 1 0 5.2h-1.8" /><path d="M4.4 20.4h12.2" /></>,
  kule: <><path d="M12 3.4v17" /><path d="M8.4 20.4c0-6 1.6-11.9 3.6-17 2 5.1 3.6 11 3.6 17" /><path d="M10.2 11.2h3.6M9 15.4h6" /><path d="M5.6 20.4h12.8" /></>,
  posta: <><rect x="2.6" y="5" width="18.8" height="14" rx="2.2" /><path d="M3.4 7 12 13l8.6-6" /></>,
  duyuru: <><path d="M3.4 9.8h3.2l8-4.4v13.2l-8-4.4H3.4z" /><path d="M6.6 14.2v4.4a1.6 1.6 0 0 0 3.2 0v-2.6" /><path d="M18.6 9.4a3.6 3.6 0 0 1 0 5.2" /></>,
};

export default function Ikon({ ad, boy = 20, kalin = 1.8, style, ...rest }) {
  const ciz = CIZ[ad];
  if (!ciz) return null;
  return (
    <svg
      viewBox="0 0 24 24" width={boy} height={boy}
      fill="none" stroke="currentColor" strokeWidth={kalin}
      strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" focusable="false"
      style={{ display: "inline-block", verticalAlign: "-0.15em", flexShrink: 0, ...style }}
      {...rest}
    >
      {ciz}
    </svg>
  );
}
