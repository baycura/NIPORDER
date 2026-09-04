import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../lib/supabase.js";
import { useAuth } from "../../contexts/AuthContext.jsx";
import Ikon from "../../components/Ikon.jsx";
import {
  fmtTL, fmtMiktar, kapVar, kapAdi, kabaCevir, kabaGeri, farkTutari,
  farkRengi, ONEMSIZ, TASLAK_KEY, aramaUyar,
} from "../../lib/stockCount.js";

const cv = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";
const hv = "'Bebas Neue','Barlow Condensed','Coolvetica Condensed',sans-serif";

const C = {
  bg: "#0C0C0C", card: "#161616", line: "#2A2A2A", ink: "#F0EDE8",
  muted: "#8A8A86", faint: "#666666", accent: "#FFFFFF", down: "#C87A6A", up: "#7FA88A",
};

// Sayilan degeri okunur bicimde yaz. Kap moduna gecerken 712500/50000 gibi
// bolmeler float artigi birakabiliyor; 4 hane yeter, fazlasi gurultu.
const sayiYaz = (n) => {
  const x = Number(n);
  if (!isFinite(x)) return "";
  return String(Math.round(x * 10000) / 10000);
};

// Raf urunlerini (tisort, sapka — products.track_stock) sayim satirina cevir.
// Beden varyanti olan urun beden basina ayri satir olur ("Fethiye Lovers
// Tisort · Small"), stogu o bedenin stogudur; varyantsiz urunun stogu
// retail_stock. Satir id'si "p:" ile baslar ki malzeme uuid'leriyle
// karismasin — taslak da bu id ile saklanir. cost_price, malzemedeki
// cost_per_unit'in yerine gecer; bos ise ekran "maliyeti girilmemis" der.
const urunSatirlari = (urunler) => {
  const out = [];
  for (const p of urunler || []) {
    const vs = Array.isArray(p.variants) ? p.variants.filter(v => v && v.name) : [];
    const ortak = { urun: true, product_id: p.id, unit: "adet", cost_per_unit: p.cost_price, unit_volume_ml: null };
    if (vs.length) {
      for (const v of vs) {
        out.push({ ...ortak, id: `p:${p.id}:${v.name}`, variant: v.name,
                   name: `${p.name} · ${v.name}`, stock_qty: Number(v.stock) || 0 });
      }
    } else {
      out.push({ ...ortak, id: `p:${p.id}`, variant: null, name: p.name,
                 stock_qty: Number(p.retail_stock) || 0 });
    }
  }
  return out;
};

// Stok Sayimi — rafta gordugunu yaz, ekran beklenenle karsilastirsin.
//
// Bu ekrandan once sayim, Stok Yonetimi'nde 128 malzemeyi tek tek acip
// sayiyi USTUNE YAZMAKTI: karsilastirilacak bir sey yok, kayit da kalmiyor.
// Artik stock_moves ne olmasi gerektigini biliyor, yani "beklenen" diye bir
// sey var — sayim veri girisi olmaktan cikip kontrole donusuyor.
//
// Liste iki kaynaktan gelir: ingredients (bar/mutfak, kayit birimi ml/g/adet)
// ve products.track_stock (raf urunu, hep adet). Ikisi ayni satir seklinde
// akar; farki "urun" bayragi ve kayitta ingredient_id yerine product_id.
//
// IKI KURAL ekranin her yerinde gecerli:
//   1. Bos birakilan malzemeye DOKUNULMAZ. Sayim kismi olabilir; bu gece
//      sadece bari sayarsan mutfagin stogu oldugu gibi kalir.
//   2. Sifir YAZMAK bir sayimdir — "raf bos" demek. Bos birakmakla ayni sey
//      degil, ekran da ikisini ayri gosterir.
export default function StockCountPage() {
  const { staffUser } = useAuth();
  const storeIds = staffUser?.store_ids || [];

  const [stores, setStores] = useState([]);
  const [storeId, setStoreId] = useState(storeIds.length === 1 ? storeIds[0] : null);
  const [malzemeler, setMalzemeler] = useState(null);   // null = yukleniyor
  const [hata, setHata] = useState(null);

  const [sayimlar, setSayimlar] = useState({});         // { [id]: "ham metin" }
  const [kapModu, setKapModu] = useState(false);
  const [ara, setAra] = useState("");
  const [birim, setBirim] = useState("hepsi");
  const [sadeceSayilan, setSadeceSayilan] = useState(false);
  const [sayan, setSayan] = useState(staffUser?.name || "");
  const [not, setNot] = useState("");
  const [busy, setBusy] = useState(false);
  const [bitti, setBitti] = useState(null);
  const [gecmis, setGecmis] = useState([]);
  const [acikSayim, setAcikSayim] = useState(null);
  const [acikSatir, setAcikSatir] = useState(null);
  const taslakYuklendi = useRef(false);

  const isMobile = typeof window !== "undefined" ? window.innerWidth < 900 : true;

  useEffect(() => {
    if (!storeIds.length) return;
    supabase.from("stores").select("id,name,slug").in("id", storeIds).order("slug")
      .then(r => setStores(r.data || []));
  }, [staffUser?.id]);

  useEffect(() => {
    if (!storeId) return;
    let iptal = false;
    setMalzemeler(null); setHata(null);
    Promise.all([
      supabase.from("ingredients")
        .select("id,name,unit,stock_qty,cost_per_unit,unit_volume_ml")
        .eq("store_id", storeId).order("name"),
      supabase.from("products")
        .select("id,name,retail_stock,variants,cost_price")
        .eq("store_id", storeId).eq("track_stock", true).order("name"),
    ]).then(([m, u]) => {
      if (iptal) return;
      const error = m.error || u.error;
      if (error) { setHata(error.message); setMalzemeler([]); return; }
      setMalzemeler([...(m.data || []), ...urunSatirlari(u.data)]);
    });
    return () => { iptal = true; };
  }, [storeId]);

  const gecmisYukle = () => {
    if (!storeId) return;
    supabase.from("stock_counts")
      .select("id,counted_by_person,note,kalem_sayisi,fark_tutari,created_at")
      .eq("store_id", storeId).order("created_at", { ascending: false }).limit(5)
      .then(r => setGecmis(r.data || []));
  };
  useEffect(gecmisYukle, [storeId]);

  // Gecmis satirlari istege bagli yuklenir: 5 sayimin butun kalemlerini pesin
  // cekmenin anlami yok, sayim ekrani zaten agir.
  const sayimAc = (id) => {
    if (acikSayim === id) { setAcikSayim(null); return; }
    setAcikSayim(id); setAcikSatir(null);
    supabase.from("stock_count_lines")
      .select("id,beklenen,sayilan,fark,unit_cost,variant_name,ingredients(name,unit),products(name)")
      .eq("count_id", id).order("id")
      .then(r => setAcikSatir((r.data || []).filter(l => Math.abs(Number(l.fark)) > ONEMSIZ)));
  };

  // Taslak: sayim yarim kalirsa (telefon kilitlendi, biri seslendi) bastan
  // girilmesin. Bir kez yuklenir, sonra her tusa basista yazilir.
  useEffect(() => {
    if (!storeId) return;
    taslakYuklendi.current = false;
    try {
      const ham = localStorage.getItem(TASLAK_KEY(storeId));
      if (ham) {
        const t = JSON.parse(ham);
        setSayimlar(t.sayimlar || {});
        setKapModu(!!t.kapModu);
        setNot(t.not || "");
        if (t.sayan) setSayan(t.sayan);
      } else {
        setSayimlar({}); setNot("");
      }
    } catch (e) { /* bozuk taslak sayimi engellemesin */ }
    taslakYuklendi.current = true;
  }, [storeId]);

  useEffect(() => {
    if (!storeId || !taslakYuklendi.current) return;
    try {
      localStorage.setItem(TASLAK_KEY(storeId), JSON.stringify({ sayimlar, kapModu, not, sayan }));
    } catch (e) { /* kota dolu olabilir, sayimi engelleme */ }
  }, [sayimlar, kapModu, not, sayan, storeId]);

  const malzemeById = useMemo(() => {
    const m = {};
    for (const i of malzemeler || []) m[i.id] = i;
    return m;
  }, [malzemeler]);

  // Mod degisince girilmis sayilar da cevrilir. Cevrilmezse 14 fici yazan
  // kisi kayit birimine gecince "14 ml" gormus olur.
  const modDegistir = (yeniKap) => {
    setSayimlar(s => {
      const out = {};
      for (const [id, ham] of Object.entries(s)) {
        const i = malzemeById[id];
        const n = Number(ham);
        if (ham === "" || ham == null || !i || !kapVar(i) || !isFinite(n)) { out[id] = ham; continue; }
        out[id] = sayiYaz(yeniKap ? kabaCevir(n, i) : kabaGeri(n, i));
      }
      return out;
    });
    setKapModu(yeniKap);
  };

  // Bir satirin ekranda gosterilecek hali: beklenen, sayilan ve fark HEP ayni
  // birimde. Karisirsa sayim degil kaza olur.
  const satirHesap = (i) => {
    const kap = kapModu && kapVar(i);
    const ham = sayimlar[i.id];
    const girildi = ham !== "" && ham != null && isFinite(Number(ham));
    const beklenenTemel = Number(i.stock_qty) || 0;
    const beklenen = kap ? kabaCevir(beklenenTemel, i) : beklenenTemel;
    const sayilan = girildi ? Number(ham) : null;
    const sayilanTemel = girildi ? kabaGeri(sayilan, i) : null;
    const farkTemel = girildi ? sayilanTemel - beklenenTemel : null;
    return {
      kap, girildi, beklenen,
      birimAdi: kap ? kapAdi(i) : i.unit,
      fark: girildi ? sayilan - beklenen : null,
      farkTemel,
      tutar: girildi ? farkTutari(farkTemel, i) : 0,
    };
  };

  const gosterilen = useMemo(() => {
    return (malzemeler || []).filter(i => {
      if (!aramaUyar(i.name, ara)) return false;
      // Birim cipleri yalniz malzemeyi suzer: "adet" cipine basan kisi bardak
      // ve pecete sayar, tisortler "Urunler" cipinde kalir.
      if (birim === "urun" ? !i.urun : (birim !== "hepsi" && (i.urun || (i.unit || "") !== birim))) return false;
      if (sadeceSayilan && !satirHesap(i).girildi) return false;
      return true;
    });
  }, [malzemeler, ara, birim, sadeceSayilan, sayimlar, kapModu]);

  // Birim cipleri malzemeden turetilir; raf urunleri ayri bir cip alir ki
  // "adet"li bir malzeme varsa ikisi birbirine karismasin.
  const birimler = useMemo(() => {
    const set = new Set((malzemeler || []).filter(i => !i.urun).map(i => i.unit).filter(Boolean));
    return [...set].sort();
  }, [malzemeler]);
  const urunVar = useMemo(() => (malzemeler || []).some(i => i.urun), [malzemeler]);

  const ozet = useMemo(() => {
    let adet = 0, sapan = 0, net = 0, maliyetsiz = 0;
    for (const i of malzemeler || []) {
      const h = satirHesap(i);
      if (!h.girildi) continue;
      adet++;
      net += h.tutar;
      if (Math.abs(h.farkTemel) > ONEMSIZ) {
        sapan++;
        if (!Number(i.cost_per_unit)) maliyetsiz++;
      }
    }
    return { adet, sapan, net, maliyetsiz };
  }, [malzemeler, sayimlar, kapModu]);

  const kaydet = async () => {
    if (busy) return;
    if (!storeId) { alert("Önce mağaza seç"); return; }
    if (!sayan.trim() || sayan.trim().length < 2) { alert("Sayan kişinin adını yaz"); return; }
    if (ozet.adet === 0) { alert("Hiç malzeme sayılmamış"); return; }

    const yuk = [];
    for (const i of malzemeler || []) {
      const h = satirHesap(i);
      if (!h.girildi) continue;
      // Gonderilen deger HER ZAMAN kayit birimindedir; ekran kap modunda olsa
      // bile veritabani mililitre gorur.
      const temel = kabaGeri(Number(sayimlar[i.id]), i);
      if (!isFinite(temel) || temel < 0) { alert(`${i.name}: geçersiz sayı`); return; }
      // Raf urunu adetle sayilir; 1,5 tisort yok. Sunucu da ayni kurali kosar.
      if (i.urun && !Number.isInteger(temel)) { alert(`${i.name}: adet tam sayı olmalı`); return; }
      yuk.push(i.urun
        ? { product_id: i.product_id, variant: i.variant, sayilan: temel }
        : { ingredient_id: i.id, sayilan: Math.round(temel * 1e6) / 1e6 });
    }

    if (!confirm(
      `${yuk.length} malzeme sayıldı, ${ozet.sapan} tanesinde fark var.\n` +
      `Sayılmayan ${(malzemeler || []).length - yuk.length} malzemeye dokunulmayacak.\n\n` +
      `Kaydedilsin mi?`
    )) return;

    setBusy(true);
    const { data, error } = await supabase.rpc("nip_stok_sayimi_kaydet", {
      p_store_id: storeId, p_sayimlar: yuk, p_sayan: sayan.trim(), p_note: not.trim() || null,
    });
    setBusy(false);
    if (error) { alert("Kaydedilemedi: " + error.message); return; }
    try { localStorage.removeItem(TASLAK_KEY(storeId)); } catch (e) { /* onemsiz */ }
    setBitti(Array.isArray(data) ? data[0] : data);
    // Stok degisti: bir sonraki sayimin "beklenen"i artik baska.
    setMalzemeler(m => (m || []).map(i => {
      const ham = sayimlar[i.id];
      if (ham === "" || ham == null || !isFinite(Number(ham))) return i;
      return { ...i, stock_qty: kabaGeri(Number(ham), i) };
    }));
    gecmisYukle();
  };

  const kart = { background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: 14 };
  const etiket = { fontSize: 12, color: C.muted, letterSpacing: "0.2px", fontWeight: 600 };
  const inputS = {
    width: "100%", minHeight: 44, padding: "10px 12px", background: "#0C0C0C",
    border: `1px solid ${C.line}`, borderRadius: 10, color: C.ink, fontSize: 16,
    outline: "none", fontFamily: cv, boxSizing: "border-box",
  };
  const cip = (aktif) => ({
    minHeight: 36, padding: "7px 12px", borderRadius: 9, cursor: "pointer", fontFamily: cv,
    fontSize: 12, fontWeight: 700, whiteSpace: "nowrap",
    background: aktif ? C.accent : "transparent",
    color: aktif ? "#000" : C.muted,
    border: `1px solid ${aktif ? C.accent : C.line}`,
  });

  if (bitti) {
    return (
      <div style={{ fontFamily: cv, color: C.ink, maxWidth: 520, margin: "0 auto", padding: "40px 16px", textAlign: "center" }}>
        <Ikon ad="onayli" boy={64} kalin={1.3} style={{ display: "block", margin: "0 auto 16px" }} />
        <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 6 }}>Sayım kaydedildi</div>
        <div style={{ fontSize: 14, color: C.muted, lineHeight: 1.7 }}>
          {bitti.kalem} malzeme sayıldı
          <br />
          Fark <span style={{ color: farkRengi(bitti.fark_tutari), fontWeight: 800 }}>
            {Number(bitti.fark_tutari) > 0 ? "+" : ""}{fmtTL(bitti.fark_tutari)}
          </span>
        </div>
        <div style={{ fontSize: 12, color: C.faint, marginTop: 14, lineHeight: 1.6 }}>
          Farklar stok defterine gerekçeli hareket olarak yazıldı ve stok
          saydığın sayıya çekildi. Sayılmayan malzemelere dokunulmadı.
        </div>
        <button onClick={() => { setBitti(null); setSayimlar({}); setNot(""); setSadeceSayilan(false); }}
          style={{
            marginTop: 22, minHeight: 44, padding: "12px 24px", background: C.accent, color: "#000",
            border: "none", borderRadius: 12, fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: cv,
          }}>Yeni sayım</button>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: cv, color: C.ink, maxWidth: 720, margin: "0 auto", paddingBottom: 40 }}>
      <div style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }}>Stok Sayımı</div>
      <div style={{ fontSize: 13, color: C.muted, marginBottom: 14, lineHeight: 1.6, maxWidth: "58ch" }}>
        Rafta gördüğünü yaz — ekran beklenenle karşılaştırır. Boş bıraktığın
        malzemeye dokunulmaz, sayım yarım kalabilir.
      </div>

      {stores.length > 1 && (
        <div style={{ ...kart, marginBottom: 10 }}>
          <div style={{ ...etiket, marginBottom: 8 }}>Hangi mağaza sayılıyor?</div>
          <div style={{ display: "flex", gap: 8 }}>
            {stores.map(s => (
              <button key={s.id} onClick={() => setStoreId(s.id)} style={{
                flex: 1, minHeight: 44, padding: "12px 10px", borderRadius: 10, cursor: "pointer",
                fontFamily: cv, fontSize: 14, fontWeight: 800,
                background: storeId === s.id ? C.accent : "transparent",
                color: storeId === s.id ? "#000" : C.muted,
                border: `1px solid ${storeId === s.id ? C.accent : C.line}`,
              }}>{s.name}</button>
            ))}
          </div>
        </div>
      )}

      {!storeId && stores.length > 1 && (
        <div style={{ ...kart, color: C.muted, fontSize: 13 }}>Devam etmek için mağazayı seç.</div>
      )}

      {storeId && hata && (
        <div style={{ ...kart, borderColor: C.down, color: C.down, fontSize: 13, lineHeight: 1.6 }}>
          <Ikon ad="uyari" boy={15} style={{ marginRight: 6 }} />
          Malzemeler alınamadı. Bağlantı gelince sayfayı yenile.
          <div style={{ fontSize: 12, color: C.faint, marginTop: 6 }}>{hata}</div>
        </div>
      )}

      {storeId && !hata && malzemeler === null && (
        <div style={{ ...kart, color: C.muted, fontSize: 13 }}>Malzemeler yükleniyor…</div>
      )}

      {storeId && malzemeler && malzemeler.length > 0 && (<>
        {/* Filtreler. Sayim rafa gore yapilir: once daralt, sonra dolas. */}
        <div style={{ ...kart, marginBottom: 10 }}>
          <div style={{ position: "relative", marginBottom: 10 }}>
            <Ikon ad="ara" boy={15} style={{ position: "absolute", left: 12, top: 14, color: C.faint }} />
            <input value={ara} onChange={e => setAra(e.target.value)} placeholder="Malzeme ara"
                   style={{ ...inputS, paddingLeft: 36 }} />
            {ara && (
              <button onClick={() => setAra("")} title="Temizle" style={{
                position: "absolute", right: 6, top: 6, minHeight: 32, width: 32, background: "none",
                border: "none", color: C.muted, cursor: "pointer", display: "flex",
                alignItems: "center", justifyContent: "center",
              }}><Ikon ad="kapat" boy={14} /></button>
            )}
          </div>

          <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
            <button onClick={() => setBirim("hepsi")} style={cip(birim === "hepsi")}>Hepsi</button>
            {birimler.map(b => (
              <button key={b} onClick={() => setBirim(b)} style={cip(birim === b)}>{b}</button>
            ))}
            {urunVar && (
              <button onClick={() => setBirim("urun")} style={cip(birim === "urun")}>Ürünler</button>
            )}
            <button onClick={() => setSadeceSayilan(v => !v)} style={cip(sadeceSayilan)}>
              Sadece sayılanlar{ozet.adet > 0 ? ` (${ozet.adet})` : ""}
            </button>
          </div>

          {/* Sise/kutu modu: raftaki fiziksel nesneyi say, ekran mililitreye
              cevirsin. 712.500 ml'yi kimse sayamaz, 14 fıçıyı sayabilir. */}
          <div style={{ display: "flex", gap: 7, marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ ...etiket, marginRight: 2 }}>Sayım birimi</span>
            <button onClick={() => modDegistir(false)} style={cip(!kapModu)}>Kayıt birimi</button>
            <button onClick={() => modDegistir(true)} style={cip(kapModu)}>Şişe &amp; kutu</button>
          </div>
        </div>

        {/* Yapiskan ozet: sayarken kac malzeme girdigin ve fark hep gorunur
            kalsin. Alt bar mobilde ekranin dibini kapatiyor, bu yuzden ustte. */}
        <div style={{
          position: "sticky", top: isMobile ? 51 : 0, zIndex: 20, marginBottom: 10,
          background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: "12px 14px",
          boxShadow: "0 6px 16px rgba(0,0,0,0.45)",
        }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 900, fontFamily: hv, lineHeight: 1 }}>
                {ozet.adet} / {malzemeler.length}
              </div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>
                malzeme sayıldı{ozet.sapan > 0 ? ` · ${ozet.sapan} farklı` : ""}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{
                fontSize: 24, fontWeight: 900, fontFamily: hv, lineHeight: 1,
                color: farkRengi(ozet.net), fontVariantNumeric: "tabular-nums",
              }}>{ozet.net > 0 ? "+" : ""}{fmtTL(ozet.net)}</div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>fark tutarı</div>
            </div>
          </div>
          {ozet.maliyetsiz > 0 && (
            <div style={{ fontSize: 12, color: C.faint, marginTop: 8, lineHeight: 1.5 }}>
              Farkı olan {ozet.maliyetsiz} malzemenin maliyeti girilmemiş — o farklar
              tutara girmiyor.
            </div>
          )}
        </div>

        <div style={{ ...kart, padding: 0, overflow: "hidden", marginBottom: 12 }}>
          {gosterilen.length === 0 && (
            <div style={{ padding: 26, textAlign: "center", color: C.muted, fontSize: 13 }}>
              Bu filtreye uyan malzeme ya da ürün yok.
            </div>
          )}
          {gosterilen.map((i, idx) => {
            const h = satirHesap(i);
            const farkli = h.girildi && Math.abs(h.farkTemel) > ONEMSIZ;
            // Raf urunleri listenin sonunda; 132 malzemenin altinda kaybolmasin
            // diye ilk urun satirinin ustune bolum basligi gelir.
            const bolumBasi = i.urun && (idx === 0 || !gosterilen[idx - 1].urun);
            return (
              <div key={i.id} style={{
                padding: "11px 14px", borderTop: idx === 0 ? "none" : `1px solid ${C.line}`,
                background: h.girildi ? "#1A1A1A" : "transparent",
              }}>
                {bolumBasi && (
                  <div style={{ ...etiket, marginBottom: 10, color: C.ink }}>
                    RAF ÜRÜNLERİ · adetle sayılır, bedenli ürün beden başına
                  </div>
                )}
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, overflow: "hidden",
                                  textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {i.name}
                      {i.urun && (
                        <span style={{ marginLeft: 7, fontSize: 10, fontWeight: 700, color: C.faint,
                                       border: `1px solid ${C.line}`, borderRadius: 5, padding: "1px 5px",
                                       verticalAlign: "middle", letterSpacing: "0.4px" }}>ÜRÜN</span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: C.faint, marginTop: 2,
                                  fontVariantNumeric: "tabular-nums" }}>
                      beklenen {fmtMiktar(h.beklenen)} {h.birimAdi}
                      {h.kap && <> · {fmtMiktar(i.unit_volume_ml)} {i.unit}</>}
                    </div>
                  </div>
                  <input
                    type="number" inputMode={i.urun ? "numeric" : "decimal"} min="0" step={i.urun ? "1" : "any"}
                    value={sayimlar[i.id] ?? ""}
                    onChange={e => setSayimlar(s => ({ ...s, [i.id]: e.target.value }))}
                    placeholder="—"
                    style={{ ...inputS, width: 96, flexShrink: 0, textAlign: "center", fontWeight: 700,
                             borderColor: h.girildi ? "#3D3D3D" : C.line }} />
                </div>

                {h.girildi && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 7,
                                fontSize: 12, fontVariantNumeric: "tabular-nums" }}>
                    {farkli ? (<>
                      <span style={{ color: farkRengi(h.farkTemel), fontWeight: 800 }}>
                        {h.fark > 0 ? "+" : ""}{fmtMiktar(h.fark)} {h.birimAdi}
                      </span>
                      {Number(i.cost_per_unit) > 0 ? (
                        <span style={{ color: farkRengi(h.tutar) }}>
                          {h.tutar > 0 ? "+" : ""}{fmtTL(h.tutar)}
                        </span>
                      ) : (
                        <span style={{ color: C.faint }}>maliyeti girilmemiş</span>
                      )}
                    </>) : (
                      <span style={{ color: C.muted, display: "inline-flex", alignItems: "center", gap: 5 }}>
                        <Ikon ad="onay" boy={12} />Tuttu
                      </span>
                    )}
                    <button onClick={() => setSayimlar(s => { const o = { ...s }; delete o[i.id]; return o; })}
                      style={{
                        marginLeft: "auto", minHeight: 30, padding: "5px 9px", background: "none",
                        border: `1px solid ${C.line}`, color: C.faint, borderRadius: 8, cursor: "pointer",
                        fontFamily: cv, fontSize: 11, fontWeight: 700,
                      }}>Sayma</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ ...kart, marginBottom: 10 }}>
          <div style={{ ...etiket, marginBottom: 8 }}>Sayan kişi</div>
          <input value={sayan} onChange={e => setSayan(e.target.value)}
                 placeholder="Adı soyadı" style={inputS} />
          <div style={{ fontSize: 12, color: C.faint, marginTop: 6, lineHeight: 1.5 }}>
            Bu hesabı birden çok kişi kullanıyorsa rafı fiilen kimin saydığını yaz.
          </div>
          <div style={{ ...etiket, margin: "14px 0 8px" }}>Açıklama (opsiyonel)</div>
          <textarea value={not} onChange={e => setNot(e.target.value)} rows={2}
                    placeholder="Ne sayıldı, fark neden çıkmış olabilir?"
                    style={{ ...inputS, resize: "vertical", minHeight: 60 }} />
        </div>

        <button onClick={kaydet} disabled={busy || ozet.adet === 0} style={{
          width: "100%", minHeight: 52, background: ozet.adet === 0 ? "#242424" : C.accent,
          color: ozet.adet === 0 ? C.faint : "#000", border: "none", borderRadius: 12,
          fontSize: 16, fontWeight: 800, cursor: ozet.adet === 0 ? "default" : "pointer",
          fontFamily: cv, opacity: busy ? 0.6 : 1,
        }}>
          {busy ? "Kaydediliyor…"
                : ozet.adet === 0 ? "Önce bir malzeme say"
                : `${ozet.adet} malzemeyi kaydet`}
        </button>

        <div style={{ fontSize: 12, color: C.faint, marginTop: 10, lineHeight: 1.7, textAlign: "center" }}>
          Kaydedince farklar stok defterine yazılır ve stok saydığın sayıya çekilir.
          Sayı girmediğin malzemelere dokunulmaz. Sıfır yazmak "raf boş" demektir.
        </div>
      </>)}

      {/* Gecmis: sayimin "kayit birakan" tarafi burada gorunur hale geliyor.
          Fire ve kayip ancak iki sayim yan yana durunca olculebilir. */}
      {storeId && gecmis.length > 0 && (
        <div style={{ marginTop: 26 }}>
          <div style={{ ...etiket, marginBottom: 8 }}>Son sayımlar</div>
          <div style={{ ...kart, padding: 0, overflow: "hidden" }}>
            {gecmis.map((g, idx) => (
              <div key={g.id} style={{ borderTop: idx === 0 ? "none" : `1px solid ${C.line}` }}>
                <div onClick={() => sayimAc(g.id)} style={{
                  padding: "11px 14px", cursor: "pointer", display: "flex",
                  alignItems: "center", gap: 10,
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>
                      {new Date(g.created_at).toLocaleString("tr-TR",
                        { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}
                    </div>
                    <div style={{ fontSize: 12, color: C.faint, marginTop: 2 }}>
                      {g.counted_by_person} · {g.kalem_sayisi} malzeme
                      {g.note && <> · {g.note}</>}
                    </div>
                  </div>
                  <span style={{
                    fontSize: 14, fontWeight: 800, color: farkRengi(g.fark_tutari),
                    fontVariantNumeric: "tabular-nums", flexShrink: 0,
                  }}>{Number(g.fark_tutari) > 0 ? "+" : ""}{fmtTL(g.fark_tutari)}</span>
                  <Ikon ad={acikSayim === g.id ? "yukari" : "asagi"} boy={14} style={{ color: C.faint }} />
                </div>

                {acikSayim === g.id && (
                  <div style={{ padding: "0 14px 12px" }}>
                    {acikSatir === null && (
                      <div style={{ fontSize: 12, color: C.faint }}>Yükleniyor…</div>
                    )}
                    {acikSatir && acikSatir.length === 0 && (
                      <div style={{ fontSize: 12, color: C.muted }}>
                        Bu sayımda hiçbir malzemede fark çıkmamış — her şey tuttu.
                      </div>
                    )}
                    {acikSatir && acikSatir.map(l => (
                      <div key={l.id} style={{
                        display: "flex", alignItems: "baseline", gap: 8, fontSize: 12,
                        padding: "4px 0", fontVariantNumeric: "tabular-nums",
                      }}>
                        <span style={{ flex: 1, minWidth: 0, color: C.muted, overflow: "hidden",
                                       textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {l.ingredients?.name
                            || (l.products?.name ? l.products.name + (l.variant_name ? " · " + l.variant_name : "") : "—")}
                        </span>
                        <span style={{ color: C.faint }}>
                          {fmtMiktar(l.beklenen)} → {fmtMiktar(l.sayilan)} {l.ingredients?.unit || (l.products ? "adet" : "")}
                        </span>
                        <span style={{ color: farkRengi(l.fark), fontWeight: 800, minWidth: 74,
                                       textAlign: "right" }}>
                          {Number(l.fark) > 0 ? "+" : ""}{fmtTL(Number(l.fark) * Number(l.unit_cost || 0))}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {storeId && malzemeler && malzemeler.length === 0 && !hata && (
        <div style={{ ...kart, textAlign: "center", padding: 40 }}>
          <Ikon ad="stok" boy={40} kalin={1.3} style={{ display: "block", margin: "0 auto 12px" }} />
          <div style={{ fontSize: 15, fontWeight: 700 }}>Bu mağazada malzeme yok</div>
          <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>
            Önce Stok Yönetimi'nden malzeme ekle.
          </div>
        </div>
      )}
    </div>
  );
}
