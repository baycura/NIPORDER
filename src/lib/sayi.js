// ============================================================================
// SAYI OKUMA/YAZMA — panelin TEK sayi ayristiricisi.
// ============================================================================
// NEDEN VAR: panelde 50 tane <input type="number"> vardi. Tarayici o alanda
// virgulu SESSIZCE YUTUYOR: kullanici "12,50" yazinca alanin degeri "1250"
// oluyor. Uyari yok, alan kirmizi olmuyor, kutu bosalmiyor. Sayi 100 katina
// cikip oyle kaydediliyor. (Chromium'da olcerek dogrulandi.)
//
// Turkiye'de kimse fiyati noktayla yazmaz; yani o alanlarin her biri,
// personel kendi aliskanligiyla yazdiginda 100x yanlis kaydeden bir tuzakti.
// "PET BARDAK KAPAK 100 LU" maliyetinin 1,50 yerine 150 TL durmasi tam da bu
// kalibin izi.
//
// Cozum: para/miktar alanlari artik type="text" + inputMode. Ayristirma
// burada, tek yerde. Yeni bir sayi alani yazan kimse bir daha type="number"
// yazmasin — SayiGirisi bileseni kullanilir.

// IKI AYRI OKUYUCU VAR, KARISTIRMA:
//
//   sayiya()     INSANIN yazdigi metin. Belirsiz: "1.250" binlik mi ondalik mi?
//                Turkce kurala gore binlik sayilir.
//   makineSayi() MAKINENIN yazdigi metin (String(n), veritabani alani).
//                Belirsizlik YOK: nokta her zaman ondalik.
//
// Bu ayrimi ilk yazisimda kacirmistim: bilesen kendi urettigi "1.375" metnini
// insan metni gibi okuyunca 1375 yapiyordu — yani 1,375 yazan kisiye 1000 kat
// hata. Kapatmaya calistigim hatanin ta kendisi. Makine metnini ASLA sayiya()
// ile okuma.

// Turkce yazim: "1.234,5" ve "30.000" (otuz bin) ikisi de gelir. Ekrandaki
// sayilar tr-TR bicimiyle basildigi icin kullanici onu taklit ediyor; noktayi
// ondalik sanip 30.000'i 30 diye okumak stok girisini sessizce yanlis yapardi.
export function sayiya(s) {
  if (typeof s === "number") return Number.isFinite(s) ? s : null;
  let t = String(s ?? "").trim();
  if (!t) return null;                       // bos kutu 0 degil, "girilmedi"
  if (/[eE]/.test(t)) return null;           // "1e3" gibi yazim kabul edilmez
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  // Binlik ayirici kurali: ilk obek 1-9 ile BASLAMALI. Yoksa "0.154" (bir
  // malzemenin ml maliyeti) binlik sanilip 154'e cikiyordu — 1000 kat hata.
  else if (/^-?[1-9]\d{0,2}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

// Makine degeri: sayi ya da nokta-ondalikli metin ("12.5", "1.375").
// Veritabanindan gelen ve bilesenin yukari verdigi her sey bundan gecer.
export function makineSayi(v) {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Sayiyi Turkce yazimla goster: 1234.5 -> "1.234,5"
export const sayiYaz = (n, basamak = 2) =>
  n == null || !Number.isFinite(Number(n))
    ? ""
    : Number(n).toLocaleString("tr-TR", { maximumFractionDigits: basamak });

// Kutuda gosterilecek metin. Kayitli deger nokta ile tutulur ("12.5"),
// kullaniciya virgulle gosterilir ("12,5") — yazarken de virgul kullansin.
// BINLIK AYIRICI BILEREK YOK: "1.250" yazip sonuna 0 ekleyen kisi "1.2500"
// elde eder, o da 1,25 diye okunur. Kutuda duran metin her zaman tek parca
// olsun ki duzenlemesi guvenli olsun.
export const girisYaz = (v) => {
  const n = makineSayi(v);          // MAKINE okuyucusu — bkz. yukaridaki uyari
  return n == null ? "" : String(n).replace(".", ",");
};
