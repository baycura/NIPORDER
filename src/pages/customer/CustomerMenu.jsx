import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../../lib/supabase.js";
import { useAuth } from "../../contexts/AuthContext.jsx";

const cv  = "'Coolvetica','Bebas Neue',sans-serif";
const cvc = "'Coolvetica Condensed','Barlow Condensed',sans-serif";

const I18N = {
  en: { menu:"MENU", merch:"MERCH", rides:"RIDES", nights:"NIGHTS", member:"MEMBER", signin:"Sign in with Google", signout:"Sign out", happyhour:"HAPPY HOUR", cart:"YOUR ORDER", empty:"Add items to start", send:"Send to kitchen", sent:"Sent!" },
  tr: { menu:"MENU", merch:"URUNLER", rides:"RIDES", nights:"NIGHTS", member:"UYE", signin:"Google ile giris", signout:"Cikis", happyhour:"HAPPY HOUR", cart:"SIPARISIN", empty:"Eklemek icin urune dokun", send:"Mutfaga gonder", sent:"Gonderildi!" },
};

function GoogleIcon() {
  return (<svg width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.5-5.9 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.7 1.1 7.8 3l5.7-5.7C33.6 5.5 29 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3 0 5.7 1.1 7.8 3l5.7-5.7C33.6 5.5 29 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5 0 9.5-1.9 12.9-5l-5.9-5c-2 1.4-4.5 2.2-7 2.2-5.4 0-10-3.5-11.6-8.4l-6.5 5C9.4 39.5 16 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4 5.5l5.9 5c-.4.4 6.8-5 6.8-14.5 0-1.3-.1-2.4-.4-3.5z"/></svg>);
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

  // load menu + settings + active happy hour
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

  // discount calculator: returns {hhPct, memPct, finalPrice} per product
  const calcPrice = (p) => {
    let hhPct = 0, memPct = 0;
    if (hh && (hh.category_ids?.length === 0 || hh.category_ids?.includes(p.category_id))) {
      hhPct = Number(hh.discount_pct);
    }
    if (customer) {
      // customer-specific override > global setting
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
    return [...c, {id: p.id, name: p.name, qty: 1, price: pr.finalPrice, original: pr.original}];
  });

  const cartTotal = useMemo(() => cart.reduce((s, it) => s + it.qty * it.price, 0), [cart]);

  return (
    <div style={{minHeight:"100vh",background:"#fff",fontFamily:cvc,paddingBottom:80}}>
      {/* Top bar: lang + member status */}
      <div style={{display:"flex",justifyContent:"space-between",padding:"14px 16px",alignItems:"center"}}>
        <div style={{display:"flex",gap:6}}>
          <button onClick={()=>setLang("en")} style={{padding:"3px 8px",border:"1px solid "+(lang==="en"?"#000":"#ddd"),background:lang==="en"?"#000":"#fff",color:lang==="en"?"#fff":"#000",fontSize:10,fontFamily:cvc,letterSpacing:"1px",cursor:"pointer"}}>🇬🇧 EN</button>
          <button onClick={()=>setLang("tr")} style={{padding:"3px 8px",border:"1px solid "+(lang==="tr"?"#000":"#ddd"),background:lang==="tr"?"#000":"#fff",color:lang==="tr"?"#fff":"#000",fontSize:10,fontFamily:cvc,letterSpacing:"1px",cursor:"pointer"}}>🇹🇷 TR</button>
        </div>
        {customer ? (
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            {customer.avatar_url && <img src={customer.avatar_url} alt="" style={{width:24,height:24,borderRadius:"50%"}}/>}
            <div style={{fontSize:11,color:"#666",fontFamily:cvc,letterSpacing:"1px"}}>{customer.name}</div>
            <button onClick={signOut} style={{background:"none",border:"none",color:"#999",fontSize:11,cursor:"pointer",fontFamily:cvc}}>×</button>
          </div>
        ) : (
          <button onClick={()=>signInWithGoogle()} style={{display:"flex",alignItems:"center",gap:6,padding:"5px 10px",border:"1px solid #ddd",background:"#fff",borderRadius:18,fontFamily:cvc,fontSize:11,color:"#333",cursor:"pointer",letterSpacing:"0.5px"}}>
            <GoogleIcon/>{t.signin}
          </button>
        )}
      </div>

      {/* Title */}
      <div style={{padding:"4px 24px 16px"}}>
        <div style={{fontFamily:cv,fontSize:42,letterSpacing:"2px"}}>{t[tab]}</div>
        {hh && tab === "menu" && (
          <div style={{display:"inline-block",marginTop:6,padding:"3px 10px",background:"#000",color:"#FFD700",fontSize:10,letterSpacing:"2px",borderRadius:12}}>🔥 {t.happyhour}</div>
        )}
      </div>

      {/* Categories scroll */}
      {tab === "menu" && (
        <div style={{display:"flex",gap:18,overflowX:"auto",padding:"4px 24px 14px",borderBottom:"1px solid #eee"}}>
          {categories.map(c => (
            <button key={c.id} onClick={()=>setSelectedCat(c.id)} style={{background:"none",border:"none",padding:"8px 0",fontFamily:cvc,fontSize:12,letterSpacing:"2px",color:selectedCat===c.id?"#000":"#999",borderBottom:selectedCat===c.id?"2px solid #000":"2px solid transparent",cursor:"pointer",whiteSpace:"nowrap",fontWeight:selectedCat===c.id?700:400}}>
              {c.name?.toUpperCase()}
            </button>
          ))}
        </div>
      )}

      {/* Products */}
      {tab === "menu" && (
        <div style={{padding:"0 16px"}}>
          {visibleProducts.map(p => {
            const pr = calcPrice(p);
            const discounted = pr.bestPct > 0;
            return (
              <div key={p.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"18px 8px",borderBottom:"1px solid #f0f0f0"}}>
                <div style={{flex:1,paddingRight:16}}>
                  <div style={{fontFamily:cv,fontSize:18}}>{p.name}</div>
                  {p.description && <div style={{fontSize:11,color:"#999",marginTop:3,fontFamily:cvc}}>{p.description}</div>}
                </div>
                <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6}}>
                  {discounted ? (
                    <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end"}}>
                      <span style={{fontSize:11,color:"#999",textDecoration:"line-through",fontFamily:cvc}}>₺{pr.original}</span>
                      <span style={{fontFamily:cv,fontSize:18,color:"#000",fontWeight:700}}>₺{pr.finalPrice}</span>
                    </div>
                  ) : (
                    <span style={{fontFamily:cv,fontSize:18}}>₺{pr.finalPrice}</span>
                  )}
                  <button onClick={()=>addToCart(p)} style={{width:30,height:30,background:"#000",color:"#fff",border:"none",borderRadius:6,cursor:"pointer",fontSize:18,fontFamily:cv,display:"flex",alignItems:"center",justifyContent:"center"}}>+</button>
                </div>
              </div>
            );
          })}
          {visibleProducts.length === 0 && <div style={{padding:40,textAlign:"center",color:"#999",fontFamily:cvc,letterSpacing:"1px",fontSize:12}}>NO ITEMS</div>}
        </div>
      )}

      {tab !== "menu" && (
        <div style={{padding:60,textAlign:"center",color:"#999",fontFamily:cvc,letterSpacing:"2px"}}>COMING SOON</div>
      )}

      {/* Bottom nav */}
      <div style={{position:"fixed",bottom:0,left:0,right:0,background:"#fff",borderTop:"1px solid #eee",display:"flex",justifyContent:"space-around",padding:"8px 0 12px"}}>
        {[
          {key:"menu",  icon:"☕", label:t.menu},
          {key:"merch", icon:"👕", label:t.merch},
          {key:"rides", icon:"🛵", label:t.rides},
          {key:"nights",icon:"🌙", label:t.nights},
        ].map(item => (
          <button key={item.key} onClick={()=>setTab(item.key)} style={{background:"none",border:"none",display:"flex",flexDirection:"column",alignItems:"center",gap:4,cursor:"pointer",color:tab===item.key?"#000":"#bbb",borderTop:tab===item.key?"2px solid #000":"2px solid transparent",paddingTop:6,marginTop:-8,fontFamily:cvc}}>
            <span style={{fontSize:20}}>{item.icon}</span>
            <span style={{fontSize:9,letterSpacing:"1px"}}>{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
