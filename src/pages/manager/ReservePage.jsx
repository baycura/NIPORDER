import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../lib/supabase.js";
import { reserve, reserveOturumAl, reserveCikis, RESERVATION_URL } from "../../lib/reserve.js";
import { rezervasyonYerel, MARKA } from "../../lib/profil.js";
import { useAuth } from "../../contexts/AuthContext.jsx";
import Ikon from "../../components/Ikon.jsx";
import SayiGirisi from "../../components/SayiGirisi.jsx";

// YEREL MOD (profil "temel"): ayri rezervasyon projesi yok; events/reservations
// bu veritabaninda (migration 20260911_yerel_etkinlik_rezervasyon). reserve
// istemcisi Order istemcisinin kendisi, yetki personel rolu. Uyelik, itibar
// puani, uye senkronu yok — o parcalar cizilmez, misafir akisi kalir.

// ============================================================================
// REZERVASYON — rezervasyon sitesinin yonetimi, Order panelinden.
//
// Rezervasyon sitesi (reservation.notinparis.me) kendi Supabase projesinde
// calismaya devam ediyor. Bu sayfa oraya lib/reserve.js koprusuyle SAHIBIN
// KENDI YETKISIYLE baglanir; her islem RESERVE'in kendi RLS'inden gecer.
//
// SADAKAT KURALI: buradaki her islem, rezervasyon sitesinin admin panelindeki
// (index.html) ayni islemle BIREBIR ayni yan etkileri yapar. Yoksa iki panel
// birbirinden sapar (sayaclar, puanlar, seviyeler). Formuller o dosyadan
// satir satir alindi; degistirmeden once orayi da degistir:
//   onay      -> events.approved_count += kisi           (index.html:1862)
//   gelmedi   -> guven -40, no_show+1, seri 0            (index.html:1869)
//   giris     -> guven +20 (+seri bonusu), sadakat +50,
//                seviye esikleri 150/300/500, defter 2 satir (index.html:1888)
//   uye onayi -> NIP-MBR-/NIP-REF- kod, defter +100 guven (index.html:1707)
//
// Uye onayinda EK olarak Order'daki musteri kaydi da baglanir (Adim 3 koprusu:
// reserve_profile_id + member_code). Rezervasyon panelinden onaylayinca bu
// olmaz; o yuzden onaylari buradan yapmak tercih edilir.
//
// 10.11.2026 (sahip): "Uyelik icin onayi kaldiralim ama rezervasyon icin onay
// gereksin. Rezervasyon onaylandiktan sonra da karsiya bildirim gitmeli."
//   - UYELIK ONAYSIZ: yeni hesap RESERVE'de dogrudan "approved" acilir
//     (tetikleyici; reserve_migrations/20261110_uyelik_onaysiz_rez_onayli.sql).
//     Uyeler sekmesi artik onay kuyrugu degil, uye listesi; dondur / reddet durur.
//   - REZERVASYON ONAYLI: talep "pending" duser, buradan onaylanir. Onaydan
//     sonra musteriye E-POSTA gider (Order: nip_reserve_onay_simdi ->
//     rez-bildirim edge fonksiyonu; 10 dakikalik cron da ayni isi yapar, site
//     panelinden onaylananlar icin). Durum kartta gorunur. E-postasi olmayan
//     misafir icin "WhatsApp'tan haber ver" hazir mesajla acilir.
// ============================================================================

const cv = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";
const hv = "'Bebas Neue','Barlow Condensed','Coolvetica Condensed',sans-serif";
const C = {
  card: "#161616", line: "#2A2A2A", ink: "#F0EDE8", muted: "#8A8A86",
  faint: "#666666", accent: "#FFFFFF", down: "#C87A6A", up: "#7FA88A", warn: "#D9B45B",
};
const inputS = { width: "100%", background: "#0F0F0F", border: "1px solid " + C.line, borderRadius: 8, padding: "10px 12px", color: C.ink, fontSize: 14, fontFamily: cv, outline: "none", boxSizing: "border-box" };
const btnS = (renk = C.line, ink = C.ink) => ({ background: renk, color: ink, border: "1px solid " + C.line, borderRadius: 8, padding: "8px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: cv, letterSpacing: "0.3px", minHeight: 44, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 });

const REZ_DURUM = {
  pending: { ad: "Bekliyor", renk: C.warn },
  approved: { ad: "Onaylı", renk: C.up },
  used: { ad: "Girdi", renk: C.ink },
  no_show: { ad: "Gelmedi", renk: C.down },
  rejected: { ad: "Red", renk: C.down },
  cancelled: { ad: "İptal", renk: C.faint },
};
const UYE_DURUM = {
  pending: { ad: "Bekliyor", renk: C.warn },
  approved: { ad: "Üye", renk: C.up },
  rejected: { ad: "Red", renk: C.down },
  frozen: { ad: "Donduruldu", renk: C.faint },
};
const SEVIYE = { bronze: "Bronz", silver: "Gümüş", gold: "Altın", elite: "Elit" };

const fmtTarih = (d) => {
  if (!d) return "—";
  const t = new Date(d + "T12:00:00");
  return isNaN(t) ? d : t.toLocaleDateString("tr-TR", { day: "numeric", month: "short", weekday: "short" });
};
const bugun = () => new Date().toISOString().slice(0, 10);
const fmtTarihUzun = (d) => {
  if (!d) return "";
  const t = new Date(d + "T12:00:00");
  return isNaN(t) ? String(d) : t.toLocaleDateString("tr-TR", { day: "numeric", month: "long", weekday: "long" });
};
const saatDk = (iso) => iso ? new Date(iso).toLocaleTimeString("tr-TR", { timeZone: "Europe/Istanbul", hour: "2-digit", minute: "2-digit" }) : "";

// wa.me: ulke kodlu, "+"siz, bastaki 0'siz numara ister. Sitede bazi numaralar
// "+90+90532…" ya da "+900532…" diye kayitli; yerel modda "0532…" yazilabilir.
// Kullanilamayan numarada "" doner (WhatsApp kisiyi sectirir, yanlis numaraya gitmez).
const waTel = (p) => {
  const s = String(p || "").trim();
  let d = s.replace(/\D/g, "");
  if (!d) return "";
  if (!s.startsWith("+")) {
    if (/^0[1-9]\d{9}$/.test(d)) d = "90" + d.slice(1);
    else if (/^5\d{9}$/.test(d)) d = "90" + d;
    else if (!/^90[1-9]\d{9}$/.test(d)) return "";
  }
  if (/^9090[1-9]\d{9}$/.test(d)) d = d.slice(2);
  else if (/^900[1-9]\d{9}$/.test(d)) d = "90" + d.slice(3);
  if (d.startsWith("90")) return /^90[1-9]\d{9}$/.test(d) ? d : "";
  return d.length >= 8 && d.length <= 15 ? d : "";
};

// Onaydan sonra musteriye giden WhatsApp mesaji (site panelindeki "WhatsApp ile
// Gonder" ile ayni bilgi). Numara kullanilamiyorsa mesaj yine hazirlanir.
const waOnayLinki = (r) => {
  if (!String(r.phone || "").trim()) return null;
  const tel = waTel(r.phone);
  const misafirler = Array.isArray(r.guest_names) ? r.guest_names.filter(Boolean).join(", ") : String(r.guest_names || "").trim();
  const misafir = misafirler ? "\nDavetliler: " + misafirler : "";
  const metin = "🎫 " + MARKA.buyuk + " — Rezervasyon onayı\n\n"
    + "Etkinlik: " + (r.event_name || "—") + "\n"
    + "Tarih: " + fmtTarihUzun(r.event_date) + (r.event_time ? " · " + r.event_time : "") + "\n"
    + "İsim: " + (r.name || "—") + "\n"
    + "Kişi: " + (r.guest_count || 1) + misafir + "\n"
    + "Kod: " + (r.qr_id || "—") + "\n\n"
    + "Kapıda bu kodu göstermen yeterli." + (rezervasyonYerel ? "" : "\n" + RESERVATION_URL);
  return "https://wa.me/" + tel + "?text=" + encodeURIComponent(metin);
};

// "Gelmedi": rezervasyon sitesinin veritabani (RESERVE) "no_show" durumunu kabul
// etmiyor (reservations_status_check). Dugme orada hic calismadi; kisit
// genisletilene kadar kopru modunda gosterilmez. Yerel modda calisir.
const gelmediAcik = rezervasyonYerel;

// E-posta bildiriminin karttaki ozeti (nip_reserve_onay_bildirim satiri)
const bildirimOzeti = (b) => {
  if (!b) return null;
  if (b.durum === "gonderildi") return { metin: "E-posta gitti" + (b.son ? " · " + saatDk(b.son) : ""), renk: C.up, ikon: "onay" };
  if (b.durum === "eposta_yok") return { metin: "E-postası yok — WhatsApp'tan haber ver", renk: C.warn, ikon: "uyari" };
  if (b.durum === "bekliyor") return { metin: "E-posta sırada…", renk: C.muted, ikon: null };
  if (b.hata === "anahtar-yok" || b.hata === "gonderici-yok") return { metin: "E-posta kurulumu eksik — WhatsApp'tan haber ver", renk: C.warn, ikon: "uyari" };
  return { metin: "E-posta gönderilemedi — WhatsApp'tan haber ver", renk: C.down, ikon: "uyari" };
};

// index.html:2047 — randomHex(6).toUpperCase(). Ayni bicim, daha iyi rastgelelik.
const hex6 = () => {
  const b = new Uint8Array(3);
  crypto.getRandomValues(b);
  return Array.from(b, x => x.toString(16).padStart(2, "0")).join("").toUpperCase();
};

function Field({ label, children }) {
  return (
    <label style={{ display: "block", marginBottom: 10 }}>
      <div style={{ fontSize: 10, color: C.muted, letterSpacing: "1px", marginBottom: 4, fontWeight: 700 }}>{label}</div>
      {children}
    </label>
  );
}
function Cip({ aktif, onClick, children }) {
  return (
    <button onClick={onClick} aria-pressed={!!aktif} style={{ ...btnS(aktif ? C.ink : "#0F0F0F", aktif ? "#000" : C.muted), padding: "6px 12px", fontSize: 12, minHeight: 38 }}>{children}</button>
  );
}
function Durum({ tablo, kod }) {
  const d = tablo[kod] || { ad: kod, renk: C.muted };
  return <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 6, border: "1px solid " + d.renk, color: d.renk, fontWeight: 700, letterSpacing: "0.5px" }}>{d.ad}</span>;
}

export default function ReservePage() {
  const { staffUser } = useAuth();
  const [kopru, setKopru] = useState({ durum: "yukleniyor" });
  const [sekme, setSekme] = useState("rez");
  const [mesaj, setMesaj] = useState(null);

  const bagla = async (zorla = false) => {
    setKopru({ durum: "yukleniyor" });
    const r = await reserveOturumAl({ zorla });
    if (!r.ok) setKopru({ durum: "hata", hata: r.hata, kod: r.kod, email: r.email });
    else if (!r.admin) setKopru({ durum: "admin-degil", email: r.email });
    else setKopru({ durum: "hazir", email: r.email });
  };
  useEffect(() => { bagla(false); }, []);

  // Tek zamanlayici: art arda iki mesajda ilkinin sayaci ikinciyi erken silmesin
  const mesajZaman = useRef(null);
  const uyar = (m, kotu = false) => {
    setMesaj({ m, kotu });
    clearTimeout(mesajZaman.current);
    mesajZaman.current = setTimeout(() => setMesaj(null), kotu ? 6000 : 3500);
  };
  useEffect(() => () => clearTimeout(mesajZaman.current), []);
  const hazir = kopru.durum === "hazir";

  // Uye senkronu (RESERVE -> Order customers): her 10 dakikada kendiliginden,
  // buradan da elle. Son turun kaydi reserve_sync_log'da.
  const [senkron, setSenkron] = useState(null);
  const [senkronBusy, setSenkronBusy] = useState(false);
  const senkronOku = () => supabase.from("reserve_sync_log").select("*").order("at", { ascending: false }).limit(1).maybeSingle()
    .then(({ data }) => setSenkron(data || null));
  useEffect(() => { if (!rezervasyonYerel) senkronOku(); }, []);
  const senkronSimdi = async () => {
    if (senkronBusy) return; setSenkronBusy(true);
    const { data, error } = await supabase.rpc("nip_reserve_senkron_simdi");
    setSenkronBusy(false);
    if (error) return uyar("Senkron çalışmadı: " + error.message, true);
    setSenkron(data);
    uyar(data?.ok ? `Senkron tamam: ${data.alinan} üye, ${data.eklenen} yeni, ${data.baglanan} bağlandı` : "Senkron hata verdi: " + (data?.hata || "?"), !data?.ok);
  };
  const senkronMetni = () => {
    if (!senkron) return "henüz çalışmadı";
    const dk = Math.round((Date.now() - new Date(senkron.at).getTime()) / 60000);
    const ne = dk < 1 ? "az önce" : dk < 60 ? dk + " dk önce" : Math.round(dk / 60) + " sa önce";
    return senkron.ok ? `${ne} · ${senkron.alinan} üye · ${senkron.eklenen} yeni · ${senkron.baglanan} bağlandı` : `${ne} · HATA: ${senkron.hata || senkron.http_status}`;
  };

  return (
    <div style={{ padding: 16, maxWidth: 900, margin: "0 auto", fontFamily: cv, color: C.ink }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap", marginBottom: 6 }}>
        <h1 style={{ fontFamily: hv, fontSize: 30, letterSpacing: "2px", margin: 0 }}>REZERVASYON</h1>
        {!rezervasyonYerel && <a href={RESERVATION_URL} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: C.muted }}>reservation.notinparis.me ↗</a>}
      </div>

      {/* Kopru durumu — her zaman gorunur, kullanici neyle konustugunu bilsin */}
      {rezervasyonYerel ? (
        kopru.durum === "admin-degil" && (
          <div style={{ background: C.card, border: "1px solid " + C.line, borderRadius: 10, padding: "10px 12px", marginBottom: 14, fontSize: 12 }}>
            <span style={{ color: C.warn, fontWeight: 700 }}>● Yalnız görüntüleme</span>
            <span style={{ color: C.muted }}> — etkinlik açmak ve düzenlemek yönetici yetkisi ister.</span>
          </div>
        )
      ) : (
      <div style={{ background: C.card, border: "1px solid " + C.line, borderRadius: 10, padding: "10px 12px", marginBottom: 14, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", fontSize: 12 }}>
        {kopru.durum === "yukleniyor" && <span style={{ color: C.muted }}>Rezervasyon tarafına bağlanılıyor…</span>}
        {kopru.durum === "hazir" && <><span style={{ color: C.up, fontWeight: 700 }}>● Bağlı</span><span style={{ color: C.muted }}>{kopru.email} — rezervasyon tarafında admin</span></>}
        {kopru.durum === "admin-degil" && <><span style={{ color: C.warn, fontWeight: 700 }}>● Yetkisiz</span><span style={{ color: C.muted }}>{kopru.email} rezervasyon tarafında admin değil. Yetki o tarafta verilir (profiles.is_admin).</span></>}
        {kopru.durum === "hata" && <><span style={{ color: C.down, fontWeight: 700 }}>● Bağlanamadı</span><span style={{ color: C.muted }}>{kopru.hata}{kopru.kod === "no_account" ? " Önce rezervasyon sitesinde bu e-postayla hesap açılmalı." : ""}</span></>}
        <span style={{ flex: 1 }} />
        <button onClick={() => bagla(true)} style={btnS()}>Yeniden bağlan</button>
        {kopru.durum === "hazir" && <button onClick={async () => { await reserveCikis(); setKopru({ durum: "hata", hata: "Oturum kapatıldı." }); }} style={btnS("#0F0F0F", C.muted)}>Çık</button>}
      </div>
      )}

      {!rezervasyonYerel && (
      <div style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 11, color: senkron && !senkron.ok ? C.down : C.muted, marginBottom: 12, flexWrap: "wrap" }}>
        <span>Üye senkronu (rezervasyon → Order müşterileri): {senkronMetni()}</span>
        <span style={{ flex: 1 }} />
        <button onClick={senkronSimdi} disabled={senkronBusy} style={{ ...btnS("#0F0F0F", C.muted), padding: "4px 8px", fontSize: 10 }}>{senkronBusy ? "…" : "Şimdi senkronla"}</button>
      </div>
      )}

      {mesaj && <div role={mesaj.kotu ? "alert" : "status"} aria-live={mesaj.kotu ? "assertive" : "polite"} style={{ position: "fixed", bottom: "calc(88px + env(safe-area-inset-bottom))", left: "50%", transform: "translateX(-50%)", background: mesaj.kotu ? C.down : C.ink, color: "#000", padding: "11px 16px", borderRadius: 10, fontSize: 13, fontWeight: 700, zIndex: 300, maxWidth: "calc(100vw - 32px)", lineHeight: 1.4, pointerEvents: "none", boxShadow: "0 6px 24px rgba(0,0,0,0.5)" }}>{mesaj.m}</div>}

      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        <Cip aktif={sekme === "rez"} onClick={() => setSekme("rez")}>Rezervasyonlar</Cip>
        <Cip aktif={sekme === "etk"} onClick={() => setSekme("etk")}>Etkinlikler</Cip>
        {!rezervasyonYerel && <Cip aktif={sekme === "uye"} onClick={() => setSekme("uye")}>Üyeler</Cip>}
      </div>

      {/* Yerelde personel (is_staff) rezervasyonlari okur/onaylar; etkinlik
          yazmak yonetici ister (RLS: nip_yonetici_mi). Kopru modunda hazir
          olmadan hicbir liste gelmez. */}
      {!rezervasyonYerel && !hazir && kopru.durum !== "yukleniyor" && (
        <div style={{ color: C.muted, fontSize: 13, padding: 20, textAlign: "center" }}>
          Bağlantı kurulunca liste burada görünür.
        </div>
      )}
      {(hazir || rezervasyonYerel) && sekme === "rez" && <Rezervasyonlar uyar={uyar} />}
      {(hazir || rezervasyonYerel) && sekme === "etk" && <Etkinlikler uyar={uyar} />}
      {hazir && !rezervasyonYerel && sekme === "uye" && <Uyeler uyar={uyar} staffUser={staffUser} />}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// REZERVASYONLAR
// ────────────────────────────────────────────────────────────────────────────
function Rezervasyonlar({ uyar }) {
  const [liste, setListe] = useState(null);
  const [etkinlikler, setEtkinlikler] = useState([]);
  const [durum, setDurum] = useState("pending");
  const [etkinlik, setEtkinlik] = useState("");
  const [qr, setQr] = useState("");
  const [busy, setBusy] = useState(false);
  // Onay e-postasinin durumu: rez_id -> satir (Order: nip_reserve_onay_bildirim)
  const [bildirim, setBildirim] = useState({});
  // Geri alinmaz dugmeler iki dokunus ister: "<id>:g" (gelmedi) / "<id>:r" (reddet)
  const [emin, setEmin] = useState(null);
  const eminZaman = useRef(null);
  const eminSor = (anahtar) => {
    setEmin(anahtar);
    clearTimeout(eminZaman.current);
    eminZaman.current = setTimeout(() => setEmin(null), 4000);
  };
  const zamanlar = useRef([]);
  const canli = useRef(true);
  useEffect(() => { canli.current = true; return () => { canli.current = false; clearTimeout(eminZaman.current); zamanlar.current.forEach(clearTimeout); }; }, []);

  const bildirimOku = async (kayitlar) => {
    if (rezervasyonYerel) return;
    const idler = (kayitlar || []).filter(r => r.status === "approved").slice(0, 150).map(r => r.id);
    if (!idler.length) return;
    const { data, error } = await supabase.from("nip_reserve_onay_bildirim").select("rez_id,durum,hata,son").in("rez_id", idler);
    if (error || !data) return;   // tablo okunamazsa kart bildirimsiz cizilir
    setBildirim(Object.fromEntries(data.map(b => [b.rez_id, b])));
  };

  const yukle = async () => {
    const [r, e] = await Promise.all([
      reserve.from("reservations").select("*").order("created_at", { ascending: false }).limit(400),
      reserve.from("events").select("id,name,date,capacity,approved_count").order("date", { ascending: false }).limit(60),
    ]);
    if (r.error) { uyar("Rezervasyonlar okunamadı: " + r.error.message, true); setListe(l => l || []); }
    else { setListe(r.data || []); bildirimOku(r.data || []); }
    if (!e.error) setEtkinlikler(e.data || []);
    return r.data || null;
  };
  useEffect(() => { yukle(); }, []);

  // Onaydan hemen sonra: Order onaylananlari ceker ve e-postayi yollar (10 dk'lik
  // cron'u beklemeden). E-posta birkac saniyede gider; durum iki kez okunur.
  // Gitmediyse (kurulum eksik, adres yok, saglayici hatasi) bir kez uyarir ve
  // "Onayli" suzgecine gecer: "WhatsApp'tan haber ver" dugmesi orada.
  const musteriyeBildir = (r) => {
    if (rezervasyonYerel) return;
    let uyarildi = false;
    const bak = async () => {
      if (!canli.current) return;
      await yukle();
      // Misafire zaten "e-postasi yok" dendi; ikinci uyari yalniz uyede
      if (!r?.id || !r.profile_id || uyarildi || !canli.current) return;
      const { data: b } = await supabase.from("nip_reserve_onay_bildirim").select("durum,hata").eq("rez_id", r.id).maybeSingle();
      if (!canli.current || !b || b.durum === "gonderildi" || b.durum === "bekliyor") return;
      uyarildi = true;
      uyar((r.name || "Müşteri") + ": e-posta gitmedi — WhatsApp'tan haber ver", true);
      setDurum("approved");
    };
    supabase.rpc("nip_reserve_onay_simdi").then(() => {
      if (!canli.current) return;
      for (const ms of [4000, 12000]) zamanlar.current.push(setTimeout(bak, ms));
    }, () => { /* cron 10 dakikada bir yine dener */ });
  };

  const gorunen = useMemo(() => (liste || [])
    .filter(r => !durum || r.status === durum)
    .filter(r => !etkinlik || r.event_id === etkinlik), [liste, durum, etkinlik]);

  const sayac = useMemo(() => {
    const s = {};
    for (const r of liste || []) s[r.status] = (s[r.status] || 0) + 1;
    return s;
  }, [liste]);

  // index.html:1862 approveRes — status + approved_at; etkinligin sayaci kisi kadar artar
  const onayla = async (r) => {
    if (busy) return; setBusy(true);
    try {
      const u = await reserve.from("reservations").update({ status: "approved", approved_at: new Date().toISOString() }).eq("id", r.id);
      if (u.error) throw u.error;
      if (r.event_id) {
        const ev = await reserve.from("events").select("approved_count").eq("id", r.event_id).single();
        if (ev.data) {
          const u2 = await reserve.from("events").update({ approved_count: (ev.data.approved_count || 0) + (r.guest_count || 1) }).eq("id", r.event_id);
          if (u2.error) throw u2.error;
        }
      }
      uyar(rezervasyonYerel ? "Onaylandı ✓" : r.profile_id ? "Onaylandı ✓ E-posta sıraya alındı" : "Onaylandı ✓ Misafirin e-postası yok: WhatsApp'tan haber ver");
      // Misafirde e-posta yok: "WhatsApp'tan haber ver" dugmesi Onayli suzgecinde
      if (!rezervasyonYerel && !r.profile_id) setDurum("approved");
      yukle(); musteriyeBildir(r);
    } catch (e) { uyar("Onaylanamadı: " + e.message, true); } finally { setBusy(false); }
  };

  // index.html:1868 rejectRes
  const reddet = async (r) => {
    if (busy) return; setBusy(true); setEmin(null);
    const u = await reserve.from("reservations").update({ status: "rejected" }).eq("id", r.id);
    setBusy(false);
    if (u.error) return uyar("Reddedilemedi: " + u.error.message, true);
    uyar("Reddedildi"); yukle();
  };

  // index.html:1869 markNoShow — guven -40 (tabani 0), no_show +1, seri sifir
  const gelmedi = async (r) => {
    if (busy) return; setBusy(true); setEmin(null);
    try {
      const u = await reserve.from("reservations").update({ status: "no_show" }).eq("id", r.id);
      if (u.error) throw u.error;
      if (r.profile_id) {
        const p = await reserve.from("profiles").select("trust_score,total_no_show,attendance_streak").eq("id", r.profile_id).single();
        if (p.data) {
          const nt = Math.max(0, (p.data.trust_score || 100) - 40);
          const u2 = await reserve.from("profiles").update({ total_no_show: (p.data.total_no_show || 0) + 1, trust_score: nt, attendance_streak: 0 }).eq("id", r.profile_id);
          if (u2.error) throw u2.error;
        }
      }
      uyar(r.profile_id ? "Gelmedi işaretlendi. −40 güven" : "Gelmedi işaretlendi"); yukle();
    } catch (e) {
      // RESERVE'de reservations_status_check "no_show" durumunu tanimiyor (10.11.2026
      // bulgusu): durum yazilamaz, puan da dusmez. Ham kisit metni yerine sebep.
      const kisit = /reservations_status_check/i.test(e?.message || "");
      uyar(kisit ? "Gelmedi yazılamadı: rezervasyon veritabanı bu durumu henüz kabul etmiyor. Güven puanı değişmedi." : "İşaretlenemedi: " + e.message, true);
    } finally { setBusy(false); }
  };

  // index.html:1880 scanQR — kapida giris. Kod ya da dogrudan kayit.
  const girisYap = async (kayit) => {
    if (busy) return;
    let r = kayit;
    if (!r) {
      const kod = qr.trim().toUpperCase();
      if (!kod) return uyar("QR kodu gir", true);
      const res = await reserve.from("reservations").select("*").eq("qr_id", kod).maybeSingle();
      r = res.data;
      if (!r) return uyar("GEÇERSİZ — kod bulunamadı", true);
    }
    if (r.status === "used") return uyar("KULLANILMIŞ — " + r.name + " zaten girdi", true);
    if (r.status !== "approved") return uyar("ONAYSIZ — " + r.name + " (" + (REZ_DURUM[r.status]?.ad || r.status) + ")", true);

    setBusy(true);
    try {
      const u = await reserve.from("reservations").update({ status: "used", checked_in_at: new Date().toISOString() }).eq("id", r.id);
      if (u.error) throw u.error;
      let seriMsg = "";
      if (r.profile_id) {
        const pRes = await reserve.from("profiles").select("trust_score,loyalty_score,total_attended,total_reservations,attendance_streak,max_streak,last_attended_at,tier").eq("id", r.profile_id).single();
        if (pRes.data) {
          const pd = pRes.data, tD = 20, lD = 50;
          let sB = 0, ns = 1;
          const la = pd.last_attended_at ? new Date(pd.last_attended_at) : null;
          if (la && (Date.now() - la.getTime()) < 45 * 24 * 3600 * 1000) ns = (pd.attendance_streak || 0) + 1;
          if (ns >= 10) sB = 30; else if (ns >= 5) sB = 15; else if (ns >= 3) sB = 5;
          const nT = (pd.trust_score || 100) + tD + sB, nL = (pd.loyalty_score || 0) + lD;
          const nTier = nT >= 500 ? "elite" : nT >= 300 ? "gold" : nT >= 150 ? "silver" : "bronze";
          const u2 = await reserve.from("profiles").update({
            trust_score: nT, loyalty_score: nL, tier: nTier,
            total_attended: (pd.total_attended || 0) + 1, total_reservations: (pd.total_reservations || 0) + 1,
            attendance_streak: ns, max_streak: Math.max(pd.max_streak || 0, ns), last_attended_at: new Date().toISOString(),
          }).eq("id", r.profile_id);
          if (u2.error) throw u2.error;
          // Defter: index.html bunu .catch ile yutuyor; biz de durdurmuyoruz ama soyluyoruz.
          const d = await reserve.from("reputation_ledger").insert([
            { profile_id: r.profile_id, score_type: "trust", delta: tD + sB, balance_after: nT, reason_code: "attended" + (sB > 0 ? "_streak" : ""), source_type: "event", source_id: r.event_id },
            { profile_id: r.profile_id, score_type: "loyalty", delta: lD, balance_after: nL, reason_code: "attended", source_type: "event", source_id: r.event_id },
          ]);
          if (d.error) console.warn("itibar defteri yazilamadi", d.error);
          if (ns >= 2) seriMsg = " · " + ns + " gecelik seri";
          seriMsg += " · " + (SEVIYE[nTier] || nTier);
        }
      }
      uyar("GİRİŞ OK — " + r.name + " · " + (r.guest_count || 1) + " kişi" + seriMsg);
      setQr(""); yukle();
    } catch (e) { uyar("Giriş yapılamadı: " + e.message, true); } finally { setBusy(false); }
  };

  return (
    <div>
      {/* Kapi: kod ile giris */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input value={qr} onChange={e => setQr(e.target.value)} placeholder={"Kapıda: rezervasyon kodu (" + (rezervasyonYerel ? MARKA.kisa.replace(/[^A-Z0-9]/gi, "").toUpperCase().slice(0, 4) : "NIP") + "-…)"} style={{ ...inputS, textTransform: "uppercase", letterSpacing: "1px" }} onKeyDown={e => e.key === "Enter" && girisYap(null)} />
        <button onClick={() => girisYap(null)} disabled={busy} style={btnS(C.ink, "#000")}>GİRİŞ</button>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
        {[["pending", "Bekleyen"], ["approved", "Onaylı"], ["used", "Girdi"], ["no_show", "Gelmedi"], ["rejected", "Red"], ["", "Hepsi"]].filter(([k]) => k !== "no_show" || gelmediAcik).map(([k, ad]) =>
          <Cip key={k} aktif={durum === k} onClick={() => setDurum(k)}>{ad}{k && sayac[k] ? " · " + sayac[k] : ""}</Cip>)}
      </div>
      <select value={etkinlik} onChange={e => setEtkinlik(e.target.value)} style={{ ...inputS, marginBottom: 12 }}>
        <option value="">Tüm etkinlikler</option>
        {etkinlikler.map(e => <option key={e.id} value={e.id}>{e.name} — {fmtTarih(e.date)} ({e.approved_count || 0}/{e.capacity})</option>)}
      </select>

      {liste === null && <div style={{ color: C.muted, fontSize: 13 }}>Yükleniyor…</div>}
      {liste && gorunen.length === 0 && <div style={{ color: C.muted, fontSize: 13, padding: 16, textAlign: "center" }}>Bu süzgeçte kayıt yok.</div>}
      {gorunen.map(r => (
        <div key={r.id} style={{ background: C.card, border: "1px solid " + C.line, borderRadius: 10, padding: 12, marginBottom: 8 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{r.name || "—"}</div>
            <Durum tablo={REZ_DURUM} kod={r.status} />
            {!r.profile_id && !rezervasyonYerel && <span style={{ fontSize: 10, color: C.muted }}>MİSAFİR</span>}
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 12, color: C.muted }}>{r.guest_count || 1} kişi</span>
          </div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>
            {r.event_name || "—"} · {fmtTarih(r.event_date)}{r.event_time ? " · " + r.event_time : ""}
          </div>
          <div style={{ fontSize: 11, color: C.faint, marginTop: 2 }}>
            {r.phone || "—"} · QR {r.qr_id || "—"}{Array.isArray(r.guest_names) ? (r.guest_names.length ? " · " + r.guest_names.join(", ") : "") : (r.guest_names ? " · " + r.guest_names : "")}{r.note ? " · " + r.note : ""}
          </div>
          {r.status === "approved" && bildirimOzeti(bildirim[r.id]) && (() => {
            const b = bildirimOzeti(bildirim[r.id]);
            return (
              <div style={{ fontSize: 12, color: b.renk, marginTop: 6, display: "flex", alignItems: "center", gap: 6, fontWeight: 600 }}>
                {b.ikon && <Ikon ad={b.ikon} boy={13} />}{b.metin}
              </div>
            );
          })()}
          <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
            {r.status === "pending" && <button disabled={busy} onClick={() => onayla(r)} style={btnS(C.up, "#000")}>Onayla</button>}
            {r.status === "approved" && <button disabled={busy} onClick={() => girisYap(r)} style={btnS(C.ink, "#000")}>Giriş</button>}
            {r.status === "approved" && waOnayLinki(r) && (
              <a href={waOnayLinki(r)} target="_blank" rel="noreferrer" style={{ ...btnS("#0F0F0F", "#7FD4A0"), textDecoration: "none" }}>{waTel(r.phone) ? "WhatsApp'tan haber ver" : "WhatsApp (numara hatalı — kişiyi seç)"}</a>
            )}
            {r.status !== "approved" && waTel(r.phone) && <a href={"https://wa.me/" + waTel(r.phone)} target="_blank" rel="noreferrer" style={{ ...btnS("#0F0F0F", C.muted), textDecoration: "none" }}>WhatsApp</a>}
            <span style={{ flex: 1 }} />
            {/* Geri alinmaz: ilk dokunus sorar, ikinci dokunus yapar (4 sn) */}
            {r.status === "pending" && (
              <button disabled={busy} onClick={() => emin === r.id + ":r" ? reddet(r) : eminSor(r.id + ":r")}
                style={btnS(emin === r.id + ":r" ? C.down : "#0F0F0F", emin === r.id + ":r" ? "#000" : C.down)}>
                {emin === r.id + ":r" ? "Emin misin? Reddet" : "Reddet"}
              </button>
            )}
            {r.status === "approved" && gelmediAcik && (
              <button disabled={busy} onClick={() => emin === r.id + ":g" ? gelmedi(r) : eminSor(r.id + ":g")}
                style={btnS(emin === r.id + ":g" ? C.down : "#0F0F0F", emin === r.id + ":g" ? "#000" : C.down)}>
                {emin === r.id + ":g" ? (r.profile_id ? "Emin misin? −40 güven" : "Emin misin? Gelmedi") : "Gelmedi"}
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// ETKINLIKLER
// ────────────────────────────────────────────────────────────────────────────
const bosEtkinlik = {
  name: "", genre: "", subtitle: "", date: "", time: "22:00", time_end: "04:00",
  warmup_name: "", warmup_start: "22:00", warmup_end: "00:00",
  capacity: 100, access_type: "open", min_tier: "bronze", min_trust: 0, rules: "", color: "",
};

function Etkinlikler({ uyar }) {
  const [liste, setListe] = useState(null);
  const [form, setForm] = useState(bosEtkinlik);
  const [duzenlenen, setDuzenlenen] = useState(null);
  const [busy, setBusy] = useState(false);
  const [gecmisAcik, setGecmisAcik] = useState(false);

  const yukle = async () => {
    const r = await reserve.from("events")
      .select("id,name,genre,subtitle,date,time,time_end,warmup_name,warmup_start,warmup_end,capacity,approved_count,access_type,min_tier,min_trust,rules,color,status,poster_thumb")
      .order("date", { ascending: false }).limit(120);
    if (r.error) { uyar("Etkinlikler okunamadı: " + r.error.message, true); setListe([]); }
    else setListe(r.data || []);
  };
  useEffect(() => { yukle(); }, []);

  const t = bugun();
  const { yaklasan, gecmis } = useMemo(() => {
    const l = liste || [];
    return { yaklasan: l.filter(e => e.date >= t).sort((a, b) => a.date.localeCompare(b.date)), gecmis: l.filter(e => e.date < t) };
  }, [liste, t]);

  const duzenle = (e) => {
    setDuzenlenen(e.id);
    setForm({
      name: e.name || "", genre: e.genre || "", subtitle: e.subtitle || "", date: e.date || "",
      time: e.time || "", time_end: e.time_end || "04:00",
      warmup_name: e.warmup_name || "", warmup_start: e.warmup_start || "22:00", warmup_end: e.warmup_end || "00:00",
      capacity: e.capacity || 100, access_type: e.access_type || "open", min_tier: e.min_tier || "bronze",
      min_trust: e.min_trust || 0, rules: e.rules || "", color: e.color || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const iptal = () => { setDuzenlenen(null); setForm(bosEtkinlik); };

  // index.html:1800 updateEvt / 1801 addEvt — ayni alanlar, ayni varsayilanlar
  const kaydet = async () => {
    const name = form.name.trim().toLocaleUpperCase("tr-TR"), cap = parseInt(form.capacity);
    if (!name || !form.date || !cap) return uyar("İsim, tarih ve kapasite zorunlu", true);
    setBusy(true);
    const ortak = {
      name, genre: form.genre.trim(), subtitle: form.subtitle.trim(), date: form.date, time: form.time,
      time_end: form.time_end || null, warmup_name: form.warmup_name.trim() || null,
      warmup_start: form.warmup_start || null, warmup_end: form.warmup_end || null,
      capacity: cap, access_type: form.access_type || "open", min_tier: form.min_tier || "bronze",
      min_trust: parseInt(form.min_trust) || 0, rules: form.rules.trim(), color: form.color || null,
    };
    const r = duzenlenen
      ? await reserve.from("events").update(ortak).eq("id", duzenlenen)
      : await reserve.from("events").insert({ ...ortak, approved_count: 0, poster_thumb: null, poster_blur: null, note: null, status: "active" });
    setBusy(false);
    if (r.error) return uyar("Kaydedilemedi: " + r.error.message, true);
    uyar(duzenlenen ? "Güncellendi ✓" : "Etkinlik oluşturuldu ✓");
    iptal(); yukle();
  };

  // index.html:1803 deleteEvt. Rezervasyonlar SILINMEZ (bag SET NULL, 2026-09-02).
  const sil = async (e) => {
    if (!window.confirm(e.name + " silinsin mi? Rezervasyon kayıtları kalır, etkinlik bağı boşalır.")) return;
    setBusy(true);
    const r = await reserve.from("events").delete().eq("id", e.id);
    setBusy(false);
    if (r.error) return uyar("Silinemedi: " + r.error.message, true);
    uyar(e.name + " silindi"); if (duzenlenen === e.id) iptal(); yukle();
  };

  const F = (k, ekstra = {}) => ({ value: form[k] ?? "", onChange: ev => setForm(f => ({ ...f, [k]: ev.target.value })), style: inputS, ...ekstra });

  return (
    <div>
      <div style={{ background: C.card, border: "1px solid " + (duzenlenen ? C.warn : C.line), borderRadius: 10, padding: 12, marginBottom: 14 }}>
        <div style={{ fontFamily: hv, fontSize: 18, letterSpacing: "1.5px", marginBottom: 8 }}>{duzenlenen ? "ETKİNLİĞİ DÜZENLE" : "YENİ ETKİNLİK"}</div>
        <Field label="AD (büyük harfe çevrilir)"><input {...F("name")} placeholder="SPACE CAST" /></Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <Field label="TÜR"><input {...F("genre")} placeholder="HOUSE, TECH HOUSE…" /></Field>
          <Field label="ALT BAŞLIK"><input {...F("subtitle")} /></Field>
          <Field label="TARİH"><input type="date" {...F("date")} /></Field>
          <Field label="KAPASİTE"><SayiGirisi kip="tam" min={1} value={form.capacity ?? ""} onChange={v => setForm(f => ({ ...f, capacity: v }))} style={inputS} /></Field>
          <Field label="BAŞLANGIÇ"><input type="time" {...F("time")} /></Field>
          <Field label="BİTİŞ"><input type="time" {...F("time_end")} /></Field>
          {!rezervasyonYerel && <>
          <Field label="ERİŞİM"><select {...F("access_type")}><option value="open">Herkese açık</option><option value="members_only">Yalnız üyeler</option></select></Field>
          <Field label="EN DÜŞÜK SEVİYE"><select {...F("min_tier")}>{Object.entries(SEVIYE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          <Field label="EN DÜŞÜK GÜVEN PUANI"><SayiGirisi kip="tam" min={0} value={form.min_trust ?? ""} onChange={v => setForm(f => ({ ...f, min_trust: v }))} style={inputS} /></Field>
          </>}
          <Field label="RENK (isteğe bağlı)"><input {...F("color")} placeholder="#C9A84C" /></Field>
          <Field label="ISINMA ADI"><input {...F("warmup_name")} placeholder="Warm-up DJ" /></Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <Field label="ISINMA BAŞ."><input type="time" {...F("warmup_start")} /></Field>
            <Field label="ISINMA BİT."><input type="time" {...F("warmup_end")} /></Field>
          </div>
        </div>
        <Field label="KURALLAR"><textarea rows={3} {...F("rules")} style={{ ...inputS, resize: "vertical" }} /></Field>
        {!rezervasyonYerel && <div style={{ fontSize: 11, color: C.faint, marginBottom: 8 }}>Afiş yükleme şimdilik rezervasyon panelinden; burada gösterilir, değiştirilmez.</div>}
        <div style={{ display: "flex", gap: 8 }}>
          <button disabled={busy} onClick={kaydet} style={btnS(C.ink, "#000")}>{duzenlenen ? "GÜNCELLE" : "OLUŞTUR"}</button>
          {duzenlenen && <button onClick={iptal} style={btnS()}>Vazgeç</button>}
        </div>
      </div>

      {liste === null && <div style={{ color: C.muted, fontSize: 13 }}>Yükleniyor…</div>}
      {yaklasan.map(e => <EtkinlikKart key={e.id} e={e} duzenle={duzenle} sil={sil} busy={busy} />)}
      {liste && yaklasan.length === 0 && <div style={{ color: C.muted, fontSize: 13, padding: 12, textAlign: "center" }}>Yaklaşan etkinlik yok.</div>}

      {gecmis.length > 0 && (
        <button onClick={() => setGecmisAcik(a => !a)} style={{ ...btnS("#0F0F0F", C.muted), width: "100%", marginTop: 8 }}>
          {gecmisAcik ? "Geçmişi gizle" : "Geçmiş (" + gecmis.length + ")" + (rezervasyonYerel ? "" : " — son iki hafta; eskiler her gece arşive gider")}
        </button>
      )}
      {gecmisAcik && gecmis.map(e => <EtkinlikKart key={e.id} e={e} duzenle={duzenle} sil={sil} busy={busy} gecmis />)}
    </div>
  );
}

function EtkinlikKart({ e, duzenle, sil, busy, gecmis }) {
  const pct = Math.min(100, Math.round(((e.approved_count || 0) / (e.capacity || 1)) * 100));
  return (
    <div style={{ background: C.card, border: "1px solid " + C.line, borderRadius: 10, padding: 12, marginBottom: 8, opacity: gecmis ? 0.6 : 1, display: "flex", gap: 12 }}>
      {e.poster_thumb && <img src={e.poster_thumb} alt="" style={{ width: 54, height: 54, objectFit: "cover", borderRadius: 8, flexShrink: 0 }} />}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{e.name}</div>
          {e.access_type === "members_only" && <span style={{ fontSize: 10, color: C.warn }}>ÜYELERE</span>}
          {e.status !== "active" && <span style={{ fontSize: 10, color: C.down }}>{e.status}</span>}
        </div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{e.genre ? e.genre + " · " : ""}{fmtTarih(e.date)}{e.time ? " · " + e.time : ""}{e.time_end ? "–" + e.time_end : ""}</div>
        <div style={{ height: 4, background: "#0F0F0F", borderRadius: 2, marginTop: 8, overflow: "hidden" }}>
          <div style={{ width: pct + "%", height: "100%", background: pct >= 100 ? C.down : C.up }} />
        </div>
        <div style={{ fontSize: 11, color: C.faint, marginTop: 4 }}>{e.approved_count || 0} / {e.capacity} onaylı</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
        <button disabled={busy} onClick={() => duzenle(e)} style={btnS()}>Düzenle</button>
        <button disabled={busy} onClick={() => sil(e)} style={btnS("#0F0F0F", C.down)}>Sil</button>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// UYELER (rezervasyon tarafi profilleri)
// ────────────────────────────────────────────────────────────────────────────
function Uyeler({ uyar, staffUser }) {
  const [liste, setListe] = useState(null);
  // Uyelik onaysiz (10.11.2026): bekleyen kuyruk yok, liste "Üye" ile acilir
  const [durum, setDurum] = useState("approved");
  const [ara, setAra] = useState("");
  const [busy, setBusy] = useState(false);

  const yukle = async () => {
    const r = await reserve.from("profiles")
      .select("id,name,display_name,email,phone,instagram,status,member_code,tier,trust_score,loyalty_score,total_attended,total_no_show,attendance_streak,referral_code,referral_used,referral_limit,is_admin,created_at")
      .order("created_at", { ascending: false }).limit(500);
    if (r.error) { uyar("Üyeler okunamadı: " + r.error.message, true); setListe([]); }
    else setListe(r.data || []);
  };
  useEffect(() => { yukle(); }, []);

  const sayac = useMemo(() => { const s = {}; for (const p of liste || []) s[p.status] = (s[p.status] || 0) + 1; return s; }, [liste]);
  const gorunen = useMemo(() => {
    const q = ara.trim().toLowerCase();
    return (liste || [])
      .filter(p => !durum || p.status === durum)
      .filter(p => !q || (p.name || "").toLowerCase().includes(q) || (p.email || "").toLowerCase().includes(q) || (p.member_code || "").toLowerCase().includes(q) || (p.phone || "").includes(q));
  }, [liste, durum, ara]);

  // Adim 3 koprusu: onaylanan uye Order'da da baglansin. Rezervasyon panelinden
  // onaylayinca bu olmaz — o yuzden onay buradan tercih edilir.
  const orderaBagla = async (p, kod) => {
    const email = String(p.email || "").toLowerCase().trim();
    if (!email) return "e-posta yok";
    const c = await supabase.from("customers").select("id,reserve_profile_id,member_code").ilike("email", email).maybeSingle();
    if (c.error) return c.error.message;
    if (c.data) {
      if (c.data.reserve_profile_id) return null; // zaten bagli
      const u = await supabase.from("customers").update({ reserve_profile_id: p.id, member_code: kod }).eq("id", c.data.id);
      return u.error ? u.error.message : null;
    }
    const i = await supabase.from("customers").insert({
      name: p.name || email, email, phone: p.phone || null, tier: "bronze",
      reserve_profile_id: p.id, member_code: kod, store_id: staffUser?.store_ids?.[0],
    });
    return i.error ? i.error.message : null;
  };

  // index.html:1707 approveMember — kodlar, approved_at, defter +100 guven
  const onayla = async (p) => {
    if (busy) return; setBusy(true);
    try {
      const kod = "NIP-MBR-" + hex6(), ref = "NIP-REF-" + hex6();
      const u = await reserve.from("profiles").update({ status: "approved", member_code: kod, referral_code: ref, approved_at: new Date().toISOString() }).eq("id", p.id);
      if (u.error) throw u.error;
      const d = await reserve.from("reputation_ledger").insert({ profile_id: p.id, score_type: "trust", delta: 100, balance_after: 100, reason_code: "approved", source_type: "admin" });
      if (d.error) console.warn("itibar defteri yazilamadi", d.error);
      const bagHata = await orderaBagla(p, kod);
      uyar("Onaylandı → " + kod + (bagHata ? " (Order'a bağlanamadı: " + bagHata + ")" : " · Order'a bağlandı"), !!bagHata);
      yukle();
    } catch (e) { uyar("Onaylanamadı: " + e.message, true); } finally { setBusy(false); }
  };
  // index.html:1708 / 1736
  const durumYaz = async (p, s, msg) => {
    if (busy) return; setBusy(true);
    const u = await reserve.from("profiles").update({ status: s }).eq("id", p.id);
    setBusy(false);
    if (u.error) return uyar("Olmadı: " + u.error.message, true);
    uyar(msg); yukle();
  };

  return (
    <div>
      <input value={ara} onChange={e => setAra(e.target.value)} placeholder="Ad, e-posta, kod, telefon…" style={{ ...inputS, marginBottom: 8 }} />
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {[["approved", "Üye"], ["frozen", "Dondurulmuş"], ["rejected", "Red"], ...(sayac.pending ? [["pending", "Bekleyen"]] : []), ["", "Hepsi"]].map(([k, ad]) =>
          <Cip key={k} aktif={durum === k} onClick={() => setDurum(k)}>{ad}{k && sayac[k] ? " · " + sayac[k] : ""}</Cip>)}
      </div>
      <div style={{ fontSize: 12, color: C.muted, margin: "-4px 0 12px", lineHeight: 1.5 }}>
        Üyelik onay istemez: yeni üye hemen açılır. Rezervasyon talepleri onay ister.
      </div>

      {liste === null && <div style={{ color: C.muted, fontSize: 13 }}>Yükleniyor…</div>}
      {liste && gorunen.length === 0 && <div style={{ color: C.muted, fontSize: 13, padding: 16, textAlign: "center" }}>Bu süzgeçte kayıt yok.</div>}
      {gorunen.map(p => (
        <div key={p.id} style={{ background: C.card, border: "1px solid " + C.line, borderRadius: 10, padding: 12, marginBottom: 8 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{p.name || p.display_name || "—"}</div>
            <Durum tablo={UYE_DURUM} kod={p.status} />
            {p.is_admin && <span style={{ fontSize: 10, color: C.warn, fontWeight: 700 }}>ADMİN</span>}
            <span style={{ flex: 1 }} />
            {p.status === "approved" && <span style={{ fontSize: 11, color: C.muted }}>{SEVIYE[p.tier] || p.tier} · güven {p.trust_score ?? "—"}</span>}
          </div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>{p.email}{p.phone ? " · " + p.phone : ""}{p.instagram ? " · @" + p.instagram : ""}</div>
          <div style={{ fontSize: 11, color: C.faint, marginTop: 2 }}>
            {p.member_code ? <span style={{ color: "#B8E0B8", letterSpacing: "1px" }}>{p.member_code}</span> : "kodsuz"}
            {" · "}{p.total_attended || 0} gece{p.total_no_show ? " · " + p.total_no_show + " gelmedi" : ""}
            {p.referral_code ? " · davet " + (p.referral_used || 0) + "/" + (p.referral_limit ?? "—") : ""}
            {" · "}{new Date(p.created_at).toLocaleDateString("tr-TR")}
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
            {p.status === "pending" && <>
              <button disabled={busy} onClick={() => onayla(p)} style={btnS(C.up, "#000")}>Onayla</button>
              <button disabled={busy} onClick={() => durumYaz(p, "rejected", "Reddedildi")} style={btnS("#0F0F0F", C.down)}>Reddet</button>
            </>}
            {p.status === "approved" && !p.is_admin && <button disabled={busy} onClick={() => durumYaz(p, "frozen", "Donduruldu ❄")} style={btnS("#0F0F0F", C.muted)}>Dondur</button>}
            {p.status === "frozen" && <button disabled={busy} onClick={() => durumYaz(p, "approved", "Yeniden açıldı")} style={btnS(C.up, "#000")}>Aç</button>}
            {p.status === "rejected" && <button disabled={busy} onClick={() => onayla(p)} style={btnS("#0F0F0F", C.muted)}>Yine de onayla</button>}
          </div>
        </div>
      ))}
    </div>
  );
}
