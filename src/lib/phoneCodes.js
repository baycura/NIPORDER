// Telefon ulke kodlari — uyelik formundaki bayrakli secim kutusu.
//
// Sira tesadufi degil: once Turkiye, sonra Fethiye'ye en cok misafir gonderen
// ulkeler, en sonda alfabetik geri kalan. Listeyi bilerek kisa tuttuk; kimse
// 200 satirlik acilir kutuda ulkesini aramak istemiyor.

export const PHONE_CODES = [
  { iso: "TR", dial: "90",  flag: "🇹🇷", name: "Türkiye" },
  { iso: "RU", dial: "7",   flag: "🇷🇺", name: "Россия" },
  { iso: "GB", dial: "44",  flag: "🇬🇧", name: "United Kingdom" },
  { iso: "DE", dial: "49",  flag: "🇩🇪", name: "Deutschland" },
  { iso: "NL", dial: "31",  flag: "🇳🇱", name: "Nederland" },
  { iso: "PL", dial: "48",  flag: "🇵🇱", name: "Polska" },
  { iso: "UA", dial: "380", flag: "🇺🇦", name: "Україна" },
  { iso: "FR", dial: "33",  flag: "🇫🇷", name: "France" },
  { iso: "BE", dial: "32",  flag: "🇧🇪", name: "België" },
  { iso: "AT", dial: "43",  flag: "🇦🇹", name: "Österreich" },
  { iso: "CH", dial: "41",  flag: "🇨🇭", name: "Schweiz" },
  { iso: "SE", dial: "46",  flag: "🇸🇪", name: "Sverige" },
  { iso: "NO", dial: "47",  flag: "🇳🇴", name: "Norge" },
  { iso: "DK", dial: "45",  flag: "🇩🇰", name: "Danmark" },
  { iso: "FI", dial: "358", flag: "🇫🇮", name: "Suomi" },
  { iso: "IT", dial: "39",  flag: "🇮🇹", name: "Italia" },
  { iso: "ES", dial: "34",  flag: "🇪🇸", name: "España" },
  { iso: "CZ", dial: "420", flag: "🇨🇿", name: "Česko" },
  { iso: "RO", dial: "40",  flag: "🇷🇴", name: "România" },
  { iso: "IE", dial: "353", flag: "🇮🇪", name: "Ireland" },
  { iso: "IL", dial: "972", flag: "🇮🇱", name: "ישראל" },
  { iso: "US", dial: "1",   flag: "🇺🇸", name: "United States" },
  { iso: "CA", dial: "1",   flag: "🇨🇦", name: "Canada" },
  { iso: "AU", dial: "61",  flag: "🇦🇺", name: "Australia" },
  { iso: "AE", dial: "971", flag: "🇦🇪", name: "الإمارات" },
  { iso: "SA", dial: "966", flag: "🇸🇦", name: "السعودية" },
  { iso: "KZ", dial: "7",   flag: "🇰🇿", name: "Қазақстан" },
  { iso: "GR", dial: "30",  flag: "🇬🇷", name: "Ελλάδα" },
  { iso: "BG", dial: "359", flag: "🇧🇬", name: "България" },
  { iso: "AZ", dial: "994", flag: "🇦🇿", name: "Azərbaycan" },
];

/**
 * Girilen numarayi E.164'e cevirir: +<ulke kodu><numara>.
 * Turk kullanicilar aliskanlikla 0532... yaziyor; bastaki sifir dusurulur,
 * yoksa numara +900532... olarak kaydedilip aranamaz hale geliyor.
 * @returns {string|null} gecerliyse +905321234567, degilse null
 */
export function toE164(dial, raw) {
  let d = String(raw || "").replace(/\D/g, "");
  while (d.startsWith("0")) d = d.slice(1);
  if (d.length < 6 || d.length > 14) return null;
  return "+" + dial + d;
}
