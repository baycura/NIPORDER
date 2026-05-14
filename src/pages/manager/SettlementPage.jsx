import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase.js";
import { useAuth } from "../../contexts/AuthContext.jsx";

const cv = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";

export default function SettlementPage() {
  const { staffUser } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("week");

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("inter_company_settlement")
      .select("*");
    if (error) console.error(error);
    setRows(data || []);
    setLoading(false);
  };

  const periodKey = period === "week" ? "week_start" : "month_start";
  const grouped = {};
  rows.forEach(r => {
    const pk = r[periodKey];
    if (!grouped[pk]) grouped[pk] = { period: pk, items: [] };
    grouped[pk].items.push(r);
  });
  const sortedPeriods = Object.values(grouped).sort((a, b) => b.period.localeCompare(a.period));

  const fmt = (n) => Number(n || 0).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const dateLabel = (ds) => new Date(ds).toLocaleDateString("tr-TR", { year: "numeric", month: "long", day: "numeric" });

  return (
    <div style={{ padding: 20, fontFamily: cv, color: "#F0EDE8", maxWidth: 900, margin: "0 auto" }}>
      <h1 style={{ fontFamily: "'Bebas Neue','Barlow Condensed',sans-serif", fontWeight: 900, fontSize: 36, marginBottom: 8, letterSpacing: 2 }}>
        ⚖️ İNTER-COMPANY MAHSUPLAŞMA
      </h1>
      <p style={{ fontSize: 13, color: "#888", marginBottom: 20, lineHeight: 1.5 }}>
        Paris ⇄ Berlin LTD'leri arasında cross-store sipariş hesabı.<br />
        <strong>Kural:</strong> Bir mağazanın kasası ödemeyi alır, başka mağazanın mutfağı yaparsa — kasayı alan mağaza, mutfak yapan mağazaya borçlu olur.
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {[{ k: "week", l: "📅 Haftalık" }, { k: "month", l: "🗓️ Aylık" }].map(p => (
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

      {!loading && rows.length === 0 && (
        <div style={{ padding: 32, background: "#1A1A1A", borderRadius: 12, textAlign: "center", color: "#888" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>✨</div>
          <div style={{ fontSize: 15, marginBottom: 8 }}>Henüz cross-store sipariş yok</div>
          <div style={{ fontSize: 12, color: "#666" }}>
            Paris müşterisi Berlin mutfağındaki bir ürünü (örn. Döner) sipariş ettiğinde<br />
            ya da tam tersi olduğunda mahsuplaşma kayıtları burada görünecek.
          </div>
        </div>
      )}

      {!loading && sortedPeriods.map(({ period: ps, items }) => {
        const parisToOther = items.filter(r => 
          r.origin_store_name?.toLowerCase().includes("paris") && 
          !r.kitchen_store_name?.toLowerCase().includes("paris")
        );
        const otherToParis = items.filter(r => 
          !r.origin_store_name?.toLowerCase().includes("paris") && 
          r.kitchen_store_name?.toLowerCase().includes("paris")
        );
        const parisOwes = parisToOther.reduce((s, r) => s + Number(r.total_amount || 0), 0);
        const otherOwes = otherToParis.reduce((s, r) => s + Number(r.total_amount || 0), 0);
        const net = parisOwes - otherOwes;
        const parisOrders = parisToOther.reduce((s, r) => s + Number(r.order_count || 0), 0);
        const otherOrders = otherToParis.reduce((s, r) => s + Number(r.order_count || 0), 0);

        return (
          <div key={ps} style={{ marginBottom: 16, padding: 16, background: "#1A1A1A", borderRadius: 12, border: "1px solid #2A2A2A" }}>
            <h3 style={{ fontSize: 16, marginBottom: 14, color: "#C8973E", fontWeight: 700 }}>
              📅 {dateLabel(ps)}
            </h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div style={{ padding: 14, background: "#2A1F1A", borderRadius: 8, border: "1px solid #4A3A2A" }}>
                <div style={{ fontSize: 10, color: "#A87A4F", marginBottom: 6, letterSpacing: 0.5, fontWeight: 600 }}>
                  PARIS → BERLİN'E BORÇLU
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, color: "#FF9F40", marginBottom: 4 }}>
                  {fmt(parisOwes)} TL
                </div>
                <div style={{ fontSize: 11, color: "#666" }}>{parisOrders} sipariş</div>
              </div>
              <div style={{ padding: 14, background: "#1A2A2F", borderRadius: 8, border: "1px solid #2A4A5A" }}>
                <div style={{ fontSize: 10, color: "#4FA8C8", marginBottom: 6, letterSpacing: 0.5, fontWeight: 600 }}>
                  BERLİN → PARİS'E BORÇLU
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, color: "#40C8E0", marginBottom: 4 }}>
                  {fmt(otherOwes)} TL
                </div>
                <div style={{ fontSize: 11, color: "#666" }}>{otherOrders} sipariş</div>
              </div>
            </div>
            <div style={{ padding: 12, background: "#0A0A0A", borderRadius: 8, textAlign: "center" }}>
              <div style={{ fontSize: 11, color: "#888", marginBottom: 4, letterSpacing: 0.5 }}>⚖️ NET MAHSUPLAŞMA</div>
              {Math.abs(net) < 0.01 ? (
                <div style={{ fontSize: 14, color: "#888" }}>Eşit — transfer gerekmez</div>
              ) : net > 0 ? (
                <div style={{ fontSize: 17, color: "#FF9F40", fontWeight: 800 }}>
                  Paris → Berlin'e <strong>{fmt(net)} TL</strong> transfer etmeli
                </div>
              ) : (
                <div style={{ fontSize: 17, color: "#40C8E0", fontWeight: 800 }}>
                  Berlin → Paris'e <strong>{fmt(Math.abs(net))} TL</strong> transfer etmeli
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
