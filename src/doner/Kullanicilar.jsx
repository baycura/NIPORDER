import { useDoner } from "./DonerApp.jsx";
import { doner } from "./supabase.js";
import { C, S, Baslik, hataMetni } from "./ortak.jsx";

// KULLANICILAR (yalniz admin) — kayit isteyenleri onayla, rol ver, cikar.
export default function Kullanicilar() {
  const { ben, uyeler, uyeleriYukle } = useDoner();
  const bekleyen = uyeler.filter(u => !u.aktif);
  const aktif = uyeler.filter(u => u.aktif);

  const guncelle = async (u, degisiklik) => {
    const { error } = await doner.from("doner_kullanicilar").update(degisiklik).eq("auth_id", u.auth_id);
    if (error) { alert(hataMetni(error)); return; }
    uyeleriYukle();
  };
  const cikar = async (u) => {
    if (!confirm(`${u.ad} listeden çıkarılsın mı? Girişi kapanır; girdiği kayıtlar durur.`)) return;
    const { error } = await doner.from("doner_kullanicilar").delete().eq("auth_id", u.auth_id);
    if (error) { alert(hataMetni(error)); return; }
    uyeleriYukle();
  };

  const Satir = ({ u, bekliyor }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderTop: `1px solid ${C.line}`, flexWrap: "wrap" }}>
      <div style={{ flex: 1, minWidth: 140 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>{u.ad}{u.auth_id === ben.auth_id ? " (sen)" : ""}</div>
        <div style={{ fontSize: 12, color: C.faint, marginTop: 2 }}>{u.eposta || "—"}</div>
      </div>
      {bekliyor ? (
        <>
          <button onClick={() => guncelle(u, { aktif: true, rol: "personel" })} style={S.cip(true)}>Personel olarak onayla</button>
          <button onClick={() => guncelle(u, { aktif: true, rol: "admin" })} style={S.cip(false)}>Yönetici</button>
          <button onClick={() => cikar(u)} style={{ ...S.cip(false), color: C.down }}>Reddet</button>
        </>
      ) : (
        <>
          <button onClick={() => guncelle(u, { rol: u.rol === "admin" ? "personel" : "admin" })} disabled={u.auth_id === ben.auth_id}
                  style={{ ...S.cip(u.rol === "admin"), opacity: u.auth_id === ben.auth_id ? 0.5 : 1 }}>{u.rol === "admin" ? "Yönetici" : "Personel"}</button>
          {u.auth_id !== ben.auth_id && <button onClick={() => cikar(u)} style={{ ...S.cip(false), color: C.down }}>Çıkar</button>}
        </>
      )}
    </div>
  );

  return (
    <div>
      <Baslik baslik="Kullanıcılar" alt="Kim girebilir, kim yönetici" />
      <div style={{ ...S.kart, padding: 0, overflow: "hidden", marginBottom: 10 }}>
        <div style={{ padding: "10px 14px", fontSize: 11, color: C.muted, letterSpacing: 1, textTransform: "uppercase", fontWeight: 600 }}>Onay bekleyen · {bekleyen.length}</div>
        {bekleyen.length === 0 && <div style={{ padding: 20, textAlign: "center", color: C.muted, fontSize: 13, borderTop: `1px solid ${C.line}` }}>Bekleyen yok. Yeni kişi uygulamada "Kayıt ol" ile başvurur.</div>}
        {bekleyen.map(u => <Satir key={u.auth_id} u={u} bekliyor />)}
      </div>
      <div style={{ ...S.kart, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "10px 14px", fontSize: 11, color: C.muted, letterSpacing: 1, textTransform: "uppercase", fontWeight: 600 }}>Aktif · {aktif.length}</div>
        {aktif.map(u => <Satir key={u.auth_id} u={u} />)}
      </div>
      <div style={{ fontSize: 12, color: C.faint, marginTop: 12, lineHeight: 1.7 }}>
        Yönetici: kullanıcı onaylar, kayıt siler. Personel: gider, gün sonu, adet, borç girer ve düzeltir; silemez.
      </div>
    </div>
  );
}
