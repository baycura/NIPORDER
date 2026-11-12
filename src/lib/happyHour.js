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

// EN YAKIN PENCERE — urun basina "su an acik olan, yoksa siradaki" happy hour.
// Musteri menusu uye olmayana bunu gosterir: "Üyelere özel · 21:00–09:00
// arası ₺200". Saat disinda da gorunur; boylece misafir uye olursa neyi kaca
// alacagini her an gorur (sahip 12.11).
//
// Pencere hesabi happyHourPrices ile AYNI kuraldir: gece yarisini asan kural
// (21:00–09:00) kendi gununde iki parcadir: 00:00–09:00 ve 21:00–24:00.
//
// Donen deger: { [product_id]: { fiyat, bas: "21:00", bit: "09:00",
//                                gun: 0 bugun | 1 yarin | 2..7 gun sonra, aktif } }
const dakika = (saat) => {
  const [h, m] = String(saat ?? "").split(":").map(Number);
  return Number.isFinite(h) ? h * 60 + (Number.isFinite(m) ? m : 0) : null;
};
const kisaSaat = (saat) => String(saat).slice(0, 5);

export function happyHourPlan(products, rules, now = new Date()) {
  const out = {};
  const mins = now.getHours() * 60 + now.getMinutes();
  const jsDay = now.getDay(); // 0=Paz .. 6=Cmt

  const dene = (pid, fiyat, bas, bit, gunVar) => {
    const s = dakika(bas), e = dakika(bit), f = Number(fiyat);
    if (s == null || e == null || fiyat == null || fiyat === "" || !Number.isFinite(f)) return;
    const parcalar = s <= e ? [[s, e]] : [[0, e], [s, 1440]];
    for (let k = 0; k <= 7; k++) {
      const g = (jsDay + k) % 7;
      if (!gunVar(g)) continue;
      let bulundu = false;
      for (const [a, b] of parcalar) {
        if (b <= a) continue;                // bos aralik
        if (k === 0 && b <= mins) continue;  // bugunku parca bitti
        const aktif = k === 0 && a <= mins;
        const uzak = aktif ? 0 : k * 1440 + a - mins;
        const eski = out[pid];
        // YAZILAN SAAT gercek parcaya uyar. Gece yarisini asan kural (21:00–
        // 09:00) her gun seciliyse kesintisizdir. Bir onceki / sonraki gun
        // secili DEGILSE parca gece yarisinda baslar ya da biter: "00:00–09:00"
        // ya da "21:00–00:00" yazilir, musteriye tutulmayacak saat soylenmez.
        const sarar = s > e;
        const gBas = (sarar && a === 0 && !gunVar((g + 6) % 7)) ? "00:00" : kisaSaat(bas);
        const gBit = (sarar && b === 1440 && !gunVar((g + 1) % 7)) ? "00:00" : kisaSaat(bit);
        // Esitlikte sonra gelen kazanir: happyHourPrices'ta da sonraki kural
        // oncekinin, urunun kendi alani kuralin ustune yazar.
        if (!eski || uzak <= eski.uzak) out[pid] = { fiyat: f, bas: gBas, bit: gBit, gun: k, aktif, uzak };
        bulundu = true;
      }
      if (bulundu) break; // sonraki gunler daha uzak
    }
  };

  (rules || []).forEach(rule => {
    if (!rule?.start_time || !rule?.end_time || !Array.isArray(rule.days_of_week)) return;
    const gunVar = (g) => rule.days_of_week.includes(g === 0 ? 7 : g); // kural gunleri 1=Pzt .. 7=Paz
    Object.entries(rule.product_overrides || {}).forEach(([pid, fiyat]) => dene(pid, fiyat, rule.start_time, rule.end_time, gunVar));
  });

  (products || []).forEach(p => {
    if (!p?.hh_enabled || p.hh_price == null || p.hh_price === "" || !p.hh_start || !p.hh_end) return;
    const days = Array.isArray(p.hh_days) ? p.hh_days : [0, 1, 2, 3, 4, 5, 6];
    dene(p.id, p.hh_price, p.hh_start, p.hh_end, (g) => days.includes(g));
  });

  return out;
}

// app_settings.hh_sadece_uye (jsonb): kayit yoksa ACIK. Yalniz false / 0 /
// "0" / "false" kapatir; eski kayitlar string, yenileri boolean yazilabilir.
export function hhSadeceUyeMi(value) {
  return !(value === false || value === 0 || value === "0" || value === "false");
}
