// BARKOD OKUYUCU — kameradan EAN/QR okur (sahip istegi 17.10).
//
// Android Chrome (kasa tableti): tarayicinin kendi BarcodeDetector'u; ek kod
// inmez, hizli. iPhone Safari: BarcodeDetector yok; @zxing/browser yalniz
// okutma acilinca yuklenir (dynamic import), ana paket buyumez.
// Okuma surekli: her tespitte onOkundu(kod) cagrilir; tekrar/ara bekleme
// kararini cagiran verir (BarkodOkut).
export const kameraVar = () =>
  typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

export const kameraHatasi = (e) => {
  const ad = e?.name || "";
  if (ad === "NotAllowedError" || ad === "SecurityError") return "Kamera izni verilmedi. Tarayıcı ayarlarından bu siteye kamera izni ver.";
  if (ad === "NotFoundError" || ad === "OverconstrainedError") return "Kamera bulunamadı.";
  if (ad === "NotReadableError") return "Kamera başka bir uygulama tarafından kullanılıyor.";
  return "Kamera açılamadı: " + (e?.message || String(e));
};

const KISIT = { video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false };

// video: <video> ogesi. Donus: durdur() — kamerayi ve okumayi kapatir.
export async function okuyucuBaslat(video, onOkundu, onHata) {
  let durdu = false, stream = null, zxing = null, zamanlayici = null;
  const durdur = () => {
    durdu = true;
    if (zamanlayici) clearTimeout(zamanlayici);
    try { zxing?.stop(); } catch { /* zaten kapali */ }
    try { stream?.getTracks().forEach(t => t.stop()); } catch { /* yoksay */ }
    try { video.srcObject = null; } catch { /* yoksay */ }
  };
  try {
    if (typeof window !== "undefined" && "BarcodeDetector" in window) {
      const det = new window.BarcodeDetector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "qr_code"] });
      stream = await navigator.mediaDevices.getUserMedia(KISIT);
      if (durdu) { durdur(); return durdur; }
      video.srcObject = stream;
      video.setAttribute("playsinline", "true");
      video.muted = true;
      await video.play();
      const tara = async () => {
        if (durdu) return;
        try {
          if (video.readyState >= 2) {
            const sonuc = await det.detect(video);
            const kod = sonuc?.[0]?.rawValue;
            if (kod && !durdu) onOkundu(String(kod).trim());
          }
        } catch { /* kare okunamadi; sonraki kare */ }
        if (!durdu) zamanlayici = setTimeout(tara, 150);
      };
      tara();
    } else {
      const [{ BrowserMultiFormatReader }, { DecodeHintType, BarcodeFormat }] =
        await Promise.all([import("@zxing/browser"), import("@zxing/library")]);
      if (durdu) return durdur;
      const ipucu = new Map([
        [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E,
                                           BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.QR_CODE]],
        [DecodeHintType.TRY_HARDER, true],
      ]);
      const okuyucu = new BrowserMultiFormatReader(ipucu, { delayBetweenScanAttempts: 150 });
      zxing = await okuyucu.decodeFromConstraints(KISIT, video, (sonuc) => {
        if (!durdu && sonuc) onOkundu(String(sonuc.getText()).trim());
      });
      if (durdu) durdur();
    }
  } catch (e) {
    durdur();
    onHata && onHata(e);
  }
  return durdur;
}
