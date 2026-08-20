// PayTR iFrame API — online odeme (acilip kapanabilir: app_settings.online_payment_enabled)
// Rotalar (?action=):
//   token    -> musteri istemcisi cagirir: siparis icin PayTR iframe token'i uretir
//   callback -> PayTR sunucusu oder/basarisiz sonucunu POST'lar (hash dogrulanir, "OK" donulur)
// Hash formulu resmi PayTR ornekleriyle birebir (iFrame API v1).
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

async function cfg(key: string): Promise<string | null> {
  const { data } = await supabase.from("bot_config").select("value").eq("key", key).maybeSingle();
  return data?.value ?? null;
}

const b64 = (bytes: Uint8Array) => {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
};
const b64utf8 = (s: string) => b64(new TextEncoder().encode(s));

async function hmacB64(data: string, key: string): Promise<string> {
  const k = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(data));
  return b64(new Uint8Array(sig));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  try {
    const [mid, mkey, msalt] = await Promise.all([
      cfg("paytr_merchant_id"), cfg("paytr_merchant_key"), cfg("paytr_merchant_salt"),
    ]);
    if (!mid || !mkey || !msalt) return json({ error: "PayTR anahtarlari tanimli degil" });

    // --- Musteri: siparis icin odeme token'i ---
    if (action === "token") {
      const { data: flag } = await supabase
        .from("app_settings").select("value").eq("key", "online_payment_enabled").maybeSingle();
      const enabled = flag?.value === true || flag?.value === "true";
      if (!enabled) return json({ error: "Online ödeme şu an kapalı — kasadan ödeyebilirsin" });

      const body = await req.json().catch(() => ({}));
      const orderId: string = body.order_id || "";
      if (!/^[0-9a-f-]{36}$/i.test(orderId)) return json({ error: "Geçersiz sipariş" });

      const { data: order } = await supabase
        .from("orders").select("id, total, status, customer_name, customer_id, use_points, origin_store_id")
        .eq("id", orderId).maybeSingle();
      if (!order) return json({ error: "Sipariş bulunamadı" });
      if (order.status === "paid") return json({ error: "Bu sipariş zaten ödendi ✅" });
      if (!["open", "sent", "preparing", "ready"].includes(order.status)) {
        return json({ error: "Bu sipariş ödemeye uygun değil" });
      }

      // CUZDAN: musteri "puanlarimla ode" dediyse o kisim KARTTAN CEKILMEZ.
      // Cekilseydi cifte tahsilat olurdu: kart tam tutari alir, siparis 'paid'
      // olunca tetikleyici ayrica puani da yakardi. Tetikleyici odeme aninda
      // least(bakiye, tutar) hesaplar; burada ayni hesabi yapip karta kalani
      // yaziyoruz — sapma olursa bildirimde loglaniyor.
      const totalKurus = Math.round(Number(order.total || 0) * 100);
      let coverKurus = 0;
      if (order.use_points && order.customer_id) {
        const { data: cust } = await supabase
          .from("customers").select("points").eq("id", order.customer_id).maybeSingle();
        const balKurus = Math.max(0, Math.floor(Number(cust?.points || 0))) * 100;
        coverKurus = Math.min(balKurus, Math.floor(Number(order.total || 0)) * 100);
      }
      const amountKurus = Math.max(0, totalKurus - coverKurus);
      if (coverKurus > 0 && amountKurus < 100) {
        return json({ error: "Puanların bu siparişi karşılıyor 🪙 — kasada onaylatman yeterli" });
      }
      if (amountKurus < 100) return json({ error: "Tutar çok düşük" });

      const { data: items } = await supabase
        .from("order_items").select("product_name, quantity, final_price, product_price").eq("order_id", orderId);
      // Puan dusulduyse sepet tek satira iner — PayTR'a giden tutarla kalem
      // toplami birbirini tutmali, yoksa musteri neye odedigini anlamaz
      const basketArr = coverKurus > 0
        ? [["Siparis (puan indirimi sonrasi)", (amountKurus / 100).toFixed(2), 1]]
        : (items || []).map((i) => [
            String(i.product_name || "Urun"),
            Number(i.final_price ?? i.product_price ?? 0).toFixed(2),
            Number(i.quantity || 1),
          ]);
      if (!basketArr.length) basketArr.push(["Siparis", (amountKurus / 100).toFixed(2), 1]);
      const userBasket = b64utf8(JSON.stringify(basketArr));

      // merchant_oid: alfanumerik ve tekil (siparis + deneme)
      const merchantOid = "NIP" + orderId.replace(/-/g, "") + Date.now().toString(36);
      await supabase.from("paytr_payments").insert({
        merchant_oid: merchantOid, order_id: orderId,
        amount_kurus: amountKurus, points_cover_kurus: coverKurus,
      });

      const userIp = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "85.34.78.112";
      const email = "siparis@notinparis.me";
      const noInstallment = "1", maxInstallment = "0", currency = "TL", testMode = "0";

      const hashStr = mid + userIp + merchantOid + email + amountKurus + userBasket +
        noInstallment + maxInstallment + currency + testMode;
      const paytrToken = await hmacB64(hashStr + msalt, mkey);

      const form = new URLSearchParams({
        merchant_id: mid,
        user_ip: userIp,
        merchant_oid: merchantOid,
        email,
        payment_amount: String(amountKurus),
        paytr_token: paytrToken,
        user_basket: userBasket,
        debug_on: "1",
        no_installment: noInstallment,
        max_installment: maxInstallment,
        user_name: String(order.customer_name || "Misafir"),
        user_address: "Not in Paris, Fethiye",
        user_phone: "05000000000",
        merchant_ok_url: "https://order.notinparis.me/menu?pay=ok",
        merchant_fail_url: "https://order.notinparis.me/menu?pay=fail",
        timeout_limit: "30",
        currency,
        test_mode: testMode,
      });
      const res = await fetch("https://www.paytr.com/odeme/api/get-token", { method: "POST", body: form });
      const out = await res.json().catch(async () => ({ status: "error", reason: await res.text().catch(() => "yanit okunamadi") }));
      if (out.status !== "success") {
        console.error("paytr get-token:", out);
        return json({ error: "Ödeme başlatılamadı: " + (out.reason || "bilinmeyen hata") });
      }
      return json({ token: out.token });
    }

    // --- PayTR bildirim (Bildirim URL buraya ayarlanmali) ---
    // Panel soru isaretli URL kabul etmezse diye: action'siz form POST da bildirim sayilir
    const isFormPost = req.method === "POST" && (req.headers.get("content-type") || "").includes("form");
    if (action === "callback" || (!action && isFormPost)) {
      const form = await req.formData().catch(() => null);
      if (!form) return new Response("bad request", { status: 400 });
      const merchantOid = String(form.get("merchant_oid") || "");
      const status = String(form.get("status") || "");
      const totalAmount = String(form.get("total_amount") || "");
      const gotHash = String(form.get("hash") || "");

      const expect = await hmacB64(merchantOid + msalt + status + totalAmount, mkey);
      if (expect !== gotHash) {
        console.error("paytr callback: hash uyusmadi", merchantOid);
        return new Response("PAYTR notification failed: bad hash", { status: 400 });
      }

      const { data: pay } = await supabase
        .from("paytr_payments").select("merchant_oid, order_id, status, points_cover_kurus").eq("merchant_oid", merchantOid).maybeSingle();
      if (!pay) { console.error("paytr callback: kayit yok", merchantOid); return new Response("OK"); }
      if (pay.status !== "pending") return new Response("OK"); // tekrar bildirim — islenmis

      if (status === "success") {
        const amount = Number(totalAmount) / 100;
        // store_id NOT NULL, method enum'unda 'online' olmali — ikisi de eksikti
        // ve hata kontrol edilmedigi icin BASARILI odemeler payments'a HIC
        // yazilmiyordu (siparis yine 'paid' oluyordu, ciro kaydi kayboluyordu).
        const { data: ord } = await supabase
          .from("orders").select("origin_store_id, customer_id").eq("id", pay.order_id).maybeSingle();
        const { data: varOlan } = await supabase
          .from("payments").select("id").eq("order_id", pay.order_id).eq("method", "online").maybeSingle();
        if (!varOlan) {
          const { error: payErr } = await supabase.from("payments").insert({
            order_id: pay.order_id, amount, method: "online", store_id: ord?.origin_store_id,
          });
          if (payErr) console.error("paytr callback: ODEME KAYDI YAZILAMADI", pay.order_id, amount, payErr);
        }

        const { error: updErr } = await supabase.from("orders")
          .update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", pay.order_id);
        if (updErr) {
          // Para cekildi ama siparis kapanmadi: OK donme, PayTR tekrar bildirsin
          console.error("paytr callback: SIPARIS KAPATILAMADI", pay.order_id, updErr);
          return new Response("PAYTR notification failed: order update", { status: 500 });
        }

        // Cuzdan denetimi: karttan dusulen ile tetikleyicinin yaktigi puan tutmali
        if (Number(pay.points_cover_kurus || 0) > 0) {
          const { data: son } = await supabase
            .from("orders").select("points_used").eq("id", pay.order_id).maybeSingle();
          const beklenen = Number(pay.points_cover_kurus) / 100;
          if (Number(son?.points_used || 0) !== beklenen) {
            console.error("paytr callback: PUAN SAPMASI", pay.order_id,
              "beklenen", beklenen, "gerceklesen", son?.points_used);
          }
        }

        await supabase.from("paytr_payments").update({ status: "success", processed_at: new Date().toISOString() }).eq("merchant_oid", merchantOid);
      } else {
        await supabase.from("paytr_payments").update({ status: "failed", processed_at: new Date().toISOString() }).eq("merchant_oid", merchantOid);
      }
      return new Response("OK");
    }

    return new Response("Not In Paris paytr fn — hazır");
  } catch (e) {
    console.error(e);
    return new Response("error: " + (e as Error).message, { status: 500 });
  }
});
