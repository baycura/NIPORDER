import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../../lib/supabase.js";

const cv  = "'Coolvetica','Bebas Neue',sans-serif";
const cvc = "'Coolvetica Condensed','Barlow Condensed',sans-serif";

const UI = {
  en:{ menu:"MENU", merch:"MERCH", rides:"RIDES", nights:"NIGHTS",
    search:"SEARCH...", viewOrder:"VIEW ORDER", send:"SEND ORDER",
    back:"←", total:"TOTAL", orderReceived:"ORDER RECEIVED",
    backToMenu:"BACK TO MENU", happyHour:"HAPPY HOUR", discount:"OFF",
    item:"ITEM", addToCart:"ADD TO CART", inCart:"IN CART",
    selectSize:"Select size", outOfStock:"OUT OF STOCK", sizes:"SIZES",
    free:"FREE", spotsLeft:"spots left", soldOut:"SOLD OUT",
    addToCalendar:"ADD TO CALENDAR", calendarAdded:"ADDED ✓",
    member:"MEMBER", login:"LOG IN", logout:"LOG OUT",
    memberDiscount:"Member discount", noEmail:"Phone number only",
    whileWait:"While you wait →",
  },
  tr:{ menu:"MENÜ", merch:"MERCH", rides:"SÜRÜŞLER", nights:"GECELER",
    search:"ARA...", viewOrder:"SİPARİŞİ GÖR", send:"GÖNDER",
    back:"←", total:"TOPLAM", orderReceived:"SİPARİŞ ALINDI",
    backToMenu:"MENÜYE DÖN", happyHour:"HAPPY HOUR", discount:"İNDİRİM",
    item:"ÜRÜN", addToCart:"SEPETE EKLE", inCart:"SEPETTE",
    selectSize:"Beden seçin", outOfStock:"TÜKENDI", sizes:"BEDENLER",
    free:"ÜCRETSİZ", spotsLeft:"yer kaldı", soldOut:"DOLDU",
    addToCalendar:"TAKVİME EKLE", calendarAdded:"EKLENDİ ✓",
    member:"ÜYE", login:"GİRİŞ YAP", logout:"ÇIKIŞ",
    memberDiscount:"Üye indirimi", noEmail:"Sadece telefon numarası",
    whileWait:"Beklerken →",
  },
};

const TIERS = [
  { min:0,   key:"bronze",   color:"#CD7F32", discount:0  },
  { min:100, key:"silver",   color:"#9CA3AF", discount:5  },
  { min:250, key:"gold",     color:"#C8973E", discount:10 },
  { min:500, key:"platinum", color:"#5A8FE0", discount:15 },
];
function getTier(pts) { return [...TIERS].reverse().find(t=>pts>=t.min)||TIERS[0]; }
function dp(price,pct){ return Math.round(price*(1-pct/100)); }

function Stp({ n, onP, onM, big }) {
  const sz=big?38:28, fs=big?20:15;
  return (
    <div style={{ display:"flex", alignItems:"center", gap:big?14:8 }}>
      <button onClick={onM} style={{ width:sz, height:sz,
        background:n>0?"#000":"#eee", border:"none",
        color:n>0?"#fff":"#bbb", fontSize:fs, fontWeight:900,
        cursor:"pointer", display:"flex", alignItems:"center",
        justifyContent:"center" }}>−</button>
      <span style={{ fontFamily:cv, fontSize:big?24:17, color:"#000",
        minWidth:16, textAlign:"center" }}>{n}</span>
      <button onClick={onP} style={{ width:sz, height:sz, background:"#000",
        border:"none", color:"#fff", fontSize:fs, fontWeight:900,
        cursor:"pointer", display:"flex", alignItems:"center",
        justifyContent:"center" }}>+</button>
    </div>
  );
}

function MenuTab({ lang, categories, hhRule, cart, setQty, member, applyDisc, setApplyDisc }) {
  const t = UI[lang];
  const [cat,    setCat]    = useState(null);
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    if (categories[0] && !cat) setCat(categories[0].id);
  }, [categories]);

  const HH_PCT   = hhRule?.discount_pct || 0;
  const hhCatIds = hhRule?.category_ids || [];
  const memberDisc = member
    ? (member.admin_discount ?? getTier(member.points||0).discount)
    : 0;
  const effDisc = applyDisc && memberDisc > 0 ? memberDisc : 0;

  const searchResults = search.length > 1
    ? categories.flatMap(c=>(c.products||[]).map(p=>({...p,catId:c.id})))
        .filter(p=>p.name?.toLowerCase().includes(search.toLowerCase()))
    : null;

  const activeProducts = searchResults
    || categories.find(c=>c.id===cat)?.products || [];

  const getFinalPrice = (p, catId) => {
    const hhD  = hhCatIds.includes(catId||cat) ? HH_PCT : 0;
    const disc = Math.max(hhD, effDisc);
    return disc > 0 ? dp(p.price, disc) : p.price;
  };

  return (
    <div style={{ background:"#fff" }}>
      {hhRule && HH_PCT > 0 && (
        <div style={{ background:"#000", padding:"8px 20px",
          display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <span style={{ width:6, height:6, borderRadius:"50%",
              background:"#FF3B30", display:"inline-block",
              animation:"pulse 1.5s infinite" }}/>
            <span style={{ fontFamily:cv, fontSize:14, color:"#fff",
              letterSpacing:"1px" }}>
              {t.happyHour} · %{HH_PCT} {t.discount}
            </span>
          </div>
          <span style={{ fontFamily:cvc, fontSize:10, color:"#ffffff44" }}>
            {hhRule.start_time?.slice(0,5)} – {hhRule.end_time?.slice(0,5)}
          </span>
        </div>
      )}

      {member && memberDisc > 0 && (
        <div style={{ background:"#f7f7f7", borderBottom:"1px solid #eee",
          padding:"8px 20px", display:"flex",
          justifyContent:"space-between", alignItems:"center" }}>
          <div style={{ display:"flex", alignItems:"center", gap:8,
            cursor:"pointer" }} onClick={() => setApplyDisc(!applyDisc)}>
            <div style={{ width:36, height:20, borderRadius:10,
              background:applyDisc?"#000":"#ddd",
              position:"relative", transition:"background .2s" }}>
              <div style={{ width:14, height:14, borderRadius:"50%",
                background:"#fff", position:"absolute", top:3,
                left:applyDisc?19:3, transition:"left .2s" }}/>
            </div>
            <span style={{ fontFamily:cvc, fontSize:11, letterSpacing:"1px",
              color:applyDisc?"#000":"#aaa" }}>
              {t.memberDiscount} · %{memberDisc}
            </span>
          </div>
          {applyDisc && <span style={{ fontFamily:cvc, fontSize:9,
            color:"#4CAF7D", letterSpacing:"1px" }}>ACTIVE</span>}
        </div>
      )}

      <div style={{ padding:"16px 20px 0" }}>
        <div style={{ fontFamily:cv, fontSize:52, letterSpacing:"-3px",
          lineHeight:.88, color:"#000", marginBottom:14 }}>{t.menu}</div>
        <div style={{ position:"relative" }}>
          <input value={search} onChange={e=>setSearch(e.target.value)}
            placeholder={t.search}
            style={{ width:"100%", border:"none", borderBottom:"2px solid #000",
              padding:"9px 28px 9px 0", background:"transparent",
              fontFamily:cv, fontSize:14, letterSpacing:"2px",
              color:"#000", outline:"none" }}/>
          {search
            ? <button onClick={()=>setSearch("")} style={{ position:"absolute",
                right:0, top:"50%", transform:"translateY(-50%)",
                background:"none", border:"none", fontSize:18, cursor:"pointer" }}>×</button>
            : <span style={{ position:"absolute", right:0, top:"50%",
                transform:"translateY(-50%)", color:"#ccc" }}>⌕</span>}
        </div>
      </div>

      {!searchResults && (
        <div style={{ overflowX:"auto", display:"flex",
          borderBottom:"2px solid #000", marginTop:14 }}>
          {categories.map(c => {
            const active = cat===c.id;
            const isHH   = hhCatIds.includes(c.id);
            return (
              <button key={c.id} onClick={()=>setCat(c.id)}
                style={{ flexShrink:0, padding:"9px 12px", border:"none",
                  background:active?"#000":"transparent",
                  color:active?"#fff":isHH?"#FF3B30":"#aaa",
                  fontFamily:cvc, fontSize:10, letterSpacing:"1.5px",
                  cursor:"pointer", whiteSpace:"nowrap", position:"relative" }}>
                {c.icon && <span style={{ marginRight:4 }}>{c.icon}</span>}
                {c.name.toUpperCase()}
                {isHH && !active && (
                  <span style={{ position:"absolute", top:6, right:5,
                    width:5, height:5, borderRadius:"50%", background:"#FF3B30" }}/>
                )}
              </button>
            );
          })}
        </div>
      )}

      <div style={{ padding:"10px 20px 3px",
        display:"flex", justifyContent:"space-between" }}>
        <div style={{ fontFamily:cv, fontSize:22, letterSpacing:"-1px", color:"#000" }}>
          {searchResults
            ? `"${search.toUpperCase()}"`
            : (categories.find(c=>c.id===cat)?.name||"").toUpperCase()}
        </div>
        <div style={{ fontFamily:cvc, fontSize:9, color:"#bbb", alignSelf:"flex-end" }}>
          {activeProducts.length} {t.item}
        </div>
      </div>
      <div style={{ height:1, background:"#000", margin:"0 20px 0" }}/>

      {activeProducts.map(item => {
        const catId = item.catId || cat;
        const fp    = getFinalPrice(item, catId);
        const isHH  = hhCatIds.includes(catId) && HH_PCT > 0;
        const hasDisc = fp < item.price;
        const qty   = cart[item.id] || 0;
        return (
          <div key={item.id} style={{ borderBottom:"1px solid #eee",
            padding:"12px 0", background:qty>0?"#f7f7f7":"#fff" }}>
            <div style={{ display:"flex", alignItems:"flex-start",
              gap:10, padding:"0 20px" }}>
              <div style={{ flex:1, cursor:"pointer" }}
                onClick={()=>setDetail({...item,fp,isHH,effDisc,catId})}>
                <div style={{ display:"flex", alignItems:"baseline",
                  gap:7, flexWrap:"wrap", marginBottom:2 }}>
                  <span style={{ fontFamily:cv, fontSize:19,
                    letterSpacing:"-0.3px", color:"#000" }}>{item.name}</span>
                  {isHH && <span style={{ fontFamily:cvc, fontSize:8,
                    color:"#fff", background:"#FF3B30", padding:"1px 5px" }}>HH</span>}
                  {effDisc>0 && !isHH && <span style={{ fontFamily:cvc,
                    fontSize:8, color:"#fff", background:"#4CAF7D",
                    padding:"1px 5px" }}>M-%{effDisc}</span>}
                </div>
                <div style={{ fontFamily:cvc, fontSize:11, color:"#aaa" }}>
                  {item.description}
                </div>
              </div>
              <div style={{ display:"flex", flexDirection:"column",
                alignItems:"flex-end", gap:5, flexShrink:0 }}>
                <div style={{ textAlign:"right" }}>
                  {hasDisc && <div style={{ fontFamily:cvc, fontSize:10,
                    color:"#ccc", textDecoration:"line-through" }}>₺{item.price}</div>}
                  <div style={{ fontFamily:cv, fontSize:19,
                    color:isHH?"#FF3B30":effDisc>0?"#4CAF7D":"#000" }}>
                    ₺{fp}
                  </div>
                </div>
                {qty===0
                  ? <button onClick={()=>setQty(item.id,1)}
                      style={{ width:28, height:28, background:"#000",
                        color:"#fff", border:"none", fontSize:17,
                        fontWeight:900, cursor:"pointer", display:"flex",
                        alignItems:"center", justifyContent:"center" }}>+</button>
                  : <Stp n={qty}
                      onP={()=>setQty(item.id,qty+1)}
                      onM={()=>setQty(item.id,qty-1)}/>}
              </div>
            </div>
          </div>
        );
      })}
      <div style={{ height:80 }}/>

      {detail && (
        <div onClick={()=>setDetail(null)} style={{ position:"fixed", inset:0,
          background:"#00000066", zIndex:100, display:"flex", alignItems:"flex-end" }}>
          <div onClick={e=>e.stopPropagation()} style={{ background:"#fff",
            width:"100%", maxWidth:480, margin:"0 auto",
            padding:"24px 22px 36px", borderTop:"3px solid #000",
            animation:"slideUp .22s ease" }}>
            <div style={{ width:36, height:3, background:"#000",
              margin:"0 auto 16px" }}/>
            <div style={{ fontFamily:cv, fontSize:26, color:"#000",
              letterSpacing:"-0.5px", marginBottom:10 }}>{detail.name}</div>
            <div style={{ height:1, background:"#eee", marginBottom:10 }}/>
            <div style={{ fontFamily:cvc, fontSize:13, color:"#666",
              lineHeight:1.6, marginBottom:16 }}>{detail.description}</div>
            <div style={{ display:"flex", justifyContent:"space-between",
              alignItems:"center" }}>
              <div>
                {detail.fp < detail.price && (
                  <div style={{ fontFamily:cvc, fontSize:13, color:"#ccc",
                    textDecoration:"line-through" }}>₺{detail.price}</div>
                )}
                <div style={{ fontFamily:cv, fontSize:36,
                  color:detail.isHH?"#FF3B30":detail.effDisc>0?"#4CAF7D":"#000" }}>
                  ₺{detail.fp}
                </div>
              </div>
              <Stp big n={cart[detail.id]||0}
                onP={()=>setQty(detail.id,(cart[detail.id]||0)+1)}
                onM={()=>setQty(detail.id,(cart[detail.id]||0)-1)}/>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MerchTab({ lang, merch, cart, setQty, member }) {
  const t = UI[lang];
  const memberDisc = member
    ? (member.admin_discount ?? getTier(member.points||0).discount)
    : 0;

  return (
    <div style={{ background:"#fff" }}>
      <div style={{ padding:"20px 20px 0", borderBottom:"2px solid #000" }}>
        <div style={{ fontFamily:cvc, fontSize:9, letterSpacing:"3px",
          color:"#bbb", marginBottom:6 }}>NOT IN PARIS</div>
        <div style={{ fontFamily:cv, fontSize:52, letterSpacing:"-3px",
          lineHeight:.88, color:"#000", marginBottom:14 }}>{t.merch}</div>
      </div>

      {merch.map(item => {
        const fp       = memberDisc > 0 ? dp(item.price, memberDisc) : item.price;
        const variants = item.merch_variants || [];
        const [selSize, setSelSize] = useState(
          variants.length===1 ? variants[0].size : null
        );
        const cartKey   = selSize ? `${item.id}_${selSize}` : null;
        const qty       = cartKey ? (cart[cartKey]||0) : 0;
        const selVariant= variants.find(v=>v.size===selSize);
        const inStock   = selVariant ? selVariant.stock > 0 : false;

        return (
          <div key={item.id} style={{ borderBottom:"2px solid #000" }}>
            <div style={{ width:"100%", height:300, background:"#f5f5f5",
              overflow:"hidden" }}>
              {item.image_url ? (
                <img src={item.image_url} alt={item.name_en}
                  style={{ width:"100%", height:"100%", objectFit:"cover" }}/>
              ) : (
                <div style={{ width:"100%", height:"100%", display:"flex",
                  flexDirection:"column", alignItems:"center",
                  justifyContent:"center", gap:8 }}>
                  <div style={{ fontSize:32, opacity:.3 }}>📸</div>
                  <div style={{ fontFamily:cvc, fontSize:10,
                    letterSpacing:"2px", color:"#bbb" }}>PRODUCT PHOTO</div>
                </div>
              )}
            </div>

            <div style={{ padding:"18px 20px 22px" }}>
              <div style={{ display:"flex", justifyContent:"space-between",
                alignItems:"flex-start", marginBottom:6 }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontFamily:cv, fontSize:26, letterSpacing:"-1px",
                    color:"#000", lineHeight:1 }}>
                    {(lang==="tr"?item.name_tr:item.name_en)||item.name_en}
                  </div>
                  <div style={{ fontFamily:cvc, fontSize:11, letterSpacing:"1px",
                    color:"#888", marginTop:4 }}>
                    {(lang==="tr"?item.tagline_tr:item.tagline_en)||item.tagline_en}
                  </div>
                </div>
                <div style={{ textAlign:"right", flexShrink:0, marginLeft:16 }}>
                  {memberDisc>0 && <div style={{ fontFamily:cvc, fontSize:11,
                    color:"#ccc", textDecoration:"line-through" }}>₺{item.price}</div>}
                  <div style={{ fontFamily:cv, fontSize:28, letterSpacing:"-1px",
                    color:memberDisc>0?"#4CAF7D":"#000" }}>₺{fp.toLocaleString()}</div>
                </div>
              </div>

              <div style={{ height:1, background:"#eee", marginBottom:14 }}/>

              {variants.length > 1 && (
                <div style={{ marginBottom:16 }}>
                  <div style={{ fontFamily:cvc, fontSize:9, letterSpacing:"2.5px",
                    color:"#bbb", marginBottom:8 }}>{t.sizes}</div>
                  <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                    {variants.map(v => (
                      <button key={v.size} onClick={()=>v.stock>0&&setSelSize(v.size)}
                        style={{ padding:"7px 14px",
                          border:`1.5px solid ${selSize===v.size?"#000":v.stock>0?"#ddd":"#f0f0f0"}`,
                          background:selSize===v.size?"#000":"transparent",
                          color:selSize===v.size?"#fff":v.stock>0?"#000":"#ccc",
                          fontFamily:cv, fontSize:14,
                          cursor:v.stock>0?"pointer":"not-allowed",
                          textDecoration:v.stock>0?"none":"line-through" }}>
                        {v.size}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {variants.length===0 ? (
                <div style={{ fontFamily:cvc, fontSize:11,
                  color:"#bbb" }}>{t.outOfStock}</div>
              ) : !selSize ? (
                <div style={{ fontFamily:cvc, fontSize:11,
                  color:"#bbb" }}>{t.selectSize.toUpperCase()}</div>
              ) : !inStock ? (
                <div style={{ fontFamily:cv, fontSize:14,
                  color:"#FF3B30" }}>{t.outOfStock}</div>
              ) : qty===0 ? (
                <button onClick={()=>setQty(cartKey,1)}
                  style={{ width:"100%", padding:"13px 0", background:"#000",
                    color:"#fff", border:"none", fontFamily:cv, fontSize:16,
                    letterSpacing:"2px", cursor:"pointer" }}>{t.addToCart}</button>
              ) : (
                <div style={{ display:"flex", justifyContent:"space-between",
                  alignItems:"center" }}>
                  <span style={{ fontFamily:cvc, fontSize:11,
                    color:"#4CAF7D" }}>✓ {t.inCart}</span>
                  <Stp n={qty}
                    onP={()=>setQty(cartKey,qty+1)}
                    onM={()=>setQty(cartKey,qty-1)}/>
                </div>
              )}
            </div>
          </div>
        );
      })}
      <div style={{ height:80 }}/>
    </div>
  );
}

export default function CustomerMenu() {
  const { qrToken }  = useParams();
  const [lang,       setLang]      = useState("en");
  const [tab,        setTab]       = useState("menu");
  const [view,       setView]      = useState("main");
  const [categories, setCategories]= useState([]);
  const [hhRule,     setHhRule]    = useState(null);
  const [merch,      setMerch]     = useState([]);
  const [tableInfo,  setTableInfo] = useState(null);
  const [cart,       setCartRaw]   = useState({});
  const [member,     setMember]    = useState(null);
  const [applyDisc,  setApplyDisc] = useState(true);
  const [showMember, setShowMember]= useState(false);
  const [phone,      setPhone]     = useState("");
  const [loading,    setLoading]   = useState(true);
  const [totPrice,   setTotPrice]  = useState(0);
  const [note,       setNote]      = useState("");
  const [sending,    setSending]   = useState(false);

  useEffect(() => {
    Promise.all([
      supabase.from("categories")
        .select("*, products(*)")
        .eq("is_active", true)
        .order("sort_order"),
      supabase.from("active_happy_hour").select("*"),
      supabase.from("merch_products")
        .select("*, merch_variants(*)")
        .eq("is_active", true)
        .order("sort_order"),
      qrToken
        ? supabase.from("cafe_tables").select("*").eq("qr_token", qrToken).single()
        : Promise.resolve({ data:null }),
    ]).then(([{ data:cats },{ data:hh },{ data:m },{ data:table }]) => {
      setCategories((cats||[]).map(c=>({
        ...c,
        products:(c.products||[])
          .filter(p=>p.is_available&&!p.is_out_of_stock)
          .sort((a,b)=>a.sort_order-b.sort_order),
      })));
      setHhRule(hh?.[0]||null);
      setMerch(m||[]);
      setTableInfo(table);
      setLoading(false);
    });
  }, [qrToken]);

  const setQty = (id,qty) => setCartRaw(p=>{
    const n={...p}; if(qty<=0) delete n[id]; else n[id]=qty; return n;
  });

  useEffect(() => {
    const hhCatIds   = hhRule?.category_ids||[];
    const HH_PCT     = hhRule?.discount_pct||0;
    const memberDisc = member
      ? (member.admin_discount ?? getTier(member.points||0).discount)
      : 0;
    const effDisc = applyDisc && memberDisc > 0 ? memberDisc : 0;
    const allProds = categories.flatMap(c=>(c.products||[]).map(p=>({...p,catId:c.id})));

    let total = 0;
    for (const [id,qty] of Object.entries(cart)) {
      const prod = allProds.find(p=>p.id===id);
      if (prod) {
        const disc = Math.max(hhCatIds.includes(prod.catId)?HH_PCT:0, effDisc);
        total += (disc?dp(prod.price,disc):prod.price)*qty;
        continue;
      }
      const [mid] = id.split("_");
      const mi = merch.find(m=>m.id===mid);
      if (mi) total += (effDisc?dp(mi.price,effDisc):mi.price)*qty;
    }
    setTotPrice(Math.round(total));
  }, [cart, categories, hhRule, merch, member, applyDisc]);

  const totalItems = Object.values(cart).reduce((a,b)=>a+b,0);
  const t = UI[lang];

  const handleOrder = async () => {
    setSending(true);
    const hhCatIds   = hhRule?.category_ids||[];
    const HH_PCT     = hhRule?.discount_pct||0;
    const memberDisc = member
      ? (member.admin_discount ?? getTier(member.points||0).discount)
      : 0;
    const effDisc = applyDisc && memberDisc > 0 ? memberDisc : 0;
    const allProds = categories.flatMap(c=>(c.products||[]).map(p=>({...p,catId:c.id})));

    const { data:order } = await supabase.from("orders").insert({
      table_id: tableInfo?.id || null,
      note: note || null,
      status: "open",
    }).select().single();

    if (order) {
      const rows = [];
      for (const [id,qty] of Object.entries(cart)) {
        const prod = allProds.find(p=>p.id===id);
        if (prod) {
          const disc = Math.max(hhCatIds.includes(prod.catId)?HH_PCT:0, effDisc);
          const fp   = disc ? dp(prod.price,disc) : prod.price;
          rows.push({ order_id:order.id, product_id:prod.id,
            product_name:prod.name, product_price:prod.price,
            final_price:fp, quantity:qty });
        }
      }
      if (rows.length) await supabase.from("order_items").insert(rows);
    }

    setSending(false);
    setView("success");
  };

  const loginMember = async () => {
    if (!phone.trim()) return;
    const { data } = await supabase.from("customers")
      .select("*").eq("phone", phone.trim()).maybeSingle();
    if (data) { setMember(data); setShowMember(false); }
    else {
      const { data:newM } = await supabase.from("customers").insert({
        name: phone, phone: phone.trim(),
        tier:"bronze", points:0, total_spent:0, visit_count:0,
      }).select().single();
      setMember(newM);
      setShowMember(false);
    }
  };

  const TABS = [
    { id:"menu",   icon:"☕", label:t.menu },
    { id:"merch",  icon:"👕", label:t.merch },
    { id:"rides",  icon:"🚴", label:t.rides },
    { id:"nights", icon:"🌙", label:t.nights },
  ];

  if (loading) return (
    <div style={{ minHeight:"100vh", background:"#fff",
      display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ fontFamily:cvc, fontSize:12,
        letterSpacing:"3px", color:"#bbb" }}>NOT IN PARIS · LOADING...</div>
    </div>
  );

  if (view==="cart") return (
    <Shell lang={lang} setLang={setLang} member={member}
      onMember={()=>setShowMember(true)}>
      <div style={{ padding:"16px 20px", borderBottom:"2px solid #000",
        display:"flex", alignItems:"center", gap:12,
        position:"sticky", top:44, background:"#fff", zIndex:9 }}>
        <button onClick={()=>setView("main")}
          style={{ background:"none", border:"2px solid #000", width:36,
            height:36, cursor:"pointer", fontFamily:cv, fontSize:15,
            display:"flex", alignItems:"center", justifyContent:"center" }}>
          {t.back}
        </button>
        <div style={{ fontFamily:cv, fontSize:26 }}>{t.viewOrder}</div>
        <div style={{ marginLeft:"auto", background:"#000", color:"#fff",
          fontFamily:cvc, fontSize:10, letterSpacing:"1px", padding:"4px 10px" }}>
          {totalItems} {t.item}
        </div>
      </div>

      <div style={{ padding:"0 20px 160px" }}>
        {Object.entries(cart).map(([id,qty]) => {
          const allProds = categories.flatMap(c=>(c.products||[]).map(p=>({...p,catId:c.id})));
          const hhCatIds = hhRule?.category_ids||[];
          const HH_PCT   = hhRule?.discount_pct||0;
          const memberDisc = member
            ? (member.admin_discount ?? getTier(member.points||0).discount)
            : 0;
          const effDisc = applyDisc && memberDisc > 0 ? memberDisc : 0;

          const prod = allProds.find(p=>p.id===id);
          if (prod) {
            const disc = Math.max(hhCatIds.includes(prod.catId)?HH_PCT:0, effDisc);
            const fp   = disc ? dp(prod.price,disc) : prod.price;
            return (
              <div key={id} style={{ display:"flex", alignItems:"center",
                borderBottom:"1px solid #eee", padding:"14px 0", gap:12 }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontFamily:cv, fontSize:17, color:"#000" }}>
                    {prod.name}
                  </div>
                  <div style={{ fontFamily:cvc, fontSize:11, color:"#aaa", marginTop:2 }}>
                    {disc>0&&<span style={{ textDecoration:"line-through",
                      marginRight:6, color:"#ccc" }}>₺{prod.price}</span>}
                    ₺{fp} × {qty} = ₺{(fp*qty).toLocaleString()}
                  </div>
                </div>
                <Stp n={qty} onP={()=>setQty(id,qty+1)} onM={()=>setQty(id,qty-1)}/>
              </div>
            );
          }
          const [mid,size] = id.split("_");
          const mi = merch.find(m=>m.id===mid);
          if (!mi) return null;
          const effDisc2 = applyDisc && (member
            ? (member.admin_discount ?? getTier(member.points||0).discount)
            : 0);
          const fp = effDisc2 ? dp(mi.price,effDisc2) : mi.price;
          const nm = `${(lang==="tr"?mi.name_tr:mi.name_en)||mi.name_en}${size&&size!=="ONE SIZE"?" — "+size:""}`;
          return (
            <div key={id} style={{ display:"flex", alignItems:"center",
              borderBottom:"1px solid #eee", padding:"14px 0", gap:12 }}>
              <div style={{ flex:1 }}>
                <div style={{ fontFamily:cv, fontSize:17, color:"#000" }}>{nm}</div>
                <div style={{ fontFamily:cvc, fontSize:11, color:"#aaa", marginTop:2 }}>
                  ₺{fp} × {qty} = ₺{(fp*qty).toLocaleString()}
                </div>
              </div>
              <Stp n={qty} onP={()=>setQty(id,qty+1)} onM={()=>setQty(id,qty-1)}/>
            </div>
          );
        })}

        <div style={{ marginTop:16 }}>
          <textarea value={note} onChange={e=>setNote(e.target.value)}
            placeholder={lang==="tr"?"Özel istek...":"Special request..."}
            rows={3}
            style={{ width:"100%", border:"2px solid #000", padding:12,
              fontFamily:cvc, fontSize:13, resize:"none",
              outline:"none", background:"#fff" }}/>
        </div>

        <div style={{ marginTop:14, borderTop:"2px solid #000", paddingTop:14,
          display:"flex", justifyContent:"space-between", alignItems:"baseline" }}>
          <div style={{ fontFamily:cv, fontSize:13,
            letterSpacing:"2px", color:"#999" }}>{t.total}</div>
          <div style={{ fontFamily:cv, fontSize:32, color:"#000" }}>
            ₺{totPrice.toLocaleString()}
          </div>
        </div>
      </div>

      <div style={{ position:"fixed", bottom:0, left:"50%",
        transform:"translateX(-50%)", width:"100%", maxWidth:480,
        padding:18, background:"#fff", borderTop:"2px solid #000" }}>
        <button onClick={handleOrder} disabled={sending}
          style={{ width:"100%", padding:"15px",
            background:sending?"#555":"#000", color:"#fff",
            border:"none", fontFamily:cv, fontSize:16,
            letterSpacing:"3px", cursor:"pointer" }}>
          {sending?"GÖNDERİLİYOR...":`${t.send} · ₺${totPrice.toLocaleString()}`}
        </button>
      </div>
    </Shell>
  );

  if (view==="success") return (
    <Shell lang={lang} setLang={setLang} member={member} onMember={()=>{}}>
      <div style={{ display:"flex", flexDirection:"column", alignItems:"center",
        justifyContent:"center", minHeight:"80vh", padding:32, textAlign:"center" }}>
        <div style={{ fontSize:52, marginBottom:16 }}>✓</div>
        <div style={{ fontFamily:cv, fontSize:34, color:"#000",
          letterSpacing:"-1px", lineHeight:1, marginBottom:8 }}>
          {t.orderReceived}
        </div>
        <div style={{ fontFamily:cvc, fontSize:12, color:"#888",
          letterSpacing:"2px", marginBottom:24 }}>
          ₺{totPrice.toLocaleString()}
        </div>
        <div style={{ width:"100%", height:1, background:"#000", marginBottom:24 }}/>
        <button onClick={()=>{setView("main");setCartRaw({});}}
          style={{ background:"transparent", color:"#000",
            border:"2px solid #000", padding:"12px 30px",
            fontFamily:cv, fontSize:14, letterSpacing:"2px",
            cursor:"pointer", width:"100%" }}>
          {t.backToMenu}
        </button>
      </div>
    </Shell>
  );

  return (
    <Shell lang={lang} setLang={setLang} member={member}
      onMember={()=>setShowMember(true)}>

      {tab==="menu" && (
        <MenuTab lang={lang} categories={categories} hhRule={hhRule}
          cart={cart} setQty={setQty} member={member}
          applyDisc={applyDisc} setApplyDisc={setApplyDisc}/>
      )}
      {tab==="merch" && (
        <MerchTab lang={lang} merch={merch} cart={cart}
          setQty={setQty} member={member}/>
      )}
      {(tab==="rides"||tab==="nights") && (
        <div style={{ padding:24, textAlign:"center" }}>
          <div style={{ fontFamily:cv, fontSize:24, color:"#000",
            marginBottom:8 }}>YAKINDA</div>
          <div style={{ fontFamily:cvc, fontSize:12, color:"#aaa" }}>
            Etkinlikler çok yakında eklenecek
          </div>
        </div>
      )}

      <div style={{ position:"fixed", bottom:0, left:"50%",
        transform:"translateX(-50%)", width:"100%", maxWidth:480,
        zIndex:50, background:"#fff", borderTop:"2px solid #000", display:"flex" }}>
        {TABS.map(({id,icon,label}) => {
          const active=tab===id;
          return (
            <button key={id} onClick={()=>setTab(id)}
              style={{ flex:1, padding:"10px 0", border:"none",
                background:active?"#000":"transparent",
                color:active?"#fff":"#999", cursor:"pointer",
                display:"flex", flexDirection:"column",
                alignItems:"center", gap:2 }}>
              <span style={{ fontSize:15 }}>{icon}</span>
              <span style={{ fontFamily:cv, fontSize:10,
                letterSpacing:"1px" }}>{label}</span>
            </button>
          );
        })}
      </div>

      {totalItems>0 && (
        <div style={{ position:"fixed", bottom:60, left:"50%",
          transform:"translateX(-50%)", width:"calc(100% - 40px)",
          maxWidth:440, zIndex:49 }}>
          <button onClick={()=>setView("cart")}
            style={{ width:"100%", padding:"12px 18px",
              background:"#000", color:"#fff", border:"none",
              cursor:"pointer", display:"flex", alignItems:"center",
              justifyContent:"space-between",
              boxShadow:"0 -4px 24px #00000033" }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ background:"#fff", color:"#000", width:26,
                height:26, display:"flex", alignItems:"center",
                justifyContent:"center", fontFamily:cv, fontSize:14 }}>
                {totalItems}
              </div>
              <span style={{ fontFamily:cv, fontSize:14, letterSpacing:"2px" }}>
                {t.viewOrder}
              </span>
            </div>
            <span style={{ fontFamily:cv, fontSize:17 }}>
              ₺{totPrice.toLocaleString()}
            </span>
          </button>
        </div>
      )}

      {showMember && (
        <div onClick={()=>setShowMember(false)}
          style={{ position:"fixed", inset:0, background:"#00000066",
            zIndex:100, display:"flex", alignItems:"flex-end" }}>
          <div onClick={e=>e.stopPropagation()} style={{ background:"#fff",
            width:"100%", maxWidth:480, margin:"0 auto",
            padding:"26px 22px 38px", borderTop:"3px solid #000",
            animation:"slideUp .22s ease" }}>
            <div style={{ width:36, height:3, background:"#000",
              margin:"0 auto 18px" }}/>
            <div style={{ fontFamily:cv, fontSize:24, color:"#000",
              letterSpacing:"-0.5px", marginBottom:16 }}>
              {t.member}
            </div>
            <div style={{ fontFamily:cvc, fontSize:10, letterSpacing:"2px",
              color:"#bbb", marginBottom:5 }}>PHONE</div>
            <input value={phone} onChange={e=>setPhone(e.target.value)}
              placeholder="+90 555..."
              style={{ width:"100%", border:"none",
                borderBottom:"2px solid #000", padding:"9px 0",
                fontFamily:cv, fontSize:17, color:"#000",
                outline:"none", marginBottom:8, background:"transparent" }}/>
            <div style={{ fontFamily:cvc, fontSize:10, color:"#bbb",
              letterSpacing:"1px", marginBottom:18 }}>{t.noEmail}</div>
            <button onClick={loginMember}
              style={{ width:"100%", padding:"14px", background:"#000",
                border:"none", color:"#fff", fontFamily:cv,
                fontSize:18, letterSpacing:"1px", cursor:"pointer" }}>
              {t.login}
            </button>
          </div>
        </div>
      )}
    </Shell>
  );
}

function Shell({ children, lang, setLang, member, onMember }) {
  const tier = member ? getTier(member.points||0) : null;
  return (
    <div style={{ background:"#fff", minHeight:"100vh",
      maxWidth:480, margin:"0 auto", paddingBottom:60 }}>
      <style>{`
        @import url('https://fonts.cdnfonts.com/css/coolvetica');
        @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;600;700&family=Bebas+Neue&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        ::-webkit-scrollbar{display:none;}
        button{font-family:inherit;}
        @keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
      `}</style>
      <div style={{ position:"sticky", top:0, zIndex:100, background:"#fff",
        borderBottom:"1px solid #f0f0f0", padding:"7px 16px",
        display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div style={{ display:"flex", gap:3 }}>
          {[["en","🇬🇧"],["tr","🇹🇷"]].map(([code,flag]) => (
            <button key={code} onClick={()=>setLang(code)}
              style={{ display:"flex", alignItems:"center", gap:3,
                padding:"3px 7px",
                border:`1.5px solid ${lang===code?"#000":"#ddd"}`,
                background:lang===code?"#000":"transparent",
                color:lang===code?"#fff":"#bbb",
                fontFamily:cvc, fontSize:9, letterSpacing:"1px", cursor:"pointer" }}>
              <span style={{ fontSize:11 }}>{flag}</span>{code.toUpperCase()}
            </button>
          ))}
        </div>
        <button onClick={onMember}
          style={{ display:"flex", alignItems:"center", gap:6,
            padding:"4px 10px",
            border:`1.5px solid ${member?"#000":"#ddd"}`,
            background:member?"#000":"transparent",
            color:member?"#fff":"#aaa",
            fontFamily:cvc, fontSize:9, letterSpacing:"1px", cursor:"pointer" }}>
          {member ? (
            <>
              <span style={{ width:6, height:6, borderRadius:"50%",
                background:tier?.color, display:"inline-block" }}/>
              {member.name?.split(" ")[0].toUpperCase()} · {member.points||0}pts
            </>
          ) : <>MEMBER / {t?.login||"LOGIN"}</>}
        </button>
      </div>
      {children}
    </div>
  );
}
