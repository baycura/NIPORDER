import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase.js";

const cv = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";

// QR menudeki Shop (urun hikayeleri) ve Blog sekmelerinin icerigi buradan yonetilir.
const KINDS = [
  { key: "urun", label: "👕 Ürün Hikayeleri", hint: "Tişört/merch tanıtımı — satış linki yok, 'kasadan alabilirsin' notu gösterilir." },
  { key: "blog", label: "📰 Blog / Haberler", hint: "Haberler, Fethiye tavsiyeleri — sipariş beklerken okunacak içerik." },
];

export default function ContentPage() {
  const [kind, setKind] = useState("urun");
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("posts").select("*").order("sort_order").order("created_at", { ascending: false });
    setPosts(data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const openNew = () => { setModal({ mode: "new" }); setForm({ kind, title: "", body: "", title_en: "", body_en: "", title_ru: "", body_ru: "", images: [], is_active: true, sort_order: 0 }); };
  const openEdit = (p) => { setModal({ mode: "edit", data: p }); setForm({ kind: p.kind, title: p.title || "", body: p.body || "", title_en: p.title_en || "", body_en: p.body_en || "", title_ru: p.title_ru || "", body_ru: p.body_ru || "", images: p.images || [], is_active: p.is_active !== false, sort_order: p.sort_order || 0 }); };

  const uploadPhotos = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setBusy(true);
    const urls = [...(form.images || [])];
    for (const f of files) {
      const path = "posts/" + Date.now() + "_" + f.name.replace(/[^a-zA-Z0-9.]/g, "_");
      const { error } = await supabase.storage.from("product-images").upload(path, f);
      if (error) { alert("Foto yükleme hatası: " + error.message); continue; }
      const { data } = supabase.storage.from("product-images").getPublicUrl(path);
      if (data?.publicUrl) urls.push(data.publicUrl);
    }
    setForm({ ...form, images: urls });
    setBusy(false);
  };

  const removePhoto = (idx) => setForm({ ...form, images: (form.images || []).filter((_, i) => i !== idx) });

  // --- AI ile icerik yazdirma (istege bagli: yuklu ilk fotografa bakarak) ---
  const [aiBrief, setAiBrief] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiTip, setAiTip] = useState("");
  const [useImage, setUseImage] = useState(true);

  // Yuklu fotografi AI'ye gondermek icin kucultup base64'e cevir (foto saklanmaz, sadece bakilir)
  const imageToBase64 = async (url) => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const bmp = await createImageBitmap(blob);
      const scale = Math.min(1, 1200 / Math.max(bmp.width, bmp.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bmp.width * scale);
      canvas.height = Math.round(bmp.height * scale);
      canvas.getContext("2d").drawImage(bmp, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/jpeg", 0.85).split(",")[1];
    } catch { return ""; }
  };

  const runAiWrite = async () => {
    if (aiBusy) return;
    const firstImg = (form.images || [])[0];
    if (!aiBrief.trim() && !(useImage && firstImg)) { alert("Kısa bir not yaz ya da önce fotoğraf yükle"); return; }
    setAiBusy(true); setAiTip("");
    try {
      const image = (useImage && firstImg) ? await imageToBase64(firstImg) : "";
      const { data, error } = await supabase.functions.invoke("content-write", {
        body: { brief: aiBrief, kind: form.kind, image, media_type: "image/jpeg" },
      });
      if (error) throw new Error(error.message || "Sunucu hatasi");
      if (data?.error) throw new Error(data.error);
      setForm(f => ({
        ...f,
        title: data.title_tr || f.title, body: data.body_tr || f.body,
        title_en: data.title_en || f.title_en, body_en: data.body_en || f.body_en,
        title_ru: data.title_ru || f.title_ru, body_ru: data.body_ru || f.body_ru,
      }));
      setAiTip(data.photo_tip || "");
    } catch (e) { alert("AI hatası: " + (e?.message || e)); }
    setAiBusy(false);
  };

  const save = async () => {
    if (busy) return;
    if (!form.title?.trim()) { alert("Başlık gerekli"); return; }
    setBusy(true);
    const payload = {
      kind: form.kind, title: form.title.trim(), body: form.body?.trim() || null,
      title_en: form.title_en?.trim() || null, body_en: form.body_en?.trim() || null,
      title_ru: form.title_ru?.trim() || null, body_ru: form.body_ru?.trim() || null,
      images: form.images || [], is_active: form.is_active !== false,
      sort_order: Number(form.sort_order) || 0, updated_at: new Date().toISOString(),
    };
    const { error } = modal.mode === "new"
      ? await supabase.from("posts").insert(payload)
      : await supabase.from("posts").update(payload).eq("id", modal.data.id);
    setBusy(false);
    if (error) { alert("Hata: " + error.message); return; }
    setModal(null); load();
  };

  const toggleActive = async (p) => {
    const { data, error } = await supabase.from("posts").update({ is_active: !p.is_active }).eq("id", p.id).select("id");
    if (error) { alert("Değiştirilemedi: " + error.message); return; }
    if (!data?.length) { alert("Değiştirilemedi: bu işlem için yetkin yok."); return; }
    load();
  };
  const del = async (p) => {
    if (!confirm('"' + p.title + '" silinsin mi?')) return;
    const { error } = await supabase.from("posts").delete().eq("id", p.id);
    if (error) { alert("Silinemedi: " + error.message); return; }
    load();
  };

  const filtered = posts.filter(p => p.kind === kind);
  const kindInfo = KINDS.find(k => k.key === kind);

  if (loading) return (<div style={{color:"#888",fontFamily:cv,padding:20}}>Yukleniyor...</div>);

  return (
    <div style={{fontFamily:cv,color:"#F0EDE8"}}>
      <div style={{fontSize:24,fontWeight:800,marginBottom:4}}>Vitrin & Blog</div>
      <div style={{fontSize:11,color:"#888",letterSpacing:"1px",marginBottom:14}}>QR MENÜDEKİ SHOP VE BLOG SEKMELERİNİN İÇERİĞİ</div>

      <div style={{display:"flex",gap:6,marginBottom:8}}>
        {KINDS.map(k => (
          <button key={k.key} onClick={() => setKind(k.key)} style={{flex:1,padding:"10px",border:"none",borderRadius:10,fontSize:12,fontWeight:700,background:kind===k.key?"#C8973E":"#222",color:kind===k.key?"#000":"#888",cursor:"pointer"}}>{k.label}</button>
        ))}
      </div>
      <div style={{fontSize:11,color:"#888",marginBottom:14}}>{kindInfo?.hint}</div>

      <button onClick={openNew} style={{padding:"10px 16px",background:"#C8973E",color:"#000",border:"none",borderRadius:10,fontSize:13,fontWeight:800,cursor:"pointer",marginBottom:14}}>+ Yeni İçerik</button>

      {filtered.length === 0 && <div style={{textAlign:"center",padding:30,color:"#666",fontSize:12}}>Henüz içerik yok</div>}

      {filtered.map(p => (
        <div key={p.id} style={{background:"#1A1A1A",border:"1px solid #2A2A2A",borderRadius:10,padding:12,marginBottom:8,display:"flex",gap:12,alignItems:"center",opacity:p.is_active===false?0.5:1}}>
          {(p.images?.[0]) ? <img src={p.images[0]} alt="" style={{width:54,height:54,borderRadius:8,objectFit:"cover",flexShrink:0}}/> : <div style={{width:54,height:54,borderRadius:8,background:"#333",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>{p.kind==="urun"?"👕":"📰"}</div>}
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:14,fontWeight:700,color:"#F0EDE8"}}>{p.title}</div>
            <div style={{fontSize:11,color:"#888",marginTop:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.body || "—"}</div>
            <div style={{fontSize:10,color:"#666",marginTop:2}}>{(p.images||[]).length} foto · {new Date(p.created_at).toLocaleDateString("tr-TR")}</div>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:4,flexShrink:0}}>
            <button onClick={() => openEdit(p)} style={{padding:"5px 9px",background:"#222",color:"#aaa",border:"1px solid #333",borderRadius:6,fontSize:10,cursor:"pointer",fontWeight:700}}>Düzenle</button>
            <button onClick={() => toggleActive(p)} style={{padding:"5px 9px",background:p.is_active===false?"#553355":"transparent",color:p.is_active===false?"#FFB0FF":"#888",border:"1px solid #333",borderRadius:6,fontSize:10,cursor:"pointer"}}>{p.is_active===false?"Pasif":"Aktif"}</button>
            <button onClick={() => del(p)} style={{padding:"5px 9px",background:"transparent",color:"#FF6666",border:"1px solid #553333",borderRadius:6,fontSize:10,cursor:"pointer"}}>Sil</button>
          </div>
        </div>
      ))}

      {modal && (
        <div onClick={() => setModal(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:100}}>
          <div onClick={e => e.stopPropagation()} style={{background:"#161616",border:"1px solid #2A2A2A",borderRadius:"16px 16px 0 0",padding:20,width:"100%",maxWidth:560,maxHeight:"92vh",overflowY:"auto"}}>
            <div style={{fontSize:18,fontWeight:800,color:"#F0EDE8",marginBottom:16}}>{modal.mode==="new"?"Yeni İçerik":"İçeriği Düzenle"}</div>

            <div style={{display:"flex",gap:6,marginBottom:12}}>
              {KINDS.map(k => (
                <button key={k.key} onClick={() => setForm({...form, kind:k.key})} style={{flex:1,padding:"9px",border:"none",borderRadius:8,fontSize:11,fontWeight:700,background:form.kind===k.key?"#C8973E":"#222",color:form.kind===k.key?"#000":"#888",cursor:"pointer"}}>{k.label}</button>
              ))}
            </div>

            <div style={{background:"#161616",border:"1px solid #2A2A3A",borderRadius:12,padding:12,marginBottom:14}}>
              <div style={{fontSize:10,color:"#B8C6F0",letterSpacing:"1.5px",fontWeight:700,marginBottom:8}}>🤖 AI İLE YAZ (üç dilde birden)</div>
              <textarea value={aiBrief} onChange={e=>setAiBrief(e.target.value)} rows={2}
                placeholder={form.kind==="urun"
                  ? "örn: bisikletçi arkadaşlarla tasarladığımız tişört, sırtında Fethiye rotası var"
                  : "örn: bu hafta Kayaköy'de üzüm hasadı var, sabah 8'de kalkarsan sisli manzarayı yakalarsın"}
                style={{...inputS, resize:"vertical"}}/>
              {(form.images||[]).length > 0 && (
                <label style={{display:"flex",alignItems:"center",gap:8,margin:"8px 0",cursor:"pointer",fontSize:12,color:"#aaa"}}>
                  <input type="checkbox" checked={useImage} onChange={e=>setUseImage(e.target.checked)} style={{width:16,height:16,accentColor:"#C8973E"}}/>
                  📷 Yüklediğim fotoğrafa bakarak yazsın
                </label>
              )}
              <button onClick={runAiWrite} disabled={aiBusy} style={{width:"100%",marginTop:6,padding:"11px",background:aiBusy?"#555":"#2A2A3A",color:"#B8C6F0",border:"1px solid #3A3A5A",borderRadius:10,fontSize:13,fontWeight:800,cursor:aiBusy?"wait":"pointer"}}>
                {aiBusy ? "AI yazıyor..." : "🤖 Metni oluştur (TR + EN + RU)"}
              </button>
              {aiTip && (
                <div style={{marginTop:10,padding:"10px 12px",background:"#12181A",border:"1px solid #1E3A42",borderRadius:8,fontSize:12,color:"#9CC",lineHeight:1.5}}>
                  📸 <b>Fotoğraf önerisi:</b> {aiTip}
                </div>
              )}
              <div style={{fontSize:10,color:"#666",marginTop:8,lineHeight:1.5}}>
                Metinler aşağıdaki alanlara yazılır — beğenmezsen düzenle, sonra kaydet. Fotoğraf saklanmaz, AI yalnızca yazarken bakar.
              </div>
            </div>

            <Field label="BAŞLIK (Türkçe)"><input value={form.title||""} onChange={e=>setForm({...form,title:e.target.value})} placeholder={form.kind==="urun"?"örn: Croissant Club Tee":"örn: Fethiye'de bu hafta"} style={inputS}/></Field>
            <Field label={form.kind==="urun"?"HİKAYE / TANITIM (Türkçe)":"YAZI (Türkçe)"}><textarea value={form.body||""} onChange={e=>setForm({...form,body:e.target.value})} rows={5} style={{...inputS,resize:"vertical"}}/></Field>

            <div style={{background:"#141414",border:"1px solid #2A2A2A",borderRadius:10,padding:12,marginBottom:12}}>
              <div style={{fontSize:10,color:"#888",letterSpacing:"1.5px",fontWeight:700,marginBottom:8}}>🇬🇧 ENGLISH (opsiyonel — boşsa Türkçe gösterilir)</div>
              <Field label="TITLE"><input value={form.title_en||""} onChange={e=>setForm({...form,title_en:e.target.value})} style={inputS}/></Field>
              <Field label="TEXT"><textarea value={form.body_en||""} onChange={e=>setForm({...form,body_en:e.target.value})} rows={4} style={{...inputS,resize:"vertical"}}/></Field>
            </div>

            <div style={{background:"#141414",border:"1px solid #2A2A2A",borderRadius:10,padding:12,marginBottom:12}}>
              <div style={{fontSize:10,color:"#888",letterSpacing:"1.5px",fontWeight:700,marginBottom:8}}>🇷🇺 РУССКИЙ (opsiyonel — boşsa Türkçe gösterilir)</div>
              <Field label="ЗАГОЛОВОК"><input value={form.title_ru||""} onChange={e=>setForm({...form,title_ru:e.target.value})} style={inputS}/></Field>
              <Field label="ТЕКСТ"><textarea value={form.body_ru||""} onChange={e=>setForm({...form,body_ru:e.target.value})} rows={4} style={{...inputS,resize:"vertical"}}/></Field>
            </div>

            <div style={{marginBottom:12}}>
              <div style={{fontSize:10,color:"#888",letterSpacing:"1.5px",fontWeight:700,marginBottom:5}}>FOTOĞRAFLAR</div>
              <input type="file" accept="image/*" multiple onChange={uploadPhotos} style={{...inputS,padding:"8px"}}/>
              {(form.images||[]).length > 0 && (
                <div style={{display:"flex",gap:8,overflowX:"auto",marginTop:8,paddingBottom:4}}>
                  {form.images.map((u, i) => (
                    <div key={i} style={{position:"relative",flexShrink:0}}>
                      <img src={u} alt="" style={{width:84,height:84,borderRadius:8,objectFit:"cover"}}/>
                      <button onClick={() => removePhoto(i)} style={{position:"absolute",top:-6,right:-6,width:22,height:22,borderRadius:"50%",background:"#c44",color:"#fff",border:"none",fontSize:12,cursor:"pointer",lineHeight:1}}>×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:14}}>
              <Field label="SIRA (küçük üstte)"><input type="number" value={form.sort_order??0} onChange={e=>setForm({...form,sort_order:e.target.value})} style={{...inputS,width:100}}/></Field>
              <label style={{display:"flex",alignItems:"center",gap:8,fontSize:12,color:"#ddd",cursor:"pointer",marginTop:8}}>
                <input type="checkbox" checked={form.is_active!==false} onChange={e=>setForm({...form,is_active:e.target.checked})} style={{accentColor:"#C8973E"}}/> Aktif (menüde görünür)
              </label>
            </div>

            <div style={{display:"flex",gap:8}}>
              <button onClick={() => setModal(null)} style={{flex:1,padding:"12px",background:"transparent",color:"#888",border:"1px solid #333",borderRadius:10,fontSize:14,fontWeight:700,cursor:"pointer"}}>İptal</button>
              <button onClick={save} disabled={busy} style={{flex:2,padding:"12px",background:"#C8973E",color:"#000",border:"none",borderRadius:10,fontSize:14,fontWeight:800,cursor:"pointer",opacity:busy?0.6:1}}>{busy?"Kaydediliyor...":"Kaydet"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const inputS = {width:"100%",padding:"10px 12px",background:"#0C0C0C",border:"1px solid #2A2A2A",borderRadius:8,color:"#F0EDE8",fontSize:14,outline:"none",fontFamily:"inherit"};

function Field({label, children}) {
  return (<div style={{marginBottom:12,flex:1}}>
    <div style={{fontSize:10,color:"#888",letterSpacing:"1.5px",fontWeight:700,marginBottom:5}}>{label}</div>
    {children}
  </div>);
}
