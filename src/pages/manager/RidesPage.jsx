import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase.js";
import { useAuth } from "../../contexts/AuthContext.jsx";
import Ikon from "../../components/Ikon.jsx";

const cv = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";
const hv = "'Bebas Neue','Barlow Condensed','Coolvetica Condensed',sans-serif";

const C = {
  card: "#161616", line: "#2A2A2A", ink: "#F0EDE8", muted: "#8A8A86",
  faint: "#666666", accent: "#FFFFFF", down: "#C87A6A", up: "#7FA88A",
};

const CLUB_ID = "1100024";
const bosForm = {
  title: "", ride_date: "", ride_time: "09:00", meet_point: "NOT IN PARIS",
  pace: "", distance_km: "", elevation_m: "", capacity: 6,
  route_url: "", notes: "", strava_event_id: "", status: "open",
};

// Surusler — kulup surusleri buradan yonetilir.
//
// Bu ekran olmadan sürüş girmenin YOLU YOKTU: ride_posts tablosuna hicbir
// uygulama yazmiyordu (NIPWEB Shopify temasi ve NOTINPARIS rezervasyon
// sayfasi tablonun adini bile gecirmiyor). Kayitlar veritabanina elle
// yaziliyordu; bu yuzden Strava'da acilan suruslerin cogu QR menude hic
// gorunmedi.
//
// Musteri menusundeki "Surus" sekmesi buradan beslenir.
export default function RidesPage() {
  const { staffUser } = useAuth();
  const [liste, setListe] = useState(null);
  const [hata, setHata] = useState(null);
  const [form, setForm] = useState(bosForm);
  const [duzenlenen, setDuzenlenen] = useState(null);
  const [busy, setBusy] = useState(false);
  const [gecmisAcik, setGecmisAcik] = useState(false);

  const yukle = () => {
    setHata(null);
    supabase.from("ride_posts").select("*").order("ride_date", { ascending: false })
      .then(({ data, error }) => {
        if (error) { setHata(error.message); setListe([]); return; }
        setListe(data || []);
      });
  };
  useEffect(yukle, []);

  const bugun = new Date().toISOString().slice(0, 10);
  const { yaklasan, gecmis } = useMemo(() => {
    const l = liste || [];
    return {
      yaklasan: l.filter(r => r.ride_date >= bugun).sort((a, b) => a.ride_date.localeCompare(b.ride_date)),
      gecmis: l.filter(r => r.ride_date < bugun),
    };
  }, [liste, bugun]);

  const duzenle = (r) => {
    setDuzenlenen(r.id);
    setForm({
      title: r.title || "", ride_date: r.ride_date || "", ride_time: r.ride_time || "",
      meet_point: r.meet_point || "", pace: r.pace || "",
      distance_km: r.distance_km ?? "", elevation_m: r.elevation_m ?? "",
      capacity: r.capacity ?? 6, route_url: r.route_url || "", notes: r.notes || "",
      strava_event_id: r.strava_event_id || "", status: r.status || "open",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const vazgec = () => { setDuzenlenen(null); setForm(bosForm); };

  const kaydet = async () => {
    if (busy) return;
    if (!form.title.trim()) { alert("Başlık gerekli"); return; }
    if (!form.ride_date) { alert("Tarih gerekli"); return; }
    setBusy(true);

    // Strava etkinlik id'si girildiyse rota linkini kendimiz kuralim —
    // "Katıl" dogrudan Strava'ya gitsin diye musteri menusu bunu kullaniyor.
    const sid = form.strava_event_id.trim();
    const payload = {
      title: form.title.trim(),
      ride_date: form.ride_date,
      ride_time: form.ride_time.trim() || null,
      meet_point: form.meet_point.trim() || null,
      pace: form.pace.trim() || null,
      distance_km: form.distance_km === "" ? null : Number(form.distance_km),
      elevation_m: form.elevation_m === "" ? null : Number(form.elevation_m),
      capacity: Number(form.capacity) || 6,
      notes: form.notes.trim() || null,
      strava_event_id: sid || null,
      status: form.status,
      route_url: form.route_url.trim()
        || (sid ? `https://www.strava.com/clubs/${CLUB_ID}/group_events/${sid}` : null),
      store_id: staffUser?.store_ids?.[0] || null,
    };
    if (!duzenlenen) payload.created_by = staffUser?.id || null;

    const { error } = duzenlenen
      ? await supabase.from("ride_posts").update(payload).eq("id", duzenlenen)
      : await supabase.from("ride_posts").insert(payload);
    setBusy(false);
    if (error) {
      alert(/duplicate|unique/i.test(error.message)
        ? "Bu Strava etkinliği zaten kayıtlı."
        : "Kaydedilemedi: " + error.message);
      return;
    }
    vazgec(); yukle();
  };

  const sil = async (r) => {
    if (!confirm(`"${r.title}" silinsin mi?`)) return;
    const { error } = await supabase.from("ride_posts").delete().eq("id", r.id);
    if (error) { alert("Silinemedi: " + error.message); return; }
    yukle();
  };

  const durumDegistir = async (r, yeni) => {
    const { error } = await supabase.from("ride_posts").update({ status: yeni }).eq("id", r.id);
    if (error) { alert("Güncellenemedi: " + error.message); return; }
    setListe(l => (l || []).map(x => x.id === r.id ? { ...x, status: yeni } : x));
  };

  const kart = { background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: 14 };
  const etiket = { fontSize: 12, color: C.muted, letterSpacing: "0.2px", fontWeight: 600, marginBottom: 5 };
  const inputS = {
    width: "100%", minHeight: 44, padding: "10px 12px", background: "#0C0C0C",
    border: `1px solid ${C.line}`, borderRadius: 10, color: C.ink, fontSize: 16,
    outline: "none", fontFamily: cv, boxSizing: "border-box",
  };

  const satir = (r, gecmisMi) => (
    <div key={r.id} style={{
      ...kart, marginBottom: 8, opacity: gecmisMi || r.status === "cancelled" ? 0.55 : 1,
      borderColor: duzenlenen === r.id ? C.accent : C.line,
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 800, display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
            <span style={{ textDecoration: r.status === "cancelled" ? "line-through" : "none" }}>{r.title}</span>
            {r.strava_event_id && (
              <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 6px", borderRadius: 5,
                             background: "#222", color: C.muted, letterSpacing: "0.3px" }}>STRAVA</span>
            )}
            {r.status === "cancelled" && (
              <span style={{ fontSize: 10, fontWeight: 800, color: C.down }}>İPTAL</span>
            )}
          </div>
          <div style={{ fontSize: 13, color: C.muted, marginTop: 3, fontVariantNumeric: "tabular-nums" }}>
            {new Date(r.ride_date + "T12:00").toLocaleDateString("tr-TR",
              { weekday: "long", day: "numeric", month: "long" })}
            {r.ride_time && ` · ${r.ride_time}`}
            {r.meet_point && ` · ${r.meet_point}`}
          </div>
          {(r.distance_km || r.elevation_m || r.pace) && (
            <div style={{ fontSize: 12, color: C.faint, marginTop: 2 }}>
              {[r.distance_km && `${r.distance_km} km`, r.elevation_m && `${r.elevation_m} m`,
                r.pace && `${r.pace} km/s`].filter(Boolean).join(" · ")}
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          <button onClick={() => duzenle(r)} title="Düzenle" style={{
            minHeight: 38, padding: "8px 10px", background: "none", border: `1px solid ${C.line}`,
            color: C.muted, borderRadius: 9, cursor: "pointer", display: "flex", alignItems: "center",
          }}><Ikon ad="kalem" boy={14} /></button>
          <button onClick={() => sil(r)} title="Sil" style={{
            minHeight: 38, padding: "8px 10px", background: "none", border: `1px solid ${C.line}`,
            color: C.faint, borderRadius: 9, cursor: "pointer", display: "flex", alignItems: "center",
          }}><Ikon ad="cop" boy={14} /></button>
        </div>
      </div>
      {!gecmisMi && (
        <div style={{ display: "flex", gap: 7, marginTop: 10 }}>
          {[["open", "Açık"], ["full", "Doldu"], ["cancelled", "İptal"]].map(([k, l]) => (
            <button key={k} onClick={() => durumDegistir(r, k)} style={{
              minHeight: 34, padding: "6px 12px", borderRadius: 8, cursor: "pointer", fontFamily: cv,
              fontSize: 12, fontWeight: 700,
              background: r.status === k ? C.accent : "transparent",
              color: r.status === k ? "#000" : C.muted,
              border: `1px solid ${r.status === k ? C.accent : C.line}`,
            }}>{l}</button>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div style={{ fontFamily: cv, color: C.ink, maxWidth: 720, margin: "0 auto", paddingBottom: 50 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontSize: 24, fontWeight: 800 }}>Sürüşler</div>
        <button onClick={yukle} title="Yenile" style={{
          minHeight: 40, padding: "8px 12px", background: "none", border: `1px solid ${C.line}`,
          color: C.muted, borderRadius: 9, cursor: "pointer", display: "inline-flex",
          alignItems: "center", gap: 6, fontFamily: cv, fontSize: 12, fontWeight: 700,
        }}><Ikon ad="yenile" boy={13} />Yenile</button>
      </div>
      <div style={{ fontSize: 13, color: C.muted, margin: "6px 0 14px", lineHeight: 1.6, maxWidth: "58ch" }}>
        Buraya girdiğin sürüşler müşteri menüsündeki <b style={{ color: C.ink }}>Sürüş</b> sekmesinde
        görünür. Strava etkinlik numarasını yazarsan "Katıl" doğrudan Strava'ya gider.
      </div>

      {hata && (
        <div style={{ ...kart, borderColor: C.down, color: C.down, fontSize: 13, marginBottom: 10 }}>
          <Ikon ad="uyari" boy={15} style={{ marginRight: 6 }} />{hata}
        </div>
      )}

      {/* Form */}
      <div style={{ ...kart, marginBottom: 16, borderColor: duzenlenen ? C.accent : C.line }}>
        <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 12 }}>
          {duzenlenen ? "Sürüşü düzenle" : "Yeni sürüş"}
        </div>

        <div style={etiket}>BAŞLIK</div>
        <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
               placeholder="Easy Coffee Ride" style={{ ...inputS, marginBottom: 11 }} />

        <div style={{ display: "flex", gap: 9, marginBottom: 11 }}>
          <div style={{ flex: 1.2 }}>
            <div style={etiket}>TARİH</div>
            <input type="date" value={form.ride_date}
                   onChange={e => setForm({ ...form, ride_date: e.target.value })} style={inputS} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={etiket}>SAAT</div>
            <input type="time" value={form.ride_time}
                   onChange={e => setForm({ ...form, ride_time: e.target.value })} style={inputS} />
          </div>
        </div>

        <div style={etiket}>BULUŞMA</div>
        <input value={form.meet_point} onChange={e => setForm({ ...form, meet_point: e.target.value })}
               placeholder="NOT IN PARIS" style={{ ...inputS, marginBottom: 11 }} />

        <div style={{ display: "flex", gap: 9, marginBottom: 11 }}>
          {[["distance_km", "MESAFE (km)"], ["elevation_m", "TIRMANIŞ (m)"], ["pace", "TEMPO (km/s)"]].map(([k, l]) => (
            <div key={k} style={{ flex: 1 }}>
              <div style={etiket}>{l}</div>
              <input type={k === "pace" ? "text" : "number"} inputMode="decimal" value={form[k]}
                     onChange={e => setForm({ ...form, [k]: e.target.value })} style={inputS} />
            </div>
          ))}
        </div>

        <div style={etiket}>STRAVA ETKİNLİK NUMARASI <span style={{ color: C.faint, fontWeight: 400 }}>— opsiyonel</span></div>
        <input value={form.strava_event_id}
               onChange={e => setForm({ ...form, strava_event_id: e.target.value })}
               placeholder="3529462624075386286" style={{ ...inputS, marginBottom: 4 }} />
        <div style={{ fontSize: 12, color: C.faint, marginBottom: 11, lineHeight: 1.5 }}>
          Strava'daki etkinlik adresinin sonundaki uzun sayı. Yazarsan "Katıl" düğmesi
          doğrudan Strava etkinliğine gider, kayıt orada alınır.
        </div>

        <div style={etiket}>NOT</div>
        <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
                  rows={2} placeholder="Kahve molası var, ışık getirin…"
                  style={{ ...inputS, resize: "vertical", minHeight: 60, marginBottom: 12 }} />

        <div style={{ display: "flex", gap: 8 }}>
          {duzenlenen && (
            <button onClick={vazgec} style={{
              flex: 1, minHeight: 48, background: "transparent", color: C.muted,
              border: `1px solid ${C.line}`, borderRadius: 11, fontSize: 14, fontWeight: 700,
              cursor: "pointer", fontFamily: cv,
            }}>Vazgeç</button>
          )}
          <button onClick={kaydet} disabled={busy} style={{
            flex: 2, minHeight: 48, background: C.accent, color: "#000", border: "none",
            borderRadius: 11, fontSize: 15, fontWeight: 800, cursor: "pointer", fontFamily: cv,
            opacity: busy ? 0.6 : 1,
          }}>{busy ? "Kaydediliyor…" : duzenlenen ? "Güncelle" : "Sürüşü ekle"}</button>
        </div>
      </div>

      {liste === null && <div style={{ ...kart, color: C.muted, fontSize: 13 }}>Yükleniyor…</div>}

      {liste && (<>
        <div style={{ ...etiket, marginBottom: 8 }}>
          YAKLAŞAN {yaklasan.length > 0 && `(${yaklasan.length})`}
        </div>
        {yaklasan.length === 0 && (
          <div style={{ ...kart, textAlign: "center", padding: 26, marginBottom: 14 }}>
            <Ikon ad="surus" boy={34} kalin={1.3} style={{ display: "block", margin: "0 auto 10px", color: C.faint }} />
            <div style={{ fontSize: 14, fontWeight: 700 }}>Yaklaşan sürüş yok</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>
              Müşteri menüsündeki Sürüş sekmesi şu an boş görünüyor.
            </div>
          </div>
        )}
        {yaklasan.map(r => satir(r, false))}

        {gecmis.length > 0 && (
          <div style={{ marginTop: 18 }}>
            <button onClick={() => setGecmisAcik(v => !v)} style={{
              background: "none", border: "none", color: C.muted, cursor: "pointer",
              fontFamily: cv, fontSize: 12, fontWeight: 700, letterSpacing: "0.2px",
              padding: "6px 0", display: "flex", alignItems: "center", gap: 6,
            }}>
              <Ikon ad={gecmisAcik ? "yukari" : "asagi"} boy={13} />
              GEÇMİŞ ({gecmis.length})
            </button>
            {gecmisAcik && <div style={{ marginTop: 8 }}>{gecmis.map(r => satir(r, true))}</div>}
          </div>
        )}
      </>)}
    </div>
  );
}
