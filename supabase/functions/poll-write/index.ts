// Oylama sorusu uretici: menuye, yaklasan surus/etkinliklere ve marka tonuna
// bakarak TR/EN/RU secmeli (ya da serbest cevapli) sorular onerir.
// Yalniz yonetici hesaplari cagirabilir; hicbir sey otomatik yayina alinmaz.
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
    polls: {
      type: "array",
      items: {
        type: "object",
        properties: {
          question_tr: { type: "string" },
          question_en: { type: "string" },
          question_ru: { type: "string" },
          allow_free_text: { type: "boolean", description: "true ise musteri kendi cevabini da yazabilir" },
          options: {
            type: "array",
            items: {
              type: "object",
              properties: { tr: { type: "string" }, en: { type: "string" }, ru: { type: "string" } },
              required: ["tr", "en", "ru"],
              additionalProperties: false,
            },
          },
        },
        required: ["question_tr", "question_en", "question_ru", "allow_free_text", "options"],
        additionalProperties: false,
      },
    },
  },
  required: ["polls"],
  additionalProperties: false,
};

const BRAND = `Not in Paris — Fethiye'de bir kafe / bar / konsept magaza ve bisiklet kulubu.
Ton: samimi, kisa, biraz esprili, abartisiz; turistlere ve yerel mudavimlere ayni anda hitap eder.
Marka ruhu: "Paris'te degilsin" — mutevazi ama karakterli.
Asla asiri pazarlama dili ya da klise kullanma. Sorular kisa olsun (max 10 kelime).`;

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
    const brief = typeof body.brief === "string" ? body.brief.trim().slice(0, 800) : "";
    const count = Math.min(Math.max(Number(body.count) || 4, 1), 6);
    const storeId = typeof body.store_id === "string" ? body.store_id : "";

    // Baglam: menudeki urunler + acik olan sorular (tekrar sormasin)
    const [{ data: prods }, { data: cats }, { data: openPolls }] = await Promise.all([
      supa.from("products").select("name, category_id").eq("is_available", true).eq("store_id", storeId).limit(120),
      supa.from("categories").select("id, name").eq("is_active", true).eq("store_id", storeId).limit(40),
      supa.from("polls").select("question").eq("store_id", storeId).eq("is_active", true).limit(30),
    ]);
    const catName: Record<string, string> = {};
    (cats || []).forEach((c: Record<string, string>) => { catName[c.id] = c.name; });
    const menuLines = (prods || []).slice(0, 90)
      .map((p: Record<string, string>) => `${catName[p.category_id] || "?"}: ${p.name}`).join("\n");
    const asked = (openPolls || []).map((p: Record<string, string>) => "- " + p.question).join("\n");

    const anthropic = new Anthropic({ apiKey });
    const msg = await anthropic.messages.create({
      model: "claude-opus-5",
      max_tokens: 3000,
      messages: [{
        role: "user",
        content: `${BRAND}

GOREV: QR menudeki "Oyla" sekmesi icin ${count} adet kisa oylama sorusu uret.
Musteri siparisini beklerken telefondan tek dokunusla cevaplayacak.

Kurallar:
- Cogu soru SECMELI olsun: 2-4 secenek, secenekler cok kisa (1-3 kelime).
- 1 tanesi serbest cevapli olabilir (allow_free_text=true, options bos dizi):
  orn. "Burada hangi DJ'i dinlemek isterdin?", "Menude ne olsa sevinirdin?"
- Sorular ISLETMEYE GERCEKTEN FIKIR VERSIN: yarin hangi cekirdek demlensin,
  pazar surusu nereye, hangi tatli donsun, hangi muzik calsin gibi.
- Menudeki gercek urun adlarini secenek olarak kullanabilirsin.
- Eglenceli ve hafif olsun; anket havasi degil sohbet havasi.
- Ayni soruyu tekrar sorma. Su an acik olanlar:
${asked || "(yok)"}

MENUDEN ORNEKLER:
${menuLines || "(menu bos)"}
${brief ? `\nSAHIBIN NOTU: ${brief}` : ""}

Her soruyu ve secenegi TR, EN, RU yaz (ceviri gibi degil, o dilde dogal).`,
      }],
      output_config: { format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
    });

    const textBlock = msg.content.find((b) => b.type === "text");
    const parsed = JSON.parse((textBlock && "text" in textBlock ? textBlock.text : "") || "{}");
    return json({ polls: Array.isArray(parsed.polls) ? parsed.polls : [] });
  } catch (e) {
    console.error("poll-write error:", e);
    const m = e instanceof Error ? e.message : String(e);
    if (/credit balance/i.test(m)) return json({ error: "Anthropic hesabinda kredi yok" });
    if (/401|authentication/i.test(m)) return json({ error: "AI anahtari gecersiz" });
    return json({ error: "Soru uretilemedi: " + m });
  }
});
