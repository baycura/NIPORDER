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

// Hesap ekrani tahsilattan sonra personeli GELDIGI listeye dondurur.
export function useSonListe(yol) {
  useEffect(() => { try { sessionStorage.setItem("nip_son_liste", yol); } catch (e) { /* gizli sekme */ } }, [yol]);
}
export const sonListe = () => {
  try { return sessionStorage.getItem("nip_son_liste") || "/tables"; } catch (e) { return "/tables"; }
};

export default function Bildirim({ metin: disMetin = null }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [metin, setMetin] = useState(disMetin || location.state?.bildirim || null);

  // Yonlendirmeyle gelen yazi bir kez gosterilir; geri tusu tekrar gostermesin.
  useEffect(() => {
    if (!location.state?.bildirim) return;
    setMetin(location.state.bildirim);
    navigate(location.pathname + location.search, { replace: true, state: {} });
  }, [location.key]);

  useEffect(() => {
    if (!metin) return;
    const z = setTimeout(() => setMetin(null), 3500);
    return () => clearTimeout(z);
  }, [metin]);

  if (!metin) return null;
  return (
    <div role="status" aria-live="polite"
      style={{position:"fixed",left:"50%",transform:"translateX(-50%)",bottom:"calc(96px + env(safe-area-inset-bottom))",zIndex:120,
              maxWidth:"calc(100vw - 32px)",display:"flex",alignItems:"center",gap:8,padding:"11px 16px",
              background:"#152015",border:"1px solid #2A3A2A",borderRadius:12,color:"#F0EDE8",fontSize:14,fontWeight:700,
              boxShadow:"0 6px 24px rgba(0,0,0,0.5)",fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif"}}>
      <span style={{color:"#7FA88A",display:"flex"}}><Ikon ad="onay" boy={16}/></span>
      <span>{metin}</span>
    </div>
  );
}
