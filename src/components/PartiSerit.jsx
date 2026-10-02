import { useRef, useState } from "react";

// ============================================================================
// PARTI SERIDI — tek kategorinin urunleri, parmakla saga sola kayan tek satir.
// ============================================================================
//
// KAYMA HISSI. Sahibin tarifi: "rulet tahtasi gibi, hizlica yatirinca kendi
// kendine kayip yavaslasin — iPhone'da Fotograflar'in altindaki minik
// fotograf seridi gibi." O his TARAYICININ KENDI atalet kaydirmasidir;
// JS ile taklit edilmez, edilmeye calisilirsa 60fps tutmaz. Yani buradaki is
// onu kurmak degil, BOZMAMAK. Bozan ayarlar ve neden yazilmadiklari:
//
//   scroll-snap-type: x mandatory   -> savurma bir sonraki kartta KILITLENIR.
//                                      Rulet hissi olur. Bu yuzden PROXIMITY:
//                                      savurmaya karismaz, yalnizca kendi
//                                      durdugu yer bir karta yakinsa hizalar.
//   scroll-snap-stop: always        -> her kartta zorla durur. Varsayilan
//                                      (normal) kalsin diye yazilmiyor.
//   scroll-behavior: smooth         -> parmakla kaydirmayi da ele alir, atalet
//                                      yerine sabit sureli animasyon olur.
//
//   overscroll-behavior-x: contain  -> savurma seridin sonuna gelince sayfanin
//                                      "geri" kenar jestini tetiklemesin.
//
// touch-action BILEREK YAZILMIYOR (varsayilan: auto). "pan-x" denendi ve
// kirdi: serit uzerinden asagi dogru surukleyince parmak yalnizca yatay
// harekete kilitleniyor, alttaki seritlere (Mesrubatlar, Kahveler, Raf)
// inilemiyordu. auto'da tarayici baskin ekseni kendi seciyor: yatay savurma
// seridi, dikey surukleme serit alanini kaydiriyor.
//
// SOLMA. Kenardaki "devami var" solmasi kaydiricinin ICINDE degil, DIS
// sarmalda duruyor. Icinde olsaydi kaydirilan katmanin parcasi olur, her
// karede yeniden boyanirdi (ve Chromium'da katmanin ortasinda 1px dikis
// birakiyordu — tasarim denemesinde birebir goruldu).
// ============================================================================

const KART = 128;   // kart genisligi; 5 tanesi + yarim altinci yatay tablete sigar
const ARA = 8;
// SERIT YUKSEKLIK TABANI. Seritler esit bolunur (flex), bu da en az ne kadar
// alcalabilecekleri. iPad 11" yatayda (834px) serit alanina 686px kaliyor;
// yedi serit = 91px her biri, yani taban devreye girmeden hepsi ekrana
// sigiyor — dikey kaydirma yok. Sahip sekizinci kategoriyi de parti
// menusune eklerse taban devreye girer ve alan dikey kayar.
// 84 denendi: 9px dolgu x2 + 3 satir isim (46px) + fiyat (19px) = 83.
const TABAN = 84;

// Gece yarisi dort haneli tutari bir bakista okumak icin binlik ayraci: 3600
// yerine 3.600. Tutar her zaman tam sayi gosterilir (kurus kasada yok).
export const tl = (n) => "₺" + Math.round(Number(n) || 0).toLocaleString("tr-TR");

export default function PartiSerit({
  baslik,          // kategori adi (sol etiket)
  urunler = [],    // bu seridin urunleri, sirali
  fiyatOf,         // (urun) => gosterilecek fiyat (happy hour dahil)
  adetOf,          // (urun) => bu hesapta kac adet var (0 ise rozet yok)
  secenekliMi,     // (urun) => tek dokunus yetmiyor mu (kirmizi nokta)
  onEkle,
  kapali = false,
}) {
  const kaydirici = useRef(null);
  const [solda, setSolda] = useState(false); // basta mi, yoksa kaydirilmis mi

  // Yalnizca "basta mi degil mi" gecisinde state degisir; her kaydirma
  // karesinde React'i uyandirmaz.
  const kaydi = (e) => {
    const k = e.currentTarget.scrollLeft > 8;
    setSolda((o) => (o === k ? o : k));
  };

  return (
    <div style={{ display: "flex", gap: ARA, alignItems: "stretch", flex: "1 1 0", minHeight: TABAN }}>
      {/* Sol etiket: kategori + kac urun oldugu. Sayi "serit devam ediyor"
          bilgisini kenardaki yarim karttan bagimsiz olarak da verir. */}
      {/* Etiket olugu 76px: menudeki en uzun tek kelimelik kategori adi
          "MEŞRUBATLAR" (11 harf) tek satira sigsin diye — 70px'te
          "MEŞRUBATL / AR" diye kelime ortasindan boluyordu. Bosluklu adlar
          ("SOĞUK KAHVELER") boslugundan sarar; overflowWrap ise hicbir adin
          kirpilmamasini garanti eder. */}
      <div style={{ width: 76, flexShrink: 0, display: "flex", flexDirection: "column", justifyContent: "center", gap: 3 }}>
        <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.5px", color: "#66625E", lineHeight: 1.3, overflowWrap: "anywhere" }}>
          {String(baslik || "").toLocaleUpperCase("tr-TR")}
        </span>
        <span style={{ fontSize: 9, fontWeight: 700, color: "#4A4642" }}>{urunler.length} ürün</span>
      </div>

      <div style={{ flex: 1, minWidth: 0, position: "relative" }}>
        <div
          ref={kaydirici}
          onScroll={kaydi}
          className="no-scrollbar"
          style={{
            height: "100%",
            display: "flex",
            gap: ARA,
            alignItems: "stretch",
            overflowX: "auto",
            overflowY: "hidden",
            scrollSnapType: "x proximity",
            overscrollBehaviorX: "contain",
            WebkitOverflowScrolling: "touch",
          }}
        >
          {urunler.map((p) => {
            const adet = adetOf ? adetOf(p) : 0;
            return (
              <button
                key={p.id}
                onClick={() => !kapali && onEkle && onEkle(p)}
                disabled={kapali}
                aria-label={"Ekle: " + p.name}
                style={{
                  flex: "0 0 " + KART + "px",
                  scrollSnapAlign: "start",
                  background: adet > 0 ? "#1E1E1E" : "#161616",
                  border: "1px solid " + (adet > 0 ? "#5A5A5A" : "#2A2A2A"),
                  borderRadius: 12,
                  padding: "9px 9px",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  position: "relative",
                  color: "#F0EDE8",
                  font: "inherit",
                  textAlign: "left",
                  cursor: kapali ? "not-allowed" : "pointer",
                  opacity: kapali ? 0.5 : 1,
                }}
              >
                {secenekliMi && secenekliMi(p) && (
                  <span style={{ position: "absolute", top: 9, right: 9, width: 7, height: 7, borderRadius: "50%", background: "#C87A6A" }} />
                )}
                <span style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.18, letterSpacing: "-0.2px", paddingRight: 11,
                               display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                  {p.name}
                </span>
                <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 5 }}>
                  <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.5px" }}>
                    {Number(fiyatOf ? fiyatOf(p) : p.price) > 0 ? tl(fiyatOf ? fiyatOf(p) : p.price) : "Serbest"}
                  </span>
                  {adet > 0 && (
                    <span style={{ minWidth: 26, height: 26, borderRadius: 13, background: "#FFFFFF", color: "#000",
                                   fontSize: 13, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center",
                                   padding: "0 7px", flexShrink: 0 }}>
                      {adet}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>

        {/* Kaydirilmis haldeyken sol kenarda da solma: serit basa donmemis. */}
        {solda && (
          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 40, pointerEvents: "none",
                        background: "linear-gradient(270deg, rgba(10,10,10,0), #0A0A0A)" }} />
        )}
        <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 40, pointerEvents: "none",
                      background: "linear-gradient(90deg, rgba(10,10,10,0), #0A0A0A)" }} />
      </div>
    </div>
  );
}
