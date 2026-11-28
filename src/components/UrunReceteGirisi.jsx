import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase.js";
import { uyar } from "../lib/uyar.js";
import { GRUP_SIRASI, RAF_URUN } from "../lib/malzemeGrup.js";
import { aramaAnahtari, aramaUyar } from "../lib/stockCount.js";
import { varsayilanMiktar, yeniMalzemeKaydi, MALZEME_BIRIMLERI } from "../lib/recete.js";
import SayiGirisi from "./SayiGirisi.jsx";

// YENI URUN FORMUNDA RECETE (sahip 28.11: "yeni ürün eklerken reçete de
// girebilsin").
//
// Satirlar FORMDA tutulur, veritabanina urunle BIRLIKTE yazilir (Menü
// Yönetimi > saveProd). Urun kaydedilmeden reçete satiri olusmaz; "Iptal"
// recete satiri birakmaz.
//
// Bu bolumu "menu_fiyat" ek yetkili personel de gorur:
//   - Var olan malzemeyi arar ve secer.
//   - Listede yoksa YENI MALZEME acar; maliyetini ve stogunu da girer (sahip
//     28.11: "Evet yazabilsin, maliyet ve stok da girebilsin"). Yeni malzeme
//     HEMEN kaydedilir (urun kaydini beklemez) ve Stok Yönetimi'nde gorunur.
//   - VAR OLAN malzemelerin maliyeti gosterilmez; maliyet ekranlari
//     yoneticiye aittir.
//
// value: [{ ingredient_id, name, unit, qty, store_id, is_consumable, party_only }]
// onChange(yeniListe)   onYeniAcik(bool): yeni malzeme formu acik mi
const RAFLAR = GRUP_SIRASI.filter(g => g !== RAF_URUN);
const BOS_YENI = { name: "", unit: "", boyut: "", fiyat: "", eldeki: "", grup: "" };
const sayiYaz = (x, hane) => Number(x).toLocaleString("tr-TR", { maximumFractionDigits: hane });

export default function UrunReceteGirisi({ storeId, value, onChange, onYeniAcik }) {
  const satirlar = value || [];
  const [malzemeler, setMalzemeler] = useState(null);   // null = yukleniyor
  const [partiSarf, setPartiSarf] = useState(() => new Set()); // baska recetede "yalniz parti" olan malzemeler
  const [hata, setHata] = useState("");
  const [deneme, setDeneme] = useState(0);              // "Yeniden dene"
  const [ara, setAra] = useState("");
  const [yeni, setYeni] = useState(null);               // acik yeni malzeme formu
  const [kaydediyor, setKaydediyor] = useState(false);

  useEffect(() => {
    let iptal = false;
    setMalzemeler(null); setHata("");
    if (!storeId) { setMalzemeler([]); return; }
    Promise.all([
      supabase.from("ingredients").select("id, name, unit, is_consumable").eq("store_id", storeId).order("name"),
      // Sarf malzeme baska urunlerde "yalniz parti gecesi" ise (PET bardak)
      // burada da oyle baslasin; yoksa her satista stoktan duserdi.
      supabase.from("recipes").select("ingredient_id").eq("store_id", storeId).eq("party_only", true),
    ]).then(([{ data, error }, { data: parti }]) => {
      if (iptal) return;
      if (error) { setHata("bağlantı kurulamadı"); setMalzemeler([]); return; }
      setMalzemeler((data || []).slice().sort((a, b) => String(a.name).localeCompare(String(b.name), "tr")));
      setPartiSarf(new Set((parti || []).map(r => r.ingredient_id)));
    });
    return () => { iptal = true; };
  }, [storeId, deneme]);

  // MAGAZA DEGISTI (yonetici formda "hangi menude" secimini degistirdi):
  // onceki magazanin malzemeleri bu urunun recetesinde kalmasin; yoksa urun
  // satilinca baska magazanin stogu duserdi.
  useEffect(() => {
    if (satirlar.some(r => r.store_id !== storeId)) onChange(satirlar.filter(r => r.store_id === storeId));
    setYeni(null);
    // Yalniz magaza degisince calisir; satirlar bilerek bagimlilikta degil.
  }, [storeId]);

  // Yeni malzeme formu acikken urunun "Kaydet"i beklesin (Menü Yönetimi):
  // yoksa kaydedilmemis malzeme taslagi urunle birlikte sessizce giderdi.
  const yeniAcik = !!yeni;
  useEffect(() => {
    onYeniAcik?.(yeniAcik);
    return () => onYeniAcik?.(false);
    // onYeniAcik her cizimde yeni islev olabilir; yalniz acik/kapali degisince haber verilir.
  }, [yeniAcik]);

  const secili = (id) => satirlar.some(r => r.ingredient_id === id);
  const ekle = (ing) => {
    if (secili(ing.id)) return;
    onChange([...satirlar, {
      ingredient_id: ing.id, name: ing.name, unit: ing.unit, qty: varsayilanMiktar(ing), store_id: storeId,
      is_consumable: !!ing.is_consumable, party_only: !!ing.is_consumable && partiSarf.has(ing.id),
    }]);
    setAra("");
  };
  const cikar = (id) => onChange(satirlar.filter(r => r.ingredient_id !== id));
  const degistir = (id, alan) => onChange(satirlar.map(r => r.ingredient_id === id ? { ...r, ...alan } : r));

  // ARAMA: "sut" yazan "Süt"u, "seker surubu" yazan "Şeker Şurubu"nu bulur
  // (lib/stockCount.js). Adi yazilanla BASLAYAN malzeme one gelir.
  const q = aramaAnahtari(ara);
  const eslesen = q && malzemeler ? malzemeler.filter(i => aramaUyar(i.name, ara)) : [];
  const acik = eslesen.filter(i => !secili(i.id))
    .sort((a, b) => Number(aramaAnahtari(b.name).startsWith(q)) - Number(aramaAnahtari(a.name).startsWith(q)));
  const sonuc = acik.slice(0, 12);
  const sarf = (malzemeler || []).filter(i => i.is_consumable);

  // ---- YENI MALZEME ----
  const yeniAc = () => { setYeni({ ...BOS_YENI, name: ara.trim().replace(/\s+/g, " ") }); };
  const birim = yeni ? MALZEME_BIRIMLERI.find(b => b.k === yeni.unit) : null;
  const onizle = yeni && birim ? yeniMalzemeKaydi({ ...yeni, storeId }, malzemeler || []) : null;
  const yeniKaydet = async () => {
    if (kaydediyor || !yeni) return;
    const s = yeniMalzemeKaydi({ ...yeni, storeId }, malzemeler || []);
    if (s.hata) { uyar(s.hata); return; }
    setKaydediyor(true);
    const { data, error } = await supabase.from("ingredients").insert(s.kayit).select("id, name, unit, is_consumable").single();
    setKaydediyor(false);
    if (error || !data?.id) { uyar("Malzeme kaydedilemedi: " + (error?.message || "bilinmeyen hata")); return; }
    setMalzemeler(prev => [...(prev || []), data].sort((a, b) => String(a.name).localeCompare(String(b.name), "tr")));
    setYeni(null);
    ekle(data);
    uyar(data.name + " eklendi. Miktarını reçetede yaz.", "basari");
  };

  const kutu = { width: "100%", padding: "11px 12px", background: "#161616", border: "1px solid #2A2A2A", borderRadius: 8, color: "#F0EDE8", fontSize: 15, outline: "none", fontFamily: "inherit", boxSizing: "border-box" };
  const etiket = { fontSize: 12, color: "#888", fontWeight: 600, letterSpacing: "0.2px", margin: "10px 0 5px" };
  const cip = (secik) => ({ padding: "9px 12px", minHeight: 40, background: secik ? "#FFFFFF" : "#222", color: secik ? "#000" : "#B8B3AC", border: "1px solid " + (secik ? "#FFFFFF" : "#3A3A3A"), borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" });

  return (
    <div>
      <div style={{ fontSize: 12, color: "#8A8580", lineHeight: 1.5, marginBottom: 10 }}>
        Bu ürün satılınca stoktan ne düşer? Malzemeyi ara, seç, bir porsiyonun miktarını yaz.
        Hazır satılan üründe (şişe, kutu, paket) boş bırak.
      </div>

      {malzemeler === null && <div style={{ fontSize: 13, color: "#888", padding: "6px 0" }}>Malzemeler yükleniyor…</div>}
      {hata && (
        <div style={{ fontSize: 13, color: "#C87A6A", padding: "6px 0", lineHeight: 1.5 }}>
          Malzemeler yüklenemedi: {hata}. Bağlantını kontrol et.{" "}
          <button type="button" onClick={() => setDeneme(n => n + 1)} style={{ ...cip(false), marginLeft: 4 }}>Yeniden dene</button>
        </div>
      )}

      {malzemeler !== null && !hata && !yeni && (
        <>
          <input value={ara} onChange={e => setAra(e.target.value)} aria-label="Malzeme ara"
            placeholder="Malzeme ara: gin, tonik, limon suyu…" style={kutu} />
          {q && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
              {sonuc.map(ing => (
                <button type="button" key={ing.id} onClick={() => ekle(ing)}
                  style={{ padding: "10px 12px", background: "#222", color: "#F0EDE8", border: "1px solid #3A3A3A", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                  + {ing.name} <span style={{ color: "#888", fontWeight: 600 }}>({ing.unit})</span>
                </button>
              ))}
              {acik.length > sonuc.length && (
                <div style={{ flexBasis: "100%", fontSize: 12, color: "#8A8580" }}>
                  {acik.length - sonuc.length} sonuç daha var. Adı yazmaya devam et.
                </div>
              )}
              {sonuc.length === 0 && eslesen.length > 0 && (
                <div style={{ fontSize: 13, color: "#8A8580", lineHeight: 1.5 }}>Bu malzeme reçetede var. Miktarını aşağıdan değiştir.</div>
              )}
              {eslesen.length === 0 && (
                <div style={{ flexBasis: "100%" }}>
                  <div style={{ fontSize: 13, color: "#8A8580", lineHeight: 1.5, marginBottom: 6 }}>Bu adla malzeme yok.</div>
                  <button type="button" onClick={yeniAc}
                    style={{ padding: "10px 12px", minHeight: 44, background: "#2A2A2A", color: "#F0EDE8", border: "1px dashed #8A8580", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
                    + “{ara.trim()}” adında yeni malzeme aç
                  </button>
                </div>
              )}
            </div>
          )}

          {sarf.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, color: "#888", fontWeight: 600, letterSpacing: "0.2px", marginBottom: 6 }}>SARF (dokun: ekle / çıkar)</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {sarf.map(ing => {
                  const acikMi = secili(ing.id);
                  return (
                    <button type="button" key={ing.id} aria-pressed={acikMi} onClick={() => acikMi ? cikar(ing.id) : ekle(ing)}
                      style={{ padding: "9px 12px", background: acikMi ? "#2A2A2A" : "#161616", color: acikMi ? "#F0EDE8" : "#888", border: "1px solid " + (acikMi ? "#F0EDE8" : "#2A2A2A"), borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                      {acikMi ? "✓ " : "+ "}{ing.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {yeni && (
        <div role="group" aria-label="Yeni malzeme" style={{ background: "#161616", border: "1px solid #3A3A3A", borderRadius: 10, padding: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: "#F0EDE8" }}>Yeni malzeme</div>
          <div style={{ fontSize: 12, color: "#8A8580", lineHeight: 1.5, marginTop: 3 }}>
            Malzeme hemen kaydedilir ve Stok Yönetimi&apos;nde görünür. Önce aramayı dene: aynı malzeme iki kez açılmasın.
          </div>
          <div style={etiket}>AD</div>
          <input value={yeni.name} onChange={e => setYeni(y => ({ ...y, name: e.target.value }))} aria-label="Yeni malzemenin adı" style={{ ...kutu, background: "#0C0C0C" }} />

          <div style={etiket}>NASIL ÖLÇÜLÜR?</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {MALZEME_BIRIMLERI.map(b => (
              <button type="button" key={b.k} aria-pressed={yeni.unit === b.k} onClick={() => setYeni(y => ({ ...y, unit: b.k, boyut: "" }))} style={cip(yeni.unit === b.k)}>{b.k}</button>
            ))}
          </div>
          <div style={{ fontSize: 12, color: "#8A8580", marginTop: 5, lineHeight: 1.5 }}>
            {MALZEME_BIRIMLERI.map(b => b.k + " = " + b.ne).join(" · ")}
          </div>

          {birim && (
            <>
              <div style={etiket}>{birim.kap.toLocaleUpperCase("tr-TR")}</div>
              <SayiGirisi kip={yeni.unit === "adet" ? "tam" : "ondalik"} min={0} value={yeni.boyut} onChange={v => setYeni(y => ({ ...y, boyut: v }))}
                aria-label={birim.kap} placeholder={birim.kapOrnek} style={{ ...kutu, background: "#0C0C0C" }} />
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                {birim.hazir.map(h => (
                  <button type="button" key={h} onClick={() => setYeni(y => ({ ...y, boyut: String(h) }))} style={cip(Number(yeni.boyut) === h)}>{sayiYaz(h, 0)}</button>
                ))}
              </div>

              <div style={etiket}>{birim.fiyatSoru.toLocaleUpperCase("tr-TR")} (₺, KDV DAHİL)</div>
              <SayiGirisi kip="para" min={0} value={yeni.fiyat} onChange={v => setYeni(y => ({ ...y, fiyat: v }))}
                aria-label="Fiyat (₺, KDV dahil)" placeholder="bilmiyorsan boş bırak" style={{ ...kutu, background: "#0C0C0C" }} />

              <div style={etiket}>{birim.eldeSoru.toLocaleUpperCase("tr-TR")}</div>
              <SayiGirisi kip="ondalik" min={0} value={yeni.eldeki} onChange={v => setYeni(y => ({ ...y, eldeki: v }))}
                aria-label="Eldeki miktar" placeholder="yoksa boş bırak · yarım için 0,5" style={{ ...kutu, background: "#0C0C0C" }} />

              <div style={etiket}>STOK RAFI</div>
              <select value={yeni.grup} onChange={e => setYeni(y => ({ ...y, grup: e.target.value }))} aria-label="Stok rafı" style={{ ...kutu, background: "#0C0C0C" }}>
                <option value="">Seçmedim (Diğer)</option>
                {RAFLAR.map(r => <option key={r} value={r}>{r}</option>)}
              </select>

              {onizle?.kayit && (
                <div data-yeni-malzeme-ozet style={{ fontSize: 13, color: "#F0EDE8", background: "#0C0C0C", border: "1px solid #2A2A2A", borderRadius: 8, padding: "9px 11px", marginTop: 10, lineHeight: 1.5 }}>
                  Kaydedilecek: 1 {yeni.unit} = {onizle.kayit.cost_per_unit > 0 ? "₺" + sayiYaz(onizle.kayit.cost_per_unit, 4) : "maliyet yok"} · stok {sayiYaz(onizle.kayit.stock_qty, 2)} {yeni.unit}
                </div>
              )}
              {onizle?.ayni && (
                <div style={{ fontSize: 13, color: "#C87A6A", marginTop: 10, lineHeight: 1.5 }}>
                  “{onizle.ayni.name}” zaten var.{" "}
                  <button type="button" onClick={() => { const m = (malzemeler || []).find(x => x.id === onizle.ayni.id); setYeni(null); if (m) ekle(m); }} style={{ ...cip(false), marginLeft: 4 }}>Onu reçeteye ekle</button>
                </div>
              )}
            </>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button type="button" onClick={() => setYeni(null)} disabled={kaydediyor}
              style={{ flex: 1, minHeight: 44, padding: "10px", background: "transparent", color: "#888", border: "1px solid #333", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Vazgeç</button>
            <button type="button" onClick={yeniKaydet} disabled={kaydediyor}
              style={{ flex: 2, minHeight: 44, padding: "10px", background: "#FFFFFF", color: "#000", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", opacity: kaydediyor ? 0.6 : 1 }}>{kaydediyor ? "..." : "Malzemeyi kaydet"}</button>
          </div>
        </div>
      )}

      {satirlar.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 12, color: "#888", fontWeight: 600, letterSpacing: "0.2px", marginBottom: 6 }}>REÇETE ({satirlar.length} MALZEME)</div>
          {satirlar.map(r => (
            <div key={r.ingredient_id} data-recete-satir={r.name}
              style={{ background: "#161616", border: "1px solid #2A2A2A", borderRadius: 10, padding: "8px 10px", marginBottom: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 700, color: "#F0EDE8", overflowWrap: "anywhere" }}>{r.name}</div>
                <SayiGirisi kip="ondalik" min={0} value={r.qty} onChange={v => degistir(r.ingredient_id, { qty: v })}
                  aria-label={r.name + " miktarı (" + r.unit + ")"}
                  style={{ width: 76, padding: "9px 8px", background: "#0C0C0C", border: "1px solid #3A3A3A", borderRadius: 8, color: "#F0EDE8", fontSize: 15, fontWeight: 700, textAlign: "center", outline: "none", fontFamily: "inherit" }} />
                <span style={{ width: 34, flexShrink: 0, color: "#888", fontSize: 13, fontWeight: 700 }}>{r.unit}</span>
                <button type="button" onClick={() => cikar(r.ingredient_id)} aria-label={r.name + " — reçeteden çıkar"}
                  style={{ flexShrink: 0, padding: "9px 10px", background: "transparent", color: "#C87A6A", border: "1px solid #2A2A2A", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Çıkar</button>
              </div>
              {r.is_consumable && (
                <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, paddingTop: 8, borderTop: "1px solid #262626", cursor: "pointer" }}>
                  <input type="checkbox" checked={!!r.party_only} onChange={e => degistir(r.ingredient_id, { party_only: e.target.checked })} />
                  <span style={{ fontSize: 12, color: r.party_only ? "#F0EDE8" : "#888", fontWeight: r.party_only ? 700 : 500 }}>Sadece parti gecesi düşsün</span>
                </label>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
