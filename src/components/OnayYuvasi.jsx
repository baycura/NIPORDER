import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { onayDinle } from "../lib/onayla.js";

// lib/onayla.js'in tek yuvasi. StaffLayout'ta bir kez cizilir.
//
// Kurallar:
//  - Karartiya dokunmak ve Esc = "Vazgeç" (guvenli cevap).
//  - Acildiktan sonraki 350 ms dokunus sayilmaz: pencereyi acan dugmeye cift
//    dokunan parmak, ayni yerde beliren "Sil"e basmasin.
//  - Odak "Vazgeç"te baslar: Enter yanlislikla silmez. Tab iki dugme arasinda
//    doner; arkadaki sayfaya gecmez. Kapaninca odak ESKI yerine doner (barkod
//    okuyucunun yazdigi arama kutusu odagi kaybetmesin).
//  - Sayfa degisirse (geri tusu, kenar kaydirma) soru "hayir" diye kapanir:
//    cevap, artik ekranda olmayan sayfanin isini yapmasin.
//  - Yeni soru gelirse eskisi "hayir" diye kapanir; yuva sokulurse de.
const BEKLE_MS = 350;

export default function OnayYuvasi() {
  const [istek, setIstek] = useState(null);
  const location = useLocation();
  const acilis = useRef(0);
  const hayirRef = useRef(null);
  const evetRef = useRef(null);
  const acik = useRef(null);
  const oncekiOdak = useRef(null);

  // Pencereyi kapatir ve cevabi verir. Odak, pencere ekrandan kalkinca eski
  // yerine doner (asagidaki [istek] etkisi).
  const kapat = (cevap) => {
    const i = acik.current;
    if (!i) return;
    acik.current = null;
    setIstek(null);
    i.coz(cevap);
  };

  useEffect(() => {
    const birak = onayDinle((yeni) => {
      if (acik.current) acik.current.coz(false);
      // Ilk acan oge saklanir; yerine gecen soru pencerenin kendi dugmesini yazmasin.
      if (!oncekiOdak.current) oncekiOdak.current = document.activeElement;
      acik.current = yeni; acilis.current = Date.now();
      setIstek(yeni);
    });
    return () => { birak(); if (acik.current) { acik.current.coz(false); acik.current = null; } };
  }, []);

  // Sayfa degisti: acik soru "hayir". (Yol da izlenir: anahtarsiz gecmis
  // kayitlarinda location.key degismez.)
  useEffect(() => { kapat(false); }, [location.key, location.pathname]);

  const cevapla = (c) => {
    if (Date.now() - acilis.current < BEKLE_MS) return;
    kapat(c);
  };

  useEffect(() => {
    if (!istek) {
      // Pencere kalkti: odak eski yerine. Devam eden is baska bir alana odak
      // verdiyse (yeni acilan pencerenin ilk kutusu) ona dokunulmaz.
      const eski = oncekiOdak.current; oncekiOdak.current = null;
      if (eski && eski.isConnected && typeof eski.focus === "function"
          && (!document.activeElement || document.activeElement === document.body)) {
        try { eski.focus({ preventScroll: true }); } catch (e) { /* odaklanamaz */ }
      }
      return;
    }
    hayirRef.current?.focus();
    const tus = (e) => {
      if (e.key === "Escape") { e.stopPropagation(); kapat(false); return; }
      if (e.key === "Tab") {
        // Odak pencerenin icinde kalir.
        e.preventDefault();
        (document.activeElement === hayirRef.current ? evetRef : hayirRef).current?.focus();
      }
    };
    window.addEventListener("keydown", tus, true);
    return () => window.removeEventListener("keydown", tus, true);
  }, [istek]);

  if (!istek) return null;
  const dugme = { flex: 1, minHeight: 48, padding: "0 14px", borderRadius: 12, fontSize: 15, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" };
  // Dokunus StaffLayout'un "kenardan kaydir = geri" dinleyicisine gitmez.
  const dur = (e) => e.stopPropagation();
  return (
    <div role="alertdialog" aria-modal="true" aria-label="Onay" aria-describedby="nip-onay-metin"
      onClick={(e) => { if (e.target === e.currentTarget) cevapla(false); }}
      onTouchStart={dur} onTouchMove={dur} onTouchEnd={dur}
      style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(0,0,0,0.75)", display: "flex",
               alignItems: "center", justifyContent: "center", padding: 16,
               fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif" }}>
      <div style={{ width: "100%", maxWidth: 380, maxHeight: "80vh", overflowY: "auto", background: "#161616", border: "1px solid #2A2A2A",
                    borderRadius: 16, padding: 18, boxSizing: "border-box" }}>
        <div id="nip-onay-metin" style={{ fontSize: 15, lineHeight: 1.5, color: "#F0EDE8", whiteSpace: "pre-line", overflowWrap: "anywhere" }}>{istek.metin}</div>
        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <button ref={hayirRef} type="button" onClick={() => cevapla(false)}
            style={{ ...dugme, background: "transparent", color: "#F0EDE8", border: "1px solid #3A3A3A" }}>{istek.hayir}</button>
          <button ref={evetRef} type="button" onClick={() => cevapla(true)}
            style={{ ...dugme, background: istek.tehlike ? "#C87A6A" : "#FFFFFF", color: istek.tehlike ? "#0C0C0C" : "#000", border: "none" }}>{istek.evet}</button>
        </div>
      </div>
    </div>
  );
}
