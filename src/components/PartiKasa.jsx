import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { optionsText } from "../lib/productOptions.js";
import PartiSerit, { tl } from "./PartiSerit.jsx";
import Ikon from "./Ikon.jsx";

// ============================================================================
// PARTI KASASI — yatay tablette parti gecesi siparis girme ekrani.
// ============================================================================
// NEDEN VAR. Olculen sorun: 22:00-02:00 arasinda gecede ortalama 6,3 hesap
// giriliyor, gunduz 27,2. Fark hiz. Giris o kadar yavas ki personel gercegi
// sikistiriyor — 01.10 23:10'da acilan "Misafir 1" hesabi tek kalem: Efes
// Fici x7. Yedi ayri musteri tek satira yaziliyor.
//
// Telefon duzeninde bir urun eklemek: alt sayfayi ac -> kategori bul -> kaydir
// -> urune bas -> (varsa) secenek -> Bitti. Sepeti gormek icin alt sayfayi
// kapat. Yatay tablette bunun hicbirine gerek yok: parti saatinde satilan
// urunlerin %80'i 9 urun, %90'i 15 urun. Hepsi tek ekrana sigar.
//
// BU EKRAN ESKI KASAYI DEGISTIRMEZ. OrderDetailPage'in normal govdesi oldugu
// gibi duruyor; burasi yalniz (genis ekran + parti modu + cihaz tercihi)
// ucu birden saglandiginda onun YERINE ciziliyor. Islemlerin hepsi
// (urunEkle / changeQty / odeme) sayfadaki ayni fonksiyonlar — burada ikinci
// bir fiyat/stok mantigi YOK, yalnizca farkli bir yerlesim.
//
// Secenekli urunler (Beefeater single/double, tisort bedeni) yine sayfadaki
// pencereyi acar: onEkle = sayfadaki urunEkle. Kart uzerindeki kirmizi nokta
// "bu urun tek dokunusla bitmiyor" demek.
// ============================================================================

const ZEMIN = "#0A0A0A", PANEL = "#161616", CIZGI = "#2A2A2A", METIN = "#F0EDE8", SOLUK = "#888888";

export default function PartiKasa({
  order, items = [], products = [], categories = [], hhPrices = {},
  onEkle, onAdet, onOdeme, onTahsil, tahsilBusy = false, onYeniHesap, kapali = false,
  sonEklenen, sonKalem, onSonAdet, onGeriAl,
  partiAdet = 0, tumMenu = false, onTumMenu,
  onListe, staffUser, where, uyeAdi,
}) {
  const navigate = useNavigate();
  const [ara, setAra] = useState("");
  const [acikHesaplar, setAcikHesaplar] = useState([]);

  // Diger acik hesaplar: parti gecesi ayni anda 4-5 "Misafir N" aciliyor
  // (01.10'da Misafir 1..4 ayni yarim saatte). Hesap degistirmek icin masa
  // listesine donup geri gelmek gerekmesin.
  useEffect(() => {
    const magazalar = staffUser?.store_ids?.length ? staffUser.store_ids : null;
    if (!magazalar) return;
    let iptal = false;
    supabase.from("orders")
      .select("id, customer_name, table_id, total, created_at")
      .in("origin_store_id", magazalar)
      .in("status", ["open", "sent", "preparing", "ready"])
      .order("created_at", { ascending: false })
      .limit(12)
      .then(({ data }) => { if (!iptal) setAcikHesaplar(data || []); });
    return () => { iptal = true; };
  }, [staffUser?.id, order?.id, items.length]);

  const trLow = (s) => String(s || "").toLocaleLowerCase("tr");
  const fiyatOf = (p) => (hhPrices[p.id] != null ? hhPrices[p.id] : p.price);
  const secenekliMi = (p) => !!(p.has_options && p.options_config?.groups?.length);

  // Bu hesapta urunden kac adet var — kartin uzerindeki beyaz rozet.
  // Secenekler ayri satir aciyor (single/double), rozet hepsini toplar:
  // sorulan sey "bu urunden kac tane girdim".
  const adetHarita = useMemo(() => {
    const m = {};
    for (const it of items) if (it.product_id) m[it.product_id] = (m[it.product_id] || 0) + (it.quantity || 0);
    return m;
  }, [items]);

  // SERITLER. Kategori adlari KODA YAZILMAZ — ikinci isletmede baska kategori
  // agaci var. UrunSecici'deki cip siralamasinin aynisi: ust kategori sirasi,
  // onun icinde alt kategori sirasi. Serit icindeki urun sirasi menunun kendi
  // sort_order'i (products zaten ona gore yuklu): sahibin Ayarlar'dan
  // degistirebildigi, kendiliginden oynamayan tek sira. Satisa gore otomatik
  // dizilseydi her hafta yer degisir, kas hafizasi bozulurdu.
  const partiUrunler = useMemo(
    () => (tumMenu ? products : products.filter(p => p.show_in_party_menu)),
    [products, tumMenu]
  );
  const seritler = useMemo(() => {
    return categories
      .filter(c => partiUrunler.some(p => p.category_id === c.id))
      .map(c => {
        const ust = c.parent_id ? categories.find(x => x.id === c.parent_id) : null;
        return {
          ...c,
          _sira: (ust ? (ust.sort_order || 0) : (c.sort_order || 0)) * 1000 + (ust ? (c.sort_order || 0) : 0),
          urunler: partiUrunler.filter(p => p.category_id === c.id),
        };
      })
      .sort((a, b) => a._sira - b._sira);
  }, [categories, partiUrunler]);

  // Arama parti menusuyle sinirli DEGIL: gece tisort de satiliyor, parti
  // disi bir sey istendiginde "Tum menu"ye gecmek zorunda kalinmasin.
  const sonuclar = useMemo(() => {
    const q = trLow(ara.trim());
    if (!q) return [];
    return products
      .filter(p => trLow(p.name).includes(q) || trLow(p.name_en).includes(q) || trLow(p.brand).includes(q))
      .sort((a, b) => (trLow(a.name).startsWith(q) ? 0 : 1) - (trLow(b.name).startsWith(q) ? 0 : 1))
      .slice(0, 40);
  }, [ara, products]);

  const toplam = order?.total || 0;
  const tahsilEdilebilir = items.length > 0 && !kapali;

  // TAHSILAT ONAYI iki asamali dugme, native confirm() DEGIL.
  // confirm() iPad'de ekranin ORTASINDA aciliyor: parmagi sag alt kosedeki
  // dugmeden 600px oteye goturup kucuk bir "Tamam"a nisan almak gerekiyor.
  // Gece elli kez yapilacak is icin yanlis. Burada ilk dokunus dugmeyi
  // KURAR (yazi ve renk degisir), ikinci dokunus ayni yerde tahsil eder.
  // Yanlislikla dokunulursa dort saniyede kendiliginden geri doner; hesap
  // degisirse (biri urun eklediyse) kurulum ANINDA duser — eski tutari
  // onaylama ihtimali kalmasin.
  const [kurulu, setKurulu] = useState(null); // "card" | "cash" | null
  const [yeniBusy, setYeniBusy] = useState(false);
  useEffect(() => { setKurulu(null); }, [toplam, items.length, order?.id]);
  useEffect(() => {
    if (!kurulu) return;
    const z = setTimeout(() => setKurulu(null), 4000);
    return () => clearTimeout(z);
  }, [kurulu]);
  const tahsilBas = (yontem) => {
    if (!tahsilEdilebilir || tahsilBusy) return;
    if (kurulu === yontem) { setKurulu(null); onTahsil && onTahsil(yontem); return; }
    setKurulu(yontem);
  };
  const toplamAdet = items.reduce((s, i) => s + (i.quantity || 0), 0);
  const baslik = order?.customer_name || where || "Hesap";

  const hayaletDugme = {
    fontSize: 12, fontWeight: 700, color: "#C9C4BE", background: "transparent",
    border: "1px solid " + CIZGI, borderRadius: 9, padding: "0 13px", height: 40,
    display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer", fontFamily: "inherit",
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: ZEMIN, color: METIN, display: "flex", gap: 12, padding: 12, zIndex: 50 }}>
      {/* ---------------- SOL: urun seritleri ---------------- */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ height: 58, flexShrink: 0, background: PANEL, border: "1px solid " + CIZGI, borderRadius: 12,
                      display: "flex", alignItems: "center", gap: 11, padding: "0 14px" }}>
          <button onClick={() => navigate("/tables")} aria-label="Masalara dön"
            style={{ ...hayaletDugme, padding: "0 11px" }}><Ikon ad="oksol" boy={14} /></button>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.4px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {baslik}
            </div>
            <div style={{ fontSize: 11, color: SOLUK, marginTop: 3 }}>
              {where || "masasız"}{uyeAdi ? " · " + uyeAdi : ""}{staffUser?.name ? " · " + staffUser.name : ""}
            </div>
          </div>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.7px", background: CIZGI, color: "#aaa", borderRadius: 6, padding: "4px 8px", flexShrink: 0 }}>
            {String(order?.status || "").toUpperCase()}
          </div>

          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 9, flexShrink: 0 }}>
            <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "1px", background: "#fff", color: "#000", borderRadius: 7, padding: "7px 11px" }}>
              {tumMenu ? `TÜM MENÜ · PARTİ ${partiAdet}` : `PARTİ MODU · ${partiAdet} ÜRÜN`}
            </div>
            <input value={ara} onChange={(e) => setAra(e.target.value)} placeholder="Ara"
              style={{ width: 132, height: 40, background: "#0C0C0C", border: "1px solid " + CIZGI, borderRadius: 9,
                       color: METIN, fontSize: 13, padding: "0 12px", outline: "none", fontFamily: "inherit" }} />
            <button onClick={() => onTumMenu && onTumMenu(!tumMenu)} style={hayaletDugme}>
              {tumMenu ? "Parti menüsü" : "Tüm menü"}
            </button>
            {/* Cihaz tercihi: bu tablette izgara mi liste mi. Fareli genis
                ekranda (mutfak dizustu) listeye donmek icin de bu dugme. */}
            <button onClick={onListe} style={hayaletDugme}>Liste</button>
          </div>
        </div>

        {/* Seritler. Bes serit yatay tablete sigar; daha fazlasi varsa alan
            dikey kayar — yatay savurmayla ayni his, ayni atalet. */}
        <div className="no-scrollbar"
          style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 8, overflowY: ara ? "hidden" : "auto", overscrollBehaviorY: "contain" }}>
          {ara ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignContent: "flex-start", overflowY: "auto" }} className="no-scrollbar">
              {sonuclar.length === 0 && <div style={{ color: SOLUK, fontSize: 13, padding: 14 }}>Sonuç yok — yazımı kontrol et</div>}
              {sonuclar.map(p => (
                <button key={p.id} onClick={() => !kapali && onEkle(p)} disabled={kapali}
                  style={{ width: 128, height: 112, background: adetHarita[p.id] ? "#1E1E1E" : PANEL,
                           border: "1px solid " + (adetHarita[p.id] ? "#5A5A5A" : CIZGI), borderRadius: 12, padding: "10px 9px",
                           display: "flex", flexDirection: "column", justifyContent: "space-between", position: "relative",
                           color: METIN, font: "inherit", textAlign: "left", cursor: kapali ? "not-allowed" : "pointer" }}>
                  {secenekliMi(p) && <span style={{ position: "absolute", top: 9, right: 9, width: 7, height: 7, borderRadius: "50%", background: "#C87A6A" }} />}
                  <span style={{ fontSize: 13.5, fontWeight: 700, lineHeight: 1.22, paddingRight: 11 }}>{p.name}</span>
                  <span style={{ fontSize: 17, fontWeight: 800, letterSpacing: "-0.5px" }}>
                    {Number(fiyatOf(p)) > 0 ? tl(fiyatOf(p)) : "Serbest"}
                  </span>
                </button>
              ))}
            </div>
          ) : seritler.length === 0 ? (
            // Parti modu acik ama hicbir urun parti menusunde isaretli degilse
            // (nip_parti_durum bunu zaten engeller, yine de sessiz bos ekran olmasin).
            <div style={{ color: SOLUK, fontSize: 13, padding: 20, textAlign: "center" }}>
              Parti menüsünde ürün yok. Ayarlar &gt; Ürünler'den işaretle ya da <b style={{ color: METIN }}>Tüm menü</b>'ye geç.
            </div>
          ) : (
            seritler.map(s => (
              <PartiSerit key={s.id} baslik={s.name} urunler={s.urunler}
                fiyatOf={fiyatOf} secenekliMi={secenekliMi}
                adetOf={(p) => adetHarita[p.id] || 0}
                onEkle={onEkle} kapali={kapali} />
            ))
          )}
        </div>

        {/* Son eklenen + geri al: hizda yanlis dokunus olur, 300 TL'lik hatayi
            kalem listesinde aramadan geri alabilmek lazim. */}
        <div style={{ height: 46, flexShrink: 0, background: PANEL, border: "1px solid " + CIZGI, borderRadius: 12,
                      display: "flex", alignItems: "center", gap: 11, padding: "0 14px", fontSize: 12.5 }}>
          {sonEklenen && !kapali ? (
            <>
              <span style={{ color: SOLUK, fontWeight: 700 }}>Son eklenen</span>
              <span style={{ fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {sonEklenen.ad}{(sonKalem?.quantity || sonEklenen.adet) > 1 ? " × " + (sonKalem?.quantity || sonEklenen.adet) : ""}
              </span>
              {sonKalem && (
                <div style={{ display: "flex", alignItems: "center", gap: 4, background: "#000", borderRadius: 18, padding: "3px 4px" }}>
                  <button onClick={() => onSonAdet(-1)} aria-label="Azalt"
                    style={{ width: 32, height: 32, borderRadius: "50%", background: CIZGI, color: "#fff", border: "none", fontSize: 18, fontWeight: 800, cursor: "pointer" }}>−</button>
                  <div style={{ minWidth: 20, textAlign: "center", fontSize: 14, fontWeight: 800 }}>{sonKalem.quantity}</div>
                  <button onClick={() => onSonAdet(+1)} aria-label="Artır"
                    style={{ width: 32, height: 32, borderRadius: "50%", background: CIZGI, color: "#fff", border: "none", fontSize: 18, fontWeight: 800, cursor: "pointer" }}>+</button>
                </div>
              )}
              <button onClick={onGeriAl}
                style={{ marginLeft: "auto", fontSize: 12, fontWeight: 800, color: "#C87A6A", background: "transparent",
                         border: "1px solid #3A2E2B", borderRadius: 9, padding: "0 15px", height: 36, cursor: "pointer", fontFamily: "inherit" }}>
                Geri al
              </button>
            </>
          ) : (
            <span style={{ color: SOLUK }}>{kapali ? `Bu hesap kapandı (${String(order?.status).toUpperCase()}) — ürün eklenemez.` : "Ürüne dokun, hesaba eklensin."}</span>
          )}
        </div>
      </div>

      {/* ---------------- SAG: acik hesap ---------------- */}
      <div style={{ width: 376, flexShrink: 0, background: PANEL, border: "1px solid " + CIZGI, borderRadius: 12,
                    display: "flex", flexDirection: "column", padding: 13, gap: 11, minHeight: 0 }}>
        <div className="no-scrollbar" style={{ display: "flex", gap: 5, alignItems: "center", overflowX: "auto", flexShrink: 0 }}>
          {acikHesaplar.map(h => {
            const bu = h.id === order?.id;
            return (
              <button key={h.id} onClick={() => !bu && navigate("/orders/" + h.id)}
                style={{ flexShrink: 0, fontSize: 11, fontWeight: 800, borderRadius: 18, padding: "8px 10px", whiteSpace: "nowrap",
                         background: bu ? "#fff" : "#0C0C0C", color: bu ? "#000" : "#9B9691",
                         border: "1px solid " + (bu ? "#fff" : CIZGI), cursor: bu ? "default" : "pointer", fontFamily: "inherit" }}>
                {h.customer_name || "Hesap"}
              </button>
            );
          })}
          {/* Siradaki musteriyi IZGARADAN acar: numarayi kendi verir, masa
              listesine ugramaz. Tezgah satisi pesi sira geldigi icin aradaki
              iki ekran degisimi en pahali gezinmeydi. */}
          <button onClick={async () => { if (yeniBusy || !onYeniHesap) return; setYeniBusy(true); await onYeniHesap(); setYeniBusy(false); }}
            disabled={yeniBusy}
            style={{ flexShrink: 0, fontSize: 11, fontWeight: 800, borderRadius: 18, padding: "8px 10px", whiteSpace: "nowrap",
                     background: "#0C0C0C", color: "#6E6A66", border: "1px dashed " + CIZGI,
                     cursor: yeniBusy ? "wait" : "pointer", fontFamily: "inherit" }}>
            {yeniBusy ? "Açılıyor…" : "+ Yeni hesap"}
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "baseline", gap: 8, borderTop: "1px solid #222", paddingTop: 11, flexShrink: 0 }}>
          <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.4px" }}>AÇIK HESAP</span>
          <span style={{ fontSize: 11, color: SOLUK }}>{items.length} kalem · {toplamAdet} adet</span>
        </div>

        <div className="no-scrollbar" style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 7, overscrollBehaviorY: "contain" }}>
          {items.length === 0 && (
            <div style={{ color: SOLUK, fontSize: 12, textAlign: "center", padding: 20 }}>Henüz ürün yok.</div>
          )}
          {items.map(it => {
            const opts = optionsText(it.selected_options);
            return (
              <div key={it.id} style={{ background: "#0C0C0C", border: "1px solid #242424", borderRadius: 10, padding: "9px 10px",
                                        display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, lineHeight: 1.25 }}>{it.product_name}</div>
                  {opts && <div style={{ fontSize: 10.5, color: "#fff", fontWeight: 700, marginTop: 2 }}>{opts}</div>}
                  <div style={{ fontSize: 10.5, color: SOLUK, marginTop: 2 }}>
                    {it.is_treat ? "İKRAM" : tl(it.final_price) + " / adet"}
                  </div>
                </div>
                {!kapali && (
                  <div style={{ display: "flex", alignItems: "center", gap: 4, background: "#000", borderRadius: 18, padding: "3px 4px", flexShrink: 0 }}>
                    <button onClick={() => onAdet(it.id, -1)} aria-label="Azalt"
                      style={{ width: 32, height: 32, borderRadius: "50%", background: CIZGI, color: "#fff", border: "none", fontSize: 17, fontWeight: 800, cursor: "pointer" }}>−</button>
                    <div style={{ minWidth: 20, textAlign: "center", fontSize: 14, fontWeight: 800 }}>{it.quantity}</div>
                    <button onClick={() => onAdet(it.id, +1)} aria-label="Artır"
                      style={{ width: 32, height: 32, borderRadius: "50%", background: CIZGI, color: "#fff", border: "none", fontSize: 17, fontWeight: 800, cursor: "pointer" }}>+</button>
                  </div>
                )}
                <div style={{ fontSize: 13, fontWeight: 800, minWidth: 62, textAlign: "right", flexShrink: 0 }}>
                  {tl((it.is_treat ? 0 : Number(it.final_price || 0)) * (it.quantity || 1))}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", borderTop: "1px solid #222", paddingTop: 11, flexShrink: 0 }}>
          <span style={{ fontSize: 11.5, color: SOLUK, fontWeight: 800, letterSpacing: "0.5px" }}>TOPLAM</span>
          <span style={{ fontSize: 29, fontWeight: 800, letterSpacing: "-1.2px" }}>{tl(toplam)}</span>
        </div>

        {/* TAHSILAT. Parti gecesi odemelerinin %86'si KART, %65'i hesap
            acildiktan sonraki 3 dakika icinde. O yuzden kart buyuk ve tek
            dokunus; nakit yaninda; bolme/indirim/borc/puan "Diğer" ile
            odeme ekraninda. Tahsilatin kendisi sayfadaki hizliTahsil —
            PaymentPage ile ayni nip_odeme_al cagrisi. */}
        <button onClick={() => tahsilBas("card")} disabled={!tahsilEdilebilir || tahsilBusy}
          style={{ height: 58, flexShrink: 0, borderRadius: 13, border: "none", fontSize: 16, fontWeight: 800,
                   fontFamily: "inherit", cursor: tahsilEdilebilir && !tahsilBusy ? "pointer" : "not-allowed",
                   background: !tahsilEdilebilir || tahsilBusy ? "#2A2A2A" : kurulu === "card" ? "#C87A6A" : "#fff",
                   color: !tahsilEdilebilir || tahsilBusy ? "#777" : kurulu === "card" ? "#0A0A0A" : "#000" }}>
          {items.length === 0 ? "Sepet boş"
            : tahsilBusy ? "Tahsil ediliyor…"
            : kurulu === "card" ? `Onayla — kart · ${tl(toplam)}`
            : `Kart ile al · ${tl(toplam)}`}
        </button>
        <div style={{ display: "flex", gap: 7, flexShrink: 0 }}>
          <button onClick={() => tahsilBas("cash")} disabled={!tahsilEdilebilir || tahsilBusy}
            style={{ flex: 1, height: 44, borderRadius: 11, fontSize: 13, fontWeight: 800, fontFamily: "inherit",
                     background: kurulu === "cash" ? "#C87A6A" : "#0C0C0C",
                     border: "1px solid " + (kurulu === "cash" ? "#C87A6A" : CIZGI),
                     color: kurulu === "cash" ? "#0A0A0A" : tahsilEdilebilir ? "#C9C4BE" : "#55514D",
                     cursor: tahsilEdilebilir && !tahsilBusy ? "pointer" : "not-allowed" }}>
            {kurulu === "cash" ? `Onayla — nakit · ${tl(toplam)}` : "Nakit"}
          </button>
          {kurulu !== "cash" && (
            <button onClick={onOdeme} disabled={items.length === 0}
              style={{ flex: 1, height: 44, background: "#0C0C0C", border: "1px solid " + CIZGI, borderRadius: 11,
                       color: items.length ? "#C9C4BE" : "#55514D", fontSize: 13, fontWeight: 800,
                       cursor: items.length ? "pointer" : "not-allowed", fontFamily: "inherit" }}>
              Diğer ödeme
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
