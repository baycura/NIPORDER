import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase.js";
import { useAuth } from "../../contexts/AuthContext.jsx";
import { PARIS_STORE_ID, DONER_STORE_ID } from "../../lib/stores.js";

const cv = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";
const hv = "'Bebas Neue','Barlow Condensed',sans-serif";

// NIP kendi menusunden doner (mutfak) urunlerini de satar. Bir urunun mutfak
// hedefi Doner ise, o urunun NIP'te satilan cirosu ay sonu mutfaga odenir.
// inter_company_settlement view'i bu cross-store (paid) siparisleri toplar:
//   origin_store_id             = kasayi/parayi alan magaza (NIP = Paris)
//   kitchen_destination_store_id = urunu yapan mutfak (Doner)
//   total_amount, order_count, week_start, month_start
// Not: iki magaza adi da "Paris" icerdigi icin isim degil ID ile eslestiriyoruz.

export default function SettlementPage() {
  const { staffUser } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("month");

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("inter_company_settlement").select("*");
    if (error) console.error(error);
    setRows(data || []);
    setLoading(false);
  };

  const periodKey = period === "week" ? "week_start" : "month_start";
  const grouped = {};
  rows.forEach(r => {
    const pk = r[periodKey];
    if (!pk) return;
    if (!grouped[pk]) grouped[pk] = { period: pk, items: [] };
    grouped[pk].items.push(r);
  });
  const sortedPeriods = Object.values(grouped).sort((a, b) => b.period.localeCompare(a.period));

  const fmt = (n) => Number(n || 0).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const dateLabel = (ds) => new Date(ds).toLocaleDateString("tr-TR",
    period === "week"
      ? { day: "numeric", month: "long" }
      : { year: "numeric", month: "long" });

  return (
    <div style={{ padding: 20, fontFamily: cv, color: "#F0EDE8", maxWidth: 900, margin: "0 auto", paddingBottom: 80 }}>
      <h1 style={{ fontFamily: hv, fontWeight: 900, fontSize: 34, marginBottom: 6, letterSpacing: 1 }}>
        🥙 MUTFAĞA ÖDENECEK
      </h1>
      <p style={{ fontSize: 13, color: "#888", marginBottom: 18, lineHeight: 1.5 }}>
        NIP'te satılan <strong>mutfak (döner) ürünlerinin</strong> cirosu.
        Bu tutar ay sonunda döner mutfağına ödenir.
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {[{ k: "month", l: "🗓️ Aylık" }, { k: "week", l: "📅 Haftalık" }].map(p => (
          <button key={p.k} onClick={() => setPeriod(p.k)} style={{
            padding: "10px 20px", borderRadius: 8, cursor: "pointer",
            background: period === p.k ? "#C8973E" : "#222",
            color: period === p.k ? "#000" : "#888",
            border: "1px solid " + (period === p.k ? "#C8973E" : "#333"),
            fontWeight: 700, fontSize: 13
          }}>{p.l}</button>
        ))}
      </div>

      {loading && <div style={{ padding: 24, textAlign: "center", color: "#888" }}>Yükleniyor...</div>}

      {!loading && sortedPeriods.length === 0 && (
        <div style={{ padding: 32, background: "#1A1A1A", borderRadius: 12, textAlign: "center", color: "#888" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>✨</div>
          <div style={{ fontSize: 15, marginBottom: 8 }}>Henüz mutfak ürünü satışı yok</div>
          <div style={{ fontSize: 12, color: "#666" }}>
            Menüde "mutfak ürünü" (döner mutfağı) olarak işaretlenmiş bir ürün<br />
            satıldığında, mutfağa ödenecek tutar burada birikecek.
          </div>
        </div>
      )}

      {!loading && sortedPeriods.map(({ period: ps, items }) => {
        // NIP kasasi aldi, doner mutfagi yapti => mutfaga odenecek
        const toKitchen = items.filter(r => r.origin_store_id === PARIS_STORE_ID && r.kitchen_destination_store_id === DONER_STORE_ID);
        // Doner tarafi sattikca NIP mutfagi yapti => mutfak bize borclu (nadir)
        const fromKitchen = items.filter(r => r.origin_store_id === DONER_STORE_ID && r.kitchen_destination_store_id === PARIS_STORE_ID);
        const payable = toKitchen.reduce((s, r) => s + Number(r.total_amount || 0), 0);
        const receivable = fromKitchen.reduce((s, r) => s + Number(r.total_amount || 0), 0);
        const net = payable - receivable;
        const payableOrders = toKitchen.reduce((s, r) => s + Number(r.order_count || 0), 0);

        return (
          <div key={ps} style={{ marginBottom: 14, padding: 16, background: "#1A1A1A", borderRadius: 12, border: "1px solid #2A2A2A" }}>
            <h3 style={{ fontSize: 15, marginBottom: 14, color: "#C8973E", fontWeight: 700, textTransform: "capitalize" }}>
              📅 {dateLabel(ps)}
            </h3>

            <div style={{ padding: 16, background: "#2A1F1A", borderRadius: 10, border: "1px solid #4A3A2A", marginBottom: receivable > 0.01 ? 10 : 0 }}>
              <div style={{ fontSize: 11, color: "#A87A4F", marginBottom: 6, letterSpacing: 0.5, fontWeight: 600 }}>
                MUTFAĞA ÖDENECEK CİRO
              </div>
              <div style={{ fontSize: 34, fontWeight: 900, color: "#FF9F40", lineHeight: 1, fontFamily: hv }}>
                ₺{fmt(payable)}
              </div>
              <div style={{ fontSize: 11, color: "#666", marginTop: 6 }}>{payableOrders} sipariş · mutfak ürünleri</div>
            </div>

            {receivable > 0.01 && (
              <>
                <div style={{ padding: 12, background: "#1A2A2F", borderRadius: 8, border: "1px solid #2A4A5A", marginBottom: 10 }}>
                  <div style={{ fontSize: 10, color: "#4FA8C8", marginBottom: 4, letterSpacing: 0.5, fontWeight: 600 }}>
                    MUTFAK BİZE BORÇLU (bizim yaptığımız)
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: "#40C8E0" }}>₺{fmt(receivable)}</div>
                </div>
                <div style={{ padding: 12, background: "#0A0A0A", borderRadius: 8, textAlign: "center" }}>
                  <div style={{ fontSize: 11, color: "#888", marginBottom: 4, letterSpacing: 0.5 }}>⚖️ NET</div>
                  {Math.abs(net) < 0.01 ? (
                    <div style={{ fontSize: 14, color: "#888" }}>Eşit — ödeme gerekmez</div>
                  ) : net > 0 ? (
                    <div style={{ fontSize: 16, color: "#FF9F40", fontWeight: 800 }}>Mutfağa <strong>₺{fmt(net)}</strong> ödenecek</div>
                  ) : (
                    <div style={{ fontSize: 16, color: "#40C8E0", fontWeight: 800 }}>Mutfak bize <strong>₺{fmt(Math.abs(net))}</strong> borçlu</div>
                  )}
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
