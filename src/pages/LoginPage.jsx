import { useState } from "react";
import { useAuth } from "../contexts/AuthContext.jsx";
const cv="'Coolvetica','Bebas Neue',sans-serif";
const cvc="'Coolvetica Condensed','Barlow Condensed',sans-serif";
export default function LoginPage() {
  const { signIn } = useAuth();
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(false);
  const handleSubmit=async(e)=>{
    e?.preventDefault();
    if(!email||!password){setError("E-posta ve şifre gerekli");return;}
    setLoading(true);setError("");
    const{error}=await signIn(email.trim(),password);
    if(error){setError("Hatalı e-posta veya şifre");setLoading(false);}
  };
  return(
    <div style={{minHeight:"100vh",background:"#0C0C0C",display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
      <div style={{width:"100%",maxWidth:400}}>
        <div style={{textAlign:"center",marginBottom:40}}>
          <div style={{width:60,height:60,borderRadius:16,background:"#C8973E",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px",fontFamily:cv,fontSize:34,color:"#000"}}>N</div>
          <div style={{color:"#F0EDE8",fontFamily:cv,fontSize:36,letterSpacing:"-1px"}}>NOT IN PARIS</div>
          <div style={{color:"#888",fontFamily:cvc,fontSize:11,letterSpacing:"2px",marginTop:6}}>order.notinparis.me · PERSONEL GİRİŞİ</div>
        </div>
        <form onSubmit={handleSubmit} style={{background:"#1E1E1E",border:"1px solid #2A2A2A",borderRadius:16,padding:28}}>
          <div style={{color:"#888",fontFamily:cvc,fontSize:10,letterSpacing:"2px",marginBottom:6}}>E-POSTA</div>
          <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="isim@notinparis.me" style={{width:"100%",background:"#111",border:"1px solid #2A2A2A",borderRadius:8,padding:"12px 14px",color:"#F0EDE8",fontFamily:cvc,fontSize:15,marginBottom:16}}/>
          <div style={{color:"#888",fontFamily:cvc,fontSize:10,letterSpacing:"2px",marginBottom:6}}>ŞİFRE</div>
          <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" style={{width:"100%",background:"#111",border:"1px solid #2A2A2A",borderRadius:8,padding:"12px 14px",color:"#F0EDE8",fontFamily:cvc,fontSize:15,marginBottom:20}}/>
          {error&&<div style={{color:"#E05A5A",fontFamily:cvc,fontSize:11,marginBottom:14}}>⚠ {error}</div>}
          <button type="submit" disabled={loading} style={{width:"100%",padding:"14px",background:loading?"#555":"#C8973E",border:"none",color:"#000",fontFamily:cv,fontSize:20,letterSpacing:"1px",borderRadius:8,cursor:"pointer"}}>{loading?"GİRİŞ YAPILIYOR...":"GİRİŞ YAP"}</button>
        </form>
        <div style={{marginTop:12,color:"#555",fontFamily:cvc,fontSize:11,textAlign:"center"}}>Hesabınız yoksa yöneticinizle iletişime geçin</div>
      </div>
    </div>
  );
}