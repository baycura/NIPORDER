import { useEffect, useRef, useState } from "react";
import { onayDinle } from "../lib/onayla.js";

// lib/onayla.js'in tek yuvasi. StaffLayout'ta bir kez cizilir.
//
// Kurallar:
//  - Karartiya dokunmak ve Esc = "Vazgeç" (guvenli cevap).
//  - Acildiktan sonraki 350 ms dokunus sayilmaz: pencereyi acan dugmeye cift
//    dokunan parmak, ayni yerde beliren "Sil"e basmasin.
//  - Odak "Vazgeç"te baslar: Enter yanlislikla silmez.
//  - Yeni soru gelirse eskisi "hayir" diye kapanir; yuva sokulurse de.
const BEKLE_MS = 350;

export default function OnayYuvasi() {
  const [istek, setIstek] = useState(null);
  const acilis = useRef(0);
  const hayirRef = useRef(null);
  const acik = useRef(null);

  useEffect(() => {
    const kapat = onayDinle((yeni) => {
      if (acik.current) acik.current.coz(false);
      acik.current = yeni; acilis.current = Date.now();
      setIstek(yeni);
    });
    return () => { kapat(); if (acik.current) { acik.current.coz(false); acik.current = null; } };
  }, []);

  const cevapla = (c) => {
    if (!acik.current) return;
    if (Date.now() - acilis.current < BEKLE_MS) return;
    const i = acik.current; acik.current = null;
    setIstek(null);
    i.coz(c);
  };

  useEffect(() => {
    if (!istek) return;
    hayirRef.current?.focus();
    const tus = (e) => { if (e.key === "Escape") { e.stopPropagation(); acilis.current = 0; cevapla(false); } };
    window.addEventListener("keydown", tus, true);
    return () => window.removeEventListener("keydown", tus, true);
  }, [istek]);

  if (!istek) return null;
  const dugme = { flex: 1, minHeight: 48, padding: "0 14px", borderRadius: 12, fontSize: 15, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" };
  return (
    <div role="alertdialog" aria-modal="true" aria-label="Onay" aria-describedby="nip-onay-metin"
      onClick={(e) => { if (e.target === e.currentTarget) cevapla(false); }}
      style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(0,0,0,0.75)", display: "flex",
               alignItems: "center", justifyContent: "center", padding: 16,
               fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif" }}>
      <div style={{ width: "100%", maxWidth: 380, maxHeight: "80vh", overflowY: "auto", background: "#161616", border: "1px solid #2A2A2A",
                    borderRadius: 16, padding: 18, boxSizing: "border-box" }}>
        <div id="nip-onay-metin" style={{ fontSize: 15, lineHeight: 1.5, color: "#F0EDE8", whiteSpace: "pre-line", overflowWrap: "anywhere" }}>{istek.metin}</div>
        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <button ref={hayirRef} type="button" onClick={() => cevapla(false)}
            style={{ ...dugme, background: "transparent", color: "#F0EDE8", border: "1px solid #3A3A3A" }}>{istek.hayir}</button>
          <button type="button" onClick={() => cevapla(true)}
            style={{ ...dugme, background: istek.tehlike ? "#C87A6A" : "#FFFFFF", color: istek.tehlike ? "#0C0C0C" : "#000", border: "none" }}>{istek.evet}</button>
        </div>
      </div>
    </div>
  );
}
