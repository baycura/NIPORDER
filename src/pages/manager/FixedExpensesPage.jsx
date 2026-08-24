import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase.js";
import { useAuth } from "../../contexts/AuthContext.jsx";

const cv = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";

const CATEGORIES = [
  { key: "kira",     label: "Kira",          icon: "🏠" },
  { key: "personel", label: "Personel",      icon: "👥" },
  { key: "fatura",   label: "Fatura",        icon: "💡" },
  { key: "yazilim",  label: "Yazılım/Abonelik", icon: "💻" },
  { key: "vergi",    label: "Vergi/Muhasebe", icon: "🧾" },
  { key: "diger",    label: "Diğer",         icon: "📌" },
];
const catOf = (k) => CATEGORIES.find(c => c.key === k) || CATEGORIES[5];
const money = (n) => "₺" + Math.round(Number(n) || 0).toLocaleString("tr-TR");

export default function FixedExpensesPage() {
  const { staffUser } = useAuth();
  const [items, setItems] = useState([]);
  const [revenue, setRevenue] = useState(0);
  const [alim, setAlim] = useState(0);        // bu ayki tedarikci faturalari
  const [stores, setStores] = useState([]);
  const [storeId, setStoreId] = useState(null); // hangi dukkanin hesabina bakiyoruz
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);

  // Dukkanlar bir kez cekilir; basabas TEK dukkan icin hesaplanir.
  // Eskiden giderler Paris'in, ciro iki dukkanin toplamiydi — durum
  // oldugundan iyi gorunuyordu.
  useEffect(() => {
    const ids = staffUser?.store_ids || [];
    if (!ids.length) { setLoading(false); return; }
    supabase.from("stores").select("id, name, slug").in("id", ids).order("slug")
      .then(({ data }) => { setStores(data || []); setStoreId(data?.[0]?.id || ids[0]); });
  }, [staffUser?.id]);

  const load = async () => {
    if (!storeId) return;
    setLoading(true);
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthStartIso = monthStart.toISOString();
    const monthStartGun = monthStartIso.slice(0, 10);
    const [{ data, error }, { data: ords }, { data: faturalar }] = await Promise.all([
      supabase.from("fixed_expenses").select("*").eq("store_id", storeId)
        .order("category").order("amount", { ascending: false }),
      // Ciro tanimi Bugun ekraniyla ayni: puanla odenen kisim dusulur, cunku
      // o para kasaya girmez. Iki ekranin farkli rakam gostermesi bitiyor.
      supabase.from("orders").select("total, points_used")
        .eq("origin_store_id", storeId).eq("status", "paid").gte("created_at", monthStartIso),
      supabase.from("supplier_invoices").select("total_amount")
        .eq("store_id", storeId).gte("invoice_date", monthStartGun),
    ]);
    if (error) console.error(error);
    setItems(data || []);
    setRevenue((ords || []).reduce((s, o) => s + Number(o.total || 0) - Number(o.points_used || 0), 0));
    setAlim((faturalar || []).reduce((s, f) => s + Number(f.total_amount || 0), 0));
    setLoading(false);
  };
  useEffect(() => { load(); }, [storeId]);

  const openNew = () => { setModal({ mode: "new" }); setForm({ name: "", category: "kira", amount: "", day_of_month: "", notes: "", is_active: true }); };
  const openEdit = (i) => { setModal({ mode: "edit", data: i }); setForm({ name: i.name, category: i.category, amount: i.amount, day_of_month: i.day_of_month ?? "", notes: i.notes || "", is_active: i.is_active !== false }); };

  const save = async () => {
    if (busy) return;
    if (!form.name?.trim()) { alert("Gider adı gerekli"); return; }
    setBusy(true);
    const payload = {
      name: form.name.trim(),
      category: form.category || "diger",
      amount: Number(form.amount) || 0,
      day_of_month: form.day_of_month === "" ? null : Math.min(31, Math.max(1, Number(form.day_of_month) || 1)),
      notes: form.notes?.trim() || null,
      is_active: form.is_active !== false,
      store_id: storeId,
      updated_at: new Date().toISOString(),
    };
    const { error } = modal.mode === "new"
      ? await supabase.from("fixed_expenses").insert(payload)
      : await supabase.from("fixed_expenses").update(payload).eq("id", modal.data.id);
    setBusy(false);
    if (error) { alert("Hata: " + error.message); return; }
    setModal(null); load();
  };

  const del = async (i) => {
    if (!confirm('"' + i.name + '" silinsin mi?')) return;
    const { error } = await supabase.from("fixed_expenses").delete().eq("id", i.id);
    if (error) { alert("Hata: " + error.message); return; }
    load();
  };

  const toggle = async (i) => {
    await supabase.from("fixed_expenses").update({ is_active: !i.is_active }).eq("id", i.id);
    load();
  };

  if (loading) return (<div style={{ color: "#888", fontFamily: cv, padding: 20 }}>Yukleniyor...</div>);

  const active = items.filter(i => i.is_active !== false);
  const monthly = active.reduce((s, i) => s + Number(i.amount || 0), 0);
  const daily = monthly / 30;
  // Gercek basabas sabit giderden ibaret degil: bu ay girilen tedarikci
  // faturalari da odenmis paradir. Eskiden yalniz sabit giderler sayiliyordu.
  const toplamGider = monthly + alim;
  const covered = toplamGider > 0 ? Math.min(100, Math.round((revenue / toplamGider) * 100)) : 0;
  const byCat = CATEGORIES.map(c => ({ ...c, total: active.filter(i => i.category === c.key).reduce((s, i) => s + Number(i.amount || 0), 0) })).filter(c => c.total > 0);

  return (
    <div style={{ fontFamily: cv, color: "#F0EDE8" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <div style={{ fontSize: 24, fontWeight: 800 }}>Sabit Giderler</div>
        <span style={{ fontSize: 9, padding: "3px 8px", background: "#161616", color: "#8A8580", borderRadius: 6, fontWeight: 800, letterSpacing: "1px" }}>🔒 SADECE SAHİP</span>
      </div>
      <div style={{ fontSize: 11, color: "#888", letterSpacing: "1px", marginBottom: 14 }}>
        {active.length} AKTİF GİDER · BU EKRANI PERSONEL GÖREMEZ
      </div>

      {stores.length > 1 && (
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          {stores.map(s => (
            <button key={s.id} onClick={() => setStoreId(s.id)}
              style={{ padding: "8px 14px", background: storeId === s.id ? "#FFFFFF" : "#1A1A1A", color: storeId === s.id ? "#000" : "#888",
                       border: "1px solid " + (storeId === s.id ? "#FFFFFF" : "#2A2A2A"), borderRadius: 9, fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
              {s.slug === "doner" ? "🥙 " : "🗼 "}{s.name}
            </button>
          ))}
        </div>
      )}

      <div style={{ background: "#161616", border: "1px solid #FFFFFF", borderRadius: 12, padding: 16, marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontSize: 10, color: "#8A8580", letterSpacing: "1.5px", fontWeight: 700 }}>SABİT · AYLIK</div>
            <div style={{ fontSize: 26, fontWeight: 800, marginTop: 2 }}>{money(monthly)}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: "#8A8580", letterSpacing: "1.5px", fontWeight: 700 }}>MAL ALIMI · BU AY</div>
            <div style={{ fontSize: 26, fontWeight: 800, marginTop: 2 }}>{money(alim)}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: "#8A8580", letterSpacing: "1.5px", fontWeight: 700 }}>GÜNLÜK BAŞABAŞ</div>
            <div style={{ fontSize: 26, fontWeight: 800, marginTop: 2 }}>{money(daily)}</div>
          </div>
        </div>
        {toplamGider > 0 && (
          <div style={{ marginTop: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#bbb", marginBottom: 5, flexWrap: "wrap", gap: 6 }}>
              <span>Bu ay ciro: <b style={{ color: "#F0EDE8" }}>{money(revenue)}</b> · gider: <b style={{ color: "#F0EDE8" }}>{money(toplamGider)}</b></span>
              <span style={{ color: covered >= 100 ? "#FFFFFF" : "#8A8580", fontWeight: 700 }}>
                {covered >= 100 ? "✓ Giderler karşılandı" : "Giderlerin %" + covered + "'i karşılandı"}
              </span>
            </div>
            <div style={{ height: 8, background: "#2A2A2A", borderRadius: 4, overflow: "hidden" }}>
              <div style={{ width: covered + "%", height: "100%", background: covered >= 100 ? "#FFFFFF" : "#8A8580" }} />
            </div>
            {covered < 100 && (
              <div style={{ fontSize: 11, color: "#888", marginTop: 6 }}>
                Kalan: <b style={{ color: "#FFFFFF" }}>{money(toplamGider - revenue)}</b> — sabit giderler + bu ay girilen tedarikçi faturaları. Ciro, puanla ödenen kısım düşülerek hesaplanır.
              </div>
            )}
          </div>
        )}
      </div>

      {byCat.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
          {byCat.map(c => (
            <div key={c.key} style={{ background: "#1A1A1A", border: "1px solid #2A2A2A", borderRadius: 10, padding: "8px 12px", fontSize: 12 }}>
              <span style={{ marginRight: 6 }}>{c.icon}</span>
              <span style={{ color: "#888" }}>{c.label}</span>
              <b style={{ color: "#FFFFFF", marginLeft: 8 }}>{money(c.total)}</b>
            </div>
          ))}
        </div>
      )}

      <button onClick={openNew} style={{ padding: "10px 16px", background: "#FFFFFF", color: "#000", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 800, cursor: "pointer", marginBottom: 14 }}>+ Yeni Gider</button>

      {items.length === 0 && <div style={{ textAlign: "center", padding: 40, color: "#666", fontSize: 13 }}>Henüz gider yok. Kira, maaşlar, elektrik, internet... ekleyin.</div>}

      {items.map(i => {
        const c = catOf(i.category);
        const off = i.is_active === false;
        return (
          <div key={i.id} style={{ background: "#1A1A1A", border: "1px solid #2A2A2A", borderRadius: 10, padding: 12, marginBottom: 8, opacity: off ? 0.5 : 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>
                  {c.icon} {i.name}
                  {off && <span style={{ marginLeft: 6, fontSize: 9, padding: "2px 6px", background: "#333", color: "#999", borderRadius: 6, fontWeight: 700 }}>PASİF</span>}
                </div>
                <div style={{ fontSize: 11, color: "#888", marginTop: 3 }}>
                  {c.label}{i.day_of_month ? " · her ayın " + i.day_of_month + "'i" : ""}{i.notes ? " · " + i.notes : ""}
                </div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: "#FFFFFF" }}>{money(i.amount)}</div>
                <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
                  <button onClick={() => toggle(i)} style={{ padding: "5px 9px", background: "#222", color: "#aaa", border: "1px solid #333", borderRadius: 6, fontSize: 10, cursor: "pointer" }}>{off ? "Aç" : "Kapat"}</button>
                  <button onClick={() => openEdit(i)} style={{ padding: "5px 9px", background: "#222", color: "#aaa", border: "1px solid #333", borderRadius: 6, fontSize: 10, cursor: "pointer" }}>Düzenle</button>
                  <button onClick={() => del(i)} style={{ padding: "5px 9px", background: "transparent", color: "#C87A6A", border: "1px solid #2A2A2A", borderRadius: 6, fontSize: 10, cursor: "pointer" }}>Sil</button>
                </div>
              </div>
            </div>
          </div>
        );
      })}

      {modal && (
        <Modal onClose={() => setModal(null)} title={modal.mode === "new" ? "Yeni Sabit Gider" : "Gideri Düzenle"}>
          <Field label="GİDER ADI"><input value={form.name || ""} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="örn: Dükkan kirası, Mustafa maaş, Elektrik" style={inputS} /></Field>
          <Field label="KATEGORİ">
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {CATEGORIES.map(c => (
                <button key={c.key} onClick={() => setForm({ ...form, category: c.key })} style={{ padding: "8px 12px", background: form.category === c.key ? "#FFFFFF" : "#222", color: form.category === c.key ? "#000" : "#888", border: "1px solid " + (form.category === c.key ? "#FFFFFF" : "#333"), borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{c.icon} {c.label}</button>
              ))}
            </div>
          </Field>
          <Field label="AYLIK TUTAR (₺)"><input type="number" step="0.01" value={form.amount ?? ""} onChange={e => setForm({ ...form, amount: e.target.value })} style={inputS} /></Field>
          <Field label="ÖDEME GÜNÜ (opsiyonel, 1-31)"><input type="number" min="1" max="31" value={form.day_of_month ?? ""} onChange={e => setForm({ ...form, day_of_month: e.target.value })} placeholder="örn: 5" style={inputS} /></Field>
          <Field label="NOT (opsiyonel)"><input value={form.notes || ""} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="örn: kontrat Mart'ta yenilenecek" style={inputS} /></Field>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button onClick={() => setModal(null)} style={cancelBtn}>İptal</button>
            <button onClick={save} disabled={busy} style={{ ...saveBtn, opacity: busy ? 0.6 : 1 }}>{busy ? "..." : "Kaydet"}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

const inputS = { width: "100%", padding: "10px 12px", background: "#0C0C0C", border: "1px solid #2A2A2A", borderRadius: 8, color: "#F0EDE8", fontSize: 14, outline: "none", fontFamily: "inherit" };
const cancelBtn = { flex: 1, padding: "12px", background: "transparent", color: "#888", border: "1px solid #333", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: "pointer" };
const saveBtn = { flex: 2, padding: "12px", background: "#FFFFFF", color: "#000", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 800, cursor: "pointer" };

function Field({ label, children }) {
  return (<div style={{ marginBottom: 12 }}>
    <div style={{ fontSize: 10, color: "#888", letterSpacing: "1.5px", fontWeight: 700, marginBottom: 5 }}>{label}</div>
    {children}
  </div>);
}

function Modal({ title, children, onClose }) {
  return (<div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 100 }}>
    <div onClick={e => e.stopPropagation()} style={{ background: "#161616", border: "1px solid #2A2A2A", borderRadius: "16px 16px 0 0", padding: 20, width: "100%", maxWidth: 500, maxHeight: "90vh", overflowY: "auto" }}>
      <div style={{ fontSize: 18, fontWeight: 800, color: "#F0EDE8", marginBottom: 16 }}>{title}</div>
      {children}
    </div>
  </div>);
}
