import { useEffect, useState, useMemo } from "react";
import { supabase } from "../../lib/supabase.js";
import { useAuth } from "../../contexts/AuthContext.jsx";

const cv = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";

export default function CustomerMenu() {
  const { customer, signInWithGoogle, signOut } = useAuth();
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [selectedCat, setSelectedCat] = useState(null);
  const [hh, setHh] = useState(null);
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(new Date());

  const load = async () => {
    setLoading(true);
    const [{data: cats}, {data: prods}, hhRes, {data: setts}] = await Promise.all([
      supabase.from("categories").select("*").eq("is_active", true).order("sort_order"),
      supabase.from("products").select("*").eq("is_available", true).order("sort_order"),
      supabase.rpc("get_active_happy_hour").then(r=>r).catch(()=>({data:null})),
      supabase.from("app_settings").select("*"),
    ]);
    if (cats) setCategories(cats);
    if (prods) setProducts(prods);
    if (hhRes?.data?.[0]) setHh(hhRes.data[0]);
    const obj = {};
    (setts || []).forEach(s => { obj[s.key] = s.value; });
    setSettings(obj);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  // Party mode active?
  const partyEnabled = settings.party_mode_enabled === true || settings.party_mode_enabled === "true";
  const partyFrom = settings.party_mode_from || "22:00";
  const partyUntil = settings.party_mode_until || "04:00";
  const isPartyTime = (() => {
    if (!partyEnabled) return false;
    const cur = now.getHours() * 60 + now.getMinutes();
    const [fh, fm] = partyFrom.split(":").map(Number);
    const [uh, um] = partyUntil.split(":").map(Number);
    const f = fh*60 + fm;
    const u = uh*60 + um;
    if (f < u) return cur >= f && cur < u;
    return cur >= f || cur < u; // overnight
  })();

  const memberPct = customer && (settings.member_discount_enabled===true||settings.member_discount_enabled==="true") ? Number(settings.member_discount_pct)||0 : 0;
  const adminDiscount = Number(customer?.admin_discount) || 0;

  const calcPrice = (p) => {
    let pct = 0;
    if (hh && (hh.category_ids?.length === 0 || hh.category_ids?.includes(p.category_id))) pct = Number(hh.discount_pct);
    if (Number(p.instant_discount_pct) > pct) pct = Number(p.instant_discount_pct);
    const userPct = adminDiscount > 0 ? adminDiscount : memberPct;
    if (userPct > pct) pct = userPct;
    return Math.round(Number(p.price) * (100 - pct) / 100);
  };

  // Category time check
  const isCategoryActive = (c) => {
    if (!c.available_from || !c.available_until) return true;
    const cur = now.getHours() * 60 + now.getMinutes();
    const [fh, fm] = c.available_from.split(":").map(Number);
    const [uh, um] = c.available_until.split(":").map(Number);
    const f = fh*60 + fm;
    const u = uh*60 + um;
    if (f < u) return cur >= f && cur < u;
    return cur >= f || cur < u;
  };

  const visibleCategories = useMemo(() => {
    return categories;
  }, [categories]);

  useEffect(() => {
    if (visibleCategories.length && !selectedCat) setSelectedCat(visibleCategories[0].id);
  }, [visibleCategories]);

  const visibleProducts = products.filter(p => {
    if (p.category_id !== selectedCat) return false;
    // In party time, filter by show_in_party_menu
    if (isPartyTime && !p.show_in_party_menu) return false;
    return true;
  });

  const selectedCatObj = categories.find(c => c.id === selectedCat);
  const catActive = selectedCatObj ? isCategoryActive(selectedCatObj) : true;

  if (loading) {
    return (<div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#fafafa",color:"#888",fontFamily:cv,fontSize:13,letterSpacing:"2px"}}>YUKLENIYOR...</div>);
  }

  return (
    <div style={{minHeight:"100vh",background:"#fafafa",color:"#000",fontFamily:cv,paddingBottom:80}}>
      {/* Sticky header */}
      <header style={{position:"sticky",top:0,zIndex:30,background:"#fff",borderBottom:"1px solid #eee",padding:"14px 18px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div>
          <div style={{fontSize:16,fontWeight:800,letterSpacing:"1px"}}>NOT IN PARIS</div>
          {isPartyTime && <div style={{fontSize:9,color:"#C8973E",letterSpacing:"2px",fontWeight:700,marginTop:2}}>🎉 PARTI MENUSU AKTIF</div>}
        </div>
        {customer ? (
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:12,fontWeight:600}}>{customer.name?.split(" ")[0]}</div>
              {(memberPct > 0 || adminDiscount > 0) && <div style={{fontSize:9,color:"#C8973E",fontWeight:700}}>-%{adminDiscount > 0 ? adminDiscount : memberPct}</div>}
            </div>
            {customer.avatar_url && <img src={customer.avatar_url} alt="" style={{width:30,height:30,borderRadius:"50%"}}/>}
          </div>
        ) : (
          <button onClick={signInWithGoogle} style={{padding:"6px 12px",background:"#000",color:"#fff",border:"none",borderRadius:6,fontSize:11,fontWeight:600,cursor:"pointer"}}>Google Giris</button>
        )}
      </header>

      {/* Categories pills */}
      <div style={{padding:"12px 18px 4px",overflowX:"auto",display:"flex",gap:8,position:"sticky",top:54,background:"#fafafa",zIndex:25}}>
        {visibleCategories.map(c => {
          const active = isCategoryActive(c);
          return (
            <button key={c.id} onClick={()=>setSelectedCat(c.id)} style={{flexShrink:0,padding:"8px 14px",border:"1px solid "+(selectedCat===c.id?"#000":"#ddd"),borderRadius:20,fontSize:11,fontWeight:700,letterSpacing:"1px",background:selectedCat===c.id?"#000":"#fff",color:selectedCat===c.id?"#fff":(active?"#333":"#aaa"),cursor:"pointer",whiteSpace:"nowrap",opacity:active?1:0.5}}>
              {c.icon && <span style={{marginRight:4}}>{c.icon}</span>}{c.name?.toUpperCase()}
              {!active && <span style={{marginLeft:6,fontSize:9}}>(KAPALI)</span>}
            </button>
          );
        })}
      </div>

      {/* Category-level closed warning */}
      {selectedCatObj && !catActive && (
        <div style={{margin:"10px 18px",padding:"12px 14px",background:"#fff8e6",border:"1px solid #f0d090",borderRadius:8,fontSize:12,color:"#806020"}}>
          🕧 Bu menu su an kapali. Acilis: <strong>{selectedCatObj.available_from?.substring(0,5)} - {selectedCatObj.available_until?.substring(0,5)}</strong>
        </div>
      )}

      {/* Products */}
      <div style={{padding:"6px 18px"}}>
        {visibleProducts.map(p => {
          const fp = calcPrice(p);
          const dis = fp < Number(p.price);
          const soldOut = p.sold_out_today;
          const dimmed = soldOut || (selectedCatObj && !isCategoryActive(selectedCatObj));
          return (
            <div key={p.id} style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",padding:"14px 0",borderBottom:"1px solid #eee",opacity:dimmed?0.4:1}}>
              <div style={{flex:1,minWidth:0,paddingRight:12}}>
                <div style={{fontSize:14,fontWeight:600,color:"#000",textDecoration:soldOut?"line-through":"none"}}>{p.name}</div>
                {p.description && <div style={{fontSize:11,color:"#777",marginTop:3,lineHeight:1.4}}>{p.description}</div>}
                {soldOut && <div style={{fontSize:10,color:"#c00",letterSpacing:"1px",fontWeight:700,marginTop:4,padding:"2px 6px",background:"#fee",border:"1px solid #fcc",borderRadius:4,display:"inline-block"}}>{p.unavailable_reason ? p.unavailable_reason.toUpperCase() : "TUKENDI"}</div>}
                {p.has_options && !soldOut && <div style={{fontSize:10,color:"#888",letterSpacing:"1px",marginTop:3}}>SECENEKLI</div>}
              </div>
              <div style={{textAlign:"right",flexShrink:0}}>
                {dis ? (<>
                  <div style={{fontSize:11,color:"#999",textDecoration:"line-through"}}>₺{p.price}</div>
                  <div style={{fontSize:14,fontWeight:700,color:"#c80"}}>₺{fp}</div>
                </>) : (
                  <div style={{fontSize:14,fontWeight:700,color:"#000"}}>₺{fp}</div>
                )}
              </div>
            </div>
          );
        })}
        {visibleProducts.length === 0 && (
          <div style={{textAlign:"center",padding:60,color:"#aaa",fontSize:13}}>
            {isPartyTime ? "Bu kategoride parti urunu yok" : "Bu kategoride urun yok"}
          </div>
        )}
      </div>

      {/* Bottom nav */}
      <nav style={{position:"fixed",bottom:0,left:0,right:0,background:"#fff",borderTop:"1px solid #eee",padding:"10px 18px env(safe-area-inset-bottom) 18px",display:"flex",justifyContent:"space-around"}}>
        <a href="https://www.instagram.com/notinparis.cafe" target="_blank" rel="noreferrer" style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3,textDecoration:"none",color:"#666",fontSize:10,fontWeight:600}}>
          <span style={{fontSize:18}}>📷</span>INSTAGRAM
        </a>
        <a href="https://maps.google.com/?q=Not+In+Paris+Antalya" target="_blank" rel="noreferrer" style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3,textDecoration:"none",color:"#666",fontSize:10,fontWeight:600}}>
          <span style={{fontSize:18}}>📍</span>YOL TARIFI
        </a>
        {customer && (
          <button onClick={signOut} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3,background:"none",border:"none",color:"#666",fontSize:10,fontWeight:600,cursor:"pointer"}}>
            <span style={{fontSize:18}}>⭳</span>CIKIS
          </button>
        )}
      </nav>
    </div>
  );
}
