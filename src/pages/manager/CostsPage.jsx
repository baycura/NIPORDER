import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase.js";
import { useAuth } from "../../contexts/AuthContext.jsx";
import Ikon from "../../components/Ikon.jsx";

const cv = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";
const hv = "'Bebas Neue','Barlow Condensed','Coolvetica Condensed',sans-serif";

const C = {
  card: "#161616", line: "#2A2A2A", ink: "#F0EDE8", muted: "#8A8A86",
  faint: "#666666", accent: "#FFFFFF", down: "#C87A6A",
};

const fmtTL = (n) => "₺" + Number(n || 0).toLocaleString("tr-TR", { maximumFractionDigits: 0 });

// Eksik Maliyetler — maliyeti girilmemis her sey tek listede.
//
// Bu ekran olmadan ayni isi yapmak icin Stok Yonetimi ile Menu Yonetimi
// arasinda gidip gelmek, hangi kaydin eksik oldugunu da kendin bulmak
// gerekiyordu. Liste dokundugu CIROYA gore sirali: en cok parayi etkileyen
// eksik en ustte.
export default function CostsPage() {
  const { staffUser } = useAuth();
  const storeIds = staffUser?.store_ids || [];
  const [stores, setStores] = useState([]);
  const [storeId, setStoreId] = useState(null);
  const [satirlar, setSatirlar] = useState(null);
  const [hata, setHata] = useState(null);
  const [degerler, setDegerler] = useState({});
  const [kaydedilen, setKaydedilen] = useState({});
  const [busy, setBusy] = useState(null);

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
    setSatirlar(null); setHata(null);
    supabase.rpc("eksik_maliyetler", { p_store_id: storeId }).then(({ data, error }) => {
      if (error) { setHata(error.message); setSatirlar([]); return; }
      setSatirlar(data || []);
    });
  };
  useEffect(yukle, [storeId]);

  const kaydet = async (r) => {
    const ham = degerler[r.kayit_id];
    const deger = Number(ham);
    if (!ham || !isFinite(deger) || deger <= 0) { alert("Sıfırdan büyük bir tutar gir"); return; }
    setBusy(r.kayit_id);
    const { error } = r.tip === "malzeme"
      ? await supabase.from("ingredients").update({ cost_per_unit: deger }).eq("id", r.kayit_id)
      : await supabase.from("products").update({ cost_price: deger }).eq("id", r.kayit_id);
    setBusy(null);
    if (error) { alert("Kaydedilemedi: " + error.message); return; }
    // Satiri listeden dusurmuyoruz — girilen rakam ekranda kalsin ki yanlis
    // yazdiysan gorup duzeltebilesin. Yenile'ye basinca liste tazelenir.
    setKaydedilen(k => ({ ...k, [r.kayit_id]: deger }));
  };

  const ozet = useMemo(() => {
    const s = satirlar || [];
    const kalan = s.filter(r => !kaydedilen[r.kayit_id]);
    return {
      toplam: s.length,
      kalan: kalan.length,
      ciro: kalan.reduce((t, r) => t + Number(r.ciro || 0), 0),
      girilen: Object.keys(kaydedilen).length,
    };
  }, [satirlar, kaydedilen]);

  const kart = { background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: 14 };
  const etiket = { fontSize: 12, color: C.muted, letterSpacing: "0.2px", fontWeight: 600 };

  return (
    <div style={{ fontFamily: cv, color: C.ink, maxWidth: 720, margin: "0 auto", paddingBottom: 60 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontSize: 24, fontWeight: 800 }}>Eksik Maliyetler</div>
        <button onClick={yukle} title="Yenile" style={{
          minHeight: 40, padding: "8px 12px", background: "none", border: `1px solid ${C.line}`,
          color: C.muted, borderRadius: 9, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6,
          fontFamily: cv, fontSize: 12, fontWeight: 700,
        }}><Ikon ad="yenile" boy={13} />Yenile</button>
      </div>

      <div style={{ fontSize: 13, color: C.muted, margin: "6px 0 14px", lineHeight: 1.6, maxWidth: "58ch" }}>
        Maliyeti girilmemiş malzeme ve ürünler, dokundukları ciroya göre sıralı.
        Reçetesi olan ürünün maliyeti malzemelerinden hesaplanır; reçetesi olmayan
        ürüne alış fiyatı girilir.
      </div>

      {stores.length > 1 && (
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          {stores.map(s => (
            <button key={s.id} onClick={() => setStoreId(s.id)} style={{
              minHeight: 40, padding: "9px 14px", borderRadius: 9, cursor: "pointer", fontFamily: cv,
              fontSize: 12, fontWeight: 700,
              background: storeId === s.id ? C.accent : "transparent",
              color: storeId === s.id ? "#000" : C.muted,
              border: `1px solid ${storeId === s.id ? C.accent : C.line}`,
            }}>{s.name}</button>
          ))}
        </div>
      )}

      {hata && (
        <div style={{ ...kart, borderColor: C.down, color: C.down, fontSize: 13 }}>
          <Ikon ad="uyari" boy={15} style={{ marginRight: 6 }} />{hata}
        </div>
      )}

      {satirlar === null && !hata && (
        <div style={{ ...kart, color: C.muted, fontSize: 13 }}>Yükleniyor…</div>
      )}

      {satirlar && satirlar.length === 0 && !hata && (
        <div style={{ ...kart, textAlign: "center", padding: 40 }}>
          <Ikon ad="onayli" boy={40} kalin={1.3} style={{ display: "block", margin: "0 auto 12px" }} />
          <div style={{ fontSize: 15, fontWeight: 700 }}>Eksik maliyet yok</div>
          <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>
            Bu mağazadaki her malzeme ve ürünün maliyeti girilmiş.
          </div>
        </div>
      )}

      {satirlar && satirlar.length > 0 && (<>
        <div style={{ ...kart, marginBottom: 10 }}>
          <div style={etiket}>Maliyeti bilinmeyen ciro</div>
          <div style={{ fontSize: 40, fontWeight: 900, fontFamily: hv, lineHeight: 1, margin: "6px 0 4px" }}>
            {fmtTL(ozet.ciro)}
          </div>
          <div style={{ fontSize: 13, color: C.muted }}>
            {ozet.kalan} kayıt bekliyor
            {ozet.girilen > 0 && <> · bu oturumda {ozet.girilen} tanesi girildi</>}
          </div>
        </div>

        <div style={{ ...kart, padding: 0, overflow: "hidden" }}>
          {satirlar.map((r, i) => {
            const bitti = kaydedilen[r.kayit_id];
            return (
              <div key={r.kayit_id} style={{
                padding: "12px 14px", borderTop: i === 0 ? "none" : `1px solid ${C.line}`,
                opacity: bitti ? 0.55 : 1,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{
                    fontSize: 11, fontWeight: 700, letterSpacing: "0.2px", padding: "2px 7px",
                    borderRadius: 5, background: "#222", color: C.muted, flexShrink: 0,
                  }}>{r.tip === "malzeme" ? "MALZEME" : "ÜRÜN"}</span>
                  <span style={{ fontSize: 15, fontWeight: 700, flex: 1, minWidth: 0 }}>{r.ad}</span>
                  {Number(r.ciro) > 0 && (
                    <span style={{ fontSize: 13, color: C.ink, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                      {fmtTL(r.ciro)}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: C.faint, margin: "3px 0 9px" }}>
                  {r.alt}
                  {r.nerede && <> · {r.nerede}</>}
                  {Number(r.adet) > 0 && <> · {Number(r.adet)} satıldı</>}
                </div>

                {bitti ? (
                  <div style={{ fontSize: 13, color: C.ink, display: "flex", alignItems: "center", gap: 6 }}>
                    <Ikon ad="onay" boy={14} />
                    {r.tip === "malzeme" ? "Birim maliyet" : "Alış fiyatı"} ₺{bitti} olarak kaydedildi
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <input
                      type="number" inputMode="decimal" min="0" step="0.01"
                      value={degerler[r.kayit_id] ?? ""}
                      onChange={e => setDegerler(d => ({ ...d, [r.kayit_id]: e.target.value }))}
                      onKeyDown={e => { if (e.key === "Enter") kaydet(r); }}
                      placeholder={r.tip === "malzeme" ? `₺ / ${r.alt}` : "₺ / adet"}
                      style={{
                        flex: 1, minWidth: 0, minHeight: 44, padding: "10px 12px", background: "#0C0C0C",
                        border: `1px solid ${C.line}`, borderRadius: 10, color: C.ink, fontSize: 16,
                        outline: "none", fontFamily: cv, boxSizing: "border-box",
                      }} />
                    <button onClick={() => kaydet(r)} disabled={busy === r.kayit_id} style={{
                      minHeight: 44, padding: "10px 18px", background: C.accent, color: "#000", border: "none",
                      borderRadius: 10, fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: cv,
                      opacity: busy === r.kayit_id ? 0.6 : 1, flexShrink: 0,
                    }}>Kaydet</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ fontSize: 12, color: C.faint, marginTop: 12, lineHeight: 1.7 }}>
          Malzemede birim maliyet, o malzemenin kendi biriminden bir tanesinin fiyatıdır —
          100'lük paket aldıysan paket fiyatını 100'e böl. Ürün alış fiyatı bir adedin
          sana maliyetidir. Girilen rakam kârlılık raporuna anında yansır.
        </div>
      </>)}
    </div>
  );
}
