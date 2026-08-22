import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase.js";
import { useRideAuth } from "../auth/RideAuthContext.jsx";

const BIKE_TYPES = ["Yol", "Gravel", "Dağ (MTB)", "Şehir", "TT / Tri"];
const MATERIALS = ["Karbon", "Alüminyum", "Çelik", "Titanyum"];
const BRAKES = ["Disk", "Kaliper (rim)"];

export default function CreateRentalPage() {
  const { userId, customer } = useRideAuth();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [f, setF] = useState({
    brand_model: "", bike_type: BIKE_TYPES[0], frame_material: MATERIALS[0], frame_size: "",
    groupset: "", gearing: "", tire_size: "", brake_type: BRAKES[0], location: "",
    price: "", price_period: "day", currency: "EUR", phone: customer?.phone || "", notes: "",
  });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    if (!f.brand_model.trim()) { setErr("Marka / model gerekli."); return; }
    setBusy(true); setErr("");
    const { data, error } = await supabase.from("bike_rentals").insert({
      owner_id: userId,
      brand_model: f.brand_model.trim(),
      bike_type: f.bike_type || null,
      frame_material: f.frame_material || null,
      frame_size: f.frame_size.trim() || null,
      groupset: f.groupset.trim() || null,
      gearing: f.gearing.trim() || null,
      tire_size: f.tire_size.trim() || null,
      brake_type: f.brake_type || null,
      location: f.location.trim() || null,
      price: f.price === "" ? null : Number(f.price),
      price_period: f.price_period,
      currency: f.currency || "EUR",
      phone: f.phone.trim() || null,
      notes: f.notes.trim() || null,
    }).select("id").single();
    setBusy(false);
    if (error) { setErr(error.message); return; }
    nav(`/rentals/${data.id}`);
  };

  return (
    <div>
      <h1 style={{ fontSize: 40, marginBottom: 6 }}>Bisikletini Kiraya Ver</h1>
      <p style={{ color: "var(--nip-muted)", fontSize: 13, marginBottom: 16 }}>Fotoğraf yok — sadece teknik bilgiler. Fiyat ve telefonun yalnızca üyelere görünür.</p>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <L label="MARKA / MODEL *"><input value={f.brand_model} onChange={set("brand_model")} placeholder="Canyon Ultimate CF SL 8" style={input} /></L>

        <Row>
          <L label="BİSİKLET TÜRÜ"><select value={f.bike_type} onChange={set("bike_type")} style={input}>{BIKE_TYPES.map((x) => <option key={x}>{x}</option>)}</select></L>
          <L label="KADRO MALZEMESİ"><select value={f.frame_material} onChange={set("frame_material")} style={input}>{MATERIALS.map((x) => <option key={x}>{x}</option>)}</select></L>
        </Row>
        <Row>
          <L label="KADRO ÖLÇÜSÜ"><input value={f.frame_size} onChange={set("frame_size")} placeholder="54 / M" style={input} /></L>
          <L label="LASTİK EBADI"><input value={f.tire_size} onChange={set("tire_size")} placeholder="700x28c" style={input} /></L>
        </Row>
        <L label="GRUPSET"><input value={f.groupset} onChange={set("groupset")} placeholder="Shimano 105 Di2" style={input} /></L>
        <L label="DİŞLİ ORANLARI"><input value={f.gearing} onChange={set("gearing")} placeholder="50/34 · 11-34" style={input} /></L>
        <Row>
          <L label="FREN"><select value={f.brake_type} onChange={set("brake_type")} style={input}>{BRAKES.map((x) => <option key={x}>{x}</option>)}</select></L>
          <L label="KONUM"><input value={f.location} onChange={set("location")} placeholder="Kadıköy" style={input} /></L>
        </Row>

        <div style={{ border: "1px solid var(--nip-accent)", borderRadius: 4, padding: 14 }}>
          <div style={{ fontFamily: "var(--nip-font-mono)", fontSize: 11, color: "var(--nip-accent)", letterSpacing: "0.1em", marginBottom: 10 }}>🔒 ÜYELERE ÖZEL ALANLAR</div>
          <Row>
            <L label="FİYAT"><input type="number" min={0} value={f.price} onChange={set("price")} placeholder="35" style={input} /></L>
            <L label="PERİYOT"><select value={f.price_period} onChange={set("price_period")} style={input}><option value="day">Günlük</option><option value="week">Haftalık</option></select></L>
            <L label="PARA"><select value={f.currency} onChange={set("currency")} style={input}><option>EUR</option><option>USD</option><option>TRY</option></select></L>
          </Row>
          <L label="TELEFON"><input value={f.phone} onChange={set("phone")} placeholder="+90..." style={input} /></L>
        </div>

        {err && <div style={{ color: "var(--nip-danger)", fontSize: 13 }}>{err}</div>}

        <div style={{ display: "flex", gap: 10 }}>
          <button type="button" onClick={() => nav("/rentals")} style={{ background: "transparent", border: "1px solid var(--nip-divider)", borderRadius: 2, padding: "12px 18px", fontFamily: "var(--nip-font-mono)", fontSize: 13 }}>İptal</button>
          <button type="submit" disabled={busy} style={{ flex: 1, background: "var(--nip-accent)", color: "var(--nip-ink)", border: "none", borderRadius: 2, padding: "12px 18px", fontFamily: "var(--nip-font-mono)", fontSize: 13, letterSpacing: "0.08em", opacity: busy ? 0.5 : 1 }}>{busy ? "Yayınlanıyor..." : "İlanı Yayınla"}</button>
        </div>
      </form>
    </div>
  );
}

const input = { width: "100%", padding: "11px 12px", background: "var(--nip-surface)", border: "1px solid var(--nip-divider)", borderRadius: 2, fontSize: 14, color: "var(--nip-ink)", outline: "none" };
function L({ label, children }) {
  return (<label style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
    <span style={{ fontSize: 10, color: "var(--nip-muted)", letterSpacing: "0.14em", fontFamily: "var(--nip-font-mono)" }}>{label}</span>
    {children}
  </label>);
}
function Row({ children }) { return <div style={{ display: "flex", gap: 12 }}>{children}</div>; }
