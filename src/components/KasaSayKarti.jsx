import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase.js";
import { useAuth } from "../contexts/AuthContext.jsx";
import Ikon from "./Ikon.jsx";

// Gece "Kasayi say" karti: Masalar, Siparisler ve Kasa'da ayni kart.
// Hizli odeme siparis ekranina gelince personel gece Kasa ekranina hic
// ugramayabiliyor; Paris'te kapanis sayimi 14.09'dan beri yapilmadi
// (20261013_kasa_yeniden_baslangic.sql). Kart 21:00-07:00 arasi, kasa gunu
// sayilmamissa ve o gun hareket varsa gorunur; sayim muhurlenince kaybolur.
// Kapanis saate bagli degil (bazen 00:30, bazen 03:00 sonrasi): "kasa gunu"nu
// sunucu belirler (nip_kasa_durumu).
const YENILE_MS = 3 * 60 * 1000;

export default function KasaSayKarti({ style }) {
  const { staffUser, isViewer, isKitchen } = useAuth();
  const navigate = useNavigate();
  const [durum, setDurum] = useState(null);

  useEffect(() => {
    const magazalar = staffUser?.store_ids || [];
    // Mutfak ve izleyici sayim giremez (fn_kasa_sayimi_doldur).
    if (!magazalar.length || isViewer || isKitchen) return;
    let iptal = false;
    const yukle = async () => {
      const saat = new Date().getHours();
      if (saat < 21 && saat >= 7) { if (!iptal) setDurum(null); return; }
      // Iki magazali hesap (sahip): hareketi olan ve sayilmamis ilk magaza.
      for (const m of magazalar) {
        const { data, error } = await supabase.rpc("nip_kasa_durumu", { p_store_id: m });
        if (iptal) return;
        const d = Array.isArray(data) ? data[0] : data;
        if (!error && d && d.hareket && !d.sayildi) { setDurum(d); return; }
      }
      if (!iptal) setDurum(null);
    };
    yukle();
    const t = setInterval(yukle, YENILE_MS);
    const gorunur = () => { if (document.visibilityState === "visible") yukle(); };
    document.addEventListener("visibilitychange", gorunur);
    return () => { iptal = true; clearInterval(t); document.removeEventListener("visibilitychange", gorunur); };
  }, [staffUser?.id]);

  if (!durum) return null;
  const acik = Number(durum.acik_adet || 0);
  return (
    <button onClick={() => navigate("/cash-count")}
      style={{width:"100%",display:"flex",alignItems:"center",gap:11,padding:"13px 14px",marginBottom:12,
              background:"#161616",border:"1px solid #FFFFFF",borderRadius:12,cursor:"pointer",
              color:"#F0EDE8",fontFamily:"inherit",textAlign:"left",fontSize:13,...style}}>
      <Ikon ad="nakit" boy={19}/>
      <span style={{flex:1,lineHeight:1.45}}>
        <b style={{fontSize:14}}>
          {acik > 0 ? `Kapanış: önce ${acik} açık hesabı kapat` : "Kasayı say"}
        </b>
        <span style={{display:"block",color:"#8A8A86",fontSize:12,marginTop:2}}>
          {acik > 0
            ? "Sonra kasayı say. Dükkanı kapatan sayar."
            : "Dükkanı kapatan sayar. Toplamı yazman yeterli."}
          {durum.yeniden ? " İlk sayım yeni başlangıç olur. Fark açıklaması gerekmez." : ""}
        </span>
      </span>
      <span style={{fontWeight:800,whiteSpace:"nowrap",display:"flex",alignItems:"center",gap:4}}>
        Say<Ikon ad="oksag" boy={13}/>
      </span>
    </button>
  );
}
