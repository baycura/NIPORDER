// Rezervasyon onayi -> musteriye e-posta.
//
// Sahip (10.11): "Rezervasyon onaylandiktan sonra da karsiya bildirim gitmeli."
//
// Akis: Order veritabani her 10 dakikada (ve panelde "Onayla"dan hemen sonra)
// RESERVE'den onaylanan rezervasyonlari ceker, nip_reserve_onay_bildirim
// tablosuna yazar ve gonderilecekleri bu fonksiyona yollar
// (nip_reserve_onay_gonder -> pg_net, x-nip-cron = bot_config.webhook_secret).
// Fonksiyon her kayit icin e-postayi gonderir ve sonucu ayni tabloya yazar:
//   gonderildi | eposta_yok | hata (anahtar-yok: deneme sayilmaz)
// Panel (Rezervasyon sayfasi) durumu karttan gosterir; e-postasi olmayan
// misafir icin "WhatsApp'tan haber ver" dugmesi vardir.
//
// Kaynak: talep musteri menusunden (uygulama) acildiysa e-postadaki dugme
// siteye degil menudeki "Rezervasyonlarim"a gider (kaynak = "uygulama").
//
// E-posta saglayicisi: mail.ts (BREVO_API_KEY). Dil: uyenin dili (tr/en/ru).
import { createClient } from "npm:@supabase/supabase-js@2";
import { eposta, MailHata, mailGonder } from "./mail.ts";

const SITE = "https://reservation.notinparis.me";
const UYGULAMA = (Deno.env.get("APP_URL") || "https://order.notinparis.me").replace(/\/+$/, "");
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

interface Kayit {
  rez_id: string; ad?: string | null; eposta?: string | null; dil?: string | null;
  etkinlik?: string | null; tarih?: string | null; saat?: string | null;
  kisi?: number | null; qr_id?: string | null; deneme?: number | null;
  kaynak?: string | null;   // "uygulama": musteri menusunden acilan talep
}

const YEREL: Record<string, string> = { tr: "tr-TR", en: "en-GB", ru: "ru-RU" };
function tarihYaz(tarih: string | null | undefined, dil: string): string {
  if (!tarih) return "";
  const d = new Date(tarih + "T12:00:00Z");
  if (isNaN(d.getTime())) return String(tarih);
  return new Intl.DateTimeFormat(YEREL[dil] || "tr-TR", { day: "numeric", month: "long", weekday: "long", timeZone: "UTC" }).format(d);
}

const METIN: Record<string, Record<string, string>> = {
  tr: {
    konu: "Rezervasyonun onaylandı", selam: "Merhaba", onay: "Rezervasyonun onaylandı.",
    etkinlik: "Etkinlik", tarih: "Tarih", kisi: "Kişi", kod: "Kod", kisiBirim: "kişi",
    dugme: "Biletini aç", kapi: "Kapıda QR kodunu göster. Bilet tek kullanımlıktır.",
    yol: "Bilet: siteye giriş yap, Biletlerim bölümünü aç.", iptal: "Gelemeyeceksen lütfen bize haber ver.",
    dugmeUyg: "Rezervasyonunu aç", kapiUyg: "Kapıda bu kodu göster. Kod tek kullanımlıktır.",
    yolUyg: "Rezervasyonun menüde: Etkinlik sekmesi, Rezervasyonlarım.",
  },
  en: {
    konu: "Your reservation is confirmed", selam: "Hello", onay: "Your reservation is confirmed.",
    etkinlik: "Event", tarih: "Date", kisi: "Guests", kod: "Code", kisiBirim: "",
    dugme: "Open your ticket", kapi: "Show your QR code at the door. The ticket is single-use.",
    yol: "Ticket: sign in on the site and open My Tickets.", iptal: "If you cannot come, please let us know.",
    dugmeUyg: "Open your reservation", kapiUyg: "Show this code at the door. The code is single-use.",
    yolUyg: "Your reservation is in the menu: Events tab, My reservations.",
  },
  ru: {
    konu: "Ваша бронь подтверждена", selam: "Здравствуйте", onay: "Ваша бронь подтверждена.",
    etkinlik: "Событие", tarih: "Дата", kisi: "Гостей", kod: "Код", kisiBirim: "",
    dugme: "Открыть билет", kapi: "Покажите QR-код на входе. Билет одноразовый.",
    yol: "Билет: войдите на сайт и откройте раздел «Мои билеты».", iptal: "Если не сможете прийти, пожалуйста, сообщите нам.",
    dugmeUyg: "Открыть бронь", kapiUyg: "Покажите этот код на входе. Код одноразовый.",
    yolUyg: "Бронь в меню: вкладка «События», «Мои брони».",
  },
};

export function rezPosta(k: Kayit): { konu: string; html: string } {
  const dil = METIN[String(k.dil || "tr")] ? String(k.dil || "tr") : "tr";
  const m = METIN[dil];
  const tarih = [tarihYaz(k.tarih, dil), k.saat].filter(Boolean).join(" · ");
  const kisi = Math.max(1, Number(k.kisi) || 1);
  const uyg = k.kaynak === "uygulama";
  const adres = uyg ? `${UYGULAMA}/menu?rez=${encodeURIComponent(String(k.qr_id || ""))}` : SITE;
  const satir = (ad: string, deger: string) => deger
    ? `<tr><td style="padding:7px 14px 7px 0;color:#777;font-size:13px;white-space:nowrap;vertical-align:top">${esc(ad)}</td><td style="padding:7px 0;font-size:15px;font-weight:700;color:#111">${esc(deger)}</td></tr>`
    : "";
  const konu = `${m.konu} — ${k.etkinlik || "Not in Paris"}${tarih ? " · " + tarihYaz(k.tarih, dil) : ""}`;
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f4f4f2;font-family:Arial,Helvetica,sans-serif;color:#111">
<div style="max-width:520px;margin:0 auto;padding:24px 16px">
  <div style="background:#000;color:#fff;padding:18px 20px;border-radius:10px 10px 0 0;font-size:18px;font-weight:700;letter-spacing:2px">NOT IN PARIS</div>
  <div style="background:#fff;padding:22px 20px;border-radius:0 0 10px 10px;border:1px solid #e3e3e0;border-top:none">
    <p style="margin:0 0 6px;font-size:15px">${esc(m.selam)}${k.ad ? " " + esc(String(k.ad).trim().split(/\s+/)[0]) : ""},</p>
    <p style="margin:0 0 16px;font-size:20px;font-weight:700;color:#1a7f37">✓ ${esc(m.onay)}</p>
    <table style="border-collapse:collapse;margin:0 0 18px">
      ${satir(m.etkinlik, String(k.etkinlik || ""))}
      ${satir(m.tarih, tarih)}
      ${satir(m.kisi, `${kisi}${m.kisiBirim ? " " + m.kisiBirim : ""}`)}
      ${satir(m.kod, String(k.qr_id || ""))}
    </table>
    <a href="${esc(adres)}" style="display:inline-block;background:#000;color:#fff;text-decoration:none;padding:13px 22px;border-radius:8px;font-weight:700;font-size:14px">${esc(uyg ? m.dugmeUyg : m.dugme)}</a>
    <p style="margin:18px 0 4px;font-size:13px;color:#444;line-height:1.5">${esc(uyg ? m.kapiUyg : m.kapi)}</p>
    <p style="margin:0 0 4px;font-size:13px;color:#444;line-height:1.5">${esc(uyg ? m.yolUyg : m.yol)}</p>
    <p style="margin:0;font-size:13px;color:#444;line-height:1.5">${esc(m.iptal)}</p>
  </div>
  <p style="margin:12px 4px 0;font-size:11px;color:#999">Not in Paris · Fethiye · ${uyg ? "order.notinparis.me" : "reservation.notinparis.me"}</p>
</div></body></html>`;
  return { konu, html };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "POST bekleniyor" }, 405);
  const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Yetki: yalniz veritabani (cron / RPC) cagirir
  const cronHeader = req.headers.get("x-nip-cron") || "";
  const { data: cfg } = await supa.from("bot_config").select("value").eq("key", "webhook_secret").maybeSingle();
  if (!cronHeader || !cfg?.value || cronHeader !== cfg.value) return json({ error: "Yetkisiz" }, 401);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { body = {}; }
  const kayitlar = (Array.isArray(body.kayitlar) ? body.kayitlar : []) as Kayit[];
  const sonuc = { gonderildi: 0, eposta_yok: 0, hata: 0 };

  // Kayit yazilamazsa bir kez daha dener (yazilamayan basarili gonderim
  // sonraki turda yeniden postalanirdi).
  const yaz = async (id: string, alan: Record<string, unknown>) => {
    for (let i = 0; i < 2; i++) {
      try {
        const { error } = await supa.from("nip_reserve_onay_bildirim")
          .update({ ...alan, son: new Date().toISOString() }).eq("rez_id", id);
        if (!error) return;
      } catch (_e) { /* bir kez daha dene */ }
    }
  };
  // Deneme veritabaninda, gonderim aninda sayilir (nip_reserve_onay_gonder).
  // Kurulum eksikse (anahtar ya da gonderici yok) o deneme geri verilir:
  // anahtar girilince posta kendiliginden gider.
  const geriVer = (k: Kayit) => Math.max(0, (Number(k.deneme) || 1) - 1);

  let kurulumEksik = "";
  for (const k of kayitlar.slice(0, 50)) {
    if (!k?.rez_id) continue;
    const adres = String(k.eposta || "").trim().toLowerCase();
    if (!eposta(adres)) { await yaz(k.rez_id, { durum: "eposta_yok", hata: null }); sonuc.eposta_yok++; continue; }
    if (kurulumEksik) { await yaz(k.rez_id, { durum: "hata", hata: kurulumEksik, deneme: geriVer(k) }); sonuc.hata++; continue; }
    try {
      const { konu, html } = rezPosta(k);
      await mailGonder([adres], konu, html);
      await yaz(k.rez_id, { durum: "gonderildi", hata: null });
      sonuc.gonderildi++;
    } catch (e) {
      const kod = e instanceof MailHata ? e.kod : "hata";
      if (kod === "anahtar-yok" || kod === "gonderici-yok") {
        kurulumEksik = kod;
        await yaz(k.rez_id, { durum: "hata", hata: kod, deneme: geriVer(k) });
      } else {
        await yaz(k.rez_id, { durum: "hata", hata: String((e as Error).message || e).slice(0, 300) });
      }
      sonuc.hata++;
    }
  }
  return json({ ok: true, ...sonuc });
});
