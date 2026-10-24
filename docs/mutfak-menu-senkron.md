# Mutfak menüsü → NIP senkronu

Döner mutfağının kendi menüsü `kitchen_menu` tablosundadır (mutfak
uygulaması; fiyatın sahibi orasıdır). NIP'te aynı ürünlerin bir kopyası
vardır: `products`, DÖNER mağazası, Paris menüsünde görünen kategoriler
(Brunch, Döner, Atıştırmalıklar).

24.10'a kadar yalnız "tükendi" bilgisi geçiyordu ve eşleşme ürün adıyla
yapılıyordu. Ad değişince eşleşme kopuyor, fiyat değişikliği geçmiyordu.

## Şimdi

| Mutfakta ne olur | NIP'te ne olur | Telegram |
|---|---|---|
| Fiyat değişir | Bağlı ürünün fiyatı değişir | "fiyat ₺300 → ₺350" |
| Ürün kapanır / açılır | "Mutfakta tükendi" işareti değişir | evet |
| `names.tr/en/ru` değişir | Ürün adları değişir | "ad X → Y" |
| Yalnız `name` değişir (names.tr yok) | Türkçe ad değişmez | uyarı: Menü Yönetimi'nden düzelt |
| Yeni yemek eklenir (section kitchen) | Brunch'a eklenir, satışta | evet |
| Yeni döner eklenir (section doner) | Döner'e eklenir, **kapalı** (seçenekler tanımlanana kadar) | evet |
| Satır silinir | Ürün satıştan kapatılır, silinmez | evet |

Bağlantı: `products.kitchen_menu_id` = `kitchen_menu.id` (örn. `sucuklu_yumurta`).
Bağlantısı olmayan eski ürünlerde ad eşleşmesi sürer.

Emniyet: `nip-mutfak-menu-esitle` cron'u 15 dakikada bir bağlı ürünleri
tarar. Tetik her adımı kendi hata yakalayıcısında çalıştırır; mutfak
uygulamasının kaydı hiçbir zaman engellenmez.

Dosya: `supabase/migrations/20261024_mutfak_menu_senkron.sql`.
