import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase.js";
import { fetchHostsByAuthIds } from "../lib/hosts.js";
import { useRideAuth } from "../auth/RideAuthContext.jsx";
import RideCard from "../components/RideCard.jsx";

export default function MyRidesPage() {
  const { userId, customer } = useRideAuth();
  const [hosting, setHosting] = useState([]);
  const [joined, setJoined] = useState([]);
  const [hosts, setHosts] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      // Rides I host
      const { data: mine } = await supabase
        .from("ride_board").select("*").eq("user_id", userId).order("ride_date", { ascending: true });

      // Rides I joined (going/waitlist)
      const { data: rsvps } = await supabase
        .from("ride_rsvps").select("ride_id").eq("user_id", userId).neq("status", "cancelled");
      const ids = [...new Set((rsvps || []).map((r) => r.ride_id))];
      let joinedList = [];
      if (ids.length) {
        const { data } = await supabase
          .from("ride_board").select("*").in("id", ids).order("ride_date", { ascending: true });
        joinedList = (data || []).filter((r) => r.user_id !== userId);
      }

      setHosting(mine || []);
      setJoined(joinedList);
      setHosts(await fetchHostsByAuthIds([...(mine || []), ...joinedList].map((r) => r.user_id)));
      setLoading(false);
    })();
  }, [userId]);

  if (loading) return <div style={{ display: "flex", justifyContent: "center", padding: 40 }}><div className="nip-spin" /></div>;

  return (
    <div>
      <h1 style={{ fontSize: 40 }}>Sürüşlerim</h1>
      <p style={{ color: "var(--nip-muted)", fontSize: 13, marginTop: 4, marginBottom: 22 }}>{customer?.name}</p>

      <Section title="DÜZENLEDİKLERİM" empty="Henüz ilan açmadın.">
        {hosting.map((r) => <RideCard key={r.id} ride={r} host={hosts[r.user_id]} />)}
      </Section>

      <Section title="KATILDIKLARIM" empty="Henüz bir sürüşe katılmadın.">
        {joined.map((r) => <RideCard key={r.id} ride={r} host={hosts[r.user_id]} />)}
      </Section>
    </div>
  );
}

function Section({ title, empty, children }) {
  const has = Array.isArray(children) ? children.length > 0 : !!children;
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ fontFamily: "var(--nip-font-mono)", fontSize: 11, letterSpacing: "0.14em", color: "var(--nip-muted)", marginBottom: 12 }}>{title}</div>
      {has ? children : <div style={{ color: "var(--nip-muted)", fontSize: 13 }}>{empty} <Link to="/" style={{ color: "var(--nip-accent)" }}>Panoya git →</Link></div>}
    </div>
  );
}
