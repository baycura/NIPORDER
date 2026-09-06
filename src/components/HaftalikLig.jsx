import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase.js";
import { useAuth } from "../contexts/AuthContext.jsx";
import Ikon from "./Ikon.jsx";

const cv = "'Coolvetica','Bebas Neue',sans-serif";
const cvc = "'Coolvetica Condensed','Barlow Condensed',sans-serif";
const tl = (n) => "₺" + Math.round(Number(n) || 0).toLocaleString("tr-TR");
const gun = (d) => d ? new Date(d + "T00:00:00").toLocaleDateString("tr-TR", { day: "numeric", month: "short" }) : "";

// Haftalik satis ligi — personel kendi arasinda gorsun diye. Kaynak
// nip_haftalik_lig: kalemi kim ekledi (order_items.added_by), yoksa siparisi
// kim acti. Yalniz odenmis hesaplar, ikram sayilmaz. Hafta Pazartesi 00:00
// (Istanbul) baslar. compact: masalar sayfasinda tek satir, dokununca acilir.
export default function HaftalikLig({ compact = false }) {
  const { staffUser } = useAuth();
  const [ofset, setOfset] = useState(0);           // 0 bu hafta, -1 gecen hafta
  const [satirlar, setSatirlar] = useState(null);  // null = yukleniyor
  const [acik, setAcik] = useState(!compact);
  const storeId = staffUser?.store_ids?.[0];

  useEffect(() => {
    if (!storeId) return;
    let iptal = false;
    setSatirlar(null);
    supabase.rpc("nip_haftalik_lig", { p_store_id: storeId, p_hafta_ofset: ofset })
      .then(({ data, error }) => { if (!iptal) setSatirlar(error ? [] : (data || [])); });
    return () => { iptal = true; };
  }, [storeId, ofset]);

  if (!storeId) return null;
  const liste = satirlar || [];
  const benIdx = liste.findIndex(r => r.personel_id === staffUser?.id);
  const lider = liste[0];
  const aralik = lider ? `${gun(lider.hafta_basi)} – ${gun(lider.hafta_sonu)}` : "";

  const chip = (aktif) => ({
    padding: "6px 11px", borderRadius: 20, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: cvc,
    background: aktif ? "#F0EDE8" : "transparent", color: aktif ? "#000" : "#888",
    border: "1px solid " + (aktif ? "#F0EDE8" : "#3A3A3A"),
  });
  const siraRengi = (i) => i === 0 ? "#F0EDE8" : i === 1 ? "#C9C9C4" : i === 2 ? "#A88A6A" : "#555";

  // Kapali (kompakt) hal: tek satir ozet. Bos haftada da gorunur ki lig
  // "yeni haftaya sifirdan basladi" desin.
  if (!acik) {
    return (
      <button onClick={() => setAcik(true)} style={{
        width: "100%", textAlign: "left", background: "#161616", border: "1px solid #2A2A2A", borderRadius: 12,
        padding: "10px 14px", marginBottom: 12, cursor: "pointer", fontFamily: cvc, display: "flex", alignItems: "center", gap: 10,
      }}>
        <Ikon ad="yildiz" boy={15} style={{ color: "#F0EDE8", flexShrink: 0 }} />
        <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: "#aaa", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          <b style={{ color: "#F0EDE8", letterSpacing: "0.4px" }}>HAFTALIK LİG</b>
          {satirlar === null ? " · yükleniyor…"
            : liste.length === 0 ? " · bu hafta henüz satış yok — ilk sen ol"
            : " · " + liste.slice(0, 3).map((r, i) => `${i + 1}. ${(r.personel || "").split(" ")[0]} ${tl(r.ciro)}`).join(" · ")}
        </span>
        {benIdx >= 0 && <span style={{ fontSize: 11, color: "#F0EDE8", fontWeight: 700, flexShrink: 0 }}>sen {benIdx + 1}.</span>}
        <Ikon ad="asagi" boy={13} style={{ color: "#666", flexShrink: 0 }} />
      </button>
    );
  }

  return (
    <div style={{ background: "#161616", border: "1px solid #2A2A2A", borderRadius: 12, padding: "13px 15px", marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <Ikon ad="yildiz" boy={16} style={{ color: "#F0EDE8" }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: "#F0EDE8", fontFamily: cv, fontSize: 17, letterSpacing: "0.3px" }}>Haftalık Lig</div>
          <div style={{ color: "#8A8580", fontFamily: cvc, fontSize: 11 }}>{aralik || "Pazartesi'den bu yana"} · ödenen hesaplar, ikram hariç</div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={() => setOfset(0)} style={chip(ofset === 0)}>Bu hafta</button>
          <button onClick={() => setOfset(-1)} style={chip(ofset === -1)}>Geçen hafta</button>
        </div>
        {compact && (
          <button onClick={() => setAcik(false)} aria-label="Kapat"
            style={{ background: "none", border: "none", color: "#666", cursor: "pointer", padding: 4 }}>
            <Ikon ad="yukari" boy={14} />
          </button>
        )}
      </div>

      {satirlar === null && <div style={{ color: "#888", fontFamily: cvc, fontSize: 12, padding: "10px 0" }}>Yükleniyor…</div>}
      {satirlar !== null && liste.length === 0 && (
        <div style={{ color: "#888", fontFamily: cvc, fontSize: 12, padding: "10px 0" }}>
          {ofset === 0 ? "Bu hafta henüz ödenmiş satış yok. İlk sırayı kapan sen ol." : "Geçen hafta kayıtlı satış yok."}
        </div>
      )}
      {liste.map((r, i) => {
        const ben = r.personel_id === staffUser?.id;
        const pay = lider && Number(lider.ciro) > 0 ? Math.max(4, Math.round(Number(r.ciro) / Number(lider.ciro) * 100)) : 0;
        return (
          <div key={r.personel_id} style={{
            display: "flex", alignItems: "center", gap: 10, padding: "8px 0",
            borderTop: i === 0 ? "none" : "1px solid #222",
          }}>
            <div style={{
              width: 26, height: 26, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
              background: i < 3 ? siraRengi(i) : "transparent", color: i < 3 ? "#000" : "#888",
              border: i < 3 ? "none" : "1px solid #3A3A3A", fontFamily: cv, fontSize: 13, fontWeight: 800,
            }}>{i + 1}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: ben ? "#F0EDE8" : "#ddd", fontFamily: cvc, fontSize: 14, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {r.personel}{ben && <span style={{ marginLeft: 6, fontSize: 10, color: "#000", background: "#F0EDE8", borderRadius: 5, padding: "1px 5px", letterSpacing: "0.4px" }}>SEN</span>}
              </div>
              <div style={{ height: 3, background: "#222", borderRadius: 2, marginTop: 5, overflow: "hidden" }}>
                <div style={{ width: pay + "%", height: "100%", background: ben ? "#F0EDE8" : "#555" }} />
              </div>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ color: "#F0EDE8", fontFamily: cv, fontSize: 17, fontVariantNumeric: "tabular-nums" }}>{tl(r.ciro)}</div>
              <div style={{ color: "#8A8580", fontFamily: cvc, fontSize: 10, fontVariantNumeric: "tabular-nums" }}>{Number(r.adet)} ürün · {r.siparis} hesap</div>
            </div>
          </div>
        );
      })}
      {benIdx > 0 && lider && (
        <div style={{ color: "#8A8580", fontFamily: cvc, fontSize: 11, marginTop: 8 }}>
          Lidere {tl(Number(lider.ciro) - Number(liste[benIdx].ciro))} kaldı.
        </div>
      )}
    </div>
  );
}
