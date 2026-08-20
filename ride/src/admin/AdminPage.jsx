import { useState } from "react";
import { Link } from "react-router-dom";
import { useRideAuth } from "../auth/RideAuthContext.jsx";
import RideModeration from "./RideModeration.jsx";
import CampsAdmin from "./CampsAdmin.jsx";
import RentalModeration from "./RentalModeration.jsx";
import SocialRideForm from "./SocialRideForm.jsx";

// PORTABLE: drop this folder into the reservation admin (reservation/#admin).
// Dependencies it expects in the host app:
//   - ../lib/supabase.js exporting `supabase` (same Supabase project)
//   - ../auth/RideAuthContext.jsx exposing { session, isAdmin } (or swap for
//     the host app's own admin auth hook)
//   - ../lib/format.js helpers (fmtDate, PACE_OPTIONS, START_POINT, ...)

const TABS = [
  ["rides", "SÜRÜŞLER"],
  ["camps", "KAMPLAR"],
  ["rentals", "KİRALIK"],
  ["social", "SOCIAL RIDE"],
];

export default function AdminPage() {
  const { session, isAdmin, loading, staff } = useRideAuth();
  const [tab, setTab] = useState("rides");

  if (loading) return <div style={{ display: "flex", justifyContent: "center", padding: 40 }}><div className="nip-spin" /></div>;
  if (!session) return <Gate>Admin paneline girmek için <Link to="/login" style={{ color: "var(--nip-accent)" }}>giriş yap</Link>.</Gate>;
  if (!isAdmin) return <Gate>Bu alan yalnızca Not In Paris ekibine açık.</Gate>;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h1 style={{ fontSize: 40 }}>Admin</h1>
        <span style={{ fontFamily: "var(--nip-font-mono)", fontSize: 12, color: "var(--nip-muted)" }}>{staff?.name || staff?.role}</span>
      </div>

      <div style={{ display: "flex", gap: 6, margin: "16px 0 22px", flexWrap: "wrap" }}>
        {TABS.map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            border: "1px solid var(--nip-divider)",
            background: tab === k ? "var(--nip-ink)" : "transparent",
            color: tab === k ? "var(--nip-bg)" : "var(--nip-ink)",
            fontFamily: "var(--nip-font-mono)", fontSize: 11, letterSpacing: "0.08em",
            padding: "8px 13px", borderRadius: 2,
          }}>{label}</button>
        ))}
      </div>

      {tab === "rides" && <RideModeration />}
      {tab === "camps" && <CampsAdmin />}
      {tab === "rentals" && <RentalModeration />}
      {tab === "social" && <SocialRideForm />}
    </div>
  );
}

function Gate({ children }) {
  return <div style={{ textAlign: "center", padding: 50, color: "var(--nip-muted)" }}>{children}</div>;
}
