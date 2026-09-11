# Yeni işletme kurulumu (ayrı veritabanı)

Aynı uygulama, başka bir işletme, **hiç karışmayan veri**: yeni bir Supabase
projesi açılır, Order'ın şeması oraya kopyalanır, işletmenin kendi Vercel
projesi `isletme/<slug>` kökünden yayına alınır. Kaynak kod tek repodur; her
düzeltme iki işletmeye birden gider. NIP'e özel modüller (Telegram, Shopify,
sürüşler, parti, RESERVE köprüsü, fatura OCR) profil seçimiyle kapanır
(`src/lib/profil.js`).

## Neden migration'lar yetmiyor

`supabase/migrations/` 2026-08-07'den başlar; `orders`, `products`, `staff`
gibi temel tablolar daha eski ve dosyada yok. Bu yüzden şema canlı Order
kataloğundan üretilir (`sema_uretici.sql`) ve hedef projeye pg_net ile
gönderilir (`sema_gonder.sql`). Sonuç Order'ın birebir kopyasıdır: 51 tablo,
72 fonksiyon, 5 görünüm, 95 politika, tetikleyiciler, storage kovaları.
İleride yazılan her migration **iki projeye de** uygulanır.

## Adımlar

**0. Supabase projesi.** Ücretsiz planda organizasyon başına 2 aktif proje
var; NIP'in ikisi dolu (Order + RESERVE). Seçenekler: işletme kendi
Supabase hesabını açar ve Ömer'i organizasyona *Owner* olarak davet eder
(ücretsiz, veri ve fatura onlarda kalır) **ya da** NIP organizasyonu Pro'ya
geçer (25 $/ay). Bölge: `eu-central-1` (Frankfurt, Türkiye'ye en yakın).

**1. Hedefi hazırla** (yeni projede SQL editörü): `01_hedef_hazirlik.sql`
içindeki `<SIR>` yerine rastgele uzun bir değer yaz, çalıştır. Project
Settings > API'den *Project URL* ve *anon key*'i not et.

**2. Kaynağı hazırla** (Order'da SQL editörü): `sema_uretici.sql`, ardından
`sema_gonder.sql`, ardından `select * from kurulum.uret();`.

**3. Gönder** (Order'da), üç grup **sırayla**, her grupta `kurulum.sonuc()`
200 + `ok` verene kadar bekle:

```sql
select kurulum.gonder('https://HEDEF.supabase.co', '<hedef anon>', '<SIR>',
  array['00_baslik','01_uzanti','02_tip','03_sekans','03b_fonksiyon']);
select * from kurulum.sonuc();
select kurulum.gonder('https://HEDEF.supabase.co', '<hedef anon>', '<SIR>',
  array['04_tablo','05_kisit','06_fonksiyon','07_gorunum','08_fk','09_indeks','10_tetikleyici']);
select * from kurulum.sonuc();
select kurulum.gonder('https://HEDEF.supabase.co', '<hedef anon>', '<SIR>',
  array['11_rls','12_yetki','13_yorum','14_yayin','15_depolama']);
select * from kurulum.sonuc();
```

Doğrulama (hedefte): `select count(*) from pg_tables where schemaname='public'`
→ 51; `select count(*) from pg_policies where schemaname='public'` → 95.

**4. Profil ve tohum** (hedefte): `02_temel_profil.sql` (dış servis
tetikleyicileri kalkar, cron yalnız yerel işler), sonra `03_tohum.sql`
(`<STORE_ID>`, `<SLUG>`, `<ISLETME_ADI>`, `<ADMIN_EPOSTA>`, `<ADMIN_AD>`,
`<GECICI_SIFRE>` doldurulur). `<STORE_ID>` ile
`isletme/<slug>/vite.config.js` içindeki `VITE_STORE_ID` aynı olmalı.

**5. Temizlik**: hedefte `04_temizlik.sql`; Order'da `drop schema kurulum cascade;`.

**6. Uygulama**: `isletme/README.md` (vite config, ikonlar, Vercel projesi).

**7. Auth ayarları** (hedef Supabase > Authentication): Site URL = uygulama
adresi; e-posta/şifre girişi açık (personel böyle girer). Google girişi bu
profilde kapalı, ayar gerekmez. *Leaked password protection* aç.

## Gizli anahtar yok

Bu klasördeki dosyalarda sır yoktur; `<SIR>` yalnızca kurulum sırasında elle
yazılır ve `04_temizlik.sql` ile silinir. Telegram/Shopify/PayTR anahtarları
bu profilde hiç gerekmez.
