import Ikon from "./Ikon.jsx";

const cv = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";

// Yeni QR siparisi seridi (lib/qrZil.js). Mobilde alt menunun ustunde,
// masaustunde sag ustte durur; 30 sn sonra kendiliginden kapanir.
export default function QrSerit({ serit, onAc, onKapat, mobil }) {
  if (!serit) return null;
  const konum = mobil ? { left: 12, right: 12, bottom: 84 } : { top: 20, right: 24, width: 360 };
  return (
    <div role="status" aria-live="polite"
      style={{position:"fixed",zIndex:60,...konum,display:"flex",alignItems:"center",gap:10,
              padding:"10px 10px 10px 14px",background:"#161616",border:"1px solid #FFFFFF",borderRadius:12,
              boxShadow:"0 8px 24px rgba(0,0,0,0.55)",color:"#F0EDE8",fontFamily:cv}}>
      <Ikon ad="qr" boy={20}/>
      <button onClick={onAc}
        style={{flex:1,minWidth:0,background:"none",border:"none",padding:0,color:"inherit",
                textAlign:"left",cursor:"pointer",fontFamily:"inherit"}}>
        <b style={{display:"block",fontSize:14}}>Yeni QR siparişi</b>
        <span style={{display:"block",fontSize:12.5,color:"#8A8A86",marginTop:2,
                      whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
          {serit.ad} · {serit.adet} ürün{serit.diger > 0 ? ` · +${serit.diger} hesap daha` : ""}
        </span>
      </button>
      <button onClick={onAc}
        style={{minHeight:40,padding:"0 14px",borderRadius:9,border:"none",background:"#FFFFFF",color:"#000",
                fontFamily:"inherit",fontSize:13,fontWeight:800,cursor:"pointer",flexShrink:0}}>
        Aç
      </button>
      <button onClick={onKapat} aria-label="Şeridi kapat"
        style={{minWidth:40,minHeight:40,display:"flex",alignItems:"center",justifyContent:"center",
                background:"none",border:"none",color:"#8A8A86",cursor:"pointer",flexShrink:0}}>
        <Ikon ad="kapat" boy={16}/>
      </button>
    </div>
  );
}
