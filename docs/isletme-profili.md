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
- **Personel bildirimi de TELEGRAM** (kullanıcı önerisi — web push yerine):
  - Web push'un zahmeti yok (service worker/VAPID/iOS PWA gerekmez), her telefonda çalışır.
  - (1) **Yeni sipariş → mutfak/hazırlık**, (2) **Sipariş hazır → garson**.
  - **Yönlendirme: KİŞİYE ÖZEL DM** (grup değil). Her personel bota bağlanır,
    bildirim role/kişiye göre gider.
  - **Kayıt akışı:** uygulamada kişiye özel "Telegram'a bağlan" butonu →
    `t.me/BaycuraBot?start=<kod>` → webhook chat_id'yi o personele bağlar.
  - **Kime gider? "O an vardiyada olan" kişiler.** Sabit çizelge/izin YOK;
    personelin "Vardiyaya Gir/Çık" dokunuşu canlı gerçektir:
    - izin/gelmeyen → vardiya yok → bildirim yok
    - değişken saat / aynı anda çok kişi → hepsi otomatik doğru çalışır
    - Bildirim koşulu: bugünkü shift status=active **ve** staff.telegram_chat_id dolu.
  - **`orders.staff_id`** alanı ZATEN VAR ama sipariş açılışında doldurulmuyor →
    doldurulacak (hazır→garson yönlendirmesi + personel satış raporu). Migration gerekmez.
  - **Vardiya çıkışı eklenecek:** shifts.status active→done + checked_out_at;
    unutanlar için gece otomatik kapanış (cron).
  - shifts tablosu: staff_id, date, checked_in_at, status (active). "VARDIYAYA GİR" var, çıkış YOK.
- **Bot:** @BaycuraBot (t.me/BaycuraBot). Token repoya ASLA yazılmaz; Supabase
  tarafında saklanır (edge secret veya service-role-only tablo).
- **Mimari (planlanan):** Tek Supabase Edge Function `telegram`:
  - Telegram webhook alıcısı → gelen mesajdan chat_id öğrenip `telegram_chats`'e yazar.
  - Gönderim: sahip DM (özet/uyarı) + personel grubu (sipariş bildirimleri).
  - Gün-sonu özeti: pg_cron 06:00 UTC (=09:00 TR) → fonksiyonu çağırır.
  - Yeni sipariş / hazır: orders/order_items üzerinde DB webhook/trigger → fonksiyon.
  - Anormal fiyat: fatura kaydında client `functions.invoke` ile fonksiyonu tetikler.
- ⚠️ Not: Bu geliştirme sandbox'ı `api.telegram.org`'a çıkamıyor (ağ politikası).
  Gönderimi Supabase Edge Function yapar (o erişebilir); testi Supabase logları +
  tarayıcı üzerinden yaparız.

## KURULUM DURUMU (2026-08-07)
- ✅ bot_config (kilitli, RLS policy'siz) — token + webhook_secret DB'de.
- ✅ staff.telegram_chat_id + shifts.checked_out_at alanları eklendi.
- ✅ Edge fn `telegram` v2 deploy (setup/send/webhook/notify; verify_jwt=false, secret korumalı).
- ✅ Telegram webhook kuruldu ("Webhook was set") — pg_net ile DB'den.
- ✅ DB trigger'ları: order_items sent_to_kitchen → new_order; tüm kalemler ready →
  order_ready. 90 sn debounce (tg_notify_log). Hedefleme edge fn'de: bugünkü shift
  status=active + telegram_chat_id dolu (kitchen rolü öncelikli; hazır → siparişi açan).
- ✅ Siparişe staff_id yazılıyor; Vardiyadan Çık butonu; Vardiyam'da Telegram bağlama butonu.
- ⏳ Sahip (Omer) henüz /start ile bağlanmadı → bağlanınca uçtan uca test.
- ⏳ Gece otomatik vardiya kapanışı (cron) + sabah 09:00 gün-sonu özeti + %10 fiyat
  uyarısının Telegram'a bağlanması — sıradaki.

## Teknik notlar
- Stack: React + Vite + Supabase, Vercel'de yayında.
- ⚠️ Supabase ücretsiz katman ~1 hafta işlem olmazsa projeyi duraklatıyor
  (uygulama o zaman açılmıyor). En az bir kez bu yüzden takıldık.
- orders.staff_id artık sipariş açılışında dolduruluyor (personel raporu hazır olacak).
