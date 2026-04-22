import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { useAuth } from "../../contexts/AuthContext.jsx";

const STAFF_NAV = [
  {to:"/tables",  icon:"🪑", label:"Masalar"},
  {to:"/orders",  icon:"📋", label:"Sipariş"},
  {to:"/kitchen", icon:"🍳", label:"Mutfak"},
  {to:"/payment", icon:"💰", label:"Kasa"},
];

const STAFF_NAV_EXTRA = [
  {to:"/stock",   icon:"📦", label:"Stok"},
  {to:"/myshift", icon:"📊", label:"Vardiyam"},
];

const MANAGER_NAV = [
  {to:"/menu-mgmt",   icon:"🍽", label:"Menü Yönetimi"},
  {to:"/tables-mgmt", icon:"🪑", label:"Masa Yönetimi"},
  {to:"/stock-mgmt",  icon:"📦", label:"Stok Yönetimi"},
  {to:"/staff-mgmt",  icon:"👥", label:"Personel"},
  {to:"/members",     icon:"🌟", label:"Üyeler & Borç"},
  {to:"/happy-hour",  icon:"🎉", label:"Happy Hour"},
  {to:"/merch-mgmt",  icon:"👕", label:"Merch"},
  {to:"/settings",    icon:"⚙",   label:"Ayarlar"},
];

const ADMIN_NAV = [
  {to:"/reports",          icon:"📈", label:"Raporlar"},
  {to:"/kitchen-display",  icon:"📺", label:"Mutfak Ekranı (Tablet)", external:true},
];

const roleColor = {admin:"#FFD700", manager:"#C8973E", owner:"#C8973E", waiter:"#3ECF8E", kitchen:"#E07A3E", cashier:"#5A8FE0"};

export default function StaffLayout() {
  const {staffUser, isManager, isAdmin, signOut} = useAuth();
  const navigate = useNavigate();
  const color = roleColor[staffUser?.role] || "#888";
  const displayRole = staffUser?.display_role || "Yönetici";
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" ? window.innerWidth < 900 : true);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 900);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const cv = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";
  const linkStyle = (isActive) => ({display:"flex",alignItems:"center",gap:12,padding:"12px 14px",borderRadius:10,textDecoration:"none",background:isActive?"rgba(200,151,62,0.18)":"transparent",color:isActive?"#C8973E":"#aaa",fontFamily:cv,fontSize:14,fontWeight:isActive?700:500});

  const NavItem = ({item, onClick}) => {
    if (item.external) {
      return (<a href={item.to} target="_blank" rel="noreferrer" onClick={onClick} style={linkStyle(false)}>
        <span style={{fontSize:18,width:22,textAlign:"center"}}>{item.icon}</span>{item.label} ↗
      </a>);
    }
    return (<NavLink to={item.to} onClick={onClick} style={({isActive}) => linkStyle(isActive)}>
      <span style={{fontSize:18,width:22,textAlign:"center"}}>{item.icon}</span>{item.label}
    </NavLink>);
  };

  const Sidebar = ({mobile}) => (
    <div style={{width:mobile?"82vw":240,maxWidth:320,background:"#161616",height:"100vh",display:"flex",flexDirection:"column",borderRight:mobile?"none":"1px solid #2A2A2A",overflowY:"auto"}}>
      <div style={{padding:"18px 16px 14px",borderBottom:"1px solid #2A2A2A",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:38,height:38,borderRadius:10,background:"#C8973E",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,color:"#000",fontWeight:900,fontFamily:cv}}>N</div>
          <div>
            <div style={{color:"#F0EDE8",fontSize:15,fontWeight:700,fontFamily:cv}}>NotInParis</div>
            <div style={{color:"#888",fontSize:10,fontFamily:cv}}>order.notinparis.me</div>
          </div>
        </div>
        {mobile && <button onClick={()=>setDrawerOpen(false)} style={{background:"none",border:"none",color:"#888",fontSize:24,cursor:"pointer",padding:4}}>×</button>}
      </div>
      <nav style={{padding:"10px 8px",display:"flex",flexDirection:"column",gap:3,flex:1}}>
        {[...STAFF_NAV, ...STAFF_NAV_EXTRA].map(item => <NavItem key={item.to} item={item} onClick={mobile?()=>setDrawerOpen(false):undefined}/>)}
        {isManager && (<>
          <div style={{height:1,background:"#2A2A2A",margin:"10px 8px"}}/>
          <div style={{padding:"4px 14px",fontSize:10,letterSpacing:"2px",color:"#666",fontFamily:cv,fontWeight:700}}>YÖNETİM</div>
          {MANAGER_NAV.map(item => <NavItem key={item.to} item={item} onClick={mobile?()=>setDrawerOpen(false):undefined}/>)}
        </>)}
        {isAdmin && (<>
          <div style={{height:1,background:"#3A2A2A",margin:"10px 8px"}}/>
          <div style={{padding:"4px 14px",fontSize:10,letterSpacing:"2px",color:"#FFD700",fontFamily:cv,fontWeight:700}}>SAHİP</div>
          {ADMIN_NAV.map(item => <NavItem key={item.to} item={item} onClick={mobile && !item.external?()=>setDrawerOpen(false):undefined}/>)}
        </>)}
      </nav>
      <div style={{padding:14,borderTop:"1px solid #2A2A2A",display:"flex",alignItems:"center",gap:10}}>
        <div style={{width:34,height:34,borderRadius:"50%",background:color+"33",display:"flex",alignItems:"center",justifyContent:"center",color,fontSize:15,fontWeight:700,fontFamily:cv}}>{staffUser?.name?.[0]||"?"}</div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{color:"#F0EDE8",fontSize:13,fontWeight:700,fontFamily:cv,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{staffUser?.name}</div>
          <div style={{color,fontSize:10,letterSpacing:"1px",fontFamily:cv,fontWeight:600}}>{displayRole?.toUpperCase()}</div>
        </div>
        <button onClick={async()=>{await signOut();navigate("/login");}} style={{background:"none",border:"none",color:"#666",fontSize:18,cursor:"pointer",padding:6}}>⭳</button>
      </div>
    </div>
  );

  if (!isMobile) {
    return (<div style={{display:"flex",background:"#0C0C0C",minHeight:"100vh"}}>
      <aside style={{position:"fixed",left:0,top:0,zIndex:50}}><Sidebar/></aside>
      <main style={{marginLeft:240,flex:1,padding:"28px 32px",overflowY:"auto",maxHeight:"100vh"}}><Outlet/></main>
    </div>);
  }

  return (<div style={{background:"#0C0C0C",minHeight:"100vh",fontFamily:cv}}>
    <header style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 14px",background:"#161616",borderBottom:"1px solid #2A2A2A",position:"sticky",top:0,zIndex:40}}>
      <button onClick={()=>setDrawerOpen(true)} style={{background:"none",border:"none",color:"#F0EDE8",cursor:"pointer",padding:6,display:"flex",flexDirection:"column",gap:4}}>
        <div style={{width:22,height:2,background:"#F0EDE8"}}/>
        <div style={{width:22,height:2,background:"#F0EDE8"}}/>
        <div style={{width:22,height:2,background:"#F0EDE8"}}/>
      </button>
      <div style={{display:"flex",alignItems:"center",gap:8}}>
        <div style={{width:30,height:30,borderRadius:8,background:"#C8973E",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,color:"#000",fontWeight:900}}>N</div>
        <div style={{color:"#F0EDE8",fontSize:14,fontWeight:700}}>NotInParis</div>
      </div>
      <div style={{width:30,height:30,borderRadius:"50%",background:color+"33",display:"flex",alignItems:"center",justifyContent:"center",color,fontSize:13,fontWeight:700}}>{staffUser?.name?.[0]||"?"}</div>
    </header>
    <main style={{padding:"16px 14px",paddingBottom:80,minHeight:"calc(100vh - 56px)"}}><Outlet/></main>
    <nav style={{position:"fixed",bottom:0,left:0,right:0,background:"#161616",borderTop:"1px solid #2A2A2A",display:"flex",justifyContent:"space-around",padding:"8px 0 14px",zIndex:35,boxShadow:"0 -2px 12px rgba(0,0,0,0.5)"}}>
      {STAFF_NAV.map(item => (
        <NavLink key={item.to} to={item.to} style={({isActive}) => ({display:"flex",flexDirection:"column",alignItems:"center",gap:3,textDecoration:"none",color:isActive?"#C8973E":"#666",padding:"4px 10px",minWidth:50})}>
          <span style={{fontSize:22}}>{item.icon}</span>
          <span style={{fontSize:10,letterSpacing:"0.5px",fontWeight:600}}>{item.label}</span>
        </NavLink>
      ))}
    </nav>
    {drawerOpen && (
      <div onClick={()=>setDrawerOpen(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:80,backdropFilter:"blur(2px)"}}>
        <div onClick={(e)=>e.stopPropagation()} style={{position:"fixed",left:0,top:0,bottom:0,zIndex:90,boxShadow:"4px 0 20px rgba(0,0,0,0.5)"}}>
          <Sidebar mobile/>
        </div>
      </div>
    )}
  </div>);
}
