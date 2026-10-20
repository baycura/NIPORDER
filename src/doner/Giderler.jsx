import { useEffect, useMemo, useState } from "react";
import { doner } from "./supabase.js";
import { useDoner } from "./DonerApp.jsx";
import SayiGirisi from "../components/SayiGirisi.jsx";
import Ikon from "../components/Ikon.jsx";
import { C, S, fmtTL, fmtN, bugunIso, gunEkle, ayBasi, kisaTarih, KATEGORILER, YONTEMLER, Baslik, Hata, Yukleniyor, Alan, Pencere, hataMetni } from "./ortak.jsx";

// GIDERLER — fatura ve gider girisi. "Kim odedi": doner kasasi ya da bir
// ortak (cebinden); ozet ekrani ortak odemelerini ayri toplar.
const BOS = () => ({ tarih: bugunIso(), kategori: "Malzeme", tutar: "", aciklama: "", tedarikci: "", fatura_no: "", odeyen: "kasa", yontem: "nakit", kdv_dahil: true });

export default function Giderler() {
  const { ben, uyeler, admin } = useDoner();
  const bugun = bugunIso();
  const [donem, setDonem] = useState("ay");   // ay | gecenay | hepsi
  const [liste, setListe] = useState(null);
  const [hata, setHata] = useState(null);
  const [form, setForm] = useState(null);     // null | {id?, ...}
  const [busy, setBusy] = useState(false);
  const [arama, setArama] = useState("");

  const aralik = useMemo(() => {
    if (donem === "ay") return [ayBasi(bugun), bugun];
    if (donem === "gecenay") { const p = gunEkle(ayBasi(bugun), -1); return [ayBasi(p), p]; }
    return [gunEkle(bugun, -365), bugun];
  }, [donem, bugun]);

  const yukle = async () => {
    setHata(null);
    const { data, error } = await doner.from("doner_giderler").select("*")
      .gte("tarih", aralik[0]).lte("tarih", aralik[1]).order("tarih", { ascending: false }).order("created_at", { ascending: false }).limit(1000);
    if (error) { setHata(hataMetni(error)); setListe([]); return; }
    setListe(data || []);
  };
  useEffect(() => { setListe(null); yukle(); }, [aralik[0], aralik[1]]);

  const kaydet = async () => {
    const tutar = Number(form.tutar);
    if (!form.tarih) { alert("Tarih gerekli."); return; }
    if (!(tutar > 0)) { alert("Tutar gerekli."); return; }
    setBusy(true);
    const satir = {
      tarih: form.tarih, kategori: form.kategori, tutar, aciklama: form.aciklama?.trim() || null,
      tedarikci: form.tedarikci?.trim() || null, fatura_no: form.fatura_no?.trim() || null,
      odeyen: form.odeyen || "kasa", yontem: form.yontem || "nakit", kdv_dahil: !!form.kdv_dahil,
    };
    const { error } = form.id
      ? await doner.from("doner_giderler").update(satir).eq("id", form.id)
      : await doner.from("doner_giderler").insert(satir);
    setBusy(false);
    if (error) { alert("Kaydedilemedi: " + hataMetni(error)); return; }
    setForm(null); yukle();
  };
  const sil = async (g) => {
    if (!confirm(`${kisaTarih(g.tarih)} · ${g.kategori} · ${fmtTL(g.tutar)} silinsin mi?`)) return;
    const { error } = await doner.from("doner_giderler").delete().eq("id", g.id);
    if (error) { alert("Silinemedi: " + hataMetni(error)); return; }
    setForm(null); yukle();
  };

  const q = arama.trim().toLocaleLowerCase("tr");
  const gosterilen = (liste || []).filter(g => !q || [g.kategori, g.aciklama, g.tedarikci, g.fatura_no, g.odeyen].some(x => String(x || "").toLocaleLowerCase("tr").includes(q)));
  const toplam = gosterilen.reduce((t, g) => t + Number(g.tutar), 0);
  const odeyenler = ["kasa", ...uyeler.filter(u => u.aktif).map(u => u.ad)];
  if (form && form.odeyen && !odeyenler.includes(form.odeyen)) odeyenler.push(form.odeyen);

  return (
    <div>
      <Baslik baslik="Giderler" alt="Fatura ve ödemeler"
              sag={<button onClick={() => setForm(BOS())} style={S.dugme(true)}>+ Gider</button>} />
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        {[["ay", "Bu ay"], ["gecenay", "Geçen ay"], ["hepsi", "Son 1 yıl"]].map(([k, l]) => (
          <button key={k} onClick={() => setDonem(k)} style={S.cip(donem === k)}>{l}</button>
        ))}
        <input value={arama} onChange={e => setArama(e.target.value)} placeholder="Ara: tedarikçi, açıklama, fatura no" style={{ ...S.alan, flex: "1 1 180px", width: "auto" }} />
      </div>
      <Hata metin={hata} />
      {liste === null && <Yukleniyor />}
      {liste && (
        <div style={{ ...S.kart, padding: 0, overflow: "hidden" }}>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", fontSize: 11, color: C.muted, letterSpacing: 1, textTransform: "uppercase", fontWeight: 600 }}>
            <span>{fmtN(gosterilen.length)} kayıt</span><span>{fmtTL(toplam)}</span>
          </div>
          {gosterilen.length === 0 && <div style={{ padding: 30, textAlign: "center", color: C.muted, fontSize: 13 }}>Kayıt yok.</div>}
          {gosterilen.map(g => (
            <button key={g.id} onClick={() => setForm({ ...g, tutar: String(g.tutar) })}
                    style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", borderTop: `1px solid ${C.line}`, background: "none", border: "none", borderTopStyle: "solid", color: C.ink, textAlign: "left", cursor: "pointer", fontFamily: "inherit" }}>
              <div style={{ width: 44, flexShrink: 0, fontSize: 12, fontWeight: 700, color: C.muted }}>{kisaTarih(g.tarih)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{g.kategori}{g.tedarikci ? ` · ${g.tedarikci}` : ""}</div>
                <div style={{ fontSize: 12, color: C.faint, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {g.aciklama || "—"}{g.fatura_no ? ` · no ${g.fatura_no}` : ""} · {g.odeyen === "kasa" ? "kasa" : g.odeyen} · {g.yontem}
                </div>
              </div>
              <div style={{ fontSize: 15, fontWeight: 800, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{fmtTL(g.tutar)}</div>
            </button>
          ))}
        </div>
      )}

      {form && (
        <Pencere baslik={form.id ? "Gideri düzenle" : "Yeni gider"} onKapat={() => setForm(null)}>
          <Alan etiket="TARİH"><input type="date" value={form.tarih} max={bugun} onChange={e => setForm(f => ({ ...f, tarih: e.target.value }))} style={S.alan} /></Alan>
          <Alan etiket="KATEGORİ">
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {KATEGORILER.map(k => <button key={k} type="button" onClick={() => setForm(f => ({ ...f, kategori: k }))} style={S.cip(form.kategori === k)}>{k}</button>)}
            </div>
          </Alan>
          <Alan etiket="TUTAR (₺)"><SayiGirisi kip="para" min={0} value={form.tutar} onChange={v => setForm(f => ({ ...f, tutar: v }))} placeholder="0" style={S.alan} /></Alan>
          <Alan etiket="AÇIKLAMA"><input value={form.aciklama || ""} onChange={e => setForm(f => ({ ...f, aciklama: e.target.value }))} placeholder="Örn: 20 kg dana et" style={S.alan} /></Alan>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Alan etiket="TEDARİKÇİ"><input value={form.tedarikci || ""} onChange={e => setForm(f => ({ ...f, tedarikci: e.target.value }))} placeholder="Firma" style={S.alan} /></Alan>
            <Alan etiket="FATURA NO"><input value={form.fatura_no || ""} onChange={e => setForm(f => ({ ...f, fatura_no: e.target.value }))} placeholder="İsteğe bağlı" style={S.alan} /></Alan>
          </div>
          <Alan etiket="KİM ÖDEDİ">
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {odeyenler.map(o => <button key={o} type="button" onClick={() => setForm(f => ({ ...f, odeyen: o }))} style={S.cip(form.odeyen === o)}>{o === "kasa" ? "Döner kasası" : o}</button>)}
            </div>
          </Alan>
          <Alan etiket="ÖDEME">
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {YONTEMLER.map(([k, l]) => <button key={k} type="button" onClick={() => setForm(f => ({ ...f, yontem: k }))} style={S.cip(form.yontem === k)}>{l}</button>)}
              <button type="button" onClick={() => setForm(f => ({ ...f, kdv_dahil: !f.kdv_dahil }))} style={S.cip(!!form.kdv_dahil)}>{form.kdv_dahil ? "KDV dahil" : "KDV hariç"}</button>
            </div>
          </Alan>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button onClick={kaydet} disabled={busy} style={{ ...S.dugme(true), flex: 1, opacity: busy ? 0.6 : 1 }}>{busy ? "Kaydediliyor…" : "KAYDET"}</button>
            {form.id && admin && (
              <button onClick={() => sil(form)} aria-label="Sil" style={{ ...S.dugme(false), color: C.down }}><Ikon ad="cop" boy={16} /></button>
            )}
          </div>
          {form.id && !admin && form.giren !== ben.auth_id && (
            <div style={{ fontSize: 12, color: C.faint, marginTop: 8 }}>Silme yalnız yöneticide.</div>
          )}
        </Pencere>
      )}
    </div>
  );
}
