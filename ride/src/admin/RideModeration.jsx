import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase.js";
import { fetchHostsByAuthIds } from "../lib/hosts.js";
import { fmtDate, OFFICIAL_HOST } from "../lib/format.js";

export default function RideModeration() {
  const [rides, setRides] = useState([]);
  const [hosts, setHosts] = useState({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await supabase.from("ride_board").select("*").order("ride_date", { ascending: false });
    const list = data || [];
    setRides(list);
    setHosts(await fetchHostsByAuthIds(list.map((r) => r.user_id)));
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const cancel = async (r) => {
    if (!confirm(`"${r.title}" iptal edilsin mi?`)) return;
    await supabase.from("ride_posts").update({ status: "cancelled" }).eq("id", r.id);
    load();
  };
  const del = async (r) => {
    if (!confirm(`"${r.title}" tamamen silinsin mi?`)) return;
    await supabase.from("ride_posts").delete().eq("id", r.id);
    load();
  };

  if (loading) return <div className="nip-spin" />;
  if (!rides.length) return <Empty>Sürüş yok.</Empty>;

  return (
    <div>
      {rides.map((r) => (
        <div key={r.id} style={row}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 17 }}>
              {r.title}
              {r.is_official && <span style={badge}>SOCIAL</span>}
            </div>
            <div style={meta}>
              {fmtDate(r.ride_date)}{r.ride_time ? ` · ${r.ride_time}` : ""} · {r.is_official ? OFFICIAL_HOST : (hosts[r.user_id]?.name || "Üye")} · {r.going_count}/{r.capacity} · {r.status}
            </div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <Link to={`/ride/${r.id}`} style={btnGhost}>Gör</Link>
            {r.status !== "cancelled" && <button onClick={() => cancel(r)} style={btnGhost}>İptal</button>}
            <button onClick={() => del(r)} style={btnDanger}>Sil</button>
          </div>
        </div>
      ))}
    </div>
  );
}

const row = { display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between", background: "var(--nip-surface)", border: "1px solid var(--nip-divider)", borderRadius: 4, padding: 12, marginBottom: 8 };
const meta = { fontFamily: "var(--nip-font-mono)", fontSize: 11, color: "var(--nip-muted)", marginTop: 3 };
const badge = { marginLeft: 8, fontFamily: "var(--nip-font-mono)", fontSize: 9, letterSpacing: "0.1em", background: "var(--nip-accent)", color: "var(--nip-ink)", padding: "2px 6px", borderRadius: 2, verticalAlign: "middle" };
const btnGhost = { textDecoration: "none", background: "transparent", border: "1px solid var(--nip-divider)", color: "var(--nip-ink)", borderRadius: 2, padding: "6px 10px", fontFamily: "var(--nip-font-mono)", fontSize: 11 };
const btnDanger = { ...btnGhost, color: "var(--nip-danger)", borderColor: "var(--nip-danger)" };
export function Empty({ children }) { return <div style={{ color: "var(--nip-muted)", fontSize: 13, padding: 24, textAlign: "center", border: "1px dashed var(--nip-divider)", borderRadius: 4 }}>{children}</div>; }
