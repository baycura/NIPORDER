import { useEffect, useRef } from "react";
import { supabase } from "./supabase.js";

// EKRAN KENDINI YENILESIN (Personel 4, sahip onayi 14.10).
// Masalar ve Kasa yalniz acilirken yukleniyordu: QR'dan gelen siparis ya da
// baska cihazda kapanan hesap, sayfa yenilenene kadar gorunmuyordu.
// Uc yol, Siparisler ekraniyla ayni:
//   1. canli degisiklik (orders, order_items) — ayni 400 ms icindekiler birlesir
//   2. ekrana donus ya da pencereye odak (telefon kilitlenince canli baglanti
//      kopabiliyor)
//   3. ekran acikken 15 sn'de bir yedek yoklama
// Yukleme surerken gelen istek kaybolmaz: bitince bir kez daha calisir.
export function useCanliYenile(kanal, yenile, aralikMs = 15000) {
  const yenileRef = useRef(yenile);
  useEffect(() => { yenileRef.current = yenile; });

  useEffect(() => {
    let iptal = false, calisiyor = false, bekleyen = false, zamanlayici = null;
    const calistir = async () => {
      if (iptal) return;
      if (calisiyor) { bekleyen = true; return; }
      calisiyor = true;
      try { await yenileRef.current(); } catch { /* sonraki tur yeniden dener */ }
      calisiyor = false;
      if (bekleyen && !iptal) { bekleyen = false; calistir(); }
    };
    const planla = () => {
      if (zamanlayici) return;
      zamanlayici = setTimeout(() => { zamanlayici = null; calistir(); }, 400);
    };
    const ch = supabase.channel(kanal)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, planla)
      .on("postgres_changes", { event: "*", schema: "public", table: "order_items" }, planla)
      .subscribe();
    const uyan = () => { if (document.visibilityState === "visible") planla(); };
    document.addEventListener("visibilitychange", uyan);
    window.addEventListener("focus", uyan);
    const iv = setInterval(() => { if (document.visibilityState === "visible") calistir(); }, aralikMs);
    return () => {
      iptal = true;
      clearTimeout(zamanlayici);
      clearInterval(iv);
      supabase.removeChannel(ch);
      document.removeEventListener("visibilitychange", uyan);
      window.removeEventListener("focus", uyan);
    };
  }, [kanal, aralikMs]);
}
