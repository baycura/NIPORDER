import { useEffect, useState } from "react";
import { sayiya, makineSayi, girisYaz } from "../lib/sayi.js";

// SAYI KUTUSU — panelde sayi isteyen HER yer bunu kullanir.
//
// <input type="number"> KULLANMA. Tarayici o alanda virgulu sessizce yutuyor:
// "12,50" yazilinca kutunun degeri "1250" oluyor; uyari yok, kutu bosalmiyor,
// kirmizi olmuyor. Sayi 100 katina cikip oyle kaydediliyor. Ayrintili gerekce
// ve olcum: lib/sayi.js.
//
// Bu kutu:
//   - type="text" + inputMode -> telefonda yine sayi klavyesi acilir, ama
//     virgul yazilabilir ve yazilan sey ekranda kalir.
//   - Kutudan cikinca yaziyi ANLADIGI HALE getirir: "12.50" -> "12,5",
//     "1.250" -> "1250". Kullanici kaydetmeden once neyin kaydedilecegini
//     kutunun kendisinde gorur. (Ayri bir aciklama satiri BILEREK yok:
//     kutunun yaninda ikinci bir dugum 50 cagri yerindeki hizalamayi bozardi.)
//   - Yukari NOKTALI metin verir ("12.5"), boylece cagiran sayfadaki
//     Number(form.price) hicbir degisiklik olmadan calisir.
//
// kip:
//   "para"     fiyat/maliyet/tutar   — ondalikli klavye
//   "ondalik"  miktar, oran, hacim   — ondalikli klavye
//   "tam"      adet, sira, gun       — tam sayi klavyesi, cikista yuvarlanir
export default function SayiGirisi({
  value, onChange, kip = "ondalik",
  min, max, onBlur, ...kalan
}) {
  const tam = kip === "tam";
  const [ham, setHam] = useState(() => girisYaz(value));

  // Disaridan gelen degisiklik (form sifirlama, baska kaydi acma) kutuya
  // yansisin — ama KULLANICI YAZARKEN yazdigini ezmesin. Olcut sayinin
  // kendisi: "12," ile "12" ayni sayi, o yuzden kutuya dokunulmaz.
  // Kutudaki metin INSAN yazisi, gelen deger MAKINE yazisi — ayri okunur.
  useEffect(() => {
    setHam(h => (sayiya(h) !== makineSayi(value) ? girisYaz(value) : h));
  }, [value]);

  const yaz = (metin) => {
    setHam(metin);
    const s = sayiya(metin);
    onChange?.(s == null ? "" : String(s));
  };

  // Kutudan cikinca toparla: tam sayi kipinde yuvarla, sinir disini sinira cek,
  // yaziyi Turkce ondalikla tazele. Yazarken YAPILMAZ — "1" yazip "10"
  // yazacak kisinin elinden alinmasin.
  //
  // Okunamayan metin (sadece "-", "abc") kutudan SILINIR: yukari zaten ""
  // gitti, yani "girilmedi" sayildi. Kutu dolu gorunup kayit bos olursa —
  // stok sayiminda "bu satiri saydim" sanip saymamis olursun.
  const cikis = (e) => {
    const okunan = sayiya(ham);
    if (okunan == null) {
      if (ham !== "") { setHam(""); onChange?.(""); }
    } else {
      let s = tam ? Math.round(okunan) : okunan;
      if (min != null && s < Number(min)) s = Number(min);
      if (max != null && s > Number(max)) s = Number(max);
      if (s !== okunan) onChange?.(String(s));
      setHam(girisYaz(String(s)));
    }
    onBlur?.(e);
  };

  return (
    <input
      type="text"
      inputMode={tam ? "numeric" : "decimal"}
      value={ham}
      onChange={e => yaz(e.target.value)}
      onBlur={cikis}
      {...kalan}
    />
  );
}
