import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext.jsx";

const cv  = "'Coolvetica','Bebas Neue',sans-serif";
const cvc = "'Coolvetica Condensed','Barlow Condensed',sans-serif";

const STAFF_NAV = [
  {to:"/tables",  icon:"🪑", label:"Masalar"},
  {to:"/orders",  icon:"📋", label:"Siparisler"},
  {to:"/kitchen", icon:"🍳", label:"Mutfak"},
  {to:"/payment", icon:"💰", label:"Kasa"},
  {to:"/stock",   icon:"📦", label:"Stok"},
  {to:"/myshift", icon:"📊", label:"Vardiyam"},
];

const MANAGER_NAV = [
  {to:"/stock-mgmt", icon:"📦", label:"Stok Yonetimi"},
  {to:"/staff-mgmt", icon:"👥", label:"Personel"},
  {to:"/happy-hour", icon:"🎉", label:"Happy Hour"},
  {to:"/reports",    icon:"📈", label:"Raporlar"},
  {to:"/members",    icon:"🌟", label:"Uyeler"},
  {to:"/merch-mgmt", icon:"👕", label:"Uyeler"},
  {to:"/settings",   icon:"⚙",   label:"Ayarlar"},
];

const roleColor  = {manager:"#C8973E", owner:"#C8973E", waiter:"#3ECF8E", kitchen:"#E07A3E", cashier:"#5A8FE0"};
const roleLabel  = {manager:"Yonetici", owner:"Yonetici", waiter:"Garson", kitchen:"Mutfak", cashier:"Kasiyer"};

export default function StaffLayout() {
  const {staffUser, isManager, signOut} = useAuth();
  const navigate = useNavigate();
  const color = roleColor[staffUser?.role] || "#888";

  return (
    <div style={{display:"flex",background:"#0C0C0C",minHeight:"100vh"}}>
      <aside style={{width:220,background:"#161616",borderRight:"1px solid #2A2A2A",height:"100vh",display:"flex",flexDirection:"column",position:"fixed",left:0,top:0,zIndex:50,overflowY:"auto"}}>
        <div style={{padding:"18px 16px 14px",borderBottom:"1px solid #2A2A2A"}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:36,height:36,borderRadius:10,background:"#C8973E",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:cv,fontSize:20,color:"#000"}}>N</div>
            <div>
              <div style={{color:"#F0EDE8",fontFamily:cv,fontSize:16}}>NotInParis</div>
              <div style={{color:"#888",fontFamily:cvc,fontSize:9,letterSpacing:"1px"}}>order.notinparis.me</div>
            </div>
          </div>
        </div>
        <nav style={{padding:"10px 8px",display:"flex",flexDirection:"column",gap:2}}>
          {STAFF_NAV.map(item => (
            <NavLink key={item.to} to={item.to} style={({isActive}) => ({display:"flex",alignItems:"center",gap:9,padding:"9px 10px",borderRadius:8,textDecoration:"none",background:isActive?"rgba(200,151,62,0.12)":"transparent",color:isActive?"#C8973E":"#888",fontFamily:cvc,fontSize:13})}>
              <span style={{fontSize:15}}>{item.icon}</span>{item.label}
            </NavLink>
          ))}
          {isManager && (<>
            <div style={{height:1,background:"#2A2A2A",margin:"8px 4px"}}/>
            {MANAGER_NAV.map(item => (
              <NavLink key={item.to} to={item.to} style={({isActive}) => ({display:"flex",alignItems:"center",gap:9,padding:"9px 10px",borderRadius:8,textDecoration:"none",background:isActive?"rgba(200,151,62,0.12)":"transparent",color:isActive?"#C8973E":"#888",fontFamily:cvc,fontSize:13})}>
                <span style={{fontSize:15}}>{item.icon}</span>{item.label}
              </NavLink>
            ))}
          </>)}
        </nav>
        <div style={{flex:1}}/>
        <div style={{padding:"12px",borderTop:"1px solid #2A2A2A"}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:32,height:32,borderRadius:"50%",background:color+"33",display:"flex",alignItems:"center",justifyContent:"center",color,fontFamily:cv,fontSize:16}}>{staffUser?.name?.[0]||"?"}</div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{color:"#F0EDE8",fontFamily:cvc,fontSize:12,fontWeight:700}}>{staffUser?.name}</div>
              <div style={{color,fontFamily:cvc,fontSize:9,letterSpacing:"1px"}}>{roleLabel[staffUser?.role]||staffUser?.role}</div>
            </div>
            <button onClick={async()=>{await signOut();navigate("/login");}} style={{background:"none",border:"none",color:"#444",fontSize:16,cursor:"pointer"}}>×</button>
          </div>
        </div>
      </aside>
      <main style={{marginLeft:220,flex:1,padding:"28px 32px",overflowY:"auto",maxHeight:"100vh"}}><Outlet/></main>
    </div>
  );
}
