// Musteri web-push bildirimleri — "siparisin hazir" kilitli telefona da gider.
// Rotalar (?action=, hepsi secret korumali):
//   vapid_setup -> VAPID anahtar cifti uret/kaydet (bot_config), public key'i dondur
//   ready       -> DB trigger'dan gelir: siparisin push aboneliklerine bildirim yolla
import { createClient } from "jsr:@supabase/supabase-js@2";
import * as webpush from "jsr:@negrel/webpush";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

async function cfg(key: string): Promise<string | null> {
  const { data } = await supabase.from("bot_config").select("value").eq("key", key).maybeSingle();
  return data?.value ?? null;
}
async function setCfg(key: string, value: string) {
  await supabase.from("bot_config").upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
}

let appServer: Awaited<ReturnType<typeof webpush.ApplicationServer.new>> | null = null;
async function getAppServer() {
  if (appServer) return appServer;
  const raw = await cfg("vapid_keys");
  if (!raw) return null;
  const vapidKeys = await webpush.importVapidKeys(JSON.parse(raw), { extractable: false });
  appServer = await webpush.ApplicationServer.new({
    contactInformation: "mailto:omerbaycura@gmail.com",
    vapidKeys,
  });
  return appServer;
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  try {
    const secret = await cfg("webhook_secret");
    if (!secret || url.searchParams.get("secret") !== secret) {
      return new Response("forbidden", { status: 403 });
    }

    if (action === "vapid_setup") {
      let raw = await cfg("vapid_keys");
      if (!raw) {
        const keys = await webpush.generateVapidKeys({ extractable: true });
        raw = JSON.stringify(await webpush.exportVapidKeys(keys));
        await setCfg("vapid_keys", raw);
      }
      const keys = await webpush.importVapidKeys(JSON.parse(raw), { extractable: true });
      const applicationServerKey = await webpush.exportApplicationServerKey(keys);
      return Response.json({ ok: true, applicationServerKey });
    }

    if (action === "ready") {
      const payload = await req.json().catch(() => ({}));
      const orderId: string = payload.order_id;
      if (!orderId) return new Response("order_id gerekli", { status: 400 });
      const server = await getAppServer();
      if (!server) return Response.json({ ok: false, error: "vapid kurulmamis" });

      const { data: subs } = await supabase
        .from("push_subscriptions").select("id, subscription").eq("order_id", orderId);
      const items = (payload.items || [])
        .map((i: { name: string; qty: number }) => `${i.qty}× ${i.name}`).join(", ");

      let sent = 0;
      for (const row of subs || []) {
        try {
          const subscriber = server.subscribe(row.subscription);
          await subscriber.pushTextMessage(JSON.stringify({
            title: "Siparişin hazır! 🔔",
            body: (items ? items + " — " : "") + "Gelip alabilirsin · Ready for pickup",
            url: "/menu",
            tag: "nip-ready-" + orderId,
          }), { ttl: 3600 });
          sent++;
        } catch (e) {
          console.error("push gonderilemedi:", e);
        }
        // Tek seferlik bildirim: gonderim denemesi sonrasi abonelik silinir
        await supabase.from("push_subscriptions").delete().eq("id", row.id);
      }
      return Response.json({ ok: true, sent });
    }

    return new Response("Not In Paris web-push fn — hazır");
  } catch (e) {
    console.error(e);
    return new Response("error: " + (e as Error).message, { status: 500 });
  }
});
