import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Ikon from "./Ikon.jsx";

// KISA BILGI YAZISI. Tahsilattan sonra tarayicinin "Tamam" penceresi
// ekranin ortasinda acilip bir dokunus daha istiyordu; tezgah satisinda
// her musteride. Bu yazi 3,5 saniye gorunur ve kendiliginden kaybolur.
//
// Iki kullanim:
//   <Bildirim/>              -> navigate(yol, { state: { bildirim: "..." } }) ile gelen yazi
//   <Bildirim metin="..." key={sayac}/> -> ayni sayfada gosterilecek yazi
//
// tur:   "basari" (varsayilan, yesil) | "uyari" (notr) | "hata" (kirmizi, 6 sn, role=alert)
// konum: "alt" (varsayilan; alt bar ustunde) | "ust" (musteri menusu: sepet dugmesini kapatmasin)
// alt:   alttan bosluk (px). Dokunusu YUTMAZ (pointerEvents none): altindaki Kart/Nakit
//        dugmesi bildirim gorunurken de basilir.
const GORUNUM = {
  basari: { zemin: "#152015", kenar: "#2A3A2A", ikon: "onay", renk: "#7FA88A" },
  uyari:  { zemin: "#101214", kenar: "#3A3A3A", ikon: "uyari", renk: "#E8C9A0" },
  hata:   { zemin: "#241412", kenar: "#C87A6A", ikon: "uyari", renk: "#C87A6A" },
};

// Hesap ekrani tahsilattan sonra personeli GELDIGI listeye dondurur.
export function useSonListe(yol) {
  useEffect(() => { try { sessionStorage.setItem("nip_son_liste", yol); } catch (e) { /* gizli sekme */ } }, [yol]);
}
export const sonListe = () => {
  try { return sessionStorage.getItem("nip_son_liste") || "/tables"; } catch (e) { return "/tables"; }
};

export default function Bildirim({ metin: disMetin = null, tur = "basari", sure, konum = "alt", alt = 96 }) {
  const location = useLocation();
  const navigate = useNavigate();
  // Yonlendirme yazisini yalniz METINSIZ ornek dinler. Metin verilen ornek
  // (ornegin UyariYuvasi'ndaki kalici yuva) dinlerse ayni basari yazisi ikinci
  // kez, ustte ve son uyarinin kirmizi gorunumuyle cikiyordu.
  const yonlu = disMetin == null;
  const [metin, setMetin] = useState(disMetin || (yonlu ? location.state?.bildirim : null) || null);

  // Yonlendirmeyle gelen yazi bir kez gosterilir; geri tusu tekrar gostermesin.
  useEffect(() => {
    if (!yonlu || !location.state?.bildirim) return;
    setMetin(location.state.bildirim);
    navigate(location.pathname + location.search, { replace: true, state: {} });
  }, [location.key]);

  useEffect(() => {
    if (!metin) return;
    const z = setTimeout(() => setMetin(null), sure || (tur === "hata" ? 6000 : 3500));
    return () => clearTimeout(z);
  }, [metin, sure, tur]);

  if (!metin) return null;
  const g = GORUNUM[tur] || GORUNUM.basari;
  const yer = konum === "ust"
    ? { top: "calc(12px + env(safe-area-inset-top))" }
    : { bottom: `calc(${alt}px + env(safe-area-inset-bottom))` };
  return (
    <div role={tur === "hata" ? "alert" : "status"} aria-live={tur === "hata" ? "assertive" : "polite"}
      style={{position:"fixed",left:"50%",transform:"translateX(-50%)",...yer,zIndex:300,pointerEvents:"none",
              width:"max-content",maxWidth:"calc(100vw - 32px)",display:"flex",alignItems:"center",gap:8,padding:"11px 16px",
              background:g.zemin,border:"1px solid " + g.kenar,borderRadius:12,color:"#F0EDE8",fontSize:14,fontWeight:700,
              boxShadow:"0 6px 24px rgba(0,0,0,0.5)",fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif"}}>
      <span style={{color:g.renk,display:"flex",flexShrink:0}}><Ikon ad={g.ikon} boy={16}/></span>
      <span style={{lineHeight:1.4,whiteSpace:"pre-line",overflowWrap:"anywhere"}}>{metin}</span>
    </div>
  );
}
