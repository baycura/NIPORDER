import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { onayla } from "../../lib/onayla.js";
import { baslikStil } from "../../theme/panel.js";
import { supabase } from "../../lib/supabase.js";
import { reserveIstemci, reserveOturumAl, reserveCikis, RESERVATION_URL } from "../../lib/reserve.js";
import { rezYerelOku } from "../../lib/rezKaynak.js";
import { rezervasyonYerel, MARKA, ozellik } from "../../lib/profil.js";
import { personelHata } from "../../lib/errorText.js";
import { useAuth } from "../../contexts/AuthContext.jsx";
import Ikon from "../../components/Ikon.jsx";
import SayiGirisi from "../../components/SayiGirisi.jsx";

// IKI KAYNAK, TEK SAYFA. Hangisi oldugunu calisma aninda sunucu soyler
// (lib/rezKaynak.js -> nip_rez_yerel_mi); sayfa acikken degisirse listeler
// yeni kaynaktan yeniden okunur.
//
// YEREL MOD (profil "temel" ya da NIP'te gecis anahtari acik): ayri rezervasyon
// projesi yok; events / reservations bu veritabaninda. Istemci Order
// istemcisinin kendisi, yetki personel rolu. Personel islemleri TEK sunucu
// cagrisidir (migration 20261113_rezervasyon_order_icinde):
//   onay    -> nip_rez_onayla  (kapasite asilmaz, sayac artar, e-posta kuyruga)
//   red     -> nip_rez_reddet  (bekleyen; onayli kayit ayri dugmeyle iptal edilir)
//   gelmedi -> nip_rez_gelmedi (uyenin "gelmedi" sayaci; geri alinir)
//   giris   -> nip_rez_giris   (uyenin "geldi" sayaci; baska gun once sorulur)
//   engel   -> nip_rez_engel   (engelli uye yeni talep acamaz)
// Sahip karari (12.11.2026): guven puani, seviye, seri YOK. Personel uye icin
// iki sayi gorur: kac kez geldi, kac kez gelmedi. Dogrudan tabloya yazilmaz;
// yazilsaydi sayaclar ve e-posta kuyrugu atlanirdi.
//
// KOPRU MODU (asagidaki eski aciklama): rezervasyon sitesinin veritabani.

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
const waOnayLinki = (r, yerel) => {
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
    + "Kapıda bu kodu göstermen yeterli." + (yerel ? "" : "\n" + RESERVATION_URL);
  return "https://wa.me/" + tel + "?text=" + encodeURIComponent(metin);
};

// "GELMEDI" (sahip onayi 12.11.2026). Rezervasyon sitesinin veritabani
// (RESERVE) "no_show" DURUMUNU kabul etmiyor (reservations_status_check) ve
// kisit silinmeden degistirilemiyor. Kopru modunda isaret ayri sutunda
// tutulur: reservations.no_show_at (durum "approved" kalir). Yerel modda durum
// dogrudan "no_show" olur. Goc: supabase/reserve_migrations/20261112_gelmedi_isareti.sql
//
// rezDurumu: ekranda, suzgecte ve kapida kullanilan durum.
const rezDurumu = (r) => (r?.status === "approved" && r?.no_show_at ? "no_show" : r?.status);

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

// yerel      : rezervasyon bu veritabaninda mi (calisma aninda okunur)
// db         : listelerin okundugu istemci (yerel: Order; kopru: RESERVE)
// yonetici   : onay / red / gelmedi / engel yetkisi (yerelde nip_yonetici_mi)
// kaynakAyni : her YAZMADAN once cagrilir; kaynak degistiyse false doner
const RezCtx = createContext({ yerel: false, db: null, yonetici: false, kaynakAyni: async () => true });

export default function ReservePage() {
  const { staffUser } = useAuth();
  // KAYNAK: null = henuz bilinmiyor. Profil "temel"de soru sorulmaz.
  const [yerel, setYerel] = useState(rezervasyonYerel ? true : null);
  const [kaynakHata, setKaynakHata] = useState(false);
  const yerelRef = useRef(yerel);
  const [kopru, setKopru] = useState({ durum: "yukleniyor" });
  const [sekme, setSekme] = useState("rez");
  const [mesaj, setMesaj] = useState(null);
  const canli = useRef(true);
  useEffect(() => { canli.current = true; return () => { canli.current = false; }; }, []);

  // Tek zamanlayici: art arda iki mesajda ilkinin sayaci ikinciyi erken silmesin
  const mesajZaman = useRef(null);
  const uyar = (m, kotu = false) => {
    setMesaj({ m, kotu });
    clearTimeout(mesajZaman.current);
    mesajZaman.current = setTimeout(() => setMesaj(null), kotu ? 6000 : 3500);
  };
  useEffect(() => () => clearTimeout(mesajZaman.current), []);

  // Kaynak SIMDI okunur (eski degerle yanlis veritabanina yazilmasin). Gecis
  // anahtari sayfa ACIKKEN cevrilebilir; uc ayri yerde yeniden bakilir:
  //   - sayfa one gelince (focus / visibilitychange),
  //   - sayfa gorunurken 30 saniyede bir (kasadaki tablet hic arka plana
  //     gitmez; ayni sayac, basarisiz okumanin yeniden denemesidir),
  //   - her yazma isleminden hemen once (kaynakAyni).
  // Inceleme 18.11: yalniz "one gelince" bakiliyordu; acik duran panel gecisten
  // sonra eski veritabanina yazmaya devam edebiliyordu.
  // Okunamazsa: ilk aciliste hata gosterilir; sayfa zaten calisiyorsa bilinen
  // kaynakla devam edilir (kapidaki is durmasin).
  const kaynakOku = async (ilk) => {
    const v = await rezYerelOku({ tazeMs: ilk ? 0 : 15000, kesin: true });
    if (!canli.current) return;
    if (v === null) { if (yerelRef.current === null) setKaynakHata(true); return; }
    setKaynakHata(false);
    if (yerelRef.current !== null && yerelRef.current !== v) uyar("Rezervasyon kaynağı değişti. Liste yenilendi.");
    yerelRef.current = v; setYerel(v);
  };
  useEffect(() => {
    if (rezervasyonYerel) return;
    kaynakOku(true);
    const bak = () => { if (document.visibilityState === "visible") kaynakOku(false); };
    window.addEventListener("focus", bak);
    document.addEventListener("visibilitychange", bak);
    const z = setInterval(bak, 30000);
    return () => { window.removeEventListener("focus", bak); document.removeEventListener("visibilitychange", bak); clearInterval(z); };
  }, []);

  // Yazmadan once: kaynak hala ayni mi? Degistiyse islem YAPILMAZ, sayfa yeni
  // kaynaga gecer ve personel islemi yeni listede yeniden yapar. Okunamadiysa
  // (null) bilinen kaynakla devam edilir: baglanti zayifken kapi durmasin;
  // gecisten sonra eski veritabani yazmayi zaten reddeder (koruma tetigi).
  const kaynakAyni = async () => {
    if (rezervasyonYerel) return true;
    const v = await rezYerelOku({ tazeMs: 5000, kesin: true });
    if (v === null || v === yerelRef.current) return true;
    if (canli.current) {
      uyar("Rezervasyon kaynağı değişti. İşlem yapılmadı; liste yenilendi, yeniden dene.", true);
      yerelRef.current = v; setYerel(v);
    }
    return false;
  };
  const kaynakAyniRef = useRef(kaynakAyni);
  kaynakAyniRef.current = kaynakAyni;

  const baglaSira = useRef(0);
  const bagla = async (zorla = false, y = yerelRef.current) => {
    if (y === null) return;
    const sira = ++baglaSira.current;
    setKopru({ durum: "yukleniyor" });
    const r = await reserveOturumAl({ zorla, yerel: y });
    if (!canli.current || sira !== baglaSira.current) return;   // kaynak bu arada degisti
    if (!r.ok) setKopru({ durum: "hata", hata: r.hata, kod: r.kod, email: r.email });
    else if (!r.admin) setKopru({ durum: "admin-degil", email: r.email });
    else setKopru({ durum: "hazir", email: r.email });
  };
  useEffect(() => { if (yerel !== null) bagla(false, yerel); }, [yerel]);
  // "Üyeler" sekmesi yalniz kopru modunda var (rezervasyon sitesinin profilleri)
  useEffect(() => { if (yerel && sekme === "uye") setSekme("rez"); }, [yerel, sekme]);

  const hazir = kopru.durum === "hazir";
  const db = yerel === null ? null : reserveIstemci(yerel);
  const baglam = useMemo(() => ({ yerel: !!yerel, db, yonetici: hazir, kaynakAyni: () => kaynakAyniRef.current() }), [yerel, db, hazir]);

  // Uye senkronu (RESERVE -> Order customers): her 10 dakikada kendiliginden,
  // buradan da elle. Son turun kaydi reserve_sync_log'da.
  const [senkron, setSenkron] = useState(null);
  const [senkronBusy, setSenkronBusy] = useState(false);
  const senkronOku = () => supabase.from("reserve_sync_log").select("*").order("at", { ascending: false }).limit(1).maybeSingle()
    .then(({ data }) => setSenkron(data || null));
  useEffect(() => { if (yerel === false) senkronOku(); }, [yerel]);
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

  if (yerel === null) {
    return (
      <div style={{ padding: 16, maxWidth: 900, margin: "0 auto", fontFamily: cv, color: C.ink }}>
        <h1 style={{ ...baslikStil, marginBottom: 6 }}>Rezervasyon</h1>
        {kaynakHata ? (
          <div role="alert" style={{ background: C.card, border: "1px solid " + C.line, borderRadius: 10, padding: "12px", fontSize: 13, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ color: C.down, fontWeight: 700 }}>● Okunamadı</span>
            <span style={{ color: C.muted, flex: 1, minWidth: 180 }}>Rezervasyon bilgisi okunamadı. Bağlantıyı kontrol et.</span>
            <button onClick={() => { setKaynakHata(false); kaynakOku(true); }} style={btnS()}>Tekrar dene</button>
          </div>
        ) : (
          <div style={{ color: C.muted, fontSize: 13 }}>Yükleniyor…</div>
        )}
      </div>
    );
  }

  return (
    <RezCtx.Provider value={baglam}>
    <div style={{ padding: 16, maxWidth: 900, margin: "0 auto", fontFamily: cv, color: C.ink }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap", marginBottom: 6 }}>
        <h1 style={baslikStil}>Rezervasyon</h1>
        {!yerel && <a href={RESERVATION_URL} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: C.muted }}>reservation.notinparis.me ↗</a>}
      </div>

      {/* Kopru durumu — her zaman gorunur, kullanici neyle konustugunu bilsin */}
      {yerel ? (
        <>
          {kopru.durum === "admin-degil" && (
            <div style={{ background: C.card, border: "1px solid " + C.line, borderRadius: 10, padding: "10px 12px", marginBottom: 14, fontSize: 12 }}>
              <span style={{ color: C.warn, fontWeight: 700 }}>● Yalnız kapı girişi</span>
              <span style={{ color: C.muted }}> — rezervasyon listesi, onay, ret ve etkinlik düzenleme yönetici yetkisi ister.</span>
            </div>
          )}
          {kopru.durum === "hata" && (
            <div role="alert" style={{ background: C.card, border: "1px solid " + C.line, borderRadius: 10, padding: "10px 12px", marginBottom: 14, fontSize: 12, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ color: C.down, fontWeight: 700 }}>● Yetki okunamadı</span>
              <span style={{ color: C.muted, flex: 1, minWidth: 160 }}>Onay ve ret düğmeleri yetki okununca görünür.</span>
              <button onClick={() => bagla(false)} style={btnS()}>Tekrar dene</button>
            </div>
          )}
        </>
      ) : (
      <div style={{ background: C.card, border: "1px solid " + C.line, borderRadius: 10, padding: "10px 12px", marginBottom: 14, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", fontSize: 12 }}>
        {kopru.durum === "yukleniyor" && <span style={{ color: C.muted }}>Rezervasyon tarafına bağlanılıyor…</span>}
        {kopru.durum === "hazir" && <><span style={{ color: C.up, fontWeight: 700 }}>● Bağlı</span><span style={{ color: C.muted }}>{kopru.email} — rezervasyon tarafında admin</span></>}
        {kopru.durum === "admin-degil" && <><span style={{ color: C.warn, fontWeight: 700 }}>● Yetkisiz</span><span style={{ color: C.muted }}>{kopru.email} rezervasyon tarafında admin değil. Yetki o tarafta verilir (profiles.is_admin).</span></>}
        {kopru.durum === "hata" && <><span style={{ color: C.down, fontWeight: 700 }}>● Bağlanamadı</span><span style={{ color: C.muted }}>{kopru.hata}{kopru.kod === "no_account" ? " Önce rezervasyon sitesinde bu e-postayla hesap açılmalı." : ""}</span></>}
        <span style={{ flex: 1 }} />
        <button onClick={() => bagla(true)} style={btnS()}>Yeniden bağlan</button>
        {kopru.durum === "hazir" && <button onClick={async () => { await reserveCikis(yerel); setKopru({ durum: "hata", hata: "Oturum kapatıldı." }); }} style={btnS("#0F0F0F", C.muted)}>Çık</button>}
      </div>
      )}

      {!yerel && (
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
        {!yerel && <Cip aktif={sekme === "uye"} onClick={() => setSekme("uye")}>Üyeler</Cip>}
      </div>

      {/* Yerelde rezervasyon listesini yalniz yonetici okur (20261118: misafirin
          adi ve telefonu her personel hesabina acik olmasin); aktif personel
          kodla kapida giris yapar (nip_rez_giris). Onay / red / gelmedi ve
          etkinlik yazmak yonetici ister (nip_yonetici_mi).
          Kopru modunda hazir olmadan hicbir liste gelmez. key: kaynak degisince
          liste yeni kaynaktan bastan okunur. */}
      {!yerel && !hazir && kopru.durum !== "yukleniyor" && (
        <div style={{ color: C.muted, fontSize: 13, padding: 20, textAlign: "center" }}>
          Bağlantı kurulunca liste burada görünür.
        </div>
      )}
      {(hazir || yerel) && sekme === "rez" && <Rezervasyonlar key={yerel ? "yerel" : "kopru"} uyar={uyar} />}
      {(hazir || yerel) && sekme === "etk" && <Etkinlikler key={yerel ? "yerel" : "kopru"} uyar={uyar} />}
      {hazir && !yerel && sekme === "uye" && <Uyeler uyar={uyar} staffUser={staffUser} />}
    </div>
    </RezCtx.Provider>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// REZERVASYONLAR
// ────────────────────────────────────────────────────────────────────────────
function Rezervasyonlar({ uyar }) {
  const { yerel, db, yonetici, kaynakAyni } = useContext(RezCtx);
  // Kopru modunda liste yalniz admin baglaninca cizilir; yerelde yonetici degilse
  // onay / red / gelmedi / engel dugmeleri cizilmez (sunucu da reddeder: 42501).
  const yetkili = !yerel || yonetici;
  const uyeMi = (r) => (yerel ? !!r.customer_id : !!r.profile_id);
  const misafirEtiketi = !yerel || ozellik("uyelik");
  const [liste, setListe] = useState(null);
  const [etkinlikler, setEtkinlikler] = useState([]);
  const [durum, setDurum] = useState("pending");
  const [etkinlik, setEtkinlik] = useState("");
  const [qr, setQr] = useState("");
  const [busy, setBusy] = useState(false);
  // KAPI SONUCU kalici kartta durur. Eskiden 3-6 saniyede kaybolan bir yazi
  // idi: kapidaki kisi misafire bakarken sonucu kaciriyordu. Kart bir sonraki
  // kod yazilana ya da kapatilana kadar ekranda kalir.
  const [kapi, setKapi] = useState(null); // { ok, baslik, alt }
  const kapiYaz = (ok, baslik, alt) => setKapi({ ok, baslik, alt });
  // Onay e-postasinin durumu: rez_id -> satir (Order: nip_reserve_onay_bildirim)
  const [bildirim, setBildirim] = useState({});
  // Yerel mod: uyenin iki sayaci ve engeli. customer_id -> { rez_geldi, rez_gelmedi, rez_engelli }
  const [uyeler, setUyeler] = useState({});
  // Yerel mod: talep engeli olan BUTUN uyeler (listedeki kartlardan bagimsiz).
  // Engelli uye yeni talep acamaz; eski kartlari listeden dustugunde engeli
  // kaldiracak baska yer kalmiyordu (inceleme 18.11).
  const [engelliler, setEngelliler] = useState([]);
  // Geri alinmaz dugmeler iki dokunus ister: "<id>:g" (gelmedi) / "<id>:r" (reddet)
  // / "<id>:k" (gelmedi geri al) / "<id>:i" (onayi iptal et) / "<id>:e" (uyeyi engelle)
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
    const idler = (kayitlar || []).filter(r => rezDurumu(r) === "approved").slice(0, 150).map(r => r.id);
    if (!idler.length) return;
    const { data, error } = await supabase.from("nip_reserve_onay_bildirim").select("rez_id,durum,hata,son").in("rez_id", idler);
    if (error || !data || !canli.current) return;   // tablo okunamazsa kart bildirimsiz cizilir
    setBildirim(Object.fromEntries(data.map(b => [b.rez_id, b])));
  };

  // Yerel mod: listedeki uyelerin sayaclari. Okunamazsa kartlar sayacsiz cizilir.
  const uyeOku = async (kayitlar) => {
    if (!yerel || !ozellik("uyelik")) return;
    const idler = [...new Set((kayitlar || []).map(r => r.customer_id).filter(Boolean))].slice(0, 300);
    if (!idler.length) return;
    const parcalar = [];
    for (let i = 0; i < idler.length; i += 100) parcalar.push(idler.slice(i, i + 100));
    const yanitlar = await Promise.all(parcalar.map(p => supabase.from("customers").select("id,rez_geldi,rez_gelmedi,rez_engelli").in("id", p)));
    if (!canli.current || yanitlar.some(y => y.error || !y.data)) return;
    setUyeler(Object.fromEntries(yanitlar.flatMap(y => y.data).map(c => [c.id, c])));
  };
  const engelliOku = async () => {
    if (!yerel || !ozellik("uyelik")) return;
    const { data, error } = await supabase.from("customers").select("id,name,phone,rez_geldi,rez_gelmedi").eq("rez_engelli", true).order("name").limit(100);
    if (!canli.current || error || !data) return;
    setEngelliler(data);
  };

  const yukle = async () => {
    const [r, e] = await Promise.all([
      db.from("reservations").select("*").order("created_at", { ascending: false }).limit(400),
      db.from("events").select("id,name,date,capacity,approved_count").order("date", { ascending: false }).limit(60),
    ]);
    if (!canli.current) return null;
    if (r.error) { uyar("Rezervasyonlar okunamadı: " + personelHata(r.error), true); setListe(l => l || []); }
    else { setListe(r.data || []); bildirimOku(r.data || []); uyeOku(r.data || []); engelliOku(); }
    if (!e.error) setEtkinlikler(e.data || []);
    return r.data || null;
  };
  useEffect(() => { yukle(); }, []);

  // Onaydan hemen sonra e-posta birkac saniyede gider; durum iki kez okunur.
  // Gitmediyse (kurulum eksik, adres yok, saglayici hatasi) bir kez uyarir ve
  // "Onayli" suzgecine gecer: "WhatsApp'tan haber ver" dugmesi orada.
  //   Kopru: Order once onaylananlari ceker (nip_reserve_onay_simdi; 10 dk'lik
  //          zamanlanmis isi beklemeden).
  //   Yerel: nip_rez_onayla e-postayi kendisi kuyruga yazip yollar; burada
  //          yalniz sonuc okunur.
  const musteriyeBildir = (r, epostaVar) => {
    let uyarildi = false;
    const bak = async () => {
      if (!canli.current) return;
      await yukle();
      // E-postasi olmayana zaten "WhatsApp'tan haber ver" dendi; ikinci uyari
      // yalniz e-posta bekleyen kayitta (site uyesi ya da menuden talep eden uye)
      if (!r?.id || !epostaVar || uyarildi || !canli.current) return;
      const { data: b } = await supabase.from("nip_reserve_onay_bildirim").select("durum,hata").eq("rez_id", r.id).maybeSingle();
      if (!canli.current || !b || b.durum === "gonderildi" || b.durum === "bekliyor") return;
      uyarildi = true;
      uyar((r.name || "Müşteri") + ": e-posta gitmedi — WhatsApp'tan haber ver", true);
      setDurum("approved");
    };
    const zamanla = () => {
      if (!canli.current) return;
      for (const ms of [4000, 12000]) zamanlar.current.push(setTimeout(bak, ms));
    };
    if (yerel) { if (epostaVar) zamanla(); return; }
    supabase.rpc("nip_reserve_onay_simdi").then(zamanla, () => { /* zamanlanmis is 10 dakikada bir yine dener */ });
  };

  const gorunen = useMemo(() => (liste || [])
    .filter(r => !durum || rezDurumu(r) === durum)
    .filter(r => !etkinlik || r.event_id === etkinlik), [liste, durum, etkinlik]);

  const sayac = useMemo(() => {
    const s = {};
    for (const r of liste || []) s[rezDurumu(r)] = (s[rezDurumu(r)] || 0) + 1;
    return s;
  }, [liste]);

  const degistiDe = (c) => uyar(c?.neden === "yok" ? "Bu rezervasyon artık yok. Liste yenilendi." : "Bu rezervasyon az önce değişti. Liste yenilendi.", true);

  // ONAY.
  //   Yerel: nip_rez_onayla — kapasite asilmaz, sayac ve e-posta kuyrugu ayni
  //          islemde yazilir. { ok, eposta } ya da { ok:false, neden:'dolu'|'degisti'|'yok' }.
  //   Kopru: index.html:1862 approveRes — status + approved_at; etkinligin
  //          sayaci kisi kadar artar.
  const rezOnayla = async (r) => {
    if (busy) return; setBusy(true);
    try {
      if (!(await kaynakAyni())) return;
      if (yerel) {
        const { data: c, error } = await supabase.rpc("nip_rez_onayla", { p_rez: r.id });
        if (error) throw error;
        if (!c?.ok) {
          if (c?.neden === "dolu") uyar("Yer yetmiyor: " + (c.kalan ?? 0) + " yer kaldı, bu talep " + (c.kisi ?? r.guest_count ?? 1) + " kişi. Önce etkinliğin kapasitesini artır.", true);
          else degistiDe(c);
          yukle(); return;
        }
        uyar(c.eposta ? "Onaylandı ✓ E-posta sıraya alındı" : "Onaylandı ✓ E-postası yok: WhatsApp'tan haber ver");
        // E-posta yok: "WhatsApp'tan haber ver" dugmesi Onayli suzgecinde
        if (!c.eposta) setDurum("approved");
        yukle(); musteriyeBildir(r, !!c.eposta);
        return;
      }
      const u = await db.from("reservations").update({ status: "approved", approved_at: new Date().toISOString() }).eq("id", r.id);
      if (u.error) throw u.error;
      if (r.event_id) {
        const ev = await db.from("events").select("approved_count").eq("id", r.event_id).single();
        if (ev.data) {
          const u2 = await db.from("events").update({ approved_count: (ev.data.approved_count || 0) + (r.guest_count || 1) }).eq("id", r.event_id);
          if (u2.error) throw u2.error;
        }
      }
      // E-posta adresi: site uyesinde profilden; menuden (uygulamadan) talep eden
      // uyede Order'daki izden gelir. Ikisi de yoksa misafirdir.
      let epostaVar = !!r.profile_id;
      if (!epostaVar) {
        const { data: iz } = await supabase.from("nip_rez_talepleri").select("eposta").eq("rez_id", r.id).maybeSingle();
        epostaVar = !!iz?.eposta;
      }
      uyar(epostaVar ? "Onaylandı ✓ E-posta sıraya alındı" : "Onaylandı ✓ Misafirin e-postası yok: WhatsApp'tan haber ver");
      // Misafirde e-posta yok: "WhatsApp'tan haber ver" dugmesi Onayli suzgecinde
      if (!epostaVar) setDurum("approved");
      yukle(); musteriyeBildir(r, epostaVar);
    } catch (e) { uyar("Onaylanamadı: " + personelHata(e), true); } finally { setBusy(false); }
  };

  // RED (bekleyen talep). Yerel: nip_rez_reddet(p_onayli = false) yalniz HALA
  // bekleyen kaydi reddeder; baska cihaz az once onayladiysa neden:'degisti'.
  // Kopru: index.html:1868 rejectRes.
  const reddet = async (r) => {
    if (busy) return; setBusy(true); setEmin(null);
    try {
      if (!(await kaynakAyni())) return;
      if (yerel) {
        const { data: c, error } = await supabase.rpc("nip_rez_reddet", { p_rez: r.id, p_onayli: false });
        if (error) throw error;
        if (!c?.ok) degistiDe(c); else uyar("Reddedildi");
      } else {
        const u = await db.from("reservations").update({ status: "rejected" }).eq("id", r.id);
        if (u.error) throw u.error;
        uyar("Reddedildi");
      }
    } catch (e) { uyar("Reddedilemedi: " + personelHata(e), true); } finally { setBusy(false); if (canli.current) yukle(); }
  };

  // ONAYI IPTAL ET (yalniz yerel): musteri vazgecti ya da yanlis onay. Koltuk
  // bosalir, sirada bekleyen onay e-postasi kapanir. Gitmis e-posta geri
  // alinamaz: sunucu eposta_gitti = true derse personel musteriye haber verir.
  const onayIptal = async (r) => {
    if (busy) return; setBusy(true); setEmin(null);
    try {
      if (!(await kaynakAyni())) return;
      const { data: c, error } = await supabase.rpc("nip_rez_reddet", { p_rez: r.id, p_onayli: true });
      if (error) throw error;
      if (!c?.ok) degistiDe(c);
      else if (c.eposta_gitti) uyar("Onay iptal edildi. Müşteriye onay e-postası gitmişti: iptali WhatsApp'tan bildir.", true);
      else uyar("Onay iptal edildi" + (c.bosalan ? " · " + c.bosalan + " yer boşaldı" : ""));
      // Iptal edilen kayit "Red" suzgecine duser; WhatsApp dugmesi orada
      if (c?.ok && c.eposta_gitti) setDurum("rejected");
    } catch (e) { uyar("İptal edilemedi: " + personelHata(e), true); } finally { setBusy(false); if (canli.current) yukle(); }
  };

  // "GELMEDI" ve geri alma. Iki modda da TEK sunucu islemi; rezervasyon satiri
  // kilitlenir, isaret ve sayac birlikte yazilir.
  //   Kopru: RESERVE nip_gelmedi(p_rez, p_geri) — isaret, guven puani (-40,
  //          tabani 0), gelmedi sayisi, seri ve itibar defteri. Geri almada
  //          dusulen GERCEK miktar geri verilir. Doner: { ok, neden, uye, delta }.
  //   Yerel: nip_rez_gelmedi(p_rez, p_geri) — guven puani yok; uyenin "gelmedi"
  //          sayaci tam bir kez artar / duser. Doner: { ok, neden, uye, gelmedi }.
  // ok = false: kayit baska cihazda degisti.
  const gelmediYaz = async (r, geri) => {
    const { data, error } = yerel
      ? await supabase.rpc("nip_rez_gelmedi", { p_rez: r.id, p_geri: geri })
      : await db.rpc("nip_gelmedi", { p_rez: r.id, p_geri: geri });
    if (error) throw error;
    return data || { ok: false, neden: "degisti" };
  };
  const gelmediEk = (c, isaret) => {
    if (!c.uye) return "";
    if (yerel) return c.gelmedi == null ? "" : " · üyenin gelmedi sayısı: " + c.gelmedi;
    return ". " + isaret + Math.abs(Number(c.delta) || 0) + " güven";
  };

  const gelmedi = async (r) => {
    if (busy) return; setBusy(true); setEmin(null);
    try {
      if (!(await kaynakAyni())) return;
      const c = await gelmediYaz(r, false);
      if (!c.ok) degistiDe(c);
      else uyar("Gelmedi işaretlendi" + gelmediEk(c, "−"));
    } catch (e) {
      uyar("İşaretlenemedi: " + personelHata(e), true);
    } finally { setBusy(false); if (canli.current) yukle(); }
  };

  // Yanlis isaret ya da gec gelen misafir: isaret kalkar, rezervasyon yeniden
  // "Onaylı" olur (kapida giris yapilabilir). Kopru: dusulen guven puani geri
  // verilir; seri (attendance_streak) geri gelmez. Yerel: sayac bir duser.
  const gelmediGeriAl = async (r) => {
    if (busy) return; setBusy(true); setEmin(null);
    try {
      if (!(await kaynakAyni())) return;
      const c = await gelmediYaz(r, true);
      if (!c.ok) degistiDe(c);
      else uyar("Gelmedi işareti kaldırıldı" + gelmediEk(c, "+"));
    } catch (e) {
      uyar("Geri alınamadı: " + personelHata(e), true);
    } finally { setBusy(false); if (canli.current) yukle(); }
  };

  // UYE ENGELI (yalniz yerel): engelli uye yeni rezervasyon talebi acamaz.
  // Bekleyen talepleri oldugu gibi kalir; karari yonetici verir.
  const engelYaz = async (musteriId, ad, engel) => {
    if (busy || !musteriId) return; setBusy(true); setEmin(null);
    try {
      if (!(await kaynakAyni())) return;
      const { data: c, error } = await supabase.rpc("nip_rez_engel", { p_customer: musteriId, p_engel: engel });
      if (error) throw error;
      if (!c?.ok) uyar("Üye kaydı bulunamadı.", true);
      else uyar(engel
        ? (ad || "Üye") + " yeni rezervasyon talebi açamaz. Mevcut rezervasyonları geçerli kalır."
        : "Engel kaldırıldı: " + (ad || "üye") + " yeniden talep açabilir");
    } catch (e) { uyar("Yazılamadı: " + personelHata(e), true); } finally { setBusy(false); if (canli.current) yukle(); }
  };

  // KAPIDA GIRIS, yerel: nip_rez_giris. Kayit kimligiyle (satirdaki "Giriş") ya
  // da kodla. Sunucu durumu KENDI okur (ekrandaki satir eski olabilir); uyenin
  // "geldi" sayaci tam bir kez artar. Baska gunun rezervasyonu once SORULUR
  // (neden:'tarih'); kapi "Giriş yap" derse p_zorla = true ile yeniden cagrilir.
  const girisYerel = async (kayit, zorla = false, kodSabit = null) => {
    if (busy) return;
    // Kart kod kutusunun altinda durur. Listeden (satirdaki "Giriş") basildiysa
    // liste asagi kaydirilmis olabilir: sonuc ayrica kisa bildirim olarak cikar.
    const sonuc = (ok, baslik, alt) => { kapiYaz(ok, baslik, alt); if (kayit) uyar(baslik + " — " + alt, !ok); };
    const kod = kayit ? null : (kodSabit || qr.trim().toUpperCase());
    if (!kayit && !kod) return uyar("QR kodu gir", true);
    setBusy(true);
    let c = null;
    try {
      if (!(await kaynakAyni())) return;
      const { data, error } = await supabase.rpc("nip_rez_giris", kayit ? { p_rez: kayit.id, p_zorla: zorla } : { p_kod: kod, p_zorla: zorla });
      if (error) throw error;
      c = data || {};
    } catch (e) {
      // Okunamadi ile "kod yok" ayri: baglanti kopukken gecerli misafir geri cevrilmesin.
      return sonuc(false, "GİRİŞ YAPILAMADI", (kayit?.name ? kayit.name + " · " : "Kod: " + kod + " · ") + personelHata(e));
    } finally { setBusy(false); }
    const ad = c.ad || kayit?.name || "—";
    if (c.ok) {
      const uye = c.uye && c.geldi != null ? " · üye: " + c.geldi + " kez geldi" + (c.gelmedi ? ", " + c.gelmedi + " kez gelmedi" : "") : "";
      const gun = c.bugun === false ? " · etkinlik tarihi " + fmtTarih(c.tarih) : "";
      sonuc(true, "GİRİŞ OK", ad + " · " + (c.kisi || 1) + " kişi" + uye + gun);
      setQr(""); yukle();
      return;
    }
    if (c.neden === "tarih") {
      const tamam = await onayla(ad + " · " + (c.kisi || 1) + " kişi\n" + (c.etkinlik || "Etkinlik") + " · " + fmtTarihUzun(c.tarih)
        + "\n\nBu rezervasyon bugünün etkinliği için değil. Yine de giriş yapılsın mı?", { evet: "Giriş yap" });
      if (!canli.current) return;
      if (!tamam) return sonuc(false, "BAŞKA GÜN", ad + " · etkinlik tarihi " + fmtTarih(c.tarih) + ". Giriş yapılmadı.");
      return girisYerel(kayit, true, kod);
    }
    if (c.neden === "yok") {
      if (kayit) { sonuc(false, "BULUNAMADI", ad + " · bu rezervasyon artık yok. Liste yenilendi."); yukle(); }
      else kapiYaz(false, "GEÇERSİZ", "Kod bulunamadı: " + (c.kod || kod));
      return;
    }
    if (c.neden === "kullanilmis") sonuc(false, "KULLANILMIŞ", ad + " zaten girdi" + (c.giris_at ? " · " + saatDk(c.giris_at) : "") + ".");
    else sonuc(false, "ONAYSIZ", ad + " · " + (REZ_DURUM[c.durum]?.ad || c.durum || "onaylı değil"));
    if (kayit) yukle();   // ekrandaki satir eskiydi
  };

  // KAPIDA GIRIS, kopru: index.html:1880 scanQR. Kod ya da dogrudan kayit.
  const girisKopru = async (kayit) => {
    if (busy) return;
    const sonuc = (ok, baslik, alt) => { kapiYaz(ok, baslik, alt); if (kayit) uyar(baslik + " — " + alt, !ok); };
    let r = kayit;
    if (!kayit && !qr.trim()) return uyar("QR kodu gir", true);
    // Kod aramasi da kaynaga baglidir: gecisten sonra eski veritabaninda
    // aranan kod "GEÇERSİZ" cikardi.
    if (!(await kaynakAyni())) return;
    if (!r) {
      const kod = qr.trim().toUpperCase();
      if (!kod) return uyar("QR kodu gir", true);
      const res = await db.from("reservations").select("*").eq("qr_id", kod).maybeSingle();
      // Okunamadi ile "kod yok" ayri: baglanti kopukken gecerli misafir geri cevrilmesin.
      if (res.error) return kapiYaz(false, "OKUNAMADI", "Bağlantıyı kontrol et ve yeniden dene. Kod: " + kod);
      r = res.data;
      if (!r) return kapiYaz(false, "GEÇERSİZ", "Kod bulunamadı: " + kod);
    }
    if (rezDurumu(r) === "used") return sonuc(false, "KULLANILMIŞ", r.name + " zaten girdi.");
    if (rezDurumu(r) !== "approved") return sonuc(false, "ONAYSIZ", r.name + " · " + (REZ_DURUM[rezDurumu(r)]?.ad || rezDurumu(r)));

    setBusy(true);
    try {
      // Yalniz HALA onayli (ve "gelmedi" isaretsiz) kayit girer. Ekrandaki satir
      // eski olabilir: baska cihaz az once giris yaptiysa ya da "gelmedi"
      // isaretlediyse giris ikinci kez yazilmaz, guven puani iki kez artmaz.
      const u = await db.from("reservations").update({ status: "used", checked_in_at: new Date().toISOString() })
        .eq("id", r.id).eq("status", "approved").is("no_show_at", null).select("id");
      if (u.error) throw u.error;
      if (!u.data || !u.data.length) { sonuc(false, "DEĞİŞTİ", r.name + " · bu rezervasyon az önce değişti. Liste yenilendi."); yukle(); return; }
      let seriMsg = "";
      if (r.profile_id) {
        const pRes = await db.from("profiles").select("trust_score,loyalty_score,total_attended,total_reservations,attendance_streak,max_streak,last_attended_at,tier").eq("id", r.profile_id).single();
        if (pRes.data) {
          const pd = pRes.data, tD = 20, lD = 50;
          let sB = 0, ns = 1;
          const la = pd.last_attended_at ? new Date(pd.last_attended_at) : null;
          if (la && (Date.now() - la.getTime()) < 45 * 24 * 3600 * 1000) ns = (pd.attendance_streak || 0) + 1;
          if (ns >= 10) sB = 30; else if (ns >= 5) sB = 15; else if (ns >= 3) sB = 5;
          // "??": guveni 0 olan uye 100 sayilmaz (yalniz bos deger varsayilan alir).
          const nT = (pd.trust_score ?? 100) + tD + sB, nL = (pd.loyalty_score ?? 0) + lD;
          const nTier = nT >= 500 ? "elite" : nT >= 300 ? "gold" : nT >= 150 ? "silver" : "bronze";
          const u2 = await db.from("profiles").update({
            trust_score: nT, loyalty_score: nL, tier: nTier,
            total_attended: (pd.total_attended || 0) + 1, total_reservations: (pd.total_reservations || 0) + 1,
            attendance_streak: ns, max_streak: Math.max(pd.max_streak || 0, ns), last_attended_at: new Date().toISOString(),
          }).eq("id", r.profile_id);
          if (u2.error) throw u2.error;
          // Defter: index.html bunu .catch ile yutuyor; biz de durdurmuyoruz ama soyluyoruz.
          const d = await db.from("reputation_ledger").insert([
            { profile_id: r.profile_id, score_type: "trust", delta: tD + sB, balance_after: nT, reason_code: "attended" + (sB > 0 ? "_streak" : ""), source_type: "event", source_id: r.event_id },
            { profile_id: r.profile_id, score_type: "loyalty", delta: lD, balance_after: nL, reason_code: "attended", source_type: "event", source_id: r.event_id },
          ]);
          if (d.error) console.warn("itibar defteri yazilamadi", d.error);
          if (ns >= 2) seriMsg = " · " + ns + " gecelik seri";
          seriMsg += " · " + (SEVIYE[nTier] || nTier);
        }
      }
      sonuc(true, "GİRİŞ OK", r.name + " · " + (r.guest_count || 1) + " kişi" + seriMsg);
      setQr(""); yukle();
    } catch (e) { sonuc(false, "GİRİŞ YAPILAMADI", r.name + " · " + personelHata(e)); } finally { setBusy(false); }
  };
  const girisYap = (kayit) => (yerel ? girisYerel(kayit) : girisKopru(kayit));

  return (
    <div>
      {/* Kapi: kod ile giris */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input value={qr} onChange={e => { setQr(e.target.value); if (kapi) setKapi(null); }} aria-label="Rezervasyon kodu" placeholder="Kapıda: rezervasyon kodu" style={{ ...inputS, textTransform: "uppercase", letterSpacing: "1px" }} onKeyDown={e => e.key === "Enter" && girisYap(null)} />
        <button onClick={() => girisYap(null)} disabled={busy} style={btnS(C.ink, "#000")}>GİRİŞ</button>
      </div>
      {kapi && (
        <div role={kapi.ok ? "status" : "alert"} aria-live={kapi.ok ? "polite" : "assertive"}
          style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 8px 12px 14px", marginBottom: 12, borderRadius: 12,
                   border: "2px solid " + (kapi.ok ? "#7FA88A" : "#C87A6A"), background: kapi.ok ? "#152015" : "#241412", color: "#F0EDE8" }}>
          <Ikon ad={kapi.ok ? "onay" : "uyari"} boy={28} style={{ color: kapi.ok ? "#7FA88A" : "#C87A6A", flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: "0.5px", lineHeight: 1.15 }}>{kapi.baslik}</div>
            <div style={{ fontSize: 15, marginTop: 3, lineHeight: 1.4, overflowWrap: "anywhere" }}>{kapi.alt}</div>
          </div>
          <button onClick={() => setKapi(null)} aria-label="Sonucu kapat"
            style={{ width: 44, height: 44, flexShrink: 0, background: "none", border: "none", color: "#B5B0AA", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Ikon ad="kapat" boy={16} />
          </button>
        </div>
      )}

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
        {[["pending", "Bekleyen"], ["approved", "Onaylı"], ["used", "Girdi"], ["no_show", "Gelmedi"], ["rejected", "Red"], ["", "Hepsi"]].map(([k, ad]) =>
          <Cip key={k} aktif={durum === k} onClick={() => setDurum(k)}>{ad}{k && sayac[k] ? " · " + sayac[k] : ""}</Cip>)}
      </div>
      <select value={etkinlik} onChange={e => setEtkinlik(e.target.value)} aria-label="Etkinlik süzgeci" style={{ ...inputS, marginBottom: 12 }}>
        <option value="">Tüm etkinlikler</option>
        {etkinlikler.map(e => <option key={e.id} value={e.id}>{e.name} — {fmtTarih(e.date)} ({e.approved_count || 0}/{e.capacity})</option>)}
      </select>

      {liste === null && <div style={{ color: C.muted, fontSize: 13 }}>Yükleniyor…</div>}
      {liste && gorunen.length === 0 && <div style={{ color: C.muted, fontSize: 13, padding: 16, textAlign: "center" }}>Bu süzgeçte kayıt yok.</div>}
      {gorunen.map(r => {
        const d = rezDurumu(r);
        const u = yerel && r.customer_id ? uyeler[r.customer_id] : null;
        return (
        <div key={r.id} style={{ background: C.card, border: "1px solid " + C.line, borderRadius: 10, padding: 12, marginBottom: 8 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{r.name || "—"}</div>
            <Durum tablo={REZ_DURUM} kod={d} />
            {!uyeMi(r) && misafirEtiketi && <span style={{ fontSize: 10, color: C.muted }}>MİSAFİR</span>}
            {yerel && uyeMi(r) && <span style={{ fontSize: 10, color: C.ink, fontWeight: 700, letterSpacing: "0.5px" }}>ÜYE</span>}
            {/* "ENGELLİ" yazilmaz: kapida "engelli misafir" diye okunur (inceleme 18.11).
                Engel yalniz YENI talebi keser; mevcut rezervasyon gecerlidir. */}
            {u?.rez_engelli && <span title="Yeni talep açamaz; mevcut rezervasyonu geçerli" style={{ fontSize: 10, padding: "2px 7px", borderRadius: 6, border: "1px solid " + C.down, color: C.down, fontWeight: 700, letterSpacing: "0.5px" }}>TALEP ENGELİ</span>}
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 12, color: C.muted }}>{r.guest_count || 1} kişi</span>
          </div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>
            {r.event_name || "—"} · {fmtTarih(r.event_date)}{r.event_time ? " · " + r.event_time : ""}
          </div>
          {/* Sahip (12.11.2026): uye icin iki sayi — kac kez geldi, kac kez gelmedi. */}
          {u && (
            <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>
              Rezervasyonla <b style={{ color: C.ink }}>{u.rez_geldi || 0}</b> kez geldi · <b style={{ color: u.rez_gelmedi ? C.down : C.ink }}>{u.rez_gelmedi || 0}</b> kez gelmedi
            </div>
          )}
          <div style={{ fontSize: 11, color: C.faint, marginTop: 2 }}>
            {r.phone || "—"} · QR {r.qr_id || "—"}{Array.isArray(r.guest_names) ? (r.guest_names.length ? " · " + r.guest_names.join(", ") : "") : (r.guest_names ? " · " + r.guest_names : "")}{r.note ? " · " + r.note : ""}
          </div>
          {d === "approved" && bildirimOzeti(bildirim[r.id]) && (() => {
            const b = bildirimOzeti(bildirim[r.id]);
            return (
              <div style={{ fontSize: 12, color: b.renk, marginTop: 6, display: "flex", alignItems: "center", gap: 6, fontWeight: 600 }}>
                {b.ikon && <Ikon ad={b.ikon} boy={13} />}{b.metin}
              </div>
            );
          })()}
          <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
            {d === "pending" && yetkili && <button disabled={busy} onClick={() => rezOnayla(r)} style={btnS(C.up, "#000")}>Onayla</button>}
            {d === "approved" && <button disabled={busy} onClick={() => girisYap(r)} style={btnS(C.ink, "#000")}>Giriş</button>}
            {d === "approved" && waOnayLinki(r, yerel) && (
              <a href={waOnayLinki(r, yerel)} target="_blank" rel="noreferrer" style={{ ...btnS("#0F0F0F", "#7FD4A0"), textDecoration: "none" }}>{waTel(r.phone) ? "WhatsApp'tan haber ver" : "WhatsApp (numara hatalı — kişiyi seç)"}</a>
            )}
            {d !== "approved" && waTel(r.phone) && <a href={"https://wa.me/" + waTel(r.phone)} target="_blank" rel="noreferrer" style={{ ...btnS("#0F0F0F", C.muted), textDecoration: "none" }}>WhatsApp</a>}
            <span style={{ flex: 1 }} />
            {/* Geri alinmaz: ilk dokunus sorar, ikinci dokunus yapar (4 sn) */}
            {d === "pending" && yetkili && (
              <button disabled={busy} onClick={() => emin === r.id + ":r" ? reddet(r) : eminSor(r.id + ":r")}
                style={btnS(emin === r.id + ":r" ? C.down : "#0F0F0F", emin === r.id + ":r" ? "#000" : C.down)}>
                {emin === r.id + ":r" ? "Emin misin? Reddet" : "Reddet"}
              </button>
            )}
            {/* Yalniz yerel: onayli kayit iptal edilir (musteri vazgecti). Koltuk bosalir. */}
            {d === "approved" && yerel && yetkili && (
              <button disabled={busy} onClick={() => emin === r.id + ":i" ? onayIptal(r) : eminSor(r.id + ":i")}
                style={btnS(emin === r.id + ":i" ? C.down : "#0F0F0F", emin === r.id + ":i" ? "#000" : C.muted)}>
                {emin === r.id + ":i" ? "Emin misin? İptal et" : "Onayı iptal et"}
              </button>
            )}
            {d === "approved" && yetkili && (
              <button disabled={busy} onClick={() => emin === r.id + ":g" ? gelmedi(r) : eminSor(r.id + ":g")}
                style={btnS(emin === r.id + ":g" ? C.down : "#0F0F0F", emin === r.id + ":g" ? "#000" : C.down)}>
                {emin === r.id + ":g" ? (!yerel && r.profile_id ? "Emin misin? −40 güven" : "Emin misin? Gelmedi") : "Gelmedi"}
              </button>
            )}
            {/* Yanlis isaret ya da gec gelen misafir icin. */}
            {d === "no_show" && yetkili && (
              <button disabled={busy} onClick={() => emin === r.id + ":k" ? gelmediGeriAl(r) : eminSor(r.id + ":k")}
                style={btnS(emin === r.id + ":k" ? C.up : "#0F0F0F", emin === r.id + ":k" ? "#000" : C.muted)}>
                {emin === r.id + ":k" ? (!yerel && r.profile_id ? "Emin misin? +40 güven" : "Emin misin? Geri al") : "Geldi — geri al"}
              </button>
            )}
            {/* Uye engeli (yalniz yerel, yonetici): gelmedi sayisi olan ya da bu
                kaydi "gelmedi" olan uyede cikar; engelliyse her kartinda kaldirilir. */}
            {u && yonetici && u.rez_engelli && (
              <button disabled={busy} onClick={() => engelYaz(r.customer_id, r.name, false)} style={btnS("#0F0F0F", C.up)}>Engeli kaldır</button>
            )}
            {u && yonetici && !u.rez_engelli && ((u.rez_gelmedi || 0) >= 1 || d === "no_show") && (
              <button disabled={busy} onClick={() => emin === r.id + ":e" ? engelYaz(r.customer_id, r.name, true) : eminSor(r.id + ":e")}
                style={btnS(emin === r.id + ":e" ? C.down : "#0F0F0F", emin === r.id + ":e" ? "#000" : C.muted)}>
                {emin === r.id + ":e" ? "Emin misin? Yeni talep açamaz" : "Yeni talebi engelle"}
              </button>
            )}
          </div>
        </div>
        );
      })}

      {/* Talep engeli olan uyeler: kartlari listeden dusse de engel buradan kalkar. */}
      {yerel && yonetici && engelliler.length > 0 && (
        <div style={{ background: C.card, border: "1px solid " + C.line, borderRadius: 10, padding: 12, marginTop: 14 }}>
          <div style={{ fontSize: 10, color: C.muted, letterSpacing: "1px", fontWeight: 700, marginBottom: 4 }}>TALEP ENGELİ OLAN ÜYELER · {engelliler.length}</div>
          <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5, marginBottom: 8 }}>Bu üyeler yeni rezervasyon talebi açamaz. Mevcut rezervasyonları geçerlidir.</div>
          {engelliler.map(k => (
            <div key={k.id} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "8px 0", borderTop: "1px solid " + C.line }}>
              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{k.name || "—"}</div>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{k.phone ? k.phone + " · " : ""}{k.rez_geldi || 0} kez geldi · {k.rez_gelmedi || 0} kez gelmedi</div>
              </div>
              <button disabled={busy} onClick={() => engelYaz(k.id, k.name, false)} style={btnS("#0F0F0F", C.up)}>Engeli kaldır</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// ETKINLIKLER
// ────────────────────────────────────────────────────────────────────────────
const bosEtkinlik = {
  name: "", genre: "", subtitle: "", date: "", time: "22:00", time_end: "04:00",
  warmup_name: "", warmup_start: "22:00", warmup_end: "00:00",
  capacity: 100, access_type: "open", min_tier: "bronze", min_trust: 0,
  rules: "", rules_en: "", rules_ru: "", note: "", color: "",
};

function Etkinlikler({ uyar }) {
  const { yerel, db, yonetici, kaynakAyni } = useContext(RezCtx);
  // Yerelde etkinlik yazmak yonetici ister (RLS: events_yonetim)
  const yetkili = !yerel || yonetici;
  const [liste, setListe] = useState(null);
  const [form, setForm] = useState(bosEtkinlik);
  const [duzenlenen, setDuzenlenen] = useState(null);
  const [busy, setBusy] = useState(false);
  const [gecmisAcik, setGecmisAcik] = useState(false);

  const yukle = async () => {
    const r = await db.from("events")
      .select("id,name,genre,subtitle,date,time,time_end,warmup_name,warmup_start,warmup_end,capacity,approved_count,access_type,min_tier,min_trust,rules,rules_en,rules_ru,note,color,status,poster_thumb")
      .order("date", { ascending: false }).limit(120);
    if (r.error) { uyar("Etkinlikler okunamadı: " + personelHata(r.error), true); setListe([]); }
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
      min_trust: e.min_trust || 0, rules: e.rules || "", rules_en: e.rules_en || "", rules_ru: e.rules_ru || "",
      note: e.note || "", color: e.color || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const iptal = () => { setDuzenlenen(null); setForm(bosEtkinlik); };

  // index.html:1800 updateEvt / 1801 addEvt — ayni alanlar, ayni varsayilanlar.
  // Kurallar uc dilde: menu secili dilde gosterir, bos dilde Turkceyi. Not
  // (musteriye): rezervasyon formunun ustunde gorunur. Yerelde seviye ve guven
  // puani yok; o iki alan yazilmaz (tablodaki varsayilan kalir).
  const kaydet = async () => {
    const name = form.name.trim().toLocaleUpperCase("tr-TR"), cap = parseInt(form.capacity);
    if (!name || !form.date || !cap) return uyar("İsim, tarih ve kapasite zorunlu", true);
    setBusy(true);
    if (!(await kaynakAyni())) { setBusy(false); return; }
    const ortak = {
      name, genre: form.genre.trim(), subtitle: form.subtitle.trim(), date: form.date, time: form.time,
      time_end: form.time_end || null, warmup_name: form.warmup_name.trim() || null,
      warmup_start: form.warmup_start || null, warmup_end: form.warmup_end || null,
      capacity: cap, access_type: form.access_type || "open",
      ...(yerel ? {} : { min_tier: form.min_tier || "bronze", min_trust: parseInt(form.min_trust) || 0 }),
      rules: form.rules.trim(), rules_en: form.rules_en.trim() || null, rules_ru: form.rules_ru.trim() || null,
      note: form.note.trim() || null, color: form.color || null,
    };
    const r = duzenlenen
      ? await db.from("events").update(ortak).eq("id", duzenlenen)
      : await db.from("events").insert({ ...ortak, approved_count: 0, poster_thumb: null, poster_blur: null, status: "active" });
    setBusy(false);
    if (r.error) return uyar("Kaydedilemedi: " + personelHata(r.error), true);
    uyar(duzenlenen ? "Güncellendi ✓" : "Etkinlik oluşturuldu ✓");
    iptal(); yukle();
  };

  // index.html:1803 deleteEvt. Rezervasyonlar SILINMEZ (bag SET NULL, 2026-09-02).
  const sil = async (e) => {
    if (!(await onayla(e.name + " silinsin mi? Rezervasyon kayıtları kalır, etkinlik bağı boşalır.", { evet: "Sil", tehlike: true }))) return;
    setBusy(true);
    if (!(await kaynakAyni())) { setBusy(false); return; }
    const r = await db.from("events").delete().eq("id", e.id);
    setBusy(false);
    if (r.error) return uyar("Silinemedi: " + personelHata(r.error), true);
    uyar(e.name + " silindi"); if (duzenlenen === e.id) iptal(); yukle();
  };

  const F = (k, ekstra = {}) => ({ value: form[k] ?? "", onChange: ev => setForm(f => ({ ...f, [k]: ev.target.value })), style: inputS, ...ekstra });

  return (
    <div>
      {yetkili && (
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
          {/* Uyelere ozel etkinlik: uye girisi olan her kurulumda. Seviye ve
              guven puani yalniz rezervasyon sitesinde (kopru) vardi. */}
          {(!yerel || ozellik("uyelik")) && (
          <Field label="ERİŞİM"><select {...F("access_type")}><option value="open">Herkese açık</option><option value="members_only">Yalnız üyeler</option></select></Field>
          )}
          {!yerel && <>
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
        <Field label="MÜŞTERİYE NOT (isteğe bağlı; rezervasyon formunun üstünde görünür)"><textarea rows={2} {...F("note")} style={{ ...inputS, resize: "vertical" }} /></Field>
        <Field label="KURALLAR (Türkçe; müşteri onaylamadan talep gönderemez)"><textarea rows={3} {...F("rules")} style={{ ...inputS, resize: "vertical" }} /></Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <Field label="KURALLAR — İNGİLİZCE"><textarea rows={3} {...F("rules_en")} style={{ ...inputS, resize: "vertical" }} /></Field>
          <Field label="KURALLAR — RUSÇA"><textarea rows={3} {...F("rules_ru")} style={{ ...inputS, resize: "vertical" }} /></Field>
        </div>
        <div style={{ fontSize: 11, color: C.faint, margin: "-4px 0 8px", lineHeight: 1.5 }}>İngilizce ya da Rusça boşsa o dilde Türkçe kurallar gösterilir.</div>
        {!yerel && <div style={{ fontSize: 11, color: C.faint, marginBottom: 8 }}>Afiş yükleme şimdilik rezervasyon panelinden; burada gösterilir, değiştirilmez.</div>}
        <div style={{ display: "flex", gap: 8 }}>
          <button disabled={busy} onClick={kaydet} style={btnS(C.ink, "#000")}>{duzenlenen ? "GÜNCELLE" : "OLUŞTUR"}</button>
          {duzenlenen && <button onClick={iptal} style={btnS()}>Vazgeç</button>}
        </div>
      </div>
      )}

      {liste === null && <div style={{ color: C.muted, fontSize: 13 }}>Yükleniyor…</div>}
      {yaklasan.map(e => <EtkinlikKart key={e.id} e={e} duzenle={duzenle} sil={sil} busy={busy} yetkili={yetkili} />)}
      {liste && yaklasan.length === 0 && <div style={{ color: C.muted, fontSize: 13, padding: 12, textAlign: "center" }}>Yaklaşan etkinlik yok.</div>}

      {gecmis.length > 0 && (
        <button onClick={() => setGecmisAcik(a => !a)} style={{ ...btnS("#0F0F0F", C.muted), width: "100%", marginTop: 8 }}>
          {gecmisAcik ? "Geçmişi gizle" : "Geçmiş (" + gecmis.length + ")" + (yerel ? "" : " — son iki hafta; eskiler her gece arşive gider")}
        </button>
      )}
      {gecmisAcik && gecmis.map(e => <EtkinlikKart key={e.id} e={e} duzenle={duzenle} sil={sil} busy={busy} yetkili={yetkili} gecmis />)}
    </div>
  );
}

function EtkinlikKart({ e, duzenle, sil, busy, gecmis, yetkili = true }) {
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
      {yetkili && (
      <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
        <button disabled={busy} onClick={() => duzenle(e)} style={btnS()}>Düzenle</button>
        <button disabled={busy} onClick={() => sil(e)} style={btnS("#0F0F0F", C.down)}>Sil</button>
      </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// UYELER (rezervasyon tarafi profilleri)
// ────────────────────────────────────────────────────────────────────────────
function Uyeler({ uyar, staffUser }) {
  const { db, kaynakAyni } = useContext(RezCtx);
  const [liste, setListe] = useState(null);
  // Uyelik onaysiz (10.11.2026): bekleyen kuyruk yok, liste "Üye" ile acilir
  const [durum, setDurum] = useState("approved");
  const [ara, setAra] = useState("");
  const [busy, setBusy] = useState(false);

  const yukle = async () => {
    const r = await db.from("profiles")
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
      if (!(await kaynakAyni())) return;
      const kod = "NIP-MBR-" + hex6(), ref = "NIP-REF-" + hex6();
      const u = await db.from("profiles").update({ status: "approved", member_code: kod, referral_code: ref, approved_at: new Date().toISOString() }).eq("id", p.id);
      if (u.error) throw u.error;
      const d = await db.from("reputation_ledger").insert({ profile_id: p.id, score_type: "trust", delta: 100, balance_after: 100, reason_code: "approved", source_type: "admin" });
      if (d.error) console.warn("itibar defteri yazilamadi", d.error);
      const bagHata = await orderaBagla(p, kod);
      uyar("Onaylandı → " + kod + (bagHata ? " (Order'a bağlanamadı: " + bagHata + ")" : " · Order'a bağlandı"), !!bagHata);
      yukle();
    } catch (e) { uyar("Onaylanamadı: " + e.message, true); } finally { setBusy(false); }
  };
  // index.html:1708 / 1736
  const durumYaz = async (p, s, msg) => {
    if (busy) return; setBusy(true);
    if (!(await kaynakAyni())) { setBusy(false); return; }
    const u = await db.from("profiles").update({ status: s }).eq("id", p.id);
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
