import Ikon from "./Ikon.jsx";

// URUN SECICI — kasanin "menu kutusu": paket modu, arama, sik eklediklerin,
// parti seridi, kategori cipleri ve urun listesi. OrderDetailPage'den oldugu
// gibi tasindi; STATE'SIZ ve FIYAT HESAPLAMAZ. Sadece gosterir, dokunusu
// onAdd(p) ile sayfaya iletir — fiyat/stok/secenek mantigi sayfadaki
// addProduct'ta kalir, iki yerde iki ayri hesap olusmasin.
//
// Prop'lar:
//   products, categories   — load() ile gelen listeler (is_available / is_active)
//   hhPrices               — happy hour: { urun_id: fiyat } (yalniz etiket icin)
//   sikUrunler             — bu garsonun son 30 gunde en cok ekledigi urunler
//   partiAktif, partiAdet  — parti menusu durumu; tumMenu/onTumMenu gecici cikis
//   takeawayMode/onTakeaway— paket modu (semantik: canTakeaway, sayfada)
//   prodSearch/onSearch    — arama metni (kontrollu input)
//   selectedCat/onCat      — secili kategori; bos/gecersizse ilk cipe kayar
//   onAdd(p)               — sayfadaki addProduct
//   kapali                 — hesap odenmis/iptal: (+) dugmeleri pasif
//   parlayanId             — az once eklenen urun satiri 150ms beyaz yansin
export default function UrunSecici({
  products = [], categories = [], hhPrices = {}, sikUrunler = [],
  partiAktif = false, partiAdet = 0, tumMenu = false, onTumMenu,
  takeawayMode = false, onTakeaway,
  prodSearch = "", onSearch,
  selectedCat = null, onCat,
  onAdd, kapali = false, parlayanId = null,
}) {
  // Arama doluysa kategori fark etmeksizin TUM urunlerde arar (TR harf uyumlu);
  // basiyla eslesenler one gelir. Bossa secili kategorinin listesi.
  const trLow = (s) => String(s || "").toLocaleLowerCase("tr");
  const q = trLow(prodSearch.trim());
  // PARTI FILTRESI: gece 1'de 142 urun arasinda urun aramak servisi yavaslatan
  // asil sey. Parti acikken liste parti urunlerine iner. "Tum menu" cikisi
  // BILEREK duruyor — musteri parti disi bir sey isterse satis engellenmemeli.
  const partiSuzulu = partiAktif && !tumMenu ? products.filter(p => p.show_in_party_menu) : products;
  // Parti modunda ARAMA raf urunlerini de kapsar: tisort gece de satilir,
  // "Tum menu"ye gecmeden bulunmali. Cipler dar kalir (hiz), arama genis.
  const shopCatIds = new Set(categories.filter(c => c.show_in_shop).map(c => c.id));
  const rafUrunu = (p) => !!p.track_stock || shopCatIds.has(p.category_id);
  const aramaTabani = partiAktif && !tumMenu ? products.filter(p => p.show_in_party_menu || rafUrunu(p)) : products;
  const catNameOf = (p) => categories.find(c => c.id === p.category_id)?.name || "";
  // Kasada hiyerarsi yok: yalniz icinde urun olan kategoriler cip olarak cikar,
  // alt kategoriler ust kategorisinin hemen ardinda siralanir.
  const catChips = categories
    .filter(c => partiSuzulu.some(p => p.category_id === c.id))
    .map(c => {
      const par = c.parent_id ? categories.find(x => x.id === c.parent_id) : null;
      return { ...c, _key: (par ? (par.sort_order || 0) : (c.sort_order || 0)) * 1000 + (par ? (c.sort_order || 0) : 0) };
    })
    .sort((a, b) => a._key - b._key);
  // Parti acilinca secili kategori listeden dusmus olabilir (o kategoride
  // parti urunu yok). Bos ekran gostermek yerine ilk gecerli cipe kay.
  const aktifCat = catChips.some(c => c.id === selectedCat) ? selectedCat : catChips[0]?.id;
  const filteredProducts = q
    ? aramaTabani
        .filter(p => trLow(p.name).includes(q) || trLow(p.name_en).includes(q) || trLow(p.brand).includes(q))
        .sort((a, b) => (trLow(a.name).startsWith(q) ? 0 : 1) - (trLow(b.name).startsWith(q) ? 0 : 1))
    : partiSuzulu.filter(p => p.category_id === aktifCat);

  const ekle = (p) => { if (!kapali && onAdd) onAdd(p); };

  return (
    <>
      {/* Paket modu ve parti seridi tek satirda: ikisi de "bu ekleme nasil
          yazilsin" ayari, listeden once bir bakista gorunsun. */}
      <div style={{display:"flex",gap:8,alignItems:"stretch",marginTop:10}}>
        <button onClick={() => onTakeaway && onTakeaway(!takeawayMode)}
          title="Paket (take away) — eklenen icecekler gotur olarak yazilir"
          style={{flexShrink:0,minWidth:44,padding:"0 12px",background:takeawayMode?"#FFFFFF":"#1A1A1A",color:takeawayMode?"#000":"#999",
                  border:"1px solid "+(takeawayMode?"#FFFFFF":"#333"),borderRadius:10,fontSize:12.5,fontWeight:800,cursor:"pointer",fontFamily:"inherit",
                  display:"inline-flex",alignItems:"center",gap:5,minHeight:44}}>
          {takeawayMode && <Ikon ad="onay" boy={13}/>}<Ikon ad="bardak" boy={14}/>{takeawayMode ? "PAKET AÇIK" : "Paket"}
        </button>
        {/* Parti seridi: liste neden kisa, ve tam menuye nasil donulur. */}
        {partiAktif ? (
          <div style={{flex:1,minWidth:0,display:"flex",alignItems:"center",gap:8,padding:"6px 10px",
                       background:tumMenu?"#161616":"#FFFFFF",borderRadius:10,
                       border:"1px solid "+(tumMenu?"#2A2A2A":"#FFFFFF"),
                       color:tumMenu?"#F0EDE8":"#000"}}>
            <Ikon ad="kampanya" boy={14} style={{flexShrink:0}}/>
            <span style={{flex:1,minWidth:0,fontSize:11.5,fontWeight:700,lineHeight:1.3,overflow:"hidden",textOverflow:"ellipsis"}}>
              {tumMenu
                ? `Tüm menü açık — parti ${partiAdet} ürün`
                : `Parti menüsü · ${partiAdet} ürün`}
            </span>
            <button onClick={() => onTumMenu && onTumMenu(!tumMenu)} style={{
              padding:"7px 10px",borderRadius:8,fontSize:11,fontWeight:800,cursor:"pointer",
              fontFamily:"inherit",whiteSpace:"nowrap",
              background:tumMenu?"#FFFFFF":"rgba(0,0,0,0.12)",
              color:"#000",
              border:"1px solid "+(tumMenu?"#FFFFFF":"rgba(0,0,0,0.25)"),
            }}>{tumMenu ? "Partiye dön" : "Tüm menü"}</button>
          </div>
        ) : (
          takeawayMode && <div style={{flex:1,alignSelf:"center",fontSize:11,color:"#888",lineHeight:1.4}}>Paket modu açık — eklenen içecekler götür olarak yazılır</div>
        )}
      </div>

      {/* autoFocus YOK: iOS klavyesi sabit alt sayfayi yukari itiyor. */}
      <div style={{position:"relative",marginTop:10}}>
        <input value={prodSearch} onChange={e => onSearch && onSearch(e.target.value)} placeholder="Ürün ara (tüm kategorilerde) — örn: latte, efes, şapka"
          style={{width:"100%",boxSizing:"border-box",padding:"12px 44px 12px 14px",background:"#0C0C0C",border:"1px solid "+(q?"#FFFFFF":"#2A2A2A"),borderRadius:10,color:"#F0EDE8",fontSize:14,outline:"none",fontFamily:"inherit"}}/>
        {q && (
          <button onClick={() => onSearch && onSearch("")} aria-label="Aramayı temizle" style={{position:"absolute",right:4,top:"50%",transform:"translateY(-50%)",width:44,height:44,background:"transparent",color:"#aaa",border:"none",borderRadius:8,fontSize:18,cursor:"pointer",lineHeight:1}}>×</button>
        )}
      </div>

      {!q && sikUrunler.length > 0 && (
        <div style={{marginTop:12,display:"flex",flexDirection:"column",gap:9}}>
          <div style={{fontSize:12,color:"#8A8580",letterSpacing:"0.2px",fontWeight:600,textTransform:"uppercase"}}>Sık eklediklerin</div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {sikUrunler.map(p => (
              <button key={p.id} onClick={() => ekle(p)} disabled={kapali}
                style={{fontSize:12.5,fontWeight:700,border:"1px solid "+(parlayanId===p.id?"#FFFFFF":"#2A2A2A"),
                        background:parlayanId===p.id?"#FFFFFF":"transparent",color:parlayanId===p.id?"#000":"#F0EDE8",
                        borderRadius:20,padding:"10px 14px",cursor:kapali?"not-allowed":"pointer",fontFamily:"inherit",opacity:kapali?0.5:1,
                        transition:"background 150ms, color 150ms"}}>
                {p.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Kategori cipleri: alt sayfanin ic kaydirmasinda ustte yapisik kalir —
          uzun BIRA/KAHVE listesinde asagi inince kategori degistirmek icin
          en basa donmek gerekmesin. */}
      {!q && (
        <div style={{position:"sticky",top:0,zIndex:2,background:"#161616",display:"flex",gap:5,overflowX:"auto",marginTop:10,padding:"6px 0"}}>
          {catChips.map(c => (
            <button key={c.id} onClick={() => onCat && onCat(c.id)} style={{flexShrink:0,padding:"8px 11px",minHeight:36,border:"1px solid "+(aktifCat===c.id?"#FFFFFF":"#333"),borderRadius:12,fontSize:12,fontWeight:600,background:aktifCat===c.id?"rgba(255,255,255,0.2)":"#1A1A1A",color:aktifCat===c.id?"#FFFFFF":"#aaa",cursor:"pointer",whiteSpace:"nowrap",letterSpacing:"0.2px",fontFamily:"inherit"}}>
              {c.icon}{c.name?.toUpperCase()}
            </button>
          ))}
        </div>
      )}
      {q && <div style={{fontSize:11,color:"#888",marginTop:8}}>{filteredProducts.length} sonuç{filteredProducts.length===0?" — yazımı kontrol et":""}</div>}

      {/* Liste: kendi maxHeight'i yok, kaydirmayi saran alt sayfa yapar. */}
      <div style={{marginTop:4}}>
        {filteredProducts.map(p => {
          const parlak = parlayanId === p.id;
          return (
            <div key={p.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 8px",borderBottom:"1px solid #222",gap:10,
                                    background:parlak?"#FFFFFF":"transparent",color:parlak?"#000":"inherit",borderRadius:parlak?8:0,transition:"background 150ms, color 150ms"}}>
              <div style={{minWidth:0}}>
                <div style={{fontSize:15,fontWeight:700}}>{p.name}{p.brand && <span style={{color:parlak?"#444":"#888",fontWeight:600}}> · {p.brand}</span>}</div>
                {q && <div style={{fontSize:12,color:parlak?"#444":"#888888",marginTop:1,letterSpacing:"0.2px"}}>{catNameOf(p)}</div>}
                {p.track_stock && <div style={{fontSize:11,color:Number(p.retail_stock)>0?"#8A8580":"#C87A6A",marginTop:2,fontWeight:600}}>Stok: {p.retail_stock||0} adet{Array.isArray(p.variants)&&p.variants.length?" · "+p.variants.filter(v=>Number(v.stock)>0).map(v=>v.name).join("/"):""}</div>}
                <div style={{fontSize:13,color:parlak?"#000":"#FFFFFF",fontWeight:700,marginTop:2}}>
                  {hhPrices[p.id] != null && Number(p.price) > 0 ? (
                    <>
                      <span style={{color:"#888888",textDecoration:"line-through",fontWeight:600,marginRight:6}}>₺{Math.round(Number(p.price))}</span>
                      <span>₺{Math.round(Number(hhPrices[p.id]))}</span>
                      <span style={{marginLeft:6,fontSize:12,padding:"2px 6px",background:parlak?"#000":"#FFFFFF",color:parlak?"#FFF":"#000",borderRadius:5,letterSpacing:"0.2px"}}>Happy hour</span>
                    </>
                  ) : (Number(p.price) > 0 ? "₺" + p.price : "Serbest tutar")}
                </div>
              </div>
              <button onClick={() => ekle(p)} disabled={kapali} aria-label={"Ekle: " + p.name}
                style={{width:46,height:46,background:kapali?"#333":"#FFFFFF",color:kapali?"#777":"#000",border:parlak?"1px solid #000":"none",borderRadius:"50%",fontSize:24,fontWeight:800,cursor:kapali?"not-allowed":"pointer",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",lineHeight:1}}>+</button>
            </div>
          );
        })}
        {filteredProducts.length === 0 && !q && (
          <div style={{color:"#888",fontSize:12,textAlign:"center",padding:20}}>Bu kategoride ürün yok</div>
        )}
      </div>
    </>
  );
}
