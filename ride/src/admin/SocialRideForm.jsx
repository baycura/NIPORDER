import { useState } from "react";
import { supabase } from "../lib/supabase.js";
import { useRideAuth } from "../auth/RideAuthContext.jsx";
import { todayStr, PACE_OPTIONS, START_POINT, STRAVA_CLUB_URL, OFFICIAL_HOST } from "../lib/format.js";

// Official Not In Paris "Social Ride". Published under the brand (is_official),
// and on submit the admin is redirected to the Strava club.
export default function SocialRideForm() {
  const { userId } = useRideAuth();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [f, setF] = useState({
    title: "", ride_date: todayStr(), ride_time: "", pace: PACE_OPTIONS[0],
    distance_km: "", elevation_m: "", capacity: 30, route_url: "", notes: "",
    strava_url: STRAVA_CLUB_URL,
  });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    if (!f.title.trim()) { setErr("Başlık gerekli."); return; }
    setBusy(true); setErr("");
    const { error } = await supabase.from("ride_posts").insert({
      user_id: userId,
      is_official: true,
      title: f.title.trim(),
      ride_date: f.ride_date,
      ride_time: f.ride_time.trim() || null,
      pace: f.pace || null,
      distance_km: f.distance_km === "" ? null : Number(f.distance_km),
      elevation_m: f.elevation_m === "" ? null : Number(f.elevation_m),
      capacity: Math.min(50, Math.max(1, Number(f.capacity) || 1)),
      meet_point: START_POINT,
      route_url: f.route_url.trim() || null,
      strava_url: f.strava_url.trim() || STRAVA_CLUB_URL,
      notes: f.notes.trim() || null,
    });
    if (error) { setErr(error.message); setBusy(false); return; }
    // Auto-redirect to the Strava club after publishing.
    window.location.href = f.strava_url.trim() || STRAVA_CLUB_URL;
  };

  return (
    <div>
      <p style={{ color: "var(--nip-muted)", fontSize: 13, marginBottom: 14 }}>
        <strong style={{ color: "var(--nip-ink)" }}>{OFFICIAL_HOST}</strong> adına resmi sürüş. Başlangıç: 📍 {START_POINT} (sabit).
        Yayınlayınca Strava kulübüne yönlendirilirsin.
      </p>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <L label="BAŞLIK *"><input value={f.title} onChange={set("title")} placeholder="Cumartesi Social Ride" style={input} /></L>
        <Row>
          <L label="TARİH *"><input type="date" value={f.ride_date} min={todayStr()} onChange={set("ride_date")} style={input} /></L>
          <L label="SAAT"><input value={f.ride_time} onChange={set("ride_time")} placeholder="09:00" style={input} /></L>
        </Row>
        <Row>
          <L label="TEMPO"><select value={f.pace} onChange={set("pace")} style={input}>{PACE_OPTIONS.map((p) => <option key={p}>{p}</option>)}</select></L>
          <L label="KAPASİTE"><input type="number" min={1} max={50} value={f.capacity} onChange={set("capacity")} style={input} /></L>
        </Row>
        <Row>
          <L label="MESAFE (km)"><input type="number" min={0} value={f.distance_km} onChange={set("distance_km")} style={input} /></L>
          <L label="TIRMANIŞ (m)"><input type="number" min={0} value={f.elevation_m} onChange={set("elevation_m")} style={input} /></L>
        </Row>
        <L label="ROTA LİNKİ"><input value={f.route_url} onChange={set("route_url")} placeholder="https://" style={input} /></L>
        <L label="STRAVA KULÜP LİNKİ (yönlendirme)"><input value={f.strava_url} onChange={set("strava_url")} style={input} /></L>
        <L label="NOTLAR"><textarea value={f.notes} onChange={set("notes")} rows={3} style={{ ...input, resize: "vertical" }} /></L>
        {err && <div style={{ color: "var(--nip-danger)", fontSize: 13 }}>{err}</div>}
        <button type="submit" disabled={busy} style={{ background: "var(--nip-accent)", color: "var(--nip-ink)", border: "none", borderRadius: 2, padding: "13px", fontFamily: "var(--nip-font-mono)", fontSize: 13, letterSpacing: "0.08em", opacity: busy ? 0.5 : 1 }}>
          {busy ? "Yayınlanıyor..." : "Yayınla & Strava kulübüne git →"}
        </button>
      </form>
    </div>
  );
}

const input = { width: "100%", padding: "11px 12px", background: "var(--nip-surface)", border: "1px solid var(--nip-divider)", borderRadius: 2, fontSize: 14, color: "var(--nip-ink)", outline: "none" };
function L({ label, children }) { return <label style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}><span style={{ fontSize: 10, color: "var(--nip-muted)", letterSpacing: "0.14em", fontFamily: "var(--nip-font-mono)" }}>{label}</span>{children}</label>; }
function Row({ children }) { return <div style={{ display: "flex", gap: 12 }}>{children}</div>; }
