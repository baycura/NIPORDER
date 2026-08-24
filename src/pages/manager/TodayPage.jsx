import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase.js";
import { useAuth } from "../../contexts/AuthContext.jsx";
import { businessDayStart, businessDayKey, BUSINESS_HOURS } from "../../lib/businessDay.js";

const cv = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";
const BAYAT_SAAT = 12;

// "Bugun": yonetici/sahibin acilis ekrani. Gece 03:00'teki Telegram ozetinin
// gun icinde canli hali — ciro, acik hesap, vardiya, unutulmus hesap, cok satan.
// Ciro TAHSILAT'tir: puanla odenen kisim (points_used) dusulur; yoksa cuzdan
// kullanan uyelerin siparisleri kasada olmayan parayi ciro gibi gosterirdi.
export default function TodayPage() {
  const { staffUser, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [veri, setVeri] = useState(null);

  useEffect(() => {
    let iptal = false;
    const yukle = async () => {
      const start = businessDayStart().toISOString();
      const storeIds = staffUser?.store_ids?.length ? staffUser.store_ids : ["00000000-0000-0000-0000-000000000000"];

      const [{ data: paid }, { data: acik }, { data: vardiyalar }] = await Promise.all([
        supabase.from("orders")
          .select("id,total,points_used,created_at,order_items(quantity,product_name)")
          .in("origin_store_id", storeIds).eq("status", "paid").gte("created_at", start),
        supabase.from("orders")
          .select("id,total,created_at,table_id,customer_name,cafe_tables:table_id(name)")
          .in("origin_store_id", storeIds).in("status", ["open", "sent", "preparing", "ready"]),
        supabase.from("shifts").select("staff_id,checked_in_at")
          .eq("date", businessDayKey(new Date())).eq("status", "active"),
      ]);

      // Vardiyadakilerin adlari (FK iliskisine guvenmeden iki adim)
      let vardiyaAd = [];
      if (vardiyalar?.length) {
        const { data: kisiler } = await supabase.from("staff").select("id,name")
          .in("id", vardiyalar.map(v => v.staff_id));
        vardiyaAd = (vardiyalar || []).map(v => ({
          ad: kisiler?.find(k => k.id === v.staff_id)?.name || "?",
          giris: v.checked_in_at,
        }));
      }

      const ciro = (paid || []).reduce((t, o) => t + Number(o.total || 0) - Number(o.points_used || 0), 0);

      const saatlik = Object.fromEntries(BUSINESS_HOURS.map(h => [h, 0]));
      (paid || []).forEach(o => {
        const h = new Date(o.created_at).getHours();
        if (h in saatlik) saatlik[h] += Number(o.total || 0) - Number(o.points_used || 0);
      });

      const adetler = {};
      (paid || []).forEach(o => (o.order_items || []).forEach(oi => {
        const ad = oi.product_name || "?";
        adetler[ad] = (adetler[ad] || 0) + Number(oi.quantity || 0);
      }));
      const cokSatan = Object.entries(adetler).sort((a, b) => b[1] - a[1]).slice(0, 3);

      const simdi = Date.now();
      const unutulmus = (acik || []).filter(o => simdi - new Date(o.created_at).getTime() > BAYAT_SAAT * 3600 * 1000);

      if (!iptal) {
        setVeri({
          ciro, saatlik,
          siparisSayisi: (paid || []).length,
          acikSayi: (acik || []).length,
          acikTutar: (acik || []).reduce((t, o) => t + Number(o.total || 0), 0),
          vardiyaAd, cokSatan, unutulmus,
        });
        setLoading(false);
      }
    };
    yukle();
    const iv = setInterval(yukle, 60000); // dakikada bir tazelenir; realtime sart degil
    return () => { iptal = true; clearInterval(iv); };
  }, [staffUser?.store_ids]);

  if (loading) return (<div style={{ color: "#888", fontFamily: cv, padding: 20 }}>Yükleniyor...</div>);

  const maxSaat = Math.max(1, ...Object.values(veri.saatlik));
  const enYogun = Object.entries(veri.saatlik).sort((a, b) => b[1] - a[1])[0];

  const Kart = ({ baslik, cocuk, tikla }) => (
    <div onClick={tikla} style={{ background: "#161616", border: "1px solid #2A2A2A", borderRadius: 14,
                                  padding: "13px 15px", cursor: tikla ? "pointer" : "default", flex: 1 }}>
      <div style={{ fontSize: 10, letterSpacing: "1.6px", color: "#8A8580", fontWeight: 700, marginBottom: 4 }}>{baslik}</div>
      {cocuk}
    </div>
  );

  const gun = new Date().toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div style={{ fontFamily: cv, color: "#F0EDE8", maxWidth: 560, margin: "0 auto",
                  display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div style={{ fontSize: 22, fontWeight: 800 }}>Bugün</div>
        <div style={{ fontSize: 11, color: "#8A8580" }}>{gun} · gün 03:00'te biter</div>
      </div>

      <Kart baslik="CİRO (TAHSİL EDİLEN)" tikla={isAdmin ? () => navigate("/reports") : undefined} cocuk={<>
        <div style={{ fontSize: 30, fontWeight: 800 }}>₺{Math.round(veri.ciro).toLocaleString("tr-TR")}</div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 46, marginTop: 8 }}>
          {BUSINESS_HOURS.map(h => (
            <div key={h} title={`${String(h).padStart(2, "0")}:00 — ₺${Math.round(veri.saatlik[h])}`}
                 style={{ flex: 1, borderRadius: "3px 3px 0 0", minHeight: 2,
                          height: `${Math.round(100 * veri.saatlik[h] / maxSaat)}%`,
                          background: String(h) === String(enYogun?.[0]) && veri.saatlik[h] > 0 ? "#FFFFFF" : "#2E2E2E" }} />
          ))}
        </div>
        <div style={{ fontSize: 11, color: "#8A8580", marginTop: 5 }}>
          {veri.siparisSayisi} sipariş{Number(enYogun?.[1]) > 0 ? ` · en yoğun saat ${String(enYogun[0]).padStart(2, "0")}:00` : ""}
        </div>
      </>} />

      <div style={{ display: "flex", gap: 10 }}>
        <Kart baslik="AÇIK HESAP" tikla={() => navigate("/payment")} cocuk={
          <div style={{ fontSize: 20, fontWeight: 800 }}>
            {veri.acikSayi} · ₺{Math.round(veri.acikTutar).toLocaleString("tr-TR")}
          </div>} />
        <Kart baslik="VARDİYADA" cocuk={<>
          <div style={{ fontSize: 20, fontWeight: 800 }}>{veri.vardiyaAd.length} kişi</div>
          {veri.vardiyaAd.length > 0 && (
            <div style={{ fontSize: 11, color: "#8A8580", marginTop: 2 }}>
              {veri.vardiyaAd.map(v => v.ad).join(" · ")}
            </div>)}
        </>} />
      </div>

      {veri.unutulmus.length > 0 && (
        <div onClick={() => navigate("/payment")}
             style={{ background: "#161616", border: "1px solid #2A2A2A", borderRadius: 13,
                      padding: "11px 14px", fontSize: 13, color: "#F0EDE8", cursor: "pointer",
                      display: "flex", alignItems: "center", gap: 8 }}>
          ⏳ {veri.unutulmus.length} hesap 12 saatten uzun süredir açık —{" "}
          {veri.unutulmus.slice(0, 2).map(o => `${o.cafe_tables?.name || o.customer_name || "Misafir"} ₺${Math.round(o.total)}`).join(", ")}
          <span style={{ marginLeft: "auto", fontWeight: 800, whiteSpace: "nowrap" }}>Kasa →</span>
        </div>
      )}

      <Kart baslik="BUGÜN EN ÇOK" cocuk={
        veri.cokSatan.length === 0
          ? <div style={{ fontSize: 13, color: "#8A8580" }}>Henüz satış yok.</div>
          : <div style={{ fontSize: 13.5 }}>{veri.cokSatan.map(([ad, n]) => `${ad} ×${n}`).join(" · ")}</div>} />
    </div>
  );
}
