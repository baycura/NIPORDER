import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase.js";
import { useAuth } from "../contexts/AuthContext.jsx";
import Ikon from "./Ikon.jsx";
import SayiGirisi from "./SayiGirisi.jsx";
import { panoyaKopyala } from "../lib/hakedis.js";
import { waNumara } from "../lib/telefon.js";

// BORC TAHSILATI — sahip (13.10.2026): "Borclularin borcunu odediginde
// hesabini temizlemek icin bir ayarimiz yok."
//
// Ayar aslinda vardi ama yalniz yoneticiye acik Uyeler ekraninin dibindeydi;
// hic kullanilmamisti (0 tahsilat). Borcu kasada kasiyer yaziyor, tahsilati da
// kasada kasiyer almali. Bu dosya iki ekranda da ayni pencereleri kullanir:
// Kasa > Borclular ve Uyeler.
//
// Sunucu: 20261013_borc_tahsilat.sql
//   nip_borclular()           liste, bakiye, borc yasi, bugun odeyenler
//   nip_borc_tahsil(...)      para alindi: payments'a order_id NULL satir
//   nip_borc_tahsil_geri_al   yanlis tahsilat, yalniz ayni gun
//   nip_borc_affet(...)       para alinmadan sil, yalniz admin
//   nip_borc_geri_yaz(...)    gecmis gunun yanlis tahsilati, yalniz admin
//   nip_borc_ekstre(id)       kisi bazinda defter

export const tl = (n) => "₺" + Math.round(Number(n) || 0).toLocaleString("tr-TR");

const YONTEMLER = [
  ["cash", "nakit", "Nakit"],
  ["card", "kart", "Kart"],
  ["transfer", "belge", "Havale"],
];
const YONTEM_ADI = { cash: "nakit", card: "kart", transfer: "havale", debt: "borç" };

// Isletme gunu 03:00'te doner (kasa_gun_ozeti ile ayni kural). Turkiye'de yaz
// saati yok; UTC'den 3 saat geri alip Istanbul tarihini almak yeterli.
const isletmeGunu = (d = new Date()) =>
  new Date(d.getTime() - 3 * 3600 * 1000).toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" });

const gunFarki = (iso) => (iso ? Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)) : null);
// Tarih elle bicimlenir: tarayicinin tr-TR verisi eksikse "14/09" cikiyordu.
const istTarih = (d) => new Date(d).toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" }); // 2026-09-14
const kisaTarih = (iso) => { const t = istTarih(iso); return `${t.slice(8, 10)}.${t.slice(5, 7)}`; };
const uzunTarih = (d = new Date()) => { const t = istTarih(d); return `${t.slice(8, 10)}.${t.slice(5, 7)}.${t.slice(0, 4)}`; };

// Sunucu hatasi "borc tahsili: tutar borctan fazla (...)" gibi gelir; onek
// kasiyere bilgi vermez.
const hataMetni = (e) => String(e?.message || e || "")
  .replace(/^(borc tahsili|borc silme|borc geri yazma|geri alma):\s*/i, "");

// WhatsApp: kisinin telefonu varsa dogrudan ona acilir, yoksa kisi sectirilir.
const waLink = (metin, tel) => "https://wa.me/" + waNumara(tel) + "?text=" + encodeURIComponent(metin);

// Iki adimli dugmede hizli cift dokunus kurulumu ATLAYIP onayliyordu (React
// ilk dokunusun durumunu ikinciden once isliyor). Kurulumdan sonraki bu sure
// icindeki dokunus onay sayilmaz.
const ONAY_BEKLE_MS = 450;

// Borc defterindeki yon: borcu artiranlar arti, azaltanlar eksi.
const ARTIRAN = new Set(["borc", "geri_alma", "geri_yaz"]);

// Kasiyerin magazalari. Tek magaza ise secici gorunmez.
function useMagazalar() {
  const { staffUser } = useAuth();
  const ids = staffUser?.store_ids || [];
  const [magazalar, setMagazalar] = useState([]);
  useEffect(() => {
    if (ids.length < 2) { setMagazalar([]); return; }
    supabase.from("stores").select("id, name, slug").in("id", ids).order("slug")
      .then(({ data }) => setMagazalar(data || []));
  }, [ids.join(",")]);
  return { ids, magazalar };
}

export function Pencere({ baslik, alt, onKapat, children, z = 110 }) {
  return (
    <div onClick={onKapat} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:z}}>
      <div onClick={e => e.stopPropagation()} role="dialog" aria-label={baslik}
           style={{background:"#161616",border:"1px solid #2A2A2A",borderRadius:"16px 16px 0 0",padding:20,width:"100%",maxWidth:500,maxHeight:"90vh",overflowY:"auto",boxSizing:"border-box",color:"#F0EDE8"}}>
        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:10,marginBottom:14}}>
          <div style={{minWidth:0}}>
            <div style={{fontSize:18,fontWeight:800}}>{baslik}</div>
            {alt && <div style={{fontSize:12,color:"#888",marginTop:3}}>{alt}</div>}
          </div>
          <button onClick={onKapat} aria-label="Kapat"
            style={{width:36,height:36,flexShrink:0,borderRadius:10,background:"transparent",border:"1px solid #2A2A2A",color:"#888",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
            <Ikon ad="kapat" boy={15}/>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TAHSIL ET
// ---------------------------------------------------------------------------
// kisi: { id, ad, bakiye, telefon }
// onBitti({ kalan, tutar, yontem, kisi, paymentId })
export function BorcTahsilPenceresi({ kisi, onKapat, onBitti }) {
  const { isAdmin } = useAuth();
  const { ids, magazalar } = useMagazalar();
  const [magaza, setMagaza] = useState(ids[0] || null);
  const [yontem, setYontem] = useState("cash");
  const [bakiye, setBakiye] = useState(Number(kisi.bakiye) || 0);
  const [tutar, setTutar] = useState(String(Math.round(Number(kisi.bakiye) * 100) / 100));
  const [guncellendi, setGuncellendi] = useState(false);
  const [not, setNot] = useState("");
  const [busy, setBusy] = useState(false);
  const [onay, setOnay] = useState(false);       // iki adimli dugme
  const kurulumAni = useRef(0);
  const [sayimVar, setSayimVar] = useState(false);
  const [silKip, setSilKip] = useState(false);    // admin: para alinmadan sil
  const [gerekce, setGerekce] = useState("");

  const t = Number(tutar) || 0;
  const tamami = Math.abs(t - bakiye) < 0.005;
  const fazla = t > bakiye + 0.005;
  const kalacak = Math.max(0, bakiye - t);
  const gecerli = t > 0 && !fazla && !!magaza;

  // Liste eskimis olabilir: baska cihazda borc yazilmis ya da tahsil edilmis
  // olabilir. Pencere acilinca bakiye sunucudan TAZE okunur; tutar tamamina
  // ayarliysa yeni tamamina gecer. Sunucu da ekranda gorulen bakiyeyi
  // (p_beklenen_bakiye) kontrol ediyor.
  const bakiyeRef = useRef(Number(kisi.bakiye) || 0);
  const bakiyeTazele = async () => {
    const { data } = await supabase.from("customers").select("outstanding_balance").eq("id", kisi.id).maybeSingle();
    if (!data) return null;
    const yeni = Number(data.outstanding_balance) || 0;
    const eski = bakiyeRef.current;
    if (Math.abs(eski - yeni) > 0.005) {
      bakiyeRef.current = yeni;
      setBakiye(yeni);
      setGuncellendi(true);
      setTutar(tu => (Math.abs((Number(tu) || 0) - eski) < 0.005 ? String(Math.round(yeni * 100) / 100) : tu));
    }
    return yeni;
  };
  useEffect(() => { bakiyeTazele(); }, [kisi.id]);

  // Kapanis sayimi girilmisse nakit o gunun muhurlu sayimina giremez; ertesi
  // gun "fazla" gorunur. Engellemiyoruz, kasiyer bilsin.
  useEffect(() => {
    if (!magaza) return;
    let iptal = false;
    supabase.from("cash_counts").select("id")
      .eq("store_id", magaza).eq("business_day", isletmeGunu()).eq("tur", "kapanis").limit(1)
      .then(({ data }) => { if (!iptal) setSayimVar((data || []).length > 0); });
    return () => { iptal = true; };
  }, [magaza]);

  // Tutar ya da yontem degisince onay sifirlanir: onaylanan sey ekrandakidir.
  useEffect(() => { setOnay(false); }, [tutar, yontem, magaza, bakiye]);
  useEffect(() => {
    if (!onay) return;
    const z = setTimeout(() => setOnay(false), 4000);
    return () => clearTimeout(z);
  }, [onay]);

  const tahsilEt = async () => {
    if (busy || !gecerli) return;
    if (!onay) { kurulumAni.current = Date.now(); setOnay(true); return; }
    if (Date.now() - kurulumAni.current < ONAY_BEKLE_MS) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("nip_borc_tahsil", {
      p_customer_id: kisi.id,
      p_amount: t,
      p_method: yontem,
      p_store_id: magaza,
      p_beklenen_bakiye: bakiye,
      p_not: not.trim() || null,
    });
    setBusy(false); setOnay(false);
    if (error) {
      // Bakiye bu arada degistiyse ekran tazelenir; kasiyer yeni rakami gorur.
      if (/bakiye degisti/i.test(error.message || "")) {
        await bakiyeTazele();
        alert("Bu arada borç değişti. Yeni tutarı kontrol et ve tekrar onayla.");
      } else {
        alert("Tahsilat yapılamadı: " + hataMetni(error));
      }
      return;
    }
    const sonuc = Array.isArray(data) ? data[0] : data;
    const kalan = Number(sonuc?.kalan ?? kalacak);
    onBitti && onBitti({ kalan, tutar: t, yontem, kisi: { ...kisi, bakiye: kalan }, paymentId: sonuc?.payment_id || null });
  };

  const sil = async () => {
    if (busy) return;
    if (gerekce.trim().length < 3) { alert("Neden sildiğini yaz (en az 3 harf)"); return; }
    if (!confirm(`${kisi.ad}: ${tl(t)} borç PARA ALINMADAN silinecek.\n\nKasaya para girmez. Kayıt "borç silindi" olarak kalır.\nDevam edilsin mi?`)) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("nip_borc_affet", {
      p_customer_id: kisi.id, p_amount: t, p_gerekce: gerekce.trim(), p_store_id: magaza,
    });
    setBusy(false);
    if (error) { alert("Borç silinemedi: " + hataMetni(error)); return; }
    const sonuc = Array.isArray(data) ? data[0] : data;
    const kalan = Number(sonuc?.kalan ?? kalacak);
    onBitti && onBitti({ kalan, tutar: t, yontem: "af", kisi: { ...kisi, bakiye: kalan }, paymentId: null });
  };

  const dugmeMetni = busy ? "Kaydediliyor…"
    : !gecerli ? (fazla ? "Tutar borçtan fazla" : "Tutar gir")
    : onay ? `Onayla — ${tl(t)} ${YONTEM_ADI[yontem]}`
    : tamami ? `${tl(t)} al · borç kapanır`
    : `${tl(t)} al · ${tl(kalacak)} kalır`;

  return (
    <Pencere baslik="Borç tahsil et" alt={kisi.ad} onKapat={onKapat}>
      <div style={{background:"#0C0C0C",border:"1px solid #2A2A2A",borderRadius:10,padding:14,marginBottom:guncellendi?6:14,display:"flex",justifyContent:"space-between",alignItems:"baseline"}}>
        <span style={{fontSize:14,fontWeight:700}}>Açık borç</span>
        <span style={{fontSize:30,fontWeight:800,fontVariantNumeric:"tabular-nums"}}>{tl(bakiye)}</span>
      </div>
      {guncellendi && (
        <div style={{fontSize:12,color:"#C87A6A",marginBottom:12}}>Borç başka bir cihazda değişti. Güncel tutar bu.</div>
      )}

      {magazalar.length > 1 && (
        <div style={{display:"flex",gap:6,marginBottom:12}}>
          {magazalar.map(m => (
            <button key={m.id} onClick={() => setMagaza(m.id)}
              style={{flex:1,minHeight:40,borderRadius:9,fontSize:12,fontWeight:800,cursor:"pointer",fontFamily:"inherit",
                      background:magaza===m.id?"#FFFFFF":"transparent",color:magaza===m.id?"#000":"#888",
                      border:"1px solid "+(magaza===m.id?"#FFFFFF":"#2A2A2A")}}>
              {m.name} kasası
            </button>
          ))}
        </div>
      )}

      {!silKip && (<>
        <div style={{display:"flex",gap:6,marginBottom:12}}>
          {YONTEMLER.map(([k, ik, l]) => (
            <button key={k} onClick={() => setYontem(k)}
              style={{flex:1,minHeight:48,padding:"10px 8px",borderRadius:10,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit",
                      display:"flex",alignItems:"center",justifyContent:"center",gap:6,
                      background:yontem===k?"#FFFFFF":"#222",color:yontem===k?"#000":"#888",
                      border:"1px solid "+(yontem===k?"#FFFFFF":"#333")}}>
              <Ikon ad={ik} boy={15}/>{l}
            </button>
          ))}
        </div>

        <div style={{fontSize:12,color:"#888",fontWeight:600,marginBottom:5}}>Alınan tutar</div>
        <SayiGirisi kip="para" value={tutar} onChange={v => setTutar(v)}
          style={{width:"100%",padding:"14px 16px",background:"#0C0C0C",border:"1px solid "+(fazla?"#C87A6A":"#2A2A2A"),borderRadius:10,color:"#F0EDE8",fontSize:20,fontWeight:700,outline:"none",fontFamily:"inherit",boxSizing:"border-box"}}/>
        <div style={{display:"flex",gap:8,marginTop:8,marginBottom:10}}>
          {[500, 1000].filter(v => v < bakiye).map(v => (
            <button key={v} onClick={() => setTutar(String(v))}
              style={{flex:1,padding:"11px 0",background:"transparent",color:"#F0EDE8",border:"1px solid #2A2A2A",borderRadius:10,fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit",fontVariantNumeric:"tabular-nums"}}>
              {tl(v)}
            </button>
          ))}
          <button onClick={() => setTutar(String(Math.round(bakiye * 100) / 100))}
            style={{flex:1.4,padding:"11px 0",background:tamami?"#FFFFFF":"transparent",color:tamami?"#000":"#F0EDE8",border:"1px solid "+(tamami?"#FFFFFF":"#2A2A2A"),borderRadius:10,fontSize:14,fontWeight:800,cursor:"pointer",fontFamily:"inherit"}}>
            Tamamı
          </button>
        </div>

        <div style={{fontSize:12,color:fazla?"#C87A6A":"#888",marginBottom:10,lineHeight:1.5,fontVariantNumeric:"tabular-nums"}}>
          {/* Borcun puani borc gunu verilmez; odenen tutar kadar simdi verilir
              (20 TL = 1 puan, 20261013_borc_puan.sql). */}
          {fazla ? `Borç ${tl(bakiye)}. Fazlasını alma; para üstünü ver.`
            : tamami ? `Borç sıfırlanır. Kişi +${Math.floor(t / 20)} puan kazanır.`
            : t > 0 ? `Kısmi ödeme. ${tl(kalacak)} borç kalır. Kişi +${Math.floor(t / 20)} puan kazanır.` : ""}
        </div>

        <input value={not} onChange={e => setNot(e.target.value)} placeholder="Not (isteğe bağlı)"
          style={{width:"100%",padding:"11px 12px",background:"#0C0C0C",border:"1px solid #2A2A2A",borderRadius:9,color:"#F0EDE8",fontSize:14,outline:"none",fontFamily:"inherit",boxSizing:"border-box",marginBottom:12}}/>

        {sayimVar && yontem === "cash" && (
          <div style={{display:"flex",gap:8,alignItems:"flex-start",padding:"10px 12px",marginBottom:12,border:"1px solid #C87A6A",borderRadius:10,fontSize:12,lineHeight:1.5}}>
            <span style={{color:"#C87A6A",flexShrink:0,marginTop:1}}><Ikon ad="uyari" boy={15}/></span>
            <span>Bugünün kasası sayıldı. Bu nakit yarın sabah sayımda <b>fazla</b> görünür. Yöneticiye haber ver.</span>
          </div>
        )}

        <div style={{display:"flex",gap:8}}>
          <button onClick={onKapat}
            style={{flex:1,padding:14,background:"transparent",color:"#888",border:"1px solid #333",borderRadius:10,fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
            Vazgeç
          </button>
          <button onClick={tahsilEt} disabled={busy || !gecerli}
            style={{flex:2.4,padding:14,border:"none",borderRadius:10,fontSize:14,fontWeight:800,fontFamily:"inherit",fontVariantNumeric:"tabular-nums",
                    cursor:gecerli?"pointer":"default",opacity:busy?0.6:1,
                    background:!gecerli?"#242424":onay?"#C87A6A":"#FFFFFF",
                    color:!gecerli?"#666":onay?"#0C0C0C":"#000"}}>
            {dugmeMetni}
          </button>
        </div>
      </>)}

      {/* Para alinmadan silmek tahsilat DEGILDIR: kasaya para girmez. Bu yuzden
          ayri, yalniz admin'e acik ve gerekce isteyen bir yol. */}
      {isAdmin && (
        silKip ? (
          <div style={{marginTop:4,padding:12,border:"1px solid #C87A6A",borderRadius:10}}>
            <div style={{fontSize:13,fontWeight:800,color:"#C87A6A",marginBottom:4}}>Borcu sil — para alınmadı</div>
            <div style={{fontSize:12,color:"#888",lineHeight:1.5,marginBottom:10}}>
              Kasaya para girmez. Satış cirodan düşmez. Kayıt "borç silindi" olarak kalır.
            </div>
            <div style={{fontSize:12,color:"#888",fontWeight:600,marginBottom:5}}>Silinecek tutar</div>
            <SayiGirisi kip="para" value={tutar} onChange={v => setTutar(v)}
              style={{width:"100%",padding:"11px 12px",background:"#0C0C0C",border:"1px solid #2A2A2A",borderRadius:9,color:"#F0EDE8",fontSize:16,fontWeight:700,outline:"none",fontFamily:"inherit",boxSizing:"border-box",marginBottom:8}}/>
            <input value={gerekce} onChange={e => setGerekce(e.target.value)} placeholder="Neden? (zorunlu)"
              style={{width:"100%",padding:"11px 12px",background:"#0C0C0C",border:"1px solid #2A2A2A",borderRadius:9,color:"#F0EDE8",fontSize:14,outline:"none",fontFamily:"inherit",boxSizing:"border-box",marginBottom:10}}/>
            <div style={{display:"flex",gap:8}}>
              <button onClick={() => { setSilKip(false); setGerekce(""); }}
                style={{flex:1,padding:12,background:"transparent",color:"#888",border:"1px solid #333",borderRadius:10,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                Vazgeç
              </button>
              <button onClick={sil} disabled={busy || !gecerli || gerekce.trim().length < 3}
                style={{flex:2,padding:12,border:"1px solid #C87A6A",borderRadius:10,fontSize:13,fontWeight:800,fontFamily:"inherit",
                        background:"transparent",color:(gecerli && gerekce.trim().length >= 3)?"#C87A6A":"#555",
                        cursor:(gecerli && gerekce.trim().length >= 3)?"pointer":"default"}}>
                {busy ? "Siliniyor…" : `${tl(t)} borcu sil`}
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setSilKip(true)}
            style={{width:"100%",marginTop:12,padding:"10px",background:"transparent",color:"#888",border:"none",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit",textDecoration:"underline",textUnderlineOffset:3}}>
            Para alınmadan borcu sil (yalnız admin)
          </button>
        )
      )}
    </Pencere>
  );
}

// ---------------------------------------------------------------------------
// DOKUM (EKSTRE)
// ---------------------------------------------------------------------------
// Borclularin hicbirinde uygulama hesabi yok; borcu gormelerinin tek yolu
// dokumun kopyalanip gonderilmesi. "Neyin parasi?" sorusunun cevabi da bu.
// onDegisti({ kalan }) — geri alma ya da geri yazmadan sonra yeni bakiye.
export function BorcEkstrePenceresi({ kisi, onKapat, onDegisti }) {
  const { staffUser, isManager, isAdmin } = useAuth();
  const [satirlar, setSatirlar] = useState(null);
  const [bakiye, setBakiye] = useState(Number(kisi.bakiye) || 0);
  const [kopyalandi, setKopyalandi] = useState(false);
  const [busy, setBusy] = useState(false);

  const yukle = async () => {
    const [{ data, error }, { data: c }] = await Promise.all([
      supabase.rpc("nip_borc_ekstre", { p_customer_id: kisi.id }),
      supabase.from("customers").select("outstanding_balance").eq("id", kisi.id).maybeSingle(),
    ]);
    if (error) { alert("Döküm alınamadı: " + error.message); setSatirlar([]); return null; }
    setSatirlar(data || []);
    const yeni = c ? Number(c.outstanding_balance) || 0 : null;
    if (yeni != null) setBakiye(yeni);
    return yeni;
  };
  useEffect(() => { yukle(); }, [kisi.id]);

  const bugun = isletmeGunu();
  const bugunMu = (s) => isletmeGunu(new Date(s.tarih)) === bugun;
  // Ayni gun: tahsilati giren ya da yonetici geri alir (ters kayit, kasa
  // sifirlanir). Gecmis gun: o gunun sayimi kapandi; admin borcu geri yazar,
  // para kaydina dokunulmaz.
  const geriAlinabilir = (s) => s.tur === "tahsilat" && !s.duzeltildi && bugunMu(s)
    && (isManager || s.personel === staffUser?.name);
  const geriYazilabilir = (s) => isAdmin && s.tur === "tahsilat" && !s.duzeltildi && !bugunMu(s);

  const isle = async (rpc, args, hataOnek) => {
    setBusy(true);
    const { error } = await supabase.rpc(rpc, args);
    setBusy(false);
    if (error) { alert(hataOnek + hataMetni(error)); return; }
    const yeni = await yukle();
    onDegisti && onDegisti({ kalan: yeni });
  };

  const geriAl = async (s) => {
    if (busy) return;
    const neden = prompt(`${tl(s.tutar)} ${YONTEM_ADI[s.yontem] || ""} tahsilat geri alınacak ve borç geri yazılacak.\n\nNeden? (en az 3 harf)`);
    if (neden == null) return;
    if (neden.trim().length < 3) { alert("Nedeni yaz (en az 3 harf)"); return; }
    await isle("nip_borc_tahsil_geri_al", { p_payment_id: s.kayit_id, p_gerekce: neden.trim() }, "Geri alınamadı: ");
  };

  const geriYaz = async (s) => {
    if (busy) return;
    const neden = prompt(`${kisaTarih(s.tarih)} tarihli ${tl(s.tutar)} tahsilat yanlış girilmiş sayılacak. ${tl(s.tutar)} borç geri yazılacak.\n\nO günün kasa kaydı değişmez.\n\nNeden? (en az 3 harf)`);
    if (neden == null) return;
    if (neden.trim().length < 3) { alert("Nedeni yaz (en az 3 harf)"); return; }
    await isle("nip_borc_geri_yaz", {
      p_customer_id: kisi.id, p_amount: Number(s.tutar), p_gerekce: neden.trim(),
      p_store_id: staffUser?.store_ids?.[0], p_payment_id: s.kayit_id,
    }, "Borç geri yazılamadı: ");
  };

  // Borcun yazildigi gun ile hesabin acildigi gun farkliysa ikisi de gorunur:
  // musteri "neyin parasi?" diye sorunca hesabin acildigi geceyi tanir.
  const hesapGunu = (s) => s.tur === "borc" && s.siparis_tarihi
    && istTarih(s.siparis_tarihi) !== istTarih(s.tarih) ? kisaTarih(s.siparis_tarihi) : null;

  const metin = () => {
    const sat = [`Not in Paris · Borç dökümü`, `${kisi.ad} — ${uzunTarih()}`, ""];
    for (const s of satirlar || []) {
      // Yanlis giris ve onun duzeltmesi musteriyi ilgilendirmez; ikisi de atlanir.
      if (s.tur === "geri_alma" || s.duzeltildi || (s.tur === "geri_yaz" && s.payment_id)) continue;
      const h = hesapGunu(s);
      if (s.tur === "borc") sat.push(`${kisaTarih(s.tarih)}  Borç   ${tl(s.tutar)}${h ? ` (${h} hesabı)` : ""}${s.aciklama ? "  " + s.aciklama : ""}`);
      else if (s.tur === "tahsilat") sat.push(`${kisaTarih(s.tarih)}  Ödeme −${tl(s.tutar)}  ${YONTEM_ADI[s.yontem] || ""}`);
      else if (s.tur === "af") sat.push(`${kisaTarih(s.tarih)}  Düşüldü −${tl(s.tutar)}`);
      else if (s.tur === "geri_yaz") sat.push(`${kisaTarih(s.tarih)}  Düzeltme +${tl(s.tutar)}`);
    }
    sat.push("", `Kalan borç: ${tl(bakiye)}`);
    return sat.join("\n");
  };

  const kopyala = async () => {
    const ok = await panoyaKopyala(metin());
    if (ok) { setKopyalandi(true); setTimeout(() => setKopyalandi(false), 2000); }
    else alert("Kopyalanamadı");
  };

  const ETIKET = { borc: "Borç", tahsilat: "Ödeme", geri_alma: "Geri alındı", af: "Borç silindi", geri_yaz: "Borç geri yazıldı" };

  return (
    <Pencere baslik="Borç dökümü" alt={kisi.ad} onKapat={onKapat}>
      <div style={{background:"#0C0C0C",border:"1px solid #2A2A2A",borderRadius:10,padding:"12px 14px",marginBottom:12,display:"flex",justifyContent:"space-between",alignItems:"baseline"}}>
        <span style={{fontSize:13,fontWeight:700}}>Kalan borç</span>
        <span style={{fontSize:24,fontWeight:800,fontVariantNumeric:"tabular-nums"}}>{tl(bakiye)}</span>
      </div>

      {satirlar == null && <div style={{color:"#888",fontSize:13,padding:"16px 0"}}>Yükleniyor…</div>}
      {satirlar && satirlar.length === 0 && <div style={{color:"#888",fontSize:13,padding:"16px 0"}}>Kayıt yok.</div>}

      {satirlar && satirlar.length > 0 && (
        <div style={{border:"1px solid #2A2A2A",borderRadius:10,overflow:"hidden",marginBottom:12}}>
          {satirlar.map((s, i) => {
            const arti = ARTIRAN.has(s.tur);
            const soluk = s.tur === "geri_alma" || s.duzeltildi;
            const h = hesapGunu(s);
            // Tahsilat notunun basindaki "borç tahsilatı: <ad>" tekrar; atilir.
            const not = s.tur === "borc" ? s.aciklama
              : (s.aciklama || "").replace(/^borç tahsilatı:\s*[^·]*·?\s*/, "");
            const alt = [h ? `${h} hesabı` : null, not, s.personel].filter(Boolean).join(" · ");
            return (
              <div key={s.kayit_id || i} style={{display:"flex",gap:10,alignItems:"flex-start",padding:"10px 12px",borderTop:i?"1px solid #1E1E1E":"none",opacity:soluk?0.5:1}}>
                <div style={{width:42,flexShrink:0,fontSize:12,color:"#888",fontVariantNumeric:"tabular-nums",paddingTop:1}}>{kisaTarih(s.tarih)}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:700,textDecoration:s.duzeltildi?"line-through":"none"}}>
                    {ETIKET[s.tur] || s.tur}
                    {s.yontem && s.tur !== "borc" && <span style={{color:"#888",fontWeight:500}}> · {YONTEM_ADI[s.yontem] || s.yontem}</span>}
                  </div>
                  {alt && <div style={{fontSize:11,color:"#888",marginTop:2,lineHeight:1.4,overflowWrap:"anywhere"}}>{alt}</div>}
                  {geriAlinabilir(s) && (
                    <button onClick={() => geriAl(s)} disabled={busy}
                      style={{marginTop:6,padding:"5px 10px",background:"transparent",color:"#C87A6A",border:"1px solid #333",borderRadius:7,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                      Yanlış girdim — geri al
                    </button>
                  )}
                  {geriYazilabilir(s) && (
                    <button onClick={() => geriYaz(s)} disabled={busy}
                      style={{marginTop:6,padding:"5px 10px",background:"transparent",color:"#888",border:"1px solid #333",borderRadius:7,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                      Yanlış girilmiş — borcu geri yaz (admin)
                    </button>
                  )}
                </div>
                <div style={{fontSize:14,fontWeight:800,flexShrink:0,fontVariantNumeric:"tabular-nums",color:!arti && !soluk ? "#7FA88A" : "#F0EDE8"}}>
                  {arti ? (s.tur === "borc" ? "" : "+") : "−"}{tl(s.tutar)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div style={{display:"flex",gap:8}}>
        <button onClick={kopyala} disabled={!satirlar}
          style={{flex:1,minHeight:46,background:"transparent",color:"#F0EDE8",border:"1px solid #2A2A2A",borderRadius:10,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
          <Ikon ad={kopyalandi ? "onay" : "kopyala"} boy={15}/>{kopyalandi ? "Kopyalandı" : "Metni kopyala"}
        </button>
        <a href={satirlar ? waLink(metin(), kisi.telefon) : undefined} target="_blank" rel="noreferrer"
          style={{flex:1,minHeight:46,background:"#FFFFFF",color:"#000",borderRadius:10,fontSize:13,fontWeight:800,textDecoration:"none",display:"flex",alignItems:"center",justifyContent:"center",gap:6,pointerEvents:satirlar?"auto":"none",opacity:satirlar?1:0.5}}>
          <Ikon ad="posta" boy={15}/>WhatsApp
        </a>
      </div>
    </Pencere>
  );
}

// ---------------------------------------------------------------------------
// KASA > BORCLULAR
// ---------------------------------------------------------------------------
// borclular: nip_borclular() satirlari (borcu olanlar ve borcunu BUGUN
// kapatanlar). acikHesaplar: uzun suredir acik duran adli hesaplar (borc
// defterinde degiller ama fiilen veresiye). hata: liste alinamadi.
export function BorclularPaneli({ borclular, hata = false, acikHesaplar = [], onKapat, onYenile, onBorcaAktar }) {
  const [tahsil, setTahsil] = useState(null);
  const [ekstre, setEkstre] = useState(null);
  const [mesaj, setMesaj] = useState(null);   // { metin, kisi }
  const acik = borclular.filter(b => Number(b.bakiye) > 0.005);
  // Borcunu bugun kapatan kisi listeden dusmez: kasiyer yanlis girdiyse
  // dokumden geri alabilsin (inceleme bulgusu).
  const kapatanlar = borclular.filter(b => Number(b.bakiye) <= 0.005 && Number(b.bugun_tahsilat) > 0);
  const toplam = acik.reduce((t, b) => t + Number(b.bakiye || 0), 0);

  const kisiOf = (b) => ({ id: b.customer_id, ad: b.ad, bakiye: Number(b.bakiye), telefon: b.telefon });

  const bitti = ({ kalan, tutar, yontem, kisi }) => {
    setTahsil(null);
    const sonu = kalan > 0.005 ? tl(kalan) + " kaldı." : "Borç kapandı.";
    setMesaj({
      kisi,
      metin: yontem === "af"
        ? `${kisi.ad}: ${tl(tutar)} borç silindi. ${sonu}`
        : `${kisi.ad}: ${tl(tutar)} ${YONTEM_ADI[yontem]} alındı. ${sonu}`,
    });
    onYenile && onYenile();
  };

  return (
    <Pencere baslik="Borçlular" alt={acik.length ? `${acik.length} kişi · toplam ${tl(toplam)}` : "Açık borç yok"} onKapat={onKapat} z={105}>
      {mesaj && (
        <div role="status" style={{display:"flex",gap:8,alignItems:"center",padding:"10px 12px",marginBottom:12,background:"#152015",border:"1px solid #2A3A2A",borderRadius:10,fontSize:13}}>
          <span style={{color:"#7FA88A",display:"flex"}}><Ikon ad="onay" boy={15}/></span>
          <span style={{flex:1}}>{mesaj.metin}</span>
          {/* Yanlis girdiyse buradan geri alir: borcu sifirlanan kisi listede
              Tahsil et dugmesiyle gorunmez. */}
          <button onClick={() => setEkstre(mesaj.kisi)}
            style={{padding:"6px 10px",background:"transparent",color:"#F0EDE8",border:"1px solid #2A3A2A",borderRadius:8,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
            Döküm
          </button>
        </div>
      )}

      {hata && (
        <div style={{display:"flex",gap:8,alignItems:"center",padding:"10px 12px",marginBottom:12,border:"1px solid #C87A6A",borderRadius:10,fontSize:13}}>
          <span style={{color:"#C87A6A",display:"flex"}}><Ikon ad="uyari" boy={15}/></span>
          <span style={{flex:1}}>Borç listesi alınamadı.</span>
          <button onClick={() => onYenile && onYenile()}
            style={{padding:"6px 10px",background:"transparent",color:"#F0EDE8",border:"1px solid #3A3A3A",borderRadius:8,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
            Yenile
          </button>
        </div>
      )}

      {acik.map(b => {
        const gun = gunFarki(b.acik_borc_tarihi);
        const eski = gun != null && gun >= 30;
        return (
          <div key={b.customer_id} style={{background:"#1A1A1A",border:"1px solid #2A2A2A",borderRadius:10,padding:12,marginBottom:8}}>
            <div style={{display:"flex",alignItems:"baseline",justifyContent:"space-between",gap:10}}>
              <div style={{fontSize:15,fontWeight:700,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{b.ad}</div>
              <div style={{fontSize:18,fontWeight:800,fontVariantNumeric:"tabular-nums",flexShrink:0}}>{tl(b.bakiye)}</div>
            </div>
            <div style={{fontSize:11,color:"#888",marginTop:3,display:"flex",gap:6,flexWrap:"wrap"}}>
              {gun != null && (
                <span style={{color:eski?"#C87A6A":"#888",fontWeight:eski?700:500}}>
                  {gun === 0 ? "bugün yazıldı" : `${gun} gündür açık`}
                </span>
              )}
              {b.borc_sayisi > 1 && <span>· {b.borc_sayisi} borç</span>}
              {b.son_tahsilat && <span>· son ödeme {kisaTarih(b.son_tahsilat)}</span>}
            </div>
            <div style={{display:"flex",gap:6,marginTop:10}}>
              <button onClick={() => { setMesaj(null); setEkstre(kisiOf(b)); }}
                style={{flex:1,minHeight:42,background:"transparent",color:"#F0EDE8",border:"1px solid #2A2A2A",borderRadius:9,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                Döküm
              </button>
              <button onClick={() => { setMesaj(null); setTahsil(kisiOf(b)); }}
                style={{flex:2,minHeight:42,background:"#FFFFFF",color:"#000",border:"none",borderRadius:9,fontSize:13,fontWeight:800,cursor:"pointer",fontFamily:"inherit"}}>
                Tahsil et
              </button>
            </div>
          </div>
        );
      })}

      {acik.length === 0 && !mesaj && !hata && (
        <div style={{textAlign:"center",padding:"24px 0",color:"#888",fontSize:13}}>Kimsenin açık borcu yok.</div>
      )}

      {kapatanlar.length > 0 && (
        <div style={{marginTop:16}}>
          <div style={{fontSize:12,color:"#888",fontWeight:600,marginBottom:8}}>Borcunu bugün kapatanlar</div>
          {kapatanlar.map(b => (
            <div key={b.customer_id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",border:"1px solid #2A2A2A",borderRadius:10,marginBottom:6}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{b.ad}</div>
                <div style={{fontSize:11,color:"#7FA88A"}}>bugün {tl(b.bugun_tahsilat)} ödedi · borcu yok</div>
              </div>
              <button onClick={() => { setMesaj(null); setEkstre(kisiOf(b)); }}
                style={{padding:"8px 12px",background:"transparent",color:"#F0EDE8",border:"1px solid #3A3A3A",borderRadius:8,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
                Döküm
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Masasiz, adli ve gunlerdir acik hesap fiilen veresiyedir ama borc
          defterinde gorunmez. 8 borcun 4'u bu sekilde baslamisti. */}
      {acikHesaplar.length > 0 && (
        <div style={{marginTop:16}}>
          <div style={{fontSize:12,color:"#888",fontWeight:600,marginBottom:4}}>Uzun süredir açık hesaplar</div>
          <div style={{fontSize:11,color:"#888",marginBottom:8,lineHeight:1.5}}>
            Bunlar borç defterinde görünmez. Kişi bugün ödemeyecekse borca aktar.
          </div>
          {acikHesaplar.map(o => (
            <div key={o.id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",border:"1px solid #2A2A2A",borderRadius:10,marginBottom:6}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{o.ad}</div>
                <div style={{fontSize:11,color:"#888"}}>{gunFarki(o.created_at)} gündür açık · {tl(o.total)}</div>
              </div>
              <button onClick={() => onBorcaAktar && onBorcaAktar(o)}
                style={{padding:"8px 12px",background:"transparent",color:"#F0EDE8",border:"1px solid #3A3A3A",borderRadius:8,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
                Borca aktar
              </button>
            </div>
          ))}
        </div>
      )}

      {tahsil && <BorcTahsilPenceresi kisi={tahsil} onKapat={() => setTahsil(null)} onBitti={bitti}/>}
      {ekstre && <BorcEkstrePenceresi kisi={ekstre} onKapat={() => setEkstre(null)} onDegisti={() => onYenile && onYenile()}/>}
    </Pencere>
  );
}
