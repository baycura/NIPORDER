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
          vat_pct: { type: "number", description: "Satirin KDV orani yuzde olarak (0, 1, 10, 20 gibi). Faturada gorunmuyorsa 0." },
          discount_pct: { type: "number", description: "Satirin ISKONTO orani yuzde olarak (Isknt %, Iskonto, Indirim sutunu). Yoksa 0. %100 ise mal bedelsiz gelmistir." },
          list_unit_cost: { type: "number", description: "Faturada YAZAN liste birim fiyati (iskonto ve KDV oncesi), TL. Kontrol icin." },
          unit_cost: { type: "number", description: "ODENEN NET birim fiyat: iskonto DUSULMUS ve KDV EKLENMIS hali, TL. pack_type ne ise ONUN fiyati (koli ise koli, adet ise sise). Bedelsiz satirda 0." },
          pack_type: { type: "string", enum: ["koli", "adet"], description: "Satir koli/kasa olarak mi yoksa tek sise/adet olarak mi faturalanmis" },
          pack_qty: { type: "number", description: "Koli icindeki sise/adet sayisi (KOLI-24, 24'LU, 1x24 gibi ifadelerden). Tek adetse 1." },
          content_cl: { type: "number", description: "Bir sisenin/ficinin hacmi CL cinsinden (70cl=70, 33cl=33, 1L=100, 30L fici=3000, 50L fici=5000). Hacim yoksa 0." },
        },
        required: ["name", "qty", "unit", "vat_pct", "discount_pct", "list_unit_cost", "unit_cost", "pack_type", "pack_qty", "content_cl"],
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
              "Her kalem icin: urun adi (faturadaki haliyle), miktar, birim, satirin KDV orani (vat_pct) ve KDV DAHIL birim fiyat. " +
              "EN ONEMLI - ISKONTO: Turk toptanci faturalarinda 'Isknt %' / 'Iskonto Tutari' / 'Indirim' sutunu bulunur ve " +
              "'Birim Fiyat' ile 'Mal Hizmet Tutari' sutunlari ISKONTODAN ONCEKI liste degerleridir. ISKONTOYU ASLA ATLAMA. " +
              "Once satirin liste tutarini bul (miktar x liste birim fiyat), sonra iskonto tutarini DUS, sonra KDV EKLE, sonra miktara BOL. " +
              "Yani: unit_cost = ((miktar x liste_birim_fiyat) - iskonto_tutari) / miktar x (1 + vat_pct/100). " +
              "Iskonto yuzde olarak verilmisse tutari kendin hesapla. Iskonto %100 ise mal BEDELSIZ gelmistir: unit_cost = 0 (stoga yine girer, maliyeti sifirdir). " +
              "list_unit_cost alanina faturada YAZAN liste birim fiyatini, discount_pct alanina iskonto oranini yaz. " +
              "ONEMLI - KDV: Satir fiyatlari genelde KDV HARICTIR; oran ayri sutunda (%1, %10, %20) ya da altta KDV ozetinde yazar. " +
              "DOGRULAMA: butun satirlarin unit_cost x miktar toplami, faturanin GENEL TOPLAM (odenecek) tutarina yakin olmali — " +
              "'Toplam Tutar'a degil, iskonto dusulmus 'Genel Toplam'a. Tutmuyorsa iskontoyu atlamis olabilirsin, tekrar bak. " +
              "ONEMLI - KOLI/SISE: Turk toptanci faturalarinda miktar sutunu genelde KOLI/KASA adedini gosterir; asil stok ise ICINDEKI SISE adedidir. " +
              "Urun adinda ya da aciklamada gecen 'KOLI-24', '24'LU', '1x12', '12li' gibi ifadelerden koli ici adedi (pack_qty) cikar. " +
              "Ayrica sise/fici hacmini urun adindan cikar (33cl, 50cl, 70cl, 1L) ve content_cl alanina CL cinsinden yaz (1L=100). " +
              "ONEMLI - FICI BIRA: Fici (keg/draft/'FIC'/'KEG') kalemlerinde hacim LITRE yazar ve genelde 30L ya da 50L olur; " +
              "content_cl'ye litreyi 100 ile carparak yaz (30L=3000, 50L=5000). 30 ile 50'yi karistirma — fatura satirinda hangisi yaziyorsa onu al; " +
              "Fici daima pack_type='adet' olarak gelir (koli degil). " +
              "Hacim faturada YAZMIYORSA isletmenin kurallarini kullan: EFES fici = 50L (content_cl 5000), BUD fici = 30L (content_cl 3000). " +
              "Bu yalniz hacim gorunmedigi durumda gecerlidir — faturada acik bir litre yaziyorsa DAIMA faturadaki deger onceliklidir. " +
              "Baska bir marka ficisi hacimsiz geliyorsa 0 birak, tahmin etme. " +
              "qty alanina faturadaki miktari (kac koli ya da kac sise) yaz, pack_type ile hangisi oldugunu belirt. " +
              "Tarihi YYYY-MM-DD formatina cevir. Emin olamadigin alanlari bos string ya da 0 birak; asla uydurma.",
          },
        ],
      }],
      output_config: { format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
    });

    const textBlock = msg.content.find((b) => b.type === "text");
    const parsed = JSON.parse((textBlock && "text" in textBlock ? textBlock.text : "") || "{}");
    const lines = (Array.isArray(parsed.lines) ? parsed.lines : []).map((l: Record<string, unknown>) => ({
      ...l,
      unit_cost: Math.round(Number(l.unit_cost || 0) * 100) / 100,
      vat_pct: Number(l.vat_pct || 0),
      discount_pct: Number(l.discount_pct || 0),
      list_unit_cost: Math.round(Number(l.list_unit_cost || 0) * 100) / 100,
      pack_type: l.pack_type === "koli" ? "koli" : "adet",
      pack_qty: Math.max(1, Math.round(Number(l.pack_qty || 1))),
      content_cl: Number(l.content_cl || 0),
    }));
    return json({
      supplier_name: typeof parsed.supplier_name === "string" ? parsed.supplier_name : "",
      invoice_date: typeof parsed.invoice_date === "string" ? parsed.invoice_date : "",
      lines,
    });
  } catch (e) {
    console.error("invoice-ocr error:", e);
    const m = e instanceof Error ? e.message : String(e);
    if (/credit balance/i.test(m)) return json({ error: "Anthropic hesabinda kredi yok — console.anthropic.com > Billing'den kredi yukle" });
    if (/401|authentication/i.test(m)) return json({ error: "AI anahtari gecersiz — bot_config'teki anahtari kontrol et" });
    return json({ error: "AI okuma hatasi: " + m });
  }
});
