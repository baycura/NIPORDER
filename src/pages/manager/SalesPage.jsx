import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase.js";
import { useAuth } from "../../contexts/AuthContext.jsx";
import Ikon from "../../components/Ikon.jsx";
import { panoyaKopyala } from "../../lib/hakedis.js";
import { optionsText } from "../../lib/productOptions.js";

// SATIS RAPORU — "hangi urunden kac adet sattik?" Haftalik / aylik / yillik
// ya da elle tarih araligi; isletme gunu (03:00) sunucuda kesilir
// (nip_urun_satis, nip_gunluk_satis). Gun Ozeti bugunu, Urun Karliligi kari
// anlatir; bu ekran ADEDI anlatir — raf siparisi, mutfak planlamasi, "gecen
// ay kac latte" sorusu.
//
// Kurallar sunucuda (urun_karliligi ile ayni): yalniz kapanmis (paid)
// hesaplar, odeme anina gore gun, ciro = indirimli fiyat, ikram adede girer.

const cv = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";
const hv = "'Bebas Neue','Barlow Condensed','Coolvetica Condensed',sans-serif";
const C = { card: "#161616", cardLine: "#262626", ink: "#F0EDE8", muted: "#8A8A86", faint: "#666666", accent: "#FFFFFF", down: "#C87A6A" };
const fmtTL = (n) => "₺" + Number(n || 0).toLocaleString("tr-TR", { maximumFractionDigits: 0 });
const fmtN = (n) => Number(n || 0).toLocaleString("tr-TR", { maximumFractionDigits: 0 });
const AY_KISA = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
const GUN_KISA = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];

// Tarihler isletme gunu olarak, Istanbul'a gore. Telefon saati/dilimi
// guvenilmez; sunucu da ayni kurali kullanir.
const isletmeBugun = () => new Date(Date.now() - 3 * 3600 * 1000).toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" });
const tarihObj = (iso) => { const [y, m, d] = iso.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const isoYaz = (d) => d.toISOString().slice(0, 10);
const gunEkle = (iso, n) => { const d = tarihObj(iso); d.setUTCDate(d.getUTCDate() + n); return isoYaz(d); };
const haftaBasi = (iso) => { const d = tarihObj(iso); const g = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - g); return isoYaz(d); };  // Pazartesi
const ayBasi = (iso) => iso.slice(0, 7) + "-01";
const aySonu = (iso) => { const d = tarihObj(ayBasi(iso)); d.setUTCMonth(d.getUTCMonth() + 1); d.setUTCDate(0); return isoYaz(d); };
const kisaTarih = (iso) => `${Number(iso.slice(8, 10))} ${AY_KISA[Number(iso.slice(5, 7)) - 1]}`;
const uzunTarih = (iso) => `${Number(iso.slice(8, 10))} ${AY_KISA[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
const tarihSaat = (iso) => {
  const d = new Date(iso);
  return { tarih: d.toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul", day: "2-digit", month: "2-digit" }),
           saat: d.toLocaleTimeString("tr-TR", { timeZone: "Europe/Istanbul", hour: "2-digit", minute: "2-digit" }) };
};

const DONEMLER = [
  { key: "bugun",     label: "Bugün",       aralik: (b) => [b, b] },
  { key: "dun",       label: "Dün",         aralik: (b) => [gunEkle(b, -1), gunEkle(b, -1)] },
  { key: "hafta",     label: "Bu hafta",    aralik: (b) => [haftaBasi(b), b] },
  { key: "gecenhafta",label: "Geçen hafta", aralik: (b) => { const p = gunEkle(haftaBasi(b), -7); return [p, gunEkle(p, 6)]; } },
  { key: "ay",        label: "Bu ay",       aralik: (b) => [ayBasi(b), b] },
  { key: "gecenay",   label: "Geçen ay",    aralik: (b) => { const p = gunEkle(ayBasi(b), -1); return [ayBasi(p), p]; } },
  { key: "yil",       label: "Bu yıl",      aralik: (b) => [b.slice(0, 4) + "-01-01", b] },
  { key: "tarih",     label: "Tarih aralığı", aralik: null },
];

export default function SalesPage() {
  const { staffUser } = useAuth();
  const storeIds = staffUser?.store_ids || [];
  const [stores, setStores] = useState([]);
  const [storeId, setStoreId] = useState(null);
  const [donem, setDonem] = useState("hafta");
  const bugun = isletmeBugun();
  const [ozelBas, setOzelBas] = useState(gunEkle(bugun, -6));
  const [ozelBit, setOzelBit] = useState(bugun);
  const [aralik, setAralik] = useState(() => [haftaBasi(bugun), bugun]);   // [bas, bit] — sorguya giden
  const [secilenGun, setSecilenGun] = useState(null);   // gune dokununca urun listesi o gune iner
  const [urunler, setUrunler] = useState(null);
  const [gunler, setGunler] = useState([]);
  const [hata, setHata] = useState(null);
  const [arama, setArama] = useState("");
  const [sira, setSira] = useState("adet");   // adet | ciro | ad
  const [grupla, setGrupla] = useState(false);
  const [kopyaDurum, setKopyaDurum] = useState("");
  // FISLER: kapanmis her hesap tek tek (sahip istegi 17.10) — ne alindi, kim
  // acti, kim tahsil etti, nasil odendi. Urun listesi adedi, bu liste fisi anlatir.
  const [mod, setMod] = useState("urun");        // urun | fis
  const [fisler, setFisler] = useState(null);
  const [fisHata, setFisHata] = useState(null);
  const [acikFis, setAcikFis] = useState(null);

  useEffect(() => {
    if (!storeIds.length) return;
    supabase.from("stores").select("id,name,slug").in("id", storeIds).order("slug").then(r => {
      const list = r.data || [];
      setStores(list);
      setStoreId(prev => prev || list[0]?.id || null);
    });
  }, [staffUser?.id]);

  // Donem cipi -> aralik. "Tarih araligi" cipinde aralik yalniz Getir ile degisir.
  const donemSec = (k) => {
    setDonem(k); setSecilenGun(null);
    const d = DONEMLER.find(x => x.key === k);
    if (d?.aralik) setAralik(d.aralik(bugun));
  };
  const ozelGetir = () => {
    if (!ozelBas || !ozelBit) return;
    const [b, e] = ozelBas <= ozelBit ? [ozelBas, ozelBit] : [ozelBit, ozelBas];
    setSecilenGun(null); setAralik([b, e]);
  };

  // Urun listesi: secili gun varsa o gune, yoksa tum araliga. Gun toplamlari
  // hep tum aralik (cubuklar sabit kalsin).
  useEffect(() => {
    if (!storeId) return;
    let iptal = false;
    setUrunler(null); setHata(null);
    const [bas, bit] = secilenGun ? [secilenGun, secilenGun] : aralik;
    Promise.all([
      supabase.rpc("nip_urun_satis", { p_store_id: storeId, p_bas: bas, p_bit: bit }),
      secilenGun ? Promise.resolve(null) : supabase.rpc("nip_gunluk_satis", { p_store_id: storeId, p_bas: aralik[0], p_bit: aralik[1] }),
    ]).then(([u, g]) => {
      if (iptal) return;
      if (u.error) { setHata(u.error.message); setUrunler([]); return; }
      setUrunler(u.data || []);
      if (g) setGunler(g.error ? [] : (g.data || []));
    });
    return () => { iptal = true; };
  }, [storeId, aralik, secilenGun]);

  // Fis listesi en cok 31 gun (nip_fis_listesi): bir ay ~900 fis kalemleriyle
  // gelir, yil gelmez. Uzun aralikta kullanici guni ya da donemi daraltir.
  const fisAralik = secilenGun ? [secilenGun, secilenGun] : aralik;
  const fisGunSayisi = Math.round((tarihObj(fisAralik[1]) - tarihObj(fisAralik[0])) / 86400000) + 1;
  useEffect(() => {
    if (mod !== "fis" || !storeId || fisGunSayisi > 31) return;
    let iptal = false;
    setFisler(null); setFisHata(null); setAcikFis(null);
    supabase.rpc("nip_fis_listesi", { p_store_id: storeId, p_bas: fisAralik[0], p_bit: fisAralik[1] }).then(({ data, error }) => {
      if (iptal) return;
      if (error) { setFisHata(error.message); setFisler([]); return; }
      setFisler(data || []);
    });
    return () => { iptal = true; };
  }, [mod, storeId, fisAralik[0], fisAralik[1]]);

  const ozet = useMemo(() => {
    const s = urunler || [];
    return {
      adet: s.reduce((t, r) => t + Number(r.adet || 0), 0),
      ikram: s.reduce((t, r) => t + Number(r.ikram_adet || 0), 0),
      ciro: s.reduce((t, r) => t + Number(r.ciro || 0), 0),
      cesit: s.length,
    };
  }, [urunler]);
  // Siparis sayisi urun satirlarindan toplanamaz (ayni fis bircok urunde);
  // gun toplamlarindan gelir.
  const siparisSayisi = useMemo(() => {
    if (secilenGun) return Number(gunler.find(g => g.gun === secilenGun)?.siparis || 0);
    return gunler.reduce((t, g) => t + Number(g.siparis || 0), 0);
  }, [gunler, secilenGun]);

  // Aralik icindeki her gun (satissiz gun bos cubuk); 60 gunden uzun aralikta
  // cubuk yerine haftalik toplama iner ki 365 cubuk ekrana sigsin.
  const gunSerisi = useMemo(() => {
    const [bas, bit] = aralik;
    const harita = Object.fromEntries(gunler.map(g => [g.gun, g]));
    const liste = [];
    for (let g = bas; g <= bit && liste.length < 400; g = gunEkle(g, 1)) {
      liste.push({ gun: g, adet: Number(harita[g]?.adet || 0), ciro: Number(harita[g]?.ciro || 0) });
    }
    if (liste.length <= 62) return { tur: "gun", liste };
    const haftalar = [];
    liste.forEach(g => {
      const hb = haftaBasi(g.gun);
      const son = haftalar[haftalar.length - 1];
      if (son && son.gun === hb) { son.adet += g.adet; son.ciro += g.ciro; son.bit = g.gun; }
      else haftalar.push({ gun: hb, bit: g.gun, adet: g.adet, ciro: g.ciro });
    });
    return { tur: "hafta", liste: haftalar };
  }, [aralik, gunler]);
  const maxAdet = Math.max(...gunSerisi.liste.map(g => g.adet), 1);

  const trLow = (s) => String(s || "").toLocaleLowerCase("tr");
  const q = trLow(arama.trim());
  const liste = useMemo(() => {
    let s = (urunler || []).filter(r => !q || trLow(r.urun).includes(q) || trLow(r.kategori).includes(q));
    if (sira === "ciro") s = [...s].sort((a, b) => Number(b.ciro) - Number(a.ciro));
    else if (sira === "ad") s = [...s].sort((a, b) => a.urun.localeCompare(b.urun, "tr"));
    else s = [...s].sort((a, b) => Number(b.adet) - Number(a.adet) || Number(b.ciro) - Number(a.ciro));
    return s;
  }, [urunler, q, sira]);
  const gruplar = useMemo(() => {
    if (!grupla) return null;
    const m = new Map();
    liste.forEach(r => { const k = r.kategori || "—"; if (!m.has(k)) m.set(k, { ad: k, adet: 0, ciro: 0, satir: [] }); const g = m.get(k); g.adet += Number(r.adet); g.ciro += Number(r.ciro); g.satir.push(r); });
    return [...m.values()].sort((a, b) => b.adet - a.adet);
  }, [liste, grupla]);
  const maxUrunAdet = Math.max(...liste.map(r => Number(r.adet)), 1);

  // Fis aramasi: hesap adi, personel, uye, odeme, tutar ya da icindeki urun.
  const fisListesi = useMemo(() => (fisler || []).filter(f => !q
    || trLow(f.ad).includes(q) || trLow(f.personel).includes(q) || trLow(f.kasiyer).includes(q) || trLow(f.uye).includes(q)
    || trLow(f.odeme).includes(q) || String(Math.round(Number(f.toplam || 0))).includes(q)
    || (f.kalemler || []).some(k => trLow(k.ad).includes(q))), [fisler, q]);
  const fisOzet = useMemo(() => ({
    adet: fisListesi.length,
    ciro: fisListesi.reduce((t, f) => t + Number(f.toplam || 0), 0),
  }), [fisListesi]);

  const araligiYaz = () => {
    const [b, e] = secilenGun ? [secilenGun, secilenGun] : aralik;
    if (b === e) return uzunTarih(b);
    const gunSay = Math.round((tarihObj(e) - tarihObj(b)) / 86400000) + 1;
    return `${kisaTarih(b)} – ${uzunTarih(e)} · ${gunSay} gün`;
  };

  // Excel'e yapistirilabilir: sekmeyle ayrilmis, baslik satirli. WhatsApp'a
  // da okunur gider.
  const metniKopyala = async () => {
    const magaza = stores.find(s => s.id === storeId)?.name || "";
    const satirlar = [];
    if (mod === "fis") {
      satirlar.push(`${magaza} fiş listesi · ${araligiYaz()}`, "Tarih\tSaat\tHesap\tPersonel\tÖdeme\tÜrünler\tToplam");
      fisListesi.forEach(f => {
        const ts = tarihSaat(f.zaman);
        satirlar.push(`${ts.tarih}\t${ts.saat}\t${f.ad}\t${f.personel || ""}\t${f.odeme || ""}\t${(f.kalemler || []).map(k => `${fmtN(k.adet)}× ${k.ad}`).join(", ")}\t${Math.round(Number(f.toplam))}`);
      });
      satirlar.push(`TOPLAM\t\t${fmtN(fisOzet.adet)} fiş\t\t\t\t${Math.round(fisOzet.ciro)}`);
    } else {
      satirlar.push(`${magaza} satış raporu · ${araligiYaz()}`, "Ürün\tKategori\tAdet\tİkram\tCiro");
      liste.forEach(r => satirlar.push(`${r.urun}\t${r.kategori}\t${fmtN(r.adet)}\t${fmtN(r.ikram_adet)}\t${Math.round(Number(r.ciro))}`));
      satirlar.push(`TOPLAM\t\t${fmtN(ozet.adet)}\t${fmtN(ozet.ikram)}\t${Math.round(ozet.ciro)}`);
    }
    const ok = await panoyaKopyala(satirlar.join("\n"));
    setKopyaDurum(ok ? "ok" : "yok");
    setTimeout(() => setKopyaDurum(""), 2000);
  };

  const kart = { background: C.card, border: `1px solid ${C.cardLine}`, borderRadius: 12, padding: 16 };
  const etiket = { fontSize: 12, color: C.muted, letterSpacing: "0.2px", fontWeight: 600 };
  const cip = (aktif) => ({
    padding: "9px 13px", borderRadius: 9, cursor: "pointer", fontFamily: cv, fontSize: 12, fontWeight: 700, minHeight: 40, whiteSpace: "nowrap",
    background: aktif ? C.accent : "transparent", color: aktif ? "#000" : C.muted, border: `1px solid ${aktif ? C.accent : C.cardLine}`,
  });
  const alan = { padding: "9px 10px", minHeight: 40, background: "#0C0C0C", border: `1px solid ${C.cardLine}`, borderRadius: 9, color: C.ink, fontFamily: cv, fontSize: 14, outline: "none", colorScheme: "dark" };

  const satirCiz = (r) => (
    <div key={(r.product_id || "x") + "|" + r.urun} style={{ position: "relative", padding: "11px 14px", borderTop: `1px solid ${C.cardLine}`, overflow: "hidden" }}>
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${(Number(r.adet) / maxUrunAdet) * 100}%`, background: "rgba(255,255,255,0.05)" }} />
      <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.urun}</div>
          <div style={{ fontSize: 12, color: C.faint, marginTop: 2 }}>
            {!grupla && <>{r.kategori} · </>}{fmtN(r.siparis)} fiş{Number(r.ikram_adet) > 0 && <> · {fmtN(r.ikram_adet)} ikram</>}
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 20, fontWeight: 900, fontFamily: hv, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{fmtN(r.adet)}<span style={{ fontSize: 11, fontFamily: cv, fontWeight: 600, color: C.muted, marginLeft: 3 }}>adet</span></div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 3, fontVariantNumeric: "tabular-nums" }}>{fmtTL(r.ciro)}</div>
        </div>
      </div>
    </div>
  );

  // Bir fis: saat, hesap, odeme, tutar; dokununca kalemler (secenek, paket,
  // ikram, indirim, not, QR) ve acilis saati, tahsil eden.
  const fisCiz = (f) => {
    const acik = acikFis === f.id;
    const ts = tarihSaat(f.zaman);
    return (
      <div key={f.id} style={{ borderTop: `1px solid ${C.cardLine}` }}>
        <button onClick={() => setAcikFis(acik ? null : f.id)}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", background: acik ? "rgba(255,255,255,0.04)" : "none", border: "none", color: C.ink, textAlign: "left", cursor: "pointer", fontFamily: cv }}>
          <div style={{ flexShrink: 0, width: 44, fontSize: 13, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
            {ts.saat}
            {fisGunSayisi > 1 && <div style={{ fontSize: 10, color: C.faint, fontWeight: 600 }}>{ts.tarih}</div>}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {f.ad}{f.uye && f.uye !== f.ad ? ` · ${f.uye}` : ""}
            </div>
            <div style={{ fontSize: 12, color: C.faint, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {fmtN(f.kalem_adedi)} ürün · {f.odeme || (Number(f.puan) > 0 ? "puan" : "—")}{f.personel ? ` · ${f.personel}` : ""}{f.qr ? " · QR" : ""}
            </div>
          </div>
          <div style={{ fontSize: 18, fontWeight: 900, fontFamily: hv, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{fmtTL(f.toplam)}</div>
          <Ikon ad={acik ? "asagi" : "sag"} boy={13} style={{ color: C.faint, flexShrink: 0 }} />
        </button>
        {acik && (
          <div style={{ padding: "0 14px 12px", fontSize: 13 }}>
            {(f.kalemler || []).map((k, i) => {
              const sec = optionsText(k.secenek);
              return (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 10, lineHeight: 1.5, padding: "3px 0" }}>
                  <span style={{ minWidth: 0 }}>
                    <b>{fmtN(k.adet)} ×</b> {k.ad}
                    {sec && <span style={{ color: C.muted }}> · {sec}</span>}
                    {k.paket && <span style={{ color: C.muted }}> · paket</span>}
                    {k.ikram && <span style={{ color: C.muted }}> · ikram</span>}
                    {Number(k.indirim) > 0 && <span style={{ color: C.muted }}> · indirim {fmtTL(Number(k.indirim) * Number(k.adet))}</span>}
                    {k.qr && <span style={{ color: C.muted }}> · QR</span>}
                    {k.not && <div style={{ color: C.muted, fontSize: 12 }}>“{k.not}”</div>}
                  </span>
                  <span style={{ fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{fmtTL(Number(k.fiyat) * Number(k.adet))}</span>
                </div>
              );
            })}
            {Number(f.puan) > 0 && <div style={{ color: C.muted, marginTop: 4 }}>Puanla ödenen: {fmtTL(f.puan)}</div>}
            <div style={{ color: C.faint, fontSize: 12, marginTop: 6 }}>
              Açılış {tarihSaat(f.acilis).saat}{f.kasiyer && f.kasiyer !== f.personel ? ` · tahsilat: ${f.kasiyer}` : ""}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ padding: 16, fontFamily: cv, maxWidth: 900, margin: "0 auto", paddingBottom: 80, color: C.ink }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontSize: 24, fontWeight: 800 }}>Satış Raporu</div>
        <div style={{ fontSize: 12, color: C.faint }}>kapanmış hesaplar · gün 03:00'te biter</div>
      </div>

      {stores.length > 1 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 14 }}>
          {stores.map(s => <button key={s.id} onClick={() => setStoreId(s.id)} style={cip(storeId === s.id)}>{s.name}</button>)}
        </div>
      )}

      <div style={{ display: "flex", gap: 6, overflowX: "auto", margin: "14px 0 0", paddingBottom: 4 }}>
        {DONEMLER.map(d => <button key={d.key} onClick={() => donemSec(d.key)} style={{ ...cip(donem === d.key), flexShrink: 0 }}>{d.label}</button>)}
      </div>
      {donem === "tarih" && (
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginTop: 10 }}>
          <input type="date" value={ozelBas} max={bugun} onChange={e => setOzelBas(e.target.value)} style={alan} />
          <span style={{ color: C.faint }}>–</span>
          <input type="date" value={ozelBit} max={bugun} onChange={e => setOzelBit(e.target.value)} style={alan} />
          <button onClick={ozelGetir} style={{ ...cip(true), minHeight: 40 }}>Getir</button>
        </div>
      )}

      {hata && (
        <div style={{ ...kart, marginTop: 14, borderColor: C.down, color: C.down, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
          <Ikon ad="uyari" boy={15} />{hata}
        </div>
      )}

      {/* Ozet: aralik, adet, ciro, fis */}
      <div style={{ ...kart, marginTop: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          <div style={etiket}>{araligiYaz()}</div>
          {secilenGun && (
            <button onClick={() => setSecilenGun(null)} style={{ background: "none", border: `1px solid ${C.cardLine}`, color: C.muted, borderRadius: 6, padding: "3px 8px", cursor: "pointer", fontSize: 11, fontFamily: cv }}>tüm aralık</button>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap", marginTop: 6 }}>
          <div style={{ fontSize: 52, fontWeight: 900, fontFamily: hv, lineHeight: 1 }}>
            {urunler === null ? "…" : fmtN(ozet.adet)}<span style={{ fontSize: 16, fontFamily: cv, fontWeight: 700, color: C.muted, marginLeft: 6 }}>adet</span>
          </div>
          <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.6 }}>
            <b style={{ color: C.ink }}>{fmtTL(ozet.ciro)}</b> ciro · {fmtN(siparisSayisi)} fiş · {fmtN(ozet.cesit)} çeşit
            {ozet.ikram > 0 && <> · {fmtN(ozet.ikram)} ikram</>}
          </div>
        </div>

        {gunSerisi.liste.length > 1 && (
          <div style={{ marginTop: 14 }}>
            <div style={{ display: "flex", alignItems: "flex-end", gap: gunSerisi.liste.length > 31 ? 1 : 3, height: 90 }}>
              {gunSerisi.liste.map(g => {
                const secili = secilenGun === g.gun;
                const gunNo = Number(g.gun.slice(8, 10));
                const dow = tarihObj(g.gun).getUTCDay();
                const etiketGoster = gunSerisi.tur === "hafta" ? true : gunSerisi.liste.length <= 14 || gunNo === 1 || gunNo % 5 === 0;
                return (
                  <div key={g.gun} onClick={() => { if (gunSerisi.tur === "gun" && g.adet > 0) setSecilenGun(secili ? null : g.gun); }}
                    title={`${gunSerisi.tur === "hafta" ? kisaTarih(g.gun) + " – " + kisaTarih(g.bit) : GUN_KISA[dow] + " " + kisaTarih(g.gun)} — ${fmtN(g.adet)} adet · ${fmtTL(g.ciro)}`}
                    style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "flex-end", height: "100%", cursor: gunSerisi.tur === "gun" && g.adet > 0 ? "pointer" : "default" }}>
                    <div style={{ background: secili ? C.accent : g.adet > 0 ? (dow === 0 || dow === 6 ? "#5a5650" : "#3a3a36") : "#222", height: `${g.adet > 0 ? Math.max((g.adet / maxAdet) * 100, 4) : 3}%`, borderRadius: "2px 2px 0 0" }} />
                    <div style={{ fontSize: 9, marginTop: 4, textAlign: "center", color: secili ? C.accent : etiketGoster ? C.muted : "transparent", whiteSpace: "nowrap", overflow: "hidden" }}>
                      {gunSerisi.tur === "hafta" ? kisaTarih(g.gun) : gunSerisi.liste.length <= 14 ? GUN_KISA[dow] : gunNo}
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ fontSize: 11, color: C.faint, marginTop: 4 }}>
              {gunSerisi.tur === "gun" ? "güne dokun → o günün ürünleri · koyu çubuk hafta sonu" : "haftalık toplam (uzun aralık)"}
            </div>
          </div>
        )}
      </div>

      {/* Gorunum: Urunler (adet) | Fisler (hesap hesap) */}
      <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
        {[["urun", "Ürünler"], ["fis", "Fişler"]].map(([k, l]) => (
          <button key={k} onClick={() => setMod(k)} style={cip(mod === k)}>{l}</button>
        ))}
      </div>

      {/* Arac cubugu: ara, sirala, grupla, kopyala */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", margin: "10px 0" }}>
        <input value={arama} onChange={e => setArama(e.target.value)}
               placeholder={mod === "fis" ? "Hesap, personel, ürün ya da tutar ara" : "Ürün ya da kategori ara"} style={{ ...alan, flex: "1 1 160px" }} />
        {mod === "urun" && [["adet", "Adet"], ["ciro", "Ciro"], ["ad", "A–Z"]].map(([k, l]) => (
          <button key={k} onClick={() => setSira(k)} style={cip(sira === k)}>{l}</button>
        ))}
        {mod === "urun" && <button onClick={() => setGrupla(v => !v)} style={cip(grupla)}>Kategori</button>}
        <button onClick={metniKopyala} disabled={mod === "fis" ? !fisListesi.length : !liste.length}
                style={{ ...cip(false), display: "inline-flex", alignItems: "center", gap: 6, opacity: (mod === "fis" ? fisListesi.length : liste.length) ? 1 : 0.5 }}>
          <Ikon ad="kopyala" boy={14} />{kopyaDurum === "ok" ? "Kopyalandı" : kopyaDurum === "yok" ? "Olmadı" : "Kopyala"}
        </button>
      </div>

      {mod === "fis" && (
        fisGunSayisi > 31 ? (
          <div style={{ ...kart, color: C.muted, fontSize: 13, lineHeight: 1.6 }}>
            Fiş listesi en çok 31 günlük aralık için gelir. Daha kısa bir dönem seç ya da grafikte bir güne dokun.
          </div>
        ) : fisHata ? (
          <div style={{ ...kart, borderColor: C.down, color: C.down, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
            <Ikon ad="uyari" boy={15} />{fisHata}
          </div>
        ) : fisler === null ? (
          <div style={{ padding: 40, textAlign: "center", color: C.muted }}>Yükleniyor…</div>
        ) : fisListesi.length === 0 ? (
          <div style={{ ...kart, textAlign: "center", color: C.muted, padding: 40, fontSize: 13 }}>
            {fisler.length === 0 ? "Bu aralıkta kapanmış hesap yok." : `"${arama}" ile eşleşen fiş yok.`}
          </div>
        ) : (
          <div style={{ ...kart, padding: 0, overflow: "hidden" }}>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", fontSize: 11, color: C.muted, letterSpacing: 1, textTransform: "uppercase", fontWeight: 600 }}>
              <span>{fmtN(fisOzet.adet)} fiş · {fmtTL(fisOzet.ciro)}</span><span>dokun → ürünler</span>
            </div>
            {fisListesi.map(fisCiz)}
          </div>
        )
      )}

      {mod === "urun" && urunler === null && !hata && <div style={{ padding: 40, textAlign: "center", color: C.muted }}>Yükleniyor…</div>}
      {mod === "urun" && urunler && urunler.length === 0 && !hata && (
        <div style={{ ...kart, textAlign: "center", color: C.muted, padding: 40, fontSize: 13 }}>Bu aralıkta kapanmış satış yok.</div>
      )}
      {mod === "urun" && urunler && urunler.length > 0 && liste.length === 0 && (
        <div style={{ ...kart, textAlign: "center", color: C.muted, padding: 30, fontSize: 13 }}>"{arama}" ile eşleşen ürün yok.</div>
      )}

      {mod === "urun" && liste.length > 0 && !grupla && (
        <div style={{ ...kart, padding: 0, overflow: "hidden" }}>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", fontSize: 11, color: C.muted, letterSpacing: 1, textTransform: "uppercase", fontWeight: 600 }}>
            <span>Ürün</span><span>Adet · ciro</span>
          </div>
          {liste.map(satirCiz)}
        </div>
      )}

      {mod === "urun" && liste.length > 0 && grupla && gruplar.map(g => (
        <div key={g.ad} style={{ ...kart, padding: 0, overflow: "hidden", marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "12px 14px", gap: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 0.5, textTransform: "uppercase" }}>{g.ad}</div>
            <div style={{ fontSize: 12, color: C.muted, fontVariantNumeric: "tabular-nums" }}><b style={{ color: C.ink }}>{fmtN(g.adet)}</b> adet · {fmtTL(g.ciro)}</div>
          </div>
          {g.satir.map(satirCiz)}
        </div>
      ))}

      <div style={{ fontSize: 12, color: C.faint, marginTop: 12, lineHeight: 1.7 }}>
        Yalnız kapanmış hesaplar; gün ödeme anına göre 03:00'te biter. Ciro indirimli fiyattan, ikram adede girer cirosu sıfırdır.
        Bedenli ürünler ayrı satırdır (raf sayımı için). "Kopyala" tabloyu Excel'e yapıştırılacak biçimde alır.
        "Fişler" her kapanmış hesabı tek tek gösterir; dokununca içindeki ürünler açılır. İptal edilen hesaplar "İptal &amp; Düzeltme"de.
      </div>
    </div>
  );
}
