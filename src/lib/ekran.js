// ============================================================================
// EKRAN OLCUSU — React'in haberi olan medya sorgusu.
// ============================================================================
// NEDEN VAR: kod su ana kadar olcuyu render SIRASINDA bir kez okuyordu:
//
//   const masaustu = window.matchMedia("(min-width:900px)").matches;
//
// Bu iki sey kaciriyor: (1) tablet yatay/dikey cevrilince React'e haber
// gitmedigi icin arayuz eski olcuye gore cizilmis halde kaliyor; (2) tarayici
// penceresi yeniden boyutlandiginda da ayni. iPad'i parti gecesi yatay
// cevirince telefon duzeninde kalmasinin sebebi buydu.
//
// Burada degisiklik dinleniyor ve state guncelleniyor; React yeniden ciziyor.
// ============================================================================

import { useEffect, useState } from "react";

const varMi = () => typeof window !== "undefined" && typeof window.matchMedia === "function";

export function useMedya(sorgu) {
  const [eslesti, setEslesti] = useState(() => (varMi() ? window.matchMedia(sorgu).matches : false));

  useEffect(() => {
    if (!varMi()) return;
    const mq = window.matchMedia(sorgu);
    const degisti = (e) => setEslesti(e.matches);
    setEslesti(mq.matches); // sorgu degistiyse ya da ilk cizimden sonra kaydiysa
    // addEventListener iOS 14'ten once yok; eski iPad'ler hala sahada.
    if (mq.addEventListener) {
      mq.addEventListener("change", degisti);
      return () => mq.removeEventListener("change", degisti);
    }
    mq.addListener(degisti);
    return () => mq.removeListener(degisti);
  }, [sorgu]);

  return eslesti;
}

// StaffLayout'un masaustu duzeni: kenar menu 240px, alt tab bar yok.
export const useMasaustu = () => useMedya("(min-width:900px)");

// PARTI IZGARASI ESIGI — 1000px.
// Yan yana 5 urun karti (128px) + kategori etiketi + acik hesap paneli ancak
// buradan sonra sigiyor. Gercek cihazlar:
//   iPad mini  yatay 1024 ✓   dikey 744 ✗
//   iPad 10.9  yatay 1180 ✓   dikey 820 ✗
//   iPad 11"   yatay 1194 ✓   dikey 834 ✗
//   iPhone     her halde  ✗
// Yani "yatay tablet ve ustu" demek. Dikey tablet bilerek disarida: 5 kart
// sigmadan izgaranin anlami kalmiyor, listeyle ayni ise doner.
export const useGenisEkran = () => useMedya("(min-width:1000px)");

// Parmakla mi kullaniliyor? Genis ekran tek basina yetmez: mutfaktaki dizustu
// de 1366px. Parti izgarasi KENDILIGINDEN yalniz dokunmatik genis ekranda
// acilsin; fareli ekranda isteyen elle acar (cihaz tercihi).
export const useDokunmatik = () => useMedya("(pointer:coarse)");
