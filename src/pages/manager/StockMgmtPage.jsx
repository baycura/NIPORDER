import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase.js";
import { useAuth } from "../../contexts/AuthContext.jsx";
import Ikon from "../../components/Ikon.jsx";
import StokEkleSheet, { stokGeriAl } from "../../components/StokEkleSheet.jsx";
import SayiGirisi from "../../components/SayiGirisi.jsx";
import { paketIkilemi, ikilemMetni, kapIkilemi, kapIkilemMetni, birimYaz, kapYaz, anlasilirYaz } from "../../lib/birimMaliyet.js";
import { GRUP_SIRASI, GRUPSUZ, RAF_URUN, raflaraAyir, siseKarsiligi, kapAdi, trKucuk } from "../../lib/malzemeGrup.js";
import { ozellik } from "../../lib/profil.js";

const cv = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";
const UNITS = ["ml","cl","l","g","kg","adet","şişe","porsiyon"];
const VOL_UNITS = ["ml","cl","l"];


export default function StockMgmtPage() {
  const { staffUser } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  // Stok kutusu duzenlemede KILITLI acilir: eskiden maliyeti degistirmek icin
  // acilan modal, kaydederken o anki stok sayisini da geri yaziyordu — arada
  // gecen satislar siliniyordu. Artik stok ya "+ Stok" ile eklenir (sunucuda
  // stok = stok + miktar) ya da bilerek "uzerine yaz" acilir.
  const [ekle, setEkle] = useState(null);          // StokEkleSheet'e giden kalem
  const [uzerineYaz, setUzerineYaz] = useState(false);
  const [sonGiris, setSonGiris] = useState(null);  // "3 sise eklendi" seridi
  const [girisler, setGirisler] = useState([]);    // stock_entries defteri
  // 146 malzeme tek duz listeydi; artik menudeki gibi raflara ayriliyor
  const [grupFiltre, setGrupFiltre] = useState(null);   // null = hepsi
  const [acikGruplar, setAcikGruplar] = useState({});   // { "Cin": true }
  const [arama, setArama] = useState("");

  // sessiz: stok girisi sonrasi tazelemede sayfayi "Yukleniyor" ekranina
  // dusurmesin (acik modal ve onay seridi kaybolurdu)
  const load = async (sessiz) => {
    if (!sessiz) setLoading(true);
    const storeIds = staffUser?.store_ids?.length ? staffUser.store_ids : ["00000000-0000-0000-0000-000000000000"];
    const [{ data }, { data: gir }] = await Promise.all([
      supabase.from("ingredients").select("*").in("store_id", storeIds).order("name"),
      // Giris defteri: "kim ne zaman ne ekledi" ekranda gorunsun
      supabase.from("stock_entries").select("id,kalem_adi,variant_name,delta,before_qty,after_qty,unit,note,staff_name,created_at")
        .in("store_id", storeIds).order("created_at", { ascending: false }).limit(12),
    ]);
    setItems(data || []);
    setGirisler(gir || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  // Yeni hammadde acik raftan aciliyorsa o rafi hazir getir (Cin rafindayken
  // "+ Yeni Hammadde" -> grup Cin)
  const openNew = () => { setUzerineYaz(true); setModal({mode:"new"}); setForm({name:"", unit:"ml", grup: grupFiltre && grupFiltre !== GRUPSUZ ? grupFiltre : "", stock_qty:0, cost_per_unit:0, waste_pct:0, pack_qty:1, unit_volume_ml:"", waste_per_pack:0, is_consumable:false}); };
  const openEdit = (i) => { setUzerineYaz(false); setModal({mode:"edit", data:i}); setForm({name:i.name, unit:i.unit, grup:i.grup||"", stock_qty:Number(i.stock_qty)||0, cost_per_unit:Number(i.cost_per_unit)||0, waste_pct:Number(i.waste_pct)||0, pack_qty:Number(i.pack_qty)||1, unit_volume_ml:i.unit_volume_ml??"", waste_per_pack:Number(i.waste_per_pack)||0, is_consumable:!!i.is_consumable}); };

  // Satirdan ya da modalin icinden acilir; kaydedince listeyi tazeler.
  // storeId kalemin kendi magazasi: iki magazali yoneticide liste iki magazadan
  // geliyor, sayfanin ilk magazasi gonderilse "bulunamadi" hatasi duserdi.
  // kapMl: fici ml ile degil ADETLE girilsin diye (bkz. StokEkleSheet).
  const stokEkleAc = (i) => setEkle({ tur:"malzeme", id:i.id, ad:i.name, birim:i.unit, stok:Number(i.stock_qty)||0, pack_qty:Number(i.pack_qty)||1, kapMl:Number(i.unit_volume_ml)||0, storeId:i.store_id });
  const girisBitti = (s) => {
    const acik = ekle;
    setEkle(null);
    setSonGiris(s);
    // Modal acikken girildiyse hem formu hem modal.data'yi tazele: yoksa ayni
    // modaldan ikinci giris bayat mevcutla acilirdi.
    if (modal?.mode === "edit" && modal.data?.id === acik?.id) {
      setForm(f => ({ ...f, stock_qty: Number(s.sonraki)||0 }));
      setModal(m => (m ? { ...m, data: { ...m.data, stock_qty: Number(s.sonraki)||0 } } : m));
    }
    load(true);
  };
  const geriAl = async () => {
    if (!sonGiris) return;
    const { error } = await stokGeriAl(sonGiris);
    if (error) { alert("Geri alinamadi: " + error.message); return; }
    setSonGiris(null);
    load(true);
  };

  const save = async () => {
    if (busy) return;
    if (!form.name?.trim()) { alert("Isim gerekli"); return; }

    // Fatura geldiginde guncellenen hane burasi. Yeni rakam eskisinin ~paket
    // kati ise paket fiyati girilmis olma ihtimali cok yuksek — pipet boyle
    // kacmisti. Otomatik bolmuyoruz, soruyoruz.
    let maliyet = Number(form.cost_per_unit) || 0;
    const ik = modal.mode === "edit" ? paketIkilemi(maliyet, modal.data) : null;
    if (ik?.kesin) {
      const paketMi = confirm(
        ikilemMetni(ik, form.unit) +
        `\n\nEski birim maliyet ${birimYaz(modal.data.cost_per_unit)} idi.\n\n` +
        `TAMAM = paket fiyati, ${birimYaz(ik.birim)} olarak kaydet\n` +
        `İPTAL = adet fiyati, girdigim gibi kaydet`
      );
      if (paketMi) { maliyet = ik.birim; setForm(f => ({ ...f, cost_per_unit: ik.birim })); }
    }

    // Kap/olcu karisikligi. Soda bu yoldan gecip 200 kat sisik kaydedilmisti;
    // hane ml basinayken sisenin fiyati yazilmisti ve hicbir ekran durdurmadi.
    const kik = kapIkilemi(maliyet, { unit: form.unit, unit_volume_ml: form.unit_volume_ml });
    if (kik?.yon === "olcude-kap") {
      const kapMi = confirm(
        kapIkilemMetni(kik) +
        `\n\nTAMAM = kabin fiyati, ${birimYaz(kik.onerilen)} olarak kaydet\n` +
        `İPTAL = girdigim gibi kaydet`
      );
      if (kapMi) { maliyet = kik.onerilen; setForm(f => ({ ...f, cost_per_unit: kik.onerilen })); }
    } else if (kik?.yon === "kapta-olcu") {
      // Buradaki duzeltme belirsiz: ya birim yanlis ya rakam. Karar bizim
      // degil — yalnizca "gercekten boyle mi?" diye soruyoruz.
      // (setBusy henuz cagrilmadi — asagida cagriliyor, burada donmek yeterli)
      if (!confirm(kapIkilemMetni(kik) + `\n\nYine de girdigin gibi kaydedilsin mi?`)) return;
    }

    setBusy(true);
    const payload = {
      name: form.name.trim(), unit: form.unit, store_id: staffUser?.store_ids?.[0],
      grup: form.grup?.trim() || null,
      // Stok yalniz yeni kayitta ya da "uzerine yaz" bilerek acildiginda
      // yazilir; yoksa maliyet duzeltmesi aradaki satisi geri alirdi.
      ...(modal.mode === "new" || uzerineYaz ? { stock_qty: Number(form.stock_qty)||0 } : {}),
      cost_per_unit: maliyet,
      waste_pct: Number(form.waste_pct)||0,
      pack_qty: Number(form.pack_qty)||1,
      unit_volume_ml: form.unit_volume_ml === "" || form.unit_volume_ml == null ? null : Number(form.unit_volume_ml),
      waste_per_pack: Number(form.waste_per_pack)||0,
      is_consumable: !!form.is_consumable,
    };
    if (modal.mode === "new") {
      const { error } = await supabase.from("ingredients").insert({ ...payload, store_id: staffUser?.store_ids?.[0] });
      if (error) { alert("Hata: " + error.message); setBusy(false); return; }
    } else {
      const { error } = await supabase.from("ingredients").update(payload).eq("id", modal.data.id);
      if (error) { alert("Hata: " + error.message); setBusy(false); return; }
    }
    setModal(null); setBusy(false); load();
  };

  const del = async (i) => {
    if (!confirm('"' + i.name + '" silinsin mi?')) return;
    const { error } = await supabase.from("ingredients").delete().eq("id", i.id);
    if (error) { alert("Silinemedi: " + error.message); return; }
    load();
  };

  // Raflar: arama ve filtre uygulandiktan sonra grup grup toplanir.
  // Hook'lar erken donusten ONCE cagrilmali.
  const q = trKucuk(arama.trim());
  const gruplar = useMemo(() => raflaraAyir(
    items.filter(i => !q || trKucuk(i.name).includes(q) || trKucuk(i.grup).includes(q)),
    (g, i) => {
      const stok = Number(i.stock_qty) || 0;
      g.tukenen = (g.tukenen || 0) + (stok <= 0 ? 1 : 0);
      g.azalan = (g.azalan || 0) + (stok > 0 && stok < 10 ? 1 : 0);
    }
  ), [items, q]);

  if (loading) return (<div style={{color:"#888",fontFamily:cv,padding:20}}>Yukleniyor...</div>);

  const totalValue = items.reduce((s,i) => s + (Number(i.stock_qty)||0) * (Number(i.cost_per_unit)||0), 0);
  const lowStock = items.filter(i => Number(i.stock_qty) < 10).length;
  // Arama yapiliyorsa ya da tek raf secildiyse raflar kendiliginden acilir;
  // yoksa 146 satir tek ekrana dokulurdu.
  const gosterilen = grupFiltre ? gruplar.filter(g => g.ad === grupFiltre) : gruplar;
  const hepsiAcik = !!q || !!grupFiltre || gosterilen.length === 1;

  // Tek malzeme satiri: raf acilinca bu ciziliyor
  const satir = (i) => {
        const value = (Number(i.stock_qty)||0) * (Number(i.cost_per_unit)||0);
        const isLow = Number(i.stock_qty) < 10;
        const sise = siseKarsiligi(i);
        return (
          <div key={i.id} style={{background:"#1A1A1A",border:"1px solid "+(isLow?"#2A2A2A":"#2A2A2A"),borderRadius:10,padding:12,marginBottom:8}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                  <div style={{fontSize:14,fontWeight:700,color:"#F0EDE8"}}>{i.name}</div>
                  {isLow && <span style={{fontSize:9,padding:"2px 6px",background:"#2A2A2A",color:"#C87A6A",borderRadius:6,fontWeight:700}}>Azalan</span>}
                  {i.waste_pct > 0 && <span style={{fontSize:9,padding:"2px 6px",background:"#2A2A2A",color:"#F0EDE8",borderRadius:6,fontWeight:700}}>FIRE %{i.waste_pct}</span>}
                  {i.is_consumable && <span style={{fontSize:9,padding:"2px 6px",background:"#2A2A2A",color:"#F0EDE8",borderRadius:6,fontWeight:700}}>Sarf</span>}
                  {/* Ambalaj rozeti yalniz hacimle tutulan malzemede: adetle
                      tutulan sise birada "24x330ml" bilgi degil gurultu. */}
                  {VOL_UNITS.includes(i.unit) && Number(i.unit_volume_ml) > 0 && <span style={{fontSize:9,padding:"2px 6px",background:"#22262E",color:"#8A8580",borderRadius:6,fontWeight:700}}>{Number(i.pack_qty)>1 ? i.pack_qty+"x" : ""}{Number(i.unit_volume_ml)>=1000 ? (Number(i.unit_volume_ml)/1000)+"L" : i.unit_volume_ml+"ml"}</span>}
                </div>
                <div style={{fontSize:12,color:"#888",marginTop:3}}>
                  <span style={{color:isLow?"#C87A6A":"#F0EDE8",fontWeight:700}}>{i.stock_qty}</span> {i.unit}
                  {/* Bar sise sayar, sistem ml tutar: ikisini yan yana goster */}
                  {sise != null && <span style={{marginLeft:6,color:"#8A8580"}}>≈ {sise} {kapAdi(i)}</span>}
                  {i.cost_per_unit > 0 && <span style={{marginLeft:8}}>· ₺{i.cost_per_unit}/{i.unit}</span>}
                  {value > 0 && <span style={{marginLeft:8,color:"#FFFFFF"}}>· deger ₺{Math.round(value)}</span>}
                </div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
                {/* Sahada en cok yapilan is: gelen malin stoga eklenmesi. Bu
                    yuzden satirin en gorunur dugmesi bu. */}
                <button onClick={() => stokEkleAc(i)} title="Stoğa ekle"
                  style={{padding:"10px 12px",minHeight:44,background:"transparent",color:"#FFFFFF",border:"1px solid #FFFFFF",borderRadius:9,fontSize:12,fontWeight:800,cursor:"pointer",whiteSpace:"nowrap",display:"flex",alignItems:"center",gap:5}}>
                  <Ikon ad="ekle" boy={13}/> Stok
                </button>
                <div style={{display:"flex",flexDirection:"column",gap:4}}>
                  <button onClick={() => openEdit(i)} style={{padding:"5px 9px",background:"#222",color:"#aaa",border:"1px solid #333",borderRadius:6,fontSize:10,cursor:"pointer"}}>Duzenle</button>
                  <button onClick={() => del(i)} style={{padding:"5px 9px",background:"transparent",color:"#C87A6A",border:"1px solid #2A2A2A",borderRadius:6,fontSize:10,cursor:"pointer"}}>Sil</button>
                </div>
              </div>
            </div>
          </div>
        );
  };

  return (
    <div style={{fontFamily:cv,color:"#F0EDE8"}}>
      <div style={{fontSize:24,fontWeight:800,marginBottom:4}}>Stok Yonetimi</div>
      <div style={{fontSize:11,color:"#888",letterSpacing:"1px",marginBottom:14}}>{items.length} HAMMADDE · {lowStock} AZALAN</div>

      {sonGiris && (
        <div style={{background:"#161616",border:"1px solid #FFFFFF",borderRadius:12,padding:"11px 14px",marginBottom:12,display:"flex",alignItems:"center",gap:10}}>
          <Ikon ad="onayli" boy={16} style={{color:"#FFFFFF",flexShrink:0}}/>
          <div style={{flex:1,minWidth:0,fontSize:13}}>
            <b>{sonGiris.kalem}</b> · {Number(sonGiris.onceki)} → <b>{Number(sonGiris.sonraki)}</b> {sonGiris.birim} kaydedildi
          </div>
          <button onClick={geriAl} style={{padding:"8px 12px",minHeight:38,background:"transparent",color:"#C87A6A",border:"1px solid #2A2A2A",borderRadius:8,fontSize:12,fontWeight:700,cursor:"pointer",flexShrink:0,fontFamily:"inherit"}}>Geri al</button>
          <button onClick={()=>setSonGiris(null)} aria-label="Kapat" style={{background:"transparent",border:"none",color:"#666",cursor:"pointer",padding:4,flexShrink:0}}><Ikon ad="kapat" boy={13}/></button>
        </div>
      )}

      {/* Rafi saymak icin buraya gelinirdi: her malzeme tek tek acilir, sayi
          ustune yazilirdi. Sayim ekrani ayni isi karsilastirarak ve kayit
          birakarak yapiyor — dogru kapiya yonlendir. */}
      <div onClick={()=>navigate("/stock-count")} style={{background:"#161616",border:"1px solid #2A2A2A",borderRadius:12,padding:"12px 14px",marginBottom:14,display:"flex",alignItems:"center",gap:10,cursor:"pointer"}}>
        <Ikon ad="sayim" boy={18} style={{color:"#8A8580",flexShrink:0}}/>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:14,fontWeight:700}}>Rafı mı sayacaksın?</div>
          <div style={{fontSize:12,color:"#666",marginTop:2,lineHeight:1.5}}>Stok Sayımı ekranı beklenen ile saydığını yan yana gösterir, farkı kaydeder.</div>
        </div>
        <Ikon ad="oksag" boy={14} style={{color:"#666",flexShrink:0}}/>
      </div>

      {totalValue > 0 && (
        <div style={{background:"#161616",border:"1px solid #FFFFFF",borderRadius:12,padding:14,marginBottom:14,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontSize:11,color:"#8A8580",letterSpacing:"1.5px",fontWeight:700}}>Toplam stok değeri</div>
            <div style={{fontSize:22,color:"#F0EDE8",fontWeight:800,marginTop:2}}>₺{Math.round(totalValue).toLocaleString("tr-TR")}</div>
          </div>
        </div>
      )}

      <button onClick={openNew} style={{padding:"10px 16px",background:"#FFFFFF",color:"#000",border:"none",borderRadius:10,fontSize:13,fontWeight:800,cursor:"pointer",marginBottom:14}}>+ Yeni Hammadde</button>

      {/* Raf secimi: menudeki kategori seridinin malzeme karsiligi */}
      <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:6,marginBottom:8,WebkitOverflowScrolling:"touch"}}>
        <button onClick={()=>setGrupFiltre(null)} style={cip(!grupFiltre)}>Hepsi <span style={{opacity:0.6}}>{items.length}</span></button>
        {gruplar.map(g => (
          <button key={g.ad} onClick={()=>setGrupFiltre(grupFiltre === g.ad ? null : g.ad)} style={cip(grupFiltre === g.ad)}>
            {g.ad} <span style={{opacity:0.6}}>{g.items.length}</span>
          </button>
        ))}
      </div>

      <input value={arama} onChange={e=>setArama(e.target.value)} placeholder="Malzeme ya da raf ara"
        style={{width:"100%",boxSizing:"border-box",padding:"10px 12px",minHeight:42,background:"#0C0C0C",border:"1px solid #2A2A2A",borderRadius:9,color:"#F0EDE8",fontFamily:cv,fontSize:14,outline:"none",marginBottom:12}}/>

      {items.length === 0 && <div style={{textAlign:"center",padding:40,color:"#888888",fontSize:13}}>Hic hammadde yok. Ekle veya fatura yukle.</div>}
      {items.length > 0 && gosterilen.length === 0 && <div style={{textAlign:"center",padding:30,color:"#888888",fontSize:13}}>Aramaya uyan malzeme yok.</div>}

      {gosterilen.map(g => {
        const acik = acikGruplar[g.ad] ?? hepsiAcik;
        return (
        <div key={g.ad} style={{background:"#161616",border:"1px solid #2A2A2A",borderRadius:12,marginBottom:10,overflow:"hidden"}}>
          <button onClick={()=>setAcikGruplar(a => ({...a, [g.ad]: !acik}))}
            style={{width:"100%",display:"flex",alignItems:"center",gap:10,padding:"12px 14px",background:"transparent",border:"none",color:"#F0EDE8",cursor:"pointer",fontFamily:cv,textAlign:"left"}}>
            <Ikon ad={acik ? "asagi" : "sag"} boy={14} style={{color:"#8A8580",flexShrink:0}}/>
            <span style={{flex:1,minWidth:0,fontSize:15,fontWeight:800,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{g.ad}</span>
            <span style={{fontSize:12,color:"#8A8580",whiteSpace:"nowrap",fontVariantNumeric:"tabular-nums"}}>
              {g.items.length} kalem
              {g.tukenen > 0 && <span style={{color:"#C87A6A"}}> · {g.tukenen} tükendi</span>}
              {g.azalan > 0 && <span> · {g.azalan} azalan</span>}
            </span>
          </button>
          {acik && <div style={{padding:"0 10px 10px"}}>{g.items.map(satir)}</div>}
        </div>
        );
      })}


      {girisler.length > 0 && (
        <div style={{marginTop:18}}>
          <div style={{fontSize:11,color:"#888",letterSpacing:"1.5px",fontWeight:700,marginBottom:8}}>SON STOK GİRİŞLERİ</div>
          <div style={{background:"#1A1A1A",border:"1px solid #2A2A2A",borderRadius:10,overflow:"hidden"}}>
            {girisler.map((g,i) => (
              <div key={g.id} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 12px",borderTop:i?"1px solid #2A2A2A":"none"}}>
                <span style={{fontSize:13,fontWeight:800,color:Number(g.delta)<0?"#C87A6A":"#F0EDE8",width:58,flexShrink:0,fontVariantNumeric:"tabular-nums"}}>
                  {Number(g.delta)>0?"+":""}{Number(g.delta)}
                </span>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                    {g.kalem_adi}{g.variant_name?" · "+g.variant_name:""} <span style={{color:"#666"}}>{Number(g.before_qty)} → {Number(g.after_qty)} {g.unit}</span>
                  </div>
                  {g.note && <div style={{fontSize:11,color:"#666",marginTop:2,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{g.note}</div>}
                </div>
                <div style={{fontSize:11,color:"#666",textAlign:"right",flexShrink:0,whiteSpace:"nowrap"}}>
                  {new Date(g.created_at).toLocaleString("tr-TR",{timeZone:"Europe/Istanbul",day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}
                  <div>{g.staff_name}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {modal && (
        <Modal onClose={() => setModal(null)} title={modal.mode==="new"?"Yeni Hammadde":"Hammaddeyi Duzenle"}>
          <Field label="AD"><input value={form.name||""} onChange={e=>setForm(f => ({...f,name:e.target.value}))} placeholder="orn: Bud Ficinin" style={inputS}/></Field>
          {/* Raf: menudeki kategori gibi. Listede olmayan bir raf gerekiyorsa
              alttaki kutuya yazilir, yeni raf kendiliginden acilir. */}
          <Field label="RAF">
            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:7}}>
              {[...GRUP_SIRASI.filter(x => x !== GRUPSUZ && x !== RAF_URUN),
                ...[...new Set(items.map(i => i.grup).filter(x => x && !GRUP_SIRASI.includes(x)))]
               ].map(x => (
                <button key={x} onClick={()=>setForm(f=>({...f,grup:x}))} style={cip(form.grup===x)}>{x}</button>
              ))}
            </div>
            <input value={form.grup||""} onChange={e=>setForm(f=>({...f,grup:e.target.value}))}
              placeholder="ya da yeni raf adı yaz (örn: Sake)" style={inputS}/>
          </Field>

          <Field label="BIRIM">
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {UNITS.map(u => (
                <button key={u} onClick={()=>setForm(f => ({...f,unit:u}))} style={{padding:"8px 14px",background:form.unit===u?"#FFFFFF":"#222",color:form.unit===u?"#000":"#888",border:"1px solid "+(form.unit===u?"#FFFFFF":"#333"),borderRadius:8,fontSize:12,fontWeight:700,cursor:"pointer"}}>{u}</button>
              ))}
            </div>
          </Field>
          {modal.mode === "edit" && !uzerineYaz ? (
            <Field label={"STOK (" + form.unit + ")"}>
              <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                <div style={{...inputS,flex:1,minWidth:120,display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,color:"#F0EDE8"}}>
                  <b style={{fontVariantNumeric:"tabular-nums"}}>{Number(form.stock_qty)||0}</b>
                  <span style={{fontSize:12,color:"#666"}}>{form.unit}</span>
                </div>
                <button onClick={()=>stokEkleAc(modal.data)}
                  style={{padding:"11px 14px",minHeight:44,background:"#FFFFFF",color:"#000",border:"none",borderRadius:9,fontSize:13,fontWeight:800,cursor:"pointer",whiteSpace:"nowrap"}}>+ Stok ekle</button>
                <button onClick={()=>setUzerineYaz(true)}
                  style={{padding:"11px 12px",minHeight:44,background:"transparent",color:"#8A8580",border:"1px solid #2A2A2A",borderRadius:9,fontSize:12,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>Üzerine yaz</button>
              </div>
              <div style={{fontSize:11,color:"#666",marginTop:6,lineHeight:1.5}}>
                Gelen malı <b style={{color:"#8A8580"}}>+ Stok ekle</b> ile gir: mevcudun üstüne eklenir, arada geçen satış kaybolmaz.
              </div>
            </Field>
          ) : (
            <Field label={"STOK MIKTARI (" + form.unit + ")" + (modal.mode === "edit" ? " — ÜZERİNE YAZAR" : "")}>
              <SayiGirisi kip="ondalik" value={form.stock_qty||0} onChange={v=>setForm(f => ({...f,stock_qty:v}))} style={inputS}/>
              {modal.mode === "edit" && (
                <div style={{fontSize:11,color:"#C87A6A",marginTop:6,lineHeight:1.5}}>
                  Bu sayı mevcut stoğun yerine geçer. Eklemek için <button onClick={()=>setUzerineYaz(false)} style={{background:"transparent",border:"none",color:"#F0EDE8",textDecoration:"underline",cursor:"pointer",padding:0,font:"inherit"}}>+ Stok ekle</button>'ye dön.
                </div>
              )}
            </Field>
          )}
          <Field label={"BIRIM MALIYET (₺ / " + form.unit + ")"}>
            <SayiGirisi kip="para" value={form.cost_per_unit||0} onChange={v=>setForm(f => ({...f,cost_per_unit:v}))} style={inputS}/>
            {/* Mililitre/gram maliyeti tek basina okunmaz; litre/kilo fiyatina
                cevrilince yanlislik goze carpar (Sut ₺205/litre yaziyordu). */}
            {anlasilirYaz(form.cost_per_unit, form.unit) && (
              <div style={{fontSize:12,color:"#F0EDE8",marginTop:5,fontWeight:700}}>
                = {anlasilirYaz(form.cost_per_unit, form.unit)}
                <span style={{color:"#666",fontWeight:400}}> — aldigin fiyatla ayni mi?</span>
              </div>
            )}
            {/* Paketli malzemede iki okuma da mumkun; rakam yazilirken gorunsun. */}
            {(() => {
              const ik = paketIkilemi(form.cost_per_unit, { pack_qty: form.pack_qty, cost_per_unit: modal.data?.cost_per_unit });
              if (!ik) return null;
              return (
                <div style={{fontSize:11,color:ik.kesin?"#C87A6A":"#666",marginTop:5,lineHeight:1.5}}>
                  {ik.paket}'li paket · girdigin rakam paket fiyatiysa birim maliyet <b style={{color:"#F0EDE8"}}>{birimYaz(ik.birim)}</b> olmali
                  {ik.kesin && <> — eskisinin tam {ik.paket} kati, kaydederken sorulacak</>}
                </div>
              );
            })()}
            {/* Kap fiyati ile olcu fiyatinin yer degistirmesi — Soda'yi 200 kat
                sisiren, alti icki kaydinin stogunu bozan tuzak. */}
            {(() => {
              const ik = kapIkilemi(form.cost_per_unit, { unit: form.unit, unit_volume_ml: form.unit_volume_ml });
              if (!ik) return null;
              return (
                <div style={{fontSize:11,color:"#C87A6A",marginTop:5,lineHeight:1.6}}>
                  {ik.yon === "olcude-kap" ? (
                    <>Bu rakam {ik.kap} {ik.unit}&apos;lik kabi <b>{kapYaz(ik.kapYazildigiGibi)}</b> yapiyor — kabin
                    fiyatini yazdiysan hane <b style={{color:"#F0EDE8"}}>{birimYaz(ik.onerilen)}</b> olmali.{" "}
                    <button type="button" onClick={() => setForm(f => ({ ...f, cost_per_unit: String(ik.onerilen) }))}
                      style={{background:"transparent",border:"none",color:"#F0EDE8",textDecoration:"underline",cursor:"pointer",padding:0,font:"inherit"}}>
                      bunu kullan
                    </button></>
                  ) : (
                    <>Bir {ik.unit} {birimYaz(ik.deger)} olamaz. Bu ml fiyatiysa kap <b style={{color:"#F0EDE8"}}>{kapYaz(ik.kapYazildigiGibi)}</b> eder —
                    ya birimi <b>ml</b> yap ya haneye kap fiyatini yaz.</>
                  )}
                </div>
              );
            })()}
          </Field>
          <Field label="FIRE ORANI (%)"><SayiGirisi kip="ondalik" min={0} max={100} value={form.waste_pct||0} onChange={v=>setForm(f => ({...f,waste_pct:v}))} placeholder="orn: 3 = %3 dokulme/fire" style={inputS}/></Field>

          {/* AMBALAJ yalniz hacimle tutulan malzemede sorulur. Adetle tutulan
              sise bira icin sise hacmi, koli ici ve ambalaj fire hesabi ne
              stoga ne maliyete giriyor — sahip: "adet fiyatiyla alip adet
              fiyatiyla satiyoruz, bu kadar detay gereksiz". */}
          {VOL_UNITS.includes(form.unit) ? (
          <div style={{background:"#0C0C0C",border:"1px solid #2A2A2A",borderRadius:10,padding:12,marginBottom:12}}>
            <div style={{fontSize:12,color:"#8A8580",letterSpacing:"0.2px",fontWeight:600,marginBottom:8,display:"flex",alignItems:"center",gap:6}}><Ikon ad="stok" boy={13}/>ŞİŞE / FIÇI HESABI</div>
            <Field label="BIR SISE / FICI HACMI (ml)">
              <SayiGirisi kip="ondalik" value={form.unit_volume_ml||""} onChange={v=>setForm(f => ({...f,unit_volume_ml:v}))} placeholder="70cl sise = 700 · 50L fici = 50000" style={inputS}/>
              {/* Sik boylar tek dokunusla: cin/viski/votka 50-70-100 cl gelir. */}
              <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:7}}>
                {[["35cl",350],["50cl",500],["70cl",700],["75cl",750],["100cl",1000],["30L fıçı",30000],["50L fıçı",50000]].map(([lbl,val]) => {
                  const secili = Number(form.unit_volume_ml) === val;
                  return (
                    <button key={lbl} onClick={()=>setForm(f => ({...f,unit_volume_ml:val}))}
                      style={{padding:"7px 10px",background:secili?"#FFFFFF":"#222",color:secili?"#000":"#aaa",border:"1px solid "+(secili?"#FFFFFF":"#333"),borderRadius:8,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>{lbl}</button>
                  );
                })}
              </div>
              <div style={{fontSize:11,color:"#666",marginTop:7,lineHeight:1.5}}>
                Sayımda ve stok girişinde şişe/fıçı olarak saymayı bu sağlar — burada yazan "varsayılan boy"dur.
                Aynı ürün başka boyda gelirse sayım ve stok girişi ekranlarında boyu tek dokunuşla değiştirebilirsin.
                20 L ve üstü fıçı sayılır, hep adetle girilir.
              </div>
            </Field>
            <Field label="KOLI ICI ADET (koli gelmiyorsa 1)">
              <SayiGirisi kip="tam" min={1} value={form.pack_qty||1} onChange={v=>setForm(f => ({...f,pack_qty:v}))} placeholder="orn: 24 sise/koli" style={inputS}/>
            </Field>
            <Field label={"AMBALAJ BASINA FIRE (" + form.unit + ")"}>
              <SayiGirisi kip="ondalik" value={form.waste_per_pack||0} onChange={v=>setForm(f => ({...f,waste_per_pack:v}))} placeholder="Fici: 5 bardak fire = 5 x bardak ml" style={inputS}/>
            </Field>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {[["5 x 500ml bardak",2500],["5 x 330ml bardak",1650],["Fire yok",0]].map(([lbl,val]) => (
                <button key={lbl} onClick={()=>setForm(f => ({...f,waste_per_pack:val}))} style={{padding:"7px 10px",background:"#222",color:"#aaa",border:"1px solid #333",borderRadius:8,fontSize:11,fontWeight:700,cursor:"pointer"}}>{lbl}</button>
              ))}
            </div>
            {Number(form.unit_volume_ml) > 0 && Number(form.pack_qty) > 0 && (
              <div style={{fontSize:11,color:"#888",marginTop:8,lineHeight:1.5}}>
                1 koli = {form.pack_qty} x {form.unit_volume_ml} ml = <b style={{color:"#FFFFFF"}}>{(Number(form.pack_qty)*Number(form.unit_volume_ml)).toLocaleString("tr-TR")} ml</b>
                {Number(form.waste_per_pack) > 0 && <> · ambalaj basi fire {form.waste_per_pack} {form.unit}</>}
              </div>
            )}
          </div>
          ) : (
            <div style={{fontSize:11,color:"#666",marginBottom:12,lineHeight:1.6}}>
              Bu malzeme <b style={{color:"#8A8580"}}>{form.unit}</b> olarak tutuluyor: şişe hacmi, koli ve ambalaj fire hesabı sorulmaz.
              Ne aldıysan o sayıda girersin, satışta o sayıdan düşer.
            </div>
          )}

          <label style={{display:"flex",alignItems:"center",gap:8,marginBottom:12,cursor:"pointer"}}>
            <input type="checkbox" checked={!!form.is_consumable} onChange={e=>setForm(f => ({...f,is_consumable:e.target.checked}))} style={{width:18,height:18,accentColor:"#FFFFFF"}}/>
            <span style={{fontSize:13,color:"#F0EDE8"}}>Sarf malzeme (buz, pet bardak, pipet...) — recetelere tek dokunusla eklenir</span>
          </label>
          <div style={{display:"flex",gap:8,marginTop:10}}>
            <button onClick={() => setModal(null)} style={cancelBtn}>Iptal</button>
            <button onClick={save} disabled={busy} style={{...saveBtn,opacity:busy?0.6:1}}>{busy?"...":"Kaydet"}</button>
          </div>
        </Modal>
      )}

      {ekle && (
        <StokEkleSheet kalem={ekle} storeId={staffUser?.store_ids?.[0]}
          ipucu={ozellik("faturaStok")
            ? "Faturayla gelen malda maliyet de güncellensin diye Faturalar ekranını kullan; burası elden alınan mal, düzeltme ve fire içindir."
            : "Fatura kaydı stoğa dokunmuyor (TÜRMOB/Luca'ya kadar askıda) — faturayla gelen mal dahil tüm giriş burada. Maliyeti Düzenle'den güncelle."}
          onKapat={()=>setEkle(null)} onBitti={girisBitti}/>
      )}
    </div>
  );
}

const inputS = {width:"100%",padding:"10px 12px",background:"#0C0C0C",border:"1px solid #2A2A2A",borderRadius:8,color:"#F0EDE8",fontSize:14,outline:"none",fontFamily:"inherit"};
const cip = (aktif) => ({
  padding:"9px 13px", minHeight:40, borderRadius:9, cursor:"pointer", fontFamily:cv, fontSize:12, fontWeight:700,
  whiteSpace:"nowrap", flexShrink:0,
  background: aktif ? "#FFFFFF" : "transparent", color: aktif ? "#000" : "#8A8580",
  border: "1px solid " + (aktif ? "#FFFFFF" : "#2A2A2A"),
});
const cancelBtn = {flex:1,padding:"12px",background:"transparent",color:"#888",border:"1px solid #333",borderRadius:10,fontSize:14,fontWeight:700,cursor:"pointer"};
const saveBtn = {flex:2,padding:"12px",background:"#FFFFFF",color:"#000",border:"none",borderRadius:10,fontSize:14,fontWeight:800,cursor:"pointer"};

function Field({label, children}) {
  return (<div style={{marginBottom:12}}>
    <div style={{fontSize:12,color:"#888",letterSpacing:"0.2px",fontWeight:600,marginBottom:5}}>{label}</div>
    {children}
  </div>);
}

function Modal({title, children, onClose}) {
  return (<div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:100}}>
    <div onClick={e => e.stopPropagation()} style={{background:"#161616",border:"1px solid #2A2A2A",borderRadius:"16px 16px 0 0",padding:20,width:"100%",maxWidth:500,maxHeight:"90vh",overflowY:"auto"}}>
      <div style={{fontSize:18,fontWeight:800,color:"#F0EDE8",marginBottom:16}}>{title}</div>
      {children}
    </div>
  </div>);
}
