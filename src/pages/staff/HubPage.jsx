import { useMemo, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext.jsx";
import { gorunurGruplar } from "../../lib/panelNav.js";

const cv = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";

// TR harf uyumlu arama: "kat" -> Kategori Saatleri, "URUN" -> Ürünler
const tr = (s) => String(s || "").toLocaleLowerCase("tr-TR");

// MENU merkezi: eski 25 kalemlik cekmecenin yerini alan gruplu, aramali sayfa.
// Cikis butonu da burada — cekmece emekli olunca tek kayip o olurdu.
export default function HubPage() {
  const { staffUser, isManager, isAdmin, isViewer, signOut } = useAuth();
  const navigate = useNavigate();
  const [q, setQ] = useState("");

  const gruplar = useMemo(
    () => gorunurGruplar({ role: staffUser?.role, isManager, isAdmin, isViewer }),
    [staffUser?.role, isManager, isAdmin, isViewer]
  );

  const sorgu = tr(q.trim());
  const sonuc = sorgu
    ? gruplar.flatMap(g => g.items.filter(i => tr(i.label).includes(sorgu)))
    : null;

  const Karo = ({ item }) => {
    const ic = (<>
      <span style={{ fontSize: 20 }}>{item.icon}</span>
      <span style={{ fontSize: 13, fontWeight: 700 }}>{item.label}</span>
      {item.external && <span style={{ marginLeft: "auto", color: "#666", fontSize: 12 }}>↗</span>}
    </>);
    const stil = {
      display: "flex", alignItems: "center", gap: 10, padding: "13px 14px",
      background: "#161616", border: "1px solid #2A2A2A", borderRadius: 12,
      color: "#F0EDE8", textDecoration: "none", fontFamily: cv,
    };
    if (item.external) {
      return (<a href={item.to} target="_blank" rel="noreferrer" style={stil}>{ic}</a>);
    }
    return (<NavLink to={item.to} style={stil}>{ic}</NavLink>);
  };

  return (
    <div style={{ fontFamily: cv, color: "#F0EDE8", maxWidth: 560, margin: "0 auto" }}>
      <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 12 }}>Menü</div>

      <input
        value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 Sayfa ara…"
        style={{ width: "100%", padding: "12px 14px", background: "#0F0F0F", border: "1px solid #2A2A2A",
                 borderRadius: 12, color: "#F0EDE8", fontSize: 14, outline: "none", fontFamily: cv, marginBottom: 16 }}
      />

      {sonuc ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {sonuc.length === 0
            ? <div style={{ gridColumn: "1/-1", color: "#777", fontSize: 13, padding: 8 }}>Eşleşen sayfa yok.</div>
            : sonuc.map(i => <Karo key={i.to} item={i} />)}
        </div>
      ) : (
        gruplar.map(g => (
          <div key={g.ad} style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 10, letterSpacing: "2px", fontWeight: 800, marginBottom: 8,
                          color: "#8A8580" }}>
              {g.ad}{g.sari ? " — SAHİP" : ""}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {g.items.map(i => <Karo key={i.to} item={i} />)}
            </div>
          </div>
        ))
      )}

      <div style={{ marginTop: 26, paddingTop: 16, borderTop: "1px solid #2A2A2A",
                    display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 38, height: 38, borderRadius: "50%", background: "#222222",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      color: "#FFFFFF", fontWeight: 800, fontSize: 16 }}>
          {staffUser?.name?.[0] || "?"}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{staffUser?.name}</div>
          <div style={{ fontSize: 11, color: "#8A8580" }}>{staffUser?.display_role || staffUser?.role}</div>
        </div>
        <button
          onClick={async () => { await signOut(); navigate("/login"); }}
          style={{ padding: "10px 16px", background: "transparent", color: "#C87A6A",
                   border: "1px solid #2A2A2A", borderRadius: 10, fontSize: 13, fontWeight: 700,
                   cursor: "pointer", fontFamily: cv }}>
          Çıkış yap
        </button>
      </div>
    </div>
  );
}
