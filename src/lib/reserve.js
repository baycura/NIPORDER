import { createClient } from "@supabase/supabase-js";
import { supabase } from "./supabase.js";

// ============================================================================
// REZERVASYON KOPRUSU
//
// Sahibin karari (2026-09-03): "Rezervasyon da calismaya devam etsin ama Order
// uzerinden admin kontrolu yapabileyim." Yani rezervasyon sitesi kendi Supabase
// projesinde (RESERVE) oldugu gibi kalir; Order paneli o projeye SAHIBIN KENDI
// YETKISIYLE baglanir.
//
// Nasil: RESERVE'deki order-sso fonksiyonu Order oturumunu Order'in auth ucunda
// dogrular, ayni e-posta icin RESERVE'de tek kullanimlik giris token'i uretir.
// Biz o token'i tarayicida verifyOtp ile oturuma ceviririz. Sonuc: ikinci bir
// supabase-js istemcisi, RESERVE'de gercek bir oturumla. Butun yazma/okuma
// RESERVE'in KENDI RLS'inden gecer (nip_is_admin). Order tarafina hicbir gizli
// anahtar konmaz; personelin RESERVE'de yetkisi yoksa burada da yoktur.
//
// Kimin admin oldugu RESERVE'de profiles.is_admin ile belirlenir (su an Omer ve
// Ceren). Baska bir yoneticiye yetki vermek icin o kisinin RESERVE'de hesabi
// olmali ve is_admin=true yapilmali — bu ekran onu yapmaz, yalniz soyler.
// ============================================================================

export const RESERVE_URL = "https://diqparjrtvvfxvwxebov.supabase.co";
// RESERVE'in public anon anahtari — gizli degil, rezervasyon sitesinin HTML'inde
// de acikta duruyor. Yetki anahtardan degil oturumdan gelir.
export const RESERVE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRpcXBhcmpydHZ2Znh2d3hlYm92Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5Mzc3OTMsImV4cCI6MjA4OTUxMzc5M30.pNI2yU6LDG8583HBPq-5puxkpEVEAYwhGp9ibJ1WBsI";
export const RESERVATION_URL = "https://reservation.notinparis.me";

// Ayri storageKey sart: varsayilan anahtar Order oturumunun uzerine yazardi.
export const reserve = createClient(RESERVE_URL, RESERVE_KEY, {
  auth: {
    storageKey: "nip-reserve-auth",
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

async function adminMi(session) {
  const { data, error } = await reserve.rpc("nip_is_admin");
  if (error) return { ok: true, admin: false, email: session?.user?.email || "", hata: error.message };
  return { ok: true, admin: !!data, email: session?.user?.email || "" };
}

// Order oturumundan RESERVE oturumu kur (ya da eldekini dogrula).
// Donus: { ok, admin, email, hata? }
//   ok=false        -> kopru kurulamadi (hata metni var)
//   ok, admin=false -> RESERVE'de oturum var ama admin degil
//   ok, admin=true  -> panel yazabilir
export async function reserveOturumAl({ zorla = false } = {}) {
  try {
    const { data: { session: orderSess } } = await supabase.auth.getSession();
    const tok = orderSess?.access_token;
    const orderEmail = String(orderSess?.user?.email || "").toLowerCase();
    if (!tok) return { ok: false, admin: false, email: "", hata: "Order oturumu yok" };

    if (!zorla) {
      const { data: { session } } = await reserve.auth.getSession();
      // Elde oturum var ama BASKA birinin: cihazda onceki personel oturum
      // acmis olabilir. Onunkiyle devam etmek yetki karisikligi olur — at.
      if (session && String(session.user?.email || "").toLowerCase() === orderEmail) {
        return await adminMi(session);
      }
      if (session) await reserve.auth.signOut();
    }

    const r = await fetch(RESERVE_URL + "/functions/v1/order-sso", {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: RESERVE_KEY, Authorization: "Bearer " + RESERVE_KEY },
      // no_create: personel hesabi RESERVE'de yoksa ORADA UYE ACMA. Musteri
      // koprusu (CustomerMenu) acar; yonetim koprusu acmaz — yoksa her personel
      // rezervasyon sitesinde "onayli uye" olarak belirir.
      body: JSON.stringify({ order_token: tok, no_create: true }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j?.token_hash) {
      const neden = j?.code === "no_account"
        ? "Bu e-postanın rezervasyon tarafında hesabı yok."
        : (j?.error || "köprü yanıt vermedi");
      return { ok: false, admin: false, email: orderEmail, hata: neden, kod: j?.code };
    }

    const { data, error } = await reserve.auth.verifyOtp({ token_hash: j.token_hash, type: "magiclink" });
    if (error || !data?.session) {
      return { ok: false, admin: false, email: orderEmail, hata: error?.message || "oturum açılamadı" };
    }
    return await adminMi(data.session);
  } catch (e) {
    return { ok: false, admin: false, email: "", hata: e?.message || String(e) };
  }
}

export async function reserveCikis() {
  try { await reserve.auth.signOut(); } catch (_) { /* oturum zaten yoksa sorun degil */ }
}
