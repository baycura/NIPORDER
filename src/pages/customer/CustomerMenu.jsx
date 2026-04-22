import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../../lib/supabase.js";
import { useAuth } from "../../contexts/AuthContext.jsx";

const I18N = {
  en: { menu:"MENU", merch:"MERCH", rides:"RIDES", nights:"NIGHTS", signin:"Sign in with Google", happyhour:"HAPPY HOUR", member:"Member", soon:"Coming soon" },
  tr: { menu:"MENU", merch:"URUNLER", rides:"RIDES", nights:"NIGHTS", signin:"Google ile giris", happyhour:"HAPPY HOUR", member:"Uye", soon:"Cok yakinda" },
};

function GoogleIcon({size=16}) {
  return (<svg width={size} height={size} viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.5-5.9 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.7 1.1 7.8 3l5.7-5.7C33.6 5.5 29 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3 0 5.7 1.1 7.8 3l5.7-5.7C33.6 5.5 29 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5 0 9.5-1.9 12.9-5l-5.9-5c-2 1.4-4.5 2.2-7 2.2-5.4 0-10-3.5-11.6-8.4l-6.5 5C9.4 39.5 16 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4 5.5l5.9 5c-.4.4 6.8-5 6.8-14.5 0-1.3-.1-2.4-.4-3.5z"/></svg>);
}

export default function CustomerMenu() {
  const { qrToken } = useParams();
  const { customer, signInWithGoogle, signOut } = useAuth();

  const [lang, setLang] = useState("en");
  const t = I18N[lang];

  const [tab, setTab] = useState("menu");
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [selectedCat, setSelectedCat] = useState(null);
  const [cart, setCart] = useState([]);

  const [hh, setHh] = useState(null);
  const [memberOn, setMemberOn] = useState(false);
  const [memberPct, setMemberPct] = useState(0);

  useEffect(() => { (async () => {
    const [{data: cats}, {data: prods}, {data: settings}, {data: hhData}] = await Promise.all([
      supabase.from("categories").select("*").eq("is_active", true).order("sort_order"),
      supabase.from("products").select("*").eq("is_available", true).eq("is_out_of_stock", false).order("sort_order"),
      supabase.from("app_settings").select("*"),
      supabase.rpc("get_active_happy_hour"),
    ]);
    if (cats) { setCategories(cats); if (cats.length) setSelectedCat(cats[0].id); }
    if (prods) setProducts(prods);
    if (settings) {
      const e = settings.find(s => s.key === "member_discount_enabled");
      const p = settings.find(s => s.key === "member_discount_pct");
      setMemberOn(e?.value === true || e?.value === "true");
      setMemberPct(Number(p?.value) || 0);
    }
    if (hhData?.[0]) setHh(hhData[0]);
  })(); }, []);

  const calcPrice = (p) => {
    let hhPct = 0, memPct = 0;
    if (hh && (hh.category_ids?.length === 0 || hh.category_ids?.includes(p.category_id))) {
      hhPct = Number(hh.discount_pct);
    }
    if (customer) {
      if (customer.admin_discount && customer.admin_discount > 0) memPct = Number(customer.admin_discount);
      else if (memberOn) memPct = memberPct;
    }
    const bestPct = Math.max(hhPct, memPct);
    const finalPrice = Math.round(Number(p.price) * (100 - bestPct) / 100);
    return { hhPct, memPct, bestPct, finalPrice, original: Number(p.price) };
  };

  const visibleProducts = products.filter(p => p.category_id === selectedCat);

  const addToCart = (p) => setCart(c => {
    const ex = c.find(x => x.id === p.id);
    if (ex) return c.map(x => x.id === p.id ? {...x, qty: x.qty + 1} : x);
    const pr = calcPrice(p);
    return [...c, {id: p.id, name: p.name, qty: 1, price: pr.finalPrice}];
  });

  return (
    <div style={{minHeight:"100vh",background:"#fafafa",fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif",paddingBottom:80,WebkitTapHighlightColor:"transparent"}}>
      {/* Top bar */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 16px",background:"#fff",borderBottom:"1px solid #eee",position:"sticky",top:0,zIndex:10}}>
        <div style={{display:"flex",gap:6}}>
          <button onClick={()=>setLang("en")} style={{padding:"5px 10px",border:"1px solid "+(lang==="en"?"#000":"#ddd"),background:lang==="en"?"#000":"#fff",color:lang==="en"?"#fff":"#666",fontSize:11,fontWeight:600,borderRadius:6,cursor:"pointer"}}>EN</button>
          <button onClick={()=>setLang("tr")} style={{padding:"5px 10px",border:"1px solid "+(lang==="tr"?"#000":"#ddd"),background:lang==="tr"?"#000":"#fff",color:lang==="tr"?"#fff":"#666",fontSize:11,fontWeight:600,borderRadius:6,cursor:"pointer"}}>TR</button>
        </div>
        {customer ? (
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            {customer.avatar_url && <img src={customer.avatar_url} alt="" style={{width:28,height:28,borderRadius:"50%"}}/>}
            <div style={{fontSize:12,color:"#000",fontWeight:600}}>{customer.name?.split(" ")[0]}</div>
            <button onClick={signOut} style={{background:"#f0f0f0",border:"none",color:"#666",fontSize:14,cursor:"pointer",width:24,height:24,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
          </div>
        ) : (
          <button onClick={()=>signInWithGoogle()} style={{display:"flex",alignItems:"center",gap:6,padding:"7px 12px",border:"1px solid #dadce0",background:"#fff",borderRadius:20,fontSize:12,color:"#3c4043",cursor:"pointer",fontWeight:500,boxShadow:"0 1px 2px rgba(0,0,0,0.05)"}}>
            <GoogleIcon size={16}/>{t.signin}
          </button>
        )}
      </div>

      {/* Title + member badge + HH badge */}
      <div style={{padding:"16px 20px 8px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
          <div style={{fontSize:32,fontWeight:900,letterSpacing:"1px",color:"#000",lineHeight:1}}>{t[tab]}</div>
          {customer && (
            <div style={{display:"inline-flex",alignItems:"center",gap:4,padding:"4px 10px",background:"#FFF3CD",color:"#7B5C00",fontSize:11,fontWeight:700,borderRadius:12,border:"1px solid #FFE08A"}}>
              ✨ {t.member}
            </div>
          )}
        </div>
        {hh && tab === "menu" && (
          <div style={{display:"inline-block",marginTop:8,padding:"5px 12px",background:"#000",color:"#FFD700",fontSize:11,letterSpacing:"2px",borderRadius:14,fontWeight:700}}>🔥 {t.happyhour}</div>
        )}
      </div>

      {/* Categories scroll */}
      {tab === "menu" && categories.length > 0 && (
        <div style={{display:"flex",gap:6,overflowX:"auto",padding:"8px 12px 12px",borderBottom:"1px solid #eee",WebkitOverflowScrolling:"touch",scrollbarWidth:"none"}} className="no-scrollbar">
          <style>{".no-scrollbar::-webkit-scrollbar{display:none}"}</style>
          {categories.map(c => (
            <button key={c.id} onClick={()=>setSelectedCat(c.id)} style={{flexShrink:0,padding:"8px 14px",border:"none",borderRadius:20,fontSize:12,fontWeight:700,letterSpacing:"0.5px",background:selectedCat===c.id?"#000":"#f0f0f0",color:selectedCat===c.id?"#fff":"#666",cursor:"pointer",whiteSpace:"nowrap"}}>
              {c.name?.toUpperCase()}
            </button>
          ))}
        </div>
      )}

      {/* Products */}
      {tab === "menu" && (
        <div style={{padding:"4px 0"}}>
          {visibleProducts.map(p => {
            const pr = calcPrice(p);
            const discounted = pr.bestPct > 0;
            return (
              <div key={p.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 20px",borderBottom:"1px solid #f0f0f0",background:"#fff"}}>
                <div style={{flex:1,paddingRight:12,minWidth:0}}>
                  <div style={{fontSize:15,fontWeight:700,color:"#000",lineHeight:1.3}}>{p.name}</div>
                  {p.description && <div style={{fontSize:12,color:"#888",marginTop:3,lineHeight:1.3}}>{p.description}</div>}
                </div>
                <div style={{display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
                  <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",lineHeight:1}}>
                    {discounted && (
                      <span style={{fontSize:11,color:"#999",textDecoration:"line-through",marginBottom:2}}>₺{pr.original}</span>
                    )}
                    <span style={{fontSize:16,fontWeight:800,color:discounted?"#D32F2F":"#000"}}>₺{pr.finalPrice}</span>
                  </div>
                  <button onClick={()=>addToCart(p)} style={{width:36,height:36,background:"#000",color:"#fff",border:"none",borderRadius:8,cursor:"pointer",fontSize:22,fontWeight:300,display:"flex",alignItems:"center",justifyContent:"center",lineHeight:1,padding:0}}>+</button>
                </div>
              </div>
            );
          })}
          {visibleProducts.length === 0 && categories.length > 0 && (
            <div style={{padding:60,textAlign:"center",color:"#999",fontSize:13,fontWeight:500}}>NO ITEMS</div>
          )}
          {categories.length === 0 && (
            <div style={{padding:60,textAlign:"center",color:"#999",fontSize:13}}>Loading...</div>
          )}
        </div>
      )}

      {tab !== "menu" && (
        <div style={{padding:80,textAlign:"center",color:"#999",fontSize:13,letterSpacing:"2px",fontWeight:600}}>{t.soon.toUpperCase()}</div>
      )}

      {/* Cart floating bar */}
      {cart.length > 0 && (
        <div style={{position:"fixed",bottom:74,left:12,right:12,background:"#000",color:"#fff",borderRadius:14,padding:"12px 18px",display:"flex",justifyContent:"space-between",alignItems:"center",boxShadow:"0 4px 16px rgba(0,0,0,0.3)",zIndex:20}}>
          <div>
            <div style={{fontSize:11,opacity:0.7,letterSpacing:"1px"}}>{cart.reduce((s,i)=>s+i.qty,0)} item{cart.reduce((s,i)=>s+i.qty,0)>1?"s":""}</div>
            <div style={{fontSize:18,fontWeight:800}}>₺{cart.reduce((s,i)=>s+i.qty*i.price,0)}</div>
          </div>
          <div style={{fontSize:13,fontWeight:700}}>VIEW →</div>
        </div>
      )}

      {/* Bottom nav */}
      <div style={{position:"fixed",bottom:0,left:0,right:0,background:"#fff",borderTop:"1px solid #e0e0e0",display:"flex",justifyContent:"space-around",padding:"8px 0 14px",zIndex:30,boxShadow:"0 -2px 8px rgba(0,0,0,0.04)"}}>
        {[
          {key:"menu",  icon:"☕", label:t.menu},
          {key:"merch", icon:"👕", label:t.merch},
          {key:"rides", icon:"🛵", label:t.rides},
          {key:"nights",icon:"🌙", label:t.nights},
        ].map(item => (
          <button key={item.key} onClick={()=>setTab(item.key)} style={{background:"none",border:"none",display:"flex",flexDirection:"column",alignItems:"center",gap:3,cursor:"pointer",color:tab===item.key?"#000":"#bbb",padding:"4px 12px",minWidth:60}}>
            <span style={{fontSize:22}}>{item.icon}</span>
            <span style={{fontSize:10,letterSpacing:"0.5px",fontWeight:tab===item.key?700:500}}>{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
