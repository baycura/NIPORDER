// Not In Paris — Telegram bildirim fonksiyonu (v2)
//
// Rotalar (?action=):
//   webhook        -> Telegram guncellemeleri; "/start <staff_id>" ile kisiyi baglar
//   setup&secret=  -> webhook'u bu fonksiyona kaydeder (bir kez)
//   send&secret=&to=&text= -> manuel/test mesaj
//   notify&secret= -> DB trigger'lari cagirir (yeni siparis / hazir)
//   daily_summary&secret= -> sabah 09:00 TR sahip ozeti (pg_cron cagirir)
//
// Hedefleme kurali: bildirim SADECE "su an vardiyasi aktif" (shifts.status='active')
// VE Telegram'a bagli (staff.telegram_chat_id dolu) personele gider. Izinli/mesai
// disi kimse rahatsiz edilmez. Sahip ozeti: role='admin' + bagli olanlara.

import { createClient } from "jsr:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const PARIS_STORE_ID = "c3c6e0c7-1821-4edd-993d-ad960cfbc452";
const DONER_STORE_ID = "c39da530-7f73-4f69-a752-029bf03790b1";
const TR_OFFSET_MS = 3 * 3600 * 1000; // Europe/Istanbul = UTC+3 (sabit, DST yok)
const PAID = ["paid", "completed", "served", "closed"];

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

async function sendTo(chatIds: string[], text: string) {
  const unique = [...new Set(chatIds.filter(Boolean))];
  await Promise.all(unique.map((id) => tg("sendMessage", { chat_id: id, text })));
  return unique.length;
}

// Su an vardiyasi aktif + Telegram bagli personel
async function activeStaff() {
  const { data: shifts } = await supabase.from("shifts").select("staff_id").eq("status", "active");
  const ids = (shifts || []).map((s: { staff_id: string }) => s.staff_id);
  if (!ids.length) return [];
  const { data: staff } = await supabase
    .from("staff").select("id, name, role, telegram_chat_id")
    .in("id", ids).not("telegram_chat_id", "is", null);
  return staff || [];
}

async function orderLabel(orderId: string) {
  const { data: o } = await supabase
    .from("orders").select("id, staff_id, customer_name, cafe_tables(name)")
    .eq("id", orderId).maybeSingle();
  const table = (o as any)?.cafe_tables?.name;
  return { order: o, label: table ? `Masa ${table}` : ((o as any)?.customer_name || "Sipariş") };
}

function itemsText(items: Array<{ name: string; qty: number }>) {
  return items.map((i) => `${i.qty}× ${i.name}`).join("\n");
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  try {
    if (["setup", "send", "notify", "daily_summary"].includes(action || "")) {
      const secret = await cfg("webhook_secret");
      if (!secret || url.searchParams.get("secret") !== secret) {
        return new Response("forbidden", { status: 403 });
      }
    }

    if (action === "setup") {
      const self = `${url.origin}${url.pathname}?action=webhook`;
      const secret = await cfg("webhook_secret");
      const r = await tg("setWebhook", { url: self, secret_token: secret, allowed_updates: ["message"] });
      return Response.json({ ok: true, webhook: self, telegram: r });
    }

    if (action === "send") {
      const to = url.searchParams.get("to");
      const text = url.searchParams.get("text") || "Not In Paris — test ✅";
      if (!to) return new Response("to gerekli", { status: 400 });
      return Response.json(await tg("sendMessage", { chat_id: to, text }));
    }

    // --- DB trigger'lardan: yeni siparis kalemleri / hazir kalemler ---
    if (action === "notify") {
      const payload = await req.json().catch(() => ({}));
      const kind: string = payload.kind;
      const items: Array<{ name: string; qty: number }> = payload.items || [];
      const { order, label } = await orderLabel(payload.order_id);
      const staff = await activeStaff();

      if (kind === "items_sent") {
        // Yeni siparis -> vardiyadaki mutfak personeli; mutfakci yoksa herkese
        const kitchen = staff.filter((s: any) => s.role === "kitchen");
        const targets = (kitchen.length ? kitchen : staff).map((s: any) => s.telegram_chat_id);
        const n = await sendTo(targets, `🆕 Yeni sipariş — ${label}\n${itemsText(items)}`);
        return Response.json({ ok: true, sent: n });
      }

      if (kind === "items_ready") {
        // Hazir -> siparisi acan garson (vardiyadaysa); degilse vardiyadaki garsonlar; o da yoksa herkes
        const opener = staff.find((s: any) => s.id === (order as any)?.staff_id);
        const waiters = staff.filter((s: any) => ["waiter", "cashier"].includes(s.role));
        const targets = (opener ? [opener] : (waiters.length ? waiters : staff)).map((s: any) => s.telegram_chat_id);
        const n = await sendTo(targets, `✅ Hazır — ${label}\n${itemsText(items)}\nServis edilebilir.`);
        return Response.json({ ok: true, sent: n });
      }

      return new Response("bilinmeyen kind", { status: 400 });
    }

    // --- Sabah 09:00 TR: dunun ozeti (admin'lere) ---
    if (action === "daily_summary") {
      const now = Date.now();
      const tr = new Date(now + TR_OFFSET_MS);
      const todayTrMidnightUtc = Date.UTC(tr.getUTCFullYear(), tr.getUTCMonth(), tr.getUTCDate()) - TR_OFFSET_MS;
      const start = new Date(todayTrMidnightUtc - 86400000);
      const end = new Date(todayTrMidnightUtc);
      const dayLabel = start.toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul", day: "numeric", month: "long", weekday: "long" });
      const weekday = new Date(start.getTime() + TR_OFFSET_MS).getUTCDay(); // 0=Paz
      const isPartyDay = [3, 5, 6].includes(weekday); // Car, Cum, Cmt

      const { data: orders } = await supabase
        .from("orders").select("id, total, status, created_at, origin_store_id")
        .gte("created_at", start.toISOString()).lt("created_at", end.toISOString());
      const paidOrders = (orders || []).filter((o: any) => PAID.includes(o.status));
      const revenue = paidOrders.reduce((s: number, o: any) => s + Number(o.total || 0), 0);

      const paidIds = paidOrders.map((o: any) => o.id);
      let topText = "—";
      let kitchenOwed = 0;
      let partyRevenue = 0;
      if (paidIds.length) {
        const { data: items } = await supabase
          .from("order_items")
          .select("order_id, product_name, quantity, final_price, product_price, kitchen_destination_store_id")
          .in("order_id", paidIds);
        const count: Record<string, number> = {};
        for (const it of items || []) {
          const name = (it as any).product_name || "?";
          count[name] = (count[name] || 0) + Number((it as any).quantity || 1);
          const lineTotal = Number((it as any).quantity || 1) * Number((it as any).final_price ?? (it as any).product_price ?? 0);
          const ord = paidOrders.find((o: any) => o.id === (it as any).order_id);
          if (ord && (ord as any).origin_store_id === PARIS_STORE_ID && (it as any).kitchen_destination_store_id === DONER_STORE_ID) {
            kitchenOwed += lineTotal;
          }
        }
        topText = Object.entries(count).sort((a, b) => b[1] - a[1]).slice(0, 3)
          .map(([n, q]) => `${n} ×${q}`).join(", ") || "—";
        if (isPartyDay) {
          partyRevenue = paidOrders
            .filter((o: any) => {
              const h = new Date(new Date((o as any).created_at).getTime() + TR_OFFSET_MS).getUTCHours();
              return h >= 22 || h < 4;
            })
            .reduce((s: number, o: any) => s + Number((o as any).total || 0), 0);
        }
      }

      const fmt = (n: number) => "₺" + Math.round(n).toLocaleString("tr-TR");
      let text = `📊 Not In Paris — ${dayLabel}\n` +
        `💰 Ciro: ${fmt(revenue)} (${paidOrders.length} sipariş)\n` +
        `🥙 Mutfağa ödenecek: ${fmt(kitchenOwed)}\n` +
        `🏆 En çok: ${topText}`;
      if (isPartyDay) text += `\n🎉 Parti (22:00+): ${fmt(partyRevenue)}`;

      const { data: admins } = await supabase
        .from("staff").select("telegram_chat_id").eq("role", "admin").not("telegram_chat_id", "is", null);
      const n = await sendTo((admins || []).map((a: any) => a.telegram_chat_id), text);
      return Response.json({ ok: true, sent: n, revenue, kitchenOwed });
    }

    // --- Telegram webhook (kayit akisi) ---
    if (action === "webhook") {
      const secret = await cfg("webhook_secret");
      const got = req.headers.get("x-telegram-bot-api-secret-token");
      if (secret && got !== secret) return new Response("forbidden", { status: 403 });

      const update = await req.json().catch(() => ({}));
      const msg = update.message;
      const chat = msg?.chat;
      const text: string = msg?.text || "";

      if (chat) {
        const m = text.match(/^\/start\s+([A-Za-z0-9._-]+)/);
        if (m) {
          const { data: staff } = await supabase
            .from("staff").update({ telegram_chat_id: String(chat.id) })
            .eq("id", m[1]).select("name").maybeSingle();
          await tg("sendMessage", {
            chat_id: chat.id,
            text: staff
              ? `✅ Merhaba ${staff.name || ""}! Telegram bildirimlerin açıldı. Vardiyadayken siparişlerden buradan haberdar olacaksın.`
              : "Bağlantı kodu geçersiz. Lütfen uygulamadaki 'Telegram bildirimlerini aç' butonunu kullan.",
          });
        } else if (text.startsWith("/start")) {
          await tg("sendMessage", {
            chat_id: chat.id,
            text: "Merhaba! Bildirimleri açmak için uygulamadaki Vardiyam sayfasından 'Telegram bildirimlerini aç' butonuna dokun.",
          });
        }
      }
      return new Response("ok");
    }

    return new Response("Not In Paris telegram fn v2 — hazır");
  } catch (e) {
    console.error(e);
    return new Response("error: " + (e as Error).message, { status: 500 });
  }
});
