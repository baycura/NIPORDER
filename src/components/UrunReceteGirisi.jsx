import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase.js";
import { trKucuk } from "../lib/malzemeGrup.js";
import { varsayilanMiktar } from "../lib/recete.js";
import SayiGirisi from "./SayiGirisi.jsx";

// YENI URUN FORMUNDA RECETE (sahip 28.11: "yeni ürün eklerken reçete de
// girebilsin").
//
// Satirlar FORMDA tutulur, veritabanina urunle BIRLIKTE yazilir (Menü
// Yönetimi > saveProd). Urun kaydedilmeden reçete satiri olusmaz; "Iptal"
// hicbir iz birakmaz.
//
// Bilerek DAR:
//   - Yalniz VAR OLAN malzeme secilir. Yeni malzeme acmak (ad, birim, maliyet,
//     stok) yonetici isidir: Reçeteler ve Stok Yönetimi sayfalari.
//   - Maliyet gosterilmez. Bu bolumu "menu_fiyat" ek yetkili personel de
//     gorur; maliyet ekranlari yoneticiye aittir.
//
// value: [{ ingredient_id, name, unit, qty, store_id }]   onChange(yeniListe)
export default function UrunReceteGirisi({ storeId, value, onChange }) {
  const satirlar = value || [];
  const [malzemeler, setMalzemeler] = useState(null);   // null = yukleniyor
  const [hata, setHata] = useState("");
  const [ara, setAra] = useState("");

  useEffect(() => {
    let iptal = false;
    setMalzemeler(null); setHata("");
    if (!storeId) { setMalzemeler([]); return; }
    supabase.from("ingredients").select("id, name, unit, is_consumable").eq("store_id", storeId).order("name")
      .then(({ data, error }) => {
        if (iptal) return;
        if (error) { setHata(error.message || "bağlantı hatası"); setMalzemeler([]); return; }
        setMalzemeler((data || []).slice().sort((a, b) => String(a.name).localeCompare(String(b.name), "tr")));
      });
    return () => { iptal = true; };
  }, [storeId]);

  // MAGAZA DEGISTI (yonetici formda "hangi menude" secimini degistirdi):
  // onceki magazanin malzemeleri bu urunun recetesinde kalmasin; yoksa urun
  // satilinca baska magazanin stogu duserdi.
  useEffect(() => {
    if (satirlar.some(r => r.store_id !== storeId)) onChange(satirlar.filter(r => r.store_id === storeId));
    // Yalniz magaza degisince calisir; satirlar bilerek bagimlilikta degil.
  }, [storeId]);

  const secili = (id) => satirlar.some(r => r.ingredient_id === id);
  const ekle = (ing) => {
    if (secili(ing.id)) return;
    onChange([...satirlar, { ingredient_id: ing.id, name: ing.name, unit: ing.unit, qty: varsayilanMiktar(ing), store_id: storeId }]);
    setAra("");
  };
  const cikar = (id) => onChange(satirlar.filter(r => r.ingredient_id !== id));
  const miktar = (id, v) => onChange(satirlar.map(r => r.ingredient_id === id ? { ...r, qty: v } : r));

  const q = trKucuk(ara.trim());
  const eslesen = q && malzemeler ? malzemeler.filter(i => trKucuk(i.name).includes(q)) : [];
  const sonuc = eslesen.filter(i => !secili(i.id)).slice(0, 12);
  const sarf = (malzemeler || []).filter(i => i.is_consumable);

  return (
    <div>
      <div style={{ fontSize: 12, color: "#8A8580", lineHeight: 1.5, marginBottom: 10 }}>
        Bu ürün satılınca stoktan ne düşer? Malzemeyi ara, seç, bir porsiyonun miktarını yaz.
        Hazır satılan üründe (şişe, kutu, paket) boş bırak.
      </div>

      {malzemeler === null && <div style={{ fontSize: 13, color: "#888", padding: "6px 0" }}>Malzemeler yükleniyor…</div>}
      {hata && <div style={{ fontSize: 13, color: "#C87A6A", padding: "6px 0", lineHeight: 1.5 }}>Malzemeler yüklenemedi: {hata}. Pencereyi kapatıp yeniden aç.</div>}

      {malzemeler !== null && !hata && (
        <>
          <input value={ara} onChange={e => setAra(e.target.value)} aria-label="Malzeme ara"
            placeholder="Malzeme ara: gin, tonik, limon suyu…"
            style={{ width: "100%", padding: "11px 12px", background: "#161616", border: "1px solid #2A2A2A", borderRadius: 8, color: "#F0EDE8", fontSize: 15, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
          {q && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
              {sonuc.map(ing => (
                <button type="button" key={ing.id} onClick={() => ekle(ing)}
                  style={{ padding: "10px 12px", background: "#222", color: "#F0EDE8", border: "1px solid #3A3A3A", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                  + {ing.name} <span style={{ color: "#888", fontWeight: 600 }}>({ing.unit})</span>
                </button>
              ))}
              {sonuc.length === 0 && (
                <div style={{ fontSize: 13, color: "#8A8580", lineHeight: 1.5 }}>
                  {eslesen.length
                    ? "Bu malzeme reçetede var. Miktarını aşağıdan değiştir."
                    : "Bu adla malzeme yok. Yeni malzemeyi yönetici açar; ona yaz."}
                </div>
              )}
            </div>
          )}

          {sarf.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, color: "#888", fontWeight: 600, letterSpacing: "0.2px", marginBottom: 6 }}>SARF (dokun: ekle / çıkar)</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {sarf.map(ing => {
                  const acik = secili(ing.id);
                  return (
                    <button type="button" key={ing.id} aria-pressed={acik} onClick={() => acik ? cikar(ing.id) : ekle(ing)}
                      style={{ padding: "9px 12px", background: acik ? "#2A2A2A" : "#161616", color: acik ? "#F0EDE8" : "#888", border: "1px solid " + (acik ? "#F0EDE8" : "#2A2A2A"), borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                      {acik ? "✓ " : "+ "}{ing.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {satirlar.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 12, color: "#888", fontWeight: 600, letterSpacing: "0.2px", marginBottom: 6 }}>REÇETE ({satirlar.length} MALZEME)</div>
          {satirlar.map(r => (
            <div key={r.ingredient_id} data-recete-satir={r.name}
              style={{ display: "flex", alignItems: "center", gap: 8, background: "#161616", border: "1px solid #2A2A2A", borderRadius: 10, padding: "8px 10px", marginBottom: 6 }}>
              <div style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 700, color: "#F0EDE8", overflowWrap: "anywhere" }}>{r.name}</div>
              <SayiGirisi kip="ondalik" min={0} value={r.qty} onChange={v => miktar(r.ingredient_id, v)}
                aria-label={r.name + " miktarı (" + r.unit + ")"}
                style={{ width: 76, padding: "9px 8px", background: "#0C0C0C", border: "1px solid #3A3A3A", borderRadius: 8, color: "#F0EDE8", fontSize: 15, fontWeight: 700, textAlign: "center", outline: "none", fontFamily: "inherit" }} />
              <span style={{ width: 34, flexShrink: 0, color: "#888", fontSize: 13, fontWeight: 700 }}>{r.unit}</span>
              <button type="button" onClick={() => cikar(r.ingredient_id)} aria-label={r.name + " — reçeteden çıkar"}
                style={{ flexShrink: 0, padding: "9px 10px", background: "transparent", color: "#C87A6A", border: "1px solid #2A2A2A", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Çıkar</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
