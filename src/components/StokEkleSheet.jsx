import { useMemo, useState } from "react";
import { supabase } from "../lib/supabase.js";
import Ikon from "./Ikon.jsx";

// STOK EKLE — "girdigim stogu ekleyebildigim bir dugme"
//
// Stok kutusuna sayi yazmak mevcudun UZERINE yazar (12 varken 6 yazilirsa stok
// 6 olur). Bu sayfa onun yerine FARKI gonderir: sunucuda stok = stok + miktar
// (nip_stok_ekle, satir kilitli). Ekran acikken satis olursa kaybolmaz.
//
// Kalem iki turlu olabilir:
//   { tur:"malzeme", id, ad, birim, stok, pack_qty }          -> ingredients
//   { tur:"urun",    id, ad, stok, bedenler:[{name,stock}] }  -> products
//
// onBitti(sonuc): { kalem, beden, onceki, sonraki, birim } — cagiran sayfa
// listesini tazeler.

const cv = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";
const hv = "'Bebas Neue','Barlow Condensed','Coolvetica Condensed',sans-serif";
const C = { kart: "#161616", cizgi: "#2A2A2A", koyu: "#0C0C0C", ink: "#F0EDE8", soluk: "#8A8580", silik: "#666666", ak: "#FFFFFF", kirmizi: "#C87A6A", yesil: "#7A9E7E" };

const sayiya = (s) => {
  const t = String(s ?? "").replace(",", ".").trim();
  if (!t) return null;                       // bos kutu 0 degil, "girilmedi"
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};
const fmt = (n) => Number(n || 0).toLocaleString("tr-TR", { maximumFractionDigits: 2 });

export default function StokEkleSheet({ kalem, storeId, ipucu, onKapat, onBitti }) {
  const bedenler = Array.isArray(kalem?.bedenler) ? kalem.bedenler.filter(v => v?.name) : [];
  const [beden, setBeden] = useState(bedenler[0]?.name || null);
  const [yon, setYon] = useState("ekle");          // ekle | dus
  const [miktar, setMiktar] = useState("");
  const [not, setNot] = useState("");
  const [busy, setBusy] = useState(false);
  const [hata, setHata] = useState(null);

  const urunMu = kalem?.tur === "urun";
  const birim = urunMu ? "adet" : (kalem?.birim || "adet");

  // Gosterilen mevcut: bedenli urunde secili bedenin stogu, digerlerinde kalemin
  const mevcut = useMemo(() => {
    if (bedenler.length) return Number(bedenler.find(v => v.name === beden)?.stock) || 0;
    return Number(kalem?.stok) || 0;
  }, [bedenler, beden, kalem]);

  const n = sayiya(miktar);
  const delta = n == null ? null : (yon === "dus" ? -Math.abs(n) : Math.abs(n));
  const sonuc = delta == null ? null : mevcut + delta;
  const gecersiz = delta == null || delta === 0 || (urunMu && n !== Math.trunc(n)) || (sonuc != null && sonuc < 0);

  // Hizli dokunuslar: koli gelen malzemede once koli, sonra tek tek
  const kisayollar = useMemo(() => {
    const paket = Number(kalem?.pack_qty) || 1;
    const temel = urunMu ? [1, 2, 5, 10] : [1, 2, 6, 12];
    return paket > 1 ? [paket, paket * 2, ...temel.slice(0, 2)] : temel;
  }, [kalem?.pack_qty, urunMu]);

  const ekleKisayol = (v) => setMiktar(String((sayiya(miktar) || 0) + v));

  const kaydet = async () => {
    if (busy || gecersiz) return;
    setBusy(true); setHata(null);
    const satir = urunMu
      ? { product_id: kalem.id, variant: beden || null, miktar: delta }
      : { ingredient_id: kalem.id, miktar: delta };
    const { data, error } = await supabase.rpc("nip_stok_ekle", {
      p_store_id: storeId,
      p_kalemler: [satir],
      p_not: not.trim() || null,
    });
    setBusy(false);
    if (error) { setHata(error.message.replace(/^.*?stok girisi: /, "")); return; }
    const s = Array.isArray(data) ? data[0] : data;
    if (navigator.vibrate) navigator.vibrate(12);
    onBitti?.(s || { kalem: kalem.ad, beden, onceki: mevcut, sonraki: sonuc, birim });
  };

  const yonBtn = (k, etiket) => (
    <button key={k} onClick={() => { setYon(k); setHata(null); }}
      style={{ flex: 1, padding: "12px 10px", minHeight: 46, borderRadius: 10, cursor: "pointer", fontFamily: cv, fontSize: 14, fontWeight: 800,
        background: yon === k ? (k === "dus" ? C.kirmizi : C.ak) : "transparent",
        color: yon === k ? "#000" : C.soluk,
        border: `1px solid ${yon === k ? (k === "dus" ? C.kirmizi : C.ak) : C.cizgi}` }}>
      {etiket}
    </button>
  );

  return (
    <div onClick={onKapat} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.78)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 130 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.kart, border: `1px solid ${C.cizgi}`, borderRadius: "16px 16px 0 0", padding: 20, paddingBottom: 26, width: "100%", maxWidth: 500, maxHeight: "92vh", overflowY: "auto", fontFamily: cv, color: C.ink }}>

        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 14 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 800, lineHeight: 1.25 }}>{kalem?.ad}</div>
            <div style={{ fontSize: 12, color: C.soluk, marginTop: 3 }}>
              Rafta <b style={{ color: C.ink }}>{fmt(mevcut)}</b> {birim}{bedenler.length ? ` · ${beden}` : ""}
            </div>
          </div>
          <button onClick={onKapat} aria-label="Kapat" style={{ background: "transparent", border: "none", color: C.soluk, cursor: "pointer", padding: 4, flexShrink: 0 }}>
            <Ikon ad="kapat" boy={18} />
          </button>
        </div>

        {bedenler.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={etiketS}>BEDEN</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {bedenler.map(v => (
                <button key={v.name} onClick={() => { setBeden(v.name); setHata(null); }}
                  style={{ padding: "10px 14px", minHeight: 44, borderRadius: 9, cursor: "pointer", fontFamily: cv, fontSize: 13, fontWeight: 700,
                    background: beden === v.name ? C.ak : "transparent", color: beden === v.name ? "#000" : C.soluk,
                    border: `1px solid ${beden === v.name ? C.ak : C.cizgi}` }}>
                  {v.name} <span style={{ opacity: 0.7 }}>{Math.max(0, Number(v.stock) || 0)}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          {yonBtn("ekle", "+ Stoğa ekle")}
          {yonBtn("dus", "− Stoktan düş")}
        </div>

        <div style={etiketS}>{yon === "dus" ? "DÜŞÜLECEK" : "EKLENECEK"} MİKTAR ({birim})</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
          <button onClick={() => setMiktar(String(Math.max(0, (sayiya(miktar) || 0) - 1)))} style={adimBtn}>−</button>
          <input value={miktar} onChange={e => { setMiktar(e.target.value); setHata(null); }} autoFocus
            inputMode={urunMu ? "numeric" : "decimal"} placeholder="0"
            style={{ flex: 1, minWidth: 0, padding: "14px 12px", background: C.koyu, border: `1px solid ${C.cizgi}`, borderRadius: 10, color: C.ink,
              fontFamily: hv, fontSize: 30, fontWeight: 900, textAlign: "center", outline: "none", letterSpacing: 1 }} />
          <button onClick={() => ekleKisayol(1)} style={adimBtn}>+</button>
        </div>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
          {kisayollar.map((v, i) => (
            <button key={v + "-" + i} onClick={() => ekleKisayol(v)}
              style={{ padding: "9px 13px", minHeight: 40, borderRadius: 9, cursor: "pointer", fontFamily: cv, fontSize: 12, fontWeight: 700,
                background: "transparent", color: C.soluk, border: `1px solid ${C.cizgi}` }}>
              +{v}{Number(kalem?.pack_qty) > 1 && v % Number(kalem.pack_qty) === 0 ? ` (${v / Number(kalem.pack_qty)} koli)` : ""}
            </button>
          ))}
          {miktar !== "" && (
            <button onClick={() => setMiktar("")} style={{ padding: "9px 13px", minHeight: 40, borderRadius: 9, cursor: "pointer", fontFamily: cv, fontSize: 12, fontWeight: 700, background: "transparent", color: C.silik, border: `1px solid ${C.cizgi}` }}>Sıfırla</button>
          )}
        </div>

        <div style={{ background: C.koyu, border: `1px solid ${C.cizgi}`, borderRadius: 10, padding: "12px 14px", marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
          <span style={{ fontFamily: hv, fontSize: 26, color: C.soluk, fontVariantNumeric: "tabular-nums" }}>{fmt(mevcut)}</span>
          <Ikon ad="oksag" boy={16} style={{ color: C.silik }} />
          <span style={{ fontFamily: hv, fontSize: 32, fontWeight: 900, color: sonuc == null ? C.silik : yon === "dus" ? C.kirmizi : C.ak, fontVariantNumeric: "tabular-nums" }}>
            {sonuc == null ? "—" : fmt(sonuc)}
          </span>
          <span style={{ fontSize: 12, color: C.soluk }}>{birim}</span>
        </div>

        <input value={not} onChange={e => setNot(e.target.value)} placeholder="Not (irsaliye no, tedarikçi, kırılan…)"
          style={{ width: "100%", boxSizing: "border-box", padding: "11px 12px", background: C.koyu, border: `1px solid ${C.cizgi}`, borderRadius: 9, color: C.ink, fontFamily: cv, fontSize: 14, outline: "none", marginBottom: 12 }} />

        {kalem?.takipsiz && (
          <div style={{ fontSize: 12, color: C.soluk, lineHeight: 1.6, marginBottom: 12 }}>
            Bu ürün stok takipsizdi. Giriş yapınca takip açılır, satışta stoktan düşer.
          </div>
        )}
        {ipucu && (
          <div style={{ fontSize: 12, color: C.silik, lineHeight: 1.6, marginBottom: 12 }}>{ipucu}</div>
        )}
        {sonuc != null && sonuc < 0 && (
          <div style={{ fontSize: 12, color: C.kirmizi, lineHeight: 1.6, marginBottom: 12 }}>
            Sonuç eksiye düşüyor. Sayım farkını düzeltmek için Stok Sayımı'nı kullan.
          </div>
        )}
        {hata && (
          <div style={{ fontSize: 13, color: C.kirmizi, lineHeight: 1.6, marginBottom: 12, display: "flex", gap: 7 }}>
            <Ikon ad="uyari" boy={14} style={{ flexShrink: 0, marginTop: 2 }} />{hata}
          </div>
        )}

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onKapat} style={{ flex: 1, padding: 14, minHeight: 50, background: "transparent", color: C.soluk, border: `1px solid ${C.cizgi}`, borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: cv }}>İptal</button>
          <button onClick={kaydet} disabled={busy || gecersiz}
            style={{ flex: 2, padding: 14, minHeight: 50, background: gecersiz ? "#333" : C.ak, color: gecersiz ? C.silik : "#000", border: "none", borderRadius: 10, fontSize: 15, fontWeight: 800, cursor: gecersiz ? "default" : "pointer", fontFamily: cv, opacity: busy ? 0.6 : 1 }}>
            {busy ? "..." : yon === "dus" ? "Düş" : "Stoğa ekle"}
          </button>
        </div>
      </div>
    </div>
  );
}

const etiketS = { fontSize: 12, color: "#8A8580", letterSpacing: "0.2px", fontWeight: 600, marginBottom: 6 };
const adimBtn = {
  width: 52, height: 52, flexShrink: 0, background: "#0C0C0C", border: "1px solid #2A2A2A", borderRadius: 10,
  color: "#F0EDE8", fontSize: 24, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", lineHeight: 1,
};
