import { useEffect, useMemo, useState } from "react";
import Ikon from "./Ikon.jsx";
import {
  ayEtiketi, ayKaydir, ayGunSayisi, donemMetni, guncelAy, bugunIstanbul, gunEtiketi, gunKisa,
  fmtTL, fmtSayi, saatMetni, anomaliler, hakedisMetni, waUrl, panoyaKopyala,
} from "../lib/hakedis.js";

// Hakedis raporunun tek sunum bileseni. Veri cekmez, oturum bilmez; NIP'in
// /settlement sayfasi, mutfagin /mutfak-rapor sayfasi ve Gun Ozeti'nin Doner
// sekmesi ayni bileseni ayni JSON ile cizer. Iki taraf ayni ekrani gorunce
// "bende baska yaziyor" tartismasi kalmaz.
//
// props:
//   rapor        nip_mutfak_hakedis_raporu ciktisi (null olabilir)
//   ay           'YYYY-MM'      onAy(ay)  ay degisince
//   yukleniyor   bool           hata      null | { tip, mesaj }   onYenile()
//   taraf        'nip' | 'mutfak'  — yalniz etiketler degisir
//   guncelleme   Date|null  son basarili cekim;  cevrimdisi  bool (onbellekten)
//   kompakt      Gun Ozeti icin: fis listesi ve kural seridi gizli
//   aksiyonlar   hero altina konacak dugme satiri (PaylasSatiri gibi)

export const C = { card: "#161616", cardLine: "#262626", ink: "#F0EDE8", muted: "#8A8A86", faint: "#5A5A56", accent: "#FFFFFF", up: "#8A8580", down: "#C87A6A" };
export const cv = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";
export const hv = "'Bebas Neue','Barlow Condensed',sans-serif";
export const kart = { background: C.card, border: `1px solid ${C.cardLine}`, borderRadius: 12, padding: 16 };
export const etiket = { fontSize: 11, color: C.muted, letterSpacing: 1.2, textTransform: "uppercase", fontWeight: 600 };

const GERI_SINIR_AY = 12;   // mutabakat gecmisi: bir yil yeter, daha eskisi RPC'de zaten var
const SAYFA = 40;           // fis listesi parca boyu (uzun ayda 300+ satir telefonu yormasin)

const dugme = (dolu) => ({
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 48, padding: "0 18px",
  borderRadius: 10, cursor: "pointer", fontWeight: 700, fontSize: 15, fontFamily: cv, textDecoration: "none",
  background: dolu ? C.accent : "transparent", color: dolu ? "#000" : C.ink,
  border: `1px solid ${dolu ? C.accent : C.cardLine}`, flex: "1 1 150px",
});
const okDugme = (pasif) => ({
  width: 44, height: 44, borderRadius: 10, border: `1px solid ${C.cardLine}`, background: "transparent",
  color: pasif ? C.faint : C.ink, cursor: pasif ? "default" : "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center",
});
const rozet = { display: "inline-block", marginLeft: 6, padding: "1px 6px", borderRadius: 999, fontSize: 10, fontWeight: 700, letterSpacing: 0.6, background: "rgba(255,255,255,0.10)", color: C.ink };

// WhatsApp'a gonder + metni kopyala. Iki sayfada da ayni.
export function PaylasSatiri({ rapor }) {
  const [durum, setDurum] = useState("");   // '' | 'kopyalandi' | 'olmadi'
  const metin = useMemo(() => hakedisMetni(rapor), [rapor]);
  useEffect(() => {
    if (!durum) return undefined;
    const t = setTimeout(() => setDurum(""), 2000);
    return () => clearTimeout(t);
  }, [durum]);
  if (!rapor) return null;
  const kopyala = async () => {
    const ok = await panoyaKopyala(hakedisMetni(rapor));
    setDurum(ok ? "kopyalandi" : "olmadi");
  };
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
      {/* Numarasiz wa.me: WhatsApp kisiyi sectirir. WhatsApp yoksa bos sekme acilir; kopyala yaninda durur. */}
      <a href={waUrl(metin)} target="_blank" rel="noreferrer" style={dugme(true)}>
        <Ikon ad="disari" boy={16} /> WhatsApp'a gönder
      </a>
      <button type="button" onClick={kopyala} style={dugme(false)}>
        <Ikon ad="kopyala" boy={16} />
        {durum === "kopyalandi" ? "Kopyalandı" : durum === "olmadi" ? "Kopyalanamadı" : "Metni kopyala"}
      </button>
    </div>
  );
}

export default function HakedisOzeti({
  rapor, ay, onAy, yukleniyor = false, hata = null, onYenile,
  taraf = "nip", guncelleme = null, cevrimdisi = false, kompakt = false, aksiyonlar = null,
}) {
  const buAy = guncelAy();
  const bugun = bugunIstanbul();
  const guncel = ay === buAy;
  const [secilenGun, setSecilenGun] = useState(null);   // 'YYYY-MM-DD' — fis listesini suzer
  const [listeAcik, setListeAcik] = useState(false);
  const [gosterilen, setGosterilen] = useState(SAYFA);
  useEffect(() => { setSecilenGun(null); setListeAcik(false); setGosterilen(SAYFA); }, [ay]);

  const geriOlur = ay > ayKaydir(buAy, -GERI_SINIR_AY);
  const ileriOlur = ay < buAy;
  const od = rapor?.odenecek || {};
  const cipler = useMemo(() => anomaliler(rapor, { guncel }), [rapor, guncel]);

  // Gun cubuklari: ayin tum gunleri (satissiz gun bos cubuk). RPC gunleri
  // Istanbul tarihiyle gruplar, ay sinirini ise 03:00'te keser: ayin 1'i
  // 00:00-03:00 fisleri onceki ayin raporunda "1" olarak gorunur — sona eklenir.
  const gunler = useMemo(() => {
    if (!rapor) return [];
    const harita = Object.fromEntries((rapor.gunler || []).map(g => [g.gun, g]));
    const n = ayGunSayisi(ay);
    const liste = Array.from({ length: n }, (_, i) => {
      const gun = `${ay}-${String(i + 1).padStart(2, "0")}`;
      return { gun, adet: Number(harita[gun]?.adet || 0), tutar: Number(harita[gun]?.tutar || 0), gelecek: guncel && gun > bugun };
    });
    (rapor.gunler || []).filter(g => !g.gun.startsWith(ay)).forEach(g => liste.push({ gun: g.gun, adet: Number(g.adet), tutar: Number(g.tutar), gelecek: false, disari: true }));
    return liste;
  }, [rapor, ay, guncel, bugun]);
  const maxGun = Math.max(...gunler.map(g => g.tutar), 1);
  const bugunSatis = guncel ? (rapor?.gunler || []).find(g => g.gun === bugun) : null;

  const siparisler = rapor?.siparisler || [];
  const suzulen = secilenGun ? siparisler.filter(s => String(s.zaman || "").slice(0, 5) === gunKisa(secilenGun)) : siparisler;
  const secilenToplam = secilenGun ? suzulen.reduce((t, s) => t + Number(s.tutar || 0), 0) : 0;
  const urunler = rapor?.urunler || [];
  const maxUrun = Math.max(...urunler.map(u => Number(u.tutar || 0)), 1);
  const bos = rapor && Number(od.siparis || 0) === 0 && Number(rapor.acik_siparis || 0) === 0;

  const gunSec = (g) => {
    if (g.gelecek || (g.adet === 0 && !g.disari)) return;
    const yeni = secilenGun === g.gun ? null : g.gun;
    setSecilenGun(yeni);
    setGosterilen(SAYFA);
    if (yeni) setListeAcik(true);
  };

  return (
    <div style={{ fontFamily: cv, color: C.ink }}>
      {/* Ay seridi */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <button type="button" aria-label="Önceki ay" disabled={!geriOlur} onClick={() => geriOlur && onAy(ayKaydir(ay, -1))} style={okDugme(!geriOlur)}><Ikon ad="oksol" boy={18} /></button>
        <div style={{ textAlign: "center", minWidth: 0 }}>
          <div style={{ fontFamily: hv, fontSize: 28, letterSpacing: 1, lineHeight: 1 }}>{ayEtiketi(ay).toLocaleUpperCase("tr-TR")}</div>
          {guncel && <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>ay sürüyor</div>}
        </div>
        <button type="button" aria-label="Sonraki ay" disabled={!ileriOlur} onClick={() => ileriOlur && onAy(ayKaydir(ay, 1))} style={okDugme(!ileriOlur)}><Ikon ad="oksag" boy={18} /></button>
      </div>
      <div style={{ fontSize: 11, color: C.faint, textAlign: "center", marginTop: 6 }}>
        Dönem: {donemMetni(ay)} · fişin açıldığı ana göre
      </div>

      {cevrimdisi && guncelleme && (
        <div style={{ ...kart, marginTop: 12, padding: "10px 14px", fontSize: 12, color: C.up, borderColor: "#3a3630" }}>
          <Ikon ad="uyari" boy={13} style={{ marginRight: 6 }} />Çevrimdışı · son veri {saatMetni(guncelleme)}
          {onYenile && <button type="button" onClick={onYenile} style={{ marginLeft: 10, background: "none", border: `1px solid ${C.cardLine}`, color: C.ink, borderRadius: 6, padding: "3px 8px", cursor: "pointer", fontSize: 12 }}>Tekrar dene</button>}
        </div>
      )}

      {hata?.tip === "yetkisiz" && !rapor && (
        <div style={{ ...kart, marginTop: 14, textAlign: "center", padding: 28 }}>
          <Ikon ad="kilit" boy={34} style={{ color: C.muted, display: "block", margin: "0 auto 10px" }} />
          <div style={{ fontSize: 15, marginBottom: 6 }}>{hata.mesaj}</div>
          <div style={{ fontSize: 12, color: C.muted }}>
            {taraf === "mutfak" ? "Pano hesabınızla girin; yine olmazsa Not in Paris'e söyleyin." : "Rapor sahibe, yöneticilere ve gözlemciye açık."}
          </div>
        </div>
      )}

      {hata && hata.tip !== "yetkisiz" && !rapor && (
        <div style={{ ...kart, marginTop: 14, textAlign: "center", padding: 28 }}>
          <Ikon ad="uyari" boy={30} style={{ color: C.down, display: "block", margin: "0 auto 10px" }} />
          <div style={{ fontSize: 14, color: C.ink, marginBottom: 12 }}>{hata.mesaj}</div>
          {onYenile && <button type="button" onClick={onYenile} style={{ ...dugme(false), flex: "0 0 auto", minHeight: 42 }}>Tekrar dene</button>}
        </div>
      )}

      {!rapor && !hata && yukleniyor && (
        <div style={{ padding: 60, textAlign: "center", color: C.muted }}>Yükleniyor…</div>
      )}

      {rapor && (
        <div style={{ opacity: yukleniyor ? 0.55 : 1, transition: "opacity 160ms" }}>
          {/* Kahraman: yalniz ODENMIS fisler. Acik tutar asla buna eklenmez. */}
          <div style={{ ...kart, marginTop: 14, padding: "22px 20px" }}>
            <div style={etiket}>{taraf === "mutfak" ? "Not in Paris'ten alacak" : "Mutfağa ödenecek"}</div>
            <div style={{ fontSize: "clamp(40px, 12vw, 58px)", fontWeight: 900, fontFamily: hv, lineHeight: 1, marginTop: 6 }}>{fmtTL(od.tutar)}</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 8 }}>
              {fmtSayi(od.siparis)} sipariş · {fmtSayi(od.kalem)} kalem · yalnız ödenmiş fişler
            </div>
            {guncel && (
              <div style={{ fontSize: 13, color: C.ink, marginTop: 10, display: "flex", flexWrap: "wrap", gap: "4px 12px" }}>
                <span>Bugün <b>{fmtSayi(bugunSatis?.adet || 0)} adet · {fmtTL(bugunSatis?.tutar || 0)}</b></span>
                {guncelleme && <span style={{ color: C.faint }}>{saatMetni(guncelleme)}</span>}
              </div>
            )}
            {Number(rapor.acik_siparis || 0) > 0 && (
              <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>
                + {fmtTL(rapor.acik_tutar)} açık ({fmtSayi(rapor.acik_siparis)} sipariş) — kapanınca eklenir
              </div>
            )}
            {aksiyonlar}
          </div>

          {cipler.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
              {cipler.map(c => (
                <span key={c.tip} style={{
                  fontSize: 12, padding: "5px 10px", borderRadius: 999,
                  border: `1px solid ${c.seviye === "uyari" ? "#5a4a46" : C.cardLine}`,
                  background: c.seviye === "uyari" ? "rgba(200,122,106,0.10)" : "transparent",
                  color: c.seviye === "uyari" ? C.down : C.muted,
                }}>{c.metin}</span>
              ))}
            </div>
          )}

          {bos ? (
            <div style={{ ...kart, marginTop: 10, textAlign: "center", padding: 30, color: C.muted }}>
              <Ikon ad="parlak" boy={40} kalin={1.3} style={{ display: "block", margin: "0 auto 10px" }} />
              <div style={{ fontSize: 15, color: C.ink }}>{ayEtiketi(ay)}'da NIP'te mutfak ürünü satışı yok</div>
              <div style={{ fontSize: 12, marginTop: 6 }}>Döner mutfağından gelen bir ürün satılınca burada birikir.</div>
            </div>
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: kompakt ? "1fr" : "repeat(auto-fit, minmax(280px, 1fr))", gap: 10, marginTop: 10 }}>
                {/* Urunler: mutfagin kendi adlariyla, tutara gore */}
                <div style={kart}>
                  <div style={{ ...etiket, marginBottom: 10 }}>Ürünler</div>
                  {urunler.map(u => (
                    <div key={u.ad} style={{ position: "relative", padding: "8px 10px", marginBottom: 4, borderRadius: 6, overflow: "hidden" }}>
                      <div style={{ position: "absolute", inset: 0, width: `${(Number(u.tutar || 0) / maxUrun) * 100}%`, background: "rgba(255,255,255,0.10)", borderRadius: 6 }} />
                      <div style={{ position: "relative", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.ad}</span>
                        <span style={{ fontSize: 13, color: C.muted, whiteSpace: "nowrap" }}>× {fmtSayi(u.adet)} · <b style={{ color: C.ink }}>{fmtTL(u.tutar)}</b></span>
                      </div>
                    </div>
                  ))}
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 10px 0", borderTop: `1px solid ${C.cardLine}`, marginTop: 4, fontSize: 13 }}>
                    <span style={{ color: C.muted }}>Toplam</span><b>{fmtTL(od.tutar)}</b>
                  </div>
                </div>

                {!kompakt && (
                  <div style={kart}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12, gap: 8, flexWrap: "wrap" }}>
                      <div style={etiket}>Günler</div>
                      {secilenGun ? (
                        <div style={{ fontSize: 12, color: C.muted }}>
                          <b style={{ color: C.ink }}>{gunEtiketi(secilenGun)}</b> · {suzulen.length} fiş · {fmtTL(secilenToplam)}
                          <button type="button" onClick={() => setSecilenGun(null)} style={{ marginLeft: 8, background: "none", border: `1px solid ${C.cardLine}`, color: C.muted, borderRadius: 6, padding: "2px 8px", cursor: "pointer", fontSize: 11 }}>tümü</button>
                        </div>
                      ) : (
                        <div style={{ fontSize: 11, color: C.faint }}>güne dokun → fişler</div>
                      )}
                    </div>
                    <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 110 }}>
                      {gunler.map((g, i) => {
                        const secili = secilenGun === g.gun;
                        const bugunMu = g.gun === bugun;
                        const gunNo = Number(g.gun.slice(8, 10));
                        return (
                          <div key={g.gun} onClick={() => gunSec(g)} title={`${gunEtiketi(g.gun)} — ${fmtSayi(g.adet)} adet · ${fmtTL(g.tutar)}`}
                            style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", height: "100%", cursor: g.adet > 0 ? "pointer" : "default", minWidth: 0 }}>
                            <div style={{
                              background: secili ? C.accent : g.tutar > 0 ? (bugunMu ? "#B5B0AA" : "#3a3a36") : g.gelecek ? "transparent" : "#222",
                              height: `${g.tutar > 0 ? Math.max((g.tutar / maxGun) * 100, 4) : g.gelecek ? 0 : 3}%`,
                              borderRadius: "2px 2px 0 0",
                            }} />
                            <div style={{ fontSize: 9, marginTop: 4, textAlign: "center", color: secili || bugunMu ? C.accent : (gunNo === 1 || gunNo % 5 === 0) && !g.disari ? C.muted : "transparent", whiteSpace: "nowrap" }}>
                              {g.disari ? "+" + gunNo : gunNo}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {!kompakt && (
                <div style={{ ...kart, marginTop: 10 }}>
                  <button type="button" onClick={() => setListeAcik(v => !v)} style={{ width: "100%", background: "none", border: "none", color: C.ink, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", padding: 0, fontFamily: cv }}>
                    <span style={etiket}>{secilenGun ? `${gunEtiketi(secilenGun)} fişleri` : "Sipariş listesi"} · {suzulen.length}</span>
                    <span style={{ fontSize: 12, color: C.muted, display: "inline-flex", alignItems: "center", gap: 4 }}>
                      {listeAcik ? "gizle" : "göster"} <Ikon ad={listeAcik ? "yukari" : "asagi"} boy={12} />
                    </span>
                  </button>
                  {listeAcik && (
                    <div style={{ marginTop: 8 }}>
                      {suzulen.length === 0 && <div style={{ fontSize: 13, color: C.faint, padding: "10px 0" }}>Bu günde ödenmiş fiş yok</div>}
                      {suzulen.slice(0, gosterilen).map(s => (
                        <div key={s.siparis} style={{ padding: "9px 0", borderTop: `1px solid ${C.cardLine}` }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 13 }}>
                            <span style={{ color: C.muted, minWidth: 0 }}>
                              {s.zaman} · <span style={{ color: C.ink }}>{s.masa || "Paket"}</span>
                              {s.ikram && <span style={rozet}>İKRAM</span>}
                            </span>
                            <b style={{ whiteSpace: "nowrap" }}>{fmtTL(s.tutar)}</b>
                          </div>
                          <div style={{ fontSize: 12, color: C.muted, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.kalemler}</div>
                        </div>
                      ))}
                      {suzulen.length > gosterilen && (
                        <button type="button" onClick={() => setGosterilen(n => n + SAYFA)} style={{ ...dugme(false), width: "100%", minHeight: 42, marginTop: 8 }}>
                          {suzulen.length - gosterilen} fiş daha
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* Pano: koprunun izi. Iptal kalem sayisi (adet degil, satir). */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8, marginTop: 10 }}>
            {[
              ["Panoya düşen kart", fmtSayi(rapor.kartlar?.acilan || 0)],
              ["Ort. hazırlık", rapor.kartlar?.ort_hazirlik_dk != null ? `${fmtSayi(rapor.kartlar.ort_hazirlik_dk)} dk` : "—"],
              ["İptal kalem", fmtSayi(rapor.iptal_kalem || 0)],
            ].map(([l, v]) => (
              <div key={l} style={{ ...kart, padding: 12 }}>
                <div style={etiket}>{l}</div>
                <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4 }}>{v}</div>
              </div>
            ))}
          </div>

          {!kompakt && (
            <div style={{ fontSize: 11, color: C.faint, lineHeight: 1.6, marginTop: 12, padding: "0 4px" }}>
              Ödenmiş fişler sayılır; açık ve veresiye fişler ödendiği ayda girer. İkram ürün liste fiyatından ödenir. İndirimli ürün indirimli fiyattan sayılır.
              {guncelleme && <> · Kaynak: nip_mutfak_hakedis_raporu · {saatMetni(guncelleme)}</>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
