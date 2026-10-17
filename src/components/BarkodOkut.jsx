import { useEffect, useRef, useState } from "react";
import Ikon from "./Ikon.jsx";
import { okuyucuBaslat, kameraVar, kameraHatasi } from "../lib/barkod.js";

const cv = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";

// BARKOD OKUT penceresi (lib/barkod.js).
//   onOkundu(kod) -> string | { metin, hata } | null   — cagiran ne yaptigini soyler
//   surekli: true  -> pencere acik kalir, art arda okutulur (kasa)
//            false -> ilk okumada kapanir (urun formu)
// Ayni kod kameranin onunde durdugu surece BIR kez sayilir: her karede
// gorulmesi "hala orada" demektir; ancak 1,5 sn gorunmeyip yeniden girince
// yeni okuma olur (ayni urunden ikinci adet = cek, tekrar tut). Ileti
// gosterilirken yeni okuma beklenir. Kamera yoksa numara elle yazilir.
export default function BarkodOkut({ baslik = "Barkod okut", aciklama, onOkundu, surekli = false, onKapat }) {
  const videoRef = useRef(null);
  const [durum, setDurum] = useState("aciliyor");   // aciliyor | okuyor | hata
  const [hata, setHata] = useState(null);
  const [mesaj, setMesaj] = useState(null);
  const [elle, setElle] = useState("");
  const sonRef = useRef({ kod: null, an: 0, gorulme: 0 });
  const kapatRef = useRef(onKapat);
  const okunduRef = useRef(onOkundu);
  useEffect(() => { kapatRef.current = onKapat; okunduRef.current = onOkundu; });

  const isle = (kod) => {
    const temiz = String(kod || "").trim();
    if (!temiz) return;
    const sonuc = okunduRef.current ? okunduRef.current(temiz) : null;
    try { navigator.vibrate && navigator.vibrate(sonuc && sonuc.hata ? [60, 60, 60] : 40); } catch { /* yoksay */ }
    if (!surekli) { kapatRef.current && kapatRef.current(); return; }
    if (sonuc) setMesaj({ metin: typeof sonuc === "string" ? sonuc : sonuc.metin, kotu: !!sonuc.hata });
    setTimeout(() => setMesaj(null), 1800);
  };

  useEffect(() => {
    if (!kameraVar()) { setDurum("hata"); setHata("Bu cihazda kamera erişimi yok. Numarayı aşağıya yaz."); return; }
    let iptal = false, durdur = null;
    okuyucuBaslat(videoRef.current, (kod) => {
      const simdi = Date.now();
      const son = sonRef.current;
      if (kod === son.kod && simdi - son.gorulme < 1500) { son.gorulme = simdi; return; }   // hala cercevede
      if (simdi - son.an < 900) return;                                                      // ileti gosteriliyor
      sonRef.current = { kod, an: simdi, gorulme: simdi };
      isle(kod);
    }, (e) => { if (!iptal) { setDurum("hata"); setHata(kameraHatasi(e)); } })
      .then(d => {
        if (iptal) { d && d(); return; }
        durdur = d;
        setDurum(s => (s === "hata" ? s : "okuyor"));
      });
    return () => { iptal = true; durdur && durdur(); };
  }, []);

  const dugme = { minHeight: 44, padding: "0 16px", borderRadius: 10, border: "1px solid #2A2A2A", background: "#161616", color: "#F0EDE8", fontFamily: cv, fontSize: 13, fontWeight: 700, cursor: "pointer" };

  return (
    <div role="dialog" aria-label={baslik}
         style={{ position: "fixed", inset: 0, zIndex: 1000, background: "#0C0C0C", color: "#F0EDE8", fontFamily: cv, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderBottom: "1px solid #2A2A2A" }}>
        <Ikon ad="kamera" boy={18} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 800 }}>{baslik}</div>
          {aciklama && <div style={{ fontSize: 12, color: "#8A8A86", marginTop: 2 }}>{aciklama}</div>}
        </div>
        <button onClick={() => kapatRef.current && kapatRef.current()} aria-label="Kapat" style={{ ...dugme, minWidth: 44, padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Ikon ad="kapat" boy={16} />
        </button>
      </div>

      <div style={{ position: "relative", flex: 1, minHeight: 0, background: "#000", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <video ref={videoRef} playsInline muted style={{ width: "100%", height: "100%", objectFit: "cover", display: durum === "hata" ? "none" : "block" }} />
        {durum !== "hata" && (
          <div aria-hidden="true" style={{ position: "absolute", left: "10%", right: "10%", top: "32%", height: "36%", border: "2px solid rgba(255,255,255,0.85)", borderRadius: 12, boxShadow: "0 0 0 2000px rgba(0,0,0,0.35)" }} />
        )}
        {durum === "aciliyor" && <div style={{ position: "absolute", bottom: 14, fontSize: 13, color: "#F0EDE8" }}>Kamera açılıyor…</div>}
        {durum === "okuyor" && !mesaj && <div style={{ position: "absolute", bottom: 14, fontSize: 13, color: "#F0EDE8" }}>Barkodu çerçeveye tut</div>}
        {mesaj && (
          <div role="status" style={{ position: "absolute", bottom: 14, left: 14, right: 14, padding: "12px 14px", borderRadius: 10, textAlign: "center", fontSize: 14, fontWeight: 800,
                                      background: mesaj.kotu ? "#C87A6A" : "#FFFFFF", color: "#000" }}>
            {mesaj.metin}
          </div>
        )}
        {durum === "hata" && (
          <div style={{ padding: 20, textAlign: "center", fontSize: 14, color: "#F0EDE8", lineHeight: 1.6, maxWidth: 360 }}>
            <Ikon ad="uyari" boy={22} style={{ display: "block", margin: "0 auto 8px" }} />{hata}
          </div>
        )}
      </div>

      {/* Elle giris: kamera yoksa ya da barkod yipranmissa */}
      <div style={{ display: "flex", gap: 8, padding: "12px 14px", borderTop: "1px solid #2A2A2A" }}>
        <input value={elle} onChange={e => setElle(e.target.value)} inputMode="numeric" placeholder="Ya da numarayı yaz"
               onKeyDown={e => { if (e.key === "Enter" && elle.trim()) { isle(elle); setElle(""); } }}
               style={{ flex: 1, minWidth: 0, minHeight: 44, padding: "0 12px", borderRadius: 10, border: "1px solid #2A2A2A", background: "#161616", color: "#F0EDE8", fontFamily: cv, fontSize: 15, outline: "none" }} />
        <button onClick={() => { if (elle.trim()) { isle(elle); setElle(""); } }} disabled={!elle.trim()}
                style={{ ...dugme, background: elle.trim() ? "#FFFFFF" : "#161616", color: elle.trim() ? "#000" : "#666" }}>
          Tamam
        </button>
      </div>
    </div>
  );
}
