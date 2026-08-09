// Serbest metinden recete: "4cl gin, 2cl campari, 2cl kirmizi vermut, buz, portakal kabugu"
// -> mevcut hammaddelerle eslestirilmis {ingredient_id, qty} listesi.
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
    lines: {
      type: "array",
      items: {
        type: "object",
        properties: {
          ingredient_id: { type: "string", description: "Listeden secilen hammaddenin id'si. Listede yoksa bos string." },
          new_name: { type: "string", description: "Listede yoksa onerilen yeni hammadde adi, varsa bos string." },
          new_unit: { type: "string", enum: ["ml", "cl", "l", "g", "kg", "adet", ""], description: "Yeni hammadde icin birim; mevcutsa bos." },
          qty: { type: "number", description: "Miktar — hammaddenin KENDI biriminde (ml ise ml, adet ise adet)." },
          note: { type: "string", description: "Kisa aciklama, orn: '4cl = 40ml'. Yoksa bos." },
        },
        required: ["ingredient_id", "new_name", "new_unit", "qty", "note"],
        additionalProperties: false,
      },
    },
  },
  required: ["lines"],
  additionalProperties: false,
};

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
    const text = typeof body.text === "string" ? body.text.trim() : "";
    const productName = typeof body.product_name === "string" ? body.product_name : "";
    if (!text) return json({ error: "Recete metni bos" });
    if (text.length > 2000) return json({ error: "Metin cok uzun" });

    // Eslestirme icin mevcut hammadde listesi
    const { data: ings } = await supa.from("ingredients").select("id, name, unit").order("name");
    const catalog = (ings || []).map((i) => `${i.id}|${i.name}|${i.unit}`).join("\n");

    const anthropic = new Anthropic({ apiKey });
    const msg = await anthropic.messages.create({
      model: "claude-opus-5",
      max_tokens: 2000,
      messages: [{
        role: "user",
        content:
          "Bir kafe/bar icin urun recetesini yapilandiracaksin.\n\n" +
          "MEVCUT HAMMADDELER (id|ad|birim):\n" + catalog + "\n\n" +
          (productName ? "URUN: " + productName + "\n" : "") +
          "RECETE METNI:\n" + text + "\n\n" +
          "Kurallar:\n" +
          "- Her satiri mevcut hammaddelerden BIRINE esle ve o hammaddenin id'sini ingredient_id'ye yaz.\n" +
          "- Miktari hammaddenin KENDI birimine cevir: hammadde ml ise 4cl -> 40, 1 shot -> 40, 'top/tamamla' -> 100; hammadde adet ise 1 dilim -> 1.\n" +
          "- 'buz', 'ice' gecerse buz hammaddesini g cinsinden ~150 ekle.\n" +
          "- Esleme yoksa ingredient_id'yi bos birak, new_name ve new_unit oner (asla uydurma marka ekleme).\n" +
          "- Garnitur/sunum notlarini (kabuk, dal, süsleme) ancak somut bir hammadde varsa ekle.\n" +
          "- Ayni hammaddeyi iki kez yazma.",
      }],
      output_config: { format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
    });

    const textBlock = msg.content.find((b) => b.type === "text");
    const parsed = JSON.parse((textBlock && "text" in textBlock ? textBlock.text : "") || "{}");
    const valid = new Set((ings || []).map((i) => i.id));
    const lines = (Array.isArray(parsed.lines) ? parsed.lines : [])
      .map((l: Record<string, unknown>) => ({
        ingredient_id: valid.has(String(l.ingredient_id)) ? String(l.ingredient_id) : "",
        new_name: String(l.new_name || ""),
        new_unit: String(l.new_unit || ""),
        qty: Math.max(0, Number(l.qty) || 0),
        note: String(l.note || ""),
      }))
      .filter((l) => l.ingredient_id || l.new_name);

    return json({ lines });
  } catch (e) {
    console.error("recipe-parse error:", e);
    const m = e instanceof Error ? e.message : String(e);
    if (/credit balance/i.test(m)) return json({ error: "Anthropic hesabinda kredi yok" });
    if (/401|authentication/i.test(m)) return json({ error: "AI anahtari gecersiz" });
    return json({ error: "Okuma hatasi: " + m });
  }
});
