import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase.js";
import { useRideAuth } from "../auth/RideAuthContext.jsx";

// Members read the full table (incl. price/phone). Non-members read the
// public view (specs only). The DB enforces this; the UI just picks the source.
async function loadRentals(isMember) {
  const src = isMember ? "bike_rentals" : "bike_rentals_public";
  const { data } = await supabase.from(src).select("*").eq("status", "available").order("created_at", { ascending: false });
  return data || [];
}

export default function RentalsPage() {
  const { session } = useRideAuth();
  const [rentals, setRentals] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setRentals(await loadRentals(!!session));
      setLoading(false);
    })();
  }, [session]);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 6 }}>
        <h1 style={{ fontSize: 44 }}>Rent from Local</h1>
        {session && (
          <Link to="/rentals/new" style={{ textDecoration: "none", background: "var(--nip-accent)", color: "var(--nip-ink)", fontFamily: "var(--nip-font-mono)", fontSize: 12, letterSpacing: "0.08em", padding: "10px 14px", borderRadius: 2, whiteSpace: "nowrap" }}>
            + İLAN VER
          </Link>
        )}
      </div>
      <p style={{ color: "var(--nip-muted)", fontSize: 13, marginTop: 4, marginBottom: 20 }}>
        Lokal sürücülerin bisikletleri. {!session && <strong style={{ color: "var(--nip-ink)" }}>Fiyat ve telefon üyelere açık.</strong>}
      </p>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 40 }}><div className="nip-spin" /></div>
      ) : rentals.length === 0 ? (
        <div style={{ color: "var(--nip-muted)", padding: 30, textAlign: "center", border: "1px dashed var(--nip-divider)", borderRadius: 4 }}>Henüz kiralık bisiklet yok.</div>
      ) : (
        rentals.map((r) => (
          <Link key={r.id} to={`/rentals/${r.id}`} style={{ textDecoration: "none", color: "inherit" }}>
            <article style={{ background: "var(--nip-surface)", border: "1px solid var(--nip-divider)", borderRadius: 4, padding: 16, marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                <div>
                  <h3 style={{ fontSize: 24 }}>{r.brand_model}</h3>
                  <div style={{ fontFamily: "var(--nip-font-mono)", fontSize: 12, color: "var(--nip-muted)", marginTop: 2 }}>
                    {[r.bike_type, r.frame_size && `${r.frame_size} kadro`, r.location].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <PriceTag r={r} member={!!session} />
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
                {[r.frame_material, r.groupset, r.gearing, r.tire_size, r.brake_type].filter(Boolean).map((s, i) => (
                  <span key={i} style={{ fontFamily: "var(--nip-font-mono)", fontSize: 11, background: "var(--nip-cream)", borderRadius: 999, padding: "3px 9px" }}>{s}</span>
                ))}
              </div>
            </article>
          </Link>
        ))
      )}
    </div>
  );
}

export function PriceTag({ r, member }) {
  if (!member) {
    return <span style={{ fontFamily: "var(--nip-font-mono)", fontSize: 11, color: "var(--nip-accent)", border: "1px solid var(--nip-accent)", borderRadius: 2, padding: "4px 8px", whiteSpace: "nowrap" }}>FİYAT: ÜYELERE</span>;
  }
  if (r.price == null) return null;
  return (
    <span style={{ whiteSpace: "nowrap", textAlign: "right" }}>
      <span style={{ fontFamily: "var(--nip-font-display)", fontSize: 22 }}>{r.price} {r.currency}</span>
      <span style={{ fontFamily: "var(--nip-font-mono)", fontSize: 11, color: "var(--nip-muted)" }}>/{r.price_period === "week" ? "hafta" : "gün"}</span>
    </span>
  );
}
