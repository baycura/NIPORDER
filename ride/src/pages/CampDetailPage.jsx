import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "../lib/supabase.js";
import { fmtDate } from "../lib/format.js";
import { useRideAuth } from "../auth/RideAuthContext.jsx";

export default function CampDetailPage() {
  const { id } = useParams();
  const { session, userId, customer } = useRideAuth();
  const nav = useNavigate();

  const [camp, setCamp] = useState(null);
  const [app, setApp] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [f, setF] = useState({ full_name: "", phone: "", experience: "", notes: "" });

  const load = useCallback(async () => {
    const { data: c } = await supabase.from("camp_board").select("*").eq("id", id).maybeSingle();
    setCamp(c || null);
    if (userId) {
      const { data: a } = await supabase
        .from("camp_applications").select("*").eq("camp_id", id).eq("user_id", userId).maybeSingle();
      setApp(a || null);
    }
    setLoading(false);
  }, [id, userId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setF((p) => ({ ...p, full_name: p.full_name || customer?.name || "" })); }, [customer]);

  const apply = async (e) => {
    e.preventDefault();
    if (busy) return;
    if (!f.full_name.trim()) { setErr("Ad soyad gerekli."); return; }
    setBusy(true); setErr("");
    const { error } = await supabase.from("camp_applications").upsert({
      camp_id: id, user_id: userId,
      full_name: f.full_name.trim(),
      phone: f.phone.trim() || null,
      experience: f.experience.trim() || null,
      notes: f.notes.trim() || null,
      status: "pending",
    }, { onConflict: "camp_id,user_id" });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setShowForm(false);
    load();
  };

  const cancel = async () => {
    if (!confirm("Başvurunu geri çekmek istiyor musun?")) return;
    setBusy(true);
    await supabase.from("camp_applications").update({ status: "cancelled" }).eq("id", app.id);
    setBusy(false);
    load();
  };

  if (loading) return <div style={{ display: "flex", justifyContent: "center", padding: 40 }}><div className="nip-spin" /></div>;
  if (!camp) return <div style={{ textAlign: "center", padding: 40, color: "var(--nip-muted)" }}>Kamp bulunamadı. <Link to="/camps" style={{ color: "var(--nip-accent)" }}>Kamplar</Link></div>;

  const activeApp = app && app.status !== "cancelled";
  const STATUS = { pending: "İncelemede", accepted: "Kabul edildi ✓", waitlist: "Bekleme listesi", rejected: "Reddedildi" };

  return (
    <div>
      <Link to="/camps" style={{ fontFamily: "var(--nip-font-mono)", fontSize: 12, color: "var(--nip-muted)" }}>← Kamplar</Link>

      <div style={{ display: "flex", gap: 14, alignItems: "center", marginTop: 12 }}>
        <div style={{ fontSize: 48 }}>{camp.cover_emoji || "🚵"}</div>
        <div>
          <div style={{ fontFamily: "var(--nip-font-mono)", fontSize: 13, color: "var(--nip-accent)", letterSpacing: "0.08em" }}>
            {fmtDate(camp.start_date)}{camp.end_date ? ` – ${fmtDate(camp.end_date)}` : ""} · {camp.location}
          </div>
          <h1 style={{ fontSize: 44, marginTop: 4 }}>{camp.title}</h1>
        </div>
      </div>

      <div style={{ display: "flex", gap: 20, margin: "16px 0", fontFamily: "var(--nip-font-mono)", fontSize: 13 }}>
        {camp.price != null && <span><span style={{ color: "var(--nip-muted)" }}>ÜCRET </span>{camp.price} {camp.currency}</span>}
        <span style={{ color: camp.spots_open > 0 ? "var(--nip-success)" : "var(--nip-danger)" }}>
          {camp.spots_open > 0 ? `${camp.spots_open} yer açık` : "Kontenjan dolu"} · {camp.accepted_count}/{camp.capacity}
        </span>
      </div>

      {camp.description && (
        <p style={{ background: "var(--nip-surface)", border: "1px solid var(--nip-divider)", borderRadius: 4, padding: 16, whiteSpace: "pre-wrap", lineHeight: 1.55 }}>
          {camp.description}
        </p>
      )}

      {err && <div style={{ color: "var(--nip-danger)", fontSize: 13, marginTop: 10 }}>{err}</div>}

      {/* Application */}
      <div style={{ marginTop: 20 }}>
        {!session ? (
          <PrimaryBtn onClick={() => nav("/login")}>Başvurmak için giriş yap</PrimaryBtn>
        ) : activeApp ? (
          <div style={{ border: "1px solid var(--nip-divider)", borderRadius: 4, padding: 16 }}>
            <div style={{ fontFamily: "var(--nip-font-mono)", fontSize: 12, color: "var(--nip-muted)", letterSpacing: "0.1em" }}>BAŞVURUN</div>
            <div style={{ fontSize: 20, margin: "6px 0", color: app.status === "accepted" ? "var(--nip-success)" : "var(--nip-ink)" }}>
              {STATUS[app.status] || app.status}
            </div>
            <button onClick={cancel} disabled={busy} style={ghostBtn}>Başvuruyu geri çek</button>
          </div>
        ) : showForm ? (
          <form onSubmit={apply} style={{ display: "flex", flexDirection: "column", gap: 12, border: "1px solid var(--nip-divider)", borderRadius: 4, padding: 16 }}>
            <div style={{ fontFamily: "var(--nip-font-display)", fontSize: 24 }}>Kamp Başvurusu</div>
            <L label="AD SOYAD *"><input value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} style={input} /></L>
            <L label="TELEFON"><input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="+90..." style={input} /></L>
            <L label="DENEYİM / SEVİYE"><input value={f.experience} onChange={(e) => setF({ ...f, experience: e.target.value })} placeholder="Haftalık km, geçmiş kamplar..." style={input} /></L>
            <L label="NOTLAR"><textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} rows={3} style={{ ...input, resize: "vertical" }} /></L>
            <div style={{ display: "flex", gap: 10 }}>
              <button type="button" onClick={() => setShowForm(false)} style={ghostBtn}>İptal</button>
              <button type="submit" disabled={busy} style={{ ...primaryBtn, flex: 1, opacity: busy ? 0.5 : 1 }}>{busy ? "Gönderiliyor..." : "Başvuruyu Gönder"}</button>
            </div>
          </form>
        ) : (
          <PrimaryBtn onClick={() => setShowForm(true)} disabled={camp.status !== "open"}>
            {camp.status === "open" ? "Bu kampa başvur" : "Başvurular kapalı"}
          </PrimaryBtn>
        )}
      </div>
    </div>
  );
}

const input = { width: "100%", padding: "11px 12px", background: "var(--nip-surface)", border: "1px solid var(--nip-divider)", borderRadius: 2, fontSize: 14, color: "var(--nip-ink)", outline: "none" };
const primaryBtn = { background: "var(--nip-ink)", color: "var(--nip-bg)", border: "none", borderRadius: 2, padding: "12px 20px", fontFamily: "var(--nip-font-mono)", fontSize: 13, letterSpacing: "0.08em" };
const ghostBtn = { background: "transparent", border: "1px solid var(--nip-divider)", color: "var(--nip-ink)", borderRadius: 2, padding: "10px 16px", fontFamily: "var(--nip-font-mono)", fontSize: 13 };

function PrimaryBtn({ children, ...p }) { return <button {...p} style={{ ...primaryBtn, opacity: p.disabled ? 0.5 : 1 }}>{children}</button>; }
function L({ label, children }) {
  return (<label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
    <span style={{ fontSize: 10, color: "var(--nip-muted)", letterSpacing: "0.14em", fontFamily: "var(--nip-font-mono)" }}>{label}</span>
    {children}
  </label>);
}
