import { createContext, useContext, useEffect, useState } from "react";
import { Routes, Route, Navigate, NavLink, useNavigate } from "react-router-dom";
import { doner } from "./supabase.js";
import { C, cv, hv, S, Yukleniyor, Alan, hataMetni } from "./ortak.jsx";
import Ikon from "../components/Ikon.jsx";
import Giris from "./Giris.jsx";
import Ozet from "./Ozet.jsx";
import Giderler from "./Giderler.jsx";
import GunSonu from "./GunSonu.jsx";
import Urunler from "./Urunler.jsx";
import Borclular from "./Borclular.jsx";
import Kullanicilar from "./Kullanicilar.jsx";
import Ayarlar from "./Ayarlar.jsx";

// DONER DEFTERI — ayri limited sirketin basit defteri (sahip istegi 20.10).
// VITE_PROFIL=doner ile ayri site olarak kurulur (isletme/doner). Kafe
// uygulamasiyla ortak olan tek sey veritabani; kullanici, menu ve ekranlar
// ayridir. Sunucu kurallari: supabase/migrations/20261020_doner_defter.sql.
const DonerCtx = createContext(null);
export const useDoner = () => useContext(DonerCtx);

const SEKMELER = [
  { to: "/",          ikon: "rapor",  ad: "Özet" },
  { to: "/giderler",  ikon: "gider",  ad: "Giderler" },
  { to: "/gunsonu",   ikon: "kasa",   ad: "Gün sonu" },
  { to: "/urunler",   ikon: "menu",   ad: "Ürünler" },
  { to: "/borclular", ikon: "veresiye", ad: "Borçlular" },
];

function Kabuk({ children }) {
  const { ben, admin, cikis } = useDoner();
  const navigate = useNavigate();
  const [menu, setMenu] = useState(false);
  return (
    <div style={{ background: C.bg, minHeight: "100vh", color: C.ink, fontFamily: cv }}>
      <header style={{ position: "sticky", top: 0, zIndex: 40, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px",
                       background: C.card, borderBottom: `1px solid ${C.line}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: hv, fontSize: 18, color: "#000" }}>D</div>
          <div style={{ fontFamily: hv, fontSize: 18, letterSpacing: 1 }}>DÖNER DEFTERİ</div>
        </div>
        <button onClick={() => setMenu(m => !m)} aria-label="Hesap menüsü"
                style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: `1px solid ${C.line}`, borderRadius: 20, padding: "5px 10px 5px 6px", color: C.ink, cursor: "pointer", fontFamily: cv }}>
          <div style={{ width: 26, height: 26, borderRadius: "50%", background: "rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800 }}>{ben.ad?.[0] || "?"}</div>
          <span style={{ fontSize: 12, fontWeight: 700, maxWidth: 110, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ben.ad}</span>
        </button>
      </header>
      {menu && (
        <div onClick={() => setMenu(false)} style={{ position: "fixed", inset: 0, zIndex: 45 }}>
          <div onClick={e => e.stopPropagation()} style={{ position: "absolute", right: 12, top: 56, minWidth: 200, background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, overflow: "hidden", boxShadow: "0 8px 24px rgba(0,0,0,0.5)" }}>
            <div style={{ padding: "10px 14px", fontSize: 12, color: C.muted, borderBottom: `1px solid ${C.line}` }}>{ben.rol === "admin" ? "Yönetici" : "Personel"}</div>
            {admin && (
              <button onClick={() => { setMenu(false); navigate("/kullanicilar"); }} style={{ width: "100%", textAlign: "left", padding: "12px 14px", background: "none", border: "none", color: C.ink, fontFamily: cv, fontSize: 14, cursor: "pointer", display: "flex", gap: 10, alignItems: "center" }}>
                <Ikon ad="personel" boy={16} />Kullanıcılar
              </button>
            )}
            {admin && (
              <button onClick={() => { setMenu(false); navigate("/ayarlar"); }} style={{ width: "100%", textAlign: "left", padding: "12px 14px", background: "none", border: "none", borderTop: `1px solid ${C.line}`, color: C.ink, fontFamily: cv, fontSize: 14, cursor: "pointer", display: "flex", gap: 10, alignItems: "center" }}>
                <Ikon ad="ayar" boy={16} />Ayarlar
              </button>
            )}
            <button onClick={cikis} style={{ width: "100%", textAlign: "left", padding: "12px 14px", background: "none", border: "none", borderTop: `1px solid ${C.line}`, color: C.ink, fontFamily: cv, fontSize: 14, cursor: "pointer", display: "flex", gap: 10, alignItems: "center" }}>
              <Ikon ad="cikis" boy={16} />Çıkış
            </button>
          </div>
        </div>
      )}
      <main style={{ padding: "16px 14px 96px", maxWidth: 760, margin: "0 auto" }}>{children}</main>
      <nav style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: C.card, borderTop: `1px solid ${C.line}`, display: "flex", justifyContent: "space-around", padding: "8px 0 14px", zIndex: 35 }}>
        {SEKMELER.map(s => (
          <NavLink key={s.to} to={s.to} end={s.to === "/"} style={({ isActive }) => ({ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, textDecoration: "none", color: isActive ? "#FFFFFF" : "#666", padding: "4px 6px", minWidth: 56 })}>
            <Ikon ad={s.ikon} boy={22} />
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.2px" }}>{s.ad.toLocaleUpperCase("tr-TR")}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

function OnayBekliyor({ ben, onYenile, onCikis }) {
  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.ink, fontFamily: cv, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ ...S.kart, maxWidth: 400, width: "100%", textAlign: "center", padding: 24 }}>
        <Ikon ad="bekleme" boy={30} style={{ margin: "0 auto 10px", display: "block" }} />
        <div style={{ fontSize: 18, fontWeight: 800 }}>Onay bekliyor</div>
        <div style={{ fontSize: 13, color: C.muted, marginTop: 8, lineHeight: 1.6 }}>
          {ben?.ad ? `${ben.ad}, hesabın alındı.` : "Hesabın alındı."} Yöneticilerden biri onaylayınca defter açılır.
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 18, justifyContent: "center" }}>
          <button onClick={onYenile} style={S.dugme(true)}>Yeniden dene</button>
          <button onClick={onCikis} style={S.dugme(false)}>Çıkış</button>
        </div>
      </div>
    </div>
  );
}

// Sifre sifirlama baglantisindan gelindiginde yeni sifre.
function YeniSifre({ onBitti }) {
  const [sifre, setSifre] = useState("");
  const [hata, setHata] = useState("");
  const kaydet = async (e) => {
    e.preventDefault();
    if (sifre.length < 6) { setHata("Şifre en az 6 karakter olmalı."); return; }
    const { error } = await doner.auth.updateUser({ password: sifre });
    if (error) { setHata(hataMetni(error)); return; }
    onBitti();
  };
  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.ink, fontFamily: cv, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <form onSubmit={kaydet} style={{ ...S.kart, maxWidth: 400, width: "100%", padding: 24 }}>
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 14 }}>Yeni şifre</div>
        <Alan etiket="ŞİFRE"><input type="password" value={sifre} onChange={e => setSifre(e.target.value)} style={S.alan} autoComplete="new-password" /></Alan>
        {hata && <div style={{ color: C.down, fontSize: 13, marginBottom: 12 }}>{hata}</div>}
        <button type="submit" style={{ ...S.dugme(true), width: "100%" }}>KAYDET</button>
      </form>
    </div>
  );
}

export default function DonerApp() {
  const [oturum, setOturum] = useState(undefined);
  const [ben, setBen] = useState(undefined);
  const [uyeler, setUyeler] = useState([]);
  const [sifirlama, setSifirlama] = useState(false);

  useEffect(() => {
    let iptal = false;
    doner.auth.getSession().then(({ data }) => { if (!iptal) setOturum(data.session || null); });
    const { data: abone } = doner.auth.onAuthStateChange((olay, s) => {
      if (olay === "PASSWORD_RECOVERY") setSifirlama(true);
      setOturum(s || null);
    });
    return () => { iptal = true; abone.subscription.unsubscribe(); };
  }, []);

  // Kendi satirim; yoksa kayit istegi (ilk giris). Onay admin'den gelir.
  const benYukle = async () => {
    if (!oturum) { setBen(null); return; }
    const { data } = await doner.from("doner_kullanicilar").select("*").eq("auth_id", oturum.user.id).maybeSingle();
    if (data) { setBen(data); return; }
    const { data: yeni } = await doner.rpc("doner_kayit_iste", { p_ad: oturum.user.user_metadata?.ad || null });
    setBen(yeni || null);
  };
  useEffect(() => { if (oturum !== undefined) benYukle(); }, [oturum?.user?.id]);

  const uyeleriYukle = () => doner.from("doner_kullanicilar").select("auth_id, ad, rol, aktif, eposta").order("ad")
    .then(({ data }) => setUyeler(data || []));
  useEffect(() => { if (ben?.aktif) uyeleriYukle(); else setUyeler([]); }, [ben?.aktif]);

  const cikis = async () => { await doner.auth.signOut(); setBen(null); };

  if (oturum === undefined || (oturum && ben === undefined)) return <div style={{ background: C.bg, minHeight: "100vh" }}><Yukleniyor /></div>;
  if (!oturum) return <Giris />;
  if (sifirlama) return <YeniSifre onBitti={() => setSifirlama(false)} />;
  if (!ben?.aktif) return <OnayBekliyor ben={ben} onYenile={benYukle} onCikis={cikis} />;

  return (
    <DonerCtx.Provider value={{ ben, uyeler, admin: ben.rol === "admin", uyeleriYukle, cikis }}>
      <Kabuk>
        <Routes>
          <Route path="/" element={<Ozet />} />
          <Route path="/giderler" element={<Giderler />} />
          <Route path="/gunsonu" element={<GunSonu />} />
          <Route path="/urunler" element={<Urunler />} />
          <Route path="/borclular" element={<Borclular />} />
          <Route path="/kullanicilar" element={ben.rol === "admin" ? <Kullanicilar /> : <Navigate to="/" replace />} />
          <Route path="/ayarlar" element={ben.rol === "admin" ? <Ayarlar /> : <Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Kabuk>
    </DonerCtx.Provider>
  );
}
