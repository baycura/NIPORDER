import { useEffect, useRef, useState } from "react";
import { personelHata } from "../../lib/errorText.js";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabase.js";
import { useAuth } from "../../contexts/AuthContext.jsx";
import { businessDayStart, businessDayKey, BUSINESS_HOURS } from "../../lib/businessDay.js";
import { DONER_STORE_ID, storeLabel } from "../../lib/stores.js";
import { guncelAy, hakedisRaporu } from "../../lib/hakedis.js";
import HakedisOzeti from "../../components/HakedisOzeti.jsx";
import Ikon from "../../components/Ikon.jsx";

const cv = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";
const hv = "'Bebas Neue','Barlow Condensed','Coolvetica Condensed',sans-serif";

/* Dark palette — matches the staff app shell (#0C0C0C body) */
const C = {
  card: "#161616", cardLine: "#262626", ink: "#F0EDE8", muted: "#8A8A86",
  faint: "#8A8A86", accent: "#FFFFFF", up: "#8A8580", down: "#C87A6A",
};

const fmtTL = (n) => "₺" + Number(n || 0).toLocaleString("tr-TR", { maximumFractionDigits: 0 });

const DEMO = typeof window !== "undefined" && window.location.search.includes("demo=1");
const demoData = () => ({
  today: 18450, yesterday: 14200, yesterdayFull: 21300, points: 640, activeOrders: 4, completed: 47, avgTicket: 392, kitchenToday: 3210,
  topProducts: [
    { name: "Flat White", qty: 21, rev: 3150 }, { name: "Croissant", qty: 17, rev: 2380 },
    { name: "Cold Brew", qty: 12, rev: 2160 }, { name: "NIP Tost", qty: 9, rev: 2025 },
    { name: "San Sebastian", qty: 7, rev: 1890 },
  ],
  hourly: BUSINESS_HOURS.map((h, i) => ({ hour: h, total: [0,320,780,1450,2100,1800,2450,1200,900,1500,1950,1400,880,640,1080,720,460,280,0][i] || 0 })),
  weekTotal: 96400,
  daily: Array.from({ length: 14 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - 13 + i);
    return { date: d, total: [8900,10200,7400,11200,13800,9600,12400,11200,9800,14500,12100,16400,13950,18450][i], kitchen: 0, orders: 30 };
  }),
});

export default function ReportsPage() {
  const { staffUser } = useAuth();
  const storeIds = staffUser?.store_ids || [];
  const [stores, setStores] = useState([]);
  const [selectedStore, setSelectedStore] = useState(null);
  const [data, setData] = useState({ today: 0, yesterday: 0, yesterdayFull: 0, points: 0, activeOrders: 0, completed: 0, avgTicket: 0, kitchenToday: 0, topProducts: [], hourly: [], weekTotal: 0, daily: [] });
  const [loading, setLoading] = useState(true);
  // Sorgu hatasi "₺0" diye gosterilmez. ilk: hic veri yok; sonra: eski veri ekranda.
  const [hata, setHata] = useState(null); // { metin, ilk }
  // Bu magaza icin en az bir basarili okuma oldu mu. State degil ref: 60 sn'lik
  // zamanlayici loadData'nin ESKI kopyasini cagirir, state'i goremez.
  const okundu = useRef(false);
  const istekNo = useRef(0); // magaza degisirken gec gelen eski yanit yazmasin
  const [updatedAt, setUpdatedAt] = useState(null);
  const timer = useRef(null);

  // Doner sekmesi: doner magazasinin KENDI siparisi yok, orders sorgusu hep
  // ₺0 verirdi ("gunun ozetinde doner kazanci bos"). Sekme artik NIP'in
  // mutfaga borcunu gosterir — ayni RPC, ayni bilesen (Mutfaga Odenecek).
  const mutfakBakisi = !!DONER_STORE_ID && selectedStore === DONER_STORE_ID;
  const [hkAy, setHkAy] = useState(guncelAy());
  const [hkTik, setHkTik] = useState(0);   // yenile dugmesi
  const [hk, setHk] = useState({ rapor: null, yukleniyor: true, hata: null, guncelleme: null });

  useEffect(() => {
    if (DEMO) { setData(demoData()); setLoading(false); setUpdatedAt(new Date()); return; }
    if (storeIds.length === 0) return;
    supabase.from("stores").select("id,name,slug").in("id", storeIds).then(r => {
      const list = r.data || [];
      setStores(list);
      if (list.length > 0 && !selectedStore) setSelectedStore(list[0].id);
    });
  }, [staffUser?.id]);

  // Load on store change + quiet auto-refresh every 60s so the number is always live.
  useEffect(() => {
    if (DEMO || !selectedStore || mutfakBakisi) return;
    okundu.current = false;
    setHata(null);
    loadData();
    timer.current = setInterval(() => loadData(true), 60_000);
    return () => clearInterval(timer.current);
  }, [selectedStore, mutfakBakisi]);

  useEffect(() => {
    if (DEMO || !mutfakBakisi) return undefined;
    let canli = true;
    setHk(h => ({ ...h, yukleniyor: true }));
    hakedisRaporu(supabase, hkAy).then(r => {
      if (!canli) return;
      setHk({ rapor: r.rapor, yukleniyor: false, hata: r.hata, guncelleme: r.rapor ? new Date() : null });
    });
    return () => { canli = false; };
  }, [mutfakBakisi, hkAy, hkTik]);

  async function loadData(silent) {
    if (!silent) setLoading(true);
    const no = ++istekNo.current;
    const now = new Date();
    // Isletme gunu 03:00'te biter — gece satislari onceki gune yazilir.
    const dayStart = (offset) => businessDayStart(now, offset);
    const todayStart = dayStart(0);
    // 14 gunluk pencereyi TEK sorguda cekiyoruz: gunun ozeti de, gunluk grafik de
    // ayni veriden hesaplaniyor — ucuncu bir sorgu ve tutarsizlik riski yok.
    const { data: rows, error } = await supabase
      .from("orders")
      .select("id,total,points_used,status,created_at,order_items(quantity,final_price,product_price,is_treat,product_id,products(name,kitchen_consignment))")
      .eq("origin_store_id", selectedStore)
      .gte("created_at", dayStart(13).toISOString());
    if (no !== istekNo.current) return;
    if (error) {
      // Daha once okunduysa eski rakamlar kalir; hic okunmadiysa rakam
      // gosterilmez (ilk okuma da, ardindan gelen tazeleme de basarisiz olabilir).
      setHata({ metin: personelHata(error), ilk: !okundu.current });
      setLoading(false);
      return;
    }
    okundu.current = true;
    setHata(null);

    const paid = ["paid", "completed", "served", "closed"];
    const acikDurum = ["open", "sent", "preparing", "ready"];
    const all = rows || [];
    const isPaid = (o) => paid.includes(o.status);
    // CIRO = TAHSIL EDILEN (sahip karari 11.11.2026): puanla odenen kisim
    // kasaya girmedi, dusulur ve ayri satirda gosterilir. "Bugün" ekrani
    // (TodayPage) ile AYNI kural; iki ekran ayni rakami verir.
    const net = (o) => Number(o.total || 0) - Number(o.points_used || 0);
    const dayKey = businessDayKey; // isletme gunu anahtari (03:00 siniri)
    // NIP Kitchen envanteri: ciroya girer ama bize kalmaz, ay sonu mutfaga odenir.
    // IKRAMLI konsinye kalem hesaba 0 yazilir ama mutfaga yine gercek degeri
    // (product_price) odenir — ikram bizim jestimiz, mutfagin kaybi degil.
    const kitchenOf = (o) => (o.order_items || [])
      .filter(oi => oi.products?.kitchen_consignment)
      .reduce((t, oi) => t + Number((oi.is_treat ? oi.product_price : oi.final_price) || 0) * Number(oi.quantity || 0), 0);

    const todayKey = dayKey(todayStart);
    const yesterdayKey = dayKey(dayStart(1));
    const todayOrders = all.filter(o => dayKey(o.created_at) === todayKey);
    const todayPaid = todayOrders.filter(isPaid);

    const todayTotal = todayPaid.reduce((s, o) => s + net(o), 0);
    const todayPoints = todayPaid.reduce((s, o) => s + Number(o.points_used || 0), 0);
    // Kiyas "dun BU SAATTE": gunun ortasinda dunun TAMAMIYLA kiyaslamak her
    // gun ogleden sonraya kadar "dusus" gosteriyordu.
    const dunKesim = dayStart(1).getTime() + (now.getTime() - todayStart.getTime());
    const dunFisler = all.filter(o => dayKey(o.created_at) === yesterdayKey && isPaid(o));
    const yesterdayFull = dunFisler.reduce((s, o) => s + net(o), 0);
    const yesterdayTotal = dunFisler.filter(o => new Date(o.created_at).getTime() < dunKesim)
      .reduce((s, o) => s + net(o), 0);
    const weekTotal = all.filter(o => isPaid(o) && new Date(o.created_at) >= dayStart(6))
      .reduce((s, o) => s + net(o), 0);
    // Aktif = hala ACIK hesap. Eskiden "odenmemis her sey" sayiliyordu;
    // iptal edilen hesap da aktif gorunuyordu.
    const active = todayOrders.filter(o => acikDurum.includes(o.status)).length;
    // Ortalama fis para alinan fislerden: ₺0 kapanan ikram hesabi ortalamayi dusurmesin.
    const paraliFis = todayPaid.filter(o => net(o) > 0.005).length;
    const kitchenToday = todayPaid.reduce((s, o) => s + kitchenOf(o), 0);

    // Top products: quantity AND revenue (final_price = discounts included).
    const pAgg = {};
    todayPaid.forEach(o => (o.order_items || []).forEach(oi => {
      const n = oi.products?.name || "Bilinmeyen";
      if (!pAgg[n]) pAgg[n] = { name: n, qty: 0, rev: 0 };
      pAgg[n].qty += oi.quantity || 0;
      pAgg[n].rev += (oi.quantity || 0) * Number(oi.final_price || 0);
    }));
    const topProducts = Object.values(pAgg).sort((a, b) => b.rev - a.rev).slice(0, 5);

    // Saat sirasi isletme gunu gibi: 08..23, sonra 00..02 (gece kuyrugu).
    const hourly = BUSINESS_HOURS.map(h => ({ hour: h, total: 0 }));
    todayPaid.forEach(o => {
      const slot = hourly.find(x => x.hour === new Date(o.created_at).getHours());
      if (slot) slot.total += net(o);
    });

    // Gunluk kazanc: satis olmayan gunler de bosluk olarak durmali, bu yuzden
    // 14 gunun hepsini onceden kuruyoruz.
    const daily = Array.from({ length: 14 }, (_, i) => {
      const d = dayStart(13 - i);
      return { key: dayKey(d), date: d, total: 0, kitchen: 0, orders: 0 };
    });
    const byKey = Object.fromEntries(daily.map(d => [d.key, d]));
    all.filter(isPaid).forEach(o => {
      const slot = byKey[dayKey(o.created_at)];
      if (!slot) return;
      slot.total += net(o);
      slot.kitchen += kitchenOf(o);
      slot.orders += 1;
    });

    setData({
      today: todayTotal, yesterday: yesterdayTotal, yesterdayFull, points: todayPoints, activeOrders: active,
      completed: todayPaid.length, avgTicket: paraliFis ? todayTotal / paraliFis : 0,
      kitchenToday, topProducts, hourly, weekTotal, daily,
    });
    setUpdatedAt(new Date());
    // Sessiz tazeleme de kapatir: araya giren tazeleme ilk okumanin yanitini
    // gecersiz kilarsa ekran "Yükleniyor"da kalmasin.
    setLoading(false);
  }

  const diff = data.yesterday > 0 ? ((data.today - data.yesterday) / data.yesterday * 100) : null;
  const maxHour = Math.max(...data.hourly.map(h => h.total), 1);
  const peak = data.hourly.reduce((best, h) => (h.total > best.total ? h : best), { hour: null, total: 0 });
  const maxDay = Math.max(...data.daily.map(d => d.total), 1);
  const maxRev = Math.max(...data.topProducts.map(p => p.rev), 1);

  const label = { fontSize: 11, color: C.muted, letterSpacing: 1.2, textTransform: "uppercase", fontWeight: 600 };
  const card = { background: C.card, border: `1px solid ${C.cardLine}`, borderRadius: 12, padding: 16 };

  return (
    <div style={{ fontFamily: cv, maxWidth: 900, margin: "0 auto", color: C.ink }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
        <h1 style={{ fontFamily: hv, fontWeight: 900, fontSize: 34, margin: 0, letterSpacing: 1 }}>Gün Özeti</h1>
        <div style={{ fontSize: 12, color: C.faint }}>
          {new Date().toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long" })}
          {updatedAt && <> · <span style={{ color: C.muted }}>{updatedAt.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}</span></>}
          <button onClick={() => (mutfakBakisi ? setHkTik(t => t + 1) : loadData())} title="Yenile" style={{ marginLeft: 8, background: "none", border: `1px solid ${C.cardLine}`, color: C.muted, borderRadius: 6, padding: "4px 8px", cursor: "pointer", display: "inline-flex" }}><Ikon ad="yenile" boy={13}/></button>
        </div>
      </div>

      {stores.length > 1 && (
        <div style={{ display: "flex", gap: 8, margin: "14px 0 0", flexWrap: "wrap" }}>
          {stores.map(s => (
            <button key={s.id} onClick={() => setSelectedStore(s.id)} style={{
              padding: "8px 16px", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 13,
              background: selectedStore === s.id ? C.accent : "transparent",
              color: selectedStore === s.id ? "#000" : C.muted,
              border: `1px solid ${selectedStore === s.id ? C.accent : C.cardLine}`,
            }}>
              {storeLabel(s.id) !== "—" ? storeLabel(s.id) : s.name}
            </button>
          ))}
        </div>
      )}

      {mutfakBakisi ? (
        <div style={{ marginTop: 14 }}>
          <HakedisOzeti
            rapor={hk.rapor} ay={hkAy} onAy={setHkAy} yukleniyor={hk.yukleniyor} hata={hk.hata}
            onYenile={() => setHkTik(t => t + 1)} taraf="nip" guncelleme={hk.guncelleme} kompakt
          />
          <Link to={"/settlement" + (hkAy !== guncelAy() ? "?ay=" + hkAy : "")} style={{
            ...card, marginTop: 10, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8,
            color: C.ink, textDecoration: "none", fontSize: 14, fontWeight: 700,
          }}>
            <span>Fiş dökümü ve WhatsApp mutabakat metni</span>
            <span style={{ color: C.muted, display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 400, fontSize: 13 }}>Mutfağa Ödenecek <Ikon ad="oksag" boy={14} /></span>
          </Link>
          <div style={{ fontSize: 11, color: C.faint, marginTop: 10, lineHeight: 1.6 }}>
            Gün Özeti işletme günüyle (03:00) sayar, hakediş takvim ayıyla; gece satışları iki ekranda farklı güne düşebilir.
            Bugünün mutfak payı Not in Paris sekmesindeki "Mutfak payı" kartında.
          </div>
        </div>
      ) : loading ? (
        <div style={{ padding: 60, textAlign: "center", color: C.muted }}>Yükleniyor…</div>
      ) : hata?.ilk ? (
        <div role="alert" style={{ ...card, marginTop: 14, borderColor: C.down }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Gün özeti okunamadı.</div>
          <div style={{ fontSize: 13, color: C.muted, marginTop: 4, lineHeight: 1.5 }}>{hata.metin}</div>
          <button onClick={() => loadData()} style={{
            marginTop: 12, minHeight: 44, padding: "0 16px", background: C.ink, color: "#000", border: "none",
            borderRadius: 10, fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
          }}>Tekrar dene</button>
        </div>
      ) : (
        <>
          {hata && (
            <div role="alert" style={{ ...card, marginTop: 14, padding: "10px 14px", borderColor: C.down, fontSize: 13, display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                Bilgi yenilenemedi. Ekrandaki rakamlar{updatedAt ? " " + updatedAt.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }) + " itibarıyla." : " eski olabilir."}
              </span>
              <button onClick={() => loadData(true)} style={{
                minHeight: 40, padding: "0 12px", flexShrink: 0, background: "transparent", color: C.ink,
                border: `1px solid ${C.cardLine}`, borderRadius: 9, fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
              }}>Yenile</button>
            </div>
          )}
          {/* Hero: the one number that matters (business day: 03:00–03:00) */}
          <div style={{ ...card, marginTop: 14, padding: "22px 20px", display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
            <div>
              <div style={label}>Bugün ciro · tahsil edilen</div>
              <div style={{ fontSize: 58, fontWeight: 900, fontFamily: hv, lineHeight: 1, marginTop: 6, color: C.ink }}>
                {fmtTL(data.today)}
              </div>
              {/* Puanla odenen kasaya girmedi: ciroda yok, ayri gorunur. */}
              {data.points > 0.5 && (
                <div style={{ fontSize: 12.5, color: C.muted, marginTop: 8 }}>
                  Puanla ödenen <span style={{ color: C.ink, fontWeight: 700 }}>{fmtTL(data.points)}</span> ayrı; ciroda yok.
                </div>
              )}
            </div>
            {/* Telefonda bu blok alt satira iner; sola hizali olunca rozet ile
                altindaki satir ayni hizada kalir. */}
            <div style={{ textAlign: "left" }}>
              {diff !== null && (
                <div style={{
                  display: "inline-block", padding: "6px 12px", borderRadius: 999, fontSize: 14, fontWeight: 700,
                  background: diff >= 0 ? "rgba(123,196,127,0.12)" : "rgba(224,102,102,0.12)",
                  color: diff >= 0 ? C.up : C.down,
                }}>
                  {diff >= 0 ? "▲" : "▼"} %{Math.abs(diff).toFixed(0)} dün bu saate göre
                </div>
              )}
              <div style={{ fontSize: 12, color: C.faint, marginTop: 6 }}>
                Dün bu saatte {fmtTL(data.yesterday)}{data.yesterdayFull > 0 ? ` · gün sonu ${fmtTL(data.yesterdayFull)}` : ""}
              </div>
            </div>
          </div>

          {/* Stat row — kitchen consignment split appears only when it exists */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8, margin: "10px 0 14px" }}>
            {[
              ["Açık hesap", data.activeOrders, data.activeOrders > 0 ? C.accent : C.ink],
              ["Kapanan fiş", data.completed, C.ink],
              ["Ortalama fiş", fmtTL(data.avgTicket), C.ink],
              ["Son 7 gün", fmtTL(data.weekTotal), C.ink],
              ...(data.kitchenToday > 0 ? [
                ["Mutfak payı", fmtTL(data.kitchenToday), C.muted],
                ["Bize kalan", fmtTL(data.today - data.kitchenToday), C.accent],
              ] : []),
            ].map(([l, v, col]) => (
              <div key={l} style={{ ...card, padding: 14 }}>
                <div style={label}>{l}</div>
                <div style={{ fontSize: 26, fontWeight: 800, marginTop: 4, color: col }}>{v}</div>
              </div>
            ))}
          </div>

          {/* Hourly sales, business-day order: 08..23 then 00..02 */}
          <div style={{ ...card, marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
              <div style={label}>Saatlik satış</div>
              {peak.hour !== null && peak.total > 0 && (
                <div style={{ fontSize: 12, color: C.muted }}>En yoğun <b style={{ color: C.accent }}>{peak.hour}:00</b> · {fmtTL(peak.total)}</div>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 130 }}>
              {data.hourly.map(h => (
                <div key={h.hour} style={{ flex: 1, textAlign: "center", display: "flex", flexDirection: "column", justifyContent: "flex-end", height: "100%" }}>
                  <div style={{
                    background: h.hour === peak.hour && h.total > 0 ? C.accent : h.total > 0 ? "#8A8580" : "#222",
                    height: `${Math.max((h.total / maxHour) * 100, 2)}%`,
                    borderRadius: "3px 3px 0 0",
                  }} title={`${h.hour}:00 — ${fmtTL(h.total)}`} />
                  <div style={{ fontSize: 10, color: h.hour % 2 === 0 ? C.muted : "transparent", marginTop: 5 }}>{h.hour}</div>
                </div>
              ))}
            </div>
          </div>

          {/* 14-day trend + top products side by side on wide screens */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 10 }}>
            <div style={card}>
              <div style={{ ...label, marginBottom: 14 }}>Son 14 gün</div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 110 }}>
                {data.daily.map((d, i) => {
                  const isToday = i === data.daily.length - 1;
                  return (
                    <div key={i} style={{ flex: 1, textAlign: "center", display: "flex", flexDirection: "column", justifyContent: "flex-end", height: "100%" }}>
                      {isToday && <div style={{ fontSize: 10, color: C.accent, marginBottom: 3, whiteSpace: "nowrap" }}>{fmtTL(d.total).replace("₺", "")}</div>}
                      <div style={{
                        background: isToday ? C.accent : d.total > 0 ? "#3a3a36" : "#222",
                        height: `${Math.max((d.total / maxDay) * 70, 3)}%`,
                        borderRadius: "3px 3px 0 0",
                      }} title={`${d.date.toLocaleDateString("tr-TR", { day: "numeric", month: "short" })} — ${fmtTL(d.total)} · ${d.orders} fiş${d.kitchen > 0 ? ` · mutfak ${fmtTL(d.kitchen)}` : ""}`} />
                      <div style={{ fontSize: 9, color: isToday ? C.accent : i % 2 === 0 ? C.muted : "transparent", marginTop: 5, fontWeight: isToday ? 700 : 400 }}>{d.date.getDate()}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={card}>
              <div style={{ ...label, marginBottom: 10 }}>En çok satan · bugün</div>
              {data.topProducts.length === 0 ? (
                <div style={{ color: C.faint, fontSize: 13, padding: 12 }}>Bugün henüz satış yok</div>
              ) : data.topProducts.map((p, i) => (
                <div key={p.name} style={{ position: "relative", padding: "9px 10px", marginBottom: 4, borderRadius: 6, overflow: "hidden" }}>
                  <div style={{ position: "absolute", inset: 0, width: `${(p.rev / maxRev) * 100}%`, background: "rgba(255,255,255,0.10)", borderRadius: 6 }} />
                  <div style={{ position: "relative", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      <b style={{ color: C.accent, marginRight: 8 }}>{i + 1}</b> {p.name}
                    </span>
                    <span style={{ fontSize: 13, color: C.muted, whiteSpace: "nowrap" }}>× {p.qty} · <b style={{ color: C.ink }}>{fmtTL(p.rev)}</b></span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
