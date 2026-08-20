import { Link } from "react-router-dom";
import { fmtDate, STATUS_LABEL, OFFICIAL_HOST } from "../lib/format.js";

export default function RideCard({ ride, host }) {
  const pillClass =
    ride.status === "full" ? "pill-full" :
    ride.status === "cancelled" ? "pill-cancelled" : "pill-open";

  return (
    <Link to={`/ride/${ride.id}`} style={{ textDecoration: "none", color: "inherit" }}>
      <article style={{
        background: "var(--nip-surface)",
        border: "1px solid var(--nip-divider)",
        borderRadius: 4,
        padding: 16,
        marginBottom: 12,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div>
            <div style={{ fontFamily: "var(--nip-font-mono)", fontSize: 12, color: "var(--nip-accent)", letterSpacing: "0.08em" }}>
              {fmtDate(ride.ride_date)}{ride.ride_time ? ` · ${ride.ride_time}` : ""}
            </div>
            <h3 style={{ fontSize: 26, marginTop: 4 }}>{ride.title}</h3>
          </div>
          <span className={pillClass} style={{ fontFamily: "var(--nip-font-mono)", fontSize: 10, letterSpacing: "0.12em", padding: "4px 8px", borderRadius: 2, whiteSpace: "nowrap" }}>
            {STATUS_LABEL[ride.status] || ride.status}
          </span>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 14, fontFamily: "var(--nip-font-mono)", fontSize: 12, color: "var(--nip-ink-soft)" }}>
          {ride.pace && <Meta label="TEMPO" value={ride.pace} />}
          {ride.distance_km != null && <Meta label="MESAFE" value={`${ride.distance_km} km`} />}
          {ride.elevation_m != null && <Meta label="TIRMANIŞ" value={`${ride.elevation_m} m`} />}
          {ride.meet_point && <Meta label="BULUŞMA" value={ride.meet_point} />}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--nip-divider)", paddingTop: 10 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--nip-muted)" }}>
            {ride.is_official ? (
              <>
                <span style={{ width: 22, height: 22, borderRadius: "50%", background: "var(--nip-ink)", color: "var(--nip-bg)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>★</span>
                <span style={{ color: "var(--nip-ink)" }}>{OFFICIAL_HOST}</span>
                <span style={{ fontFamily: "var(--nip-font-mono)", fontSize: 9, letterSpacing: "0.1em", background: "var(--nip-accent)", color: "var(--nip-ink)", padding: "2px 6px", borderRadius: 2 }}>SOCIAL RIDE</span>
              </>
            ) : (
              <>
                {host?.avatar_url
                  ? <img src={host.avatar_url} alt="" style={{ width: 22, height: 22, borderRadius: "50%" }} />
                  : <span style={{ width: 22, height: 22, borderRadius: "50%", background: "var(--nip-cream)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700 }}>{(host?.name || "?")[0]}</span>}
                {host?.name || "Üye"}
              </>
            )}
          </span>
          <span style={{ fontFamily: "var(--nip-font-mono)", fontSize: 12, color: ride.seats_open > 0 ? "var(--nip-success)" : "var(--nip-danger)" }}>
            {ride.seats_open > 0 ? `${ride.seats_open} koltuk boş` : "Dolu"}
            <span style={{ color: "var(--nip-muted)" }}>{` · ${ride.going_count}/${ride.capacity}`}</span>
          </span>
        </div>
      </article>
    </Link>
  );
}

function Meta({ label, value }) {
  return (
    <span style={{ display: "flex", flexDirection: "column" }}>
      <span style={{ fontSize: 9, color: "var(--nip-muted)", letterSpacing: "0.14em" }}>{label}</span>
      <span style={{ color: "var(--nip-ink)" }}>{value}</span>
    </span>
  );
}
