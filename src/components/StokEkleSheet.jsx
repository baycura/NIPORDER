import { useMemo, useState } from "react";
import { supabase } from "../lib/supabase.js";
import { FICI_ML, boySecenekleri, boyYaz, kapAdi } from "../lib/stockCount.js";
import Ikon from "./Ikon.jsx";

// STOK EKLE — "girdigim stogu ekleyebildigim bir dugme"
//
// Stok kutusuna sayi yazmak mevcudun UZERINE yazar (12 varken 6 yazilirsa stok
// 6 olur). Bu sayfa onun yerine FARKI gonderir: sunucuda stok = stok + miktar
// (nip_stok_ekle, satir kilitli). Ekran acikken satis olursa kaybolmaz.
//
// Kalem iki turlu olabilir:
//   { tur:"malzeme", id, ad, birim, stok, pack_qty, kapMl }   -> ingredients
//   { tur:"urun",    id, ad, stok, bedenler:[{name,stock}] }  -> products
//
// KAP ILE GIRIS (kapMl dolu, malzeme hacimle tutuluyor): ekran siseyi/ficiyi
// ADETLE alir, ml'ye kendi cevirir. "50000" ya da "700" yazdirmak hem zor hem
// tehlikeli — bir hane sasan stogu on kat sisiriyordu.
//   * Fici (>= 20 L): her zaman adetle, secim yok.
//   * Sise: varsayilan adet; "ml ile gir" dugmesiyle kayit birimine donulur.
//     Boy cipleri (50/70/100 cl + kayitli boy) elindeki sisenin boyunu secer;
//     ayni cin bazen 70, bazen 100 cl geliyor (sahip, 16.09.2026).
//
// onBitti(sonuc): { kalem, beden, onceki, sonraki, birim } — cagiran sayfa
// listesini tazeler.

const cv = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";
const hv = "'Bebas Neue','Barlow Condensed','Coolvetica Condensed',sans-serif";
const C = { kart: "#161616", cizgi: "#2A2A2A", koyu: "#0C0C0C", ink: "#F0EDE8", soluk: "#8A8580", silik: "#666666", ak: "#FFFFFF", kirmizi: "#C87A6A", yesil: "#7A9E7E" };

// Turkce yazim: "1.234,5" ve "30.000" (otuz bin) ikisi de gelir. Ekrandaki
// sayilar tr-TR bicimiyle basildigi icin kullanici onu taklit ediyor; noktayi
// ondalik sanip 30.000'i 30 diye okumak stok girisini sessizce yanlis yapardi.
const sayiya = (s) => {
  let t = String(s ?? "").trim();
  if (!t) return null;                       // bos kutu 0 degil, "girilmedi"
  if (/[eE]/.test(t)) return null;           // "1e3" gibi yazim kabul edilmez
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};
const fmt = (n) => Number(n || 0).toLocaleString("tr-TR", { maximumFractionDigits: 2 });

export default function StokEkleSheet({ kalem, storeId, ipucu, onKapat, onBitti }) {
  const bedenler = Array.isArray(kalem?.bedenler) ? kalem.bedenler.filter(v => v?.name) : [];
  // Beden ON SECILI GELMEZ: karisik koli gelince 12 adedin tamami yanlislikla
  // ilk bedene yaziliyordu. Once beden secilir, sonra dugme acilir.
  const [beden, setBeden] = useState(null);
  const [yon, setYon] = useState("ekle");          // ekle | dus
  const [miktar, setMiktar] = useState("");
  const [not, setNot] = useState("");
  const [busy, setBusy] = useState(false);
  const [hata, setHata] = useState(null);

  const urunMu = kalem?.tur === "urun";
  const kayitBirim = urunMu ? "adet" : (kalem?.birim || "adet");
  // Kap cevrimi yalniz HACIMLE tutulan malzemede: adetle tutulan sise bira
  // zaten sayilacak seydir, 330'a bolunmez.
  const mlKat = urunMu ? 0 : ({ ml: 1, cl: 10, l: 1000 }[kayitBirim] || 0);
  const kayitliKap = mlKat ? Number(kalem?.kapMl) || 0 : 0;
  const kapVarMi = kayitliKap > 1;
  const ficiMi = kayitliKap >= FICI_ML;
  // SAHIP: "Sise agir alkoller 50, 70, 100 cl'lik versiyonlarla satiliyor;
  // boy secenegi olsun." Elindeki sisenin boyu tek dokunusla degisir; kayitli
  // boy varsayilan, secim yalniz bu girise ait.
  const [boy, setBoy] = useState(kayitliKap);
  // Hacimle tutulan malzemede varsayilan giris KAP ile: 70 cl'lik siseyi
  // "700" diye yazdirmak hem yavas hem hataya acik. ml'ye tek dokunusla donulur.
  const [kapGiris, setKapGiris] = useState(kapVarMi);
  const kapNesne = { unit: kayitBirim, unit_volume_ml: boy || kayitliKap };
  const boylar = kapVarMi ? boySecenekleri({ unit: kayitBirim, unit_volume_ml: kayitliKap }) : [];
  const kapAd = kapAdi(kapNesne);
  const kapli = kapVarMi && kapGiris;
  const kapKayit = kapli ? (Number(boy) || kayitliKap) / mlKat : 1;  // bir kabin kayit birimindeki boyu
  const birim = kapli ? kapAd : kayitBirim;
  const kapYaz = boyYaz(boy || kayitliKap);

  // Gosterilen mevcut: bedenli urunde secili bedenin stogu (secilmeden yok),
  // digerlerinde kalemin kendi stogu. Kap girisinde kap cinsinden.
  const bedenGerekli = bedenler.length > 0;
  const mevcut = useMemo(() => {
    if (bedenGerekli) return beden ? (Number(bedenler.find(v => v.name === beden)?.stock) || 0) : null;
    const t = Number(kalem?.stok) || 0;
    return kapli ? t / kapKayit : t;
  }, [bedenGerekli, bedenler, beden, kalem, kapli, kapKayit]);

  const n = sayiya(miktar);
  const delta = n == null ? null : (yon === "dus" ? -Math.abs(n) : Math.abs(n));
  // Sunucuya giden miktar HER ZAMAN kayit birimindedir (ml), ekran sise gosterse de.
  const deltaTemel = delta == null ? null : (kapli ? delta * kapKayit : delta);
  const sonuc = delta == null || mevcut == null ? null : mevcut + delta;
  // Neden kapali oldugu kullaniciya yazilir; sessiz gri dugme "bozuk" sanilyordu
  const engel = bedenGerekli && !beden ? "Önce beden seç."
    : miktar.trim() && n == null ? "Miktarı rakamla yaz (örnek: 12 ya da 1,5)."
    : delta == null || delta === 0 ? null
    : urunMu && n !== Math.trunc(n) ? "Adet tam sayı olmalı (yarım tişört olmaz)."
    : !urunMu && Math.abs(n) < 0.001 ? "Miktar çok küçük."
    : sonuc != null && sonuc < 0 ? "Sonuç eksiye düşüyor. Sayım farkını düzeltmek için Stok Sayımı'nı kullan."
    : null;
  const gecersiz = delta == null || delta === 0 || !!engel;
  // Kap ile girerken "700" yazan kisi ml sanmis olabilir. Engellemiyoruz —
  // 100 siselik alim olur — ama ne yazdigini yuzune soyluyoruz.
  const kapUyari = kapli && delta != null && Math.abs(delta) > 60;

  // Hizli dokunuslar: koli gelen malzemede once koli, sonra tek tek.
  // Tekrar eden deger elenir (2'li pakette "+2" iki kere ciziliyordu).
  const kisayollar = useMemo(() => {
    if (kapli) return ficiMi ? [1, 2, 4] : [1, 2, 6, 12];  // kap tek tek ya da koli gelir
    const paket = Number(kalem?.pack_qty) || 1;
    const temel = urunMu ? [1, 2, 5, 10] : [1, 2, 6, 12];
    const ham = paket > 1 ? [paket, paket * 2, ...temel] : temel;
    return [...new Set(ham)].slice(0, 4);
  }, [kalem?.pack_qty, urunMu, kapli, ficiMi]);

  const ekleKisayol = (v) => setMiktar(String((sayiya(miktar) || 0) + v));

  const kaydet = async () => {
    if (busy || gecersiz) return;
    setBusy(true); setHata(null);
    const satir = urunMu
      ? { product_id: kalem.id, variant: beden || null, miktar: deltaTemel }
      : { ingredient_id: kalem.id, miktar: deltaTemel };
    // Kalem kendi magazasini tasir: iki magazali yoneticide liste iki magazadan
    // gelirken sayfanin ilk magazasi gonderilse "bulunamadi" hatasi duserdi.
    const { data, error } = await supabase.rpc("nip_stok_ekle", {
      p_store_id: kalem.storeId || storeId,
      p_kalemler: [satir],
      p_not: not.trim() || null,
    });
    setBusy(false);
    if (error) { setHata(error.message.replace(/^.*?stok girisi: /, "")); return; }
    const s = Array.isArray(data) ? data[0] : data;
    if (navigator.vibrate) navigator.vibrate(12);
    // Kalemin kimligi de donuyor: cagiran sayfa "Geri al" gosterebilsin.
    // delta KAYIT biriminde gider: "Geri al" ayni miktari ters yonde yollar.
    // Fici girisinde onay seridi de fici yazsin — ml gormek icin girmedik.
    const ozet = s || { kalem: kalem.ad, beden, onceki: mevcut, sonraki: sonuc, birim };
    onBitti?.({
      ...ozet,
      ...(kapli ? { onceki: mevcut, sonraki: sonuc, birim: kapAd } : null),
      tur: kalem.tur, id: kalem.id, storeId: kalem.storeId || storeId, delta: deltaTemel,
    });
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

  // Kayit giderken kapanmasin: kapanirsa RPC sunucuda tamamlanir ama ekran
  // eski sayiyi gosterir, kullanici "gitmemis" deyip ayni mali ikinci kez girer.
  const kapat = () => { if (!busy) onKapat?.(); };

  return (
    <div onClick={kapat} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.78)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 130 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.kart, border: `1px solid ${C.cizgi}`, borderRadius: "16px 16px 0 0", padding: 20, paddingBottom: 26, width: "100%", maxWidth: 500, maxHeight: "92vh", overflowY: "auto", fontFamily: cv, color: C.ink }}>

        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 14 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 800, lineHeight: 1.25 }}>{kalem?.ad}</div>
            <div style={{ fontSize: 12, color: C.soluk, marginTop: 3 }}>
              {mevcut == null
                ? "Beden seç"
                : <>Rafta <b style={{ color: C.ink }}>{fmt(mevcut)}</b> {birim}{beden ? ` · ${beden}` : ""}
                   {kapli ? ` · 1 ${kapAd} = ${kapYaz}` : ""}</>}
            </div>
          </div>
          <button onClick={kapat} aria-label="Kapat" disabled={busy} style={{ background: "transparent", border: "none", color: C.soluk, cursor: busy ? "default" : "pointer", padding: 4, flexShrink: 0, opacity: busy ? 0.4 : 1 }}>
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

        {/* NE ILE GIRIYORSUN: sise mi, mililitre mi. Hacimle tutulan malzemede
            varsayilan sise — 70 cl'lik siseyi "700" diye yazdirmak yavas ve
            hataya acik. Fici zaten hep adetle girilir, secim cikmaz. */}
        {kapVarMi && !ficiMi && (
          <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
            {[[true, kapAd], [false, kayitBirim]].map(([k, etiket]) => (
              <button key={String(k)} onClick={() => { setKapGiris(k); setMiktar(""); setHata(null); }}
                style={{ flex: 1, padding: "9px 10px", minHeight: 40, borderRadius: 9, cursor: "pointer", fontFamily: cv, fontSize: 12, fontWeight: 700,
                  background: kapGiris === k ? "#2A2A2A" : "transparent",
                  color: kapGiris === k ? C.ink : C.silik,
                  border: `1px solid ${kapGiris === k ? "#555" : C.cizgi}` }}>
                {etiket} ile gir
              </button>
            ))}
          </div>
        )}

        {/* BOY: ayni cin bazen 70, bazen 100 cl gelir. Secim yalniz bu girise
            ait; malzemenin kayitli boyu degismez. */}
        {kapli && boylar.length > 1 && (
          <div style={{ marginBottom: 12 }}>
            <div style={etiketS}>ELİNDEKİ {kapAd.toLocaleUpperCase("tr-TR")} KAÇ CL?</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {boylar.map(ml => (
                <button key={ml} onClick={() => setBoy(ml)}
                  style={{ padding: "9px 13px", minHeight: 40, borderRadius: 9, cursor: "pointer", fontFamily: cv, fontSize: 12, fontWeight: 700,
                    background: (boy || kayitliKap) === ml ? C.ak : "transparent",
                    color: (boy || kayitliKap) === ml ? "#000" : C.soluk,
                    border: `1px solid ${(boy || kayitliKap) === ml ? C.ak : C.cizgi}` }}>
                  {boyYaz(ml)}
                </button>
              ))}
            </div>
          </div>
        )}

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
          <span style={{ fontFamily: hv, fontSize: 26, color: C.soluk, fontVariantNumeric: "tabular-nums" }}>{mevcut == null ? "—" : fmt(mevcut)}</span>
          <Ikon ad="oksag" boy={16} style={{ color: C.silik }} />
          <span style={{ fontFamily: hv, fontSize: 32, fontWeight: 900, color: sonuc == null ? C.silik : yon === "dus" ? C.kirmizi : C.ak, fontVariantNumeric: "tabular-nums" }}>
            {sonuc == null ? "—" : fmt(sonuc)}
          </span>
          <span style={{ fontSize: 12, color: C.soluk }}>{birim}</span>
        </div>

        {/* Ficide ne yazildigi acikta dursun: defterde ml gorulecek, ekranda
            fici yazdik — ikisinin bagini kullanici da gorsun. */}
        {kapli && deltaTemel != null && deltaTemel !== 0 && (
          <div style={{ fontSize: 12, color: kapUyari ? C.kirmizi : C.silik, textAlign: "center", marginTop: -6, marginBottom: 12, lineHeight: 1.6 }}>
            {fmt(Math.abs(delta))} × {kapYaz} = {fmt(Math.abs(deltaTemel))} {kayitBirim}
            {" "}stoğa {yon === "dus" ? "düşülecek" : "eklenecek"}
            {kapUyari && (<><br/>
              <b>{fmt(Math.abs(delta))} {kapAd}</b> mi giriyorsun? {kayitBirim} yazmak istiyorsan
              “{kayitBirim} ile gir”e dokun.
            </>)}
          </div>
        )}

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
        {engel && (
          <div style={{ fontSize: 12, color: C.kirmizi, lineHeight: 1.6, marginBottom: 12 }}>{engel}</div>
        )}
        {hata && (
          <div style={{ fontSize: 13, color: C.kirmizi, lineHeight: 1.6, marginBottom: 12, display: "flex", gap: 7 }}>
            <Ikon ad="uyari" boy={14} style={{ flexShrink: 0, marginTop: 2 }} />{hata}
          </div>
        )}

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={kapat} disabled={busy} style={{ flex: 1, padding: 14, minHeight: 50, background: "transparent", color: C.soluk, border: `1px solid ${C.cizgi}`, borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: busy ? "default" : "pointer", fontFamily: cv, opacity: busy ? 0.5 : 1 }}>İptal</button>
          <button onClick={kaydet} disabled={busy || gecersiz}
            style={{ flex: 2, padding: 14, minHeight: 50, background: gecersiz ? "#333" : C.ak, color: gecersiz ? C.silik : "#000", border: "none", borderRadius: 10, fontSize: 15, fontWeight: 800, cursor: gecersiz ? "default" : "pointer", fontFamily: cv, opacity: busy ? 0.6 : 1 }}>
            {busy ? "..." : yon === "dus" ? "Düş" : "Stoğa ekle"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Yanlis rakam tek dokunusla yaziliyordu; onay seridindeki "Geri al" ayni
// miktari ters yonde gonderir (defterde iki satir kalir, iz kaybolmaz).
export async function stokGeriAl(giris) {
  if (!giris?.id || !giris?.delta) return { error: { message: "geri alinacak kayit yok" } };
  const satir = giris.tur === "urun"
    ? { product_id: giris.id, variant: giris.beden || null, miktar: -giris.delta }
    : { ingredient_id: giris.id, miktar: -giris.delta };
  const { data, error } = await supabase.rpc("nip_stok_ekle", {
    p_store_id: giris.storeId,
    p_kalemler: [satir],
    p_not: "geri alındı",
  });
  return { sonuc: Array.isArray(data) ? data[0] : data, error };
}

const etiketS = { fontSize: 12, color: "#8A8580", letterSpacing: "0.2px", fontWeight: 600, marginBottom: 6 };
const adimBtn = {
  width: 52, height: 52, flexShrink: 0, background: "#0C0C0C", border: "1px solid #2A2A2A", borderRadius: 10,
  color: "#F0EDE8", fontSize: 24, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", lineHeight: 1,
};
