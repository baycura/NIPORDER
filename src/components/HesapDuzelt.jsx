import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase.js";
import Ikon from "./Ikon.jsx";
import { Pencere } from "./BorcTahsil.jsx";

// HESABI IPTAL ETMEDEN DUZELT (20261013_hesap_duzeltme.sql).
// Olcum: hesaplarin %10,6'si iptal ediliyordu ve nedeni yazilmiyordu; mutfaga
// giden kalem silinemedigi icin personel tum hesabi iptal edip yeniden aciyordu.
// Dort pencere: hesap iptali (neden zorunlu), urun kaldirma (neden zorunlu),
// baska hesaba tasima, masa degistirme. Hepsi tek sunucu fonksiyonu cagirir;
// kayitlari yalniz sahip gorur ("İptal ve düzeltmeler" sayfasi).

export const IPTAL_NEDENLERI = [
  "Müşteri vazgeçti",
  "Yanlış hesap açıldı",
  "Unutulmuş / eski hesap",
  "Deneme",
  "Diğer",
];

export const KALDIR_NEDENLERI = [
  "Yanlış ürün girildi",
  "Müşteri vazgeçti",
  "Ürün bitti",
  "İade / hatalı hazırlandı",
  "Diğer",
];

const C = { line: "#2A2A2A", ink: "#F0EDE8", muted: "#8A8A86", faint: "#666", accent: "#FFFFFF", down: "#C87A6A" };
const tl = (n) => "₺" + Number(n || 0).toLocaleString("tr-TR", { maximumFractionDigits: 2 });
// Sunucu iletisi "kaldir: ..." bicimindedir; on ek ekranda gereksiz.
const hataYaz = (e) => String(e?.message || e || "").replace(/^[a-z]+: /i, "");

function cip(aktif) {
  return {
    minHeight: 40, padding: "8px 12px", borderRadius: 10, cursor: "pointer", fontFamily: "inherit",
    fontSize: 13, fontWeight: 700, textAlign: "left",
    background: aktif ? C.accent : "transparent", color: aktif ? "#000" : C.ink,
    border: `1px solid ${aktif ? C.accent : C.line}`,
  };
}

function NedenSecici({ nedenler, neden, setNeden, not, setNot }) {
  const diger = neden === "Diğer";
  return (
    <div>
      <div style={{ fontSize: 12, color: C.muted, fontWeight: 700, marginBottom: 8 }}>Neden?</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 10 }}>
        {nedenler.map(n => (
          <button key={n} onClick={() => setNeden(n)} style={cip(neden === n)}>{n}</button>
        ))}
      </div>
      <textarea value={not} onChange={e => setNot(e.target.value)} rows={2}
        placeholder={diger ? "Kısa açıklama (zorunlu)" : "Not (isteğe bağlı)"}
        style={{ width: "100%", boxSizing: "border-box", minHeight: 52, padding: "10px 12px", background: "#0C0C0C",
                 border: `1px solid ${diger && not.trim().length < 3 ? C.down : C.line}`, borderRadius: 10,
                 color: C.ink, fontSize: 14, fontFamily: "inherit", outline: "none", resize: "vertical" }} />
    </div>
  );
}

function Adet({ adet, setAdet, en }) {
  if (en <= 1) return null;
  const btn = { width: 44, height: 44, borderRadius: "50%", background: "#2A2A2A", color: "#fff", border: "none",
                fontSize: 20, fontWeight: 700, cursor: "pointer" };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
      <span style={{ fontSize: 13, color: C.muted, fontWeight: 700, flex: 1 }}>Kaç adet?</span>
      <button onClick={() => setAdet(a => Math.max(1, a - 1))} style={btn} aria-label="Azalt">−</button>
      <span style={{ minWidth: 28, textAlign: "center", fontSize: 18, fontWeight: 800 }}>{adet}</span>
      <button onClick={() => setAdet(a => Math.min(en, a + 1))} style={btn} aria-label="Artır">+</button>
      <button onClick={() => setAdet(en)} style={{ ...cip(adet === en), minHeight: 44 }}>Hepsi ({en})</button>
    </div>
  );
}

function AnaDugme({ children, onClick, busy, tehlike, pasif }) {
  return (
    <button onClick={onClick} disabled={busy || pasif} style={{
      width: "100%", minHeight: 50, marginTop: 14, border: "none", borderRadius: 12, fontSize: 15, fontWeight: 800,
      cursor: busy || pasif ? "default" : "pointer", fontFamily: "inherit", opacity: busy ? 0.6 : 1,
      background: pasif ? "#242424" : tehlike ? C.down : C.accent,
      color: pasif ? C.faint : tehlike ? "#fff" : "#000",
    }}>{children}</button>
  );
}

const nedenTamam = (neden, not) => !!neden && (neden !== "Diğer" || not.trim().length >= 3);

// ---------------------------------------------------------------------------
// HESAP IPTALI
// order: { id, total, customer_name }, ad: ekranda gorunen hesap adi
export function IptalPenceresi({ order, ad, kalemSayisi = 1, varsayilanNeden = null, uyari = null, onKapat, onBitti }) {
  const [neden, setNeden] = useState(varsayilanNeden);
  const [not, setNot] = useState("");
  const [busy, setBusy] = useState(false);
  const [hata, setHata] = useState(null);
  const bos = kalemSayisi === 0;
  const tamam = bos || nedenTamam(neden, not);

  const iptalEt = async () => {
    if (busy || !tamam) return;
    setBusy(true); setHata(null);
    const { error } = await supabase.rpc("nip_hesap_iptal", {
      p_order_id: order.id, p_neden: bos ? "Boş hesap" : neden, p_aciklama: not.trim() || null,
    });
    setBusy(false);
    if (error) { setHata(hataYaz(error)); return; }
    onBitti?.();
  };

  return (
    <Pencere baslik="Hesabı iptal et" alt={`${ad || "Hesap"} · ${tl(order.total)}`} onKapat={onKapat} z={130}>
      <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, marginBottom: 14 }}>
        Ciroya yazılmaz. Yalnız bir ürün yanlışsa hesabı iptal etme: ürünün
        <b style={{ color: C.ink }}> − </b>düğmesiyle o ürünü kaldır.
      </div>
      {uyari && <div style={{ fontSize: 13, color: C.ink, lineHeight: 1.6, marginBottom: 14 }}>{uyari}</div>}
      {!bos && <NedenSecici nedenler={IPTAL_NEDENLERI} neden={neden} setNeden={setNeden} not={not} setNot={setNot} />}
      {hata && <div role="alert" style={{ color: C.down, fontSize: 13, marginTop: 10, lineHeight: 1.5 }}>{hata}</div>}
      <AnaDugme onClick={iptalEt} busy={busy} tehlike pasif={!tamam}>
        {busy ? "İptal ediliyor…" : tamam ? "Hesabı iptal et" : "Önce neden seç"}
      </AnaDugme>
    </Pencere>
  );
}

// ---------------------------------------------------------------------------
// URUN KALDIRMA (mutfaga gitmis olsa da)
// kalem: order_items satiri
export function KaldirPenceresi({ kalem, onKapat, onBitti }) {
  const serbest = Math.max(0, Number(kalem.quantity || 0) - Number(kalem.odenen_adet || 0));
  const [adet, setAdet] = useState(1);
  const [neden, setNeden] = useState(null);
  const [not, setNot] = useState("");
  const [busy, setBusy] = useState(false);
  const [hata, setHata] = useState(null);
  const tamam = serbest > 0 && nedenTamam(neden, not);
  const mutfakta = kalem.kitchen_status && kalem.kitchen_status !== "pending";

  const kaldir = async () => {
    if (busy || !tamam) return;
    setBusy(true); setHata(null);
    const { data, error } = await supabase.rpc("nip_kalem_kaldir", {
      p_item_id: kalem.id, p_adet: adet, p_neden: neden, p_aciklama: not.trim() || null,
    });
    setBusy(false);
    if (error) { setHata(hataYaz(error)); return; }
    onBitti?.(Array.isArray(data) ? data[0] : data);
  };

  return (
    <Pencere baslik="Ürünü kaldır" alt={`${kalem.product_name} · ${tl(kalem.final_price)}`} onKapat={onKapat} z={130}>
      {mutfakta && (
        <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, marginBottom: 12 }}>
          Bu ürün mutfağa gitti. Kaldırınca mutfak ekranında da düşer.
        </div>
      )}
      {Number(kalem.odenen_adet || 0) > 0 && (
        <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, marginBottom: 12 }}>
          {kalem.odenen_adet} adedi ödendi. Ödenen adet kaldırılmaz.
        </div>
      )}
      <Adet adet={adet} setAdet={setAdet} en={serbest} />
      <NedenSecici nedenler={KALDIR_NEDENLERI} neden={neden} setNeden={setNeden} not={not} setNot={setNot} />
      {hata && <div role="alert" style={{ color: C.down, fontSize: 13, marginTop: 10, lineHeight: 1.5 }}>{hata}</div>}
      <AnaDugme onClick={kaldir} busy={busy} tehlike pasif={!tamam}>
        {busy ? "Kaldırılıyor…" : !serbest ? "Kaldırılacak adet yok" : tamam ? `${adet} adet kaldır` : "Önce neden seç"}
      </AnaDugme>
    </Pencere>
  );
}

// ---------------------------------------------------------------------------
// BASKA HESABA TASIMA
export function TasiPenceresi({ kalem, order, onKapat, onBitti }) {
  const serbest = Math.max(0, Number(kalem.quantity || 0) - Number(kalem.odenen_adet || 0));
  const [adet, setAdet] = useState(serbest);
  const [hesaplar, setHesaplar] = useState(null);
  const [masalar, setMasalar] = useState({});
  const [hedef, setHedef] = useState(null);     // order id | "yeni"
  const [busy, setBusy] = useState(false);
  const [hata, setHata] = useState(null);

  useEffect(() => {
    let iptal = false;
    Promise.all([
      supabase.from("orders").select("id, customer_name, table_id, total, created_at")
        .eq("origin_store_id", order.origin_store_id)
        .in("status", ["open", "sent", "preparing", "ready"])
        .neq("id", order.id)
        .order("created_at", { ascending: false }).limit(40),
      supabase.from("cafe_tables").select("id, name"),
    ]).then(([o, t]) => {
      if (iptal) return;
      setHesaplar(o.data || []);
      setMasalar(Object.fromEntries((t.data || []).map(x => [x.id, x.name])));
    });
    return () => { iptal = true; };
  }, [order.id]);

  const hesapAdi = (h) => h.table_id
    ? (masalar[h.table_id] || "Masa") + (h.customer_name ? " · " + h.customer_name : "")
    : (h.customer_name || "Misafir");
  const hedefAdi = hedef === "yeni" ? "yeni Misafir hesabı"
    : hedef ? hesapAdi((hesaplar || []).find(h => h.id === hedef) || {}) : "";

  const tasi = async () => {
    if (busy || !hedef || !serbest) return;
    setBusy(true); setHata(null);
    const { data, error } = await supabase.rpc("nip_kalem_tasi", {
      p_kalemler: [{ id: kalem.id, adet }],
      p_hedef_order_id: hedef === "yeni" ? null : hedef,
      p_yeni_misafir: hedef === "yeni",
      p_neden: null,
    });
    setBusy(false);
    if (error) { setHata(hataYaz(error)); return; }
    onBitti?.({ hedefId: data, hedefAdi, adet });
  };

  return (
    <Pencere baslik="Başka hesaba taşı" alt={`${kalem.product_name} · ${tl(kalem.final_price)}`} onKapat={onKapat} z={130}>
      <Adet adet={adet} setAdet={setAdet} en={serbest} />
      <div style={{ fontSize: 12, color: C.muted, fontWeight: 700, marginBottom: 8 }}>Hangi hesaba?</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        <button onClick={() => setHedef("yeni")} style={{ ...cip(hedef === "yeni"), display: "flex", alignItems: "center", gap: 8 }}>
          <Ikon ad="ekle" boy={14} />Yeni Misafir hesabı aç
        </button>
        {hesaplar === null && <div style={{ fontSize: 13, color: C.muted }}>Açık hesaplar alınıyor…</div>}
        {hesaplar && hesaplar.length === 0 && <div style={{ fontSize: 13, color: C.muted }}>Başka açık hesap yok.</div>}
        {(hesaplar || []).map(h => (
          <button key={h.id} onClick={() => setHedef(h.id)}
            style={{ ...cip(hedef === h.id), display: "flex", justifyContent: "space-between", gap: 10 }}>
            <span>{hesapAdi(h)}</span>
            <span style={{ fontVariantNumeric: "tabular-nums", opacity: 0.8 }}>{tl(h.total)}</span>
          </button>
        ))}
      </div>
      {hata && <div role="alert" style={{ color: C.down, fontSize: 13, marginTop: 10, lineHeight: 1.5 }}>{hata}</div>}
      <AnaDugme onClick={tasi} busy={busy} pasif={!hedef || !serbest}>
        {busy ? "Taşınıyor…" : !serbest ? "Taşınacak adet yok" : hedef ? `${adet} adet taşı → ${hedefAdi}` : "Önce hesap seç"}
      </AnaDugme>
    </Pencere>
  );
}

// ---------------------------------------------------------------------------
// MASA DEGISTIRME
export function MasaPenceresi({ order, onKapat, onBitti }) {
  const [masalar, setMasalar] = useState(null);
  const [busy, setBusy] = useState(null);
  const [hata, setHata] = useState(null);

  useEffect(() => {
    let iptal = false;
    supabase.from("cafe_tables").select("id, name, section, sort_order, store_id")
      .eq("is_active", true).order("sort_order")
      .then(({ data }) => {
        if (iptal) return;
        setMasalar((data || []).filter(t => !t.store_id || t.store_id === order.origin_store_id));
      });
    return () => { iptal = true; };
  }, [order.id]);

  const sec = async (tableId) => {
    if (busy) return;
    if ((order.table_id || null) === tableId) { onKapat?.(); return; }
    setBusy(tableId || "yok"); setHata(null);
    const { error } = await supabase.rpc("nip_masa_degistir", { p_order_id: order.id, p_table_id: tableId });
    setBusy(null);
    if (error) { setHata(hataYaz(error)); return; }
    const ad = tableId ? (masalar || []).find(t => t.id === tableId)?.name : null;
    onBitti?.(ad);
  };

  return (
    <Pencere baslik="Masa değiştir" alt="Hesap ve ürünleri yeni masaya geçer" onKapat={onKapat} z={130}>
      {masalar === null && <div style={{ fontSize: 13, color: C.muted }}>Masalar alınıyor…</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))", gap: 8 }}>
        {(masalar || []).map(t => (
          <button key={t.id} onClick={() => sec(t.id)} disabled={!!busy}
            style={{ ...cip(order.table_id === t.id), minHeight: 52, textAlign: "center", opacity: busy && busy !== t.id ? 0.5 : 1 }}>
            {busy === t.id ? "…" : t.name}
          </button>
        ))}
        <button onClick={() => sec(null)} disabled={!!busy}
          style={{ ...cip(!order.table_id), minHeight: 52, textAlign: "center" }}>
          {busy === "yok" ? "…" : "Masasız"}
        </button>
      </div>
      {hata && <div role="alert" style={{ color: C.down, fontSize: 13, marginTop: 10, lineHeight: 1.5 }}>{hata}</div>}
    </Pencere>
  );
}
