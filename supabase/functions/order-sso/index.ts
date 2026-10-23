// Order -> Reservation tek giris koprusu.
//
// DIKKAT: Bu fonksiyon ORDER projesinde degil, NIP RESERVE projesinde
// (diqparjrtvvfxvwxebov) calisir. Dosya surum takibi icin NIPORDER deposunda
// supabase/functions/order-sso/index.ts olarak durur.
//
// Neden: iki uygulama iki ayri Supabase projesi; Order'da giris yapmis uye
// rezervasyon sitesine gecince "yeniden uye ol" duvariyla karsilasiyordu.
// Kopru sunu yapar: Order oturumunu Order'in KENDI auth ucunda dogrular,
// ayni e-posta icin bu projede tek kullanimlik giris linki (magic link)
// uretir. Rezervasyon uygulamasinin koduna ve verisine dokunulmaz —
// supabase-js linkteki token'i zaten kendisi isler.
//
// v2 (2026-09-03): Order paneli rezervasyonu YONETMEK icin de ayni kopruyu
// kullaniyor. Iki ek:
//   - token_hash da donuyor: panel tarayicida verifyOtp ile oturuma cevirir,
//     sayfa degistirmeden RESERVE'e baglanir. (url zaten ayni token'i tasiyor,
//     yeni bir sir acilmiyor.)
//   - no_create: true gelirse RESERVE'de hesap YOKSA acilmaz, code=no_account
//     doner. Yonetim koprusunden gecen personel rezervasyon sitesinde "onayli
//     uye" olarak belirmesin diye. Musteri koprusu (CustomerMenu) eskisi gibi
//     acmaya devam eder.
//
// v3 (2026-10-24): generateLink kullanici YOKSA kendisi aciyor (GoTrue
// davranisi); asagidaki "yoksa ac + onayla" dali hic calismiyordu. Sonuc:
// koprunden gecen her Order uyesi rezervasyon sitesinde "onay bekliyor"
// kaldi, 5 Eylul'den beri kimse rezervasyon yapamadi. Simdi:
//   - no_create: hesap var mi diye profiles'a ONCE bakilir; yoksa link
//     uretilmez, code=no_account doner (personel uye olarak acilmasin).
//   - Musteri koprusu: link uretildikten sonra profil "pending" ise
//     onaylanir (uye kodu + guven puani kaydi, panelin approveMember'i gibi).
//     Reddedilmis / dondurulmus karar korunur.
//
// Guvenlik: e-posta istekten DEGIL, dogrulanmis Order token'indan gelir.
// Gecerli bir Order oturumu olmayan kimse link alamaz; calinti bir Order
// token'i zaten o hesabin oturumu demektir, kopru yetkiyi genisletmez.
// Yonetim yetkisi de burada verilmez: RESERVE'de profiles.is_admin neyse odur.

import { createClient } from "jsr:@supabase/supabase-js@2";

const ORDER_URL = "https://gbbxxcduuwdmvfayxzeg.supabase.co";
// Order'in public anon anahtari — gizli degil, istemcide de acik duruyor
const ORDER_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdiYnh4Y2R1dXdkbXZmYXl4emVnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyNzQ2NDYsImV4cCI6MjA5MTg1MDY0Nn0.znsE_M_K0tp6wr386fMNzQ9mJsqtBmUMsRiy-ITig-s";
const SITE = "https://reservation.notinparis.me";

// Panelin approveMember'i gibi: NIP-MBR- + 6 hex
const hex6 = () => Array.from(crypto.getRandomValues(new Uint8Array(3)))
  .map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST bekleniyor" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const order_token = body?.order_token;
    const no_create = body?.no_create === true;
    if (!order_token || typeof order_token !== "string") {
      return json({ error: "order_token gerekli" }, 400);
    }

    // 1) Order oturumunu Order'in kendi auth ucunda dogrula
    const uRes = await fetch(`${ORDER_URL}/auth/v1/user`, {
      headers: { apikey: ORDER_ANON, Authorization: `Bearer ${order_token}` },
    });
    if (!uRes.ok) return json({ error: "gecersiz oturum" }, 401);
    const u = await uRes.json();
    const email = String(u?.email || "").toLowerCase().trim();
    if (!email) return json({ error: "oturumda e-posta yok" }, 401);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const linkUret = () => admin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo: SITE },
    });

    // Her auth kullanicisinin profili var (handle_new_user). Yonetim koprusu
    // (no_create) hesap yoksa link URETMEZ: generateLink kullaniciyi acardi.
    const { data: mevcut } = await admin
      .from("profiles").select("id,status").ilike("email", email).limit(1);
    if (no_create && (!mevcut || mevcut.length === 0)) {
      return json({ error: "rezervasyon tarafinda hesap yok", code: "no_account" }, 404);
    }

    // 2) Giris linki uret; kullanici burada yoksa (izin varsa) once ac.
    let link = await linkUret();

    if (link.error) {
      if (no_create) return json({ error: "rezervasyon tarafinda hesap yok", code: "no_account" }, 404);

      // Musterinin adi/telefonu Order tarafinda: kendi token'iyla, kendi RLS
      // izniyle okunur (customers_read_own). Yeni profil bos acilmasin diye.
      let name = u?.user_metadata?.full_name || "";
      let phone = "";
      try {
        const cRes = await fetch(
          `${ORDER_URL}/rest/v1/customers?select=name,phone&limit=1`,
          { headers: { apikey: ORDER_ANON, Authorization: `Bearer ${order_token}` } },
        );
        const rows = cRes.ok ? await cRes.json() : [];
        if (rows[0]?.name) name = rows[0].name;
        if (rows[0]?.phone) phone = rows[0].phone;
      } catch (_) { /* ad/telefon suslemedir, giris bunlarsiz da calisir */ }

      const created = await admin.auth.admin.createUser({
        email,
        email_confirm: true, // e-postayi Google zaten dogruladi
        user_metadata: { name, phone, from_order: true },
      });
      if (created.error) return json({ error: "hesap acilamadi" }, 500);

      // Tetikleyici profili "pending" acar. Order uyesi ad+telefon vermis,
      // gercek musteridir — dogrudan onayla. Tek istisna: ayni e-posta daha
      // once kulupten REDDEDILMISSE karar korunur, onay elde kalir.
      const { data: rejected } = await admin
        .from("profiles").select("id").eq("status", "rejected")
        .ilike("email", email).limit(1);
      if (!rejected || rejected.length === 0) {
        await admin.from("profiles")
          .update({ status: "approved", approved_at: new Date().toISOString() })
          .eq("id", created.data.user.id).eq("status", "pending");
      }

      link = await linkUret();
      if (link.error) return json({ error: "giris linki uretilemedi" }, 500);
    }

    // 3) Musteri koprusu: profil "pending" kaldiysa onayla. Order uyesi
    //    ad+telefon vermis gercek musteridir. Onay suslemedir: hata olursa
    //    giris linki yine doner, kisi en kotu "onay bekliyor" gorur.
    if (!no_create) {
      try {
        const uid = link.data?.user?.id;
        if (uid) {
          const { data: prof } = await admin
            .from("profiles").select("id,status,member_code").eq("id", uid).maybeSingle();
          if (prof && prof.status === "pending") {
            const kod = prof.member_code || ("NIP-MBR-" + hex6());
            const upd = await admin.from("profiles")
              .update({ status: "approved", member_code: kod, approved_at: new Date().toISOString() })
              .eq("id", uid).eq("status", "pending");
            if (!upd.error) {
              await admin.from("reputation_ledger").insert({
                profile_id: uid, score_type: "trust", delta: 100, balance_after: 100,
                reason_code: "approved", source_type: "admin", reason_note: "Order köprüsü",
              });
            }
          }
        }
      } catch (_) { /* onay basarisizsa link yine doner */ }
    }

    return json({
      url: link.data.properties.action_link,
      token_hash: link.data.properties.hashed_token,
    });
  } catch (_e) {
    return json({ error: "beklenmeyen hata" }, 500);
  }
});
