import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { doner } from "./supabase.js";
import { C, cv, hv, S, fmtTL, fmtN, bugunIso, gunEkle, tarihObj, kisaTarih, uzunTarih, gunAdi, DONEMLER, Baslik, Hata, Yukleniyor, hataMetni } from "./ortak.jsx";

// OZET — gun / hafta / ay. Rakamlar doner_ozet RPC'sinden (sunucu kurali tek):
// gelir = tezgah (gun sonu) + QR siparisleri + kafede satilan doner (konsinye,
// hakedis kurali); gider kategori ve odeyene gore; urun maliyeti girilen
// satis adedine gore; acik borc.
export default function Ozet() {
  const bugun = bugunIso();
  const [donem, setDonem] = useState("ay");
  const [ozelBas, setOzelBas] = useState(gunEkle(bugun, -6));
  const [ozelBit, setOzelBit] = useState(bugun);
  const [aralik, setAralik] = useState(() => [bugun.slice(0, 7) + "-01", bugun]);
  const [veri, setVeri] = useState(null);
  const [hata, setHata] = useState(null);
  const [ortaklar, setOrtaklar] = useState(null);
  const navigate = useNavigate();
  const odeyenAc = (ad) => navigate("/giderler?odeyen=" + encodeURIComponent(ad));
  useEffect(() => { doner.rpc("doner_ortaklar").then(({ data }) => setOrtaklar(Array.isArray(data) ? data : [])); }, []);

  const donemSec = (k) => {
    setDonem(k);
    const d = DONEMLER.find(x => x.key === k);
    if (d?.aralik) setAralik(d.aralik(bugun));
  };
  const ozelGetir = () => {
    if (!ozelBas || !ozelBit) return;
    setAralik(ozelBas <= ozelBit ? [ozelBas, ozelBit] : [ozelBit, ozelBas]);
  };

  useEffect(() => {
    let iptal = false;
    setVeri(null); setHata(null);
    doner.rpc("doner_ozet", { p_bas: aralik[0], p_bit: aralik[1] }).then(({ data, error }) => {
      if (iptal) return;
      if (error) { setHata(hataMetni(error)); setVeri({}); return; }
      setVeri(data || {});
    });
    return () => { iptal = true; };
  }, [aralik[0], aralik[1]]);

  const h = useMemo(() => {
    if (!veri || !veri.tezgah) return null;
    const tezgah = Number(veri.tezgah.nakit) + Number(veri.tezgah.kart);
    const qr = Number(veri.qr?.tutar || 0);
    const kafe = Number(veri.kafe?.tutar || 0);
    const gelir = tezgah + qr + kafe;
    const gider = Number(veri.gider?.tutar || 0);
    return { tezgah, qr, kafe, gelir, gider, net: gelir - gider,
             kategori: Object.entries(veri.gider?.kategori || {}).sort((a, b) => b[1] - a[1]),
             odeyen: Object.entries(veri.gider?.odeyen || {}).sort((a, b) => b[1] - a[1]),
             maliyet: veri.maliyet || {}, borc: veri.borc || {}, gunler: veri.gunler || [] };
  }, [veri]);
  const maxGun = h ? Math.max(...h.gunler.map(g => Number(g.tezgah) + Number(g.qr) + Number(g.kafe)), 1) : 1;
  const gunSayisi = Math.round((tarihObj(aralik[1]) - tarihObj(aralik[0])) / 86400000) + 1;

  const Satir = ({ ad, tutar, kalin }) => (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: kalin ? 15 : 13.5, lineHeight: 2, fontWeight: kalin ? 800 : 500 }}>
      <span style={{ color: kalin ? C.ink : C.muted }}>{ad}</span>
      <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtTL(tutar)}</span>
    </div>
  );

  return (
    <div>
      <Baslik baslik="Özet" alt={aralik[0] === aralik[1] ? uzunTarih(aralik[0]) : `${kisaTarih(aralik[0])} – ${uzunTarih(aralik[1])} · ${gunSayisi} gün`} />
      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4 }}>
        {DONEMLER.map(d => <button key={d.key} onClick={() => donemSec(d.key)} style={{ ...S.cip(donem === d.key), flexShrink: 0 }}>{d.label}</button>)}
      </div>
      {donem === "tarih" && (
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginTop: 10 }}>
          <input type="date" value={ozelBas} max={bugun} onChange={e => setOzelBas(e.target.value)} style={{ ...S.alan, width: "auto" }} />
          <span style={{ color: C.faint }}>–</span>
          <input type="date" value={ozelBit} max={bugun} onChange={e => setOzelBit(e.target.value)} style={{ ...S.alan, width: "auto" }} />
          <button onClick={ozelGetir} style={S.cip(true)}>Getir</button>
        </div>
      )}

      <div style={{ marginTop: 14 }}><Hata metin={hata} /></div>
      {!h && !hata && <Yukleniyor />}
      {h && (
        <>
          <div style={{ ...S.kart, marginTop: 14 }}>
            <div style={S.etiket}>NET</div>
            <div style={{ fontSize: 44, fontWeight: 900, fontFamily: hv, lineHeight: 1.1, color: h.net < 0 ? C.down : C.ink }}>{fmtTL(h.net)}</div>
            <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>{fmtTL(h.gelir)} gelir − {fmtTL(h.gider)} gider</div>
            {h.gunler.length > 1 && (
              <div style={{ marginTop: 14 }}>
                <div style={{ display: "flex", alignItems: "flex-end", gap: h.gunler.length > 31 ? 1 : 3, height: 70 }}>
                  {h.gunler.map(g => {
                    const t = Number(g.tezgah) + Number(g.qr) + Number(g.kafe);
                    const hs = tarihObj(g.gun).getUTCDay() === 0 || tarihObj(g.gun).getUTCDay() === 6;
                    return (
                      <div key={g.gun} title={`${gunAdi(g.gun)} ${kisaTarih(g.gun)} — gelir ${fmtTL(t)} · gider ${fmtTL(g.gider)}`}
                           style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "flex-end", height: "100%" }}>
                        <div style={{ background: t > 0 ? (hs ? "#5a5650" : "#3a3a36") : "#222", height: `${t > 0 ? Math.max((t / maxGun) * 100, 4) : 3}%`, borderRadius: "2px 2px 0 0" }} />
                      </div>
                    );
                  })}
                </div>
                <div style={{ fontSize: 11, color: C.faint, marginTop: 4 }}>günlük gelir · koyu çubuk hafta sonu</div>
              </div>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10, marginTop: 10 }}>
            <div style={S.kart}>
              <div style={{ ...S.etiket, marginBottom: 6 }}>GELİR · {fmtTL(h.gelir)}</div>
              <Satir ad={`Tezgah nakit${veri.tezgah.gun ? ` · ${fmtN(veri.tezgah.gun)} gün` : ""}`} tutar={veri.tezgah.nakit} />
              <Satir ad="Tezgah kart" tutar={veri.tezgah.kart} />
              <Satir ad={`QR siparişi · ${fmtN(veri.qr?.adet)} sipariş`} tutar={h.qr} />
              <Satir ad={`Kafeden satış · ${fmtN(veri.kafe?.adet)} adet`} tutar={h.kafe} />
              {h.tezgah === 0 && <div style={{ fontSize: 12, color: C.faint, marginTop: 6 }}>Tezgah satışı girilmemiş: "Gün sonu" sekmesi.</div>}
            </div>
            <div style={S.kart}>
              <div style={{ ...S.etiket, marginBottom: 6 }}>GİDER · {fmtTL(h.gider)} · {fmtN(veri.gider?.adet)} kayıt</div>
              {h.kategori.length === 0 && <div style={{ fontSize: 13, color: C.faint }}>Bu dönemde gider yok.</div>}
              {h.kategori.map(([ad, t]) => <Satir key={ad} ad={ad} tutar={t} />)}
            </div>
            <div style={S.kart}>
              <div style={{ ...S.etiket, marginBottom: 6 }}>KİM ÖDEDİ</div>
              {h.odeyen.length === 0 && <div style={{ fontSize: 13, color: C.faint }}>—</div>}
              {h.odeyen.map(([ad, t]) => (
                <button key={ad} onClick={() => odeyenAc(ad)} style={{ width: "100%", display: "flex", justifyContent: "space-between", gap: 10, background: "none", border: "none", padding: 0, color: C.ink, fontFamily: "inherit", fontSize: 13.5, lineHeight: 2, cursor: "pointer", textAlign: "left" }}>
                  <span style={{ color: C.muted }}>{ad === "kasa" ? "Döner kasası" : ad} ›</span>
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtTL(t)}</span>
                </button>
              ))}
              <div style={{ fontSize: 12, color: C.faint, marginTop: 6 }}>Bu dönem. Ada dokununca o kişinin ödemeleri listelenir.</div>
            </div>
            <div style={S.kart}>
              <div style={{ ...S.etiket, marginBottom: 6 }}>ORTAK ÖDEMELERİ · TÜM ZAMANLAR</div>
              {ortaklar === null && <div style={{ fontSize: 13, color: C.faint }}>…</div>}
              {ortaklar && ortaklar.length === 0 && <div style={{ fontSize: 13, color: C.faint }}>Henüz gider girilmedi.</div>}
              {(ortaklar || []).map(o => (
                <button key={o.ad} onClick={() => odeyenAc(o.ad)} style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, background: "none", border: "none", padding: "5px 0", borderTop: `1px solid ${C.line}`, color: C.ink, fontFamily: "inherit", cursor: "pointer", textAlign: "left" }}>
                  <span style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: o.ad === "kasa" ? C.muted : C.ink }}>{o.ad === "kasa" ? "Döner kasası" : o.ad} ›</div>
                    <div style={{ fontSize: 11.5, color: C.faint }}>bu ay {fmtTL(o.bu_ay)} · geçen ay {fmtTL(o.gecen_ay)} · {fmtN(o.adet)} kayıt{o.son_tarih ? ` · son ${kisaTarih(o.son_tarih)}` : ""}</div>
                  </span>
                  <span style={{ fontSize: 15, fontWeight: 800, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{fmtTL(o.tum)}</span>
                </button>
              ))}
              <div style={{ fontSize: 12, color: C.faint, marginTop: 6 }}>Ortakların cebinden ödenenler; aranızda hesaplaşma için. Kasa: dönerin kendi parasından.</div>
            </div>
            <div style={S.kart}>
              <div style={{ ...S.etiket, marginBottom: 6 }}>ÜRÜN MALİYETİ</div>
              <Satir ad={`${fmtN(h.maliyet.adet)} adet satış girildi`} tutar={h.maliyet.tutar} />
              {Number(h.maliyet.maliyetsiz_adet) > 0 && <div style={{ fontSize: 12, color: C.down, marginTop: 4 }}>{fmtN(h.maliyet.maliyetsiz_adet)} adedin maliyeti girilmemiş.</div>}
              <div style={{ fontSize: 12, color: C.faint, marginTop: 6 }}>"Ürünler" sekmesinde maliyet ve günlük adet girilir. Nete dahil değil; malzeme alışı giderde.</div>
            </div>
            <div style={S.kart}>
              <div style={{ ...S.etiket, marginBottom: 6 }}>AÇIK BORÇ</div>
              <div style={{ fontSize: 26, fontWeight: 900, fontFamily: hv }}>{fmtTL(h.borc.acik)}</div>
              <div style={{ fontSize: 12, color: C.muted }}>{fmtN(h.borc.kisi)} kişi · tüm zamanlar</div>
            </div>
          </div>
        </>
      )}
      <div style={{ fontSize: 12, color: C.faint, marginTop: 14, lineHeight: 1.7, fontFamily: cv }}>
        Kafeden satış: Not in Paris'te satılan döner ürünleri; ay sonu kafe bu tutarı dönere öder (ikramda liste fiyatı). QR: dönerin kendi menüsünden gelen siparişler.
      </div>
    </div>
  );
}
