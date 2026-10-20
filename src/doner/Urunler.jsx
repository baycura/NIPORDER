import { useEffect, useMemo, useState } from "react";
import { doner } from "./supabase.js";
import SayiGirisi from "../components/SayiGirisi.jsx";
import { C, S, fmtTL, fmtN, bugunIso, gunEkle, kisaTarih, Baslik, Hata, Yukleniyor, Alan, hataMetni } from "./ortak.jsx";

// URUNLER — donerin kendi menusu (kitchen_menu; mutfak uygulamasiyla ortak).
//   Maliyet: urun basina birim maliyet (doner_urun_maliyet) -> kar payi.
//   Gunluk adet: o gun kac tane satildi (doner_satislar) -> urun maliyeti toplami.
// Fiyat burada degismez; fiyat mutfak uygulamasinin isi.
export default function Urunler() {
  const bugun = bugunIso();
  const [sekme, setSekme] = useState("maliyet");   // maliyet | adet
  const [urunler, setUrunler] = useState(null);
  const [maliyet, setMaliyet] = useState({});       // urun_id -> string
  const [kayitli, setKayitli] = useState({});       // urun_id -> number (sunucudaki)
  const [tarih, setTarih] = useState(bugun);
  const [adet, setAdet] = useState({});             // urun_id -> string
  const [hata, setHata] = useState(null);
  const [busy, setBusy] = useState(false);
  const [bilgi, setBilgi] = useState("");

  useEffect(() => {
    Promise.all([
      doner.from("kitchen_menu").select("id, name, names, section, price, available, sort").order("section").order("sort"),
      doner.from("doner_urun_maliyet").select("urun_id, maliyet"),
    ]).then(([u, m]) => {
      if (u.error) { setHata(hataMetni(u.error)); setUrunler([]); return; }
      setUrunler(u.data || []);
      const k = {}; (m.data || []).forEach(r => { k[r.urun_id] = Number(r.maliyet); });
      setKayitli(k);
      setMaliyet(Object.fromEntries(Object.entries(k).map(([a, b]) => [a, String(b)])));
    });
  }, []);

  useEffect(() => {
    let iptal = false;
    doner.from("doner_satislar").select("urun_id, adet").eq("tarih", tarih).then(({ data }) => {
      if (iptal) return;
      const a = {}; (data || []).forEach(r => { a[r.urun_id] = String(r.adet); });
      setAdet(a);
    });
    return () => { iptal = true; };
  }, [tarih]);

  const adi = (u) => u.names?.tr || u.name;
  const bolumler = useMemo(() => {
    const m = new Map();
    (urunler || []).forEach(u => { const b = u.section || "—"; if (!m.has(b)) m.set(b, []); m.get(b).push(u); });
    return [...m.entries()];
  }, [urunler]);

  const maliyetKaydet = async () => {
    const satirlar = Object.entries(maliyet)
      .filter(([id, v]) => v !== "" && isFinite(Number(v)) && Number(v) !== kayitli[id])
      .map(([id, v]) => ({ urun_id: id, maliyet: Number(v), guncellendi: new Date().toISOString() }));
    if (!satirlar.length) { setBilgi("Değişiklik yok."); return; }
    setBusy(true); setBilgi("");
    const { error } = await doner.from("doner_urun_maliyet").upsert(satirlar, { onConflict: "urun_id" });
    setBusy(false);
    if (error) { alert("Kaydedilemedi: " + hataMetni(error)); return; }
    const k = { ...kayitli }; satirlar.forEach(s => { k[s.urun_id] = s.maliyet; }); setKayitli(k);
    setBilgi(`${satirlar.length} ürünün maliyeti kaydedildi.`);
  };

  const adetKaydet = async () => {
    const satirlar = Object.entries(adet)
      .filter(([, v]) => v !== "" && isFinite(Number(v)) && Number(v) >= 0)
      .map(([id, v]) => ({ tarih, urun_id: id, adet: Math.round(Number(v)) }));
    if (!satirlar.length) { setBilgi("Adet girilmedi."); return; }
    setBusy(true); setBilgi("");
    const { error } = await doner.from("doner_satislar").upsert(satirlar, { onConflict: "tarih,urun_id" });
    setBusy(false);
    if (error) { alert("Kaydedilemedi: " + hataMetni(error)); return; }
    const toplam = satirlar.reduce((t, s) => t + s.adet, 0);
    setBilgi(`${kisaTarih(tarih)}: ${fmtN(toplam)} adet kaydedildi.`);
  };

  return (
    <div>
      <Baslik baslik="Ürünler" alt="Maliyet ve günlük satış adedi" />
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        <button onClick={() => { setSekme("maliyet"); setBilgi(""); }} style={S.cip(sekme === "maliyet")}>Maliyet</button>
        <button onClick={() => { setSekme("adet"); setBilgi(""); }} style={S.cip(sekme === "adet")}>Günlük adet</button>
      </div>
      <Hata metin={hata} />
      {urunler === null && <Yukleniyor />}
      {urunler && urunler.length === 0 && <div style={{ ...S.kart, color: C.muted, fontSize: 13 }}>Menüde ürün yok. Ürünler mutfak uygulamasında tanımlanır.</div>}

      {sekme === "adet" && urunler && urunler.length > 0 && (
        <div style={{ ...S.kart, marginBottom: 10 }}>
          <Alan etiket="GÜN">
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              <button onClick={() => setTarih(bugun)} style={S.cip(tarih === bugun)}>Bugün</button>
              <button onClick={() => setTarih(gunEkle(bugun, -1))} style={S.cip(tarih === gunEkle(bugun, -1))}>Dün</button>
              <input type="date" value={tarih} max={bugun} onChange={e => e.target.value && setTarih(e.target.value)} style={{ ...S.alan, width: "auto" }} />
            </div>
          </Alan>
          <div style={{ fontSize: 12, color: C.faint }}>Yalnız tezgahtan satılanları yaz. QR ve kafe satışları kendiliğinden sayılır.</div>
        </div>
      )}

      {urunler && bolumler.map(([bolum, liste]) => (
        <div key={bolum} style={{ ...S.kart, padding: 0, overflow: "hidden", marginBottom: 10 }}>
          <div style={{ padding: "10px 14px", fontSize: 12, fontWeight: 800, letterSpacing: 0.5, textTransform: "uppercase", color: C.muted }}>{bolum}</div>
          {liste.map(u => {
            const m = Number(maliyet[u.id]);
            const kar = isFinite(m) && maliyet[u.id] !== "" && Number(u.price) > 0 ? Math.round(100 * (Number(u.price) - m) / Number(u.price)) : null;
            return (
              <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", borderTop: `1px solid ${C.line}`, opacity: u.available === false ? 0.55 : 1 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{adi(u)}{u.available === false ? " · kapalı" : ""}</div>
                  <div style={{ fontSize: 12, color: C.faint, marginTop: 2 }}>
                    {fmtTL(u.price)}{sekme === "maliyet" && kar != null && <> · kâr <b style={{ color: kar < 30 ? C.down : C.ink }}>%{kar}</b></>}
                  </div>
                </div>
                {sekme === "maliyet" ? (
                  <SayiGirisi kip="para" min={0} value={maliyet[u.id] ?? ""} onChange={v => setMaliyet(x => ({ ...x, [u.id]: v }))} placeholder="maliyet" style={{ ...S.alan, width: 110, textAlign: "right" }} />
                ) : (
                  <SayiGirisi kip="tam" min={0} value={adet[u.id] ?? ""} onChange={v => setAdet(x => ({ ...x, [u.id]: v }))} placeholder="adet" style={{ ...S.alan, width: 90, textAlign: "right" }} />
                )}
              </div>
            );
          })}
        </div>
      ))}

      {urunler && urunler.length > 0 && (
        <div style={{ position: "sticky", bottom: 80, display: "flex", flexDirection: "column", gap: 8 }}>
          <button onClick={sekme === "maliyet" ? maliyetKaydet : adetKaydet} disabled={busy} style={{ ...S.dugme(true), width: "100%", opacity: busy ? 0.6 : 1, boxShadow: "0 6px 20px rgba(0,0,0,0.5)" }}>
            {busy ? "Kaydediliyor…" : sekme === "maliyet" ? "MALİYETLERİ KAYDET" : `${kisaTarih(tarih).toLocaleUpperCase("tr-TR")} ADETLERİNİ KAYDET`}
          </button>
          {bilgi && <div style={{ ...S.kart, fontSize: 13, textAlign: "center" }}>{bilgi}</div>}
        </div>
      )}
    </div>
  );
}
