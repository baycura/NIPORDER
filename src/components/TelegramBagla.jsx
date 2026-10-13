import { useAuth } from "../contexts/AuthContext.jsx";
import Ikon from "./Ikon.jsx";
import { ozellik } from "../lib/profil.js";

// Telegram baglantisi TEK kutu. Vardiyam'da uc ayri kutu vardi; part-time
// rolu Vardiyam'i hic goremedigi icin 3 part-time hesabinin hicbiri bagli
// degildi ve sahibe 170 yanlis "VARDIYADA KIMSE YOK" uyarisi gitti
// (20261013_telegram_gurultu.sql). Kutu, bagli olmayan herkese Masalar'da da
// gorunur.
const cvc = "'Coolvetica Condensed','Barlow Condensed',sans-serif";

export default function TelegramBagla({ bagliysaGoster = false, style }) {
  const { staffUser } = useAuth();
  if (!ozellik("telegram") || !staffUser?.id) return null;
  if (staffUser.telegram_chat_id) {
    if (!bagliysaGoster) return null;
    return (
      <div style={{background:"#161616",border:"1px solid #2A2A2A",borderRadius:10,padding:"10px 14px",marginBottom:16,color:"#FFFFFF",fontFamily:cvc,fontSize:12,fontWeight:700,letterSpacing:"0.5px",...style}}>
        <Ikon ad="ucak" boy={13} style={{marginRight:6}}/>Telegram bildirimleri açık — vardiyadayken QR siparişleri telefonuna gelir
      </div>
    );
  }
  return (
    <a href={"https://t.me/BaycuraBot?start=" + staffUser.id} target="_blank" rel="noreferrer"
       style={{display:"flex",alignItems:"center",gap:10,background:"#17212B",border:"1px solid #2AABEE",borderRadius:12,padding:"12px 16px",marginBottom:16,textDecoration:"none",...style}}>
      <Ikon ad="ucak" boy={21} style={{color:"#2AABEE"}}/>
      <div style={{flex:1}}>
        <div style={{color:"#F0EDE8",fontFamily:cvc,fontSize:14,fontWeight:700}}>Telegram bildirimlerini aç</div>
        <div style={{color:"#8AB4D8",fontFamily:cvc,fontSize:11,marginTop:2}}>Vardiyadayken müşterinin QR siparişi ve "hazır" haberi telefonuna gelsin</div>
      </div>
      <Ikon ad="sag" boy={16} style={{color:"#2AABEE"}}/>
    </a>
  );
}
