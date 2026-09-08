import { useEffect, useState } from "react";
import { supabase, hataMetni } from "../lib/supabase.js";
import { useAuth } from "../contexts/AuthContext.jsx";
import Ikon from "./Ikon.jsx";

const cv = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";
const inputS = { width: "100%", padding: "10px 12px", background: "#0C0C0C", border: "1px solid #2A2A2A", borderRadius: 8, color: "#F0EDE8", fontSize: 14, outline: "none", fontFamily: "inherit", boxSizing: "border-box" };

// Shopify baglantisi — YALNIZ SAHIP. Anahtar buradan yazilir, geri okunmaz
// (durum yalniz son 4 hanesini gosterir). Dugmeler shopify-sync fonksiyonunu
// sahip JWT'siyle cagirir; ayni isler cron'da kendiliginden de doner
// (siparisler 5 dk, katalog gunde bir). Stok Order'da tek: Shopify ayna.
export default function ShopifyAyar() {
  const { isAdmin } = useAuth();
  const [durum, setDurum] = useState(null);
  const [shop, setShop] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState("");
  const [sonuc, setSonuc] = useState(null);

  const yukle = async () => {
    const { data, error } = await supabase.rpc("nip_shopify_durum");
    if (error) { setSonuc("Durum okunamadı: " + hataMetni(error)); return; }
    setDurum(data);
    setShop(s => s || data?.shop || "");
  };
  useEffect(() => { if (isAdmin) yukle(); }, [isAdmin]);
  if (!isAdmin) return null;

  const kaydet = async () => {
    if (busy) return;
    if (!shop.trim() && !token.trim()) { alert("Mağaza adresi ya da erişim anahtarı gir"); return; }
    setBusy("kaydet"); setSonuc(null);
    const { error } = await supabase.rpc("nip_shopify_ayar_kaydet", { p_shop: shop.trim() || null, p_token: token.trim() || null });
    setBusy("");
    if (error) { setSonuc("Kaydedilemedi: " + hataMetni(error)); return; }
    setToken(""); setSonuc("Kaydedildi. Şimdi \"Ürünleri çek\" ile bağlantıyı dene.");
    yukle();
  };

  const calistir = async (islem) => {
    if (busy) return;
    setBusy(islem); setSonuc(null);
    try {
      const { data, error } = await supabase.functions.invoke("shopify-sync?action=" + islem, { body: {} });
      if (error) throw new Error(hataMetni(error));
      if (data?.error) throw new Error(data.error);
      setSonuc(data?.mesaj || "Tamam");
    } catch (e) { setSonuc("Hata: " + (e?.message || e)); }
    setBusy("");
    yukle();
  };

  const dugme = (islem, ad) => (
    <button key={islem} onClick={() => calistir(islem)} disabled={!!busy || !durum?.token_var}
      style={{ flex: 1, minWidth: 120, padding: "10px 12px", background: "transparent", color: durum?.token_var ? "#F0EDE8" : "#666",
               border: "1px solid " + (durum?.token_var ? "#3A3A3A" : "#2A2A2A"), borderRadius: 10, fontSize: 12, fontWeight: 700,
               cursor: durum?.token_var ? "pointer" : "not-allowed", fontFamily: cv, opacity: busy && busy !== islem ? 0.5 : 1 }}>
      {busy === islem ? "Çalışıyor…" : ad}
    </button>
  );
  const saat = (t) => t ? new Date(t).toLocaleString("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

  return (
    <div style={{ background: "#1A1A1A", border: "1px solid #2A2A2A", borderRadius: 12, padding: 16, marginBottom: 14, fontFamily: cv }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <Ikon ad="sepet" boy={18} />
        <div style={{ fontSize: 16, fontWeight: 800, color: "#F0EDE8" }}>Shopify</div>
        {durum && (
          <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, color: durum.token_var ? "#7FA88A" : "#C87A6A" }}>
            {durum.token_var ? `● Bağlı · ${durum.bagli_urun} ürün` : "○ Anahtar yok"}
          </span>
        )}
      </div>
      <div style={{ fontSize: 11, color: "#888", marginBottom: 14, lineHeight: 1.5 }}>
        Stok burada tek; Shopify aynadır. Kasada ya da sayımda değişen stok Shopify'a anında yazılır, Shopify'daki ödenen siparişler 5 dakikada bir buradan düşer.
        Katalog günde bir çekilir; yeni ürünler gizli açılır, Menü Yönetimi'nden görünür yaparsın.
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 200, marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: "#888", fontWeight: 600, marginBottom: 5 }}>MAĞAZA ADRESİ</div>
          <input value={shop} onChange={e => setShop(e.target.value)} placeholder="e4ed11-3.myshopify.com" style={inputS} />
        </div>
        <div style={{ flex: 2, minWidth: 220, marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: "#888", fontWeight: 600, marginBottom: 5 }}>
            ERİŞİM ANAHTARI{durum?.token_var ? ` (kayıtlı · …${durum.token_son4})` : ""}
          </div>
          <input type="password" value={token} onChange={e => setToken(e.target.value)} autoComplete="new-password"
                 placeholder={durum?.token_var ? "Değiştirmek için yeni anahtarı yapıştır" : "shpat_…"} style={inputS} />
        </div>
      </div>
      <button onClick={kaydet} disabled={!!busy}
        style={{ padding: "10px 16px", background: "#FFFFFF", color: "#000", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: cv, marginBottom: 12 }}>
        {busy === "kaydet" ? "Kaydediliyor…" : "Bağlantıyı kaydet"}
      </button>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        {dugme("urunler", "Ürünleri çek")}
        {dugme("siparisler", "Siparişleri çek")}
        {dugme("stok", "Stokları Shopify'a yaz")}
      </div>
      {sonuc && <div style={{ fontSize: 12, color: sonuc.startsWith("Hata") || sonuc.startsWith("Kaydedilemedi") ? "#C87A6A" : "#F0EDE8", marginBottom: 10, lineHeight: 1.5 }}>{sonuc}</div>}

      {durum?.log?.length > 0 && (
        <div style={{ borderTop: "1px solid #2A2A2A", paddingTop: 8 }}>
          <div style={{ fontSize: 11, color: "#888", fontWeight: 600, marginBottom: 6 }}>SON İŞLEMLER</div>
          {durum.log.slice(0, 6).map((l, i) => (
            <div key={i} style={{ fontSize: 11, color: l.ok ? "#aaa" : "#C87A6A", lineHeight: 1.6 }}>
              {saat(l.created_at)} · {l.islem} · {l.mesaj}
            </div>
          ))}
          {durum.siparis_durum?.son_kontrol && (
            <div style={{ fontSize: 11, color: "#666", marginTop: 4 }}>Sipariş kontrolü: {saat(durum.siparis_durum.son_kontrol)}</div>
          )}
        </div>
      )}
      {!durum?.token_var && (
        <div style={{ fontSize: 11, color: "#888", marginTop: 8, lineHeight: 1.6 }}>
          Anahtar: Shopify yönetici → Settings → Apps and sales channels → Develop apps → Create an app → Admin API scopes: read_products, read_inventory, write_inventory, read_orders, read_locations → Install → Admin API access token.
        </div>
      )}
    </div>
  );
}
