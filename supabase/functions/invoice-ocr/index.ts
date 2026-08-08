// Fatura OCR — fatura fotografindan tedarikci/tarih/kalem cikarimi (Claude vision).
// Fotograf SAKLANMAZ: istemci kucultulmus JPEG gonderir, yalnizca JSON sonucu doner.
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
    supplier_name: { type: "string", description: "Tedarikci/firma adi. Okunamiyorsa bos string." },
    invoice_date: { type: "string", description: "Fatura tarihi, YYYY-MM-DD. Okunamiyorsa bos string." },
    lines: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "Urun/kalem adi, faturada yazildigi gibi" },
          qty: { type: "number", description: "Miktar" },
          unit: { type: "string", enum: ["ml", "l", "g", "kg", "adet", "sise", "kasa"], description: "Birim — en yakinini sec (sise = şişe)" },
          unit_cost: { type: "number", description: "BIRIM fiyat, TL. Satir toplami verilmisse miktara bol." },
        },
        required: ["name", "qty", "unit", "unit_cost"],
        additionalProperties: false,
      },
    },
  },
  required: ["supplier_name", "invoice_date", "lines"],
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

    // Aktif calisan personel (fatura girisi sabahci garson dahil; gozlemci/part-time haric)
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: userData } = await supa.auth.getUser(token);
    const uid = userData?.user?.id;
    if (!uid) return json({ error: "Oturum bulunamadi — cikip tekrar giris yap" });
    const { data: staff } = await supa
      .from("staff").select("id, role, is_active").eq("auth_id", uid).maybeSingle();
    if (!staff || staff.is_active === false || !["admin", "manager", "owner", "waiter", "cashier", "kitchen"].includes(staff.role)) {
      return json({ error: "Yetkisiz: bu ozellik personel hesaplari icindir" });
    }

    // API anahtari: once ortam degiskeni, yoksa bot_config
    let apiKey = Deno.env.get("ANTHROPIC_API_KEY") || "";
    if (!apiKey) {
      const { data: cfg } = await supa
        .from("bot_config").select("value").eq("key", "anthropic_api_key").maybeSingle();
      apiKey = cfg?.value || "";
    }
    if (!apiKey) {
      return json({ error: "AI anahtari tanimli degil. console.anthropic.com'dan anahtar alip bot_config tablosuna 'anthropic_api_key' olarak kaydedin." });
    }

    const body = await req.json().catch(() => ({}));
    const image = typeof body.image === "string" ? body.image : "";
    if (!image) return json({ error: "Fotograf verisi eksik" });
    if (image.length > 8_000_000) return json({ error: "Fotograf cok buyuk — kucultup tekrar dene" });
    const mediaType = ["image/jpeg", "image/png", "image/webp"].includes(body.media_type)
      ? body.media_type : "image/jpeg";

    const anthropic = new Anthropic({ apiKey });
    const msg = await anthropic.messages.create({
      model: "claude-opus-5",
      max_tokens: 4000,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: image } },
          {
            type: "text",
            text: "Bu bir tedarikci faturasi/irsaliye/fis fotografi. Tedarikci adini, fatura tarihini ve TUM urun kalemlerini cikar. " +
              "Her kalem icin: urun adi (faturadaki haliyle), miktar, birim ve BIRIM fiyat (satir toplami degil — yalniz satir toplami goruluyorsa miktara bolerek birim fiyati hesapla). " +
              "Tarihi YYYY-MM-DD formatina cevir. Emin olamadigin alanlari bos string ya da 0 birak; asla uydurma.",
          },
        ],
      }],
      output_config: { format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
    });

    const textBlock = msg.content.find((b) => b.type === "text");
    const parsed = JSON.parse((textBlock && "text" in textBlock ? textBlock.text : "") || "{}");
    return json({
      supplier_name: typeof parsed.supplier_name === "string" ? parsed.supplier_name : "",
      invoice_date: typeof parsed.invoice_date === "string" ? parsed.invoice_date : "",
      lines: Array.isArray(parsed.lines) ? parsed.lines : [],
    });
  } catch (e) {
    console.error("invoice-ocr error:", e);
    const m = e instanceof Error ? e.message : String(e);
    if (/credit balance/i.test(m)) return json({ error: "Anthropic hesabinda kredi yok — console.anthropic.com > Billing'den kredi yukle" });
    if (/401|authentication/i.test(m)) return json({ error: "AI anahtari gecersiz — bot_config'teki anahtari kontrol et" });
    return json({ error: "AI okuma hatasi: " + m });
  }
});
