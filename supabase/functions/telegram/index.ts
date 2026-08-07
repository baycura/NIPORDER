// Not In Paris — Telegram bildirim fonksiyonu
//
// Tek edge function; su rotalari ?action= ile ayirir:
//   ?action=setup&secret=...        -> webhook'u bu fonksiyona kaydeder (bir kez)
//   ?action=send&secret=...&to=&text=  -> test/manuel mesaj
//   ?action=webhook                 -> Telegram guncellemelerini alir (kayit akisi)
//
// Token ve webhook_secret DB'deki kilitli `bot_config` tablosunda (service role okur).
// verify_jwt=false ile deploy edilir; setup/send rotalari `secret` ile, webhook
// rotasi Telegram'in gonderdigi gizli header ile korunur.

import { createClient } from "jsr:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

async function cfg(key: string): Promise<string | null> {
  const { data } = await supabase.from("bot_config").select("value").eq("key", key).maybeSingle();
  return data?.value ?? null;
}

async function tg(method: string, body: Record<string, unknown>) {
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN") || (await cfg("telegram_bot_token"));
  if (!token) throw new Error("bot token yok");
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return await res.json();
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  try {
    // --- Korumali rotalar (setup / send): ?secret= dogrulamasi ---
    if (action === "setup" || action === "send") {
      const secret = await cfg("webhook_secret");
      if (!secret || url.searchParams.get("secret") !== secret) {
        return new Response("forbidden", { status: 403 });
      }
    }

    // --- Bir kez: webhook'u bu fonksiyona kaydet ---
    if (action === "setup") {
      const self = `${url.origin}${url.pathname}?action=webhook`;
      const secret = await cfg("webhook_secret");
      const r = await tg("setWebhook", {
        url: self,
        secret_token: secret,
        allowed_updates: ["message"],
      });
      return Response.json({ ok: true, webhook: self, telegram: r });
    }

    // --- Manuel/test mesaj ---
    if (action === "send") {
      const to = url.searchParams.get("to");
      const text = url.searchParams.get("text") || "Not In Paris — test ✅";
      if (!to) return new Response("to gerekli", { status: 400 });
      return Response.json(await tg("sendMessage", { chat_id: to, text }));
    }

    // --- Telegram webhook alicisi (kayit akisi) ---
    if (action === "webhook") {
      const secret = await cfg("webhook_secret");
      const got = req.headers.get("x-telegram-bot-api-secret-token");
      if (secret && got !== secret) return new Response("forbidden", { status: 403 });

      const update = await req.json().catch(() => ({}));
      const msg = update.message;
      const chat = msg?.chat;
      const text: string = msg?.text || "";

      if (chat) {
        // Derin baglanti ile kayit: "/start <staff_id>"
        const m = text.match(/^\/start\s+([A-Za-z0-9._-]+)/);
        if (m) {
          const staffId = m[1];
          const { data: staff } = await supabase
            .from("staff")
            .update({ telegram_chat_id: String(chat.id) })
            .eq("id", staffId)
            .select("name")
            .maybeSingle();
          await tg("sendMessage", {
            chat_id: chat.id,
            text: staff
              ? `✅ Merhaba ${staff.name || ""}! Telegram bildirimlerin açıldı. Siparişlerden buradan haberdar olacaksın.`
              : "Bağlantı kodu geçersiz. Lütfen uygulamadaki 'Telegram bildirimlerini aç' butonunu kullan.",
          });
        } else if (text.startsWith("/start")) {
          await tg("sendMessage", {
            chat_id: chat.id,
            text: "Merhaba! Bildirimleri açmak için uygulamadaki 'Telegram bildirimlerini aç' butonuna dokun.",
          });
        }
      }
      return new Response("ok");
    }

    return new Response("Not In Paris telegram fn — hazır");
  } catch (e) {
    console.error(e);
    return new Response("error: " + (e as Error).message, { status: 500 });
  }
});
