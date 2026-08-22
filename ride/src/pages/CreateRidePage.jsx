import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase.js";
import { useRideAuth } from "../auth/RideAuthContext.jsx";
import { todayStr, PACE_OPTIONS, START_POINT } from "../lib/format.js";

export default function CreateRidePage() {
  const { userId } = useRideAuth();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [f, setF] = useState({
    title: "", ride_date: todayStr(), ride_time: "", pace: PACE_OPTIONS[0],
    distance_km: "", elevation_m: "", capacity: 6, route_url: "", notes: "",
  });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    if (!f.title.trim()) { setErr("Başlık gerekli."); return; }
    if (!f.ride_date) { setErr("Tarih gerekli."); return; }
    setBusy(true); setErr("");
    const payload = {
      user_id: userId,
      title: f.title.trim(),
      ride_date: f.ride_date,
      ride_time: f.ride_time.trim() || null,
      pace: f.pace || null,
      distance_km: f.distance_km === "" ? null : Number(f.distance_km),
      elevation_m: f.elevation_m === "" ? null : Number(f.elevation_m),
      capacity: Math.min(50, Math.max(1, Number(f.capacity) || 1)),
      meet_point: START_POINT, // start point is always the café
      route_url: f.route_url.trim() || null,
      notes: f.notes.trim() || null,
    };
    const { data, error } = await supabase.from("ride_posts").insert(payload).select("id").single();
    setBusy(false);
    if (error) { setErr(error.message); return; }
    nav(`/ride/${data.id}`);
  };

  return (
    <div>
      <h1 style={{ fontSize: 40, marginBottom: 16 }}>Yeni Sürüş İlanı</h1>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Field label="BAŞLIK *"><input value={f.title} onChange={set("title")} placeholder="Pazar sabahı Belgrad turu" style={input} /></Field>

        <Row>
          <Field label="TARİH *"><input type="date" value={f.ride_date} min={todayStr()} onChange={set("ride_date")} style={input} /></Field>
          <Field label="SAAT"><input value={f.ride_time} onChange={set("ride_time")} placeholder="08:00" style={input} /></Field>
        </Row>

        <Row>
          <Field label="TEMPO">
            <select value={f.pace} onChange={set("pace")} style={input}>
              {PACE_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>
          <Field label="KAPASİTE"><input type="number" min={1} max={50} value={f.capacity} onChange={set("capacity")} style={input} /></Field>
        </Row>

        <Row>
          <Field label="MESAFE (km)"><input type="number" min={0} value={f.distance_km} onChange={set("distance_km")} placeholder="60" style={input} /></Field>
          <Field label="TIRMANIŞ (m)"><input type="number" min={0} value={f.elevation_m} onChange={set("elevation_m")} placeholder="450" style={input} /></Field>
        </Row>

        <Field label="BAŞLANGIÇ NOKTASI">
          <div style={{ ...input, display: "flex", alignItems: "center", gap: 8, background: "var(--nip-cream)", color: "var(--nip-ink)" }}>
            <span>📍 {START_POINT}</span>
            <span style={{ fontFamily: "var(--nip-font-mono)", fontSize: 10, color: "var(--nip-muted)", letterSpacing: "0.1em" }}>SABİT</span>
          </div>
        </Field>
        <Field label="ROTA LİNKİ (Strava/Komoot)"><input value={f.route_url} onChange={set("route_url")} placeholder="https://" style={input} /></Field>
        <Field label="NOTLAR"><textarea value={f.notes} onChange={set("notes")} rows={4} placeholder="Tempo, kafe molası, ekipman..." style={{ ...input, resize: "vertical" }} /></Field>

        {err && <div style={{ color: "var(--nip-danger)", fontSize: 13 }}>{err}</div>}

        <div style={{ display: "flex", gap: 10 }}>
          <button type="button" onClick={() => nav("/")} style={{ background: "transparent", border: "1px solid var(--nip-divider)", borderRadius: 2, padding: "12px 18px", fontFamily: "var(--nip-font-mono)", fontSize: 13 }}>İptal</button>
          <button type="submit" disabled={busy} style={{ flex: 1, background: "var(--nip-accent)", color: "var(--nip-ink)", border: "none", borderRadius: 2, padding: "12px 18px", fontFamily: "var(--nip-font-mono)", fontSize: 13, letterSpacing: "0.08em", opacity: busy ? 0.5 : 1 }}>
            {busy ? "Yayınlanıyor..." : "İlanı Yayınla"}
          </button>
        </div>
      </form>
    </div>
  );
}

const input = { width: "100%", padding: "11px 12px", background: "var(--nip-surface)", border: "1px solid var(--nip-divider)", borderRadius: 2, fontSize: 14, color: "var(--nip-ink)", outline: "none" };

function Field({ label, children }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
      <span style={{ fontSize: 10, color: "var(--nip-muted)", letterSpacing: "0.14em", fontFamily: "var(--nip-font-mono)" }}>{label}</span>
      {children}
    </label>
  );
}
function Row({ children }) {
  return <div style={{ display: "flex", gap: 12 }}>{children}</div>;
}
