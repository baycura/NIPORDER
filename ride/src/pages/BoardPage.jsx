import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase.js";
import { fetchHostsByAuthIds } from "../lib/hosts.js";
import { todayStr, STRAVA_CLUB_URL } from "../lib/format.js";
import { useRideAuth } from "../auth/RideAuthContext.jsx";
import RideCard from "../components/RideCard.jsx";

export default function BoardPage() {
  const { session } = useRideAuth();
  const [rides, setRides] = useState([]);
  const [hosts, setHosts] = useState({});
  const [loading, setLoading] = useState(true);
  const [showPast, setShowPast] = useState(false);

  const load = useCallback(async () => {
    let q = supabase.from("ride_board").select("*").order("ride_date", { ascending: true });
    if (!showPast) q = q.gte("ride_date", todayStr());
    const { data, error } = await q;
    if (!error) {
      const list = data || [];
      setRides(list);
      setHosts(await fetchHostsByAuthIds(list.map((r) => r.user_id)));
    }
    setLoading(false);
  }, [showPast]);

  useEffect(() => { load(); }, [load]);

  // Live board: any change to posts or rsvps refreshes the list.
  useEffect(() => {
    const ch = supabase
      .channel("ride-board")
      .on("postgres_changes", { event: "*", schema: "public", table: "ride_posts" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "ride_rsvps" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
        <a href={STRAVA_CLUB_URL} target="_blank" rel="noreferrer" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "var(--nip-font-mono)", fontSize: 11, letterSpacing: "0.08em", color: "var(--nip-muted)", border: "1px solid var(--nip-divider)", borderRadius: 999, padding: "5px 11px" }}>
          <span style={{ color: "#FC4C02", fontWeight: 700 }}>STRAVA</span> Join our club ↗
        </a>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 44 }}>Sürüş Panosu</h1>
          <p style={{ margin: "4px 0 0", color: "var(--nip-muted)", fontSize: 13 }}>
            Birlikte pedallayacak arkadaş bul.
          </p>
        </div>
        {session && (
          <Link to="/new" style={{ textDecoration: "none", background: "var(--nip-accent)", color: "var(--nip-ink)", fontFamily: "var(--nip-font-mono)", fontSize: 12, letterSpacing: "0.08em", padding: "10px 14px", borderRadius: 2, whiteSpace: "nowrap" }}>
            + İLAN AÇ
          </Link>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {[["Yaklaşan", false], ["Geçmiş dahil", true]].map(([label, val]) => (
          <button key={label} onClick={() => setShowPast(val)} style={{
            border: "1px solid var(--nip-divider)",
            background: showPast === val ? "var(--nip-ink)" : "transparent",
            color: showPast === val ? "var(--nip-bg)" : "var(--nip-ink)",
            fontFamily: "var(--nip-font-mono)", fontSize: 11, letterSpacing: "0.08em",
            padding: "7px 12px", borderRadius: 2,
          }}>{label}</button>
        ))}
      </div>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 40 }}><div className="nip-spin" /></div>
      ) : rides.length === 0 ? (
        <Empty session={session} />
      ) : (
        rides.map((r) => <RideCard key={r.id} ride={r} host={hosts[r.user_id]} />)
      )}
    </div>
  );
}

function Empty({ session }) {
  return (
    <div style={{ textAlign: "center", padding: "48px 16px", border: "1px dashed var(--nip-divider)", borderRadius: 4, color: "var(--nip-muted)" }}>
      <div style={{ fontFamily: "var(--nip-font-display)", fontSize: 28, color: "var(--nip-ink)" }}>Henüz sürüş yok</div>
      <p style={{ fontSize: 13 }}>İlk ilanı sen aç, gerisi gelir.</p>
      {session
        ? <Link to="/new" style={{ color: "var(--nip-accent)", fontFamily: "var(--nip-font-mono)", fontSize: 13 }}>+ İlan aç →</Link>
        : <Link to="/login" style={{ color: "var(--nip-accent)", fontFamily: "var(--nip-font-mono)", fontSize: 13 }}>Giriş yap →</Link>}
    </div>
  );
}
