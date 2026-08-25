import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase.js";
import { useAuth } from "../../contexts/AuthContext.jsx";
import Ikon from "../../components/Ikon.jsx";

const cv = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";
const hv = "'Bebas Neue','Barlow Condensed','Coolvetica Condensed',sans-serif";

// ReportsPage ile ayni palet — iki rapor ekrani ayni dilde konussun.
const C = {
  card: "#161616", cardLine: "#262626", ink: "#F0EDE8", muted: "#8A8A86",
  faint: "#666666", accent: "#FFFFFF", down: "#C87A6A",
};

const fmtTL = (n) => "₺" + Number(n || 0).toLocaleString("tr-TR", { maximumFractionDigits: 0 });

// Sunucu isletme gunune gore hesapliyor; buradaki tarihler yalniz araligi
// secmek icin. Cihaz saatine guvenmiyoruz, gun kesimini sunucu yapiyor.
const gunOnce = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};
const bugun = () => new Date().toISOString().slice(0, 10);

const ARALIKLAR = [
  { key: "7",  label: "7 gün",  bas: () => gunOnce(6) },
  { key: "30", label: "30 gün", bas: () => gunOnce(29) },
  { key: "90", label: "90 gün", bas: () => gunOnce(89) },
];

// Maliyetin nereden geldigi. Ekran bunu gizlemez: tahminle olcumu ayni
// tabloda esit gostermek, olmayan bir kesinlik uydurmak olurdu.
const KAYNAK = {
  kayit:    { etiket: "ölçüldü",  renk: "#F0EDE8", aciklama: "Maliyet satış anındaki fiyattan kaydedildi." },
  tahmini:  { etiket: "tahmini",  renk: "#8A8A86", aciklama: "Stok düşümü başlamadan önceki satış — bugünkü reçete maliyetiyle hesaplandı." },
  karma:    { etiket: "karma",    renk: "#8A8A86", aciklama: "Satışların bir kısmı ölçüldü, kalanı bugünkü reçeteden tahmin edildi." },
  alis:     { etiket: "alış",     renk: "#8A8A86", aciklama: "Reçetesi yok; maliyet ürünün alış fiyatından geliyor." },
  konsinye: { etiket: "konsinye", renk: "#666666", aciklama: "Mutfak hazırlıyor, maliyeti bizde tutulmuyor — ay sonu hakediş olarak ödeniyor." },
  yok:      { etiket: "maliyet yok", renk: "#C87A6A", aciklama: "Ne reçetesi ne alış fiyatı var. Kâr hesaplanamıyor." },
};

// Ürün Kârlılığı — "hangi ürün para kazandırıyor?" sorusunun tek ekrandaki cevabi.
// Ciro kolay, maliyet zor: bu ekranin isi maliyetin NEREDEN geldigini
// saklamadan gostermek. Guvenilmez satir, guvenilir satirla ayni yerde
// durursa butun tablo guvenilmez olur.
export default function ProfitPage() {
  const { staffUser } = useAuth();
  const storeIds = staffUser?.store_ids || [];
  const [stores, setStores] = useState([]);
  const [storeId, setStoreId] = useState(null);
  const [aralik, setAralik] = useState("30");
  const [satirlar, setSatirlar] = useState(null);
  const [hata, setHata] = useState(null);
  const [acik, setAcik] = useState(null);

  useEffect(() => {
    if (!storeIds.length) return;
    supabase.from("stores").select("id,name,slug").in("id", storeIds).order("slug").then(r => {
      const list = r.data || [];
      setStores(list);
      setStoreId(prev => prev || list[0]?.id || null);
    });
  }, [staffUser?.id]);

  useEffect(() => {
    if (!storeId) return;
    let iptal = false;
    setSatirlar(null); setHata(null);
    const bas = (ARALIKLAR.find(a => a.key === aralik) || ARALIKLAR[1]).bas();
    supabase.rpc("urun_karliligi", { p_store_id: storeId, p_bas: bas, p_bit: bugun() })
      .then(({ data, error }) => {
        if (iptal) return;
        if (error) { setHata(error.message); setSatirlar([]); return; }
        setSatirlar(data || []);
      });
    return () => { iptal = true; };
  }, [storeId, aralik]);

  const ozet = useMemo(() => {
    const s = satirlar || [];
    const olculebilir = s.filter(r => r.kar !== null);
    const olcusuz = s.filter(r => r.kar === null);
    const ciro = s.reduce((t, r) => t + Number(r.ciro || 0), 0);
    const kar = olculebilir.reduce((t, r) => t + Number(r.kar || 0), 0);
    const maliyet = olculebilir.reduce((t, r) => t + Number(r.maliyet || 0), 0);
    const kapsananCiro = olculebilir.reduce((t, r) => t + Number(r.ciro || 0), 0);
    return {
      ciro, kar, maliyet, kapsananCiro,
      kapsam: ciro > 0 ? Math.round((kapsananCiro / ciro) * 100) : 0,
      marj: kapsananCiro > 0 ? (kar / kapsananCiro) * 100 : null,
      olcusuz, eksikli: s.filter(r => r.maliyet_eksik),
    };
  }, [satirlar]);

  const kart = { background: C.card, border: `1px solid ${C.cardLine}`, borderRadius: 12, padding: 16 };
  const etiket = { fontSize: 12, color: C.muted, letterSpacing: "0.2px", fontWeight: 600 };

  return (
    <div style={{ padding: 16, fontFamily: cv, maxWidth: 900, margin: "0 auto", paddingBottom: 80, color: C.ink }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontSize: 24, fontWeight: 800 }}>Ürün Kârlılığı</div>
        <div style={{ fontSize: 12, color: C.faint }}>gün 03:00'te biter</div>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "14px 0" }}>
        {stores.length > 1 && stores.map(s => (
          <button key={s.id} onClick={() => setStoreId(s.id)} style={{
            padding: "9px 14px", borderRadius: 9, cursor: "pointer", fontFamily: cv, fontSize: 12, fontWeight: 700,
            minHeight: 40,
            background: storeId === s.id ? C.accent : "transparent",
            color: storeId === s.id ? "#000" : C.muted,
            border: `1px solid ${storeId === s.id ? C.accent : C.cardLine}`,
          }}>{s.name}</button>
        ))}
        <div style={{ flex: 1 }} />
        {ARALIKLAR.map(a => (
          <button key={a.key} onClick={() => setAralik(a.key)} style={{
            padding: "9px 14px", borderRadius: 9, cursor: "pointer", fontFamily: cv, fontSize: 12, fontWeight: 700,
            minHeight: 40,
            background: aralik === a.key ? C.accent : "transparent",
            color: aralik === a.key ? "#000" : C.muted,
            border: `1px solid ${aralik === a.key ? C.accent : C.cardLine}`,
          }}>{a.label}</button>
        ))}
      </div>

      {hata && (
        <div style={{ ...kart, borderColor: C.down, color: C.down, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
          <Ikon ad="uyari" boy={15} />{hata}
        </div>
      )}

      {satirlar === null && !hata && (
        <div style={{ padding: 60, textAlign: "center", color: C.muted }}>Yükleniyor…</div>
      )}

      {satirlar && satirlar.length === 0 && !hata && (
        <div style={{ ...kart, textAlign: "center", color: C.muted, padding: 40, fontSize: 13 }}>
          Bu aralıkta kapanmış satış yok.
        </div>
      )}

      {satirlar && satirlar.length > 0 && (<>
        {/* Ilk bakista uc sey: ne kaldi, hangi oranda, ne kadarini gorebiliyoruz. */}
        <div style={{ ...kart, marginBottom: 10 }}>
          <div style={etiket}>Kâr (maliyeti bilinen ürünler)</div>
          <div style={{ fontSize: 52, fontWeight: 900, fontFamily: hv, lineHeight: 1, marginTop: 6 }}>
            {fmtTL(ozet.kar)}
          </div>
          <div style={{ fontSize: 13, color: C.muted, marginTop: 6 }}>
            {fmtTL(ozet.kapsananCiro)} ciro − {fmtTL(ozet.maliyet)} maliyet
            {ozet.marj !== null && <> · marj <span style={{ color: C.ink, fontWeight: 700 }}>%{ozet.marj.toFixed(1)}</span></>}
          </div>

          {/* Kapsam cubugu: raporun ne kadarini gercekten gorebiliyoruz. */}
          <div style={{ marginTop: 14 }}>
            <div style={{ height: 6, background: "#2E2E2E", borderRadius: 4, overflow: "hidden", display: "flex" }}>
              <div style={{ width: ozet.kapsam + "%", background: C.accent }} />
            </div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>
              Toplam {fmtTL(ozet.ciro)} cironun <span style={{ color: C.ink, fontWeight: 700 }}>%{ozet.kapsam}</span>'inin maliyeti biliniyor
            </div>
          </div>
        </div>

        {ozet.olcusuz.length > 0 && (
          <div style={{ ...kart, marginBottom: 10, borderColor: "#3A2E2A" }}>
            <div style={{ ...etiket, color: C.down, display: "flex", alignItems: "center", gap: 6 }}>
              <Ikon ad="uyari" boy={13} />Maliyeti girilmemiş {ozet.olcusuz.length} ürün
            </div>
            <div style={{ fontSize: 13, color: C.muted, marginTop: 6, lineHeight: 1.6 }}>
              Bu ürünlerin {fmtTL(ozet.olcusuz.reduce((t, r) => t + Number(r.ciro || 0), 0))} cirosu yukarıdaki kâra
              girmiyor. Reçetesi olanlara reçete, satış ürünlerine (tişört, gözlük, şapka)
              Menü Yönetimi'nden alış fiyatı gir.
            </div>
            <div style={{ fontSize: 13, marginTop: 8, color: C.ink }}>
              {ozet.olcusuz.slice(0, 6).map(r => r.urun).join(" · ")}
              {ozet.olcusuz.length > 6 && ` · +${ozet.olcusuz.length - 6}`}
            </div>
          </div>
        )}

        {ozet.eksikli.length > 0 && (
          <div style={{ ...kart, marginBottom: 10 }}>
            <div style={{ ...etiket, display: "flex", alignItems: "center", gap: 6 }}>
              <Ikon ad="uyari" boy={13} />{ozet.eksikli.length} üründe reçete maliyeti eksik
            </div>
            <div style={{ fontSize: 13, color: C.muted, marginTop: 6, lineHeight: 1.6 }}>
              Reçetesinde maliyeti girilmemiş malzeme var — bu ürünler olduğundan kârlı görünüyor.
              Stok Yönetimi'nden birim maliyetlerini gir.
            </div>
            <div style={{ fontSize: 13, marginTop: 8, color: C.ink }}>
              {ozet.eksikli.slice(0, 6).map(r => r.urun).join(" · ")}
              {ozet.eksikli.length > 6 && ` · +${ozet.eksikli.length - 6}`}
            </div>
          </div>
        )}

        <div style={{ ...kart, padding: 0, overflow: "hidden" }}>
          {satirlar.map((r, i) => {
            const k = KAYNAK[r.maliyet_kaynagi] || KAYNAK.yok;
            const acikBu = acik === r.product_id;
            const olcusuz = r.kar === null;
            return (
              <div key={r.product_id}
                   onClick={() => setAcik(acikBu ? null : r.product_id)}
                   style={{ padding: "12px 14px", borderTop: i === 0 ? "none" : `1px solid ${C.cardLine}`,
                            cursor: "pointer", opacity: olcusuz ? 0.72 : 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {r.urun}
                      {r.maliyet_eksik && <Ikon ad="uyari" boy={12} style={{ marginLeft: 6, color: C.down }} />}
                    </div>
                    <div style={{ fontSize: 12, color: C.faint, marginTop: 2 }}>
                      {r.kategori} · {Number(r.adet)} adet
                      {Number(r.ikram_adet) > 0 && <> · {Number(r.ikram_adet)} ikram</>}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 800, fontVariantNumeric: "tabular-nums",
                                  color: olcusuz ? C.faint : Number(r.kar) < 0 ? C.down : C.ink }}>
                      {olcusuz ? "—" : fmtTL(r.kar)}
                    </div>
                    <div style={{ fontSize: 12, color: C.faint, fontVariantNumeric: "tabular-nums" }}>
                      {r.marj !== null ? "%" + Number(r.marj).toFixed(0) + " marj" : k.etiket}
                    </div>
                  </div>
                </div>

                {acikBu && (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.cardLine}`,
                                fontSize: 13, color: C.muted, lineHeight: 1.7 }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Ciro</span><span style={{ color: C.ink, fontVariantNumeric: "tabular-nums" }}>{fmtTL(r.ciro)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Maliyet</span>
                      <span style={{ color: C.ink, fontVariantNumeric: "tabular-nums" }}>
                        {r.maliyet === null ? "bilinmiyor" : fmtTL(r.maliyet)}
                      </span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Birim kâr</span>
                      <span style={{ color: C.ink, fontVariantNumeric: "tabular-nums" }}>
                        {olcusuz ? "—" : fmtTL(Number(r.kar) / Math.max(1, Number(r.adet)))}
                      </span>
                    </div>
                    <div style={{ marginTop: 8, color: k.renk, fontSize: 12 }}>
                      <span style={{ fontWeight: 700 }}>{k.etiket}</span> — {k.aciklama}
                    </div>
                    {r.maliyet_eksik && (
                      <div style={{ marginTop: 4, color: C.down, fontSize: 12 }}>
                        Reçetesinde maliyeti girilmemiş malzeme var; gerçek kâr bundan düşük.
                      </div>
                    )}
                    {Number(r.ikram_adet) > 0 && (
                      <div style={{ marginTop: 4, fontSize: 12 }}>
                        {Number(r.ikram_adet)} adet ikram verildi — cirosu sıfır, maliyeti bu rakama dahil.
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ fontSize: 12, color: C.faint, marginTop: 12, lineHeight: 1.7 }}>
          Maliyet, stok düşümünün başladığı 25 Ağustos'tan itibaren satış anındaki fiyattan
          kaydediliyor. Daha eski satışlar bugünkü reçete maliyetiyle tahmin ediliyor;
          her satır hangisi olduğunu söylüyor. Puanla ödenen tutar ürün cirosundan
          düşülmez — puan işletme düzeyinde bir maliyettir, ürünün performansı değil.
        </div>
      </>)}
    </div>
  );
}
