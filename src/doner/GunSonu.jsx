import { useEffect, useState } from "react";
import { doner } from "./supabase.js";
import SayiGirisi from "../components/SayiGirisi.jsx";
import { C, S, fmtTL, fmtN, bugunIso, gunEkle, kisaTarih, gunAdi, Baslik, Hata, Yukleniyor, Alan, hataMetni } from "./ortak.jsx";

// GUN SONU — tezgah satisi: gun basina nakit + kart. Gunde bir satir; ayni
// gune ikinci giris ustune yazar (doner_gunsonu.tarih tekil). QR ve kafe
// satisi kendiliginden gelir, burada yazilmaz; bilgi icin gosterilir.
export default function GunSonu() {
  const bugun = bugunIso();
  const [tarih, setTarih] = useState(bugun);
  const [nakit, setNakit] = useState("");
  const [kart, setKart] = useState("");
  const [notu, setNotu] = useState("");
  const [otomatik, setOtomatik] = useState(null);   // {qr, kafe} o gun icin
  const [liste, setListe] = useState(null);
  const [hata, setHata] = useState(null);
  const [busy, setBusy] = useState(false);
  const [bilgi, setBilgi] = useState("");

  const listeYukle = async () => {
    const { data, error } = await doner.from("doner_gunsonu").select("*").gte("tarih", gunEkle(bugun, -30)).order("tarih", { ascending: false });
    if (error) { setHata(hataMetni(error)); setListe([]); return; }
    setListe(data || []);
  };
  useEffect(() => { listeYukle(); }, []);

  // Secilen gunun kaydi forma gelir; QR ve kafe satisi ozetten okunur.
  useEffect(() => {
    let iptal = false;
    setOtomatik(null);
    doner.from("doner_gunsonu").select("*").eq("tarih", tarih).maybeSingle().then(({ data }) => {
      if (iptal) return;
      setNakit(data ? String(data.nakit) : ""); setKart(data ? String(data.kart) : ""); setNotu(data?.notu || "");
    });
    doner.rpc("doner_ozet", { p_bas: tarih, p_bit: tarih }).then(({ data }) => {
      if (iptal) return;
      setOtomatik({ qr: Number(data?.qr?.tutar || 0), qrAdet: Number(data?.qr?.adet || 0), kafe: Number(data?.kafe?.tutar || 0), kafeAdet: Number(data?.kafe?.adet || 0) });
    });
    return () => { iptal = true; };
  }, [tarih]);

  const kaydet = async () => {
    const n = Number(nakit) || 0, k = Number(kart) || 0;
    if (n < 0 || k < 0) return;
    setBusy(true); setBilgi("");
    const { error } = await doner.from("doner_gunsonu")
      .upsert({ tarih, nakit: n, kart: k, notu: notu.trim() || null, guncellendi: new Date().toISOString() }, { onConflict: "tarih" });
    setBusy(false);
    if (error) { alert("Kaydedilemedi: " + hataMetni(error)); return; }
    setBilgi(`${kisaTarih(tarih)} kaydedildi: ${fmtTL(n + k)}`);
    listeYukle();
  };

  return (
    <div>
      <Baslik baslik="Gün sonu" alt="Tezgah satışı: nakit ve kart" />
      <div style={S.kart}>
        <Alan etiket="GÜN">
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <button onClick={() => setTarih(bugun)} style={S.cip(tarih === bugun)}>Bugün</button>
            <button onClick={() => setTarih(gunEkle(bugun, -1))} style={S.cip(tarih === gunEkle(bugun, -1))}>Dün</button>
            <input type="date" value={tarih} max={bugun} onChange={e => e.target.value && setTarih(e.target.value)} style={{ ...S.alan, width: "auto" }} />
          </div>
        </Alan>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Alan etiket="NAKİT (₺)"><SayiGirisi kip="para" min={0} value={nakit} onChange={setNakit} placeholder="0" style={S.alan} /></Alan>
          <Alan etiket="KART (₺)"><SayiGirisi kip="para" min={0} value={kart} onChange={setKart} placeholder="0" style={S.alan} /></Alan>
        </div>
        <Alan etiket="NOT"><input value={notu} onChange={e => setNotu(e.target.value)} placeholder="İsteğe bağlı" style={S.alan} /></Alan>
        <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.7, marginBottom: 10 }}>
          Tezgah toplamı: <b style={{ color: C.ink }}>{fmtTL((Number(nakit) || 0) + (Number(kart) || 0))}</b>
          {otomatik && <> · QR {fmtTL(otomatik.qr)} ({fmtN(otomatik.qrAdet)}) · Kafeden {fmtTL(otomatik.kafe)} ({fmtN(otomatik.kafeAdet)} adet) — bunlar kendiliğinden eklenir</>}
        </div>
        <button onClick={kaydet} disabled={busy} style={{ ...S.dugme(true), width: "100%", opacity: busy ? 0.6 : 1 }}>{busy ? "Kaydediliyor…" : "KAYDET"}</button>
        {bilgi && <div style={{ fontSize: 13, color: C.ink, marginTop: 10, textAlign: "center" }}>{bilgi}</div>}
      </div>

      <Hata metin={hata} />
      <div style={{ ...S.etiket, margin: "16px 0 8px" }}>SON 30 GÜN</div>
      {liste === null && <Yukleniyor />}
      {liste && liste.length === 0 && <div style={{ ...S.kart, color: C.muted, fontSize: 13 }}>Henüz gün sonu girilmemiş.</div>}
      {liste && liste.length > 0 && (
        <div style={{ ...S.kart, padding: 0, overflow: "hidden" }}>
          {liste.map(g => (
            <button key={g.tarih} onClick={() => setTarih(g.tarih)}
                    style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", background: g.tarih === tarih ? "rgba(255,255,255,0.05)" : "none", border: "none", borderBottom: `1px solid ${C.line}`, color: C.ink, textAlign: "left", cursor: "pointer", fontFamily: "inherit" }}>
              <div style={{ width: 64, flexShrink: 0, fontSize: 12, fontWeight: 700, color: C.muted }}>{gunAdi(g.tarih)} {kisaTarih(g.tarih)}</div>
              <div style={{ flex: 1, fontSize: 13, color: C.muted }}>nakit {fmtTL(g.nakit)} · kart {fmtTL(g.kart)}{g.notu ? ` · ${g.notu}` : ""}</div>
              <div style={{ fontSize: 15, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{fmtTL(Number(g.nakit) + Number(g.kart))}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
