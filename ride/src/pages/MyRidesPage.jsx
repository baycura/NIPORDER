import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase.js";
import { fetchHostsByAuthIds } from "../lib/hosts.js";
import { fmtDate } from "../lib/format.js";
import { useRideAuth } from "../auth/RideAuthContext.jsx";
import RideCard from "../components/RideCard.jsx";

const APP_STATUS = { pending: "İncelemede", accepted: "Kabul ✓", waitlist: "Bekleme", rejected: "Red" };

export default function MyRidesPage() {
  const { userId, customer } = useRideAuth();
  const [hosting, setHosting] = useState([]);
  const [joined, setJoined] = useState([]);
  const [hosts, setHosts] = useState({});
  const [apps, setApps] = useState([]);
  const [rentals, setRentals] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: mine } = await supabase
        .from("ride_board").select("*").eq("user_id", userId).order("ride_date", { ascending: true });

      const { data: rsvps } = await supabase
        .from("ride_rsvps").select("ride_id").eq("user_id", userId).neq("status", "cancelled");
      const ids = [...new Set((rsvps || []).map((r) => r.ride_id))];
      let joinedList = [];
      if (ids.length) {
        const { data } = await supabase
          .from("ride_board").select("*").in("id", ids).order("ride_date", { ascending: true });
        joinedList = (data || []).filter((r) => r.user_id !== userId);
      }

      // Camp applications + their camp info
      const { data: myApps } = await supabase
        .from("camp_applications").select("*").eq("user_id", userId).neq("status", "cancelled");
      let appRows = [];
      if (myApps?.length) {
        const campIds = [...new Set(myApps.map((a) => a.camp_id))];
        const { data: camps } = await supabase.from("camp_board").select("*").in("id", campIds);
        const cmap = Object.fromEntries((camps || []).map((c) => [c.id, c]));
        appRows = myApps.map((a) => ({ ...a, camp: cmap[a.camp_id] }));
      }

      // My rental listings (member reads full table)
      const { data: myRentals } = await supabase
        .from("bike_rentals").select("*").eq("owner_id", userId).order("created_at", { ascending: false });

      setHosting(mine || []);
      setJoined(joinedList);
      setApps(appRows);
      setRentals(myRentals || []);
      setHosts(await fetchHostsByAuthIds([...(mine || []), ...joinedList].map((r) => r.user_id)));
      setLoading(false);
    })();
  }, [userId]);

  if (loading) return <div style={{ display: "flex", justifyContent: "center", padding: 40 }}><div className="nip-spin" /></div>;

  return (
    <div>
      <h1 style={{ fontSize: 40 }}>Hesabım</h1>
      <p style={{ color: "var(--nip-muted)", fontSize: 13, marginTop: 4, marginBottom: 22 }}>{customer?.name}</p>

      <Section title="DÜZENLEDİĞİM SÜRÜŞLER" empty="Henüz ilan açmadın." link="/">
        {hosting.map((r) => <RideCard key={r.id} ride={r} host={hosts[r.user_id]} />)}
      </Section>

      <Section title="KATILDIĞIM SÜRÜŞLER" empty="Henüz bir sürüşe katılmadın." link="/">
        {joined.map((r) => <RideCard key={r.id} ride={r} host={hosts[r.user_id]} />)}
      </Section>

      <Section title="KAMP BAŞVURULARIM" empty="Henüz başvuru yok." link="/camps">
        {apps.map((a) => (
          <Link key={a.id} to={`/camps/${a.camp_id}`} style={{ textDecoration: "none", color: "inherit" }}>
            <div style={{ background: "var(--nip-surface)", border: "1px solid var(--nip-divider)", borderRadius: 4, padding: 14, marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 18 }}>{a.camp?.title || "Kamp"}</div>
                <div style={{ fontFamily: "var(--nip-font-mono)", fontSize: 12, color: "var(--nip-muted)" }}>{a.camp ? fmtDate(a.camp.start_date) : ""}</div>
              </div>
              <span style={{ fontFamily: "var(--nip-font-mono)", fontSize: 12, color: a.status === "accepted" ? "var(--nip-success)" : "var(--nip-ink)" }}>{APP_STATUS[a.status] || a.status}</span>
            </div>
          </Link>
        ))}
      </Section>

      <Section title="KİRALIK İLANLARIM" empty="Henüz kiralık ilanın yok." link="/rentals">
        {rentals.map((r) => (
          <Link key={r.id} to={`/rentals/${r.id}`} style={{ textDecoration: "none", color: "inherit" }}>
            <div style={{ background: "var(--nip-surface)", border: "1px solid var(--nip-divider)", borderRadius: 4, padding: 14, marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 18 }}>{r.brand_model}</div>
                <div style={{ fontFamily: "var(--nip-font-mono)", fontSize: 12, color: "var(--nip-muted)" }}>{r.price != null ? `${r.price} ${r.currency}/${r.price_period === "week" ? "hafta" : "gün"}` : ""}</div>
              </div>
              <span style={{ fontFamily: "var(--nip-font-mono)", fontSize: 11, color: r.status === "available" ? "var(--nip-success)" : "var(--nip-muted)" }}>{r.status === "available" ? "AKTİF" : r.status.toUpperCase()}</span>
            </div>
          </Link>
        ))}
      </Section>
    </div>
  );
}

function Section({ title, empty, link, children }) {
  const has = Array.isArray(children) ? children.length > 0 : !!children;
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ fontFamily: "var(--nip-font-mono)", fontSize: 11, letterSpacing: "0.14em", color: "var(--nip-muted)", marginBottom: 12 }}>{title}</div>
      {has ? children : <div style={{ color: "var(--nip-muted)", fontSize: 13 }}>{empty} <Link to={link} style={{ color: "var(--nip-accent)" }}>→</Link></div>}
    </div>
  );
}
