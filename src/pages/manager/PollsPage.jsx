import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase.js";
import { useAuth } from "../../contexts/AuthContext.jsx";
import Ikon from "../../components/Ikon.jsx";

const cv = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";
const inputS = {width:"100%",padding:"10px 12px",background:"#0C0C0C",border:"1px solid #2A2A2A",borderRadius:8,color:"#F0EDE8",fontSize:14,outline:"none",fontFamily:"inherit"};

// QR menudeki "Oyla" sekmesinin sorulari. Musteri toplu sonucu gorur;
// serbest metin cevaplarini yalniz personel okur (bu sayfada).
const emptyForm = () => ({
  question: "", question_en: "", question_ru: "",
  options: [{ id: "a", tr: "", en: "", ru: "" }, { id: "b", tr: "", en: "", ru: "" }],
  allow_free_text: false, is_active: true, sort_order: 0, ends_at: "",
});

const nextOptId = (opts) => "abcdefgh".split("").find(c => !opts.some(o => o.id === c)) || String(opts.length + 1);

export default function PollsPage() {
  const { staffUser } = useAuth();
  const [polls, setPolls] = useState([]);
  const [results, setResults] = useState({});   // { pollId: {total, counts, free_count} }
  const [freeTexts, setFreeTexts] = useState({}); // { pollId: [metin...] }
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [busy, setBusy] = useState(false);

  // AI oneri kutusu
  const [aiBrief, setAiBrief] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiPolls, setAiPolls] = useState([]);

  const storeIds = staffUser?.store_ids?.length ? staffUser.store_ids : ["00000000-0000-0000-0000-000000000000"];

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("polls").select("*").in("store_id", storeIds)
      .order("is_active", { ascending: false }).order("sort_order").order("created_at", { ascending: false });
    const list = data || [];
    setPolls(list);
    setLoading(false);
    for (const p of list) {
      supabase.rpc("poll_results", { p_poll_id: p.id })
        .then(({ data: r }) => setResults(s => ({ ...s, [p.id]: r || {} })));
    }
    const ids = list.map(p => p.id);
    if (ids.length) {
      const { data: votes } = await supabase.from("poll_votes").select("poll_id, free_text")
        .in("poll_id", ids).not("free_text", "is", null).order("created_at", { ascending: false });
      const m = {};
      (votes || []).forEach(v => { (m[v.poll_id] = m[v.poll_id] || []).push(v.free_text); });
      setFreeTexts(m);
    }
  };
  useEffect(() => { load(); }, []);

  const openNew = () => { setForm(emptyForm()); setModal({ mode: "new" }); };
  const openEdit = (p) => {
    setForm({
      question: p.question || "", question_en: p.question_en || "", question_ru: p.question_ru || "",
      options: (p.options || []).length ? p.options : emptyForm().options,
      allow_free_text: !!p.allow_free_text, is_active: p.is_active !== false,
      sort_order: p.sort_order || 0, ends_at: p.ends_at ? String(p.ends_at).slice(0, 16) : "",
    });
    setModal({ mode: "edit", data: p });
  };

  const save = async () => {
    if (busy) return;
    if (!form.question.trim()) { alert("Soru gerekli"); return; }
    const opts = (form.options || []).filter(o => o.tr?.trim());
    if (!opts.length && !form.allow_free_text) { alert("En az bir seçenek gir ya da serbest cevabı aç"); return; }
    const storeId = staffUser?.store_ids?.[0];
    if (!storeId) { alert("Hesabına mağaza atanmamış — yönetici ile görüş."); return; }
    setBusy(true);
    const payload = {
      store_id: storeId,
      question: form.question.trim(),
      question_en: form.question_en?.trim() || null,
      question_ru: form.question_ru?.trim() || null,
      options: opts.map((o, i) => ({ id: o.id || "abcdefgh"[i], tr: o.tr.trim(), en: (o.en || o.tr).trim(), ru: (o.ru || o.tr).trim() })),
      allow_free_text: !!form.allow_free_text,
      is_active: form.is_active !== false,
      sort_order: Number(form.sort_order) || 0,
      ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
    };
    const { error } = modal.mode === "new"
      ? await supabase.from("polls").insert(payload)
      : await supabase.from("polls").update(payload).eq("id", modal.data.id);
    setBusy(false);
    if (error) { alert("Hata: " + error.message); return; }
    setModal(null); load();
  };

  const toggleActive = async (p) => {
    const { data, error } = await supabase.from("polls").update({ is_active: !p.is_active }).eq("id", p.id).select("id");
    if (error) { alert("Değiştirilemedi: " + error.message); return; }
    if (!data?.length) { alert("Değiştirilemedi: bu işlem için yetkin yok."); return; }
    load();
  };

  const del = async (p) => {
    if (!confirm('"' + p.question + '" silinsin mi? (oylar da silinir)')) return;
    const { error } = await supabase.from("polls").delete().eq("id", p.id);
    if (error) { alert("Silinemedi: " + error.message); return; }
    load();
  };

  const runAi = async () => {
    if (aiBusy) return;
    setAiBusy(true); setAiPolls([]);
    try {
      const { data, error } = await supabase.functions.invoke("poll-write", {
        body: { brief: aiBrief, count: 4, store_id: staffUser?.store_ids?.[0] },
      });
      if (error) throw new Error(error.message || "Sunucu hatasi");
      if (data?.error) throw new Error(data.error);
      setAiPolls(data.polls || []);
    } catch (e) { alert("AI hatası: " + (e?.message || e)); }
    setAiBusy(false);
  };

  // AI onerisini forma doldur (yayina almadan once gozden gecirilir)
  const useSuggestion = (sp) => {
    setForm({
      question: sp.question_tr || "", question_en: sp.question_en || "", question_ru: sp.question_ru || "",
      options: (sp.options || []).map((o, i) => ({ id: "abcdefgh"[i], tr: o.tr, en: o.en, ru: o.ru })),
      allow_free_text: !!sp.allow_free_text, is_active: true, sort_order: 0, ends_at: "",
    });
    setModal({ mode: "new" });
  };

  if (loading) return (<div style={{color:"#888",fontFamily:cv,padding:20}}>Yukleniyor...</div>);

  return (
    <div style={{fontFamily:cv,color:"#F0EDE8"}}>
      <div style={{fontSize:24,fontWeight:800,marginBottom:4}}>Oylamalar</div>
      <div style={{fontSize:11,color:"#888",letterSpacing:"1px",marginBottom:14}}>QR MENÜDEKİ "OYLA" SEKMESİ · MÜŞTERİ TOPLU SONUCU GÖRÜR</div>

      <div style={{background:"#161616",border:"1px solid #2A2A2A",borderRadius:12,padding:12,marginBottom:14}}>
        <div style={{fontSize:12,color:"#F0EDE8",letterSpacing:"0.2px",fontWeight:600,marginBottom:8,display:"flex",alignItems:"center",gap:6}}><Ikon ad="parlak" boy={13}/>AI İLE SORU ÜRET (üç dilde birden)</div>
        <textarea value={aiBrief} onChange={e=>setAiBrief(e.target.value)} rows={2}
          placeholder="örn: bu hafta parti var, kahve tarafına da soru olsun (boş bırakırsan menüye bakıp kendi seçer)"
          style={{...inputS, resize:"vertical"}}/>
        <button onClick={runAi} disabled={aiBusy} style={{width:"100%",marginTop:8,padding:"11px",background:aiBusy?"#555":"#2A2A2A",color:"#F0EDE8",border:"1px solid #2A2A2A",borderRadius:10,fontSize:13,fontWeight:800,cursor:aiBusy?"wait":"pointer"}}>
          {aiBusy ? "AI düşünüyor..." : <><Ikon ad="parlak" boy={14} style={{marginRight:6}}/>4 soru öner</>}
        </button>
        {aiPolls.map((sp, i) => (
          <div key={i} style={{marginTop:10,padding:"10px 12px",background:"#12181A",border:"1px solid #2A2A2A",borderRadius:10}}>
            <div style={{fontSize:14,fontWeight:700,color:"#DDD"}}>{sp.question_tr}</div>
            <div style={{fontSize:12,color:"#F0EDE8",marginTop:4,lineHeight:1.5}}>
              {(sp.options || []).map(o => o.tr).join(" · ") || "(serbest cevap)"}
              {sp.allow_free_text && (sp.options||[]).length > 0 ? " · + serbest cevap" : ""}
            </div>
            <button onClick={() => useSuggestion(sp)} style={{marginTop:8,padding:"7px 14px",background:"#FFFFFF",color:"#000",border:"none",borderRadius:8,fontSize:12,fontWeight:800,cursor:"pointer"}}>
              Bunu kullan<Ikon ad="oksag" boy={12} style={{marginLeft:4}}/>
            </button>
          </div>
        ))}
      </div>

      <button onClick={openNew} style={{padding:"10px 16px",background:"#FFFFFF",color:"#000",border:"none",borderRadius:10,fontSize:13,fontWeight:800,cursor:"pointer",marginBottom:14}}>+ Yeni Soru</button>

      {polls.length === 0 && <div style={{textAlign:"center",padding:30,color:"#888888",fontSize:12}}>Henüz oylama yok</div>}

      {polls.map(p => {
        const r = results[p.id] || {};
        const total = Number(r.total || 0);
        const answers = freeTexts[p.id] || [];
        return (
          <div key={p.id} style={{background:"#1A1A1A",border:"1px solid #2A2A2A",borderRadius:10,padding:12,marginBottom:8,opacity:p.is_active?1:0.55}}>
            <div style={{display:"flex",justifyContent:"space-between",gap:10,alignItems:"flex-start"}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:15,fontWeight:700}}>{p.question}</div>
                <div style={{fontSize:10,color:"#888888",marginTop:3}}>
                  {total} oy{p.allow_free_text ? " · serbest cevap açık" : ""}{p.ends_at ? " · bitiş " + new Date(p.ends_at).toLocaleDateString("tr-TR") : ""}
                </div>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:4,flexShrink:0}}>
                <button onClick={() => openEdit(p)} style={{padding:"5px 9px",background:"#222",color:"#aaa",border:"1px solid #333",borderRadius:6,fontSize:10,cursor:"pointer",fontWeight:700}}>Düzenle</button>
                <button onClick={() => toggleActive(p)} style={{padding:"5px 9px",background:p.is_active?"transparent":"#2A2A2A",color:p.is_active?"#888":"#F0EDE8",border:"1px solid #333",borderRadius:6,fontSize:10,cursor:"pointer"}}>{p.is_active?"Yayında":"Kapalı"}</button>
                <button onClick={() => del(p)} style={{padding:"5px 9px",background:"transparent",color:"#C87A6A",border:"1px solid #2A2A2A",borderRadius:6,fontSize:10,cursor:"pointer"}}>Sil</button>
              </div>
            </div>

            {(p.options || []).map(o => {
              const n = Number(r.counts?.[o.id] || 0);
              const pct = total > 0 ? Math.round((n / total) * 100) : 0;
              return (
                <div key={o.id} style={{marginTop:6}}>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:"#ccc",marginBottom:3}}>
                    <span>{o.tr}</span><span style={{color:"#888",fontWeight:700}}>{n} · %{pct}</span>
                  </div>
                  <div style={{height:6,background:"#0C0C0C",borderRadius:4,overflow:"hidden"}}>
                    <div style={{width:pct+"%",height:"100%",background:"#FFFFFF"}}/>
                  </div>
                </div>
              );
            })}

            {answers.length > 0 && (
              <div style={{marginTop:10,padding:"8px 10px",background:"#12181A",border:"1px solid #2A2A2A",borderRadius:8}}>
                <div style={{fontSize:12,color:"#F0EDE8",letterSpacing:"0.2px",fontWeight:600,marginBottom:6,display:"flex",alignItems:"center",gap:6}}><Ikon ad="kalem" boy={13}/>SERBEST CEVAPLAR ({answers.length}) — yalnız personel görür</div>
                <div style={{maxHeight:180,overflowY:"auto"}}>
                  {answers.map((a, i) => (
                    <div key={i} style={{fontSize:13,color:"#DDD",padding:"5px 0",borderBottom:"1px solid #161616"}}>{a}</div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {modal && (
        <div onClick={() => setModal(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:100}}>
          <div onClick={e => e.stopPropagation()} style={{background:"#161616",border:"1px solid #2A2A2A",borderRadius:"16px 16px 0 0",padding:20,width:"100%",maxWidth:560,maxHeight:"92vh",overflowY:"auto"}}>
            <div style={{fontSize:18,fontWeight:800,marginBottom:16}}>{modal.mode==="new"?"Yeni Soru":"Soruyu Düzenle"}</div>

            <Field label="SORU (Türkçe)"><input value={form.question} onChange={e=>setForm({...form,question:e.target.value})} placeholder="örn: Yarın hangi çekirdekten filtre demleyelim?" style={inputS}/></Field>
            <Field label="QUESTION (English)"><input value={form.question_en} onChange={e=>setForm({...form,question_en:e.target.value})} style={inputS}/></Field>
            <Field label="ВОПРОС (Русский)"><input value={form.question_ru} onChange={e=>setForm({...form,question_ru:e.target.value})} style={inputS}/></Field>

            <div style={{fontSize:12,color:"#888",letterSpacing:"0.2px",fontWeight:600,margin:"14px 0 6px"}}>Seçenekler</div>
            {(form.options || []).map((o, i) => (
              <div key={i} style={{background:"#141414",border:"1px solid #2A2A2A",borderRadius:8,padding:8,marginBottom:6}}>
                <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:6}}>
                  <span style={{fontSize:11,color:"#888888",fontWeight:800,width:14}}>{i+1}.</span>
                  <input value={o.tr} onChange={e=>{const n=[...form.options];n[i]={...o,tr:e.target.value};setForm({...form,options:n});}} placeholder="Türkçe" style={{...inputS,flex:1}}/>
                  <button onClick={()=>setForm({...form,options:form.options.filter((_,j)=>j!==i)})} style={{background:"transparent",color:"#C87A6A",border:"1px solid #2A2A2A",borderRadius:6,padding:"8px 10px",fontSize:12,cursor:"pointer",flexShrink:0}}>×</button>
                </div>
                <div style={{display:"flex",gap:6}}>
                  <input value={o.en||""} onChange={e=>{const n=[...form.options];n[i]={...o,en:e.target.value};setForm({...form,options:n});}} placeholder="English" style={{...inputS,fontSize:12}}/>
                  <input value={o.ru||""} onChange={e=>{const n=[...form.options];n[i]={...o,ru:e.target.value};setForm({...form,options:n});}} placeholder="Русский" style={{...inputS,fontSize:12}}/>
                </div>
              </div>
            ))}
            <button onClick={()=>setForm({...form,options:[...form.options,{id:nextOptId(form.options),tr:"",en:"",ru:""}]})}
              style={{padding:"8px 14px",background:"#222",color:"#aaa",border:"1px solid #333",borderRadius:8,fontSize:12,fontWeight:700,cursor:"pointer",marginBottom:12}}>+ Seçenek ekle</button>

            <label style={{display:"flex",alignItems:"center",gap:8,fontSize:13,color:"#ddd",cursor:"pointer",marginBottom:12}}>
              <input type="checkbox" checked={!!form.allow_free_text} onChange={e=>setForm({...form,allow_free_text:e.target.checked})} style={{width:16,height:16,accentColor:"#FFFFFF"}}/>
              <Ikon ad="kalem" boy={13} style={{marginRight:5}}/>Müşteri kendi cevabını da yazabilsin
            </label>

            <div style={{display:"flex",gap:10}}>
              <Field label="SIRA (küçük üstte)"><input type="number" value={form.sort_order} onChange={e=>setForm({...form,sort_order:e.target.value})} style={{...inputS,width:90}}/></Field>
              <Field label="BİTİŞ (opsiyonel)"><input type="datetime-local" value={form.ends_at} onChange={e=>setForm({...form,ends_at:e.target.value})} style={inputS}/></Field>
            </div>
            <label style={{display:"flex",alignItems:"center",gap:8,fontSize:13,color:"#ddd",cursor:"pointer",marginBottom:14}}>
              <input type="checkbox" checked={form.is_active!==false} onChange={e=>setForm({...form,is_active:e.target.checked})} style={{accentColor:"#FFFFFF"}}/> Yayında (menüde görünür)
            </label>

            <div style={{display:"flex",gap:8}}>
              <button onClick={() => setModal(null)} style={{flex:1,padding:"12px",background:"transparent",color:"#888",border:"1px solid #333",borderRadius:10,fontSize:14,fontWeight:700,cursor:"pointer"}}>İptal</button>
              <button onClick={save} disabled={busy} style={{flex:2,padding:"12px",background:"#FFFFFF",color:"#000",border:"none",borderRadius:10,fontSize:14,fontWeight:800,cursor:"pointer",opacity:busy?0.6:1}}>{busy?"Kaydediliyor...":"Kaydet"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({label, children}) {
  return (<div style={{marginBottom:12,flex:1}}>
    <div style={{fontSize:12,color:"#888",letterSpacing:"0.2px",fontWeight:600,marginBottom:5}}>{label}</div>
    {children}
  </div>);
}
