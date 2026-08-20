import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "../lib/supabase.js";
import { fetchHostsByAuthIds } from "../lib/hosts.js";
import { fmtDate, STATUS_LABEL, OFFICIAL_HOST } from "../lib/format.js";
import { useRideAuth } from "../auth/RideAuthContext.jsx";

export default function RideDetailPage() {
  const { id } = useParams();
  const { session, userId } = useRideAuth();
  const nav = useNavigate();

  const [ride, setRide] = useState(null);
  const [host, setHost] = useState(null);
  const [myRsvp, setMyRsvp] = useState(null);
  const [attendees, setAttendees] = useState(null); // host-only
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const isHost = ride && userId && ride.user_id === userId;

  const load = useCallback(async () => {
    const { data: r } = await supabase.from("ride_board").select("*").eq("id", id).maybeSingle();
    setRide(r || null);
    if (r) {
      const hosts = await fetchHostsByAuthIds([r.user_id]);
      setHost(hosts[r.user_id] || null);

      if (userId) {
        const { data: mine } = await supabase
          .from("ride_rsvps").select("*").eq("ride_id", id).eq("user_id", userId).maybeSingle();
        setMyRsvp(mine || null);
      } else {
        setMyRsvp(null);
      }

      if (userId && r.user_id === userId) {
        // RLS lets the host read all RSVPs for their ride.
        const { data: rs } = await supabase
          .from("ride_rsvps").select("*").eq("ride_id", id).neq("status", "cancelled");
        const map = await fetchHostsByAuthIds((rs || []).map((x) => x.user_id));
        setAttendees((rs || []).map((x) => ({ ...x, profile: map[x.user_id] })));
      }
    }
    setLoading(false);
  }, [id, userId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const ch = supabase
      .channel("ride-detail-" + id)
      .on("postgres_changes", { event: "*", schema: "public", table: "ride_posts", filter: `id=eq.${id}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "ride_rsvps", filter: `ride_id=eq.${id}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id, load]);

  const active = myRsvp && myRsvp.status !== "cancelled";

  const join = async () => {
    if (!session) return nav("/login");
    if (busy) return;
    setBusy(true); setErr("");
    const target = ride.seats_open > 0 ? "going" : "waitlist";
    const { error } = await supabase
      .from("ride_rsvps")
      .upsert({ ride_id: id, user_id: userId, status: target }, { onConflict: "ride_id,user_id" });
    if (error) setErr(error.message);
    setBusy(false);
    load();
  };

  const leave = async () => {
    if (busy) return;
    setBusy(true); setErr("");
    const { error } = await supabase
      .from("ride_rsvps").update({ status: "cancelled" }).eq("ride_id", id).eq("user_id", userId);
    if (error) setErr(error.message);
    setBusy(false);
    load();
  };

  const cancelRide = async () => {
    if (!confirm("Bu sürüşü iptal etmek istediğine emin misin?")) return;
    setBusy(true);
    await supabase.from("ride_posts").update({ status: "cancelled" }).eq("id", id);
    setBusy(false);
    load();
  };

  const deleteRide = async () => {
    if (!confirm("Sürüş tamamen silinsin mi? Bu geri alınamaz.")) return;
    setBusy(true);
    const { error } = await supabase.from("ride_posts").delete().eq("id", id);
    setBusy(false);
    if (error) { setErr(error.message); return; }
    nav("/");
  };

  if (loading) return <div style={{ display: "flex", justifyContent: "center", padding: 40 }}><div className="nip-spin" /></div>;
  if (!ride) return <div style={{ textAlign: "center", padding: 40, color: "var(--nip-muted)" }}>Sürüş bulunamadı. <Link to="/" style={{ color: "var(--nip-accent)" }}>Panoya dön</Link></div>;

  const pillClass = ride.status === "full" ? "pill-full" : ride.status === "cancelled" ? "pill-cancelled" : "pill-open";

  return (
    <div>
      <Link to="/" style={{ fontFamily: "var(--nip-font-mono)", fontSize: 12, color: "var(--nip-muted)" }}>← Pano</Link>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginTop: 12 }}>
        <div>
          <div style={{ fontFamily: "var(--nip-font-mono)", fontSize: 13, color: "var(--nip-accent)", letterSpacing: "0.08em" }}>
            {fmtDate(ride.ride_date)}{ride.ride_time ? ` · ${ride.ride_time}` : ""}
          </div>
          <h1 style={{ fontSize: 44, marginTop: 6 }}>{ride.title}</h1>
        </div>
        <span className={pillClass} style={{ fontFamily: "var(--nip-font-mono)", fontSize: 11, letterSpacing: "0.12em", padding: "5px 10px", borderRadius: 2, whiteSpace: "nowrap" }}>
          {STATUS_LABEL[ride.status] || ride.status}
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "10px 0 18px", color: "var(--nip-muted)", fontSize: 13 }}>
        {ride.is_official ? (
          <>
            <span style={{ width: 26, height: 26, borderRadius: "50%", background: "var(--nip-ink)", color: "var(--nip-bg)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>★</span>
            <span>Düzenleyen: <strong style={{ color: "var(--nip-ink)" }}>{OFFICIAL_HOST}</strong></span>
            <span style={{ fontFamily: "var(--nip-font-mono)", fontSize: 9, letterSpacing: "0.1em", background: "var(--nip-accent)", color: "var(--nip-ink)", padding: "2px 6px", borderRadius: 2 }}>SOCIAL RIDE</span>
          </>
        ) : (
          <>
            {host?.avatar_url
              ? <img src={host.avatar_url} alt="" style={{ width: 26, height: 26, borderRadius: "50%" }} />
              : <span style={{ width: 26, height: 26, borderRadius: "50%", background: "var(--nip-cream)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700 }}>{(host?.name || "?")[0]}</span>}
            <span>Düzenleyen: <strong style={{ color: "var(--nip-ink)" }}>{host?.name || "Üye"}</strong></span>
          </>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 12, marginBottom: 18 }}>
        <Stat label="KOLTUK" value={`${ride.going_count}/${ride.capacity}`} accent={ride.seats_open > 0 ? "var(--nip-success)" : "var(--nip-danger)"} />
        {ride.pace && <Stat label="TEMPO" value={ride.pace} />}
        {ride.distance_km != null && <Stat label="MESAFE" value={`${ride.distance_km} km`} />}
        {ride.elevation_m != null && <Stat label="TIRMANIŞ" value={`${ride.elevation_m} m`} />}
        {ride.meet_point && <Stat label="BULUŞMA" value={ride.meet_point} />}
      </div>

      {ride.route_url && (
        <a href={ride.route_url} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginBottom: 16, fontFamily: "var(--nip-font-mono)", fontSize: 13, color: "var(--nip-accent)" }}>
          🔗 Rotayı aç
        </a>
      )}

      {ride.notes && (
        <p style={{ background: "var(--nip-surface)", border: "1px solid var(--nip-divider)", borderRadius: 4, padding: 14, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
          {ride.notes}
        </p>
      )}

      {err && <div style={{ color: "var(--nip-danger)", fontSize: 13, margin: "10px 0" }}>{err}</div>}

      {/* RSVP / host actions */}
      <div style={{ marginTop: 20 }}>
        {ride.status === "cancelled" ? (
          <div style={{ color: "var(--nip-muted)", fontFamily: "var(--nip-font-mono)" }}>Bu sürüş iptal edildi.</div>
        ) : !session ? (
          <PrimaryBtn onClick={() => nav("/login")}>Giriş yap & katıl</PrimaryBtn>
        ) : isHost ? (
          <HostPanel attendees={attendees} busy={busy} onCancel={cancelRide} onDelete={deleteRide} />
        ) : active ? (
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontFamily: "var(--nip-font-mono)", fontSize: 13, color: myRsvp.status === "going" ? "var(--nip-success)" : "var(--nip-accent)" }}>
              {myRsvp.status === "going" ? "✓ Katılıyorsun" : "⏳ Bekleme listesindesin"}
            </span>
            <button onClick={leave} disabled={busy} style={ghostBtn}>Vazgeç</button>
          </div>
        ) : ride.seats_open > 0 ? (
          <PrimaryBtn onClick={join} disabled={busy}>Katılıyorum</PrimaryBtn>
        ) : (
          <PrimaryBtn onClick={join} disabled={busy}>Bekleme listesine gir</PrimaryBtn>
        )}
      </div>
    </div>
  );
}

function HostPanel({ attendees, busy, onCancel, onDelete }) {
  const going = (attendees || []).filter((a) => a.status === "going");
  const wait = (attendees || []).filter((a) => a.status === "waitlist");
  return (
    <div style={{ border: "1px solid var(--nip-divider)", borderRadius: 4, padding: 16 }}>
      <div style={{ fontFamily: "var(--nip-font-mono)", fontSize: 11, letterSpacing: "0.12em", color: "var(--nip-muted)", marginBottom: 10 }}>SENİN SÜRÜŞÜN</div>
      <AttendeeList title={`KATILANLAR (${going.length})`} list={going} />
      {wait.length > 0 && <AttendeeList title={`BEKLEME LİSTESİ (${wait.length})`} list={wait} />}
      <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
        <button onClick={onCancel} disabled={busy} style={ghostBtn}>Sürüşü iptal et</button>
        <button onClick={onDelete} disabled={busy} style={{ ...ghostBtn, color: "var(--nip-danger)", borderColor: "var(--nip-danger)" }}>Sil</button>
      </div>
    </div>
  );
}

function AttendeeList({ title, list }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 10, color: "var(--nip-muted)", letterSpacing: "0.12em", marginBottom: 6 }}>{title}</div>
      {list.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--nip-muted)" }}>Henüz kimse yok.</div>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {list.map((a) => (
            <span key={a.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, background: "var(--nip-cream)", borderRadius: 999, padding: "4px 10px" }}>
              {a.profile?.avatar_url
                ? <img src={a.profile.avatar_url} alt="" style={{ width: 18, height: 18, borderRadius: "50%" }} />
                : null}
              {a.profile?.name || "Üye"}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, accent }) {
  return (
    <div style={{ background: "var(--nip-surface)", border: "1px solid var(--nip-divider)", borderRadius: 4, padding: "10px 12px" }}>
      <div style={{ fontSize: 9, color: "var(--nip-muted)", letterSpacing: "0.14em", fontFamily: "var(--nip-font-mono)" }}>{label}</div>
      <div style={{ fontSize: 18, marginTop: 2, color: accent || "var(--nip-ink)" }}>{value}</div>
    </div>
  );
}

const primaryBtn = { background: "var(--nip-ink)", color: "var(--nip-bg)", border: "none", borderRadius: 2, padding: "12px 20px", fontFamily: "var(--nip-font-mono)", fontSize: 13, letterSpacing: "0.08em" };
const ghostBtn = { background: "transparent", border: "1px solid var(--nip-divider)", color: "var(--nip-ink)", borderRadius: 2, padding: "10px 16px", fontFamily: "var(--nip-font-mono)", fontSize: 13 };

function PrimaryBtn({ children, ...p }) {
  return <button {...p} style={{ ...primaryBtn, opacity: p.disabled ? 0.5 : 1 }}>{children}</button>;
}
