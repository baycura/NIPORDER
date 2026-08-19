// Isletme gunu: NIP'te gun gece yarisi degil 03:00'te biter.
//
// Gece 01:30'daki satis takvimde ertesi gune duser ama isletme icin hala
// "dun aksamin" cirosudur. Gunluk ciro, vardiya ve ozet hesaplarinin hepsi
// bu modulden gecmeli — kim kendi gun hesabini yaparsa gece satislarini
// yanlis gune yazar.

export const DAY_END_HOUR = 3; // 03:00

/**
 * Icinde bulunulan isletme gununun baslangici (03:00), offsetDays kadar geri.
 * Ornek: saat 01:30 ise "bugun" dun 03:00'te baslamistir.
 */
export function businessDayStart(now = new Date(), offsetDays = 0) {
  const d = new Date(now);
  if (d.getHours() < DAY_END_HOUR) d.setDate(d.getDate() - 1);
  d.setDate(d.getDate() - offsetDays);
  d.setHours(DAY_END_HOUR, 0, 0, 0);
  return d;
}

/** Bir anin ait oldugu isletme gununun anahtari: "YYYY-MM-DD". */
export function businessDayKey(dateLike) {
  const d = new Date(new Date(dateLike).getTime() - DAY_END_HOUR * 3600 * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Gunun saatleri, isletme sirasiyla: sabah 8'den geceyarisini asip 02:00'ye.
// Saatlik satis grafigi bu sirayla cizilir — 00-02 arasi satislar onceki
// gunun kuyrugudur, grafigin sonunda durur.
export const BUSINESS_HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 0, 1, 2];
