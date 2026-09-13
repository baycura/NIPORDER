import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { ozellik } from "../lib/profil.js";
import { APP_HOST } from "../lib/appUrl.js";
import { mutfakClient } from "../lib/mutfakSupabase.js";
import { ayGecerli, guncelAy, hakedisRaporu, raporOku, raporSakla } from "../lib/hakedis.js";
import { hataMetni } from "../lib/supabase.js";
import HakedisOzeti, { PaylasSatiri, C, cv, hv } from "../components/HakedisOzeti.jsx";
import Ikon from "../components/Ikon.jsx";

// /mutfak-rapor — doner mutfaginin kendi gozuyle hakedis.
//
// Sahip (2026-09-12): "onlar da istatistik olarak bizim onlardan ne
// aldigimizi gorebilse". Mutfak NIP personeli degil; pano uygulamasindaki
// tek e-posta/sifre hesabiyla girer. Bu sayfa StaffLayout/PrivateRoute/
// AuthContext'in DISINDADIR ve kendi supabase istemcisini kullanir
// (lib/mutfakSupabase.js, storageKey farkli): ana oturuma degmez, ayni
// telefonda personel girisiyle yan yana yasar.
//
// Yetki sunucuda: nip_mutfak_hakedis_raporu yalniz nip_mutfak_ortaklar'daki
// hesaba (ve NIP yoneticilerine) cevap verir. Baska bir hesap girerse 42501
// gelir; sayfa hemen cikis yapar ve hangi e-postanin reddedildigini soyler —
// bir NIP garsonu hesabi burada takili kalmaz.
//
// Gorunmeyenler: NIP cirosu, musteri/personel adlari, indirim ayrintisi.
// RPC bunlari zaten vermez; sayfa baska sorgu atmaz.

const EPOSTA_ANAHTAR = "nip-mutfak-eposta";
const alan = {
  width: "100%", boxSizing: "border-box", background: "#111", border: "1px solid #2A2A2A", borderRadius: 10,
  padding: "0 14px", minHeight: 52, color: "#F0EDE8", fontFamily: cv, fontSize: 16,   // 16px: iOS zoom tetiklemez
};

function Sayfa({ children }) {
  return (
    <div style={{ minHeight: "100vh", background: "#0C0C0C", color: C.ink, fontFamily: cv }}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "14px 16px 60px" }}>{children}</div>
    </div>
  );
}

function Giris({ mutfak, reddedilen }) {
  const [eposta, setEposta] = useState(() => { try { return localStorage.getItem(EPOSTA_ANAHTAR) || ""; } catch { return ""; } });
  const [sifre, setSifre] = useState("");
  const [goster, setGoster] = useState(false);
  const [hata, setHata] = useState("");
  const [bekle, setBekle] = useState(false);

  const gonder = async (e) => {
    e?.preventDefault();
    if (!eposta.trim() || !sifre) { setHata("E-posta ve şifre gerekli"); return; }
    setBekle(true); setHata("");
    const { error } = await mutfak.auth.signInWithPassword({ email: eposta.trim(), password: sifre });
    if (error) {
      const m = hataMetni(error);
      setHata(error.name === "Bağlantı" || /cevap gelmedi|fetch|network/i.test(m) ? "Bağlantı yok, tekrar dene" : "E-posta veya şifre hatalı");
      setBekle(false);
      return;
    }
    try { localStorage.setItem(EPOSTA_ANAHTAR, eposta.trim()); } catch { /* gizli mod */ }
    // oturum onAuthStateChange ile gelir; sayfa rapora gecer
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0C0C0C", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: cv }}>
      <div style={{ width: "100%", maxWidth: 400 }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ width: 60, height: 60, borderRadius: 16, background: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px", fontFamily: hv, fontSize: 34, color: "#000" }}>D</div>
          <div style={{ color: C.ink, fontFamily: hv, fontSize: 40, fontWeight: 900, letterSpacing: 2, lineHeight: 1 }}>DÖNER MUTFAĞI</div>
          <div style={{ color: C.muted, fontSize: 11, letterSpacing: 2, marginTop: 8 }}>NOT IN PARIS · HAKEDİŞ RAPORU</div>
        </div>
        <form onSubmit={gonder} style={{ background: "#1E1E1E", border: "1px solid #2A2A2A", borderRadius: 16, padding: 24 }}>
          {reddedilen && (
            <div style={{ color: C.down, fontSize: 12, lineHeight: 1.5, marginBottom: 14, padding: "10px 12px", border: "1px solid #5a4a46", borderRadius: 8, background: "rgba(200,122,106,0.10)" }}>
              <Ikon ad="uyari" boy={12} style={{ marginRight: 5 }} />
              <b>{reddedilen}</b> mutfak raporuna yetkili değil. Pano hesabınızla girin.
            </div>
          )}
          <div style={{ color: C.muted, fontSize: 12, marginBottom: 6 }}>E-posta</div>
          <input type="email" inputMode="email" autoComplete="username" autoCapitalize="none" value={eposta} onChange={e => setEposta(e.target.value)}
            placeholder="pano@…" style={{ ...alan, marginBottom: 14 }} />
          <div style={{ color: C.muted, fontSize: 12, marginBottom: 6 }}>Şifre</div>
          <div style={{ position: "relative", marginBottom: 18 }}>
            <input type={goster ? "text" : "password"} autoComplete="current-password" value={sifre} onChange={e => setSifre(e.target.value)}
              placeholder="••••••••" style={{ ...alan, paddingRight: 76 }} />
            <button type="button" onClick={() => setGoster(v => !v)} style={{ position: "absolute", right: 8, top: 8, bottom: 8, padding: "0 10px", background: "none", border: `1px solid ${C.cardLine}`, color: C.muted, borderRadius: 8, cursor: "pointer", fontSize: 12, fontFamily: cv }}>
              {goster ? "Gizle" : "Göster"}
            </button>
          </div>
          {hata && <div style={{ color: C.down, fontSize: 12, marginBottom: 12 }}><Ikon ad="uyari" boy={12} style={{ marginRight: 5 }} />{hata}</div>}
          <button type="submit" disabled={bekle} style={{ width: "100%", minHeight: 52, background: bekle ? "#555" : "#FFFFFF", border: "none", color: "#000", fontFamily: hv, fontSize: 22, letterSpacing: 1, borderRadius: 10, cursor: "pointer" }}>
            {bekle ? "GİRİŞ YAPILIYOR…" : "GİRİŞ YAP"}
          </button>
        </form>
        <div style={{ marginTop: 12, color: C.faint, fontSize: 11, textAlign: "center" }}>{APP_HOST} · pano hesabınızla girin</div>
      </div>
    </div>
  );
}

function Rapor({ mutfak, oturum, onYetkisiz }) {
  const [params, setParams] = useSearchParams();
  const buAy = guncelAy();
  const ayParam = params.get("ay");
  const ay = ayGecerli(ayParam) && ayParam <= buAy ? ayParam : buAy;
  const setAy = (a) => setParams(a === buAy ? {} : { ay: a }, { replace: true });

  const [rapor, setRapor] = useState(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState(null);
  const [guncelleme, setGuncelleme] = useState(null);
  const [cevrimdisi, setCevrimdisi] = useState(false);
  const istekNo = useRef(0);
  const eposta = oturum?.user?.email || "";

  const yukle = useCallback(async (sessiz = false) => {
    const no = ++istekNo.current;
    if (!sessiz) setYukleniyor(true);
    const r = await hakedisRaporu(mutfak, ay);
    if (no !== istekNo.current) return;
    if (r.hata?.tip === "yetkisiz") { onYetkisiz(eposta); return; }
    if (r.rapor) {
      setRapor(r.rapor); setHata(null); setGuncelleme(new Date()); setCevrimdisi(false);
      raporSakla(ay, r.rapor);
    } else {
      // Baglanti yoksa son basarili rapor gosterilir ("son veri HH:MM")
      const eski = r.hata?.tip === "baglanti" ? raporOku(ay) : null;
      if (eski) { setRapor(eski.rapor); setGuncelleme(eski.zaman); setCevrimdisi(true); setHata(null); }
      else { setRapor(null); setHata(r.hata); setCevrimdisi(false); }
    }
    setYukleniyor(false);
  }, [mutfak, ay, eposta, onYetkisiz]);

  useEffect(() => { yukle(); }, [yukle]);

  // Suren ayda pano acikken 60 sn'de bir sessiz tazeleme; sekme arkadayken degil.
  useEffect(() => {
    if (ay !== buAy) return undefined;
    const t = setInterval(() => { if (document.visibilityState === "visible") yukle(true); }, 60_000);
    return () => clearInterval(t);
  }, [ay, buAy, yukle]);

  return (
    <Sayfa>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: hv, fontSize: 22, letterSpacing: 1.5, lineHeight: 1 }}>DÖNER MUTFAĞI</div>
          <div style={{ fontSize: 11, color: C.faint, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>NIP hakediş · {eposta}</div>
        </div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          <button type="button" onClick={() => yukle()} title="Yenile" style={{ background: "none", border: `1px solid ${C.cardLine}`, color: C.muted, borderRadius: 8, width: 40, height: 40, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Ikon ad="yenile" boy={15} /></button>
          <button type="button" onClick={() => mutfak.auth.signOut()} style={{ background: "none", border: `1px solid ${C.cardLine}`, color: C.muted, borderRadius: 8, height: 40, padding: "0 12px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, fontFamily: cv, fontSize: 13 }}>
            <Ikon ad="cikis" boy={14} />Çıkış
          </button>
        </div>
      </div>

      <HakedisOzeti
        rapor={rapor} ay={ay} onAy={setAy} yukleniyor={yukleniyor} hata={hata} onYenile={() => yukle()}
        taraf="mutfak" guncelleme={guncelleme} cevrimdisi={cevrimdisi}
        aksiyonlar={<PaylasSatiri rapor={rapor} />}
      />
    </Sayfa>
  );
}

function MutfakRapor() {
  const mutfak = useMemo(() => mutfakClient(), []);
  const [oturum, setOturum] = useState(undefined);   // undefined: bakiliyor, null: yok
  const [reddedilen, setReddedilen] = useState("");

  useEffect(() => {
    document.title = "Döner Mutfağı · NIP Hakediş";
    let canli = true;
    mutfak.auth.getSession().then(({ data }) => { if (canli) setOturum(data?.session || null); });
    const { data: sub } = mutfak.auth.onAuthStateChange((_e, s) => { if (canli) setOturum(s || null); });
    return () => { canli = false; sub?.subscription?.unsubscribe(); };
  }, [mutfak]);

  const yetkisiz = useCallback(async (eposta) => {
    setReddedilen(eposta);
    try { await mutfak.auth.signOut(); } catch { /* oturum zaten dusmus */ }
  }, [mutfak]);

  if (oturum === undefined) return <Sayfa><div style={{ padding: 60, textAlign: "center", color: C.muted }}>Yükleniyor…</div></Sayfa>;
  if (!oturum) return <Giris mutfak={mutfak} reddedilen={reddedilen} />;
  return <Rapor mutfak={mutfak} oturum={oturum} onYetkisiz={yetkisiz} />;
}

export default function MutfakRaporPage() {
  // Hook'lar kosuldan sonra gelmesin diye sarmalayici: profil kapaliysa hic kurulmaz.
  if (!ozellik("mutfakHakedis")) return <Navigate to="/" replace />;
  return <MutfakRapor />;
}
