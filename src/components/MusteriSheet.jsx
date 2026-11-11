import { useEffect, useRef } from "react";
import Ikon from "./Ikon.jsx";

// MUSTERI ALT PENCERESI — karartma + alttan acilan beyaz kutu.
//
// Musteri menusunde ayni kalip yedi kez satir icinde yaziliydi: karartma 0.5
// ya da 0.55, kose 18 ya da 20, role=dialog yok, giris ve secenek
// pencerelerinde kapat dugmesi yok. En zararlisi: rezervasyon ve giris
// formunda karartiya degen parmak yazilan her seyi siliyordu.
//
// MODUL duzeyinde tanimli olmali. Sayfa bileseninin icinde tanimlanirsa her
// tus vurusunda yeniden kurulur ve giris kutusu odagi kaybeder.
//
//   etiket        ekran okuyucunun okudugu ad (aria-label)
//   onKapat       kapat dugmesi, Esc ve karartma bunu cagirir
//   kilit         true: karartma KAPATMAZ (yazilan bilgi kaybolmasin);
//                 kapat dugmesi ve Esc yine calisir
//   zorunlu       true: hicbir yoldan kapanmaz (KVKK yeniden onay)
//   kapatDugmesi  false: pencerenin kendi kapat dugmesi var
//   kapat         "ust": dugme icerigin ustunde ayri satirda (sag ustte
//                 baska oge varsa); varsayilan: sag ust kosede
//   sutun         kutu dikey esnek (icinde kendi kayan alani olan pencere)
//   kutu          beyaz kutu icin stil ekleri (padding, maxWidth, maxHeight)

// Ust uste acik pencerelerde Esc yalniz EN USTTEKINI kapatir.
const yigin = [];

export default function MusteriSheet({
  etiket, onKapat, kilit = false, zorunlu = false, kapatDugmesi = true, kapat = "kose",
  kapatEtiket = "Kapat", sutun = false, z = 120, kutu = null, children,
}) {
  const kimlik = useRef({});
  const kapatRef = useRef(onKapat);
  useEffect(() => { kapatRef.current = onKapat; });

  useEffect(() => {
    const ben = kimlik.current;
    yigin.push(ben);
    const tus = (e) => {
      if (e.key !== "Escape" || zorunlu) return;
      if (yigin[yigin.length - 1] !== ben) return;
      kapatRef.current?.();
    };
    window.addEventListener("keydown", tus);
    return () => {
      window.removeEventListener("keydown", tus);
      const i = yigin.indexOf(ben);
      if (i >= 0) yigin.splice(i, 1);
    };
  }, [zorunlu]);

  const dugme = (!zorunlu && kapatDugmesi) ? (
    <button type="button" onClick={() => onKapat?.()} aria-label={kapatEtiket}
      style={{ width: 44, height: 44, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
               background: "none", border: "none", color: "#666666", cursor: "pointer", borderRadius: 12,
               ...(kapat === "ust" ? {} : { position: "absolute", top: 6, right: 6 }) }}>
      <Ikon ad="kapat" boy={18} />
    </button>
  ) : null;

  return (
    <div role="dialog" aria-modal="true" aria-label={etiket}
      onClick={(e) => { if (e.target === e.currentTarget && !kilit && !zorunlu) onKapat?.(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex",
               alignItems: "flex-end", justifyContent: "center", zIndex: z }}>
      <div style={{ position: "relative", background: "#fff", borderRadius: "20px 20px 0 0", boxSizing: "border-box",
                    padding: "22px 20px calc(30px + env(safe-area-inset-bottom))", width: "100%", maxWidth: 520,
                    maxHeight: "92vh", ...(sutun ? { display: "flex", flexDirection: "column" } : { overflowY: "auto" }),
                    ...kutu }}>
        {dugme && kapat === "ust"
          ? <div style={{ display: "flex", justifyContent: "flex-end", margin: "-14px -12px 0 0" }}>{dugme}</div>
          : dugme}
        {children}
      </div>
    </div>
  );
}
