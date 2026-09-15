import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase.js";
import { useAuth } from "../../contexts/AuthContext.jsx";
import Ikon from "../../components/Ikon.jsx";
import StokEkleSheet from "../../components/StokEkleSheet.jsx";

const cv = "'Coolvetica','Bebas Neue',sans-serif";
const cvc = "'Coolvetica Condensed','Barlow Condensed',sans-serif";

// NOT: Bu ekran eskiden stock_items tablosunu okuyordu; o tablo hic doldurulmadi
// (0 kayit) ve personel bos liste goruyordu. Gercek stok ingredients'ta duruyor.
const alertLevel = (i) => {
  const stock = Number(i.stock_qty) || 0;
  const min = Number(i.min_stock) || 0;
  if (stock <= 0) return "out";
  if (min > 0 && stock < min * 0.5) return "critical";
  if (min > 0 && stock < min) return "low";
  return "ok";
};
const AC = { out: "#C87A6A", critical: "#C87A6A", low: "#FFFFFF", ok: "#FFFFFF" };
const AL = { out: "Tükendi", critical: "Kritik", low: "Düşük", ok: "Yeterli" };

// Stok girisi artik sunucuda toplaniyor (nip_stok_ekle). Eskiden bu ekran
// mevcut stogu okuyup ustune ekleyip MUTLAK deger yaziyordu: modal acikken
// satis olursa o satis geri geliyordu. Ortak alt sayfa ayni isi kilitli satirda
// yapar, kim ne girdi defterine (stock_entries) yazar.
export default function StockViewPage() {
  const { staffUser } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [entry, setEntry] = useState(null);
  const [search, setSearch] = useState("");
  const [sonGiris, setSonGiris] = useState(null);

  const load = async () => {
    const storeIds = staffUser?.store_ids?.length ? staffUser.store_ids : ["00000000-0000-0000-0000-000000000000"];
    const { data } = await supabase.from("ingredients").select("*").in("store_id", storeIds).order("name");
    setItems(data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, [staffUser?.id]);

  // Stok yazma kapisi nip_stok_ekle ile ayni olmali: mutfak ve gozlemci bu
  // ekrani gorebilir (stok bakmak icin), ama "+" onlarda cikmaz — yoksa
  // dokunup "yetkin yok" hatasi aliyorlardi.
  const stokGirebilir = !["kitchen", "viewer", "parttime"].includes(staffUser?.role);
  const alerts = items.filter(i => alertLevel(i) !== "ok");
  const filtered = items.filter(i => !search || i.name?.toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      <h1 style={{ color: "#F0EDE8", fontFamily: cv, fontSize: 28, letterSpacing: "-0.5px", margin: "0 0 16px" }}>Stok</h1>
      {sonGiris && (
        <div onClick={() => setSonGiris(null)} style={{ background: "#161616", border: "1px solid #FFFFFF", borderRadius: 10, padding: "10px 16px", marginBottom: 16, display: "flex", gap: 10, alignItems: "center", cursor: "pointer" }}>
          <Ikon ad="onayli" boy={15} style={{ color: "#FFFFFF", flexShrink: 0 }} />
          <span style={{ color: "#F0EDE8", fontFamily: cvc, fontSize: 12, flex: 1, minWidth: 0 }}>
            {sonGiris.kalem} · {Number(sonGiris.onceki)} → <b>{Number(sonGiris.sonraki)}</b> {sonGiris.birim} kaydedildi
          </span>
          <Ikon ad="kapat" boy={12} style={{ color: "#666", flexShrink: 0 }} />
        </div>
      )}
      {alerts.length > 0 && (
        <div style={{ background: "rgba(224,90,90,0.12)", border: "1px solid #2A2A2A", borderRadius: 10, padding: "10px 16px", marginBottom: 16, display: "flex", gap: 10, alignItems: "center" }}>
          <Ikon ad="uyari" boy={15} style={{ color: "#C87A6A" }}/><span style={{ color: "#C87A6A", fontFamily: cvc, fontSize: 12 }}>{alerts.length} malzeme kritik</span>
        </div>
      )}
      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Malzeme ara..."
        style={{ width: "100%", background: "#111", border: "1px solid #2A2A2A", borderRadius: 8, padding: "10px 14px", color: "#F0EDE8", fontFamily: cvc, fontSize: 14, marginBottom: 16 }} />
      {loading && <div style={{ color: "#888", fontFamily: cvc, fontSize: 12, textAlign: "center", padding: 40 }}>Yükleniyor...</div>}
      {!loading && filtered.length === 0 && (
        <div style={{ color: "#888888", fontFamily: cvc, fontSize: 12, textAlign: "center", padding: 40 }}>
          {items.length === 0 ? "Henüz hammadde girilmemiş." : "Aramaya uyan malzeme yok."}
        </div>
      )}
      <div style={{ background: "#1E1E1E", border: "1px solid #2A2A2A", borderRadius: 12, overflow: "hidden" }}>
        {filtered.map((item, i) => {
          const lvl = alertLevel(item);
          const color = AC[lvl];
          return (
            <div key={item.id} style={{ display: "grid", gridTemplateColumns: "1.8fr 1fr 1fr .8fr", padding: "11px 16px", alignItems: "center", borderBottom: i < filtered.length - 1 ? "1px solid #2A2A2A" : "none" }}>
              <span style={{ color: "#F0EDE8", fontFamily: cvc, fontSize: 13, fontWeight: 700 }}>{item.name}</span>
              <span style={{ color: lvl !== "ok" ? "#C87A6A" : "#F0EDE8", fontFamily: cv, fontSize: 16 }}>
                {Number(item.stock_qty) || 0} {item.unit}
              </span>
              <span style={{ color: "#888", fontFamily: cvc, fontSize: 12 }}>
                {Number(item.min_stock) > 0 ? Number(item.min_stock) + " " + item.unit : "—"}
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ background: color + "22", color, fontFamily: cvc, fontSize: 10, padding: "2px 7px", borderRadius: 3 }}>{AL[lvl]}</span>
                {stokGirebilir && (
                  <button onClick={() => setEntry(item)} style={{ background: "rgba(62,207,142,0.12)", border: "1px solid #FFFFFF", color: "#FFFFFF", borderRadius: 5, padding: "3px 8px", cursor: "pointer", fontFamily: cvc, fontSize: 10 }}>+</button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {entry && (
        <StokEkleSheet
          kalem={{ tur: "malzeme", id: entry.id, ad: entry.name, birim: entry.unit, stok: Number(entry.stock_qty) || 0, pack_qty: Number(entry.pack_qty) || 1, storeId: entry.store_id }}
          storeId={staffUser?.store_ids?.[0]}
          ipucu="Faturayla gelen mallar için Faturalar ekranını kullan — maliyet de oradan güncellenir. Burası elden alınan mal ve düzeltme içindir."
          onKapat={() => setEntry(null)}
          onBitti={(s) => { setEntry(null); setSonGiris(s); load(); }}
        />
      )}
    </div>
  );
}
