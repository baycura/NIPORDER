// Not In Paris — Telegram bildirim fonksiyonu (v2)
//
// Rotalar (?action=):
//   webhook        -> Telegram guncellemeleri; "/start <staff_id>" ile kisiyi baglar
//   setup&secret=  -> webhook'u bu fonksiyona kaydeder (bir kez)
//   send&secret=&to=&text= -> manuel/test mesaj
//   notify&secret= -> DB trigger'lari cagirir (yeni siparis / hazir)
//   shift_summary&secret= -> vardiya kapaninca calisanin ozeti sahibe (DB trigger)
//   daily_summary&secret= -> sabah 09:00 TR sahip ozeti (pg_cron cagirir)
//
// Hedefleme kurali: bildirim SADECE "su an vardiyasi aktif" (shifts.status='active'),
// is_active=true VE Telegram'a bagli (staff.telegram_chat_id dolu) personele gider.
// Izinli/mesai disi kimse rahatsiz edilmez. Sabah ozeti: admin + viewer (aile) bagli olanlara.
// YEDEK: hedeflerin hicbirine ulasilamazsa bildirim sahiplere duser ve her deneme
// tg_notify_log'a yazilir (kime, kac kisiye) — "bildirim gelmedi" bakilabilir olsun.

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

// Donen sayi DENENEN degil GERCEKLESEN alici sayisidir; tg_notify_log buna
// guveniyor. Tek bir alicinin hatasi (bot engellenmis, sohbet silinmis) digerlerini
// de dusurmesin diye hatalar alici basina yutuluyor.
async function sendTo(chatIds: string[], text: string) {
  const unique = [...new Set(chatIds.filter(Boolean))];
  const sonuc = await Promise.all(unique.map(async (id) => {
    try {
      const r = await tg("sendMessage", { chat_id: id, text });
      return !!(r as { ok?: boolean })?.ok;
    } catch (e) {
      console.error("telegram gonderilemedi", id, e);
      return false;
    }
  }));
  return sonuc.filter(Boolean).length;
}

// Su an vardiyasi aktif + Telegram bagli personel
async function activeStaff() {
  const { data: shifts } = await supabase.from("shifts").select("staff_id").eq("status", "active");
  const ids = (shifts || []).map((s: { staff_id: string }) => s.staff_id);
  if (!ids.length) return [];
  const { data: staff } = await supabase
    .from("staff").select("id, name, role, telegram_chat_id")
    .in("id", ids).eq("is_active", true).not("telegram_chat_id", "is", null);
  return staff || [];
}

// Vardiyada Telegram'a bagli kimse yoksa bildirim bugune kadar KIMSEYE
// gitmiyordu: liste bos donuyor, fonksiyon sessizce 0 deyip geciyordu.
// Son 15 QR siparisinin 6'sinda o gune ait hic vardiya kaydi yoktu ve
// o alti siparisin altisi da iptale dustu. Artik sahiplere dusuyor.
async function ownerChats() {
  const { data } = await supabase
    .from("staff").select("telegram_chat_id")
    .eq("role", "admin").eq("is_active", true).not("telegram_chat_id", "is", null);
  return (data || []).map((a: { telegram_chat_id: string }) => a.telegram_chat_id);
}

// Her bildirim denemesi kaydedilir. Log yazilamazsa bildirim akisi durmasin.
async function logNotify(orderId: string, event: string, sent: number, target: string, detail?: string) {
  if (!orderId) return;
  try {
    await supabase.from("tg_notify_log")
      .insert({ order_id: orderId, event, sent_count: sent, target, detail: detail ?? null });
  } catch (e) {
    console.error("tg_notify_log yazilamadi", e);
  }
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
    if (["setup", "send", "notify", "daily_summary", "shift_summary"].includes(action || "")) {
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
        let n = await sendTo(targets, `🆕 Yeni sipariş — ${label}\n${itemsText(items)}`);
        let hedef = kitchen.length ? "mutfak" : "vardiya";
        // Kimseye ulasmadiysa siparis sahipsiz kalmasin.
        if (n === 0) {
          n = await sendTo(await ownerChats(),
            `⚠️ VARDİYADA KİMSE YOK — yeni sipariş\n${label}\n${itemsText(items)}`);
          hedef = n ? "sahip_yedek" : "kimse";
        }
        await logNotify(payload.order_id, kind, n, hedef);
        return Response.json({ ok: true, sent: n, target: hedef });
      }

      if (kind === "items_ready") {
        // Hazir -> siparisi acan garson (vardiyadaysa); degilse vardiyadaki garsonlar; o da yoksa herkes
        const opener = staff.find((s: any) => s.id === (order as any)?.staff_id);
        const waiters = staff.filter((s: any) => ["waiter", "cashier"].includes(s.role));
        const targets = (opener ? [opener] : (waiters.length ? waiters : staff)).map((s: any) => s.telegram_chat_id);
        let n = await sendTo(targets, `✅ Hazır — ${label}\n${itemsText(items)}\nServis edilebilir.`);
        let hedef = opener ? "garson" : "vardiya";
        if (n === 0) {
          n = await sendTo(await ownerChats(),
            `⚠️ VARDİYADA KİMSE YOK — sipariş hazır, servis eden yok\n${label}\n${itemsText(items)}`);
          hedef = n ? "sahip_yedek" : "kimse";
        }
        await logNotify(payload.order_id, kind, n, hedef);
        return Response.json({ ok: true, sent: n, target: hedef });
      }

      return new Response("bilinmeyen kind", { status: 400 });
    }

    // --- Vardiya kapaninca: calisanin vardiya ozeti sahibe (DB trigger cagirir) ---
    if (action === "shift_summary") {
      const payload = await req.json().catch(() => ({}));
      const shiftId: string = payload.shift_id;
      if (!shiftId) return new Response("shift_id gerekli", { status: 400 });

      const { data: sh } = await supabase
        .from("shifts").select("id, staff_id, date, checked_in_at, checked_out_at")
        .eq("id", shiftId).maybeSingle();
      if (!sh) return new Response("vardiya yok", { status: 404 });

      const { data: st } = await supabase
        .from("staff").select("name, role").eq("id", (sh as any).staff_id).maybeSingle();
      const kim = (st as any)?.name || "Çalışan";

      const inAt = (sh as any).checked_in_at ? new Date((sh as any).checked_in_at) : null;
      const outAt = (sh as any).checked_out_at ? new Date((sh as any).checked_out_at) : new Date();
      if (!inAt) return Response.json({ ok: true, skipped: "giris saati yok" });

      // Vardiya sirasinda ACILAN siparisler; odenmisler ciro, odenmemisler uyari
      const { data: ords } = await supabase
        .from("orders").select("id, total, status, created_at")
        .eq("staff_id", (sh as any).staff_id)
        .gte("created_at", inAt.toISOString())
        .lte("created_at", outAt.toISOString());
      const all = ords || [];
      const paid = all.filter((o: any) => PAID.includes(o.status));
      const open = all.filter((o: any) => !PAID.includes(o.status) && o.status !== "cancelled");
      const ciro = paid.reduce((t: number, o: any) => t + Number(o.total || 0), 0);
      const acik = open.reduce((t: number, o: any) => t + Number(o.total || 0), 0);

      const saat = (d: Date) => d.toLocaleTimeString("tr-TR", { timeZone: "Europe/Istanbul", hour: "2-digit", minute: "2-digit" });
      const dk = Math.max(0, Math.round((outAt.getTime() - inAt.getTime()) / 60000));
      const sure = `${Math.floor(dk / 60)}s ${dk % 60}dk`;
      const fmt = (n: number) => "₺" + Math.round(n).toLocaleString("tr-TR");

      let text = `👤 Vardiya bitti — ${kim}\n` +
        `🕐 ${saat(inAt)} – ${saat(outAt)} (${sure})\n` +
        `💰 Ciro: ${fmt(ciro)} (${paid.length} sipariş` +
        (paid.length ? `, ort ${fmt(ciro / paid.length)}` : "") + `)`;
      if (open.length) text += `\n⚠️ Ödenmemiş ${open.length} sipariş: ${fmt(acik)}`;

      const { data: owners } = await supabase
        .from("staff").select("telegram_chat_id")
        .eq("role", "admin").eq("is_active", true)
        .not("telegram_chat_id", "is", null);
      const n = await sendTo((owners || []).map((a: any) => a.telegram_chat_id), text);
      return Response.json({ ok: true, sent: n, ciro });
    }

    // --- Sabah 09:00 TR: dunun ozeti (admin'lere) ---
    if (action === "daily_summary") {
      const now = Date.now();
      const tr = new Date(now + TR_OFFSET_MS);
      const todayTrMidnightUtc = Date.UTC(tr.getUTCFullYear(), tr.getUTCMonth(), tr.getUTCDate()) - TR_OFFSET_MS;
      // Isletme gunu 03:00'te biter: "dun" = dun 03:00 -> bugun 03:00 (TR).
      // Ozet 09:00 TR'de kosar, yani bugunku 03:00 hep geride kalmistir.
      const DAY_END_MS = 3 * 3600 * 1000;
      const start = new Date(todayTrMidnightUtc + DAY_END_MS - 86400000);
      const end = new Date(todayTrMidnightUtc + DAY_END_MS);
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
        .from("staff").select("telegram_chat_id")
        .in("role", ["admin", "viewer"]).eq("is_active", true)
        .not("telegram_chat_id", "is", null);
      const n = await sendTo((admins || []).map((a: any) => a.telegram_chat_id), text);
      return Response.json({ ok: true, sent: n, revenue, kitchenOwed });
    }

    // --- Fatura kaydinda anormal fiyat artisi -> sahibe uyari ---
    // Secret degil personel JWT'siyle korunur: Faturalar sayfasi dogrudan cagirir.
    if (action === "price_alert") {
      const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
      const { data: userData } = await supabase.auth.getUser(token);
      const uid = userData?.user?.id;
      if (!uid) return new Response("forbidden", { status: 403 });
      const { data: caller } = await supabase
        .from("staff").select("id, role, is_active").eq("auth_id", uid).maybeSingle();
      if (!caller || (caller as any).is_active === false || !["admin", "manager", "owner", "waiter", "cashier", "kitchen"].includes((caller as any).role)) {
        return new Response("forbidden", { status: 403 });
      }
      const payload = await req.json().catch(() => ({}));
      const alerts: Array<{ name: string; unit?: string; prev: number; now: number; pct: number }> = payload.alerts || [];
      if (!alerts.length) return Response.json({ ok: true, sent: 0 });
      const money = (n: number) => "₺" + Number(n).toFixed(2);
      const lines = alerts.slice(0, 20).map((a) =>
        `• ${a.name}: ${money(a.prev)} → ${money(a.now)}${a.unit ? "/" + a.unit : ""} (+%${Math.round(a.pct)})`
      ).join("\n");
      const text = `⚠️ Anormal fiyat artışı — ${payload.supplier || "fatura"}\n${lines}`;
      const { data: owners } = await supabase
        .from("staff").select("telegram_chat_id")
        .in("role", ["admin", "viewer"]).eq("is_active", true)
        .not("telegram_chat_id", "is", null);
      const n = await sendTo((owners || []).map((a: any) => a.telegram_chat_id), text);
      return Response.json({ ok: true, sent: n });
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
