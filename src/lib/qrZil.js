import { useEffect, useRef, useState } from "react";
import { supabase } from "./supabase.js";
import { sesHazirla, qrZilCal } from "./ses.js";

// YENI QR SIPARISI ZILI (Personel 4, sahip onayi 14.10).
// Musteri QR menuden siparis verince (order_items.added_by bos; yalniz
// musteri_sepet_gonder boyle yazar) acik personel ekrani ses calar ve bir
// serit gosterir: "Yeni QR siparisi · Misafir 3 · 2 urun". Serite dokunan
// hesaba gider.
// - Kim duyar: mutfak ve izleyici disindaki personel; yalniz kendi magazasi.
//   Mutfak ekraninin (/kitchen) kendi alarmi var: orada bu zil calismaz.
// - Ses cihaz basina kapatilabilir (ustteki "QR" hoparlor dugmesi).
// - Kaynak: canli INSERT olayi + ekran acikken 20 sn'de bir yedek yoklama
//   (telefon kilitlenince canli baglanti kopabiliyor). Ayni kalem iki kez
//   sayilmaz; ayni sepetin kalemleri tek zil olur.
// - Sinir: personel bir QR kaleminin bir kismini baska hesaba tasirsa
//   (nip_kalem_tasi yeni satir acar, added_by'i kopyalar) zil bir kez
//   gereksiz calar. Seyrek.
const SES_KEY = "nip_qr_ses";
const ACIK_DURUMLAR = ["open", "sent", "preparing", "ready"];
const SERIT_SURE_MS = 30000;

const sesOku = () => {
  try { return localStorage.getItem(SES_KEY) !== "0"; } catch { return true; }
};

export function useQrSiparisZili({ staffUser, aktif }) {
  const [sesAcik, setSesAcik] = useState(sesOku);
  const [serit, setSerit] = useState(null);
  const sesRef = useRef(sesAcik);
  useEffect(() => { sesRef.current = sesAcik; }, [sesAcik]);

  // Tarayici sesi ancak bir dokunustan sonra acar: her dokunus motoru uyandirir.
  useEffect(() => {
    if (!aktif) return;
    const uyandir = () => { sesHazirla(); };
    document.addEventListener("pointerdown", uyandir, { passive: true });
    document.addEventListener("keydown", uyandir);
    return () => {
      document.removeEventListener("pointerdown", uyandir);
      document.removeEventListener("keydown", uyandir);
    };
  }, [aktif]);

  const magazaAnahtari = (staffUser?.store_ids || []).join(",");
  useEffect(() => {
    const magazalar = staffUser?.store_ids || [];
    if (!aktif || !magazalar.length) return;
    let iptal = false;
    const gorulen = new Set();
    let since = null;   // sunucu saatiyle son kalem; cihaz saati kayabilir
    let kuyruk = [];
    let zamanlayici = null;

    const isle = async () => {
      zamanlayici = null;
      const satirlar = kuyruk;
      kuyruk = [];
      const yeni = satirlar.filter(r => r && r.id && r.added_by == null && !gorulen.has(r.id));
      if (!yeni.length) return;
      yeni.forEach(r => gorulen.add(r.id));
      const ids = [...new Set(yeni.map(r => r.order_id).filter(Boolean))];
      const { data } = await supabase.from("orders")
        .select("id, origin_store_id, customer_name, status, masa:table_id(name)")
        .in("id", ids);
      if (iptal) return;
      const hesaplar = (data || []).filter(o =>
        magazalar.includes(o.origin_store_id) && ACIK_DURUMLAR.includes(o.status));
      if (!hesaplar.length) return;
      const son = hesaplar[hesaplar.length - 1];
      const adet = yeni.filter(r => r.order_id === son.id)
        .reduce((t, r) => t + (Number(r.quantity) || 1), 0);
      setSerit({
        orderId: son.id,
        ad: son.masa?.name || son.customer_name || "Misafir",
        adet,
        diger: hesaplar.length - 1,
        an: Date.now(),
      });
      if (sesRef.current) qrZilCal();
    };
    // Bir sepetin kalemleri ayni anda gelir: 700 ms bekleyip tek zil.
    const ekle = (satirlar) => {
      kuyruk = kuyruk.concat(satirlar);
      if (!zamanlayici) zamanlayici = setTimeout(isle, 700);
    };

    // Baslangic: sunucudaki en son kalem. Ekran acilmadan onceki siparis calmaz.
    supabase.from("order_items").select("created_at")
      .order("created_at", { ascending: false }).limit(1)
      .then(({ data }) => { if (!iptal) since = data?.[0]?.created_at || new Date().toISOString(); });

    const ch = supabase.channel("qr-zil")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "order_items" },
          (p) => ekle([p.new]))
      .subscribe();

    const yokla = async () => {
      if (!since || document.visibilityState !== "visible") return;
      const { data } = await supabase.from("order_items")
        .select("id, order_id, added_by, quantity, created_at")
        .is("added_by", null).gt("created_at", since)
        .order("created_at", { ascending: true }).limit(50);
      if (iptal || !data?.length) return;
      since = data[data.length - 1].created_at;
      ekle(data);
    };
    const iv = setInterval(yokla, 20000);
    const uyan = () => { if (document.visibilityState === "visible") yokla(); };
    document.addEventListener("visibilitychange", uyan);

    return () => {
      iptal = true;
      clearTimeout(zamanlayici);
      clearInterval(iv);
      supabase.removeChannel(ch);
      document.removeEventListener("visibilitychange", uyan);
    };
  }, [aktif, magazaAnahtari]);

  // Serit 30 sn sonra kendiliginden kapanir.
  useEffect(() => {
    if (!serit) return;
    const t = setTimeout(() => setSerit(null), SERIT_SURE_MS);
    return () => clearTimeout(t);
  }, [serit]);

  // Acarken bir kez calar: personel ses duzeyini o an duyar.
  const sesDegistir = () => {
    const yeni = !sesAcik;
    setSesAcik(yeni);
    try { localStorage.setItem(SES_KEY, yeni ? "1" : "0"); } catch { /* yoksay */ }
    if (yeni) { sesHazirla(); setTimeout(qrZilCal, 60); }
  };

  return { sesAcik, sesDegistir, serit, seritKapat: () => setSerit(null) };
}
