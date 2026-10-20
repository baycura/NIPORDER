import { useEffect, useState } from "react";
import { doner } from "./supabase.js";
import { useDoner } from "./DonerApp.jsx";
import SayiGirisi from "../components/SayiGirisi.jsx";
import Ikon from "../components/Ikon.jsx";
import { C, S, fmtTL, fmtN, bugunIso, kisaTarih, Baslik, Hata, Yukleniyor, Alan, Pencere, hataMetni } from "./ortak.jsx";

// BORCLULAR — veresiye defteri. "Odendi" isareti kaydi kapatir, silmez.
export default function Borclular() {
  const { admin } = useDoner();
  const bugun = bugunIso();
  const [liste, setListe] = useState(null);
  const [hata, setHata] = useState(null);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [odenenlerAcik, setOdenenlerAcik] = useState(false);

  const yukle = async () => {
    const { data, error } = await doner.from("doner_borclular").select("*").order("odendi").order("tarih", { ascending: false }).limit(500);
    if (error) { setHata(hataMetni(error)); setListe([]); return; }
    setListe(data || []);
  };
  useEffect(() => { yukle(); }, []);

  const kaydet = async () => {
    const tutar = Number(form.tutar);
    if (!form.ad?.trim()) { alert("Ad gerekli."); return; }
    if (!(tutar > 0)) { alert("Tutar gerekli."); return; }
    setBusy(true);
    const satir = { ad: form.ad.trim(), tutar, tarih: form.tarih || bugun, notu: form.notu?.trim() || null };
    const { error } = form.id
      ? await doner.from("doner_borclular").update(satir).eq("id", form.id)
      : await doner.from("doner_borclular").insert(satir);
    setBusy(false);
    if (error) { alert("Kaydedilemedi: " + hataMetni(error)); return; }
    setForm(null); yukle();
  };
  const odendi = async (b, deger) => {
    const { error } = await doner.from("doner_borclular").update({ odendi: deger, odeme_tarihi: deger ? bugun : null }).eq("id", b.id);
    if (error) { alert(hataMetni(error)); return; }
    yukle();
  };
  const sil = async (b) => {
    if (!confirm(`${b.ad} · ${fmtTL(b.tutar)} silinsin mi?`)) return;
    const { error } = await doner.from("doner_borclular").delete().eq("id", b.id);
    if (error) { alert("Silinemedi: " + hataMetni(error)); return; }
    setForm(null); yukle();
  };

  const acik = (liste || []).filter(b => !b.odendi);
  const odenen = (liste || []).filter(b => b.odendi);
  const toplam = acik.reduce((t, b) => t + Number(b.tutar), 0);

  const Satir = ({ b }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderTop: `1px solid ${C.line}` }}>
      <button onClick={() => setForm({ ...b, tutar: String(b.tutar) })} style={{ flex: 1, minWidth: 0, background: "none", border: "none", color: C.ink, textAlign: "left", cursor: "pointer", fontFamily: "inherit", padding: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>{b.ad}</div>
        <div style={{ fontSize: 12, color: C.faint, marginTop: 2 }}>{kisaTarih(b.tarih)}{b.notu ? ` · ${b.notu}` : ""}{b.odendi && b.odeme_tarihi ? ` · ödendi ${kisaTarih(b.odeme_tarihi)}` : ""}</div>
      </button>
      <div style={{ fontSize: 15, fontWeight: 800, fontVariantNumeric: "tabular-nums", color: b.odendi ? C.faint : C.ink, textDecoration: b.odendi ? "line-through" : "none" }}>{fmtTL(b.tutar)}</div>
      <button onClick={() => odendi(b, !b.odendi)} style={{ ...S.cip(!b.odendi), minHeight: 36, padding: "0 10px" }}>{b.odendi ? "Geri al" : "Ödendi"}</button>
    </div>
  );

  return (
    <div>
      <Baslik baslik="Borçlular" alt={`${fmtN(acik.length)} kişi · ${fmtTL(toplam)} açık`}
              sag={<button onClick={() => setForm({ ad: "", tutar: "", tarih: bugun, notu: "" })} style={S.dugme(true)}>+ Borç</button>} />
      <Hata metin={hata} />
      {liste === null && <Yukleniyor />}
      {liste && (
        <>
          <div style={{ ...S.kart, padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "10px 14px", fontSize: 11, color: C.muted, letterSpacing: 1, textTransform: "uppercase", fontWeight: 600 }}>Açık</div>
            {acik.length === 0 && <div style={{ padding: 24, textAlign: "center", color: C.muted, fontSize: 13, borderTop: `1px solid ${C.line}` }}>Açık borç yok.</div>}
            {acik.map(b => <Satir key={b.id} b={b} />)}
          </div>
          {odenen.length > 0 && (
            <div style={{ ...S.kart, padding: 0, overflow: "hidden", marginTop: 10 }}>
              <button onClick={() => setOdenenlerAcik(v => !v)} style={{ width: "100%", padding: "10px 14px", background: "none", border: "none", color: C.muted, textAlign: "left", fontFamily: "inherit", fontSize: 11, letterSpacing: 1, textTransform: "uppercase", fontWeight: 600, cursor: "pointer" }}>
                Ödenenler · {fmtN(odenen.length)} {odenenlerAcik ? "▾" : "▸"}
              </button>
              {odenenlerAcik && odenen.map(b => <Satir key={b.id} b={b} />)}
            </div>
          )}
        </>
      )}
      {form && (
        <Pencere baslik={form.id ? "Borcu düzenle" : "Yeni borç"} onKapat={() => setForm(null)}>
          <Alan etiket="AD"><input value={form.ad} onChange={e => setForm(f => ({ ...f, ad: e.target.value }))} placeholder="Kim" style={S.alan} /></Alan>
          <Alan etiket="TUTAR (₺)"><SayiGirisi kip="para" min={0} value={form.tutar} onChange={v => setForm(f => ({ ...f, tutar: v }))} placeholder="0" style={S.alan} /></Alan>
          <Alan etiket="TARİH"><input type="date" value={form.tarih} max={bugun} onChange={e => setForm(f => ({ ...f, tarih: e.target.value }))} style={S.alan} /></Alan>
          <Alan etiket="NOT"><input value={form.notu || ""} onChange={e => setForm(f => ({ ...f, notu: e.target.value }))} placeholder="Örn: 3 dürüm, cuma ödeyecek" style={S.alan} /></Alan>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button onClick={kaydet} disabled={busy} style={{ ...S.dugme(true), flex: 1, opacity: busy ? 0.6 : 1 }}>{busy ? "Kaydediliyor…" : "KAYDET"}</button>
            {form.id && admin && <button onClick={() => sil(form)} aria-label="Sil" style={{ ...S.dugme(false), color: C.down }}><Ikon ad="cop" boy={16} /></button>}
          </div>
        </Pencere>
      )}
    </div>
  );
}
