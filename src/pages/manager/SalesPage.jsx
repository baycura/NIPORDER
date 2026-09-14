import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase.js";
import { useAuth } from "../../contexts/AuthContext.jsx";
import Ikon from "../../components/Ikon.jsx";
import { panoyaKopyala } from "../../lib/hakedis.js";

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
    const satirlar = [`${magaza} satış raporu · ${araligiYaz()}`, "Ürün\tKategori\tAdet\tİkram\tCiro"];
    liste.forEach(r => satirlar.push(`${r.urun}\t${r.kategori}\t${fmtN(r.adet)}\t${fmtN(r.ikram_adet)}\t${Math.round(Number(r.ciro))}`));
    satirlar.push(`TOPLAM\t\t${fmtN(ozet.adet)}\t${fmtN(ozet.ikram)}\t${Math.round(ozet.ciro)}`);
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

      {/* Arac cubugu: ara, sirala, grupla, kopyala */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", margin: "10px 0" }}>
        <input value={arama} onChange={e => setArama(e.target.value)} placeholder="Ürün ya da kategori ara" style={{ ...alan, flex: "1 1 160px" }} />
        {[["adet", "Adet"], ["ciro", "Ciro"], ["ad", "A–Z"]].map(([k, l]) => (
          <button key={k} onClick={() => setSira(k)} style={cip(sira === k)}>{l}</button>
        ))}
        <button onClick={() => setGrupla(v => !v)} style={cip(grupla)}>Kategori</button>
        <button onClick={metniKopyala} disabled={!liste.length} style={{ ...cip(false), display: "inline-flex", alignItems: "center", gap: 6, opacity: liste.length ? 1 : 0.5 }}>
          <Ikon ad="kopyala" boy={14} />{kopyaDurum === "ok" ? "Kopyalandı" : kopyaDurum === "yok" ? "Olmadı" : "Kopyala"}
        </button>
      </div>

      {urunler === null && !hata && <div style={{ padding: 40, textAlign: "center", color: C.muted }}>Yükleniyor…</div>}
      {urunler && urunler.length === 0 && !hata && (
        <div style={{ ...kart, textAlign: "center", color: C.muted, padding: 40, fontSize: 13 }}>Bu aralıkta kapanmış satış yok.</div>
      )}
      {urunler && urunler.length > 0 && liste.length === 0 && (
        <div style={{ ...kart, textAlign: "center", color: C.muted, padding: 30, fontSize: 13 }}>"{arama}" ile eşleşen ürün yok.</div>
      )}

      {liste.length > 0 && !grupla && (
        <div style={{ ...kart, padding: 0, overflow: "hidden" }}>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", fontSize: 11, color: C.muted, letterSpacing: 1, textTransform: "uppercase", fontWeight: 600 }}>
            <span>Ürün</span><span>Adet · ciro</span>
          </div>
          {liste.map(satirCiz)}
        </div>
      )}

      {liste.length > 0 && grupla && gruplar.map(g => (
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
      </div>
    </div>
  );
}
