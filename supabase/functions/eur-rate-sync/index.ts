// Euro kuru otomatik guncelleyici.
// Kaynak sirasi: TCMB (resmi doviz satis) -> frankfurter.app (yedek).
// Kuru app_settings['eur_rate'] alanina yazar; oradaki tetikleyici euro
// fiyatli tum urunlerin TL fiyatini yeniler.
//
// GUVENLIK PAYI: kur bir onceki degere gore %X'ten fazla siciyorsa (varsayilan
// %10) YAZILMAZ — bozuk veri fiyatlari altust etmesin. Atlanan guncelleme
// app_settings['eur_rate_note'] alanina yazilir, Ayarlar sayfasinda gorunur.
//
// Cagirma: cron (pg_cron + pg_net) ya da Ayarlar'daki "Simdi guncelle" dugmesi.
// Yetki: cron icin x-nip-cron basligi (bot_config.webhook_secret), panel icin
// oturum acmis yonetici JWT'si.
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-nip-cron",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const num = (v: unknown) => {
  const n = Number(String(v ?? "").replace(",", ".").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

// TCMB gunluk kur (hafta sonu/tatilde son is gunu dosyasi doner)
async function fromTCMB(): Promise<{ rate: number; source: string } | null> {
  try {
    const res = await fetch("https://www.tcmb.gov.tr/kurlar/today.xml", {
      headers: { "User-Agent": "NIPORDER/1.0" },
    });
    if (!res.ok) return null;
    const xml = await res.text();
    const block = xml.match(/<Currency[^>]*CurrencyCode="EUR"[\s\S]*?<\/Currency>/i)?.[0];
    if (!block) return null;
    const sell = num(block.match(/<ForexSelling>([^<]*)<\/ForexSelling>/i)?.[1]);
    const buy = num(block.match(/<ForexBuying>([^<]*)<\/ForexBuying>/i)?.[1]);
    const rate = sell || buy;
    if (!rate) return null;
    const date = xml.match(/Date="([^"]+)"/)?.[1] || "";
    return { rate, source: "TCMB döviz satış" + (date ? " (" + date + ")" : "") };
  } catch (_e) {
    return null;
  }
}

// Yedek kaynak: frankfurter.app (ECB verisi, anahtar gerektirmez)
async function fromFrankfurter(): Promise<{ rate: number; source: string } | null> {
  try {
    const res = await fetch("https://api.frankfurter.app/latest?from=EUR&to=TRY");
    if (!res.ok) return null;
    const data = await res.json();
    const rate = num(data?.rates?.TRY);
    if (!rate) return null;
    return { rate, source: "frankfurter.app" + (data?.date ? " (" + data.date + ")" : "") };
  } catch (_e) {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST bekleniyor" }, 405);

  const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // --- Yetki: cron sirri ya da yonetici oturumu ---
  const cronHeader = req.headers.get("x-nip-cron") || "";
  let allowed = false;
  if (cronHeader) {
    const { data: cfg } = await supa.from("bot_config").select("value").eq("key", "webhook_secret").maybeSingle();
    allowed = !!cfg?.value && cronHeader === cfg.value;
  } else {
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: userData } = await supa.auth.getUser(token);
    const uid = userData?.user?.id;
    if (uid) {
      const { data: staff } = await supa.from("staff").select("role, is_active").eq("auth_id", uid).maybeSingle();
      allowed = !!staff && staff.is_active !== false && ["admin", "manager", "owner"].includes(staff.role);
    }
  }
  if (!allowed) return json({ error: "Yetkisiz" }, 401);

  // --- Kuru cek ---
  const picked = (await fromTCMB()) || (await fromFrankfurter());
  if (!picked) return json({ error: "Kur kaynaklarina ulasilamadi" }, 502);

  const { data: stores } = await supa.from("stores").select("id, name");
  const results: Array<Record<string, unknown>> = [];

  for (const store of stores || []) {
    const { data: rows } = await supa.from("app_settings").select("key, value").eq("store_id", store.id);
    const get = (k: string) => rows?.find((r: Record<string, unknown>) => r.key === k)?.value;

    const auto = get("eur_rate_auto");
    if (auto === false || auto === "false") {
      results.push({ store: store.name, skipped: "otomatik kapali" });
      continue;
    }

    const markup = num(get("eur_rate_markup_pct"));            // istege bagli pay (%)
    const maxJump = num(get("eur_rate_max_jump_pct")) || 10;   // guvenlik bandi (%)
    const current = num(get("eur_rate"));
    const next = Math.round(picked.rate * (1 + markup / 100) * 100) / 100;

    if (current > 0 && Math.abs(next - current) / current * 100 > maxJump) {
      const note = "Kur %" + maxJump + "'den fazla degisti (" + current + " -> " + next + "). Guvenlik icin yazilmadi — Ayarlar'dan elle onayla.";
      await supa.from("app_settings").upsert(
        { key: "eur_rate_note", value: note, store_id: store.id },
        { onConflict: "key,store_id" },
      );
      results.push({ store: store.name, skipped: note, current, proposed: next });
      continue;
    }

    // eur_rate yazilinca tetikleyici euro fiyatli urunleri yeniler
    const stamp = new Date().toISOString();
    await supa.from("app_settings").upsert([
      { key: "eur_rate", value: String(next), store_id: store.id },
      { key: "eur_rate_updated_at", value: stamp, store_id: store.id },
      { key: "eur_rate_source", value: picked.source, store_id: store.id },
      { key: "eur_rate_note", value: "", store_id: store.id },
    ], { onConflict: "key,store_id" });

    const { count } = await supa.from("products")
      .select("id", { count: "exact", head: true })
      .eq("store_id", store.id).eq("currency", "EUR");

    results.push({ store: store.name, previous: current, rate: next, source: picked.source, eur_products: count ?? 0 });
  }

  return json({ ok: true, fetched: picked.rate, source: picked.source, results });
});
