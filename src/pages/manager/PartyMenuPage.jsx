import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase.js";
import { useAuth } from "../../contexts/AuthContext.jsx";
import Ikon from "../../components/Ikon.jsx";
import { sadelestir } from "../../lib/stockCount.js";

const cv = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";
const hv = "'Bebas Neue','Barlow Condensed','Coolvetica Condensed',sans-serif";

const C = {
  card: "#161616", line: "#2A2A2A", ink: "#F0EDE8", muted: "#8A8A86",
  faint: "#666666", accent: "#FFFFFF", down: "#C87A6A", up: "#7FA88A",
};

const fmtTL = (n) => "₺" + Number(n || 0).toLocaleString("tr-TR", { maximumFractionDigits: 0 });

// Parti Menusu — parti gecesi hangi urunler gorunecek, tek listeden secilir.
//
// Onceki yol: her urunu Menu Yonetimi'nde tek tek acip "parti menusunde
// goster" kutusunu isaretlemek. 142 urun icin bu pratikte yapilamaz — canli
// olcum bunu dogruluyordu: HICBIR uründe isaret yoktu, yani ozellik hic
// kullanilamamis.
//
// ONEMLI DAVRANIS (ekranda da yaziyor): parti filtresi kategori bazinda
// calisir ve bos kategoriye DOKUNMAZ (CustomerMenu.jsx:1062 — "only.length > 0
// ? only : list"). Yani bir kategoride hic secim yoksa o kategorinin TAMAMI
// parti gecesi gorunur; ilk urunu isaretledigin anda geri kalanlar gizlenir.
// Bu sürprizi ekran acikca soyluyor, yoksa tek bira isaretleyen kisi farkinda
// olmadan 11 birayi menuden dusururdu.
//
// "Tukendi" ayri bir sey: is_available=false urunu HER YERDEN kaldirir (parti
// menusu, normal menu, kasa). Alkol bitince tek dokunusla kapatmak icin.
export default function PartyMenuPage() {
  const { staffUser } = useAuth();
  const storeIds = staffUser?.store_ids?.length ? staffUser.store_ids
    : ["00000000-0000-0000-0000-000000000000"];

  const [kategoriler, setKategoriler] = useState([]);
  const [urunler, setUrunler] = useState(null);
  const [ayar, setAyar] = useState(null);
  const [hata, setHata] = useState(null);
  const [ara, setAra] = useState("");
  const [sadeceSecili, setSadeceSecili] = useState(false);
  const [bekleyen, setBekleyen] = useState({});   // { [id]: true } — istek ucarken

  const yukle = async () => {
    setHata(null);
    const [{ data: cats }, { data: prods, error }, { data: ayarlar }] = await Promise.all([
      supabase.from("categories").select("id,name,sort_order,parent_id,is_active")
        .in("store_id", storeIds).order("sort_order"),
      supabase.from("products").select("id,name,price,category_id,is_available,show_in_party_menu,sort_order")
        .in("store_id", storeIds).order("sort_order"),
      supabase.from("app_settings").select("key,value")
        .in("store_id", storeIds)
        .in("key", ["party_mode_enabled", "party_mode_from", "party_mode_until"]),
    ]);
    if (error) { setHata(error.message); setUrunler([]); return; }
    setKategoriler(cats || []);
    setUrunler(prods || []);
    const m = {};
    for (const a of ayarlar || []) m[a.key] = a.value;
    setAyar(m);
  };
  useEffect(() => { yukle(); }, [staffUser?.id]);

  // Iyimser guncelleme: dokunus aninda ekran degisir, istek arkada gider.
  // Hata olursa geri alinir — 142 urunlu bir tarama ekraninda her dokunusta
  // sunucu beklemek isi kullanilamaz hale getirir.
  const degistir = async (u, alan, yeniDeger) => {
    if (bekleyen[u.id]) return;
    setBekleyen(b => ({ ...b, [u.id]: true }));
    setUrunler(list => list.map(x => x.id === u.id ? { ...x, [alan]: yeniDeger } : x));
    const { error } = await supabase.from("products").update({ [alan]: yeniDeger }).eq("id", u.id);
    setBekleyen(b => { const o = { ...b }; delete o[u.id]; return o; });
    if (error) {
      setUrunler(list => list.map(x => x.id === u.id ? { ...x, [alan]: u[alan] } : x));
      alert("Kaydedilemedi: " + error.message);
    }
  };

  // Kategorinin tamamini ac/kapat — "Bira gecesi" gibi toplu secimler icin.
  const kategoriTopluSec = async (urunListesi, yeniDeger) => {
    const hedef = urunListesi.filter(u => !!u.show_in_party_menu !== yeniDeger);
    if (!hedef.length) return;
    const idler = hedef.map(u => u.id);
    setUrunler(list => list.map(x => idler.includes(x.id) ? { ...x, show_in_party_menu: yeniDeger } : x));
    const { error } = await supabase.from("products")
      .update({ show_in_party_menu: yeniDeger }).in("id", idler);
    if (error) {
      setUrunler(list => list.map(x => idler.includes(x.id) ? { ...x, show_in_party_menu: !yeniDeger } : x));
      alert("Kaydedilemedi: " + error.message);
    }
  };

  const katAd = useMemo(() => {
    const m = {};
    for (const c of kategoriler) m[c.id] = c.name;
    return m;
  }, [kategoriler]);

  // Kategori kategori grupla; siralamayi kategorinin kendi sort_order'i belirler
  // ki ekran musterinin gordugu duzenle ayni sirada olsun.
  const gruplar = useMemo(() => {
    const q = sadelestir(ara);
    const liste = (urunler || []).filter(u => {
      if (q && !sadelestir(u.name).includes(q)) return false;
      if (sadeceSecili && !u.show_in_party_menu) return false;
      return true;
    });
    const m = new Map();
    for (const u of liste) {
      const k = u.category_id || "yok";
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(u);
    }
    const sira = {};
    kategoriler.forEach((c, i) => { sira[c.id] = c.sort_order ?? 999; });
    return [...m.entries()]
      .map(([id, items]) => ({
        id, ad: katAd[id] || "Kategorisiz", items,
        secili: items.filter(u => u.show_in_party_menu).length,
      }))
      .sort((a, b) => (sira[a.id] ?? 999) - (sira[b.id] ?? 999) || a.ad.localeCompare(b.ad, "tr"));
  }, [urunler, kategoriler, katAd, ara, sadeceSecili]);

  const ozet = useMemo(() => {
    const hepsi = urunler || [];
    const secili = hepsi.filter(u => u.show_in_party_menu);
    // Secim yapilmis kategoriler: parti gecesi bu kategorilerde SADECE secililer
    // gorunur. Digerleri oldugu gibi kalir.
    const kisitli = new Set(secili.map(u => u.category_id));
    return {
      secili: secili.length,
      toplam: hepsi.length,
      kisitliKategori: kisitli.size,
      tukenen: hepsi.filter(u => !u.is_available).length,
    };
  }, [urunler]);

  const partiAcik = ayar?.party_mode_enabled === true || ayar?.party_mode_enabled === "true";

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

  return (
    <div style={{ fontFamily: cv, color: C.ink, maxWidth: 720, margin: "0 auto", paddingBottom: 40 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontSize: 24, fontWeight: 800 }}>Parti Menüsü</div>
        <button onClick={yukle} title="Yenile" style={{
          minHeight: 40, padding: "8px 12px", background: "none", border: `1px solid ${C.line}`,
          color: C.muted, borderRadius: 9, cursor: "pointer", display: "inline-flex",
          alignItems: "center", gap: 6, fontFamily: cv, fontSize: 12, fontWeight: 700,
        }}><Ikon ad="yenile" boy={13} />Yenile</button>
      </div>

      <div style={{ fontSize: 13, color: C.muted, margin: "6px 0 12px", lineHeight: 1.6, maxWidth: "60ch" }}>
        Parti gecesi menüde kalacak ürünlere dokun. Kaydet yok — dokunduğun anda geçerli.
        {ayar && (partiAcik
          ? <> Parti modu <b style={{ color: C.ink }}>açık</b>, {ayar.party_mode_from || "22:00"}–{ayar.party_mode_until || "04:00"} arası.</>
          : <> Parti modu şu an <b style={{ color: C.down }}>kapalı</b> — Ayarlar'dan açılır.</>)}
      </div>

      {hata && (
        <div style={{ ...kart, borderColor: C.down, color: C.down, fontSize: 13 }}>
          <Ikon ad="uyari" boy={15} style={{ marginRight: 6 }} />{hata}
        </div>
      )}

      {urunler === null && !hata && (
        <div style={{ ...kart, color: C.muted, fontSize: 13 }}>Ürünler yükleniyor…</div>
      )}

      {urunler && urunler.length > 0 && (<>
        <div style={{ ...kart, marginBottom: 10 }}>
          <div style={{ position: "relative", marginBottom: 10 }}>
            <Ikon ad="ara" boy={15} style={{ position: "absolute", left: 12, top: 14, color: C.faint }} />
            <input value={ara} onChange={e => setAra(e.target.value)} placeholder="Ürün ara"
                   style={{ ...inputS, paddingLeft: 36 }} />
            {ara && (
              <button onClick={() => setAra("")} title="Temizle" style={{
                position: "absolute", right: 6, top: 6, minHeight: 32, width: 32, background: "none",
                border: "none", color: C.muted, cursor: "pointer", display: "flex",
                alignItems: "center", justifyContent: "center",
              }}><Ikon ad="kapat" boy={14} /></button>
            )}
          </div>
          <button onClick={() => setSadeceSecili(v => !v)} style={cip(sadeceSecili)}>
            Sadece seçililer{ozet.secili > 0 ? ` (${ozet.secili})` : ""}
          </button>
        </div>

        {/* Yapiskan ozet: kac urun secili ve kac kategori kisitlanmis. */}
        <div style={{
          position: "sticky", top: 0, zIndex: 20, marginBottom: 10,
          background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: "12px 14px",
          boxShadow: "0 6px 16px rgba(0,0,0,0.45)",
        }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 900, fontFamily: hv, lineHeight: 1 }}>
                {ozet.secili} / {ozet.toplam}
              </div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>ürün parti menüsünde</div>
            </div>
            {ozet.tukenen > 0 && (
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 20, fontWeight: 900, fontFamily: hv, lineHeight: 1, color: C.down }}>
                  {ozet.tukenen}
                </div>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>tükendi</div>
              </div>
            )}
          </div>
          {ozet.secili === 0 ? (
            <div style={{ fontSize: 12, color: C.faint, marginTop: 8, lineHeight: 1.5 }}>
              Hiç seçim yok — parti gecesi <b style={{ color: C.ink }}>menünün tamamı</b> görünür.
              Bir ürüne dokunduğun anda o kategoride sadece seçtiklerin kalır.
            </div>
          ) : (
            <div style={{ fontSize: 12, color: C.faint, marginTop: 8, lineHeight: 1.5 }}>
              {ozet.kisitliKategori} kategoride seçim var — parti gecesi o kategorilerde
              sadece seçtiklerin görünür. Seçim yapılmayan kategoriler olduğu gibi kalır.
            </div>
          )}
        </div>

        {gruplar.length === 0 && (
          <div style={{ ...kart, textAlign: "center", padding: 26, color: C.muted, fontSize: 13 }}>
            Bu filtreye uyan ürün yok.
          </div>
        )}

        {gruplar.map(g => (
          <div key={g.id} style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 2px 7px" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 800 }}>{g.ad}</div>
                <div style={{ fontSize: 12, color: g.secili > 0 ? C.up : C.faint, marginTop: 2 }}>
                  {g.secili > 0
                    ? `${g.secili} / ${g.items.length} seçili — parti gecesi sadece bunlar`
                    : `Seçim yok — ${g.items.length} ürünün hepsi görünür`}
                </div>
              </div>
              <button onClick={() => kategoriTopluSec(g.items, g.secili < g.items.length)}
                style={{ ...cip(false), minHeight: 34, fontSize: 11 }}>
                {g.secili < g.items.length ? "Hepsi" : "Temizle"}
              </button>
            </div>

            <div style={{ ...kart, padding: 0, overflow: "hidden" }}>
              {g.items.map((u, i) => {
                const secili = !!u.show_in_party_menu;
                const tukendi = !u.is_available;
                return (
                  <div key={u.id} style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "11px 12px 11px 14px",
                    borderTop: i === 0 ? "none" : `1px solid ${C.line}`,
                    background: secili && !tukendi ? "#1A1A1A" : "transparent",
                    opacity: tukendi ? 0.5 : 1,
                  }}>
                    {/* Satirin govdesi parti secimini degistirir. */}
                    <div onClick={() => !tukendi && degistir(u, "show_in_party_menu", !secili)}
                         style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 10,
                                  cursor: tukendi ? "default" : "pointer" }}>
                      <div style={{
                        width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                        border: `1.6px solid ${secili && !tukendi ? C.accent : C.line}`,
                        background: secili && !tukendi ? C.accent : "transparent",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        {secili && !tukendi && <Ikon ad="onay" boy={13} style={{ color: "#000" }} />}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, overflow: "hidden",
                                      textOverflow: "ellipsis", whiteSpace: "nowrap",
                                      textDecoration: tukendi ? "line-through" : "none" }}>{u.name}</div>
                        <div style={{ fontSize: 12, color: C.faint, marginTop: 1 }}>
                          {fmtTL(u.price)}{tukendi && " · tükendi, menüde yok"}
                        </div>
                      </div>
                    </div>

                    {/* Tukendi: is_available=false — urunu HER menuden kaldirir.
                        Alkol bitince tek dokunus. */}
                    <button onClick={() => degistir(u, "is_available", tukendi)}
                      title={tukendi ? "Tekrar menüye al" : "Tükendi — menüden kaldır"}
                      style={{
                        minHeight: 38, padding: "8px 11px", borderRadius: 9, cursor: "pointer",
                        fontFamily: cv, fontSize: 11, fontWeight: 800, flexShrink: 0,
                        background: "transparent",
                        color: tukendi ? C.up : C.faint,
                        border: `1px solid ${tukendi ? C.up : C.line}`,
                      }}>{tukendi ? "Geri al" : "Tükendi"}</button>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        <div style={{ fontSize: 12, color: C.faint, marginTop: 4, lineHeight: 1.7 }}>
          <b style={{ color: C.muted }}>Seçili</b> = parti gecesi o kategoride sadece seçtiklerin görünür.
          Hiç seçilmemiş kategori olduğu gibi kalır.
          <br />
          <b style={{ color: C.muted }}>Tükendi</b> = ürün her yerden kalkar: parti menüsü, normal menü, kasa.
          Stok gelince "Geri al".
        </div>
      </>)}
    </div>
  );
}
