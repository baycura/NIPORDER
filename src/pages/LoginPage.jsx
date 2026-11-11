import { useState, useRef, useEffect } from "react";
import { supabase } from "../lib/supabase.js";
import { personelHata } from "../lib/errorText.js";
import { APP_HOST } from "../lib/appUrl.js";
import { MARKA } from "../lib/profil.js";
import { useAuth } from "../contexts/AuthContext.jsx";
import Ikon from "../components/Ikon.jsx";
const cv="'Coolvetica','Bebas Neue',sans-serif";
const cvc="'Coolvetica Condensed','Barlow Condensed',sans-serif";
export default function LoginPage() {
  const { signIn, signOut } = useAuth();
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(false);
  const canli=useRef(true);
  const bekleme=useRef(null);
  useEffect(()=>{canli.current=true;return()=>{canli.current=false;clearTimeout(bekleme.current);};},[]);
  const dur=(mesaj)=>{if(!canli.current)return;setError(mesaj);setLoading(false);};
  const handleSubmit=async(e)=>{
    e?.preventDefault();
    if(loading)return;
    if(!email||!password){setError("E-posta ve şifre gerekli");return;}
    setLoading(true);setError("");
    clearTimeout(bekleme.current);
    let sonuc;
    try{sonuc=await signIn(email.trim(),password);}catch(err){dur(personelHata(err));return;}
    const{data,error}=sonuc||{};
    if(error){
      // Her hata "sifre yanlis" degildir: baglanti yokken de ayni metin cikiyordu.
      const m=String(error.message||"");
      dur(/invalid login credentials|invalid_credentials/i.test(m)?"Hatalı e-posta veya şifre"
        :/email not confirmed/i.test(m)?"E-posta adresi doğrulanmamış. Yöneticine haber ver."
        :(error.status===429||/rate limit|too many/i.test(m))?"Çok fazla deneme yapıldı. Bir dakika bekleyip tekrar dene."
        :personelHata(error));
      return;
    }
    // Sifre dogru ama personel kaydi yoksa ya da pasifse ekran "GİRİŞ YAPILIYOR"da
    // kaliyordu (yonlendirme yalniz aktif personelde olur). Sebebi soyle.
    try{
      const uid=data?.user?.id;
      if(uid){
        const{data:s,error:se}=await supabase.from("staff").select("id,is_active").eq("auth_id",uid).maybeSingle();
        if(se){dur(personelHata(se));return;}
        if(!s){dur("Bu hesap personel hesabı değil. Yöneticine haber ver.");return;}
        if(s.is_active===false){try{await signOut();}catch(_e){/* oturum zaten kapali olabilir */}dur("Hesabın pasif. Yöneticine haber ver.");return;}
      }
    }catch(err){dur(personelHata(err));return;}
    // Aktif personel: yonlendirme oturum yuklenince olur. Olmazsa ekran kilitli kalmasin.
    bekleme.current=setTimeout(()=>dur("Giriş tamamlanamadı. Sayfayı yenileyip tekrar dene."),10000);
  };
  return(
    <div style={{minHeight:"100vh",background:"#0C0C0C",display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
      <div style={{width:"100%",maxWidth:400}}>
        <div style={{textAlign:"center",marginBottom:40}}>
          <div style={{width:60,height:60,borderRadius:16,background:"#FFFFFF",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px",fontFamily:cv,fontSize:34,color:"#000"}}>{MARKA.harf}</div>
          <div style={{color:"#F0EDE8",fontFamily:"'Coolvetica Condensed','Barlow Condensed','Bebas Neue',sans-serif",fontSize:42,fontWeight:900,letterSpacing:"2px"}}>{MARKA.buyuk}</div>
          <div style={{color:"#888",fontFamily:cvc,fontSize:11,letterSpacing:"2px",marginTop:6}}>{APP_HOST} · PERSONEL GİRİŞİ</div>
        </div>
        <form onSubmit={handleSubmit} style={{background:"#1E1E1E",border:"1px solid #2A2A2A",borderRadius:16,padding:28}}>
          <div style={{color:"#888",fontFamily:cvc,fontSize:12,letterSpacing:"0.2px",marginBottom:6}}>E-posta</div>
          <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder={"isim@" + MARKA.epostaAlani}
            style={{width:"100%",background:"#111",border:"1px solid #2A2A2A",borderRadius:8,padding:"12px 14px",color:"#F0EDE8",fontFamily:cvc,fontSize:15,marginBottom:16}}/>
          <div style={{color:"#888",fontFamily:cvc,fontSize:12,letterSpacing:"0.2px",marginBottom:6}}>Şifre</div>
          <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••"
            style={{width:"100%",background:"#111",border:"1px solid #2A2A2A",borderRadius:8,padding:"12px 14px",color:"#F0EDE8",fontFamily:cvc,fontSize:15,marginBottom:20}}/>
          {error&&<div role="alert" style={{color:"#C87A6A",fontFamily:cvc,fontSize:13,lineHeight:1.4,marginBottom:14}}><Ikon ad="uyari" boy={12} style={{marginRight:5}}/>{error}</div>}
          <button type="submit" disabled={loading}
            style={{width:"100%",padding:"14px",background:loading?"#555":"#FFFFFF",border:"none",color:"#000",fontFamily:cv,fontSize:20,letterSpacing:"1px",borderRadius:8,cursor:"pointer"}}>
            {loading?"GİRİŞ YAPILIYOR…":"GİRİŞ YAP"}
          </button>
        </form>
        <div style={{marginTop:12,color:"#888888",fontFamily:cvc,fontSize:11,textAlign:"center"}}>Hesabınız yoksa yöneticinizle iletişime geçin</div>
      </div>
    </div>
  );
}
