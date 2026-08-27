import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase.js";
import { useAuth } from "../../contexts/AuthContext.jsx";
import Ikon from "../../components/Ikon.jsx";
import { KUPURLER, BOZUKLAR, kupurToplam, fmtTL, NOT_ESIGI, farkRengi, TASLAK_KEY, denomsTemizle }
  from "../../lib/cashCount.js";

const cv = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";
const hv = "'Bebas Neue','Barlow Condensed','Coolvetica Condensed',sans-serif";

const C = {
  card: "#161616", line: "#2A2A2A", ink: "#F0EDE8", muted: "#8A8A86",
  faint: "#666666", accent: "#FFFFFF", down: "#C87A6A",
};

// Kasa Sayimi — kapanista cekmecedeki nakdi sayip "olmasi gereken" ile
// karsilastirir ve muhurler.
//
// Ekranin tek isi dogru sayiyi gostermek DEGIL, yanlis sayiyi gostermemek:
// beklenen tutar sunucudan gelmiyorsa fark HIC gosterilmez. Sifiri gercek
// sanmak, sayilan paranin tamamini "fazla" gostermek demektir.
export default function CashCountPage() {
  const { staffUser } = useAuth();
  const navigate = useNavigate();
  const storeIds = staffUser?.store_ids || [];

  const [stores, setStores] = useState([]);
  const [storeId, setStoreId] = useState(storeIds.length === 1 ? storeIds[0] : null);
  const [ozet, setOzet] = useState(null);        // null = henuz gelmedi
  const [ozetHata, setOzetHata] = useState(null);
  const [adetler, setAdetler] = useState({});
  const [bozukAcik, setBozukAcik] = useState(false);
  const [cekilen, setCekilen] = useState("");
  const [sayan, setSayan] = useState(staffUser?.name || "");
  const [not, setNot] = useState("");
  const [busy, setBusy] = useState(false);
  const [bitti, setBitti] = useState(null);
  // Kapanis vardiyasi: "sayan kisi" tek dokunusla bu listeden secilir.
  // Kural sahibin agzindan: dukkani kapatan vardiyada kim varsa o sayar.
  const [vardiya, setVardiya] = useState([]);
  // Iki sayim turu: 17:00 vardiya DEVRI (cekmece fotografi, gunde birden cok
  // olabilir) ve gece KAPANISI (gunde tek, acilis zincirini besler). Saatten
  // tahmin edilir, elle degistirilebilir: aksam 20'den sabah 7'ye kapanis —
  // 03:00'ten sonraki gec kapanista da sunucu "kasa gunu" ile dune yazar.
  const [tur, setTur] = useState(() => {
    const saat = new Date().getHours();
    return saat >= 20 || saat < 7 ? "kapanis" : "devir";
  });
  const kapanis = tur === "kapanis";

  useEffect(() => {
    if (!storeIds.length) return;
    supabase.from("stores").select("id,name,slug").in("id", storeIds).order("slug")
      .then(r => setStores(r.data || []));
  }, [staffUser?.id]);

  // Ozet SUNUCUDAN gelir. p_gun gonderilmez — isletme gununu cihaz saati degil
  // sunucu belirler (businessDay.js cihaz saatine bakiyor, sayim ona guvenemez).
  useEffect(() => {
    if (!storeId) return;
    let iptal = false;
    setOzet(null); setOzetHata(null);
    supabase.rpc("kasa_gun_ozeti", { p_store_id: storeId }).then(({ data, error }) => {
      if (iptal) return;
      if (error) { setOzetHata(error.message); return; }
      setOzet(Array.isArray(data) ? data[0] : data);
    });
    return () => { iptal = true; };
  }, [storeId]);

  useEffect(() => {
    if (!storeId) return;
    // iptal bayragi: magaza A→B gecisinde A'nin gec gelen cevabi B'nin
    // ekranina yazilmasin (inceleme bulgusu).
    let iptal = false;
    supabase.rpc("nip_kapanis_vardiyasi", { p_store_id: storeId })
      .then(({ data }) => { if (!iptal) setVardiya(data || []); });
    return () => { iptal = true; };
  }, [storeId]);

  // Taslak: her tusa basista yazilir. Gece yarisi ekran kapanirsa sayim
  // bastan girilmesin.
  const gun = ozet?.isletme_gunu || "";
  useEffect(() => {
    if (!storeId || !gun) return;
    try {
      const ham = localStorage.getItem(TASLAK_KEY(storeId, gun));
      if (ham) {
        const t = JSON.parse(ham);
        setAdetler(t.adetler || {});
        setCekilen(t.cekilen || "");
        setNot(t.not || "");
        if (t.sayan) setSayan(t.sayan);
      }
    } catch (e) { /* bozuk taslak sayimi engellemesin */ }
  }, [storeId, gun]);

  useEffect(() => {
    if (!storeId || !gun) return;
    try {
      localStorage.setItem(TASLAK_KEY(storeId, gun),
        JSON.stringify({ adetler, cekilen, not, sayan }));
    } catch (e) { /* kota dolu olabilir, sayimi engelleme */ }
  }, [adetler, cekilen, not, sayan, storeId, gun]);

  const sayilan = useMemo(() => kupurToplam(adetler), [adetler]);
  const beklenen = ozet ? Number(ozet.beklenen || 0) : null;
  const fark = beklenen === null ? null : sayilan - beklenen;
  const notGerekli = fark !== null && Math.abs(fark) > NOT_ESIGI;
  // KAPANIS SONRASI kurali — YALNIZ kapanis sayiminda: gunun acik hesabi
  // varsa servis bitmemis demektir; o hesabin nakdi henuz kayitlarda olmadigi
  // icin beklenen EKSIK hesaplanir. Devirde (17:00) acik hesap isin dogasi.
  // Sunucu da ayni kurali zorlar (fn_kasa_sayimi_doldur): gerekcesiz gecmez.
  const acikVar = kapanis && ozet ? Number(ozet.acik_bugun_adet || 0) > 0 : false;
  // Acik hesap varken "nakitsiz gece" kestirmesi guvenilmez: o hesap nakit
  // kapanabilirdi. Devirde de anlamsiz. Tam form acilir.
  const nakitsizGun = ozet && kapanis && !acikVar
                          && Number(ozet.nakit || 0) === 0
                          && Number(ozet.nakit_gider || 0) === 0
                          && Number(ozet.acilis || 0) === 0;

  const kaydet = async (bosOnay = false) => {
    if (busy) return;
    if (!storeId) { alert("Önce mağaza seç"); return; }
    if (!sayan.trim() || sayan.trim().length < 2) { alert("Sayan kişinin adını yaz"); return; }
    if (acikVar && not.trim().length < 3) {
      alert(ozet.acik_bugun_adet + " hesap hâlâ açık — kapanıştan sonra sayılır.\nÖnce hesapları kapat; kapatamıyorsan (borçlu gitti vs.) sebebini açıklamaya yaz.");
      return;
    }
    if (!bosOnay && notGerekli && not.trim().length < 3) {
      alert("₺" + Math.round(Math.abs(fark)) + " fark var — kısa bir açıklama yaz");
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.from("cash_counts").insert({
      store_id: storeId,
      tur,
      denoms: bosOnay ? {} : denomsTemizle(adetler),
      // Devirde para cekmecede kalir; "cekmeceden alinan" yalniz kapanista.
      withdrawn: kapanis ? Number(cekilen) || 0 : 0,
      counted_by_person: sayan.trim(),
      note: not.trim() || null,
    }).select("counted_total,expected_cash,difference,business_day,tur").single();
    setBusy(false);
    if (error) { alert("Kaydedilemedi: " + error.message); return; }
    try { localStorage.removeItem(TASLAK_KEY(storeId, gun)); } catch (e) { /* onemsiz */ }
    setBitti(data);
  };

  const kart = { background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: 14 };
  const etiket = { fontSize: 12, color: C.muted, letterSpacing: "0.2px", fontWeight: 600 };
  const inputS = {
    width: "100%", minHeight: 44, padding: "10px 12px", background: "#0C0C0C",
    border: `1px solid ${C.line}`, borderRadius: 10, color: C.ink, fontSize: 16,
    outline: "none", fontFamily: cv, boxSizing: "border-box",
  };

  if (bitti) {
    return (
      <div style={{ fontFamily: cv, color: C.ink, maxWidth: 520, margin: "0 auto", padding: "40px 16px", textAlign: "center" }}>
        <Ikon ad="onayli" boy={64} kalin={1.3} style={{ display: "block", margin: "0 auto 16px" }} />
        <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 6 }}>
          {bitti.tur === "devir" ? "Devir sayımı kaydedildi" : "Kasa sayıldı"}
        </div>
        <div style={{ fontSize: 14, color: C.muted, lineHeight: 1.7 }}>
          Sayılan {fmtTL(bitti.counted_total)} · beklenen {fmtTL(bitti.expected_cash)}
          <br />
          Fark <span style={{ color: farkRengi(bitti.difference), fontWeight: 800 }}>
            {Number(bitti.difference) > 0 ? "+" : ""}{fmtTL(bitti.difference)}
          </span>
        </div>
        <div style={{ fontSize: 12, color: C.faint, marginTop: 14, lineHeight: 1.6 }}>
          Kayıt mühürlendi — silinemez. Yanlış saydıysan aynı gece üstüne
          gerekçeli düzeltme girebilirsin.
        </div>
        <button onClick={() => navigate("/payment")} style={{
          marginTop: 22, minHeight: 44, padding: "12px 24px", background: C.accent, color: "#000",
          border: "none", borderRadius: 12, fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: cv,
        }}>Kasa'ya dön</button>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: cv, color: C.ink, maxWidth: 520, margin: "0 auto", paddingBottom: 40 }}>
      <div style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }}>Kasa Sayımı</div>
      <div style={{ fontSize: 12, color: C.faint, marginBottom: 12 }}>
        {gun ? new Date(gun + "T12:00").toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long" }) : "…"}
        {" · gün 03:00'te biter · kapanışı yapan sayar"}
      </div>

      {/* Sayim turu. 17:00 devri cekmece fotografidir: gunde birden cok
          olabilir, acilis zincirine girmez. Kapanis gunde tektir. */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        {[["devir", "Vardiya devri (17:00)"], ["kapanis", "Kapanış sayımı"]].map(([k, l]) => (
          <button key={k} onClick={() => setTur(k)} style={{
            flex: 1, minHeight: 44, padding: "10px 8px", borderRadius: 10, cursor: "pointer",
            fontFamily: cv, fontSize: 13, fontWeight: 800,
            background: tur === k ? C.accent : "transparent",
            color: tur === k ? "#000" : C.muted,
            border: `1px solid ${tur === k ? C.accent : C.line}`,
          }}>{l}</button>
        ))}
      </div>
      {!kapanis && (
        <div style={{ fontSize: 12, color: C.faint, margin: "-4px 0 12px", lineHeight: 1.5 }}>
          Devir sayımı çıkan vardiyanın çekmeceyi sayıp teslim etmesidir —
          o ana kadarki beklenenle karşılaştırılır, gece yine kapanış sayımı yapılır.
        </div>
      )}

      {/* Magaza secimi: birden fazlaysa VARSAYILAN YOK. Yanlis cekmeceyi
          saymak, sayimi hic yapmamaktan kotudur. */}
      {stores.length > 1 && (
        <div style={{ ...kart, marginBottom: 10 }}>
          <div style={{ ...etiket, marginBottom: 8 }}>Hangi çekmece sayılıyor?</div>
          <div style={{ display: "flex", gap: 8 }}>
            {stores.map(s => (
              <button key={s.id} onClick={() => setStoreId(s.id)} style={{
                flex: 1, minHeight: 44, padding: "12px 10px", borderRadius: 10, cursor: "pointer",
                fontFamily: cv, fontSize: 14, fontWeight: 800,
                background: storeId === s.id ? C.accent : "transparent",
                color: storeId === s.id ? "#000" : C.muted,
                border: `1px solid ${storeId === s.id ? C.accent : C.line}`,
              }}>{s.name}</button>
            ))}
          </div>
        </div>
      )}

      {!storeId && stores.length > 1 && (
        <div style={{ ...kart, color: C.muted, fontSize: 13 }}>Devam etmek için çekmeceyi seç.</div>
      )}

      {storeId && ozetHata && (
        <div style={{ ...kart, borderColor: C.down, color: C.down, fontSize: 13, lineHeight: 1.6 }}>
          <Ikon ad="uyari" boy={15} style={{ marginRight: 6 }} />
          Beklenen tutar alınamadı — bağlantı yok. Sayımı şimdi kaydetme;
          fark yanlış çıkar. Bağlantı gelince sayfayı yenile.
          <div style={{ fontSize: 12, color: C.faint, marginTop: 6 }}>{ozetHata}</div>
        </div>
      )}

      {storeId && !ozetHata && !ozet && (
        <div style={{ ...kart, color: C.muted, fontSize: 13 }}>Gün özeti alınıyor…</div>
      )}

      {storeId && ozet && (<>
        {/* Nakitsiz gece: 9 alanlik form yerine tek dugme. */}
        {nakitsizGun ? (
          <div style={{ ...kart, marginBottom: 10 }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>Bugün çekmeceden hiç nakit geçmedi</div>
            <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, marginBottom: 12 }}>
              Ne nakit tahsilat ne kasadan gider var, devreden açılış da yok.
              Kupür saymana gerek yok.
            </div>
            <input value={sayan} onChange={e => setSayan(e.target.value)}
                   placeholder="Sayan kişi" style={{ ...inputS, marginBottom: 10 }} />
            <button onClick={() => kaydet(true)} disabled={busy} style={{
              width: "100%", minHeight: 48, background: C.accent, color: "#000", border: "none",
              borderRadius: 12, fontSize: 15, fontWeight: 800, cursor: "pointer", fontFamily: cv,
              opacity: busy ? 0.6 : 1,
            }}>Kasa boş — onayla</button>
          </div>
        ) : (<>
          {/* Beklenen tutarin nereden geldigi kalem kalem gorunur. */}
          <div style={{ ...kart, marginBottom: 10 }}>
            <div style={etiket}>Çekmecede olması gereken</div>
            <div style={{ fontSize: 40, fontWeight: 900, fontFamily: hv, lineHeight: 1, margin: "6px 0 10px" }}>
              {fmtTL(beklenen)}
            </div>
            <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.9 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Dünden devreden</span><span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtTL(ozet.acilis)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Nakit tahsilat</span><span style={{ fontVariantNumeric: "tabular-nums" }}>+{fmtTL(ozet.nakit)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between",
                            color: Number(ozet.gider_adet) === 0 ? C.faint : C.muted }}>
                <span>Kasadan gider{Number(ozet.gider_adet) > 0 ? ` (${ozet.gider_adet})` : ""}</span>
                <span style={{ fontVariantNumeric: "tabular-nums" }}>−{fmtTL(ozet.nakit_gider)}</span>
              </div>
            </div>
            {Number(ozet.gider_adet) === 0 && (
              <div style={{ fontSize: 12, color: C.faint, marginTop: 8, lineHeight: 1.5 }}>
                Bugün kasadan hiç gider girilmemiş — doğru mu? Kasadan alışveriş
                yaptıysan Giderler'e gir, yoksa fark orada çıkar.
              </div>
            )}
          </div>

          {/* Kupur izgarasi. Buyuk dokunma hedefleri: gece, tek elle. */}
          <div style={{ ...kart, marginBottom: 10 }}>
            <div style={{ ...etiket, marginBottom: 10 }}>Çekmecedeki kupürler</div>
            {[...KUPURLER, ...(bozukAcik ? BOZUKLAR : [])].map(k => (
              <div key={k} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <div style={{ width: 62, fontSize: 15, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
                  ₺{k % 1 === 0 ? k : k.toFixed(2)}
                </div>
                <input
                  type="number" inputMode="numeric" min="0" step="1"
                  value={adetler[k] ?? ""}
                  onChange={e => {
                    const v = e.target.value;
                    setAdetler(a => ({ ...a, [k]: v === "" ? "" : Math.max(0, Math.trunc(Number(v) || 0)) }));
                  }}
                  placeholder="0"
                  style={{ ...inputS, flex: 1, textAlign: "center", fontWeight: 700 }} />
                <div style={{ width: 92, textAlign: "right", fontSize: 14, color: C.muted,
                              fontVariantNumeric: "tabular-nums" }}>
                  {Number(adetler[k]) > 0 ? fmtTL(k * Number(adetler[k])) : "—"}
                </div>
              </div>
            ))}
            {!bozukAcik && (
              <button onClick={() => setBozukAcik(true)} style={{
                width: "100%", minHeight: 44, marginTop: 4, background: "transparent", color: C.muted,
                border: `1px solid ${C.line}`, borderRadius: 10, fontSize: 13, fontWeight: 700,
                cursor: "pointer", fontFamily: cv, display: "flex", alignItems: "center",
                justifyContent: "center", gap: 7,
              }}><Ikon ad="ekle" boy={14} />Bozuk para</button>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline",
                          marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.line}` }}>
              <span style={{ fontSize: 14, fontWeight: 700 }}>Sayılan</span>
              <span style={{ fontSize: 24, fontWeight: 900, fontVariantNumeric: "tabular-nums" }}>{fmtTL(sayilan)}</span>
            </div>
          </div>

          {/* FARK — ekranin karar noktasi. */}
          <div style={{ ...kart, marginBottom: 10, borderColor: notGerekli ? "#3A2E2A" : C.line }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={etiket}>Fark</span>
              <span style={{ fontSize: 30, fontWeight: 900, fontFamily: hv,
                             color: farkRengi(fark), fontVariantNumeric: "tabular-nums" }}>
                {fark > 0 ? "+" : ""}{fmtTL(fark)}
              </span>
            </div>
            {notGerekli && (
              <div style={{ fontSize: 13, color: C.muted, marginTop: 10, lineHeight: 1.7 }}>
                {fark > 0
                  ? "Fazla var. Veresiye ödemesi alındı mı? Yarına para bırakıyorsan aşağıdaki \"çekmeceden alınan\" alanını kullan."
                  : "Eksik var. Bir hesap yanlış yöntemle mi kapandı, kasadan gider girmeyi mi unuttun?"}
              </div>
            )}
          </div>

          {/* Fiste yazandan az tahsil edilmis siparisler farka karismaz ama
              gorunmezse gercek bir acik "kasa farki" sanilir. */}
          {Number(ozet.eksik_adet) > 0 && (
            <div style={{ ...kart, marginBottom: 10, fontSize: 13, color: C.muted, lineHeight: 1.6 }}>
              <Ikon ad="uyari" boy={13} style={{ marginRight: 6 }} />
              {ozet.eksik_adet} siparişte fişte yazandan {fmtTL(ozet.eksik_tutar)} az tahsil edilmiş.
              Farka karışmaz, ayrı bir konu.
            </div>
          )}

          {(acikVar || Number(ozet.acik_eski_adet) > 0) && (
            <div onClick={() => navigate("/payment")} style={{ ...kart, marginBottom: 10, cursor: "pointer",
                          borderColor: acikVar ? C.down : C.line,
                          fontSize: 13, color: acikVar ? C.ink : C.muted, lineHeight: 1.6,
                          display: "flex", alignItems: "center", gap: 8 }}>
              <Ikon ad={acikVar ? "uyari" : "bekleme"} boy={14} style={acikVar ? { color: C.down } : undefined} />
              <span style={{ flex: 1 }}>
                {acikVar && (<>
                  <b>Bu gece {ozet.acik_bugun_adet} hesap hâlâ açık · {fmtTL(ozet.acik_bugun_tutar)}</b>
                  <br />
                  <span style={{ color: C.muted }}>
                    Sayım kapanıştan sonra yapılır — önce bu hesapları kapat, yoksa
                    beklenen tutar eksik çıkar. Kapatamıyorsan sebebini açıklamaya yaz.
                  </span>
                </>)}
                {acikVar && Number(ozet.acik_eski_adet) > 0 && <br />}
                {Number(ozet.acik_eski_adet) > 0 &&
                  <span style={{ color: C.faint }}>Eskiden kalan {ozet.acik_eski_adet} hesap · {fmtTL(ozet.acik_eski_tutar)} — farka karışmaz</span>}
              </span>
              <Ikon ad="oksag" boy={14} />
            </div>
          )}

          {/* Cekmecede olmayanlar: farka karismadigi acikca yaziyor. */}
          <div style={{ ...kart, marginBottom: 10 }}>
            <div style={{ ...etiket, marginBottom: 8 }}>Çekmecede yok — farka karışmaz</div>
            <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.9 }}>
              {[["Kart", ozet.kart], ["Online", ozet.online], ["Havale", ozet.havale],
                ["Borç", ozet.borc], ["Puan", ozet.puan]]
                .filter(([, v]) => Number(v) > 0)
                .map(([l, v]) => (
                  <div key={l} style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>{l}</span><span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtTL(v)}</span>
                  </div>
                ))}
              {[ozet.kart, ozet.online, ozet.havale, ozet.borc, ozet.puan].every(v => !Number(v)) &&
                <div style={{ color: C.faint }}>Bugün kart/online/borç/puan yok.</div>}
            </div>
          </div>

          {/* Cekmeceden para alma yalniz kapanista: devirde para cekmecede
              kalir, gelen vardiya sayilmis cekmeceyi teslim alir. */}
          {kapanis && (
            <div style={{ ...kart, marginBottom: 10 }}>
              <div style={{ ...etiket, marginBottom: 8 }}>Çekmeceden alınan (bankaya/kasaya)</div>
              <input type="number" inputMode="decimal" min="0" value={cekilen}
                     onChange={e => setCekilen(e.target.value)} placeholder="0"
                     style={inputS} />
              <div style={{ fontSize: 12, color: C.faint, marginTop: 6, lineHeight: 1.5 }}>
                Çekmecede bıraktığın para yarının açılış kasası olur. Aldığın kadarını buraya yaz.
              </div>
            </div>
          )}

          <div style={{ ...kart, marginBottom: 10 }}>
            <div style={{ ...etiket, marginBottom: 8 }}>Sayan kişi — kapanışı yapan sayar</div>
            {/* Gunun vardiyasi tek dokunusla secilir; aktif vardiyadakiler belirgin.
                Yazmak serbest kalir: vardiya kaydi acilmamis biri de sayabilmeli. */}
            {vardiya.length > 0 && (
              <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 10 }}>
                {vardiya.map(v => (
                  <button key={v.ad} onClick={() => setSayan(v.ad)} style={{
                    minHeight: 38, padding: "8px 13px", borderRadius: 9, cursor: "pointer",
                    fontFamily: cv, fontSize: 13, fontWeight: 700,
                    background: sayan === v.ad ? C.accent : "transparent",
                    color: sayan === v.ad ? "#000" : v.aktif ? C.ink : C.faint,
                    border: `1px solid ${sayan === v.ad ? C.accent : C.line}`,
                  }}>{v.ad}{v.aktif ? "" : " (çıktı)"}</button>
                ))}
              </div>
            )}
            <input value={sayan} onChange={e => setSayan(e.target.value)}
                   placeholder="Adı soyadı" style={inputS} />
            <div style={{ fontSize: 12, color: C.faint, marginTop: 6, lineHeight: 1.5 }}>
              Bu hesabı birden çok kişi kullanıyorsa bu geceyi fiilen kimin saydığını yaz.
            </div>
            <div style={{ ...etiket, margin: "14px 0 8px" }}>
              Açıklama{notGerekli ? " (zorunlu)" : " (opsiyonel)"}
            </div>
            <textarea value={not} onChange={e => setNot(e.target.value)} rows={2}
                      placeholder={notGerekli ? "Fark neden çıktı?" : "Not bırakmak istersen"}
                      style={{ ...inputS, resize: "vertical", minHeight: 60 }} />
          </div>

          <button onClick={() => kaydet(false)} disabled={busy} style={{
            width: "100%", minHeight: 52, border: "none", borderRadius: 12, fontSize: 16,
            fontWeight: 800, cursor: "pointer", fontFamily: cv, opacity: busy ? 0.6 : 1,
            background: acikVar && not.trim().length < 3 ? "#242424" : C.accent,
            color: acikVar && not.trim().length < 3 ? C.faint : "#000",
          }}>{busy ? "Kaydediliyor…"
              : acikVar && not.trim().length < 3
                ? `Önce ${ozet.acik_bugun_adet} açık hesabı kapat — ya da açıklama yaz`
                : kapanis ? "Kapanış sayımını mühürle" : "Devri mühürle"}</button>

          <div style={{ fontSize: 12, color: C.faint, marginTop: 10, lineHeight: 1.6, textAlign: "center" }}>
            Kaydedildikten sonra silinemez. Yanlış saydıysan üstüne gerekçeli düzeltme girilir.
          </div>
        </>)}
      </>)}
    </div>
  );
}
