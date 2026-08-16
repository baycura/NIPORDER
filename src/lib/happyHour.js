// Happy hour fiyatlari — MUSTERI MENUSU ve KASA ayni yerden hesaplasin diye
// tek fonksiyon. Iki kaynak birlestirilir:
//   1) happy_hour_rules kayitlari (kural bazli, gunler 1=Pzt .. 7=Paz)
//   2) urunun kendi hh_enabled/hh_price alanlari (gunler JS usulu 0=Paz .. 6=Cmt)
// Ikisi de gecerliyse urun bazli alan kazanir (daha ozel tanim).
//
// Donen deger: { [product_id]: yeniFiyat }

const inWindow = (mins, start, end) => {
  const [sh, sm] = String(start).split(":").map(Number);
  const [eh, em] = String(end).split(":").map(Number);
  const s = sh * 60 + (sm || 0);
  const e = eh * 60 + (em || 0);
  return s <= e ? (mins >= s && mins < e) : (mins >= s || mins < e); // gece yarisini asan aralik
};

export function happyHourPrices(products, rules, now = new Date()) {
  const out = {};
  const mins = now.getHours() * 60 + now.getMinutes();
  const jsDay = now.getDay();            // 0=Paz .. 6=Cmt
  const ruleDay = jsDay === 0 ? 7 : jsDay; // 1=Pzt .. 7=Paz

  (rules || []).forEach(rule => {
    if (!rule?.days_of_week?.includes(ruleDay)) return;
    if (!rule.start_time || !rule.end_time) return;
    if (inWindow(mins, rule.start_time, rule.end_time)) {
      Object.assign(out, rule.product_overrides || {});
    }
  });

  (products || []).forEach(p => {
    if (!p?.hh_enabled || p.hh_price == null || p.hh_price === "" || !p.hh_start || !p.hh_end) return;
    const days = Array.isArray(p.hh_days) ? p.hh_days : [0, 1, 2, 3, 4, 5, 6];
    if (!days.includes(jsDay)) return;
    if (inWindow(mins, p.hh_start, p.hh_end)) out[p.id] = Number(p.hh_price);
  });

  return out;
}
