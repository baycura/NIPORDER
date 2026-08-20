import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "../lib/supabase.js";
import { fetchHostsByAuthIds } from "../lib/hosts.js";
import { useRideAuth } from "../auth/RideAuthContext.jsx";

export default function RentalDetailPage() {
  const { id } = useParams();
  const { session, userId } = useRideAuth();
  const nav = useNavigate();
  const [r, setR] = useState(null);
  const [owner, setOwner] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      // Members get the full row (price + phone); guests get specs only.
      const src = session ? "bike_rentals" : "bike_rentals_public";
      const { data } = await supabase.from(src).select("*").eq("id", id).maybeSingle();
      setR(data || null);
      if (data) setOwner((await fetchHostsByAuthIds([data.owner_id]))[data.owner_id] || null);
      setLoading(false);
    })();
  }, [id, session]);

  if (loading) return <div style={{ display: "flex", justifyContent: "center", padding: 40 }}><div className="nip-spin" /></div>;
  if (!r) return <div style={{ textAlign: "center", padding: 40, color: "var(--nip-muted)" }}>İlan bulunamadı. <Link to="/rentals" style={{ color: "var(--nip-accent)" }}>Kiralık bisikletler</Link></div>;

  const isOwner = userId && r.owner_id === userId;

  const specs = [
    ["BİSİKLET TÜRÜ", r.bike_type],
    ["KADRO MALZEMESİ", r.frame_material],
    ["KADRO ÖLÇÜSÜ", r.frame_size],
    ["GRUPSET", r.groupset],
    ["DİŞLİ ORANLARI", r.gearing],
    ["LASTİK EBADI", r.tire_size],
    ["FREN", r.brake_type],
    ["KONUM", r.location],
  ].filter(([, v]) => v);

  return (
    <div>
      <Link to="/rentals" style={{ fontFamily: "var(--nip-font-mono)", fontSize: 12, color: "var(--nip-muted)" }}>← Kiralık bisikletler</Link>
      <h1 style={{ fontSize: 44, marginTop: 12 }}>{r.brand_model}</h1>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, margin: "16px 0" }}>
        {specs.map(([label, value]) => (
          <div key={label} style={{ background: "var(--nip-surface)", border: "1px solid var(--nip-divider)", borderRadius: 4, padding: "10px 12px" }}>
            <div style={{ fontSize: 9, color: "var(--nip-muted)", letterSpacing: "0.14em", fontFamily: "var(--nip-font-mono)" }}>{label}</div>
            <div style={{ fontSize: 16, marginTop: 2 }}>{value}</div>
          </div>
        ))}
      </div>

      {r.notes && (
        <p style={{ background: "var(--nip-surface)", border: "1px solid var(--nip-divider)", borderRadius: 4, padding: 14, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{r.notes}</p>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "14px 0", color: "var(--nip-muted)", fontSize: 13 }}>
        {owner?.avatar_url
          ? <img src={owner.avatar_url} alt="" style={{ width: 24, height: 24, borderRadius: "50%" }} />
          : <span style={{ width: 24, height: 24, borderRadius: "50%", background: "var(--nip-cream)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700 }}>{(owner?.name || "?")[0]}</span>}
        <span>İlan sahibi: <strong style={{ color: "var(--nip-ink)" }}>{owner?.name || "Üye"}</strong></span>
      </div>

      {/* Gated block: price + phone */}
      {session ? (
        <div style={{ border: "1px solid var(--nip-ink)", borderRadius: 4, padding: 16, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontSize: 10, color: "var(--nip-muted)", letterSpacing: "0.14em", fontFamily: "var(--nip-font-mono)" }}>FİYAT</div>
            <div style={{ fontFamily: "var(--nip-font-display)", fontSize: 30 }}>
              {r.price != null ? `${r.price} ${r.currency}` : "—"}
              <span style={{ fontFamily: "var(--nip-font-mono)", fontSize: 13, color: "var(--nip-muted)" }}> /{r.price_period === "week" ? "hafta" : "gün"}</span>
            </div>
          </div>
          {r.phone && (
            <a href={`tel:${r.phone}`} style={{ textDecoration: "none", background: "var(--nip-ink)", color: "var(--nip-bg)", borderRadius: 2, padding: "12px 18px", fontFamily: "var(--nip-font-mono)", fontSize: 14 }}>
              📞 {r.phone}
            </a>
          )}
        </div>
      ) : (
        <div style={{ border: "1px dashed var(--nip-accent)", borderRadius: 4, padding: 20, textAlign: "center", background: "var(--nip-cream)" }}>
          <div style={{ fontFamily: "var(--nip-font-display)", fontSize: 24 }}>🔒 Fiyat & telefon üyelere özel</div>
          <p style={{ fontSize: 13, color: "var(--nip-ink-soft)", margin: "6px 0 14px" }}>Üye girişi yap; fiyat ve iletişim bilgisi anında açılsın.</p>
          <button onClick={() => nav("/login")} style={{ background: "var(--nip-ink)", color: "var(--nip-bg)", border: "none", borderRadius: 2, padding: "12px 22px", fontFamily: "var(--nip-font-mono)", fontSize: 13, letterSpacing: "0.08em" }}>
            Giriş yap & gör
          </button>
        </div>
      )}

      {isOwner && (
        <button
          onClick={async () => { if (confirm("İlanı sil?")) { await supabase.from("bike_rentals").delete().eq("id", id); nav("/rentals"); } }}
          style={{ marginTop: 16, background: "transparent", border: "1px solid var(--nip-danger)", color: "var(--nip-danger)", borderRadius: 2, padding: "10px 16px", fontFamily: "var(--nip-font-mono)", fontSize: 13 }}
        >İlanımı sil</button>
      )}
    </div>
  );
}
