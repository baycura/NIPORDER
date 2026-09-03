// Musteriye HATA KODU degil, SEBEP gosterilir.
//
// Eskiden ekrana Postgres'in kendi metni dusuyordu:
//   "Could not save: duplicate key value violates unique constraint
//    customers_phone_key"
// Musteri bundan ne yapacagini anlamiyor. Burasi teknik hatayi tek cumlelik,
// ne yapmasi gerektigini soyleyen bir metne cevirir. Ham hata konsola yazilir —
// gelistirici icin kaybolmaz, musterinin ekranina cikmaz.

const M = {
  telefon_kayitli: {
    tr: "Bu telefon numarası başka bir kayıtta görünüyor. Numaranı kontrol et ya da bize söyle, hallederiz.",
    en: "This phone number is already on another record. Check the number or let us know and we will sort it out.",
    ru: "Этот номер уже указан в другой записи. Проверьте номер или скажите нам — мы поможем.",
  },
  eposta_kayitli: {
    tr: "Bu e-posta adresi zaten kayıtlı.",
    en: "This email address is already registered.",
    ru: "Этот адрес электронной почты уже зарегистрирован.",
  },
  zaten_kayitli: {
    tr: "Bu bilgi zaten kayıtlı.",
    en: "This information is already on record.",
    ru: "Эта информация уже сохранена.",
  },
  eksik_bilgi: {
    tr: "Eksik bilgi var — alanları kontrol eder misin?",
    en: "Something is missing — could you check the fields?",
    ru: "Не хватает данных — проверьте поля, пожалуйста.",
  },
  gecersiz_bilgi: {
    tr: "Girdiğin bilgi geçerli değil.",
    en: "That information is not valid.",
    ru: "Введённые данные некорректны.",
  },
  bulunamadi: {
    tr: "Kayıt bulunamadı. Sayfayı yenileyip tekrar dener misin?",
    en: "We could not find that record. Try refreshing the page.",
    ru: "Запись не найдена. Попробуйте обновить страницу.",
  },
  izin_yok: {
    tr: "Bunun için iznin yok. Çıkış yapıp yeniden girmeyi dener misin?",
    en: "You do not have permission for this. Try signing out and back in.",
    ru: "Недостаточно прав. Попробуйте выйти и войти снова.",
  },
  oturum_bitti: {
    tr: "Oturumun sona ermiş — yeniden giriş yapman gerekiyor.",
    en: "Your session has expired — please sign in again.",
    ru: "Сессия истекла — войдите снова.",
  },
  baglanti_yok: {
    tr: "İnternet bağlantısı kurulamadı. Bağlantını kontrol edip tekrar dene.",
    en: "We could not reach the server. Check your connection and try again.",
    ru: "Нет связи с сервером. Проверьте подключение и попробуйте снова.",
  },
  cok_hizli: {
    tr: "Biraz hızlı gittik — birkaç saniye sonra tekrar dene.",
    en: "That was a bit fast — please try again in a few seconds.",
    ru: "Слишком часто — повторите через несколько секунд.",
  },
  sunucu: {
    tr: "Sunucuda bir aksilik oldu. Birazdan tekrar dener misin?",
    en: "Something went wrong on our side. Please try again shortly.",
    ru: "Что-то пошло не так на нашей стороне. Попробуйте чуть позже.",
  },
  bilinmeyen: {
    tr: "Beklenmedik bir aksilik oldu. Tekrar dener misin?",
    en: "Something unexpected happened. Could you try again?",
    ru: "Произошла непредвиденная ошибка. Попробуйте ещё раз.",
  },
};

const anahtar = (err) => {
  const kod = String(err?.code ?? err?.status ?? "");
  // err.context: Edge Function cagrilarinda supabase-js asil fetch hatasini
  // sabit bir Ingilizce mesajin altina, context'e koyar — oradan da oku.
  const metin = [err?.message, err?.details, err?.hint, err?.context?.message, typeof err === "string" ? err : ""]
    .filter(Boolean).join(" ").toLowerCase();

  // Ag / erisim: fetch bunu TypeError olarak atar, kodu olmaz.
  // "cevap gelmedi / sinyal zayıf": lib/supabase.js'in zaman asimi mesaji.
  // "failed to send a request": functions-js'in fetch hatasi sarmalayicisi.
  if (/failed to fetch|networkerror|load failed|network request failed|err_internet|timeout|aborted|cevap gelmedi|sinyal zayıf|failed to send a request/.test(metin)) {
    return "baglanti_yok";
  }
  if (kod === "429" || /rate limit|too many requests/.test(metin)) return "cok_hizli";

  // Postgres kodlari
  if (kod === "23505" || /duplicate key|unique constraint/.test(metin)) {
    if (/phone/.test(metin)) return "telefon_kayitli";
    if (/email/.test(metin)) return "eposta_kayitli";
    return "zaten_kayitli";
  }
  if (kod === "23502" || /not-null|null value in column/.test(metin)) return "eksik_bilgi";
  if (kod === "23514" || /check constraint/.test(metin)) return "gecersiz_bilgi";
  if (kod === "23503" || /foreign key/.test(metin)) return "bulunamadi";
  if (kod === "22P02" || /invalid input syntax/.test(metin)) return "gecersiz_bilgi";
  if (kod === "42501" || /row-level security|permission denied/.test(metin)) return "izin_yok";
  if (kod === "PGRST116" || /0 rows|not found/.test(metin)) return "bulunamadi";
  if (kod === "401" || kod === "403" || /jwt|token is expired|invalid claim|unauthorized/.test(metin)) return "oturum_bitti";
  if (/^5\d\d$/.test(kod) || /internal server error|upstream/.test(metin)) return "sunucu";

  return "bilinmeyen";
};

export function errorText(err, lang = "tr") {
  // Teknik ayrinti kaybolmasin — konsolda dursun
  if (err) { try { console.error("[nip] hata:", err); } catch (e) { /* yoksay */ } }
  const grup = M[anahtar(err)] || M.bilinmeyen;
  return grup[lang] || grup.tr;
}
