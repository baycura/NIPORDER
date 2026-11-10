// Veritabani durum kodlarinin ekrandaki Turkce karsiligi — tek sozluk.
// (Siparis basliginda OPEN/SENT, kalem satirinda PENDING/SERVED yaziyordu.)
// Yalniz GOSTERIM icindir; sorgu ve karsilastirmalarda kod kullanilir.

export const HESAP_DURUM = {
  open: "Yeni", sent: "Mutfakta", preparing: "Mutfakta", ready: "Hazır",
  paid: "Ödenmiş", cancelled: "İptal", debt: "Borç",
};

export const KALEM_DURUM = {
  pending: "Bekliyor", preparing: "Hazırlanıyor", ready: "Hazır", served: "Verildi",
};

// Turkce buyuk harf: "hazır" -> "HAZIR", "iptal" -> "İPTAL"
export const buyuk = (s) => String(s || "").toLocaleUpperCase("tr-TR");
