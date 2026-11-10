// E-posta gonderici (Brevo ya da Resend). konsinye-mail ve rez-bildirim ayni
// dosyayi kullanir; degisiklik iki klasorde de yapilir.
//
// Gizli degiskenler (Supabase > Edge Functions > Secrets):
//   BREVO_API_KEY  -> api.brevo.com  (ucretsiz; gonderici e-postasi dogrulanir)
//   RESEND_API_KEY -> api.resend.com (alan adi dogrulamasi ister)
//   MAIL_FROM      -> istege bagli: "Not in Paris <adres>". Yoksa Brevo
//                     hesabindaki dogrulanmis ilk gonderici kullanilir.
// Anahtar yoksa MailHata("anahtar-yok") firlatilir; hicbir sey gonderilmez.

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

// Brevo: MAIL_FROM yoksa hesabin dogrulanmis (active) ilk gondericisi.
async function brevoGonderici(key: string): Promise<Gonderici | null> {
  try {
    const r = await fetch("https://api.brevo.com/v3/senders", { headers: { "api-key": key, Accept: "application/json" } });
    if (!r.ok) return null;
    const j = await r.json();
    const s = (Array.isArray(j?.senders) ? j.senders : []).find((x: Record<string, unknown>) => x.active && eposta(String(x.email || "")));
    return s ? { ad: "Not in Paris", adres: String(s.email) } : null;
  } catch (_e) {
    return null;
  }
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
  if (!res.ok) throw new MailHata("saglayici", `Resend ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return "resend";
}
