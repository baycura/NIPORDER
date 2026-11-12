import { useEffect, useMemo, useRef, useState } from "react";
import { onayla } from "../../lib/onayla.js";
import { baslikStil } from "../../theme/panel.js";
import { uyar } from "../../lib/uyar.js";
import { useSearchParams } from "react-router-dom";
import { supabase } from "../../lib/supabase.js";
import { useAuth } from "../../contexts/AuthContext.jsx";
import Ikon from "../../components/Ikon.jsx";
import { guncelAy, ayGecerli, ayKaydir, ayEtiketi, ayGunSayisi, fmtTL, fmtSayi } from "../../lib/hakedis.js";
import { APP_HOST } from "../../lib/appUrl.js";

const cv = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";
const hv = "'Bebas Neue','Barlow Condensed','Coolvetica Condensed',sans-serif";
const C = { card: "#161616", line: "#262626", ink: "#F0EDE8", muted: "#8A8A86", faint: "#666666", accent: "#FFFFFF", down: "#C87A6A", ok: "#7FB27A" };
// Ikramda bizim pay eksiye duser (mal gitti, para gelmedi): "−₺1.000"
const tl = (n) => (Number(n) < 0 ? "−" : "") + fmtTL(Math.abs(Number(n) || 0));
const ayKisa = (donem) => ayEtiketi(String(donem).slice(0, 7));
const tarihSaat = (d) => d ? new Date(d).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";

// Konsinye Hesabı — iki gorunum.
//
// HESAPLAR (varsayilan): her ayin 1'inde sistem gecen ayi tedarikci tedarikci
// keser (nip_konsinye_aylik cron -> konsinye_hesaplar). Kayit "Bekliyor"
// olarak durur; sahip "Odendi"ye basinca kapanir. Magazanin tum yoneticileri
// gorur (RLS), odendi yalniz admin (nip_konsinye_odendi). Kart duzeni, tedarikciye
// gonderilen Excel ile ayni: urun, adet, perakende, toplam, NIP payi, marka payi.
// CSV indir: ayni tabloyu Excel'de acilir dosya olarak verir.
//
// CANLI: secilen ayin o anki durumu (nip_konsinye_raporu). Ay bitmeden
// "su an ne kadar" diye bakmak icin. Kesim yapmaz.
//
// Tedarikci payi ETIKET fiyatindan (sahip 1.11); indirim ve ikram bizim paydan
// duser, ikramda bizim pay eksi olur.
//
// E-POSTA: her ayin 1'inde 04:45'te konsinye-mail edge fonksiyonu tedarikci
// basina bir Excel uretir ve konsinye_mail.alicilar adreslerine gonderir
// (sahip 1.11: cerenbaycura@gmail.com). Admin "E-postayla gonder" ile ayni
// e-postayi istediginde yollar; son gonderim sonucu panelin altinda gorunur.
//
// Elle duzeltilen kayit (kilitli, duzeltme_notu) "Duzeltildi" etiketi tasir;
// yeniden kesim ona dokunmaz.
export default function KonsinyePage() {
  const { staffUser, isAdmin } = useAuth();
  const storeIds = staffUser?.store_ids || [];
  const [params, setParams] = useSearchParams();
  const buAy = guncelAy();
  const ayParam = params.get("ay");
  const ay = ayGecerli(ayParam) && ayParam <= buAy ? ayParam : buAy;
  const setAy = (a) => setParams(p => { const q = new URLSearchParams(p); if (a === buAy) q.delete("ay"); else q.set("ay", a); return q; }, { replace: true });
  const mod = params.get("g") === "canli" ? "canli" : "hesaplar";
  const setMod = (m) => setParams(p => { const q = new URLSearchParams(p); if (m === "hesaplar") q.delete("g"); else q.set("g", m); return q; }, { replace: true });

  const [stores, setStores] = useState([]);
  const [storeId, setStoreId] = useState(null);
  const [acik, setAcik] = useState(null);
  const [kopya, setKopya] = useState("");
  const [busy, setBusy] = useState(null);
  const [hata, setHata] = useState(null);

  // Hesaplar
  const [hesaplar, setHesaplar] = useState(null);
  const [mail, setMail] = useState(null);     // konsinye_mail: {alicilar, son}
  // Canli
  const [satirlar, setSatirlar] = useState(null);
  const istekNo = useRef(0);

  useEffect(() => {
    if (!storeIds.length) return;
    supabase.from("stores").select("id,name,slug").in("id", storeIds).order("slug").then(r => {
      const list = r.data || [];
      setStores(list);
      setStoreId(prev => prev || list[0]?.id || null);
    });
  }, [staffUser?.id]);

  const hesaplariYukle = () => {
    if (!storeId) return;
    const no = ++istekNo.current;
    setHesaplar(null); setHata(null);
    supabase.from("konsinye_hesaplar").select("*").eq("store_id", storeId)
      .order("donem", { ascending: false }).order("tedarikci_pay", { ascending: false }).limit(400)
      .then(({ data, error }) => {
        if (no !== istekNo.current) return;
        if (error) { setHata(error.message); setHesaplar([]); return; }
        setHesaplar(data || []);
      });
    supabase.from("konsinye_mail").select("alicilar,son").eq("store_id", storeId).maybeSingle()
      .then(({ data }) => { if (no === istekNo.current) setMail(data || null); });
  };
  const canliYukle = () => {
    if (!storeId) return;
    const no = ++istekNo.current;
    setSatirlar(null); setHata(null);
    const bas = ay + "-01";
    const bit = ay + "-" + String(ayGunSayisi(ay)).padStart(2, "0");
    supabase.rpc("nip_konsinye_raporu", { p_store_id: storeId, p_bas: bas, p_bit: bit }).then(({ data, error }) => {
      if (no !== istekNo.current) return;
      if (error) { setHata(error.message); setSatirlar([]); return; }
      setSatirlar(data || []);
    });
  };
  const yukle = () => { if (mod === "canli") canliYukle(); else hesaplariYukle(); };
  useEffect(yukle, [storeId, ay, mod]);

  useEffect(() => {
    if (!kopya) return undefined;
    const t = setTimeout(() => setKopya(""), 2000);
    return () => clearTimeout(t);
  }, [kopya]);

  // ---- Hesaplar: aya gore grupla
  const aylar = useMemo(() => {
    const m = new Map();
    for (const h of hesaplar || []) {
      const k = String(h.donem).slice(0, 7);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(h);
    }
    return [...m.entries()];
  }, [hesaplar]);

  const odendiYaz = async (h, geri) => {
    if (!isAdmin) return;
    if (!geri && !(await onayla(`${h.tedarikci} — ${ayKisa(h.donem)}: ${tl(h.tedarikci_pay)} ödendi olarak işaretlensin mi?`))) return;
    if (geri && !(await onayla(`${h.tedarikci} — ${ayKisa(h.donem)}: ödendi işareti geri alınsın mı?`))) return;
    setBusy(h.id);
    const { data, error } = await supabase.rpc("nip_konsinye_odendi", { p_id: h.id, p_geri: !!geri });
    setBusy(null);
    if (error) { uyar("Kaydedilemedi: " + error.message); return; }
    setHesaplar(list => (list || []).map(x => x.id === h.id ? { ...x, ...(data || {}) } : x));
  };

  const [kesimAy, setKesimAy] = useState(ayKaydir(buAy, -1));
  const kes = async () => {
    if (!isAdmin || !storeId) return;
    if (!(await onayla(`${ayEtiketi(kesimAy)} hesapları kesilsin mi? Ödenmiş kayıtlar değişmez; bekleyenler güncel satışla tazelenir.`))) return;
    setBusy("kes");
    const { data, error } = await supabase.rpc("nip_konsinye_hesap_kes", { p_store_id: storeId, p_donem: kesimAy + "-01" });
    setBusy(null);
    if (error) { uyar("Kesilemedi: " + error.message); return; }
    uyar(`${ayEtiketi(kesimAy)}: ${Number(data) || 0} tedarikçi hesabı kesildi.`, "basari");
    hesaplariYukle();
  };
  // Secili ayin hesaplarini tedarikci basina Excel olarak e-postayla yolla
  // (konsinye-mail edge fonksiyonu; alicilar konsinye_mail tablosunda).
  const mailGonder = async () => {
    if (!isAdmin || !storeId) return;
    const kime = (mail?.alicilar || []).join(", ") || "alıcı yok";
    if (!(await onayla(`${ayEtiketi(kesimAy)} hesapları tedarikçi başına Excel olarak e-postayla gönderilsin mi?\nAlıcı: ${kime}`))) return;
    setBusy("mail");
    const { data, error } = await supabase.functions.invoke("konsinye-mail", { body: { donem: kesimAy, store_id: storeId } });
    setBusy(null);
    let hataMetni = data?.error || null;
    let tg = Number(data?.telegram) || 0;
    if (error) {
      hataMetni = error.message;
      try { const j = await error.context?.json?.(); if (j?.error) hataMetni = j.error; if (j?.telegram) tg = Number(j.telegram) || 0; } catch { /* govde okunamadi */ }
    }
    hesaplariYukle();
    // E-posta gidemezse fonksiyon dosyalari sahibin Telegram'ina belge olarak yollar
    if (hataMetni) { uyar("E-posta gönderilemedi: " + hataMetni + (tg ? "\n\nDosyalar Telegram'a gönderildi." : "")); return; }
    uyar(`Gönderildi: ${(data?.dosyalar || []).length} dosya → ${(data?.alicilar || []).join(", ")}`, "basari");
  };

  // ---- Tedarikciye giden metin / CSV (Excel ile ayni duzen)
  const paylar = (h) => {
    const biz = h.pay_pct == null ? null : Number(h.pay_pct);
    return { biz, ted: biz == null ? null : 100 - biz, karisik: biz != null && !!h.pay_karisik };
  };
  const oranMetni = (h) => {
    const { biz, ted, karisik } = paylar(h);
    return ted == null ? "pay yazılmadı" : karisik ? "karışık pay (ürün bazında)" : `%${ted} tedarikçi · %${biz} bizim`;
  };
  const metin = (h) => {
    const { biz, ted, karisik } = paylar(h);
    const satir = (h.satirlar || []).map(s => `• ${s.urun}: ${fmtSayi(s.adet)} adet × ${fmtTL(s.perakende)} = ${fmtTL(s.toplam)}`);
    return [
      `${h.tedarikci.toUpperCase()} × NOT IN PARIS — ${ayKisa(h.donem)} Satış Raporu`,
      ...satir,
      `Toplam: ${fmtSayi(h.adet)} adet · perakende ${fmtTL(h.perakende)}`,
      h.duzeltme_notu || "",
      ted == null ? "Pay oranı yazılmadı." : karisik ? `${h.tedarikci} payı (ürün bazında karışık oran): ${tl(h.tedarikci_pay)} · NOT IN PARIS payı: ${tl(h.bizim_pay)}`
        : `${h.tedarikci} payı %${ted}: ${tl(h.tedarikci_pay)} · NOT IN PARIS payı %${biz}: ${tl(h.bizim_pay)}`,
      "Paylar perakende (etiket) fiyatı üzerinden, KDV dahil.",
      h.durum === "odendi" ? `Ödendi: ${tarihSaat(h.odendi_at)}` : "",
      "Not in Paris · " + APP_HOST,
    ].filter(Boolean).join("\n");
  };
  const kopyala = async (h) => {
    try { await navigator.clipboard.writeText(metin(h)); setKopya(h.id); }
    catch { setKopya("yok"); }
  };
  const csvIndir = (h) => {
    const { biz, ted, karisik } = paylar(h);
    const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const n = (v) => String(Math.round(Number(v) || 0));
    const pay = (v) => ted == null ? q("pay yazılmadı") : n(v);   // pay yoksa tutar yazilmaz (ekranla ayni)
    const yuzde = (p) => ted == null || karisik ? "" : " %" + p;
    const bas = ["Ürün", "Barkod", "Adet", "Perakende fiyatı", "Toplam (perakende)", `NOT IN PARIS payı${yuzde(biz)}`, `${h.tedarikci} payı${yuzde(ted)}`];
    const satir = (h.satirlar || []).map(s => [q(s.urun), q(s.barkod || ""), n(s.adet), n(s.perakende), n(s.toplam), pay(s.bizim_pay), pay(s.tedarikci_pay)].join(";"));
    const toplam = [q("TOPLAM"), "", n(h.adet), "", n(h.perakende), pay(h.bizim_pay), pay(h.tedarikci_pay)].join(";");
    const ust = [q(`${h.tedarikci.toUpperCase()} × NOT IN PARIS`), q(`${ayKisa(h.donem)} Satış Raporu`), q("Paylar perakende (etiket) fiyatı üzerinden; KDV dahil.")].join(";");
    const icerik = "﻿" + [ust, "", bas.map(q).join(";"), ...satir, toplam, "", [q("Ödenecek tutar"), "", "", "", "", "", pay(h.tedarikci_pay)].join(";"), ...(karisik ? [q("Ürün bazında farklı pay oranları; paylar satır bazında.")] : []), ...(h.duzeltme_notu ? [q(h.duzeltme_notu)] : [])].join("\r\n");
    const blob = new window.Blob([icerik], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = window.URL.createObjectURL(blob);
    a.download = `${h.tedarikci.replace(/[^\w\dğüşıöçĞÜŞİÖÇ]+/g, "_")}_x_NOT_IN_PARIS_${ayKisa(h.donem).replace(" ", "_")}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => window.URL.revokeObjectURL(a.href), 2000);
  };

  // ---- Canli gruplar (eski gorunum)
  const gruplar = useMemo(() => {
    const m = new Map();
    for (const r of satirlar || []) {
      const k = r.tedarikci || "—";
      if (!m.has(k)) m.set(k, { ad: k, urunler: [], adet: 0, ikram: 0, satis: 0, taban: 0, bizim: 0, odenecek: 0, eksik: 0, paylar: new Set() });
      const g = m.get(k);
      g.urunler.push(r);
      g.adet += Number(r.adet || 0); g.ikram += Number(r.ikram_adet || 0); g.satis += Number(r.satis || 0); g.taban += Number(r.taban || 0);
      if (r.pay_pct == null) g.eksik += 1;
      else { g.bizim += Number(r.bizim_pay || 0); g.odenecek += Number(r.tedarikci_pay || 0); g.paylar.add(Number(r.pay_pct)); }
    }
    return [...m.values()].sort((a, b) => b.odenecek - a.odenecek || b.satis - a.satis);
  }, [satirlar]);
  const canliToplam = useMemo(() => gruplar.reduce((t, g) => ({ satis: t.satis + g.satis, taban: t.taban + g.taban, bizim: t.bizim + g.bizim, odenecek: t.odenecek + g.odenecek, eksik: t.eksik + g.eksik }), { satis: 0, taban: 0, bizim: 0, odenecek: 0, eksik: 0 }), [gruplar]);
  const payYaz = (g) => { const p = [...g.paylar]; if (!p.length) return "pay yazılmadı"; return p.length === 1 ? `%${100 - p[0]} tedarikçi · %${p[0]} bizim` : "karışık pay"; };

  const kart = { background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: 16 };
  const etiket = { fontSize: 12, color: C.muted, letterSpacing: "0.2px", fontWeight: 600 };
  const dugme = (aktif) => ({ padding: "7px 14px", borderRadius: 999, cursor: "pointer", fontWeight: 700, fontSize: 12, fontFamily: cv, minHeight: 36,
    background: aktif ? C.accent : "transparent", color: aktif ? "#000" : C.muted, border: `1px solid ${aktif ? C.accent : C.line}` });
  const kucukDugme = { minHeight: 36, padding: "0 12px", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 12, fontFamily: cv,
    background: "transparent", color: C.ink, border: `1px solid ${C.line}`, display: "inline-flex", alignItems: "center", gap: 6 };
  const cip = (a, l) => <button key={a} type="button" onClick={() => setAy(a)} style={dugme(ay === a)}>{l}</button>;

  return (
    <div style={{ padding: 16, fontFamily: cv, color: C.ink, maxWidth: 900, margin: "0 auto", paddingBottom: 80 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
        <h1 style={{ ...baslikStil, display: "flex", alignItems: "center" }}>
          <Ikon ad="raf" boy={22} style={{ marginRight: 10 }} />Konsinye Hesabı
        </h1>
        <button type="button" onClick={yukle} title="Yenile" style={{ background: "none", border: `1px solid ${C.line}`, color: C.muted, borderRadius: 6, padding: "4px 8px", cursor: "pointer", display: "inline-flex" }}><Ikon ad="yenile" boy={13} /></button>
      </div>
      <p style={{ fontSize: 13, color: C.muted, margin: "6px 0 14px", lineHeight: 1.5, maxWidth: "62ch" }}>
        Tedarikçinin malı olan ürünlerin (konsinye) aylık hesabı. Her ayın 1'inde geçen ay tedarikçi tedarikçi kesilir ve "Bekliyor" olarak durur; ödeme yapılınca "Ödendi" işaretlenir.
        Tedarikçi payı etiket fiyatından hesaplanır; indirim ve ikram bizim paydan düşer.
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <button type="button" onClick={() => setMod("hesaplar")} style={dugme(mod === "hesaplar")}>Hesaplar</button>
        <button type="button" onClick={() => setMod("canli")} style={dugme(mod === "canli")}>Canlı</button>
        {stores.length > 1 && <span style={{ width: 8 }} />}
        {stores.length > 1 && stores.map(s => (
          <button key={s.id} onClick={() => setStoreId(s.id)} style={dugme(storeId === s.id)}>{s.name}</button>
        ))}
        <div style={{ flex: 1 }} />
        {mod === "canli" && <>
          <button type="button" onClick={() => setAy(ayKaydir(ay, -1))} aria-label="Önceki ay" style={{ background: "none", border: `1px solid ${C.line}`, color: C.muted, borderRadius: 999, width: 36, height: 36, cursor: "pointer" }}><Ikon ad="oksol" boy={13} /></button>
          {cip(buAy, "Bu ay")}
          {cip(ayKaydir(buAy, -1), "Geçen ay")}
          <button type="button" onClick={() => setAy(ayKaydir(ay, 1))} disabled={ay >= buAy} aria-label="Sonraki ay" style={{ background: "none", border: `1px solid ${C.line}`, color: ay >= buAy ? "#444" : C.muted, borderRadius: 999, width: 36, height: 36, cursor: ay >= buAy ? "not-allowed" : "pointer" }}><Ikon ad="oksag" boy={13} /></button>
        </>}
      </div>

      {hata && (
        <div style={{ ...kart, borderColor: C.down, color: C.down, fontSize: 13, display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <Ikon ad="uyari" boy={15} />{hata}
        </div>
      )}

      {/* ================= HESAPLAR ================= */}
      {mod === "hesaplar" && (<>
        {isAdmin && (
          <div style={{ ...kart, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12, padding: 12 }}>
            <div style={{ fontSize: 12, color: C.muted, flex: "1 1 200px" }}>Kesim her ayın 1'inde 04:15'te kendiliğinden yapılır; 04:45'te Excel'ler e-postayla gider. Beklemeden kesmek, tazelemek ya da e-postayı şimdi göndermek için:</div>
            <select value={kesimAy} onChange={e => setKesimAy(e.target.value)} style={{ minHeight: 36, padding: "6px 10px", background: "#0C0C0C", color: C.ink, border: `1px solid ${C.line}`, borderRadius: 8, fontFamily: cv, fontSize: 12 }}>
              {[1, 2, 3, 4].map(i => { const a = ayKaydir(buAy, -i); return <option key={a} value={a}>{ayEtiketi(a)}</option>; })}
            </select>
            <button type="button" onClick={kes} disabled={busy === "kes"} style={{ ...kucukDugme, background: C.accent, color: "#000", border: "none", opacity: busy === "kes" ? 0.6 : 1 }}>
              {busy === "kes" ? "Kesiliyor…" : "Hesapları kes"}
            </button>
            <button type="button" onClick={mailGonder} disabled={busy === "mail"} style={{ ...kucukDugme, opacity: busy === "mail" ? 0.6 : 1 }}>
              <Ikon ad="belge" boy={14} />{busy === "mail" ? "Gönderiliyor…" : "E-postayla gönder"}
            </button>
          </div>
        )}
        {mail && (
          <div style={{ fontSize: 12, color: C.faint, margin: "0 4px 12px", lineHeight: 1.5 }}>
            E-posta: {(mail.alicilar || []).join(", ") || "alıcı yok"} · her ayın 1'inde 04:45'te, tedarikçi başına bir Excel.
            {mail.son ? <> Son gönderim {tarihSaat(mail.son.at)}{mail.son.donem ? ` (${ayKisa(mail.son.donem)})` : ""}: <span style={{ color: mail.son.ok ? C.ok : C.down }}>{mail.son.mesaj}</span></> : " Henüz gönderilmedi."}
          </div>
        )}
        {hesaplar === null && !hata && <div style={{ padding: 40, textAlign: "center", color: C.muted }}>Yükleniyor…</div>}
        {hesaplar && hesaplar.length === 0 && !hata && (
          <div style={{ ...kart, textAlign: "center", color: C.muted, padding: 40, fontSize: 13, lineHeight: 1.6 }}>
            Henüz kesilmiş hesap yok. İlk kesim ayın 1'inde kendiliğinden yapılır{isAdmin ? "; yukarıdan şimdi de kesebilirsin" : ""}.
          </div>
        )}
        {aylar.map(([ayKey, liste]) => {
          const bekleyen = liste.filter(h => h.durum !== "odendi");
          const bekleyenToplam = bekleyen.reduce((t, h) => t + Number(h.tedarikci_pay || 0), 0);
          return (
            <div key={ayKey} style={{ marginBottom: 18 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, margin: "6px 0 8px", flexWrap: "wrap" }}>
                <div style={{ fontFamily: hv, fontSize: 24, letterSpacing: 0.5 }}>{ayEtiketi(ayKey)}</div>
                <div style={{ fontSize: 12, color: C.muted }}>
                  {liste.length} tedarikçi · {bekleyen.length ? <span style={{ color: C.ink, fontWeight: 700 }}>bekleyen {tl(bekleyenToplam)}</span> : <span style={{ color: C.ok, fontWeight: 700 }}>hepsi ödendi</span>}
                </div>
              </div>
              {liste.map(h => {
                const acikBu = acik === h.id;
                const { ted } = paylar(h);
                const odendi = h.durum === "odendi";
                return (
                  <div key={h.id} style={{ ...kart, padding: 0, overflow: "hidden", marginBottom: 10, borderColor: odendi ? C.line : "#3A3A3A" }}>
                    <div onClick={() => setAcik(acikBu ? null : h.id)} role="button" tabIndex={0}
                         onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setAcik(acikBu ? null : h.id); } }}
                         style={{ padding: "14px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                      <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                        <div style={{ fontSize: 16, fontWeight: 800, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <Ikon ad={acikBu ? "asagi" : "sag"} boy={13} style={{ color: C.muted }} />
                          <span>{h.tedarikci.toUpperCase()} × NOT IN PARIS</span>
                          <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: odendi ? "rgba(127,178,122,0.15)" : "rgba(255,255,255,0.08)", color: odendi ? C.ok : C.ink }}>
                            {odendi ? "Ödendi" : "Bekliyor"}
                          </span>
                          {h.kilitli && <span title="Elle düzeltildi; yeniden kesim dokunmaz" style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "rgba(200,122,106,0.15)", color: C.down }}>Düzeltildi</span>}
                        </div>
                        <div style={{ fontSize: 12, color: C.faint, marginTop: 3 }}>
                          {fmtSayi(h.adet)} adet · perakende {fmtTL(h.perakende)} · {ted == null ? <span style={{ color: C.down }}>pay yazılmadı</span> : oranMetni(h)}
                          {odendi && h.odendi_at ? ` · ödendi ${tarihSaat(h.odendi_at)}` : ""}
                        </div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontSize: 18, fontWeight: 800, fontVariantNumeric: "tabular-nums", color: ted == null ? C.down : C.ink }}>{ted == null ? "pay yok" : tl(h.tedarikci_pay)}</div>
                        <div style={{ fontSize: 11, color: C.faint }}>{ted == null ? "önce payı yaz" : <>ödenecek · bizim {tl(h.bizim_pay)}</>}</div>
                      </div>
                    </div>
                    {acikBu && (
                      <div style={{ borderTop: `1px solid ${C.line}`, padding: "6px 16px 14px" }}>
                        <div style={{ overflowX: "auto" }}>
                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 520 }}>
                            <thead>
                              <tr style={{ color: C.muted, fontSize: 11, textAlign: "left" }}>
                                <th style={{ padding: "8px 6px 6px 0", fontWeight: 600 }}>Ürün</th>
                                <th style={{ padding: "8px 6px 6px", fontWeight: 600, textAlign: "center" }}>Adet</th>
                                <th style={{ padding: "8px 6px 6px", fontWeight: 600, textAlign: "right" }}>Perakende</th>
                                <th style={{ padding: "8px 6px 6px", fontWeight: 600, textAlign: "right" }}>Toplam</th>
                                <th style={{ padding: "8px 6px 6px", fontWeight: 600, textAlign: "right" }}>NIP payı</th>
                                <th style={{ padding: "8px 0 6px 6px", fontWeight: 600, textAlign: "right" }}>{h.tedarikci} payı</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(h.satirlar || []).map((s, i) => (
                                <tr key={i} style={{ borderTop: `1px solid ${C.line}` }}>
                                  <td style={{ padding: "7px 6px 7px 0" }}>{s.urun}{s.barkod ? <span style={{ color: C.faint, fontSize: 11 }}> · {s.barkod}</span> : null}{Number(s.ikram) > 0 ? <span style={{ color: C.faint, fontSize: 11 }}> · {fmtSayi(s.ikram)} ikram</span> : null}</td>
                                  <td style={{ padding: "7px 6px", textAlign: "center" }}>{fmtSayi(s.adet)}</td>
                                  <td style={{ padding: "7px 6px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtTL(s.perakende)}</td>
                                  <td style={{ padding: "7px 6px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtTL(s.toplam)}</td>
                                  <td style={{ padding: "7px 6px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: Number(s.bizim_pay) < 0 ? C.down : C.ink }}>{ted == null ? "—" : tl(s.bizim_pay)}</td>
                                  <td style={{ padding: "7px 0 7px 6px", textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>{ted == null ? "—" : tl(s.tedarikci_pay)}</td>
                                </tr>
                              ))}
                              <tr style={{ borderTop: `1px solid ${C.ink}`, fontWeight: 800 }}>
                                <td style={{ padding: "8px 6px 4px 0" }}>TOPLAM</td>
                                <td style={{ padding: "8px 6px 4px", textAlign: "center" }}>{fmtSayi(h.adet)}</td>
                                <td />
                                <td style={{ padding: "8px 6px 4px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtTL(h.perakende)}</td>
                                <td style={{ padding: "8px 6px 4px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{ted == null ? "—" : tl(h.bizim_pay)}</td>
                                <td style={{ padding: "8px 0 4px 6px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{ted == null ? "—" : tl(h.tedarikci_pay)}</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                        <div style={{ fontSize: 11, color: C.faint, marginTop: 6 }}>
                          Gerçek tahsilat {fmtTL(h.satis)}. Kesim {tarihSaat(h.kesildi_at)}{h.guncellendi && h.guncellendi !== h.kesildi_at ? `, güncelleme ${tarihSaat(h.guncellendi)}` : ""}.{h.odeme_notu ? ` ${h.odeme_notu}` : ""}
                        </div>
                        {h.duzeltme_notu && <div style={{ fontSize: 12, color: C.down, marginTop: 4 }}>{h.duzeltme_notu}</div>}
                        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                          {isAdmin && !odendi && (
                            <button type="button" onClick={() => odendiYaz(h, false)} disabled={busy === h.id}
                              style={{ ...kucukDugme, background: C.accent, color: "#000", border: "none", opacity: busy === h.id ? 0.6 : 1 }}>
                              <Ikon ad="onay" boy={14} />Ödendi
                            </button>
                          )}
                          {isAdmin && odendi && (
                            <button type="button" onClick={() => odendiYaz(h, true)} disabled={busy === h.id} style={{ ...kucukDugme, color: C.muted }}>Ödendi işaretini geri al</button>
                          )}
                          <button type="button" onClick={() => csvIndir(h)} style={kucukDugme}><Ikon ad="belge" boy={14} />Excel (CSV) indir</button>
                          <button type="button" onClick={() => kopyala(h)} style={kucukDugme}>
                            <Ikon ad="kopyala" boy={14} />{kopya === h.id ? "Kopyalandı" : kopya === "yok" ? "Kopyalanamadı" : "Metni kopyala"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </>)}

      {/* ================= CANLI ================= */}
      {mod === "canli" && (<>
        <div style={{ ...kart, marginBottom: 10 }}>
          <div style={etiket}>{ayEtiketi(ay)} · şu ana kadar tedarikçilere ödenecek</div>
          <div style={{ fontSize: 48, fontWeight: 900, fontFamily: hv, lineHeight: 1, marginTop: 6, fontVariantNumeric: "tabular-nums" }}>
            {satirlar === null && !hata ? "…" : fmtTL(canliToplam.odenecek)}
          </div>
          <div style={{ fontSize: 13, color: C.muted, marginTop: 6 }}>
            perakende {fmtTL(canliToplam.taban)} · tahsilat {fmtTL(canliToplam.satis)} · bizim pay <span style={{ color: C.ink, fontWeight: 700 }}>{tl(canliToplam.bizim)}</span>
            {canliToplam.eksik > 0 && <span style={{ color: C.down }}> · {canliToplam.eksik} üründe pay yazılmadı</span>}
          </div>
        </div>
        {satirlar === null && !hata && <div style={{ padding: 40, textAlign: "center", color: C.muted }}>Yükleniyor…</div>}
        {satirlar && satirlar.length === 0 && !hata && (
          <div style={{ ...kart, textAlign: "center", color: C.muted, padding: 40, fontSize: 13, lineHeight: 1.6 }}>
            Bu ay konsinye ürün satışı yok.<br />
            <span style={{ fontSize: 12, color: C.faint }}>Konsinye tanımı: Menü Yönetimi → kategori ya da ürün → "Konsinye" kutusu ve bizim pay %.</span>
          </div>
        )}
        {gruplar.map(g => {
          const acikBu = acik === "c:" + g.ad;
          return (
            <div key={g.ad} style={{ ...kart, padding: 0, overflow: "hidden", marginBottom: 10 }}>
              <div onClick={() => setAcik(acikBu ? null : "c:" + g.ad)} role="button" tabIndex={0}
                   onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setAcik(acikBu ? null : "c:" + g.ad); } }}
                   style={{ padding: "14px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 800 }}><Ikon ad={acikBu ? "asagi" : "sag"} boy={13} style={{ marginRight: 7, color: C.muted }} />{g.ad}</div>
                  <div style={{ fontSize: 12, color: C.faint, marginTop: 3 }}>
                    {fmtSayi(g.adet)} adet{g.ikram > 0 ? ` (${fmtSayi(g.ikram)} ikram)` : ""} · perakende {fmtTL(g.taban)} · {payYaz(g)}
                    {g.eksik > 0 && <span style={{ color: C.down }}> · {g.eksik} üründe pay yok</span>}
                  </div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: 18, fontWeight: 800, fontVariantNumeric: "tabular-nums", color: g.eksik && !g.odenecek ? C.down : C.ink }}>{g.eksik && !g.odenecek ? "pay yok" : tl(g.odenecek)}</div>
                  <div style={{ fontSize: 11, color: C.faint }}>{g.eksik && !g.odenecek ? "önce payı yaz" : <>ödenecek · bizim {tl(g.bizim)}</>}</div>
                </div>
              </div>
              {acikBu && (
                <div style={{ borderTop: `1px solid ${C.line}`, padding: "6px 16px 14px" }}>
                  {g.urunler.map(r => (
                    <div key={r.product_id} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "8px 0", borderBottom: `1px solid ${C.line}`, fontSize: 13 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.urun}</div>
                        <div style={{ fontSize: 12, color: C.faint }}>
                          {fmtSayi(r.adet)} adet{Number(r.ikram_adet) > 0 ? ` · ${fmtSayi(r.ikram_adet)} ikram` : ""} · perakende {fmtTL(r.taban)} · tahsilat {fmtTL(r.satis)}
                          {r.pay_pct == null ? <span style={{ color: C.down }}> · pay yazılmadı</span> : ` · %${100 - Number(r.pay_pct)} tedarikçi`}
                        </div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
                        <div style={{ fontWeight: 700 }}>{r.tedarikci_pay == null ? "—" : tl(r.tedarikci_pay)}</div>
                        <div style={{ fontSize: 11, color: Number(r.bizim_pay) < 0 ? C.down : C.faint }}>bizim {r.bizim_pay == null ? "—" : tl(r.bizim_pay)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </>)}
    </div>
  );
}
