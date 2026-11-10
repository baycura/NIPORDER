// Konsinye aylik hesaplarini e-postayla gonderir (tedarikci basina bir Excel).
//
// Sahip (1.11): "Her ayin 1'i sabahi excel raporlarini cerenbaycura@gmail
// adresine otomatik gonderebilir misin."
//
// Akis: konsinye_hesaplar'dan donemin (varsayilan: gecen ay) satirlari okunur;
// kayit yoksa once kesim yapilir (nip_konsinye_hesap_kes). Her tedarikci icin
// rapor.ts ile XLSX uretilir; hepsi tek e-postaya eklenir. Alicilar ve son
// gonderim sonucu konsinye_mail tablosunda (magaza basina bir satir; yalniz
// personel okur — app_settings anon'a acik oldugu icin KULLANILMADI).
// Cron'dan gelen basarisiz denemede yonetici Telegram'ina uyari gider.
//
// Cagirma: cron (pg_cron + pg_net, nip_konsinye_mail_gonder -> x-nip-cron
// basligi, bot_config.webhook_secret) ya da Konsinye Hesabi sayfasindaki
// "E-postayla gonder" (admin/manager JWT).
//
// E-posta saglayicisi ve gizli degiskenler: mail.ts (BREVO_API_KEY; MAIL_FROM
// istege bagli). Anahtar yoksa fonksiyon acik hata verir, hicbir sey gondermez.
import { createClient } from "npm:@supabase/supabase-js@2";
import { donemEtiketi, dosyaAdi, type Hesap, raporXlsx } from "./rapor.ts";
import { type Ek, eposta, mailGonder } from "./mail.ts";

const PARIS = "c3c6e0c7-1821-4edd-993d-ad960cfbc452";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-nip-cron",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const istanbul = (d = new Date()) => {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })
    .formatToParts(d).reduce((o, x) => (o[x.type] = x.value, o), {} as Record<string, string>);
  return { yil: Number(p.year), ay: Number(p.month), gun: Number(p.day), saat: `${p.hour}:${p.minute}` };
};
// Gecen ay: 'YYYY-MM-01'
const gecenAy = () => {
  const { yil, ay } = istanbul();
  const d = new Date(Date.UTC(yil, ay - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
};
const donemNormalle = (v: unknown): string | null => {
  const m = String(v ?? "").match(/^(\d{4})-(\d{2})(?:-\d{2})?$/);
  if (!m) return null;
  const ay = Number(m[2]);
  if (ay < 1 || ay > 12) return null;
  return `${m[1]}-${m[2]}-01`;
};
const tl = (v: number) => (v < 0 ? "−" : "") + Math.round(Math.abs(v)).toLocaleString("tr-TR") + " ₺";
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function ozetHtml(hesaplar: Hesap[], etiket: string, toplam: number, bekleyen: number): string {
  const satir = hesaplar.map((h) => {
    const biz = h.pay_pct == null ? null : Number(h.pay_pct);
    const oran = biz == null ? "<span style=\"color:#b42318\">pay yazılmadı</span>" : h.pay_karisik ? "karışık" : `%${100 - biz} / %${biz}`;
    const durum = h.durum === "odendi" ? "<span style=\"color:#1a7f37;font-weight:700\">Ödendi</span>" : "Bekliyor";
    const not = [h.duzeltme_notu, h.odeme_notu].filter(Boolean).map((x) => `<div style="color:#8a6d3b;font-size:12px">${esc(String(x))}</div>`).join("");
    return `<tr>
<td style="padding:6px 8px;border-bottom:1px solid #e5e5e5"><b>${esc(h.tedarikci)}</b>${not}</td>
<td style="padding:6px 8px;border-bottom:1px solid #e5e5e5;text-align:center">${Number(h.adet).toLocaleString("tr-TR")}</td>
<td style="padding:6px 8px;border-bottom:1px solid #e5e5e5;text-align:right">${tl(Number(h.perakende))}</td>
<td style="padding:6px 8px;border-bottom:1px solid #e5e5e5;text-align:center;white-space:nowrap">${oran}</td>
<td style="padding:6px 8px;border-bottom:1px solid #e5e5e5;text-align:right;font-weight:700">${tl(Number(h.tedarikci_pay))}</td>
<td style="padding:6px 8px;border-bottom:1px solid #e5e5e5;text-align:center">${durum}</td></tr>`;
  }).join("");
  return `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;margin:0;padding:16px">
<h2 style="margin:0 0 4px;font-size:18px">Konsinye hesapları — ${esc(etiket)}</h2>
<p style="margin:0 0 14px;color:#555">Not in Paris · tedarikçi başına bir Excel ekte (${hesaplar.length} dosya). Paylar etiket (perakende) fiyatı üzerinden; indirim ve ikram bizim paydan düşer.</p>
<table style="border-collapse:collapse;min-width:520px;font-size:13px">
<thead><tr style="background:#222;color:#fff">
<th style="padding:7px 8px;text-align:left">Tedarikçi</th><th style="padding:7px 8px">Adet</th><th style="padding:7px 8px;text-align:right">Perakende</th><th style="padding:7px 8px">Tedarikçi / NIP</th><th style="padding:7px 8px;text-align:right">Ödenecek</th><th style="padding:7px 8px">Durum</th></tr></thead>
<tbody>${satir}</tbody>
<tfoot><tr style="background:#f2f2f2;font-weight:700"><td style="padding:7px 8px">Toplam ödenecek</td><td></td><td></td><td></td><td style="padding:7px 8px;text-align:right">${tl(toplam)}</td><td style="padding:7px 8px;text-align:center">bekleyen ${tl(bekleyen)}</td></tr></tfoot>
</table>
<p style="margin:14px 0 0;color:#555;font-size:12px">Ödeme yapılınca "Ödendi" işareti: <a href="https://order.notinparis.me/konsinye">order.notinparis.me/konsinye</a>. Bu e-posta her ayın 1'inde kendiliğinden gönderilir.</p>
</body></html>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST bekleniyor" }, 405);

  const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // --- Yetki: cron sirri ya da yonetici oturumu (eur-rate-sync ile ayni kalip) ---
  const cronHeader = req.headers.get("x-nip-cron") || "";
  let allowed = false, cron = false, admin = false;
  if (cronHeader) {
    const { data: cfg } = await supa.from("bot_config").select("value").eq("key", "webhook_secret").maybeSingle();
    allowed = !!cfg?.value && cronHeader === cfg.value;
    cron = allowed; admin = allowed;
  } else {
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: userData } = token ? await supa.auth.getUser(token) : { data: null };
    const uid = userData?.user?.id;
    if (uid) {
      const { data: staff } = await supa.from("staff").select("role, is_active, store_ids").eq("auth_id", uid).maybeSingle();
      allowed = !!staff && staff.is_active !== false && ["admin", "manager", "owner"].includes(staff.role);
      admin = !!staff && ["admin", "owner"].includes(staff.role);
    }
  }
  if (!allowed) return json({ error: "Yetkisiz" }, 401);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { body = {}; }
  const storeId = typeof body.store_id === "string" && body.store_id ? body.store_id : PARIS;
  const donem = donemNormalle(body.donem) || gecenAy();
  const etiket = donemEtiketi(donem);
  const simdi = istanbul();
  const hazirlanma = `${simdi.gun}.${simdi.ay}.${simdi.yil}`;

  // --- Alicilar: ayar; admin istekte ayri adres verebilir ---
  const { data: ayar } = await supa.from("konsinye_mail").select("alicilar").eq("store_id", storeId).maybeSingle();
  let alicilar: string[] = Array.isArray(ayar?.alicilar) ? (ayar!.alicilar as unknown[]).map(String) : [];
  if (admin && Array.isArray(body.to) && body.to.length) alicilar = (body.to as unknown[]).map(String);
  alicilar = [...new Set(alicilar.map((a) => a.trim().toLowerCase()).filter(eposta))];

  const sonucYaz = async (ok: boolean, mesaj: string, ekstra: Record<string, unknown> = {}) => {
    const value = { at: new Date().toISOString(), donem, ok, mesaj, alicilar, kaynak: cron ? "cron" : "panel", ...ekstra };
    try {
      await supa.from("konsinye_mail").upsert({ store_id: storeId, son: value, updated_at: new Date().toISOString() }, { onConflict: "store_id" });
    } catch (_e) { /* kayit yazilamazsa e-posta sonucu degismez */ }
    if (!ok && cron) {
      try {
        const { data: yon } = await supa.from("staff").select("telegram_chat_id").eq("role", "admin").eq("is_active", true).not("telegram_chat_id", "is", null);
        for (const y of yon || []) {
          await supa.rpc("nip_tg_gonder", { p_chat_id: String(y.telegram_chat_id), p_metin: `⚠️ Konsinye e-postası (${etiket}) gönderilemedi: ${mesaj}\nElle: order.notinparis.me/konsinye → E-postayla gönder`, p_kaynak: "konsinye_mail" });
        }
      } catch (_e) { /* telegram yoksa sessiz */ }
    }
  };

  if (!alicilar.length) {
    const m = "Alıcı yok: konsinye_mail tablosunda bu mağaza için adres yok.";
    await sonucYaz(false, m);
    return json({ error: m }, 400);
  }

  // --- Hesaplar; yoksa once kes ---
  const oku = async () => {
    const { data, error } = await supa.from("konsinye_hesaplar").select("*").eq("store_id", storeId).eq("donem", donem)
      .order("tedarikci_pay", { ascending: false }).order("tedarikci");
    if (error) throw new Error("konsinye_hesaplar okunamadı: " + error.message);
    return (data || []) as Hesap[];
  };
  let hesaplar: Hesap[];
  try {
    hesaplar = await oku();
    if (!hesaplar.length) {
      const { error } = await supa.rpc("nip_konsinye_hesap_kes", { p_store_id: storeId, p_donem: donem });
      if (error) throw new Error("kesim yapılamadı: " + error.message);
      hesaplar = await oku();
    }
  } catch (e) {
    const m = (e as Error).message;
    await sonucYaz(false, m);
    return json({ error: m }, 500);
  }

  const toplam = hesaplar.reduce((t, h) => t + Number(h.tedarikci_pay || 0), 0);
  const bekleyen = hesaplar.filter((h) => h.durum !== "odendi").reduce((t, h) => t + Number(h.tedarikci_pay || 0), 0);
  const ekler: Ek[] = hesaplar.map((h) => ({ ad: dosyaAdi(h.tedarikci, h.donem), icerik: raporXlsx(h, hazirlanma) }));
  const konu = hesaplar.length
    ? `Konsinye hesapları — ${etiket}: ${hesaplar.length} tedarikçi, ödenecek ${tl(toplam)}`
    : `Konsinye hesapları — ${etiket}: konsinye satışı yok`;
  const html = hesaplar.length
    ? ozetHtml(hesaplar, etiket, toplam, bekleyen)
    : `<!doctype html><html><body style="font-family:Arial,sans-serif;font-size:14px;padding:16px"><h2 style="font-size:18px;margin:0 0 8px">Konsinye hesapları — ${esc(etiket)}</h2><p>Bu ay konsinye ürün satışı kaydı yok; ek dosya yok.</p></body></html>`;

  try {
    const saglayici = await mailGonder(alicilar, konu, html, ekler);
    await sonucYaz(true, `${hesaplar.length} dosya gönderildi (${saglayici}).`, { dosyalar: ekler.map((e) => e.ad), toplam });
    return json({ ok: true, donem, alicilar, dosyalar: ekler.map((e) => e.ad), toplam, saglayici });
  } catch (e) {
    const m = (e as Error).message;
    await sonucYaz(false, m, { dosyalar: ekler.map((e) => e.ad), toplam });
    return json({ error: m }, 502);
  }
});
