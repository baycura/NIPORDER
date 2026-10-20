import { useState } from "react";
import { doner } from "./supabase.js";
import { C, cv, hv, S, Alan, hataMetni } from "./ortak.jsx";

// Giris / kayit / sifre sifirlama. Kayit olan kisi hemen giremez: once admin
// (Omer, Ceren, Tolga) Kullanicilar ekranindan onaylar (doner_kullanicilar.aktif).
export default function Giris() {
  const [sekme, setSekme] = useState("giris");   // giris | kayit | sifirla
  const [ad, setAd] = useState("");
  const [eposta, setEposta] = useState("");
  const [sifre, setSifre] = useState("");
  const [hata, setHata] = useState("");
  const [bilgi, setBilgi] = useState("");
  const [busy, setBusy] = useState(false);

  const gonder = async (e) => {
    e?.preventDefault();
    setHata(""); setBilgi("");
    const ep = eposta.trim().toLowerCase();
    if (!ep || (sekme !== "sifirla" && !sifre)) { setHata("E-posta ve şifre gerekli."); return; }
    if (sekme === "kayit" && sifre.length < 6) { setHata("Şifre en az 6 karakter olmalı."); return; }
    setBusy(true);
    try {
      if (sekme === "giris") {
        const { error } = await doner.auth.signInWithPassword({ email: ep, password: sifre });
        if (error) setHata("E-posta ya da şifre hatalı.");
      } else if (sekme === "kayit") {
        // emailRedirectTo: onay baglantisi bu siteye donsun (Supabase > Auth > URL
        // Configuration > Redirect URLs listesinde bu adres olmali; yoksa kafe
        // sitesine duser).
        const { data, error } = await doner.auth.signUp({ email: ep, password: sifre, options: { data: { ad: ad.trim() }, emailRedirectTo: window.location.origin + "/" } });
        if (error) setHata(hataMetni(error));
        else if (!data.session) { setBilgi("Kayıt alındı. E-postana gelen bağlantıya dokun, sonra giriş yap."); setSekme("giris"); }
      } else {
        const { error } = await doner.auth.resetPasswordForEmail(ep, { redirectTo: window.location.origin + "/" });
        if (error) setHata(hataMetni(error));
        else { setBilgi("Şifre bağlantısı e-postana gönderildi."); setSekme("giris"); }
      }
    } finally { setBusy(false); }
  };

  const sekmeDugme = (k, l) => (
    <button key={k} type="button" onClick={() => { setSekme(k); setHata(""); setBilgi(""); }} style={{ ...S.cip(sekme === k), flex: 1 }}>{l}</button>
  );

  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: cv }}>
      <div style={{ width: "100%", maxWidth: 400 }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ width: 60, height: 60, borderRadius: 16, background: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px", fontFamily: hv, fontSize: 34, color: "#000" }}>D</div>
          <div style={{ color: C.ink, fontFamily: hv, fontSize: 40, letterSpacing: 2 }}>DÖNER DEFTERİ</div>
          <div style={{ color: C.muted, fontSize: 12, letterSpacing: 1, marginTop: 4 }}>NOT IN PARIS DÖNER</div>
        </div>
        <form onSubmit={gonder} style={{ ...S.kart, padding: 22 }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 18 }}>
            {sekmeDugme("giris", "Giriş")}{sekmeDugme("kayit", "Kayıt ol")}{sekmeDugme("sifirla", "Şifremi unuttum")}
          </div>
          {sekme === "kayit" && (
            <Alan etiket="AD SOYAD"><input value={ad} onChange={e => setAd(e.target.value)} placeholder="Örn: Tolga Can" style={S.alan} autoComplete="name" /></Alan>
          )}
          <Alan etiket="E-POSTA"><input type="email" value={eposta} onChange={e => setEposta(e.target.value)} placeholder="isim@eposta.com" style={S.alan} autoComplete="email" inputMode="email" /></Alan>
          {sekme !== "sifirla" && (
            <Alan etiket="ŞİFRE"><input type="password" value={sifre} onChange={e => setSifre(e.target.value)} placeholder="••••••••" style={S.alan} autoComplete={sekme === "kayit" ? "new-password" : "current-password"} /></Alan>
          )}
          {hata && <div style={{ color: C.down, fontSize: 13, marginBottom: 12 }}>{hata}</div>}
          {bilgi && <div style={{ color: C.ink, fontSize: 13, marginBottom: 12, lineHeight: 1.5 }}>{bilgi}</div>}
          <button type="submit" disabled={busy} style={{ ...S.dugme(true), width: "100%", opacity: busy ? 0.6 : 1 }}>
            {busy ? "Bekle…" : sekme === "giris" ? "GİRİŞ YAP" : sekme === "kayit" ? "KAYIT OL" : "BAĞLANTI GÖNDER"}
          </button>
        </form>
        <div style={{ marginTop: 12, color: C.faint, fontSize: 12, textAlign: "center", lineHeight: 1.5 }}>
          Yeni hesap, yöneticilerden biri onaylayınca açılır.
        </div>
      </div>
    </div>
  );
}
