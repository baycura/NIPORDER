import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase.js";
import { fmtDate } from "../lib/format.js";

export default function CampsPage() {
  const [camps, setCamps] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("camp_board").select("*").order("start_date", { ascending: true });
      setCamps(data || []);
      setLoading(false);
    })();
  }, []);

  return (
    <div>
      <h1 style={{ fontSize: 44 }}>Kamplar</h1>
      <p style={{ color: "var(--nip-muted)", fontSize: 13, marginTop: 4, marginBottom: 20 }}>
        Not In Paris organizasyonu gezileri ve kampları.
      </p>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 40 }}><div className="nip-spin" /></div>
      ) : camps.length === 0 ? (
        <div style={{ color: "var(--nip-muted)", padding: 30, textAlign: "center", border: "1px dashed var(--nip-divider)", borderRadius: 4 }}>Şu an açık kamp yok.</div>
      ) : (
        camps.map((c) => (
          <Link key={c.id} to={`/camps/${c.id}`} style={{ textDecoration: "none", color: "inherit" }}>
            <article style={{ background: "var(--nip-surface)", border: "1px solid var(--nip-divider)", borderRadius: 4, padding: 18, marginBottom: 12, display: "flex", gap: 16, alignItems: "center" }}>
              <div style={{ fontSize: 40 }}>{c.cover_emoji || "🚵"}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: "var(--nip-font-mono)", fontSize: 12, color: "var(--nip-accent)", letterSpacing: "0.08em" }}>
                  {fmtDate(c.start_date)}{c.end_date ? ` – ${fmtDate(c.end_date)}` : ""} · {c.location}
                </div>
                <h3 style={{ fontSize: 28, marginTop: 4 }}>{c.title}</h3>
                {c.summary && <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--nip-ink-soft)" }}>{c.summary}</p>}
              </div>
              <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                {c.price != null && <div style={{ fontFamily: "var(--nip-font-display)", fontSize: 22 }}>{c.price} {c.currency}</div>}
                <div style={{ fontFamily: "var(--nip-font-mono)", fontSize: 11, color: c.spots_open > 0 ? "var(--nip-success)" : "var(--nip-danger)" }}>
                  {c.status === "open" ? (c.spots_open > 0 ? `${c.spots_open} yer` : "Dolu") : c.status === "closed" ? "Kapalı" : "Dolu"}
                </div>
              </div>
            </article>
          </Link>
        ))
      )}
    </div>
  );
}
