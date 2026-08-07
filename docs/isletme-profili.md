# Not In Paris — İşletme Profili & Çalışma Notları

> Bu dosya, sahibi daha iyi anlamak ve kararları tutarlı vermek için tutulan
> yaşayan bir nottur. Yeni öğrendiklerimizi buraya ekleriz.

## Sahip / karar verici
- **Rol:** İşletme sahibi, **uzaktan takip ediyor** (mekanda sürekli değil).
- **Çıkarım:** Sisteme uzaktan görünürlük şart — gün sonu özeti, anormallik
  uyarıları sahibe de gitmeli. Personel akışı kendi kendine yetmeli.
- **Beklenti:** Hepsi — kâr/zarar netliği, kaçak/israf kontrolü, operasyon
  hızı & kolaylık, büyüme/karar verisi.
- **Çalışma tarzı tercihi:** "Bir sürü sor, hiç sormayı bırakma." → varsaymak
  yerine sor, iş ve sahip hakkında öğrendikçe daha isabetli kur.

## İşletme yapısı
- **İki store, TEK veritabanı** (Supabase proje: "Order" / gbbxxcduuwdmvfayxzeg):
  - `Not In Paris` (slug: paris) — ana işletme/bar.
  - `Not In Paris Doner` (slug: doner) — **ayrı işletme/mutfak**, kendi ayrı
    uygulaması var ama aynı DB'yi kullanıyor (`kitchen_orders`, `kitchen_menu`).
- **Mutfak ürünü mantığı:** NIP kendi menüsünden döner (mutfak) ürünlerini de
  satar. Bir ürünün `kitchen_destination_store_id = doner` ise, o ürünün NIP'te
  satılan cirosu **ay sonu mutfağa ödenir** (bkz. "Mutfağa Ödenecek" sayfası).

## Partiler
- **Çar / Cum / Cmt, 22:00 sonrası.**
- **Giriş ücretsiz** — parti geliri tamamen bar/masa satışından.
- **Çıkarım:** Parti geliri raporu, sipariş zaman damgasından türetilir
  (ayrı kapı/bilet modülü gerekmez). Günlük / aylık / yıllık parti cirosu.

## Cihazlar
- Ortak tablet (kasa/mutfak) + her personelin kendi telefonu.
- Bildirim: hem ortak tablete hem kişisel telefonlara. iOS için PWA kurulumu
  gerekebilir (web push).

## Yol haritası (sırayla hepsi)
- **Faz 0 — Sadeleşme (kısmen tamam):** döner "mutfak ürünü" işareti netleşti,
  "Mutfağa Ödenecek" raporu, mağaza ID eşleştirme fix, stores.js sabitleri.
- **Faz 1 — Maliyet & fatura zekâsı:** anormal fiyat uyarısı, maliyet geçmişi,
  canlı kâr marjı. (Mevcut fatura+reçete+ingredients altyapısı üzerine.)
- **Faz 2 — Kazanç & rapor motoru:** kategori (kahve/alkol/raf), personel ve
  parti kazanç raporları + gün/ay/yıl aralıkları. (Personel raporu için önce
  siparişe "açan/kapatan personel" alanı eklenecek — şu an yok.)
- **Faz 3 — Kâr/zarar & aksiyon paneli:** net kâr + "şunu düzelt" önerileri.
- **Kesişen:** personel için aşırı kolay kullanım + telefon bildirimleri.

## Bildirim kararları
- **Sahip kanalı: Telegram.** Gün sonu özeti + uyarılar Telegram botundan.
  - Uyarı içerikleri: (1) **her sabah 09:00'da önceki günün özeti**
    (ciro, tahmini kâr, mutfağa ödenecek, en çok satan), (2) **anormal
    maliyet/fiyat artışı** — fatura kalemi önceki alıma göre **%10+** pahalıysa.
  - Özet zamanı: sabah 09:00 (Türkiye saati, UTC+3 → cron UTC 06:00), önceki gün.
  - Anormal fiyat eşiği: **%10** (hassas; sonradan ayarlanabilir).
- **Personel telefon bildirimi (web push):**
  - (1) **Yeni sipariş → mutfak/hazırlık** sorumlusu.
  - (2) **Sipariş hazır → garson** ("servise hazır").
  - Hedef: ortak kasa/mutfak tableti + kişisel telefonlar. iOS'ta PWA kurulumu gerekir.
- **Mimari (planlanan):** Telegram tarafı Supabase Edge Function + cron (gecelik)
  ve fatura kaydında olay-tetikli. Bot token'ı Supabase secret olarak saklanır
  (repoya asla yazılmaz). Personel push'u için service worker + VAPID + abonelik tablosu.

## Teknik notlar
- Stack: React + Vite + Supabase, Vercel'de yayında.
- ⚠️ Supabase ücretsiz katman ~1 hafta işlem olmazsa projeyi duraklatıyor
  (uygulama o zaman açılmıyor). En az bir kez bu yüzden takıldık.
- Siparişlerde henüz personel (created_by) alanı YOK — personel raporu öncesi eklenecek.
