import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase.js";
import { useAuth } from "../../contexts/AuthContext.jsx";
import { businessDayStart, businessDayKey } from "../../lib/businessDay.js";

const cv = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";

// Vardiyalar: sahibin TUM ekibi gordugu ekran. Herkes /myshift'te yalniz
// kendini gorur; burasi gun sec -> kim ne zaman girdi/cikti, kac fis kapatti,
// ne ciro yapti. Satis atfi MyShiftPage ile ayni kural: paid siparis,
// staff_id kime aitse onun satisi, gun siniri paid_at ile (03:00 isletme gunu).
// Ciro TAHSILAT: puanla odenen kisim (points_used) dusulur.
export default function ShiftsOverviewPage() {
  const { staffUser } = useAuth();
  const [gunOffset, setGunOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [veri, setVeri] = useState(null);

  useEffect(() => {
    let iptal = false;
    (async () => {
      setLoading(true);
      const start = businessDayStart(new Date(), gunOffset);
      const end = new Date(start.getTime() + 24 * 3600 * 1000);
      const key = businessDayKey(new Date(start.getTime() + 12 * 3600 * 1000));
      const storeIds = staffUser?.store_ids?.length ? staffUser.store_ids : ["00000000-0000-0000-0000-000000000000"];

      const [{ data: vardiyalar }, { data: satislar }, { data: kisiler }] = await Promise.all([
        supabase.from("shifts").select("staff_id,status,checked_in_at,checked_out_at").eq("date", key),
        supabase.from("orders").select("staff_id,total,points_used,paid_at")
          .in("origin_store_id", storeIds).eq("status", "paid")
          .gte("paid_at", start.toISOString()).lt("paid_at", end.toISOString()),
        supabase.from("staff").select("id,name,display_role").eq("is_active", true),
      ]);

      const adi = (id) => kisiler?.find(k => k.id === id)?.name || "Bilinmeyen";

      // Kisi bazinda topla: vardiyasi olan herkes + vardiyasiz satis yapan herkes
      const kisiMap = {};
      (vardiyalar || []).forEach(v => {
        kisiMap[v.staff_id] = { ad: adi(v.staff_id), vardiya: v, fis: 0, ciro: 0 };
      });
      let vardiyasiz = { fis: 0, ciro: 0 };
      (satislar || []).forEach(o => {
        const net = Number(o.total || 0) - Number(o.points_used || 0);
        if (o.staff_id && kisiMap[o.staff_id]) { kisiMap[o.staff_id].fis++; kisiMap[o.staff_id].ciro += net; }
        else if (o.staff_id) {
          (kisiMap[o.staff_id] = kisiMap[o.staff_id] || { ad: adi(o.staff_id), vardiya: null, fis: 0, ciro: 0 });
          kisiMap[o.staff_id].fis++; kisiMap[o.staff_id].ciro += net;
        } else { vardiyasiz.fis++; vardiyasiz.ciro += net; }
      });

      if (!iptal) {
        setVeri({
          key,
          liste: Object.values(kisiMap).sort((a, b) => b.ciro - a.ciro),
          vardiyasiz,
          toplamCiro: (satislar || []).reduce((t, o) => t + Number(o.total || 0) - Number(o.points_used || 0), 0),
          toplamFis: (satislar || []).length,
        });
        setLoading(false);
      }
    })();
    return () => { iptal = true; };
  }, [gunOffset, staffUser?.store_ids]);

  const saat = (iso) => iso ? new Date(iso).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }) : "—";
  const sure = (v) => {
    if (!v?.checked_in_at) return "";
    const son = v.checked_out_at ? new Date(v.checked_out_at) : new Date();
    const dk = Math.max(0, Math.floor((son - new Date(v.checked_in_at)) / 60000));
    return `${Math.floor(dk / 60)}s ${dk % 60}dk`;
  };
  const gunAdi = (o) => o === 0 ? "Bugün" : o === 1 ? "Dün" :
    businessDayStart(new Date(), o).toLocaleDateString("tr-TR", { day: "numeric", month: "short" });

  return (
    <div style={{ fontFamily: cv, color: "#F0EDE8", maxWidth: 560, margin: "0 auto" }}>
      <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Vardiyalar</div>
      <div style={{ fontSize: 11, color: "#8A8580", marginBottom: 14 }}>
        Ekibin giriş-çıkışı ve kişi başı tahsilat · gün 03:00'te biter
      </div>

      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4, marginBottom: 14 }}>
        {[0, 1, 2, 3, 4, 5, 6].map(o => (
          <button key={o} onClick={() => setGunOffset(o)}
            style={{ padding: "8px 14px", borderRadius: 20, whiteSpace: "nowrap", cursor: "pointer", fontFamily: cv,
                     fontSize: 12, fontWeight: 700,
                     background: gunOffset === o ? "#C8973E" : "#1A1A1A",
                     color: gunOffset === o ? "#000" : "#999",
                     border: "1px solid " + (gunOffset === o ? "#C8973E" : "#2A2A2A") }}>
            {gunAdi(o)}
          </button>
        ))}
      </div>

      {loading ? (<div style={{ color: "#888", padding: 20 }}>Yükleniyor...</div>) : (<>
        <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
          <div style={{ flex: 1, background: "#161616", border: "1px solid #2A2A2A", borderRadius: 13, padding: "11px 14px" }}>
            <div style={{ fontSize: 10, letterSpacing: "1.5px", color: "#8A8580", fontWeight: 700 }}>GÜN CİROSU</div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>₺{Math.round(veri.toplamCiro).toLocaleString("tr-TR")}</div>
          </div>
          <div style={{ flex: 1, background: "#161616", border: "1px solid #2A2A2A", borderRadius: 13, padding: "11px 14px" }}>
            <div style={{ fontSize: 10, letterSpacing: "1.5px", color: "#8A8580", fontWeight: 700 }}>KAPANAN FİŞ</div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>{veri.toplamFis}</div>
          </div>
        </div>

        {veri.liste.length === 0 && veri.toplamFis === 0 && (
          <div style={{ textAlign: "center", padding: "34px 20px", color: "#777", fontSize: 13,
                        background: "#141414", border: "1px dashed #2A2A2A", borderRadius: 14 }}>
            Bu gün için ne vardiya kaydı ne satış var.<br />
            <span style={{ fontSize: 12, color: "#5A5550" }}>Ekip vardiyaya girmemiş ya da hesaplar sisteme yazılmamış.</span>
          </div>
        )}

        {veri.liste.map(k => (
          <div key={k.ad} style={{ background: "#161616", border: "1px solid #2A2A2A", borderRadius: 13,
                                   padding: "12px 14px", marginBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ fontSize: 15, fontWeight: 800, flex: 1 }}>{k.ad}</div>
              {k.vardiya
                ? (k.vardiya.status === "active"
                    ? <span style={{ fontSize: 10, fontWeight: 800, color: "#3ECF8E", background: "#0E1F17", border: "1px solid #1F4A35", padding: "3px 9px", borderRadius: 14 }}>VARDİYADA</span>
                    : <span style={{ fontSize: 10, fontWeight: 800, color: "#999", background: "#1E1E1E", border: "1px solid #333", padding: "3px 9px", borderRadius: 14 }}>BİTTİ</span>)
                : <span style={{ fontSize: 10, fontWeight: 800, color: "#C8973E", background: "#20180C", border: "1px solid #4A3A1A", padding: "3px 9px", borderRadius: 14 }}>VARDİYA KAYDI YOK</span>}
            </div>
            <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 12.5, color: "#B8B3AC", flexWrap: "wrap" }}>
              {k.vardiya && <span>🕐 {saat(k.vardiya.checked_in_at)} → {saat(k.vardiya.checked_out_at)} ({sure(k.vardiya)})</span>}
              <span>🧾 {k.fis} fiş</span>
              <span style={{ fontWeight: 800, color: "#F0EDE8" }}>₺{Math.round(k.ciro).toLocaleString("tr-TR")}</span>
              {k.fis > 0 && <span>ort ₺{Math.round(k.ciro / k.fis)}</span>}
            </div>
          </div>
        ))}

        {veri.vardiyasiz.fis > 0 && (
          <div style={{ background: "#141414", border: "1px solid #2A2A2A", borderRadius: 13,
                        padding: "11px 14px", fontSize: 12.5, color: "#8A8580" }}>
            Personele bağlanmamış satış: {veri.vardiyasiz.fis} fiş · ₺{Math.round(veri.vardiyasiz.ciro).toLocaleString("tr-TR")}
            <div style={{ fontSize: 11, color: "#5A5550", marginTop: 2 }}>QR ile müşterinin kendi açtığı ya da personel seçilmeden kapatılan hesaplar.</div>
          </div>
        )}
      </>)}
    </div>
  );
}
