import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabase.js";
import { useAuth } from "../../contexts/AuthContext.jsx";
import Ikon from "../../components/Ikon.jsx";
import StokEkleSheet from "../../components/StokEkleSheet.jsx";

// URUN STOKU — "hangi urunden elimizde kac tane var?" kategori ve markaya gore.
//
// Uc tur urun var, hepsi ayni listede ama stok baska yerden gelir:
//   raf    : track_stock urunler (tisort, gozluk...) — retail_stock + bedenler
//   recete : bar/mutfak urunleri — stok malzemede (ingredients). Yapilabilir
//            adet = receteki her malzeme icin floor(stok / birim) 'in en kucugu;
//            sisede 1:1 oldugu icin sise sayisiyla ayni. Buz, pipet, bardak
//            gibi sarf (is_consumable) ve parti satirlari sinir sayilmaz —
//            yoksa buz stogu eksiye dusunce butun icecekler "tukendi" gorunur.
//   yok    : ne stok takibi ne recete — dogru soylenir: "takip yok".
// Eksi stok (sayim yapilmadan dusum baslamis) 0 sayilir ve "sayim gerekli"
// diye isaretlenir; gizlenmez.

const cv = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";
const hv = "'Bebas Neue','Barlow Condensed','Coolvetica Condensed',sans-serif";
const C = { card: "#161616", cardLine: "#262626", ink: "#F0EDE8", muted: "#8A8A86", faint: "#666666", accent: "#FFFFFF", down: "#C87A6A" };
const fmtN = (n) => Number(n || 0).toLocaleString("tr-TR", { maximumFractionDigits: 0 });
const fmtTL = (n) => "₺" + fmtN(n);
const AZALAN_ESIK = 5;   // raf: 2 ve alti; recete: 5 ve alti "azalan"

export default function ProductStockPage() {
  const { staffUser } = useAuth();
  const [veri, setVeri] = useState(null);   // { products, categories, brands, recipes, ingredients }
  const [hata, setHata] = useState(null);
  const [gorunum, setGorunum] = useState("kategori");   // kategori | marka
  const [bolum, setBolum] = useState("hepsi");           // hepsi | bar | raf
  const [yalnizAzalan, setYalnizAzalan] = useState(false);
  const [takipsizGoster, setTakipsizGoster] = useState(true);
  const [arama, setArama] = useState("");
  const [acik, setAcik] = useState({});     // grup basligi acik/kapali
  const [acikUrun, setAcikUrun] = useState(null);
  // Stok ekleme: raf urununde adet/beden, recete urununde satiri sinirlayan
  // malzeme. Giris sunucuda toplanir (nip_stok_ekle), uzerine yazmaz.
  const [ekle, setEkle] = useState(null);
  const [sonGiris, setSonGiris] = useState(null);
  const [tazele, setTazele] = useState(0);

  useEffect(() => {
    const storeIds = staffUser?.store_ids?.length ? staffUser.store_ids : ["00000000-0000-0000-0000-000000000000"];
    let iptal = false;
    Promise.all([
      supabase.from("products").select("id,name,category_id,brand,brand_id,track_stock,retail_stock,variants,is_available,sold_out_today,price,cost_price,sort_order,store_id").in("store_id", storeIds).order("sort_order"),
      supabase.from("categories").select("id,name,parent_id,sort_order,is_active,staff_only,show_in_shop").order("sort_order"),
      supabase.from("brands").select("id,name,sort_order").order("sort_order"),
      supabase.from("recipes").select("product_id,ingredient_id,qty_per_unit,party_only"),
      supabase.from("ingredients").select("id,name,unit,stock_qty,min_stock,is_consumable").in("store_id", storeIds),
    ]).then(rs => {
      if (iptal) return;
      const err = rs.find(r => r.error);
      if (err) { setHata(err.error.message); return; }
      setVeri({ products: rs[0].data || [], categories: rs[1].data || [], brands: rs[2].data || [], recipes: rs[3].data || [], ingredients: rs[4].data || [] });
    });
    return () => { iptal = true; };
  }, [staffUser?.id, tazele]);

  const rafEkleAc = (u) => setEkle({ tur: "urun", id: u.id, ad: u.name, stok: Number(u.retail_stock) || 0, bedenler: u.bedenler, takipsiz: u.track_stock !== true });
  const malzemeEkleAc = (m) => setEkle({ tur: "malzeme", id: m.id, ad: m.ad, birim: m.unit, stok: Number(m.stok) || 0 });
  const girisBitti = (s) => { setEkle(null); setSonGiris(s); setTazele(t => t + 1); };

  // Her urune bir stok karti: { tur, adet, seviye, bedenler, sinir, malzemeler }
  const urunler = useMemo(() => {
    if (!veri) return [];
    const kat = Object.fromEntries(veri.categories.map(c => [c.id, c]));
    const marka = Object.fromEntries(veri.brands.map(b => [b.id, b]));
    const malz = Object.fromEntries(veri.ingredients.map(i => [i.id, i]));
    const recPerProd = {};
    veri.recipes.forEach(r => { (recPerProd[r.product_id] = recPerProd[r.product_id] || []).push(r); });

    return veri.products.map(p => {
      const c = kat[p.category_id];
      const ust = c?.parent_id ? kat[c.parent_id] : null;
      const rafMi = !!c && (c.show_in_shop || c.staff_only);
      const markaAd = p.brand || marka[p.brand_id]?.name || null;
      let tur = "yok", adet = null, bedenler = [], sinir = null, malzemeler = [], sayimGerekli = false;

      if (p.track_stock) {
        tur = "raf";
        bedenler = Array.isArray(p.variants) ? p.variants.filter(v => v?.name) : [];
        adet = bedenler.length ? bedenler.reduce((s, v) => s + Math.max(0, Number(v.stock) || 0), 0) : Math.max(0, Number(p.retail_stock) || 0);
        if ((Number(p.retail_stock) || 0) < 0) sayimGerekli = true;
      } else if ((recPerProd[p.id] || []).length) {
        tur = "recete";
        const satirlar = (recPerProd[p.id] || []).map(r => ({ r, i: malz[r.ingredient_id] })).filter(x => x.i);
        malzemeler = satirlar.map(({ r, i }) => {
          const stok = Number(i.stock_qty) || 0;
          const birim = Number(r.qty_per_unit) || 0;
          const sinirlar = !r.party_only && !i.is_consumable && birim > 0;
          // id de tasiniyor: satir acilinca malzemeye dogrudan stok girilebilsin
          return { id: i.id, ad: i.name, unit: i.unit, stok, birim, parti: !!r.party_only, sarf: !!i.is_consumable, sinirlar,
                   yapilabilir: sinirlar ? Math.floor(Math.max(0, stok) / birim) : null };
        });
        const sinirlayan = malzemeler.filter(m => m.sinirlar);
        if (sinirlayan.length) {
          const enAz = sinirlayan.reduce((a, b) => (b.yapilabilir < a.yapilabilir ? b : a));
          adet = enAz.yapilabilir; sinir = enAz;
          if (sinirlayan.some(m => m.stok < 0)) sayimGerekli = true;
        } else {
          tur = "yok";   // yalniz sarf/parti satirlari: stok bilgisi yok sayilir
        }
      }

      const seviye = adet == null ? "yok"
        : adet <= 0 ? "tukendi"
        : adet <= (tur === "raf" ? 2 : AZALAN_ESIK) ? "azalan"
        : "ok";
      return {
        ...p, kategori: c?.name || "—", kategoriId: p.category_id, ustKategori: ust?.name || null, ustSira: ust?.sort_order ?? c?.sort_order ?? 999, katSira: c?.sort_order ?? 999,
        rafMi, markaAd, tur, adet, seviye, bedenler, sinir, malzemeler, sayimGerekli,
        receteli: (recPerProd[p.id] || []).length > 0,
      };
    });
  }, [veri]);

  const trLow = (s) => String(s || "").toLocaleLowerCase("tr");
  const q = trLow(arama.trim());
  const suzulen = useMemo(() => urunler.filter(u =>
    (bolum === "hepsi" || (bolum === "raf" ? u.rafMi : !u.rafMi))
    && (!yalnizAzalan || u.seviye === "azalan" || u.seviye === "tukendi")
    && (takipsizGoster || u.tur !== "yok")
    && (!q || trLow(u.name).includes(q) || trLow(u.kategori).includes(q) || trLow(u.markaAd).includes(q))
  ), [urunler, bolum, yalnizAzalan, takipsizGoster, q]);

  const ozet = useMemo(() => ({
    takipli: urunler.filter(u => u.tur !== "yok").length,
    takipsiz: urunler.filter(u => u.tur === "yok").length,
    tukenen: urunler.filter(u => u.seviye === "tukendi").length,
    azalan: urunler.filter(u => u.seviye === "azalan").length,
    sayim: urunler.filter(u => u.sayimGerekli).length,
    rafAdet: urunler.filter(u => u.tur === "raf").reduce((s, u) => s + (u.adet || 0), 0),
    rafDeger: urunler.filter(u => u.tur === "raf").reduce((s, u) => s + (u.adet || 0) * (Number(u.price) || 0), 0),
  }), [urunler]);

  // Gruplama: kategori gorunumunde ust kategori > alt kategori; marka
  // gorunumunde marka > kategori. Ayni satir cizimi.
  const gruplar = useMemo(() => {
    const m = new Map();
    suzulen.forEach(u => {
      const [k1, k2] = gorunum === "kategori"
        ? [u.ustKategori || u.kategori, u.ustKategori ? u.kategori : null]
        : [u.markaAd || "Markasız", u.kategori];
      const sira1 = gorunum === "kategori" ? u.ustSira : (u.markaAd ? 0 : 1);
      if (!m.has(k1)) m.set(k1, { ad: k1, sira: sira1, alt: new Map(), n: 0, tukenen: 0, azalan: 0, adet: 0 });
      const g = m.get(k1);
      g.n++; if (u.seviye === "tukendi") g.tukenen++; if (u.seviye === "azalan") g.azalan++; if (u.tur === "raf") g.adet += u.adet || 0;
      const ak = k2 || "";
      if (!g.alt.has(ak)) g.alt.set(ak, { ad: ak, sira: u.katSira, urunler: [] });
      g.alt.get(ak).urunler.push(u);
    });
    return [...m.values()].sort((a, b) => a.sira - b.sira || a.ad.localeCompare(b.ad, "tr"))
      .map(g => ({ ...g, alt: [...g.alt.values()].sort((a, b) => a.sira - b.sira || a.ad.localeCompare(b.ad, "tr")) }));
  }, [suzulen, gorunum]);

  const kart = { background: C.card, border: `1px solid ${C.cardLine}`, borderRadius: 12, padding: 16 };
  const cip = (aktif) => ({
    padding: "9px 13px", borderRadius: 9, cursor: "pointer", fontFamily: cv, fontSize: 12, fontWeight: 700, minHeight: 40, whiteSpace: "nowrap",
    background: aktif ? C.accent : "transparent", color: aktif ? "#000" : C.muted, border: `1px solid ${aktif ? C.accent : C.cardLine}`,
  });
  const rozet = (renk) => ({ fontSize: 10, padding: "2px 7px", borderRadius: 6, fontWeight: 700, letterSpacing: 0.3, background: renk + "22", color: renk, whiteSpace: "nowrap" });
  const seviyeRenk = { tukendi: C.down, azalan: C.ink, ok: C.muted, yok: C.faint };
  const seviyeAd = { tukendi: "Tükendi", azalan: "Azalan", ok: "", yok: "takip yok" };

  const satir = (u) => {
    const acikBu = acikUrun === u.id;
    const tiklanir = u.tur === "recete";
    return (
      <div key={u.id} onClick={() => tiklanir && setAcikUrun(acikBu ? null : u.id)}
        style={{ padding: "10px 14px", borderTop: `1px solid ${C.cardLine}`, cursor: tiklanir ? "pointer" : "default", opacity: u.is_available === false ? 0.6 : 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {u.name}
              {u.markaAd && gorunum === "kategori" && <span style={{ color: C.faint, fontWeight: 600 }}> · {u.markaAd}</span>}
            </div>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 4, alignItems: "center" }}>
              {u.is_available === false && <span style={rozet(C.faint)}>Pasif</span>}
              {u.sold_out_today && <span style={rozet(C.down)}>Bugün tükendi</span>}
              {u.sayimGerekli && <span style={rozet(C.down)}>Sayım gerekli</span>}
              {u.tur === "raf" && u.bedenler.map(v => (
                <span key={v.name} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 8, fontWeight: 700, background: Number(v.stock) > 0 ? "#22262E" : "transparent", border: `1px solid ${Number(v.stock) > 0 ? "transparent" : C.cardLine}`, color: Number(v.stock) > 0 ? C.ink : C.faint }}>
                  {v.name} {Math.max(0, Number(v.stock) || 0)}
                </span>
              ))}
              {u.tur === "recete" && u.sinir && (
                <span style={{ fontSize: 11, color: C.faint }}>
                  sınır: {u.sinir.ad} · {fmtN(Math.max(0, u.sinir.stok))} {u.sinir.unit}{u.sinir.birim !== 1 ? ` (${fmtN(u.sinir.birim)} ${u.sinir.unit}/adet)` : ""}
                </span>
              )}
              {u.tur === "yok" && <span style={{ fontSize: 11, color: C.faint }}>stok takibi yok — reçete ya da raf stoğu gir</span>}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <div style={{ textAlign: "right" }}>
              {u.adet == null ? (
                <div style={{ fontSize: 12, color: C.faint }}>—</div>
              ) : (
                <div style={{ fontSize: 22, fontWeight: 900, fontFamily: hv, lineHeight: 1, color: seviyeRenk[u.seviye], fontVariantNumeric: "tabular-nums" }}>
                  {u.tur === "recete" && "≈ "}{fmtN(u.adet)}<span style={{ fontSize: 11, fontFamily: cv, fontWeight: 600, color: C.muted, marginLeft: 3 }}>adet</span>
                </div>
              )}
              {seviyeAd[u.seviye] && <div style={{ fontSize: 10, color: seviyeRenk[u.seviye], marginTop: 3, fontWeight: 700, letterSpacing: 0.3 }}>{seviyeAd[u.seviye].toUpperCase()}</div>}
            </div>
            {/* Raf urunu: adedi buradan eklenir. Recete urununde stok malzemede
                yasar — satir acilinca malzemenin yanindaki + kullanilir. */}
            {!u.receteli && (
              <button onClick={(e) => { e.stopPropagation(); rafEkleAc(u); }} title="Stoğa ekle"
                style={{ width: 40, height: 40, flexShrink: 0, borderRadius: 9, background: "transparent", color: C.ink, border: `1px solid ${C.cardLine}`, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Ikon ad="ekle" boy={15} />
              </button>
            )}
          </div>
        </div>
        {acikBu && u.malzemeler.length > 0 && (
          <div style={{ marginTop: 8, padding: "8px 10px", background: "#0C0C0C", borderRadius: 8, fontSize: 12, color: C.muted, lineHeight: 1.7 }}>
            {u.malzemeler.map((m, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, opacity: m.sinirlar ? 1 : 0.6 }}>
                <span style={{ minWidth: 0 }}>{m.ad}{m.parti ? " (parti)" : m.sarf ? " (sarf)" : ""} · {fmtN(m.birim)} {m.unit}/adet</span>
                <span style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                  <span style={{ color: m.stok < 0 ? C.down : C.ink, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                    {fmtN(m.stok)} {m.unit}{m.sinirlar ? ` → ${fmtN(m.yapilabilir)} adet` : ""}
                  </span>
                  <button onClick={(e) => { e.stopPropagation(); malzemeEkleAc(m); }} title={m.ad + " stoğuna ekle"}
                    style={{ width: 34, height: 34, flexShrink: 0, borderRadius: 8, background: "transparent", color: C.ink, border: `1px solid ${C.cardLine}`, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Ikon ad="ekle" boy={13} />
                  </button>
                </span>
              </div>
            ))}
            <div style={{ marginTop: 4, fontSize: 11, color: C.faint }}>Malzeme stoğu ve sayım: <Link to="/stock-mgmt" style={{ color: C.muted }}>Stok Yönetimi</Link></div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ padding: 16, fontFamily: cv, maxWidth: 900, margin: "0 auto", paddingBottom: 80, color: C.ink }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontSize: 24, fontWeight: 800 }}>Ürün Stoku</div>
        <div style={{ fontSize: 12, color: C.faint }}>raf: adet · bar: reçeteden ≈ yapılabilir</div>
      </div>

      {sonGiris && (
        <div onClick={() => setSonGiris(null)} style={{ ...kart, marginTop: 14, padding: "11px 14px", borderColor: C.accent, display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
          <Ikon ad="onayli" boy={16} style={{ color: C.accent, flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0, fontSize: 13 }}>
            <b>{sonGiris.kalem}{sonGiris.beden ? " · " + sonGiris.beden : ""}</b> · {fmtN(sonGiris.onceki)} → <b>{fmtN(sonGiris.sonraki)}</b> {sonGiris.birim} kaydedildi
          </div>
          <Ikon ad="kapat" boy={13} style={{ color: C.faint, flexShrink: 0 }} />
        </div>
      )}
      {hata && <div style={{ ...kart, marginTop: 14, borderColor: C.down, color: C.down, fontSize: 13 }}><Ikon ad="uyari" boy={14} style={{ marginRight: 6 }} />{hata}</div>}
      {!veri && !hata && <div style={{ padding: 40, textAlign: "center", color: C.muted }}>Yükleniyor…</div>}

      {veri && (<>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8, marginTop: 14 }}>
          {[
            ["Tükenen", ozet.tukenen, ozet.tukenen > 0 ? C.down : C.ink],
            ["Azalan", ozet.azalan, C.ink],
            ["Sayım gerekli", ozet.sayim, ozet.sayim > 0 ? C.down : C.ink],
            ["Raf stoğu", fmtN(ozet.rafAdet) + " adet", C.ink],
            ["Raf değeri", fmtTL(ozet.rafDeger), C.ink],
            ["Takipsiz ürün", ozet.takipsiz, C.muted],
          ].map(([l, v, col]) => (
            <div key={l} style={{ ...kart, padding: 12 }}>
              <div style={{ fontSize: 11, color: C.muted, letterSpacing: 1, textTransform: "uppercase", fontWeight: 600 }}>{l}</div>
              <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4, color: col, fontVariantNumeric: "tabular-nums" }}>{v}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", margin: "12px 0 10px" }}>
          {[["kategori", "Kategori"], ["marka", "Marka"]].map(([k, l]) => <button key={k} onClick={() => setGorunum(k)} style={cip(gorunum === k)}>{l}</button>)}
          <span style={{ width: 1, height: 24, background: C.cardLine, margin: "0 4px" }} />
          {[["hepsi", "Hepsi"], ["bar", "Bar & Mutfak"], ["raf", "Raf"]].map(([k, l]) => <button key={k} onClick={() => setBolum(k)} style={cip(bolum === k)}>{l}</button>)}
          <button onClick={() => setYalnizAzalan(v => !v)} style={cip(yalnizAzalan)}>Sadece azalan</button>
          <button onClick={() => setTakipsizGoster(v => !v)} style={cip(!takipsizGoster)}>Takipsizi gizle</button>
        </div>
        <input value={arama} onChange={e => setArama(e.target.value)} placeholder="Ürün, kategori ya da marka ara"
          style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", minHeight: 42, background: "#0C0C0C", border: `1px solid ${C.cardLine}`, borderRadius: 9, color: C.ink, fontFamily: cv, fontSize: 14, outline: "none", marginBottom: 10 }} />

        {gruplar.length === 0 && (
          <div style={{ ...kart, textAlign: "center", color: C.muted, padding: 40, fontSize: 13 }}>Bu süzgeçle ürün yok.</div>
        )}

        {gruplar.map(g => {
          const kapali = acik[g.ad] === false;
          return (
            <div key={g.ad} style={{ ...kart, padding: 0, overflow: "hidden", marginBottom: 10 }}>
              <button onClick={() => setAcik(a => ({ ...a, [g.ad]: kapali }))}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", background: "transparent", border: "none", color: C.ink, cursor: "pointer", fontFamily: cv, textAlign: "left" }}>
                <Ikon ad={kapali ? "sag" : "asagi"} boy={14} style={{ color: C.muted, flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.ad}</span>
                <span style={{ fontSize: 12, color: C.muted, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                  {g.n} ürün{g.adet > 0 ? ` · ${fmtN(g.adet)} adet` : ""}
                  {g.tukenen > 0 && <span style={{ color: C.down }}> · {g.tukenen} tükendi</span>}
                  {g.azalan > 0 && <span> · {g.azalan} azalan</span>}
                </span>
              </button>
              {!kapali && g.alt.map(a => (
                <div key={a.ad || "_"}>
                  {a.ad && (
                    <div style={{ padding: "8px 14px 4px", fontSize: 11, color: C.muted, letterSpacing: 1, textTransform: "uppercase", fontWeight: 600, borderTop: `1px solid ${C.cardLine}` }}>
                      {a.ad} <span style={{ color: C.faint, letterSpacing: 0, textTransform: "none" }}>· {a.urunler.length}</span>
                    </div>
                  )}
                  {a.urunler.map(satir)}
                </div>
              ))}
            </div>
          );
        })}

        <div style={{ fontSize: 12, color: C.faint, marginTop: 12, lineHeight: 1.7 }}>
          Raf ürünlerinin adedi ve bedenleri <Link to="/retail" style={{ color: C.muted }}>Ürünler (Raf)</Link>'tan; bar ürünlerinin stoğu
          reçetedeki malzemeden hesaplanır (buz, pipet, bardak gibi sarf ve parti satırları sınır sayılmaz) — satıra dokununca malzemeler açılır.
          Eksi stok, sayım yapılmadan düşüm başladığını gösterir; <Link to="/stock-count" style={{ color: C.muted }}>Stok Sayımı</Link> ile düzelir.
          Satırdaki <b style={{ color: C.muted }}>+</b> gelen malı mevcudun üstüne ekler (üzerine yazmaz).
        </div>
      </>)}

      {ekle && (
        <StokEkleSheet kalem={ekle} storeId={staffUser?.store_ids?.[0]} onKapat={() => setEkle(null)} onBitti={girisBitti} />
      )}
    </div>
  );
}
