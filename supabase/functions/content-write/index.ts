// Vitrin & Blog icerik yazari: kisa bir brief (ve istege bagli fotograf) alir,
// TR/EN/RU baslik + metin uretir. Fotograf SAKLANMAZ, yalnizca yazarken bakilir.
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
    title_tr: { type: "string" }, body_tr: { type: "string" },
    title_en: { type: "string" }, body_en: { type: "string" },
    title_ru: { type: "string" }, body_ru: { type: "string" },
    photo_tip: { type: "string", description: "Bu icerik icin nasil bir fotograf cekilmeli — tek cumle Turkce oneri." },
  },
  required: ["title_tr", "body_tr", "title_en", "body_en", "title_ru", "body_ru", "photo_tip"],
  additionalProperties: false,
};

const BRAND = `Not in Paris — Fethiye'de bir kafe / bar / konsept magaza ve bisiklet kulubu.
Ton: samimi, kisa, biraz esprili, abartisiz; turistlere ve yerel mudavimlere ayni anda hitap eder.
Marka sloganı ruhu: "Paris'te degilsin" — mutevazi ama karakterli.
Asla asiri pazarlama dili, unlem yagmuru ya da klise ("essiz lezzet", "muhtesem deneyim") kullanma.`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST bekleniyor" }, 405);

  try {
    const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: userData } = await supa.auth.getUser(token);
    const uid = userData?.user?.id;
    if (!uid) return json({ error: "Oturum bulunamadi — cikip tekrar giris yap" });
    const { data: staff } = await supa.from("staff").select("role, is_active").eq("auth_id", uid).maybeSingle();
    if (!staff || staff.is_active === false || !["admin", "manager", "owner"].includes(staff.role)) {
      return json({ error: "Yetkisiz: bu ozellik yonetici hesaplari icindir" });
    }

    let apiKey = Deno.env.get("ANTHROPIC_API_KEY") || "";
    if (!apiKey) {
      const { data: cfg } = await supa.from("bot_config").select("value").eq("key", "anthropic_api_key").maybeSingle();
      apiKey = cfg?.value || "";
    }
    if (!apiKey) return json({ error: "AI anahtari tanimli degil" });

    const body = await req.json().catch(() => ({}));
    const brief = typeof body.brief === "string" ? body.brief.trim() : "";
    const kind = body.kind === "urun" ? "urun" : "blog";
    const image = typeof body.image === "string" ? body.image : "";
    if (!brief && !image) return json({ error: "Once kisa bir not yaz ya da fotograf sec" });
    if (brief.length > 1500) return json({ error: "Not cok uzun" });

    const task = kind === "urun"
      ? `Bir MAGAZA URUNU tanitimi yaz (tisort, seramik, bisiklet aksesuari gibi).
2-4 cumle. Urunun hikayesini/ilhamini anlat, kimin sevecegini ima et.
Satis linki YOK — urun kasadan alinir; istersen sonda "kasadan sorabilirsin" tarzi tek kisa cumle olabilir.`
      : `Bir BLOG / HABER yazisi yaz (kafe haberi ya da Fethiye tavsiyesi).
3-6 cumle. Somut ve faydali olsun (nerede, ne zaman, neden degerli).
Musteri siparisini beklerken telefonundan okuyacak — akici ve kisa tut.`;

    const content: Array<Record<string, unknown>> = [];
    if (image) {
      content.push({ type: "image", source: { type: "base64", media_type: body.media_type || "image/jpeg", data: image } });
    }
    content.push({
      type: "text",
      text: `${BRAND}\n\nGOREV:\n${task}\n\n` +
        (image ? "Yukaridaki fotografa bak ve icerigi ONUN uzerine kur (gordugun detaylari kullan).\n" : "") +
        (brief ? `SAHIBIN NOTU: ${brief}\n` : "") +
        `\nCiktı: Turkce basligi ve metni yaz, sonra ayni icerigi Ingilizce ve Rusca'ya cevir (ceviri degil, o dilde dogal yazilmis gibi olsun).\n` +
        `Basliklar kisa olsun (max 6 kelime). photo_tip alanina bu icerik icin nasil bir kare cekilmeli, tek cumle Turkce oneri yaz.`,
    });

    const anthropic = new Anthropic({ apiKey });
    const msg = await anthropic.messages.create({
      model: "claude-opus-5",
      max_tokens: 2000,
      messages: [{ role: "user", content }],
      output_config: { format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
    });

    const textBlock = msg.content.find((b) => b.type === "text");
    const parsed = JSON.parse((textBlock && "text" in textBlock ? textBlock.text : "") || "{}");
    return json({
      title_tr: parsed.title_tr || "", body_tr: parsed.body_tr || "",
      title_en: parsed.title_en || "", body_en: parsed.body_en || "",
      title_ru: parsed.title_ru || "", body_ru: parsed.body_ru || "",
      photo_tip: parsed.photo_tip || "",
    });
  } catch (e) {
    console.error("content-write error:", e);
    const m = e instanceof Error ? e.message : String(e);
    if (/credit balance/i.test(m)) return json({ error: "Anthropic hesabinda kredi yok" });
    if (/401|authentication/i.test(m)) return json({ error: "AI anahtari gecersiz" });
    return json({ error: "Yazma hatasi: " + m });
  }
});
