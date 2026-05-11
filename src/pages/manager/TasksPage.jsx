import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";

const PATRON_ROLES = ["super_admin", "owner", "admin", "manager"];
const PARIS_STORE_UUID = "c3c6e0c7-1821-4edd-993d-ad960cfbc452";
const DONER_STORE_UUID = "c39da530-7f73-4f69-a752-029bf03790b1";

export default function TasksPage() {
  const { staffUser } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [storeId, setStoreId] = useState(PARIS_STORE_UUID);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", assigned_to: [] });
  const [staffMap, setStaffMap] = useState({});
  const [staffList, setStaffList] = useState([]);

  const isPatron = staffUser && PATRON_ROLES.includes(staffUser.role);

  const load = async () => {
    setLoading(true);
    const [{ data: tasksData }, { data: staffData }] = await Promise.all([
      supabase.from("tasks").select("*").eq("store_id", storeId).order("created_at", { ascending: false }),
      supabase.from("staff").select("id, name, role, is_active").eq("is_active", true).order("name")
    ]);
    setTasks(tasksData || []);
    const map = {};
    (staffData || []).forEach(s => { map[s.id] = s.name; });
    setStaffMap(map);
    setStaffList(staffData || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [storeId]);

  useEffect(() => {
    const channel = supabase.channel(`tasks-${storeId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks", filter: `store_id=eq.${storeId}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [storeId]);

  const addTask = async () => {
    if (!form.title.trim()) return;
    await supabase.from("tasks").insert({
      store_id: storeId,
      title: form.title.trim(),
      description: form.description.trim() || null,
      assigned_to: form.assigned_to,
      created_by: staffUser.id
    });
    setForm({ title: "", description: "", assigned_to: [] });
    setModal(false);
  };

  const toggle = async (task) => {
    const newDone = !task.done;
    await supabase.from("tasks").update({
      done: newDone,
      done_by: newDone ? staffUser.id : null,
      done_at: newDone ? new Date().toISOString() : null,
      updated_at: new Date().toISOString()
    }).eq("id", task.id);
  };

  const deleteTask = async (id) => {
    if (!confirm("Görevi silmek istediğine emin misin?")) return;
    await supabase.from("tasks").delete().eq("id", id);
  };

  const formatDate = (iso) => new Date(iso).toLocaleString("tr-TR", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit"
  });

  const visibleTasks = isPatron ? tasks : tasks.filter(t => !t.assigned_to || t.assigned_to.length === 0 || (t.assigned_to || []).includes(staffUser?.id));
  const active = visibleTasks.filter(t => !t.done);
  const done = visibleTasks.filter(t => t.done);

  return (
    <div style={{ padding: 16, maxWidth: 900, margin: "0 auto", color: "#F0EDE8" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <h1 style={{ fontSize: 24, fontWeight: 900, letterSpacing: 1, margin: 0, fontFamily: "'Coolvetica Condensed','Barlow Condensed','Bebas Neue',sans-serif" }}>📋 GÖREVLER</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <select value={storeId} onChange={e => setStoreId(e.target.value)} style={{ padding: "8px 12px", background: "#1A1A1A", color: "#F0EDE8", border: "1px solid #333", borderRadius: 8, fontSize: 14 }}>
            <option value={PARIS_STORE_UUID}>Paris</option>
            <option value={DONER_STORE_UUID}>Berlin</option>
          </select>
          {isPatron && (
            <button onClick={() => setModal(true)} style={{ padding: "8px 16px", background: "#C8973E", color: "#000", border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer", fontSize: 14 }}>+ Yeni Görev</button>
          )}
        </div>
      </div>

      {loading ? <div style={{ color: "#888", padding: 20 }}>Yükleniyor...</div> : (
        <>
          <div style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 13, color: "#888", marginBottom: 8, fontWeight: 700, letterSpacing: 1 }}>AKTİF ({active.length})</h2>
            {active.length === 0 && <div style={{ color: "#666", fontSize: 14, fontStyle: "italic", padding: "12px 0" }}>Aktif görev yok</div>}
            {active.map(t => (
              <div key={t.id} style={{ background: "#1A1A1A", border: "1px solid #2A2A2A", borderRadius: 10, padding: 14, marginBottom: 8, display: "flex", alignItems: "flex-start", gap: 12 }}>
                <input type="checkbox" checked={false} onChange={() => toggle(t)} style={{ width: 22, height: 22, cursor: "pointer", marginTop: 2, accentColor: "#C8973E" }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>{t.title}</div>
                  {t.description && <div style={{ fontSize: 13, color: "#888", marginTop: 4 }}>{t.description}</div>}
                  {t.assigned_to && t.assigned_to.length > 0 && (
                    <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {t.assigned_to.map(aid => (
                        <span key={aid} style={{ fontSize: 11, background: "#C8973E22", color: "#C8973E", padding: "2px 8px", borderRadius: 10, fontWeight: 600 }}>👤 {staffMap[aid] || "?"}</span>
                      ))}
                    </div>
                  )}
                </div>
                {isPatron && (
                  <button onClick={() => deleteTask(t.id)} style={{ background: "transparent", border: "none", color: "#666", cursor: "pointer", fontSize: 18 }} title="Sil">🗑️</button>
                )}
              </div>
            ))}
          </div>

          <div>
            <h2 style={{ fontSize: 13, color: "#888", marginBottom: 8, fontWeight: 700, letterSpacing: 1 }}>TAMAMLANANLAR ({done.length})</h2>
            {done.length === 0 && <div style={{ color: "#666", fontSize: 14, fontStyle: "italic", padding: "12px 0" }}>Henüz tamamlanan görev yok</div>}
            {done.map(t => (
              <div key={t.id} style={{ background: "#0F0F0F", border: "1px solid #1A1A1A", borderRadius: 10, padding: 14, marginBottom: 8, display: "flex", alignItems: "flex-start", gap: 12, opacity: 0.75 }}>
                <input type="checkbox" checked={true} onChange={() => toggle(t)} style={{ width: 22, height: 22, cursor: "pointer", marginTop: 2, accentColor: "#C8973E" }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, textDecoration: "line-through", color: "#888" }}>{t.title}</div>
                  {t.description && <div style={{ fontSize: 13, color: "#666", marginTop: 4, textDecoration: "line-through" }}>{t.description}</div>}
                  {isPatron && t.done_by && (
                    <div style={{ fontSize: 12, color: "#C8973E", marginTop: 6, fontWeight: 600 }}>
                      ✓ {staffMap[t.done_by] || "Bilinmiyor"} · {formatDate(t.done_at)}
                    </div>
                  )}
                </div>
                {isPatron && (
                  <button onClick={() => deleteTask(t.id)} style={{ background: "transparent", border: "none", color: "#666", cursor: "pointer", fontSize: 18 }} title="Sil">🗑️</button>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {modal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }}>
          <div style={{ background: "#1A1A1A", border: "1px solid #333", borderRadius: 12, padding: 20, maxWidth: 480, width: "100%" }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginTop: 0, marginBottom: 16 }}>Yeni Görev</h2>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", fontSize: 12, color: "#888", marginBottom: 4, fontWeight: 600, letterSpacing: 0.5 }}>BAŞLIK *</label>
              <input type="text" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Örn: Soğutucu temizliği" style={{ width: "100%", padding: "10px 12px", background: "#000", color: "#F0EDE8", border: "1px solid #444", borderRadius: 8, fontSize: 14, boxSizing: "border-box" }} autoFocus />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", fontSize: 12, color: "#888", marginBottom: 6, fontWeight: 600, letterSpacing: 0.5 }}>ATANANLAR (boş = herkese açık)</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {staffList.map(s => {
                  const sel = form.assigned_to.includes(s.id);
                  return (
                    <button key={s.id} type="button" onClick={() => setForm({ ...form, assigned_to: sel ? form.assigned_to.filter(id => id !== s.id) : [...form.assigned_to, s.id] })} style={{ padding: "6px 12px", background: sel ? "#C8973E" : "#0F0F0F", color: sel ? "#000" : "#888", border: "1px solid " + (sel ? "#C8973E" : "#333"), borderRadius: 16, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>{sel ? "✓ " : ""}{s.name}</button>
                  );
                })}
              </div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 12, color: "#888", marginBottom: 4, fontWeight: 600, letterSpacing: 0.5 }}>AÇIKLAMA (opsiyonel)</label>
              <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={3} placeholder="Detay yazabilirsin..." style={{ width: "100%", padding: "10px 12px", background: "#000", color: "#F0EDE8", border: "1px solid #444", borderRadius: 8, fontSize: 14, resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" }} />
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => { setModal(false); setForm({ title: "", description: "", assigned_to: [] }); }} style={{ padding: "10px 18px", background: "transparent", color: "#888", border: "1px solid #444", borderRadius: 8, cursor: "pointer", fontSize: 14 }}>İptal</button>
              <button onClick={addTask} style={{ padding: "10px 18px", background: "#C8973E", color: "#000", border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer", fontSize: 14 }}>Kaydet</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
