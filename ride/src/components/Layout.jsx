import { Link, useNavigate, useLocation } from "react-router-dom";
import { useRideAuth } from "../auth/RideAuthContext.jsx";
import { IS_DEMO } from "../lib/supabase.js";

export default function Layout({ children }) {
  const { session, customer, isAdmin, signOut } = useRideAuth();
  const nav = useNavigate();
  const loc = useLocation();

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {IS_DEMO && (
        <div style={{ background: "var(--nip-accent)", color: "var(--nip-ink)", textAlign: "center", fontFamily: "var(--nip-font-mono)", fontSize: 11, letterSpacing: "0.08em", padding: "5px 10px" }}>
          DEMO — örnek verilerle önizleme · admin olarak giriş yapılmış
        </div>
      )}
      <header style={{
        position: "sticky", top: 0, zIndex: 20,
        background: "var(--nip-ink)", color: "var(--nip-bg)",
        borderBottom: "1px solid #000",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 16px",
      }}>
        <Link to="/" style={{ textDecoration: "none", display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontFamily: "var(--nip-font-display)", fontSize: 24, letterSpacing: "0.04em", color: "var(--nip-bg)" }}>
            NOT IN PARIS
          </span>
          <span style={{ fontFamily: "var(--nip-font-mono)", fontSize: 11, color: "var(--nip-accent)", letterSpacing: "0.2em" }}>
            RIDE
          </span>
        </Link>

        <nav style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <Link to="/" style={navLink(loc.pathname === "/" || loc.pathname.startsWith("/ride"))}>SÜRÜŞ</Link>
          <Link to="/camps" style={navLink(loc.pathname.startsWith("/camps"))}>KAMP</Link>
          <Link to="/rentals" style={navLink(loc.pathname.startsWith("/rentals"))}>KİRALA</Link>
          {isAdmin && <Link to="/admin" style={navLink(loc.pathname === "/admin")}>ADMIN</Link>}
          {session ? (
            <>
              <Link to="/me" style={navLink(loc.pathname === "/me")}>HESABIM</Link>
              <button
                onClick={async () => { await signOut(); nav("/"); }}
                title={customer?.name || "Çıkış"}
                style={{ background: "transparent", border: "1px solid #444", color: "var(--nip-bg)", borderRadius: 2, padding: "5px 10px", fontSize: 11, letterSpacing: "0.1em" }}
              >
                ÇIKIŞ
              </button>
            </>
          ) : (
            <Link to="/login" style={{ ...navLink(false), border: "1px solid var(--nip-accent)", color: "var(--nip-accent)", padding: "5px 10px", borderRadius: 2 }}>
              GİRİŞ
            </Link>
          )}
        </nav>
      </header>

      <main style={{ flex: 1, width: "100%", maxWidth: 760, margin: "0 auto", padding: "16px" }}>
        {children}
      </main>

      <footer style={{ textAlign: "center", padding: "24px 16px", color: "var(--nip-muted)", fontSize: 11, fontFamily: "var(--nip-font-mono)", letterSpacing: "0.1em" }}>
        NOT IN PARIS · RIDE BUDDY
      </footer>
    </div>
  );
}

function navLink(active) {
  return {
    textDecoration: "none",
    fontFamily: "var(--nip-font-mono)",
    fontSize: 12,
    letterSpacing: "0.1em",
    color: active ? "var(--nip-accent)" : "var(--nip-bg)",
  };
}
