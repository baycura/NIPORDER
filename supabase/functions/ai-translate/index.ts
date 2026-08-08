// AI ceviri — Turkce metni EN + RU'ya cevirir (duyuru seridi, urun aciklamalari vb.)
// Yalniz aktif yonetici personel; anahtar: env ANTHROPIC_API_KEY ya da bot_config.
import { createClient } from "npm:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    en: { type: "string", description: "English translation" },
    ru: { type: "string", description: "Russian translation" },
  },
  required: ["en", "ru"],
  additionalProperties: false,
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST bekleniyor" }, 405);

  try {
    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: userData } = await supa.auth.getUser(token);
    const uid = userData?.user?.id;
    if (!uid) return json({ error: "Oturum bulunamadi — cikip tekrar giris yap" });
    const { data: staff } = await supa
      .from("staff").select("id, role, is_active").eq("auth_id", uid).maybeSingle();
    if (!staff || staff.is_active === false || !["admin", "manager", "owner"].includes(staff.role)) {
      return json({ error: "Yetkisiz: bu ozellik yonetici hesaplari icindir" });
    }

    let apiKey = Deno.env.get("ANTHROPIC_API_KEY") || "";
    if (!apiKey) {
      const { data: cfg } = await supa
        .from("bot_config").select("value").eq("key", "anthropic_api_key").maybeSingle();
      apiKey = cfg?.value || "";
    }
    if (!apiKey) return json({ error: "AI anahtari tanimli degil" });

    const body = await req.json().catch(() => ({}));
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!text) return json({ error: "Cevrilecek metin bos" });
    if (text.length > 2000) return json({ error: "Metin cok uzun (max 2000 karakter)" });

    const anthropic = new Anthropic({ apiKey });
    const msg = await anthropic.messages.create({
      model: "claude-opus-5",
      max_tokens: 1000,
      messages: [{
        role: "user",
        content: "Asagidaki Turkce kafe/bar duyurusunu Ingilizce ve Ruscaya cevir. " +
          "Pazarlama tonunu koru, kisa ve vurucu olsun; emoji, fiyat, sayi ve marka adlarini aynen birak.\n\n" + text,
      }],
      output_config: { format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
    });

    const textBlock = msg.content.find((b) => b.type === "text");
    const parsed = JSON.parse((textBlock && "text" in textBlock ? textBlock.text : "") || "{}");
    return json({ en: parsed.en || "", ru: parsed.ru || "" });
  } catch (e) {
    console.error("ai-translate error:", e);
    const m = e instanceof Error ? e.message : String(e);
    if (/credit balance/i.test(m)) return json({ error: "Anthropic hesabinda kredi yok — console.anthropic.com > Billing'den kredi yukle" });
    if (/401|authentication/i.test(m)) return json({ error: "AI anahtari gecersiz" });
    return json({ error: "Ceviri hatasi: " + m });
  }
});
