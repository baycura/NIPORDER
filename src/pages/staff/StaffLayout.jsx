import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { APP_HOST } from "../../lib/appUrl.js";
import { useState, useEffect, useRef } from "react";
import { useAuth } from "../../contexts/AuthContext.jsx";
import { gorunurGruplar, altBar } from "../../lib/panelNav.js";

const roleColor = {admin:"#FFFFFF", manager:"#FFFFFF", owner:"#FFFFFF", waiter:"#FFFFFF", kitchen:"#FFFFFF", cashier:"#8A8580", viewer:"#8A8580", parttime:"#8A8580"};
const cv = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";

// Duzen: mobilde 5 yuvali rol-bazli alt bar (cekmece yok — her sey MENU
// sekmesindeki HubPage'de), masaustunde gruplu akordeon kenar menusu.
// Menu tanimi tek yerde: src/lib/panelNav.js.
export default function StaffLayout() {
  const {staffUser, isManager, isAdmin, isViewer, isParttime, signOut} = useAuth();
  const navigate = useNavigate();
  const color = roleColor[staffUser?.role] || "#888";
  const displayRole = staffUser?.display_role || "Yönetici";
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" ? window.innerWidth < 900 : true);
  // Akordeon: son acilan grup hatirlanir; ilk grup varsayilan acik
  const [acikGrup, setAcikGrup] = useState(() => {
    try { return localStorage.getItem("nip_panel_grup") || "GÜNLÜK İŞLER"; } catch (e) { return "GÜNLÜK İŞLER"; }
  });
  const grupAc = (ad) => {
    const yeni = acikGrup === ad ? "" : ad;
    setAcikGrup(yeni);
    try { localStorage.setItem("nip_panel_grup", yeni); } catch (e) { /* yoksay */ }
  };

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 900);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Kenardan kaydirma ile ileri/geri (mobil)
  const swipeRef = useRef(null);
  const onTouchStart = (e) => {
    const t = e.touches[0];
    const edge = t.clientX < 36 ? "L" : (window.innerWidth - t.clientX < 36 ? "R" : null);
    swipeRef.current = edge ? { x: t.clientX, y: t.clientY, edge, at: Date.now() } : null;
  };
  const onTouchEnd = (e) => {
    const s = swipeRef.current; swipeRef.current = null;
    if (!s) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - s.x, dy = Math.abs(t.clientY - s.y);
    if (Date.now() - s.at > 600 || dy > 70) return;
    if (s.edge === "L" && dx > 60) navigate(-1);
    else if (s.edge === "R" && dx < -60) navigate(1);
  };

  const sekmeler = altBar({ isManager, isAdmin, isViewer, isParttime });
  const gruplar = gorunurGruplar({ role: staffUser?.role, isManager, isAdmin, isViewer });

  const linkStyle = (isActive) => ({display:"flex",alignItems:"center",gap:10,padding:"9px 12px",borderRadius:9,textDecoration:"none",background:isActive?"rgba(255,255,255,0.18)":"transparent",color:isActive?"#FFFFFF":"#aaa",fontFamily:cv,fontSize:13.5,fontWeight:isActive?700:500});

  const KenarLink = ({item}) => {
    if (item.external) {
      return (<a href={item.to} target="_blank" rel="noreferrer" style={linkStyle(false)}>
        <span style={{fontSize:16,width:20,textAlign:"center"}}>{item.icon}</span>{item.label} ↗
      </a>);
    }
    return (<NavLink to={item.to} style={({isActive}) => linkStyle(isActive)}>
      <span style={{fontSize:16,width:20,textAlign:"center"}}>{item.icon}</span>{item.label}
    </NavLink>);
  };

  const Sidebar = () => (
    <div style={{width:240,background:"#161616",height:"100vh",display:"flex",flexDirection:"column",borderRight:"1px solid #2A2A2A",overflowY:"auto"}}>
      <div style={{padding:"18px 16px 14px",borderBottom:"1px solid #2A2A2A",display:"flex",alignItems:"center",gap:10}}>
        <div style={{width:38,height:38,borderRadius:10,background:"#FFFFFF",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,color:"#000",fontWeight:900,fontFamily:cv}}>N</div>
        <div>
          <div style={{color:"#F0EDE8",fontSize:16,fontWeight:400,fontFamily:"'Coolvetica Heavy',"+cv,textTransform:"uppercase",letterSpacing:"0.005em"}}>Not in Paris</div>
          <div style={{color:"#888",fontSize:10,fontFamily:cv}}>{APP_HOST}</div>
        </div>
      </div>
      <nav style={{padding:"10px 8px",display:"flex",flexDirection:"column",gap:4,flex:1}}>
        {isManager && !isViewer && (
          <NavLink to="/today" style={({isActive}) => ({...linkStyle(isActive),fontWeight:800})}>
            <span style={{fontSize:16,width:20,textAlign:"center"}}>🏠</span>Bugün
          </NavLink>
        )}
        {gruplar.map(g => {
          const acik = acikGrup === g.ad;
          return (
            <div key={g.ad}>
              <button onClick={() => grupAc(g.ad)}
                style={{width:"100%",display:"flex",alignItems:"center",gap:8,padding:"9px 12px",borderRadius:9,
                        background:"#1B1B1B",border:"none",cursor:"pointer",fontFamily:cv,
                        fontSize:10.5,letterSpacing:"1.6px",fontWeight:800,
                        color: g.sari ? "#8A8580" : "#B8B3AC"}}>
                {g.ad}
                <span style={{marginLeft:"auto",color:"#666",fontSize:10}}>{acik ? "▾" : "▸"}</span>
              </button>
              {acik && (
                <div style={{display:"flex",flexDirection:"column",gap:1,padding:"4px 0 4px 6px"}}>
                  {g.items.map(i => <KenarLink key={i.to} item={i}/>)}
                </div>
              )}
            </div>
          );
        })}
      </nav>
      <div style={{padding:14,borderTop:"1px solid #2A2A2A",display:"flex",alignItems:"center",gap:10}}>
        <div style={{width:34,height:34,borderRadius:"50%",background:color+"33",display:"flex",alignItems:"center",justifyContent:"center",color,fontSize:15,fontWeight:700,fontFamily:cv}}>{staffUser?.name?.[0]||"?"}</div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{color:"#F0EDE8",fontSize:13,fontWeight:700,fontFamily:cv,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{staffUser?.name}</div>
          <div style={{color,fontSize:10,letterSpacing:"1px",fontFamily:cv,fontWeight:600}}>{displayRole?.toUpperCase()}</div>
        </div>
        <button onClick={async()=>{await signOut();navigate("/login");}} title="Çıkış" aria-label="Çıkış" style={{background:"none",border:"none",color:"#666",fontSize:18,cursor:"pointer",padding:6}}>🚪</button>
      </div>
    </div>
  );

  if (!isMobile) {
    return (<div style={{display:"flex",background:"#0C0C0C",minHeight:"100vh"}}>
      <aside style={{position:"fixed",left:0,top:0,zIndex:50}}><Sidebar/></aside>
      <main style={{marginLeft:240,flex:1,padding:"28px 32px",overflowY:"auto",maxHeight:"100vh"}}><Outlet/></main>
    </div>);
  }

  // Avatar kisayolu: vardiya sayfasi olan roller icin Vardiyam'a gider
  const avatarTikla = (!isViewer && !isParttime) ? () => navigate("/myshift") : undefined;

  return (<div style={{background:"#0C0C0C",minHeight:"100vh",fontFamily:cv}} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
    <header style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 14px",background:"#161616",borderBottom:"1px solid #2A2A2A",position:"sticky",top:0,zIndex:40}}>
      <div style={{display:"flex",alignItems:"center",gap:8}}>
        <div style={{width:30,height:30,borderRadius:8,background:"#FFFFFF",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,color:"#000",fontWeight:900}}>N</div>
        <div style={{color:"#F0EDE8",fontSize:15,fontWeight:400,fontFamily:"'Coolvetica Heavy',"+cv,textTransform:"uppercase",letterSpacing:"0.005em"}}>Not in Paris</div>
      </div>
      <div onClick={avatarTikla} title={avatarTikla ? "Vardiyam" : undefined}
           style={{width:30,height:30,borderRadius:"50%",background:color+"33",display:"flex",alignItems:"center",justifyContent:"center",color,fontSize:13,fontWeight:700,cursor:avatarTikla?"pointer":"default"}}>
        {staffUser?.name?.[0]||"?"}
      </div>
    </header>
    <main style={{padding:"16px 14px",paddingBottom:84,minHeight:"calc(100vh - 56px)"}}><Outlet/></main>
    <nav style={{position:"fixed",bottom:0,left:0,right:0,background:"#161616",borderTop:"1px solid #2A2A2A",display:"flex",justifyContent:"space-around",padding:"8px 0 14px",zIndex:35,boxShadow:"0 -2px 12px rgba(0,0,0,0.5)"}}>
      {sekmeler.map(item => (
        <NavLink key={item.to} to={item.to} style={({isActive}) => ({display:"flex",flexDirection:"column",alignItems:"center",gap:3,textDecoration:"none",color:isActive?"#FFFFFF":"#666",padding:"4px 8px",minWidth:48})}>
          <span style={{fontSize:22}}>{item.icon}</span>
          <span style={{fontSize:10,letterSpacing:"0.5px",fontWeight:600}}>{item.label.toLocaleUpperCase("tr-TR")}</span>
        </NavLink>
      ))}
    </nav>
  </div>);
}
