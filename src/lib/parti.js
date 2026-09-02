// Parti menusu — tek gercek kaynagi.
//
// Sahibin kurali: "Parti dugmesine bastigimizda sadece partide sattigimiz
// urunler listelensin, normal menu gozukmesin."
//
// SERT FILTRE: parti acikken YALNIZ show_in_party_menu isaretli urunler
// gorunur. Eski davranista "bu kategoride hic isaretli yoksa hepsini goster"
// diye bir taviz vardi (CustomerMenu.jsx) — o taviz kalkti, cunku bir
// kategoride unutulan tek isaret bütün kategoriyi geri getiriyordu ve
// "normal menu gozukmesin" kurali delinmis oluyordu.
//
// Menunun tamamen bosalmasi riskini SUNUCU kapatiyor: nip_parti_ac, satista
// isaretli urun yoksa partiyi acmayi reddediyor.

// Parti acikken bir urun listesi nasil suzulur. Tek satir ama iki ekranda
// (musteri menusu + kasa siparis ekrani) ayni davranmasi sart.
export const partiSuz = (urunler, partiAcik) =>
  partiAcik ? (urunler || []).filter(u => u.show_in_party_menu) : (urunler || []);

// Sunucudan gelen durumu tek yerde yorumla. RPC yoksa/hata verirse parti
// KAPALI sayilir — fail-safe yon budur: yanlislikla parti acik sanip menuyu
// bosaltmaktansa, normal menuyu gostermek zararsizdir.
export function partiDurumOku(data, error) {
  if (error || !data) return { aktif: false, kaynak: "kapali", biter: null, urunSayisi: 0 };
  const d = Array.isArray(data) ? data[0] : data;
  if (!d) return { aktif: false, kaynak: "kapali", biter: null, urunSayisi: 0 };
  return {
    aktif: !!d.aktif,
    kaynak: d.kaynak || "kapali",
    biter: d.biter || null,
    urunSayisi: Number(d.urun_sayisi || 0),
  };
}

// "05:00'te kapanir" — pencerenin bitisini insan diliyle yaz.
export function biterYazi(biter) {
  if (!biter) return "";
  try {
    return new Date(biter).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  } catch (e) { return ""; }
}
