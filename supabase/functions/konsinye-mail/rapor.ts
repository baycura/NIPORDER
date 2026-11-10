// Tedarikciye giden aylik satis raporu — konsinye_hesaplar satirindan XLSX.
//
// Duzen, sahibin 1.11'de onayladigi dosyayla ayni (scratchpad tedarikci/yap.py):
//   A1  MARKA × NOT IN PARIS
//   A2  Ekim 2026 Satis Raporu
//   A3  Not in Paris · Fethiye · 1–31 Ekim 2026 · Hazirlanma: 1.11.2026
//   5   Urun | [Barkod] | Adet | Perakende fiyati | Toplam (perakende) | NOT IN PARIS payi | MARKA payi
//       saginda iki hucre: oranlar (NIP payi %40 mavi, marka payi = 1 - NIP)
//   ... urun satirlari (toplam ve paylar formul; onbellekli deger var)
//   TOPLAM satiri, bos, "Odenecek tutar — MARKA (Ekim 2026)" sari hucre, dipnot,
//   varsa duzeltme notu (kirmizi) ya da "odemesi yapildi, kalan 0" satiri.
// Paylar ETIKET (perakende) fiyati uzerinden; indirim ve ikram bizim paydan duser.
import { type Hucre, kol, S, type Satir, xlsxYap } from "./xlsx.ts";

export interface HesapSatir {
  urun: string; barkod?: string | null; adet: number; perakende: number; toplam: number;
  satis?: number; tedarikci_pay?: number; bizim_pay?: number; ikram?: number;
}
export interface Hesap {
  id?: string; tedarikci: string; donem: string; pay_pct: number | null;
  adet: number; perakende: number; satis: number; tedarikci_pay: number; bizim_pay: number;
  satirlar: HesapSatir[]; durum: string; odendi_at?: string | null;
  kilitli?: boolean; duzeltme_notu?: string | null; odeme_notu?: string | null;
  pay_karisik?: boolean;   // urun bazinda farkli oranlar: satir tutarlari gecerli
}

export const AYLAR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

// '2026-10-01' | '2026-10' -> { yil: 2026, ay: 10 }
export function donemParcala(donem: string): { yil: number; ay: number } {
  const [y, m] = String(donem).split("-").map(Number);
  return { yil: y, ay: m };
}
export function donemEtiketi(donem: string): string {
  const { yil, ay } = donemParcala(donem);
  return `${AYLAR[ay - 1]} ${yil}`;
}
export function donemGunSayisi(donem: string): number {
  const { yil, ay } = donemParcala(donem);
  return new Date(Date.UTC(yil, ay, 0)).getUTCDate();
}

const ASCII: Record<string, string> = { ğ: "g", ü: "u", ş: "s", ı: "i", ö: "o", ç: "c", Ğ: "G", Ü: "U", Ş: "S", İ: "I", Ö: "O", Ç: "C" };
export const sade = (s: string) =>
  s.replace(/[ğüşıöçĞÜŞİÖÇ]/g, (c) => ASCII[c] || c).replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

export function dosyaAdi(tedarikci: string, donem: string): string {
  const { yil, ay } = donemParcala(donem);
  return `${sade(tedarikci)}_x_NOT_IN_PARIS_${sade(AYLAR[ay - 1])}_${yil}.xlsx`;
}

const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const yuvarla = (x: number) => Math.round(x * 100) / 100;

export function raporXlsx(h: Hesap, hazirlanma: string): Uint8Array {
  const marka = h.tedarikci.toUpperCase();
  const etiket = donemEtiketi(h.donem);
  const { yil, ay } = donemParcala(h.donem);
  const gun = donemGunSayisi(h.donem);
  const satirlar = Array.isArray(h.satirlar) ? h.satirlar : [];
  const barkodlu = satirlar.some((s) => s.barkod && String(s.barkod).trim());
  const off = barkodlu ? 1 : 0;
  const biz = h.pay_pct == null ? null : n(h.pay_pct) / 100; // bizim pay (0.40)
  const ted = biz == null ? null : 1 - biz;
  // Karisik pay: tek oran yok; satirlardaki tedarikci_pay (etiket x urun orani) kullanilir.
  const karisik = biz != null && !!h.pay_karisik;

  // Sutunlar (0 tabanli)
  const cUrun = 0, cBarkod = 1, cAdet = 1 + off, cPer = 2 + off, cTop = 3 + off, cBiz = 4 + off, cTed = 5 + off;
  const nc = 6 + off;           // tablo sutun sayisi
  const cOranEtiket = nc + 1;   // bir sutun bosluk, sonra oran etiketi
  const cOran = nc + 2;
  const bizRef = `$${kol(cOran)}$5`;
  const tedRef = `$${kol(cOran)}$6`;

  const rows: Satir[] = [];
  const koy = (ri: number, ci: number, c: Hucre) => {
    while (rows.length <= ri) rows.push({ h: [] });
    const r = rows[ri];
    r.h = r.h || [];
    r.h[ci] = c;
  };

  koy(0, 0, { v: `${marka} × NOT IN PARIS`, s: S.baslik });
  koy(1, 0, { v: `${etiket} Satış Raporu`, s: S.altBaslik });
  koy(2, 0, { v: `Not in Paris · Fethiye · 1–${gun} ${AYLAR[ay - 1]} ${yil} · Hazırlanma: ${hazirlanma}`, s: S.gri });

  const basliklar = ["Ürün", ...(barkodlu ? ["Barkod"] : []), "Adet", "Perakende fiyatı", "Toplam (perakende)", "NOT IN PARIS payı", `${marka} payı`];
  basliklar.forEach((t, i) => koy(4, i, { v: t, s: S.kolonBaslik }));
  rows[4].yuk = 24;
  koy(4, cOranEtiket, { v: "NOT IN PARIS payı", s: S.kalin });
  koy(4, cOran, biz == null ? { v: null, s: S.oranEksik } : karisik ? { v: "karışık", s: S.kalin } : { v: biz, s: S.oranMavi });
  koy(5, cOranEtiket, { v: `${marka} payı`, s: S.kalin });
  koy(5, cOran, biz == null
    ? { f: `IF(${kol(cOran)}5="","",1-${kol(cOran)}5)`, v: "", s: S.oran }
    : karisik ? { v: "ürün bazında", s: S.gri }
    : { f: `1-${kol(cOran)}5`, v: yuvarla(ted!), s: S.oran });

  let r = 5; // 0 tabanli; Excel satiri r+1 = 6
  let topAdet = 0, topTop = 0, topBiz = 0, topTed = 0;
  for (const s of satirlar) {
    const adet = n(s.adet), per = n(s.perakende);
    const top = adet * per;
    const xr = r + 1;
    koy(r, cUrun, { v: s.urun || "", s: S.metin });
    if (barkodlu) koy(r, cBarkod, { v: s.barkod ? String(s.barkod) : "", s: S.barkod });
    koy(r, cAdet, { v: adet, s: S.orta });
    koy(r, cPer, { v: per, s: S.tl });
    koy(r, cTop, { f: `${kol(cAdet)}${xr}*${kol(cPer)}${xr}`, v: top, s: S.tl });
    if (biz == null) {
      koy(r, cBiz, { v: null, s: S.tl });
      koy(r, cTed, { v: null, s: S.tl });
    } else if (karisik) {
      const tedPay = n(s.tedarikci_pay);
      koy(r, cBiz, { f: `${kol(cTop)}${xr}-${kol(cTed)}${xr}`, v: yuvarla(top - tedPay), s: S.tl });
      koy(r, cTed, { v: yuvarla(tedPay), s: S.tl });
      topBiz += top - tedPay; topTed += tedPay;
    } else {
      koy(r, cBiz, { f: `${kol(cTop)}${xr}*${bizRef}`, v: yuvarla(top * biz), s: S.tl });
      koy(r, cTed, { f: `${kol(cTop)}${xr}*${tedRef}`, v: yuvarla(top * ted!), s: S.tl });
      topBiz += top * biz; topTed += top * ted!;
    }
    topAdet += adet; topTop += top;
    r++;
  }
  const rt = r, xrt = rt + 1, ilk = 6, son = rt; // Excel satirlari: 6..rt
  koy(rt, cUrun, { v: "TOPLAM", s: S.toplamMetin });
  if (barkodlu) koy(rt, cBarkod, { v: "", s: S.toplamMetin });
  koy(rt, cAdet, { f: satirlar.length ? `SUM(${kol(cAdet)}${ilk}:${kol(cAdet)}${son})` : undefined, v: topAdet, s: S.toplamOrta });
  koy(rt, cPer, { v: "", s: S.toplamMetin });
  koy(rt, cTop, { f: satirlar.length ? `SUM(${kol(cTop)}${ilk}:${kol(cTop)}${son})` : undefined, v: yuvarla(topTop), s: S.toplamTl });
  if (biz == null || !satirlar.length) {
    koy(rt, cBiz, { v: null, s: S.toplamTl });
    koy(rt, cTed, { v: null, s: S.toplamTl });
  } else {
    koy(rt, cBiz, { f: `SUM(${kol(cBiz)}${ilk}:${kol(cBiz)}${son})`, v: yuvarla(topBiz), s: S.toplamTl });
    koy(rt, cTed, { f: `SUM(${kol(cTed)}${ilk}:${kol(cTed)}${son})`, v: yuvarla(topTed), s: S.toplamTl });
  }

  koy(rt + 2, 0, { v: `Ödenecek tutar — ${marka} (${etiket})`, s: S.odenecekEtiket });
  koy(rt + 2, cTed, biz == null || !satirlar.length
    ? { v: biz == null ? "oran gir" : 0, s: S.odenecekTl }
    : { f: `${kol(cTed)}${xrt}`, v: yuvarla(topTed), s: S.odenecekTl });
  koy(rt + 3, 0, { v: `Paylar perakende (etiket) fiyatı üzerinden hesaplanmıştır; KDV dahildir. Ödenmiş satışlar, işletme günü 1–${gun} ${AYLAR[ay - 1]}.`, s: S.gri });
  let rr = rt + 4;
  if (karisik) { koy(rr, 0, { v: "Bu tedarikçide ürün bazında farklı pay oranları var; paylar satır bazında hesaplanmıştır.", s: S.gri }); rr++; }
  if (h.duzeltme_notu) { koy(rr, 0, { v: h.duzeltme_notu, s: S.not }); rr++; }
  if (h.durum === "odendi") {
    koy(rr, 0, { v: `${etiket} ödemesi yapıldı. Kalan bakiye: 0 ₺.`, s: S.odendiNot });
    koy(rr, cTed, { v: 0, s: S.odendiTl });
    rr++;
  }

  const genislik = [27, ...(barkodlu ? [13] : []), 5, 10, 11, 12, 12, 3, 13, 6];
  return xlsxYap({ ad: "Satış Raporu", genislik, satirlar: rows });
}
