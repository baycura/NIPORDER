import { useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabase.js";
import { fmtDate, todayStr } from "../lib/format.js";
import { Empty } from "./RideModeration.jsx";

const BLANK = {
  title: "", location: "", start_date: todayStr(), end_date: "", capacity: 12,
  price: "", currency: "EUR", cover_emoji: "🚵", summary: "", description: "", status: "open",
};

export default function CampsAdmin() {
  const [camps, setCamps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // camp object or {} for new
  const [open, setOpen] = useState(null);        // camp id whose applications are shown

  const load = useCallback(async () => {
    const { data } = await supabase.from("camp_board").select("*").order("start_date", { ascending: true });
    setCamps(data || []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="nip-spin" />;

  return (
    <div>
      <button onClick={() => setEditing(BLANK)} style={{ ...btnPrimary, marginBottom: 14 }}>+ Yeni Kamp</button>

      {editing && <CampForm camp={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}

      {camps.length === 0 ? <Empty>Kamp yok.</Empty> : camps.map((c) => (
        <div key={c.id} style={{ background: "var(--nip-surface)", border: "1px solid var(--nip-divider)", borderRadius: 4, padding: 12, marginBottom: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
            <div>
              <div style={{ fontSize: 17 }}>{c.cover_emoji} {c.title}</div>
              <div style={meta}>{fmtDate(c.start_date)}{c.end_date ? ` – ${fmtDate(c.end_date)}` : ""} · {c.location} · {c.accepted_count}/{c.capacity} kabul · {c.status}</div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => setOpen(open === c.id ? null : c.id)} style={btnGhost}>Başvurular</button>
              <button onClick={() => setEditing(c)} style={btnGhost}>Düzenle</button>
            </div>
          </div>
          {open === c.id && <Applications campId={c.id} onChange={load} />}
        </div>
      ))}
    </div>
  );
}

function Applications({ campId, onChange }) {
  const [apps, setApps] = useState(null);
  const load = useCallback(async () => {
    const { data } = await supabase.from("camp_applications").select("*").eq("camp_id", campId).order("created_at", { ascending: true });
    setApps(data || []);
  }, [campId]);
  useEffect(() => { load(); }, [load]);

  const setStatus = async (a, status) => {
    await supabase.from("camp_applications").update({ status }).eq("id", a.id);
    load(); onChange?.();
  };

  if (apps === null) return <div style={{ padding: 10 }}><div className="nip-spin" /></div>;
  const visible = apps.filter((a) => a.status !== "cancelled");
  if (!visible.length) return <div style={{ ...meta, padding: "10px 0 2px" }}>Başvuru yok.</div>;

  return (
    <div style={{ marginTop: 10, borderTop: "1px solid var(--nip-divider)", paddingTop: 10 }}>
      {visible.map((a) => (
        <div key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: "1px solid var(--nip-divider)" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14 }}>{a.full_name} <span style={{ ...meta, marginLeft: 6 }}>{statusTr[a.status] || a.status}</span></div>
            <div style={meta}>{[a.phone, a.experience].filter(Boolean).join(" · ")}</div>
            {a.notes && <div style={{ fontSize: 12, color: "var(--nip-ink-soft)", marginTop: 2 }}>{a.notes}</div>}
          </div>
          <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
            <button onClick={() => setStatus(a, "accepted")} style={{ ...btnGhost, color: "var(--nip-success)", borderColor: "var(--nip-success)" }}>Kabul</button>
            <button onClick={() => setStatus(a, "waitlist")} style={btnGhost}>Bekleme</button>
            <button onClick={() => setStatus(a, "rejected")} style={btnDanger}>Red</button>
          </div>
        </div>
      ))}
    </div>
  );
}

function CampForm({ camp, onClose, onSaved }) {
  const isNew = !camp.id;
  const [f, setF] = useState({ ...BLANK, ...camp, price: camp.price ?? "", end_date: camp.end_date || "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const save = async () => {
    if (!f.title.trim()) { setErr("Başlık gerekli."); return; }
    setBusy(true); setErr("");
    const payload = {
      title: f.title.trim(), location: f.location.trim() || null,
      start_date: f.start_date, end_date: f.end_date || null,
      capacity: Math.max(1, Number(f.capacity) || 1),
      price: f.price === "" ? null : Number(f.price), currency: f.currency || "EUR",
      cover_emoji: f.cover_emoji || null, summary: f.summary.trim() || null,
      description: f.description.trim() || null, status: f.status,
    };
    const res = isNew
      ? await supabase.from("camps").insert(payload)
      : await supabase.from("camps").update(payload).eq("id", camp.id);
    setBusy(false);
    if (res.error) { setErr(res.error.message); return; }
    onSaved();
  };

  const remove = async () => {
    if (!confirm("Kamp silinsin mi? Başvurular da silinir.")) return;
    await supabase.from("camps").delete().eq("id", camp.id);
    onSaved();
  };

  return (
    <div style={{ border: "1px solid var(--nip-ink)", borderRadius: 4, padding: 16, marginBottom: 16, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontFamily: "var(--nip-font-display)", fontSize: 22 }}>{isNew ? "Yeni Kamp" : "Kampı Düzenle"}</div>
      <Row><L label="EMOJİ" w={70}><input value={f.cover_emoji} onChange={set("cover_emoji")} style={input} /></L><L label="BAŞLIK *"><input value={f.title} onChange={set("title")} style={input} /></L></Row>
      <L label="KONUM"><input value={f.location} onChange={set("location")} placeholder="Fas / Morocco" style={input} /></L>
      <Row><L label="BAŞLANGIÇ *"><input type="date" value={f.start_date} onChange={set("start_date")} style={input} /></L><L label="BİTİŞ"><input type="date" value={f.end_date} onChange={set("end_date")} style={input} /></L></Row>
      <Row><L label="KONTENJAN"><input type="number" min={1} value={f.capacity} onChange={set("capacity")} style={input} /></L><L label="FİYAT"><input type="number" min={0} value={f.price} onChange={set("price")} style={input} /></L><L label="PARA" w={90}><select value={f.currency} onChange={set("currency")} style={input}><option>EUR</option><option>USD</option><option>TRY</option></select></L></Row>
      <L label="ÖZET"><input value={f.summary} onChange={set("summary")} style={input} /></L>
      <L label="AÇIKLAMA"><textarea value={f.description} onChange={set("description")} rows={4} style={{ ...input, resize: "vertical" }} /></L>
      <L label="DURUM"><select value={f.status} onChange={set("status")} style={input}><option value="open">open</option><option value="closed">closed</option><option value="full">full</option></select></L>
      {err && <div style={{ color: "var(--nip-danger)", fontSize: 13 }}>{err}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={onClose} style={btnGhost}>İptal</button>
        {!isNew && <button onClick={remove} style={btnDanger}>Sil</button>}
        <button onClick={save} disabled={busy} style={{ ...btnPrimary, flex: 1, opacity: busy ? 0.5 : 1 }}>{busy ? "..." : "Kaydet"}</button>
      </div>
    </div>
  );
}

const statusTr = { pending: "İncelemede", accepted: "Kabul", waitlist: "Bekleme", rejected: "Red" };
const input = { width: "100%", padding: "10px 11px", background: "var(--nip-bg)", border: "1px solid var(--nip-divider)", borderRadius: 2, fontSize: 14, color: "var(--nip-ink)", outline: "none" };
const meta = { fontFamily: "var(--nip-font-mono)", fontSize: 11, color: "var(--nip-muted)" };
const btnPrimary = { background: "var(--nip-ink)", color: "var(--nip-bg)", border: "none", borderRadius: 2, padding: "10px 16px", fontFamily: "var(--nip-font-mono)", fontSize: 12, letterSpacing: "0.06em" };
const btnGhost = { background: "transparent", border: "1px solid var(--nip-divider)", color: "var(--nip-ink)", borderRadius: 2, padding: "6px 10px", fontFamily: "var(--nip-font-mono)", fontSize: 11 };
const btnDanger = { ...btnGhost, color: "var(--nip-danger)", borderColor: "var(--nip-danger)" };
function L({ label, children, w }) { return <label style={{ display: "flex", flexDirection: "column", gap: 5, flex: w ? `0 0 ${w}px` : 1 }}><span style={{ fontSize: 9, color: "var(--nip-muted)", letterSpacing: "0.14em", fontFamily: "var(--nip-font-mono)" }}>{label}</span>{children}</label>; }
function Row({ children }) { return <div style={{ display: "flex", gap: 10 }}>{children}</div>; }
