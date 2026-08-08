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

## Kadro (2026-08-07 itibarıyla — sürekli değişebilir, koda gömme!)
- **Omer (sahip, admin):** tam yetki, Telegram bağlı.
- **Ceren (eş, `viewer`/Gözlemci):** ÇALIŞMIYOR, personel değil. Satış/rapor,
  mutfağa ödenecek, stok ve ürün/fiyatları GÖREBİLİR; sipariş/kasa/vardiya
  ekranlarına girmez. Sabah özeti bağlanırsa ona da gider (admin+viewer hedefli).
- **Çalışanlar:** Mustafa (manager), Fatih (manager), Burcu (waiter).
- **Tolgacan:** ayrıldı → staff kaydı `is_active=false` (silinmedi, geçmiş raporlar için).
- **Part-time hafta sonu servis ekibi:** kişiler sürekli değişiyor, sabit değil.
  Bu yüzden TEK ORTAK HESAP: `parttime@notinparis.me` (rol `parttime`) — sadece
  Masalar + Sipariş + Kasa görür; mutfak/stok/vardiya/görevler kapalı.
  Kişi bazlı takip gerekirse Personel sayfasından gerçek hesap açılır.
- Pasif (`is_active=false`) personel GİRİŞ YAPAMAZ (AuthContext engeli) ve
  hiçbir Telegram bildirimi almaz.

## Vizyon: self-servis + üyelik (2026-08-08)
- **Self-servis hedefi:** Garson çağırma butonu İSTENMİYOR. Müşteri siparişini
  menüden kendi verir, hazır olunca kendisi alır, (ileride) ödemeyi de kendisi
  yapar. Online ödeme için PSP (iyzico/PayTR vb.) anlaşması gerekecek — henüz yok.
- **Üyelik sistemi (KURULDU):** Müşteri menüde Google ile giriş yapar →
  `customers` kaydına bağlanır. Üyeler sayfasından kişiye özel **ürün bazlı
  SABİT ₺ indirim** tanımlanır (`member_discounts`); üye menüde indirimli fiyatı
  "ÜYE" rozetiyle görür. Siparişe `customer_id` yazılır → müşteri karnesi
  (sipariş sıklığı, harcama, favoriler) Üyeler sayfasında.
- **Amaç:** Eş-dost indirimlerini kayıt altına almak + müşteri alışkanlık verisi.
- **reservation.notinparis.me = Shopify** (doğrulandı: bağlı mağaza NOT IN PARIS
  / notinparis.me, Basic plan, TRY). Katalog: Pas Normal Studios (bisiklet giyim,
  ~200 ürün — QR menüde GÖSTERİLMEZ) + "Not in Paris" koleksiyonu (11 NIP merch).
- **QR menü = vitrin (KURULDU, 5 alt sekme):** Menü 🍽 | Etkinlik 🎟 | Sürüş 🚴 |
  Shop 👕 | Blog 📰 (YouTube alt bar benzeri — sahibin ekran görüntüsüyle onaylandı).
  - Etkinlik/Sürüş: Shopify koleksiyonlarından (`etkinlikler`, `surusler` — bizim
    açtığımız manuel koleksiyonlar) `shopify-feed` edge fn ile çekilir (public
    products.json, token yok, 10 dk cache). Etkinlik sekmesinde "Rezervasyon yap"
    → reservation.notinparis.me. Kartlar notinparis.me ürün sayfasına gider.
  - Shop: Shopify'dan ÇEKİLMEZ (sahip kararı) — `posts` tablosu (kind='urun'),
    tişört hikayeleri/fotoğrafları; satış yok, "kasadan alabilirsin" notu.
  - Blog: `posts` (kind='blog') — haberler + Fethiye tavsiyeleri. Amaç: sipariş
    hazırlanırken müşteri uygulamada kalsın, hazır bildirimi şansı artsın.
  - İçerik yönetimi: Yönetim > "Vitrin & Blog" sayfası (foto: product-images
    bucket, posts/ klasörü).
  - Sipariş sonrası "Beklerken göz at" → sekmelerde gezinirken takip arkada sürer,
    sarı "Siparişin hazırlanıyor" çubuğu görünür, hazır olunca büyük 🔔 ekranı döner.

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
- ✅ Edge fn `telegram` v3 deploy (setup/send/webhook/notify/daily_summary; verify_jwt=false, secret korumalı).
- ✅ Telegram webhook kuruldu ("Webhook was set") — pg_net ile DB'den.
- ✅ DB trigger'ları (migration `20260807_telegram_triggers_and_cron.sql`): order_items
  insert/update → items_sent; kitchen_status→ready → items_ready. Hedefleme edge fn'de:
  shift status=active + telegram_chat_id dolu (kitchen rolü öncelikli; hazır → siparişi açan).
- ✅ Siparişe staff_id yazılıyor; Vardiyadan Çık butonu; Vardiyam'da Telegram bağlama butonu.
- ✅ pg_cron: `nip-close-shifts` 03:00 UTC (06:00 TR, açık vardiyaları kapatır) +
  `nip-daily-summary` 06:00 UTC (09:00 TR, admin'lere gün-sonu özeti). İkisi de aktif.
- ✅ Omer /start ile bağlandı; test mesajı + canlı özet denemesi gönderildi (2026-08-07).
- ⏳ Diğer personel (Mustafa, Fatih, Burcu) henüz Telegram'a bağlanmadı
  (Vardiyam > 'Telegram bildirimlerini aç'). Ceren de bağlanırsa sabah özeti alır.
- ⏳ %10 fiyat uyarısının Telegram'a bağlanması — sıradaki.

## Teknik notlar
- Stack: React + Vite + Supabase, Vercel'de yayında.
- ⚠️ Supabase ücretsiz katman ~1 hafta işlem olmazsa projeyi duraklatıyor
  (uygulama o zaman açılmıyor). En az bir kez bu yüzden takıldık.
- orders.staff_id artık sipariş açılışında dolduruluyor (personel raporu hazır olacak).

## GÜNCELLEME (2026-08-08) — Güvenlik denetimi + Fatura OCR
- ✅ Güvenlik sıkılaştırma (migration `20260808_security_hardening_audit.sql`):
  - KRİTİK açık kapatıldı: `admin_create_staff_with_auth` artık yalnız aktif admin/manager/owner
    çağırabilir (eskiden HİÇ kontrol yoktu — Google ile giren herhangi bir müşteri admin açabilirdi).
    admin/owner/super_admin rolünü yalnız admin oluşturabilir.
  - `admin_set_user_password`: admin de dahil, aktiflik kontrolü eklendi.
  - `is_staff()` artık `is_active=true` şartı arıyor; pasif personel yazamaz.
  - Storage policy'leri eklendi (product-images herkese okuma, yazma personel;
    invoices yalnız personel) — daha önce policy yoktu, yükleme sessizce bozuktu.
  - 4 view `security_invoker=true`; yardımcı fonksiyonlara `search_path` sabitlendi;
    tetikleyici fonksiyonlardan anon/authenticated EXECUTE yetkisi alındı.
  - Çift Telegram bildirimi düzeltildi: v1 trigger'lar düşürüldü
    (migration `20260808_drop_v1_telegram_triggers.sql`).
  - ⏳ Kullanıcı aksiyonu: Supabase Dashboard > Auth > Leaked password protection AÇ.
- ✅ Fatura OCR (edge fn `invoice-ocr` v1, verify_jwt=true):
  - Faturalar > Yeni Fatura > fotoğraf seç > "🤖 Fotoğraftan doldur (AI)".
  - Fotoğraf SAKLANMAZ (istemci ~1600px JPEG'e küçültüp gönderir); Claude vision
    (claude-opus-5, structured output) tedarikçi/tarih/kalemleri çıkarır,
    mevcut hammaddelerle bulanık eşleştirme yapılır, satırlar önceden doldurulur.
  - Yalnız aktif admin/manager/owner çağırabilir; anahtar: env `ANTHROPIC_API_KEY`
    ya da bot_config `anthropic_api_key`. ⏳ Kullanıcı aksiyonu: console.anthropic.com'dan
    API anahtarı alıp bot_config'e eklemek (yoksa buton "AI anahtarı tanımlı değil" der).
- ✅ Tolgacan hesabı kapatıldı (is_active=false, şifre rastgele, oturumlar silindi).
- ✅ Canlı uçtan uca test: sipariş → mutfak bildirimi → hazır bildirimi (Telegram'a ulaştı).

## GÜNCELLEME (2026-08-08, akşam) — Tek QR + Web Push + Anormal fiyat uyarısı
- ✅ Tek QR self-servis: order.notinparis.me/menu — isim yazılmadan "Sipariş Ver" çalışmaz.
- ✅ Web push (edge fn `web-push` v1 + `push_subscriptions` tablosu + `wp_items_ready`
  trigger'ı): sipariş hazır olunca müşterinin KİLİTLİ telefonuna da bildirim gider.
  VAPID anahtarları bot_config'te; abonelik sipariş başına, gönderim sonrası silinir;
  gece 06:30 TR eski abonelik temizliği (nip-clean-push-subs cron).
  ⚠️ iPhone: yalnız ana ekrana eklenmiş (PWA) halde çalışır; Android Chrome direkt.
- ✅ PWA: manifest.json + sw.js + ikonlar (Coolvetica "N"); uygulama ana ekrana eklenebilir.
- ✅ Anormal fiyat artışı (%10+) artık sahibe Telegram'dan gidiyor (telegram fn v5,
  `price_alert` rotası — personel JWT korumalı; admin+viewer bağlı olanlara).
- ✅ Google "rate us" linki gerçek işletme linkiyle değişti (share.google/AA07eYRVqpAoNFL8P).
- ⏳ iyzico online ödeme: kullanıcının sanal POS'u var; API Anahtarı + Güvenlik Anahtarı
  (merchant.iyzipay.com > Ayarlar > API) gelince Checkout Form entegrasyonu yapılacak.
- ⏳ Anthropic API anahtarı bekleniyor (fatura OCR); Pazartesi gerçek faturayla test.
