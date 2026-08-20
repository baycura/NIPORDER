import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useRideAuth } from "../auth/RideAuthContext.jsx";

export default function LoginPage() {
  const { session, signInWithGoogle, signInWithEmail } = useRideAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => { if (session) nav("/", { replace: true }); }, [session, nav]);

  const sendLink = async (e) => {
    e.preventDefault();
    if (!email.trim() || busy) return;
    setBusy(true); setErr("");
    const { error } = await signInWithEmail(email.trim());
    setBusy(false);
    if (error) setErr(error.message); else setSent(true);
  };

  return (
    <div style={{ maxWidth: 380, margin: "32px auto", textAlign: "center" }}>
      <h1 style={{ fontSize: 44 }}>Giriş</h1>
      <p style={{ color: "var(--nip-muted)", fontSize: 13, marginTop: 4 }}>
        Tek üyelikle Not In Paris'in her yerindesin.
      </p>

      <button onClick={signInWithGoogle} style={{ width: "100%", marginTop: 22, background: "var(--nip-ink)", color: "var(--nip-bg)", border: "none", borderRadius: 2, padding: "13px", fontFamily: "var(--nip-font-mono)", fontSize: 13, letterSpacing: "0.08em" }}>
        Google ile devam et
      </button>

      <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "20px 0", color: "var(--nip-muted)", fontSize: 11 }}>
        <span style={{ flex: 1, height: 1, background: "var(--nip-divider)" }} /> VEYA <span style={{ flex: 1, height: 1, background: "var(--nip-divider)" }} />
      </div>

      {sent ? (
        <div style={{ background: "var(--nip-cream)", borderRadius: 4, padding: 16, fontSize: 14 }}>
          📩 <strong>{email}</strong> adresine giriş bağlantısı gönderdik. E-postanı kontrol et.
        </div>
      ) : (
        <form onSubmit={sendLink} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="e-posta adresin"
            style={{ width: "100%", padding: "12px", border: "1px solid var(--nip-divider)", borderRadius: 2, fontSize: 14, outline: "none", textAlign: "center" }} />
          <button type="submit" disabled={busy} style={{ background: "transparent", border: "1px solid var(--nip-ink)", borderRadius: 2, padding: "12px", fontFamily: "var(--nip-font-mono)", fontSize: 13, opacity: busy ? 0.5 : 1 }}>
            {busy ? "Gönderiliyor..." : "E-posta ile giriş bağlantısı gönder"}
          </button>
        </form>
      )}

      {err && <div style={{ color: "var(--nip-danger)", fontSize: 13, marginTop: 10 }}>{err}</div>}
    </div>
  );
}
