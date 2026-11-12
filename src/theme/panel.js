// PANEL STIL SABITLERI — personel/yonetim ekranlarinin ortak degerleri.
//
// Sayfa basligi bes ayri bicimde yaziliyordu: 34 px dar BUYUK harf (Gün
// Özeti, Giderler, Konsinye), 28 px Coolvetica (Vardiyam, Stok), 30-32 px
// aralikli (Rezervasyon, QR), 22 px (Bugün, Vardiyalar) ve cogunlukta 24 px.
// Tek bicim: cogunlugun kullandigi 24 px / 800.
export const panelYazi = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";

export const baslikStil = {
  fontFamily: panelYazi, fontSize: 24, fontWeight: 800, letterSpacing: "-0.3px",
  lineHeight: 1.2, margin: 0, color: "#F0EDE8",
};
