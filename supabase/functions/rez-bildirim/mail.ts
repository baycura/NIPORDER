// E-posta gonderici (Brevo ya da Resend). konsinye-mail ve rez-bildirim ayni
// dosyayi kullanir; degisiklik iki klasorde de yapilir.
//
// Gizli degiskenler (Supabase > Edge Functions > Secrets):
//   BREVO_API_KEY  -> api.brevo.com  (ucretsiz; gonderici e-postasi dogrulanir)
//   RESEND_API_KEY -> api.resend.com (alan adi dogrulamasi ister)
//   MAIL_FROM      -> istege bagli: "Not in Paris <adres>". Yoksa Brevo
//                     hesabindaki dogrulanmis ilk gonderici kullanilir.
// Anahtar yoksa ya da saglayici anahtari reddederse MailHata("anahtar-yok")
// firlatilir; hicbir sey gonderilmez.

export type Ek = { ad: string; icerik: Uint8Array };
export type Gonderici = { ad: string; adres: string };

export class MailHata extends Error {
  kod: string;
  constructor(kod: string, mesaj: string) { super(mesaj); this.kod = kod; }
}

export const eposta = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

export const b64 = (u8: Uint8Array) => {
  let s = "";
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(s);
};

function gondericiOku(): Gonderici | null {
  const raw = (Deno.env.get("MAIL_FROM") || "").trim();
  if (!raw) return null;
  const m = raw.match(/^(.*?)\s*<([^>]+)>$/);
  const adres = (m ? m[2] : raw).trim();
  if (!eposta(adres)) return null;
  return { ad: (m ? m[1].replace(/^"|"$/g, "").trim() : "") || "Not in Paris", adres };
}

// Saglayici anahtari reddederse (401) bu da kurulum eksigidir: yeni anahtar
// girilene kadar deneme sayilmaz.
const GECERSIZ = "E-posta anahtarı geçersiz (sağlayıcı reddetti). Supabase > Edge Functions > Secrets bölümündeki BREVO_API_KEY yeniden girilmeli.";

// Brevo: MAIL_FROM yoksa hesabin dogrulanmis (active) ilk gondericisi.
// Bulunan adres bu calisma ornegi boyunca saklanir (her postada yeniden sorulmaz).
// Liste okunamazsa (yanlis anahtar, ag hatasi) bu bir saglayici hatasidir;
// "gonderici yok" yalniz liste geldiginde ve dogrulanmis adres olmadiginda denir.
let bulunanGonderici: { key: string; g: Gonderici } | null = null;
async function brevoGonderici(key: string): Promise<Gonderici | null> {
  if (bulunanGonderici && bulunanGonderici.key === key) return bulunanGonderici.g;
  let r: Response;
  try {
    r = await fetch("https://api.brevo.com/v3/senders", { headers: { "api-key": key, Accept: "application/json" } });
  } catch (e) {
    throw new MailHata("saglayici", `Brevo'ya ulaşılamadı: ${String((e as Error)?.message || e).slice(0, 200)}`);
  }
  if (r.status === 401) throw new MailHata("anahtar-yok", GECERSIZ);
  if (!r.ok) throw new MailHata("saglayici", `Brevo ${r.status}: ${(await r.text()).slice(0, 300)}`);
  let j: Record<string, unknown> = {};
  try { j = await r.json(); } catch (_e) { j = {}; }
  const liste = (Array.isArray(j?.senders) ? j.senders : []) as Record<string, unknown>[];
  const s = liste.find((x) => x.active && eposta(String(x.email || "")));
  if (!s) return null;
  const g = { ad: "Not in Paris", adres: String(s.email) };
  bulunanGonderici = { key, g };
  return g;
}

export const mailHazirMi = () => !!(Deno.env.get("BREVO_API_KEY") || Deno.env.get("RESEND_API_KEY"));

// Gonderir; donen: saglayici adi. Hata: MailHata.
export async function mailGonder(alicilar: string[], konu: string, html: string, ekler: Ek[] = []): Promise<string> {
  const brevo = Deno.env.get("BREVO_API_KEY");
  const resend = Deno.env.get("RESEND_API_KEY");
  if (!brevo && !resend) {
    throw new MailHata("anahtar-yok", "E-posta anahtarı yok. Supabase > Edge Functions > Secrets bölümüne BREVO_API_KEY girilmeli.");
  }
  const sabit = gondericiOku();
  if (brevo) {
    const g = sabit || await brevoGonderici(brevo);
    if (!g) throw new MailHata("gonderici-yok", "Brevo'da doğrulanmış gönderici adresi yok. Brevo > Senders bölümünde bir adres doğrula.");
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": brevo, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        sender: { name: g.ad, email: g.adres },
        to: alicilar.map((email) => ({ email })),
        subject: konu,
        htmlContent: html,
        ...(ekler.length ? { attachment: ekler.map((e) => ({ name: e.ad, content: b64(e.icerik) })) } : {}),
      }),
    });
    if (res.status === 401) throw new MailHata("anahtar-yok", GECERSIZ);
    if (!res.ok) throw new MailHata("saglayici", `Brevo ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return "brevo";
  }
  const from = sabit ? `${sabit.ad} <${sabit.adres}>` : "Not in Paris <onboarding@resend.dev>";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resend}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from, to: alicilar, subject: konu, html,
      ...(ekler.length ? { attachments: ekler.map((e) => ({ filename: e.ad, content: b64(e.icerik) })) } : {}),
    }),
  });
  if (res.status === 401) throw new MailHata("anahtar-yok", GECERSIZ);
  if (!res.ok) throw new MailHata("saglayici", `Resend ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return "resend";
}
