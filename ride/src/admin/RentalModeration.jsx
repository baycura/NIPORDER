import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase.js";
import { fetchHostsByAuthIds } from "../lib/hosts.js";
import { Empty } from "./RideModeration.jsx";

export default function RentalModeration() {
  const [rentals, setRentals] = useState([]);
  const [owners, setOwners] = useState({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    // Admin is authenticated -> base table readable (all rows, incl. hidden).
    const { data } = await supabase.from("bike_rentals").select("*").order("created_at", { ascending: false });
    const list = data || [];
    setRentals(list);
    setOwners(await fetchHostsByAuthIds(list.map((r) => r.owner_id)));
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const toggleHide = async (r) => {
    const next = r.status === "hidden" ? "available" : "hidden";
    await supabase.from("bike_rentals").update({ status: next }).eq("id", r.id);
    load();
  };
  const del = async (r) => {
    if (!confirm(`"${r.brand_model}" ilanı silinsin mi?`)) return;
    await supabase.from("bike_rentals").delete().eq("id", r.id);
    load();
  };

  if (loading) return <div className="nip-spin" />;
  if (!rentals.length) return <Empty>Kiralık ilan yok.</Empty>;

  return (
    <div>
      {rentals.map((r) => (
        <div key={r.id} style={row}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 17 }}>
              {r.brand_model}
              {r.status === "hidden" && <span style={badgeMuted}>GİZLİ</span>}
            </div>
            <div style={meta}>
              {(owners[r.owner_id]?.name || "Üye")} · {r.price != null ? `${r.price} ${r.currency}/${r.price_period === "week" ? "hafta" : "gün"}` : "fiyat yok"} · {r.location || "—"}
            </div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <Link to={`/rentals/${r.id}`} style={btnGhost}>Gör</Link>
            <button onClick={() => toggleHide(r)} style={btnGhost}>{r.status === "hidden" ? "Göster" : "Gizle"}</button>
            <button onClick={() => del(r)} style={btnDanger}>Sil</button>
          </div>
        </div>
      ))}
    </div>
  );
}

const row = { display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between", background: "var(--nip-surface)", border: "1px solid var(--nip-divider)", borderRadius: 4, padding: 12, marginBottom: 8 };
const meta = { fontFamily: "var(--nip-font-mono)", fontSize: 11, color: "var(--nip-muted)", marginTop: 3 };
const badgeMuted = { marginLeft: 8, fontFamily: "var(--nip-font-mono)", fontSize: 9, letterSpacing: "0.1em", background: "var(--nip-divider)", color: "var(--nip-muted)", padding: "2px 6px", borderRadius: 2, verticalAlign: "middle" };
const btnGhost = { textDecoration: "none", background: "transparent", border: "1px solid var(--nip-divider)", color: "var(--nip-ink)", borderRadius: 2, padding: "6px 10px", fontFamily: "var(--nip-font-mono)", fontSize: 11 };
const btnDanger = { ...btnGhost, color: "var(--nip-danger)", borderColor: "var(--nip-danger)" };
