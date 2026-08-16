import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase.js";
import { PARIS_STORE_ID } from "../../lib/stores.js";

const cv = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";

// ISO gun numaralari: Pzt=1 ... Paz=7 (fn_is_party_now ile ayni)
const DAYS = [[1,"Pzt"],[2,"Sal"],[3,"Çar"],[4,"Per"],[5,"Cum"],[6,"Cmt"],[7,"Paz"]];

export default function SettingsPage() {
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = async () => {
    setLoading(true);
    // NOT: app_settings PK'si (key, store_id) — iki magaza var, sadece NIP'i oku
    const { data } = await supabase.from("app_settings").select("*").eq("store_id", PARIS_STORE_ID);
    const obj = {};
    (data || []).forEach(s => { obj[s.key] = s.value; });
    setSettings(obj);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const setKey = async (key, value) => {
    setSettings({...settings, [key]: value});
  };

  const [trBusy, setTrBusy] = useState(false);  const [eurBusy, setEurBusy] = useState(false);
  // Kuru elle tetikle: fonksiyon TCMB'den ceker, guvenlik bandini uygular
  const syncEurRate = async () => {
    if (eurBusy) return;
    setEurBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("eur-rate-sync", { body: {} });
      if (error) throw new Error(error.message || "Sunucu hatasi");
      if (data?.error) throw new Error(data.error);
      alert("Kur cekildi: 1 € = ₺" + data.fetched + " (" + (data.source || "") + ")");
      load();
    } catch (e) { alert("Kur guncellenemedi: " + (e?.message || e)); }
    setEurBusy(false);
  };

  const translateAnnouncement = async () => {
    const src = (settings.announcement_tr || "").trim();
    if (!src) { alert("Once Turkce duyuruyu yaz"); return; }
    if (trBusy) return;
    setTrBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-translate", { body: { text: src } });
      if (error) throw new Error(error.message || "Sunucu hatasi");
      if (data?.error) throw new Error(data.error);
      setSettings(s => ({ ...s, announcement_en: data.en || s.announcement_en, announcement_ru: data.ru || s.announcement_ru }));
    } catch (e) { alert("Ceviri hatasi: " + (e?.message || e)); }
    setTrBusy(false);
  };

  const save = async () => {
    if (busy) return;
    setBusy(true);
    // PK (key, store_id) — store_id gonderilmezse ve onConflict "key" olursa
    // Postgres 42P10 verir ve kayit SESSIZCE duserdi. Hatalari da gosteriyoruz.
    const rows = Object.entries(settings).map(([key, value]) => ({ key, value, store_id: PARIS_STORE_ID }));
    const { error } = await supabase.from("app_settings").upsert(rows, { onConflict: "key,store_id" });
    setBusy(false);
    if (error) { alert("Ayarlar kaydedilemedi: " + (error.message || "bilinmeyen hata")); return; }
    await load();
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (loading) return (<div style={{color:"#888",fontFamily:cv,padding:20}}>Yukleniyor...</div>);

  const partyEnabled = settings.party_mode_enabled === true || settings.party_mode_enabled === "true";
  const partyFrom = settings.party_mode_from || "22:00";
  const partyUntil = settings.party_mode_until || "04:00";
  const partyDays = Array.isArray(settings.party_days) ? settings.party_days : [];
  const toggleDay = (n) => setKey("party_days",
    partyDays.includes(n) ? partyDays.filter(d => d !== n) : [...partyDays, n].sort((a,b)=>a-b));
  const memberDiscount = Number(settings.member_discount_pct) || 0;
  const memberEnabled = settings.member_discount_enabled === true || settings.member_discount_enabled === "true";

  return (
    <div style={{fontFamily:cv,color:"#F0EDE8"}}>
      <div style={{fontSize:24,fontWeight:800,marginBottom:4}}>Ayarlar</div>
      <div style={{fontSize:11,color:"#888",letterSpacing:"1px",marginBottom:18}}>SISTEM AYARLARI</div>

      {/* Parti modu */}
      <Section icon="🎉" title="Parti Gecesi" desc="Seçtiğin gün ve saatlerde parti menüsü açılır. Ayrıca reçetede &quot;sadece parti gecesi&quot; işaretli malzemeler (PET bardak gibi) yalnız bu pencerede stoktan düşer.">
        <Toggle checked={partyEnabled} onChange={v=>setKey("party_mode_enabled", v)} label="Parti menüsü aktif"/>
        <Field label="PARTİ GÜNLERİ">
          <div style={{display:"flex",gap:6}}>
            {DAYS.map(([n, label]) => {
              const on = partyDays.includes(n);
              return (
                <button key={n} onClick={()=>toggleDay(n)} style={{flex:1,padding:"10px 0",background:on?"#C8973E":"#0C0C0C",color:on?"#000":"#777",border:"1px solid "+(on?"#C8973E":"#2A2A2A"),borderRadius:8,fontSize:12,fontWeight:800,cursor:"pointer",fontFamily:"inherit"}}>
                  {label}
                </button>
              );
            })}
          </div>
        </Field>
        <div style={{display:"flex",gap:8}}>
          <Field label="BASLANGIC" style={{flex:1}}><input type="time" value={partyFrom} onChange={e=>setKey("party_mode_from", e.target.value)} style={inputS}/></Field>
          <Field label="BITIS" style={{flex:1}}><input type="time" value={partyUntil} onChange={e=>setKey("party_mode_until", e.target.value)} style={inputS}/></Field>
        </div>
        <div style={{fontSize:11,color:"#888",marginTop:6,lineHeight:1.6}}>
          Şu anki ayar: <b style={{color:"#C8973E"}}>{partyDays.length ? partyDays.map(n=>DAYS.find(d=>d[0]===n)?.[1]).join(", ") : "gün seçilmedi"}</b> günleri {partyFrom}–{partyUntil}.
          <br/>Gece yarısını aşan saatlerde parti, <b>başladığı güne</b> sayılır: Cuma 23:00 ve Cumartesi 02:00 aynı partidir.
        </div>
      </Section>

      {/* Bar standart olcusu */}
      <Section icon="🥃" title="Standart Ölçü" desc="Barda tek ölçünün kaç cl olduğu. Reçete sayfasındaki hazır düğmeler (Tek / Duble / Yarım) buna göre üretilir.">
        <Field label={"TEK ÖLÇÜ (cl) — şu an: " + (Number(settings.house_pour_cl) || 4) + " cl"}>
          <input type="number" step="0.5" min="1" max="10" value={settings.house_pour_cl ?? 4} onChange={e=>setKey("house_pour_cl", Number(e.target.value))} style={inputS}/>
        </Field>
        <div style={{fontSize:11,color:"#888",marginTop:6}}>NOT: Bu yalniz kisayol dugmelerini etkiler; recetede istedigin miktari her zaman elle yazabilirsin.</div>
      </Section>

      {/* Euro kuru */}
      <Section icon="💶" title="Euro Kuru" desc="Fiyatini EURO olarak girdigin urunlerin TL karsiligi bu kurla hesaplanir. Kur degisince o urunlerin TL fiyati kendiliginden guncellenir. Siparis, odeme ve raporlar her zaman TL kalir.">
        <Toggle checked={settings.eur_rate_auto !== false && settings.eur_rate_auto !== "false"}
          onChange={v=>setKey("eur_rate_auto", v)} label="Kuru otomatik guncelle (her is gunu 17:00 — TCMB doviz satis)"/>
        <div style={{display:"flex",gap:8}}>
          <Field label="1 EURO KAC TL?" style={{flex:1}}>
            <input type="number" step="0.01" value={settings.eur_rate || ""} onChange={e=>setKey("eur_rate", e.target.value)} placeholder="Orn: 55.24" style={inputS}/>
          </Field>
          <Field label="EK PAY (%)" style={{width:110}}>
            <input type="number" step="0.5" value={settings.eur_rate_markup_pct ?? "0"} onChange={e=>setKey("eur_rate_markup_pct", e.target.value)} placeholder="0" style={inputS}/>
          </Field>
          <Field label="GUVENLIK BANDI (%)" style={{width:130}}>
            <input type="number" step="1" value={settings.eur_rate_max_jump_pct ?? "10"} onChange={e=>setKey("eur_rate_max_jump_pct", e.target.value)} placeholder="10" style={inputS}/>
          </Field>
        </div>
        <button onClick={syncEurRate} disabled={eurBusy}
          style={{width:"100%",padding:"11px",background:eurBusy?"#555":"#2A2A3A",color:"#B8C6F0",border:"1px solid #3A3A5A",borderRadius:8,fontSize:12,fontWeight:800,cursor:eurBusy?"wait":"pointer",margin:"4px 0 8px"}}>
          {eurBusy ? "Kur cekiliyor..." : "🔄 Kuru simdi guncelle"}
        </button>
        {settings.eur_rate_note ? (
          <div style={{padding:"10px 12px",background:"#2A1F12",border:"1px solid #5A4020",borderRadius:8,fontSize:12,color:"#FFC98A",lineHeight:1.5,marginBottom:6}}>
            ⚠ {settings.eur_rate_note}
          </div>
        ) : null}
        <div style={{fontSize:11,color:"#888",lineHeight:1.6}}>
          {settings.eur_rate_updated_at
            ? "Son guncelleme: " + new Date(settings.eur_rate_updated_at).toLocaleString("tr-TR") + (settings.eur_rate_source ? " · " + settings.eur_rate_source : "")
            : "Henuz otomatik guncelleme yapilmadi."}
          <br/>EK PAY: kura eklenecek yuzde (orn. 2 yazarsan kur %2 yuksek uygulanir).
          <br/>GUVENLIK BANDI: kur bu yuzdeden fazla sicrarsa otomatik YAZILMAZ, burada uyari cikar — elle onaylarsin.
        </div>
      </Section>

      {/* Duyuru seridi */}
      <Section icon="📢" title="Duyuru Seridi (QR Menu)" desc="QR menunun en ustunde ince siyah bir serit olarak gorunur. Kampanya/duyuru icin — Instagram'a ya da tahtaya yazmaya gerek kalmaz.">
        <Toggle checked={settings.announcement_enabled === true || settings.announcement_enabled === "true"} onChange={v=>setKey("announcement_enabled", v)} label="Duyuru seridi aktif"/>
        <Field label="DUYURU (TURKCE)">
          <input value={settings.announcement_tr || ""} onChange={e=>setKey("announcement_tr", e.target.value)} placeholder="Orn: Pazar gunleri fici bira 150 TL! 🍺" style={inputS}/>
        </Field>
        <button onClick={translateAnnouncement} disabled={trBusy} style={{width:"100%",padding:"10px",background:trBusy?"#555":"#2A2A3A",color:"#B8C6F0",border:"1px solid #3A3A5A",borderRadius:8,fontSize:12,fontWeight:800,cursor:trBusy?"wait":"pointer",margin:"4px 0 8px"}}>
          {trBusy ? "AI çeviriyor..." : "🤖 EN + RU otomatik çevir (AI)"}
        </button>
        <div style={{display:"flex",gap:8}}>
          <Field label="ENGLISH (BOSSA TR GOSTERILIR)" style={{flex:1}}>
            <input value={settings.announcement_en || ""} onChange={e=>setKey("announcement_en", e.target.value)} placeholder="e.g. Sunday draft beer 150 TL!" style={inputS}/>
          </Field>
          <Field label="РУССКИЙ (BOSSA TR)" style={{flex:1}}>
            <input value={settings.announcement_ru || ""} onChange={e=>setKey("announcement_ru", e.target.value)} placeholder="напр.: Разливное пиво 150 TL по воскресеньям!" style={inputS}/>
          </Field>
        </div>
      </Section>

      {/* Online odeme (PayTR) */}
      <Section icon="💳" title="Online Odeme (PayTR)" desc="Musteri siparis verdikten sonra telefonundan kartla odeyebilir. Kapatirsan buton musteri ekranindan kaybolur; kasa akisi degismez.">
        <Toggle checked={settings.online_payment_enabled === true || settings.online_payment_enabled === "true"} onChange={v=>setKey("online_payment_enabled", v)} label="Online odeme aktif"/>
        <div style={{fontSize:11,color:"#888",marginTop:6}}>NOT: Odeme PayTR guvenli sayfasinda gerceklesir; onay PayTR'den gelince siparis otomatik "odendi" olur ve kasadan duser.</div>
      </Section>

      {/* Member indirimi */}
      <Section icon="🌟" title="Uye Indirimi" desc="Sisteme kayitli musterilerin Google ile giris yapip otomatik indirim almalari icin.">
        <Toggle checked={memberEnabled} onChange={v=>setKey("member_discount_enabled", v)} label="Uye indirimi aktif"/>
        <Field label={"INDIRIM ORANI (%) - su an: %" + memberDiscount}>
          <input type="number" min="0" max="50" value={memberDiscount} onChange={e=>setKey("member_discount_pct", Number(e.target.value))} style={inputS}/>
        </Field>
        <div style={{fontSize:11,color:"#888",marginTop:6}}>NOT: Bir musteriye ozel "admin_discount" varsa, uye indirimi yerine o uygulanir.</div>
      </Section>

      {/* Save button */}
      <button onClick={save} disabled={busy} style={{width:"100%",padding:"14px",background:"#C8973E",color:"#000",border:"none",borderRadius:12,fontSize:15,fontWeight:800,cursor:"pointer",marginTop:16,opacity:busy?0.6:1}}>{busy?"Kaydediliyor...":(saved?"✓ Kaydedildi":"Ayarlari Kaydet")}</button>
    </div>
  );
}

const inputS = {width:"100%",padding:"10px 12px",background:"#0C0C0C",border:"1px solid #2A2A2A",borderRadius:8,color:"#F0EDE8",fontSize:14,outline:"none",fontFamily:"inherit"};

function Field({label, children, style={}}) {
  return (<div style={{marginBottom:12,...style}}>
    <div style={{fontSize:10,color:"#888",letterSpacing:"1.5px",fontWeight:700,marginBottom:5}}>{label}</div>
    {children}
  </div>);
}

function Toggle({checked, onChange, label}) {
  return (<label style={{display:"flex",alignItems:"center",gap:10,marginBottom:14,cursor:"pointer",userSelect:"none"}}>
    <div style={{position:"relative",width:42,height:24,borderRadius:12,background:checked?"#C8973E":"#333",transition:"0.2s"}}>
      <div style={{position:"absolute",top:3,left:checked?21:3,width:18,height:18,borderRadius:"50%",background:"#fff",transition:"0.2s"}}/>
    </div>
    <input type="checkbox" checked={checked} onChange={e=>onChange(e.target.checked)} style={{display:"none"}}/>
    <span style={{fontSize:14,color:"#F0EDE8"}}>{label}</span>
  </label>);
}

function Section({icon, title, desc, children}) {
  return (<div style={{background:"#1A1A1A",border:"1px solid #2A2A2A",borderRadius:12,padding:16,marginBottom:14}}>
    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
      <span style={{fontSize:18}}>{icon}</span>
      <div style={{fontSize:16,fontWeight:800,color:"#F0EDE8"}}>{title}</div>
    </div>
    <div style={{fontSize:11,color:"#888",marginBottom:14,lineHeight:1.5}}>{desc}</div>
    {children}
  </div>);
}
