import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase.js";
import { useAuth } from "../../contexts/AuthContext.jsx";
import Ikon from "../../components/Ikon.jsx";

const cv = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";
const hv = "'Bebas Neue','Barlow Condensed','Coolvetica Condensed',sans-serif";
const C = {
  card: "#161616", cardLine: "#262626", ink: "#F0EDE8", muted: "#8A8A86",
  faint: "#5A5A56", accent: "#FFFFFF", green: "#FFFFFF", red: "#C87A6A",
};

const CATS = [
  { key: "gida", label: "Gıda", emoji: "yaprak" },
  { key: "icecek", label: "İçecek", emoji: "bardak" },
  { key: "alkol", label: "Alkol", emoji: "bira" },
  { key: "kahve", label: "Kahve & Çay", emoji: "kahve" },
  { key: "temizlik", label: "Temizlik", emoji: "temizlik" },
  { key: "ekipman", label: "Ekipman", emoji: "alet" },
  { key: "diger", label: "Diğer", emoji: "stok" },
];
const catOf = (k) => CATS.find(c => c.key === k) || CATS[CATS.length - 1];

const fmtTL = (n) => "₺" + Number(n || 0).toLocaleString("tr-TR", { maximumFractionDigits: 2 });
const isoDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const DEMO = typeof window !== "undefined" && window.location.search.includes("demo=1");
const demoRows = () => {
  const t = new Date(), y = new Date(); y.setDate(y.getDate() - 1);
  return [
    { id: "1", category: "gida", description: "Hal — domates, salatalık, limon", amount: 1840, payment_method: "kasa", expense_date: isoDate(t), staff: { name: "Burcu" } },
    { id: "2", category: "kahve", description: "Süt (12 lt)", amount: 720, payment_method: "kasa", expense_date: isoDate(t), staff: { name: "Ceren Baycura" } },
    { id: "3", category: "temizlik", description: "Bulaşık deterjanı + peçete", amount: 460, payment_method: "kart", expense_date: isoDate(t), staff: { name: "Burcu" } },
    { id: "4", category: "alkol", description: "Efes kasa ×2", amount: 2980, payment_method: "kasa", expense_date: isoDate(y), staff: { name: "Fatih Can Turgut" } },
    { id: "5", category: "diger", description: "Çiçek — giriş masası", amount: 350, payment_method: "kasa", expense_date: isoDate(y), staff: { name: "Ceren Baycura" } },
  ];
};

export default function ExpensesPage() {
  const { staffUser, isManager, isAdmin, isViewer } = useAuth();
  const canDelete = isManager || isAdmin;
  const storeIds = staffUser?.store_ids || [];
  const [stores, setStores] = useState([]);
  const [storeId, setStoreId] = useState(null);
  const [period, setPeriod] = useState("today"); // today | week | month
  const [cat, setCat] = useState("all");
  const [mine, setMine] = useState(false);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sheet, setSheet] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ category: "gida", amount: "", description: "", payment_method: "kasa" });

  const range = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (period === "week") start.setDate(start.getDate() - start.getDay() + (start.getDay() === 0 ? -6 : 1)); // pazartesi
    if (period === "month") start.setDate(1);
    return { from: isoDate(start), to: isoDate(now) };
  }, [period]);

  useEffect(() => {
    if (DEMO) { setStores([{ id: "s1", name: "Paris", slug: "paris" }]); setStoreId("s1"); return; }
    if (!storeIds.length) return;
    supabase.from("stores").select("id,name,slug").in("id", storeIds).then(r => {
      const list = r.data || [];
      setStores(list);
      if (list.length && !storeId) setStoreId(list[0].id);
    });
  }, [staffUser?.id]);

  useEffect(() => { if (DEMO) { setRows(demoRows()); setLoading(false); return; } if (storeId) load(); }, [storeId, range.from, range.to]);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("expenses")
      .select("id,category,description,amount,payment_method,expense_date,staff_id,staff(name)")
      .eq("store_id", storeId)
      .gte("expense_date", range.from)
      .lte("expense_date", range.to)
      .order("expense_date", { ascending: false })
      .order("created_at", { ascending: false });
    setRows(data || []);
    setLoading(false);
  }

  const filtered = rows
    .filter(r => cat === "all" || (r.category || "diger") === cat)
    .filter(r => !mine || r.staff_id === staffUser?.id);
  const total = filtered.reduce((s, r) => s + Number(r.amount || 0), 0);

  const byDay = useMemo(() => {
    const g = {};
    filtered.forEach(r => { (g[r.expense_date] = g[r.expense_date] || []).push(r); });
    return Object.entries(g).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filtered]);

  async function save() {
    const amount = parseFloat(String(form.amount).replace(",", "."));
    if (!amount || amount <= 0) { alert("Tutar girmelisin"); return; }
    if (!form.description.trim()) { alert("Ne alındığını yaz (örn. Hal — sebze)"); return; }
    setSaving(true);
    if (DEMO) {
      setRows(r => [{ id: String(Math.random()), ...form, amount, expense_date: range.to, staff: { name: staffUser?.name || "Ben" }, staff_id: staffUser?.id }, ...r]);
      setSaving(false); setSheet(false); setForm({ category: "gida", amount: "", description: "", payment_method: "kasa" });
      return;
    }
    const { error } = await supabase.from("expenses").insert({
      store_id: storeId, staff_id: staffUser.id, category: form.category,
      description: form.description.trim(), amount, payment_method: form.payment_method,
      expense_date: isoDate(new Date()),
    });
    setSaving(false);
    if (error) { alert("Kaydedilemedi: " + error.message); return; }
    setSheet(false);
    setForm({ category: "gida", amount: "", description: "", payment_method: "kasa" });
    load();
  }

  async function remove(r) {
    if (!window.confirm(`Silinsin mi? ${r.description} — ${fmtTL(r.amount)}`)) return;
    if (DEMO) { setRows(x => x.filter(i => i.id !== r.id)); return; }
    const { error } = await supabase.from("expenses").delete().eq("id", r.id);
    if (error) { alert(error.message); return; }
    load();
  }

  const chip = (active) => ({
    padding: "8px 14px", borderRadius: 999, cursor: "pointer", fontWeight: 700, fontSize: 13,
    background: active ? C.accent : "transparent", color: active ? "#000" : C.muted,
    border: `1px solid ${active ? C.accent : C.cardLine}`, whiteSpace: "nowrap",
  });

  return (
    <div style={{ padding: 16, fontFamily: cv, maxWidth: 700, margin: "0 auto", paddingBottom: 120, color: C.ink }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <h1 style={{ fontFamily: hv, fontWeight: 900, fontSize: 34, margin: 0, letterSpacing: 1 }}>Giderler</h1>
        <div style={{ display: "flex", border: `1px solid ${C.cardLine}`, borderRadius: 999, overflow: "hidden" }}>
          {[["Tümü", false], ["Benim", true]].map(([l, v]) => (
            <button key={l} onClick={() => setMine(v)} style={{
              padding: "7px 14px", border: "none", cursor: "pointer", fontWeight: 700, fontSize: 12,
              background: mine === v ? C.ink : "transparent", color: mine === v ? "#000" : C.muted,
            }}>{l}</button>
          ))}
        </div>
      </div>

      {stores.length > 1 && (
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          {stores.map(s => (
            <button key={s.id} onClick={() => setStoreId(s.id)} style={chip(storeId === s.id)}>
              {s.name}
            </button>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 14, overflowX: "auto", paddingBottom: 2 }}>
        {[["today", "Bugün"], ["week", "Bu hafta"], ["month", "Bu ay"]].map(([k, l]) => (
          <button key={k} onClick={() => setPeriod(k)} style={chip(period === k)}>{l}</button>
        ))}
      </div>

      <div style={{ background: C.card, border: `1px solid ${C.cardLine}`, borderRadius: 12, padding: "14px 16px", marginTop: 12, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontSize: 12, color: C.muted }}>
          {period === "today" ? "Bugün" : `${range.from.slice(8)}–${range.to.slice(8)}`} · {filtered.length} kayıt
        </span>
        <span style={{ fontSize: 26, fontWeight: 900, fontFamily: hv, color: C.ink }}>{fmtTL(total)}</span>
      </div>

      <div style={{ display: "flex", gap: 6, marginTop: 12, overflowX: "auto", paddingBottom: 4 }}>
        <button onClick={() => setCat("all")} style={chip(cat === "all")}>Hepsi</button>
        {CATS.map(c => (
          <button key={c.key} onClick={() => setCat(c.key)} style={{...chip(cat === c.key), display:"inline-flex", alignItems:"center", gap:6}}><Ikon ad={c.emoji} boy={14}/>{c.label}</button>
        ))}
      </div>

      {loading ? (
        <div style={{ padding: 60, textAlign: "center", color: C.muted }}>Yükleniyor…</div>
      ) : byDay.length === 0 ? (
        <div style={{ padding: "70px 20px", textAlign: "center", color: C.faint }}>
          <Ikon ad="fatura" boy={44} kalin={1.3} style={{ display:"block", margin:"0 auto 10px" }}/>
          Bu dönemde gider yok
        </div>
      ) : byDay.map(([day, items]) => (
        <div key={day} style={{ marginTop: 16 }}>
          <div style={{ fontSize: 11, color: C.faint, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>
            {new Date(day + "T12:00").toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long" })}
            {" · "}{fmtTL(items.reduce((s, r) => s + Number(r.amount || 0), 0))}
          </div>
          {items.map(r => {
            const c = catOf(r.category);
            return (
              <div key={r.id} style={{ background: C.card, border: `1px solid ${C.cardLine}`, borderRadius: 10, padding: "11px 12px", marginBottom: 6, display: "flex", alignItems: "center", gap: 10 }}>
                <Ikon ad={c.emoji} boy={19}/>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.description}</div>
                  <div style={{ fontSize: 11, color: C.faint }}>
                    {c.label} · {r.staff?.name || "—"}{r.payment_method === "kart" ? " · kart" : ""}
                  </div>
                </div>
                <div style={{ fontWeight: 800, fontSize: 15, whiteSpace: "nowrap" }}>{fmtTL(r.amount)}</div>
                {canDelete && (
                  <button onClick={() => remove(r)} title="Sil" style={{ background: "none", border: "none", color: C.faint, cursor: "pointer", padding: 4, display: "flex" }}><Ikon ad="kapat" boy={14}/></button>
                )}
              </div>
            );
          })}
        </div>
      ))}

      {!isViewer && (
        <button onClick={() => setSheet(true)} style={{
          position: "fixed", left: "50%", transform: "translateX(-50%)", bottom: 84,
          background: C.accent, color: "#000", border: "none", borderRadius: 999,
          padding: "15px 30px", fontSize: 16, fontWeight: 800, cursor: "pointer",
          boxShadow: "0 6px 24px rgba(0,0,0,0.5)", zIndex: 30,
        }}>+ Yeni Gider</button>
      )}

      {sheet && (
        <>
          <div onClick={() => setSheet(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 40 }} />
          <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, background: "#111", borderTop: `1px solid ${C.cardLine}`, borderRadius: "16px 16px 0 0", padding: "18px 16px 26px", zIndex: 50, maxWidth: 700, margin: "0 auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <b style={{ fontSize: 17 }}>Yeni Gider</b>
              <button onClick={() => setSheet(false)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", display: "flex" }}><Ikon ad="kapat" boy={17}/></button>
            </div>

            <input
              autoFocus inputMode="decimal" placeholder="₺ Tutar"
              value={form.amount}
              onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
              style={{ width: "100%", boxSizing: "border-box", background: C.card, border: `1px solid ${C.cardLine}`, borderRadius: 10, color: C.ink, fontSize: 30, fontWeight: 800, padding: "12px 14px", outline: "none", textAlign: "center", fontFamily: hv }}
            />

            <input
              placeholder="Ne alındı? (örn. Hal — sebze meyve)"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              style={{ width: "100%", boxSizing: "border-box", background: C.card, border: `1px solid ${C.cardLine}`, borderRadius: 10, color: C.ink, fontSize: 15, padding: "12px 14px", outline: "none", marginTop: 8 }}
            />

            <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
              {CATS.map(c => (
                <button key={c.key} onClick={() => setForm(f => ({ ...f, category: c.key }))} style={{...chip(form.category === c.key), display:"inline-flex", alignItems:"center", gap:6}}><Ikon ad={c.emoji} boy={14}/>{c.label}</button>
              ))}
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              {[["kasa", "nakit", "Kasadan"], ["kart", "kart", "Kart"]].map(([k, ik, l]) => (
                <button key={k} onClick={() => setForm(f => ({ ...f, payment_method: k }))} style={{ ...chip(form.payment_method === k), flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}><Ikon ad={ik} boy={14}/>{l}</button>
              ))}
            </div>

            <button onClick={save} disabled={saving} style={{
              width: "100%", marginTop: 14, background: C.green, color: "#000", border: "none",
              borderRadius: 12, padding: "15px", fontSize: 16, fontWeight: 800, cursor: "pointer", opacity: saving ? 0.6 : 1,
            }}>{saving ? "Kaydediliyor…" : "Kaydet"}</button>
          </div>
        </>
      )}
    </div>
  );
}
