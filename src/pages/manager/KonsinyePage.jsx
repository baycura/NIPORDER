import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "../../lib/supabase.js";
import { useAuth } from "../../contexts/AuthContext.jsx";
import Ikon from "../../components/Ikon.jsx";
import { guncelAy, ayGecerli, ayKaydir, ayEtiketi, ayGunSayisi, fmtTL, fmtSayi } from "../../lib/hakedis.js";

const cv = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";
const hv = "'Bebas Neue','Barlow Condensed','Coolvetica Condensed',sans-serif";
const C = { card: "#161616", line: "#262626", ink: "#F0EDE8", muted: "#8A8A86", faint: "#666666", accent: "#FFFFFF", down: "#C87A6A" };
// Ikramda bizim pay eksiye duser (mal gitti, para gelmedi): "−₺1.000"
const tl = (n) => (Number(n) < 0 ? "−" : "") + fmtTL(Math.abs(Number(n) || 0));

// Konsinye Hesabı — tedarikçiye ne ödenecek.
//
// Konsinye urun (IZIPIZI gozluk gibi) tedarikcinin mali; satisin bir yuzdesi
// bize kalir, kalani tedarikciye odenir. Bu ekran ay ay, tedarikci tedarikci
// toplar: adet, satis, bizim pay, odenecek. Rakamlar nip_konsinye_raporu
// RPC'sinden gelir; istemcide yalniz gruplama ve bicimleme yapilir.
//
// Donem: isletme gunu (03:00) ile, odenmis fisler, odeme tarihine gore —
// Urun Karliligi ile ayni kesim, iki rapor birbirini tutsun.
// Ikram: tedarikciye liste fiyatindan borc yazar (mal gitti, para gelmedi).
export default function KonsinyePage() {
  const { staffUser } = useAuth();
  const storeIds = staffUser?.store_ids || [];
  const [params, setParams] = useSearchParams();
  const buAy = guncelAy();
  const ayParam = params.get("ay");
  const ay = ayGecerli(ayParam) && ayParam <= buAy ? ayParam : buAy;
  const setAy = (a) => setParams(a === buAy ? {} : { ay: a }, { replace: true });

  const [stores, setStores] = useState([]);
  const [storeId, setStoreId] = useState(null);
  const [satirlar, setSatirlar] = useState(null);
  const [hata, setHata] = useState(null);
  const [acik, setAcik] = useState(null);
  const [kopya, setKopya] = useState("");
  const istekNo = useRef(0);

  useEffect(() => {
    if (!storeIds.length) return;
    supabase.from("stores").select("id,name,slug").in("id", storeIds).order("slug").then(r => {
      const list = r.data || [];
      setStores(list);
      setStoreId(prev => prev || list[0]?.id || null);
    });
  }, [staffUser?.id]);

  const yukle = () => {
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
  useEffect(yukle, [storeId, ay]);

  useEffect(() => {
    if (!kopya) return undefined;
    const t = setTimeout(() => setKopya(""), 2000);
    return () => clearTimeout(t);
  }, [kopya]);

  // Tedarikci bazinda toplam. Pay yazilmamis urun varsa grup "eksik" isaretlenir.
  const gruplar = useMemo(() => {
    const m = new Map();
    for (const r of satirlar || []) {
      const k = r.tedarikci || "—";
      if (!m.has(k)) m.set(k, { ad: k, urunler: [], adet: 0, ikram: 0, satis: 0, bizim: 0, odenecek: 0, eksik: 0, paylar: new Set() });
      const g = m.get(k);
      g.urunler.push(r);
      g.adet += Number(r.adet || 0);
      g.ikram += Number(r.ikram_adet || 0);
      g.satis += Number(r.satis || 0);
      if (r.pay_pct == null) g.eksik += 1;
      else { g.bizim += Number(r.bizim_pay || 0); g.odenecek += Number(r.tedarikci_pay || 0); g.paylar.add(Number(r.pay_pct)); }
    }
    return [...m.values()].sort((a, b) => b.odenecek - a.odenecek || b.satis - a.satis);
  }, [satirlar]);

  const toplam = useMemo(() => gruplar.reduce((t, g) => ({ satis: t.satis + g.satis, bizim: t.bizim + g.bizim, odenecek: t.odenecek + g.odenecek, eksik: t.eksik + g.eksik }), { satis: 0, bizim: 0, odenecek: 0, eksik: 0 }), [gruplar]);

  const payYaz = (g) => {
    const p = [...g.paylar];
    if (!p.length) return "pay yazılmadı";
    return p.length === 1 ? `%${p[0]} bizim · %${100 - p[0]} tedarikçinin` : "karışık pay";
  };

  // WhatsApp'a yapistirilacak kisa metin: tedarikci ile mutabakat.
  const metin = (g) => {
    const satirlarM = g.urunler.map(r => `• ${r.urun}: ${fmtSayi(r.adet)} adet${Number(r.ikram_adet) > 0 ? ` (${fmtSayi(r.ikram_adet)} ikram)` : ""} · ${fmtTL(r.satis)}`);
    return [
      `${g.ad} — ${ayEtiketi(ay)} konsinye hesabı`,
      `Satış: ${fmtSayi(g.adet)} adet · ${fmtTL(g.satis)}`,
      g.eksik ? `Pay yazılmamış ürün: ${g.eksik}` : `Size ödenecek: ${fmtTL(g.odenecek)} (${payYaz(g)})`,
      "", ...satirlarM,
      "", "Not in Paris · order.notinparis.me",
    ].join("\n");
  };
  const kopyala = async (g) => {
    try { await navigator.clipboard.writeText(metin(g)); setKopya(g.ad); }
    catch { setKopya("yok"); }
  };

  const kart = { background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: 16 };
  const etiket = { fontSize: 12, color: C.muted, letterSpacing: "0.2px", fontWeight: 600 };
  const cip = (a, l) => (
    <button key={a} type="button" onClick={() => setAy(a)} style={{
      padding: "7px 14px", borderRadius: 999, cursor: "pointer", fontWeight: 700, fontSize: 12, fontFamily: cv, minHeight: 36,
      background: ay === a ? C.accent : "transparent", color: ay === a ? "#000" : C.muted, border: `1px solid ${ay === a ? C.accent : C.line}`,
    }}>{l}</button>
  );

  return (
    <div style={{ padding: 16, fontFamily: cv, color: C.ink, maxWidth: 900, margin: "0 auto", paddingBottom: 80 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
        <h1 style={{ fontFamily: hv, fontWeight: 900, fontSize: 34, margin: 0, letterSpacing: 1 }}>
          <Ikon ad="raf" boy={22} style={{ marginRight: 10 }} />KONSİNYE HESABI
        </h1>
        <button type="button" onClick={yukle} title="Yenile" style={{ background: "none", border: `1px solid ${C.line}`, color: C.muted, borderRadius: 6, padding: "4px 8px", cursor: "pointer", display: "inline-flex" }}><Ikon ad="yenile" boy={13} /></button>
      </div>
      <p style={{ fontSize: 13, color: C.muted, margin: "6px 0 14px", lineHeight: 1.5, maxWidth: "60ch" }}>
        Tedarikçinin malı olan ürünlerin (konsinye) ay içi satışı ve tedarikçiye ödenecek tutar.
        Pay, Menü Yönetimi'nde kategori, marka ya da ürün üzerinde tanımlanır. Gün 03:00'te biter; ikram tedarikçiye liste fiyatından yazılır.
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        {stores.length > 1 && stores.map(s => (
          <button key={s.id} onClick={() => setStoreId(s.id)} style={{
            padding: "7px 14px", borderRadius: 9, cursor: "pointer", fontFamily: cv, fontSize: 12, fontWeight: 700, minHeight: 36,
            background: storeId === s.id ? C.accent : "transparent", color: storeId === s.id ? "#000" : C.muted, border: `1px solid ${storeId === s.id ? C.accent : C.line}`,
          }}>{s.name}</button>
        ))}
        <div style={{ flex: 1 }} />
        <button type="button" onClick={() => setAy(ayKaydir(ay, -1))} aria-label="Önceki ay" style={{ background: "none", border: `1px solid ${C.line}`, color: C.muted, borderRadius: 999, width: 36, height: 36, cursor: "pointer" }}><Ikon ad="oksol" boy={13} /></button>
        {cip(buAy, "Bu ay")}
        {cip(ayKaydir(buAy, -1), "Geçen ay")}
        <button type="button" onClick={() => setAy(ayKaydir(ay, 1))} disabled={ay >= buAy} aria-label="Sonraki ay" style={{ background: "none", border: `1px solid ${C.line}`, color: ay >= buAy ? "#444" : C.muted, borderRadius: 999, width: 36, height: 36, cursor: ay >= buAy ? "not-allowed" : "pointer" }}><Ikon ad="oksag" boy={13} /></button>
      </div>

      <div style={{ ...kart, marginBottom: 10 }}>
        <div style={etiket}>{ayEtiketi(ay)} · tedarikçilere ödenecek</div>
        <div style={{ fontSize: 48, fontWeight: 900, fontFamily: hv, lineHeight: 1, marginTop: 6, fontVariantNumeric: "tabular-nums" }}>
          {satirlar === null && !hata ? "…" : fmtTL(toplam.odenecek)}
        </div>
        <div style={{ fontSize: 13, color: C.muted, marginTop: 6 }}>
          {fmtTL(toplam.satis)} satış · bizim pay <span style={{ color: C.ink, fontWeight: 700 }}>{tl(toplam.bizim)}</span>
          {toplam.eksik > 0 && <span style={{ color: C.down }}> · {toplam.eksik} üründe pay yazılmadı</span>}
        </div>
      </div>

      {hata && (
        <div style={{ ...kart, borderColor: C.down, color: C.down, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
          <Ikon ad="uyari" boy={15} />{hata}
        </div>
      )}
      {satirlar === null && !hata && <div style={{ padding: 40, textAlign: "center", color: C.muted }}>Yükleniyor…</div>}
      {satirlar && satirlar.length === 0 && !hata && (
        <div style={{ ...kart, textAlign: "center", color: C.muted, padding: 40, fontSize: 13, lineHeight: 1.6 }}>
          Bu ay konsinye ürün satışı yok.<br />
          <span style={{ fontSize: 12, color: C.faint }}>Konsinye tanımı: Menü Yönetimi → kategori ya da ürün → "Konsinye" kutusu ve bizim pay %.</span>
        </div>
      )}

      {gruplar.map(g => {
        const acikBu = acik === g.ad;
        return (
          <div key={g.ad} style={{ ...kart, padding: 0, overflow: "hidden", marginBottom: 10 }}>
            <div onClick={() => setAcik(acikBu ? null : g.ad)} role="button" tabIndex={0}
                 onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setAcik(acikBu ? null : g.ad); } }}
                 style={{ padding: "14px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 800 }}><Ikon ad={acikBu ? "asagi" : "sag"} boy={13} style={{ marginRight: 7, color: C.muted }} />{g.ad}</div>
                <div style={{ fontSize: 12, color: C.faint, marginTop: 3 }}>
                  {fmtSayi(g.adet)} adet{g.ikram > 0 ? ` (${fmtSayi(g.ikram)} ikram)` : ""} · {fmtTL(g.satis)} satış · {payYaz(g)}
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
                        {fmtSayi(r.adet)} adet{Number(r.ikram_adet) > 0 ? ` · ${fmtSayi(r.ikram_adet)} ikram` : ""} · {fmtTL(r.satis)}
                        {r.pay_pct == null ? <span style={{ color: C.down }}> · pay yazılmadı</span> : ` · %${Number(r.pay_pct)} bizim`}
                      </div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
                      <div style={{ fontWeight: 700 }}>{r.tedarikci_pay == null ? "—" : tl(r.tedarikci_pay)}</div>
                      <div style={{ fontSize: 11, color: Number(r.bizim_pay) < 0 ? C.down : C.faint }}>bizim {r.bizim_pay == null ? "—" : tl(r.bizim_pay)}</div>
                    </div>
                  </div>
                ))}
                <button type="button" onClick={() => kopyala(g)} style={{
                  marginTop: 12, minHeight: 40, padding: "0 14px", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 13, fontFamily: cv,
                  background: "transparent", color: C.ink, border: `1px solid ${C.line}`, display: "inline-flex", alignItems: "center", gap: 6,
                }}>
                  <Ikon ad="kopyala" boy={14} />{kopya === g.ad ? "Kopyalandı" : kopya === "yok" ? "Kopyalanamadı" : "Mutabakat metnini kopyala"}
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
