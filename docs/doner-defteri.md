# Döner Defteri

Not in Paris Döner ayrı bir limited şirkettir. Döner Defteri bu şirketin basit
defteridir: gider ve faturalar (kim ödedi), gün sonu tezgah satışı, ürün
maliyeti ve günlük adet, borçlular, günlük/haftalık/aylık özet.

Kafe uygulamasından (order.notinparis.me) bağımsız çalışır:

| | Kafe (NIPORDER) | Döner Defteri |
|---|---|---|
| Site | order.notinparis.me | doner.notinparis.me (Vercel projesi `doner-defteri`) |
| Vercel Root Directory | `isletme/kafe` yok; kök | `isletme/doner` (+ "Include source files outside of the Root Directory") |
| Giriş | `staff` tablosu (AuthContext) | `doner_kullanicilar` (admin / personel, onay bekler) |
| Veri | tüm tablolar | yalnız `doner_*` + `kitchen_menu` (okuma) |
| Supabase | aynı proje (`gbbxxcduuwdmvfayxzeg`) | aynı proje, ayrı `storageKey` (`nip-doner-auth`) |

Döner kullanıcıları `staff` tablosunda **yoktur**; kafe tablolarına RLS geçit
vermez. Kafe personeli de `doner_*` tablolarını göremez. İki tarafı da yalnız
listede olan ortaklar görür (Ömer, Ceren; Tolga kayıt olunca onaylanır).

## Sunucu (`supabase/migrations/20261020_doner_defter.sql`)

| Nesne | Görev |
|---|---|
| `doner_kullanicilar` | kim girebilir; `rol` admin/personel, `aktif` false = onay bekler |
| `doner_giderler` | fatura/gider: tarih, kategori, tutar, KDV, tedarikçi, fatura no, **odeyen** (kasa ya da ortak adı), yöntem |
| `doner_gunsonu` | gün başına nakit + kart (tezgah) |
| `doner_urun_maliyet` | `kitchen_menu` ürününe birim maliyet |
| `doner_satislar` | gün + ürün + adet (tezgahtan satılan; QR ve kafe kendiliğinden) |
| `doner_borclular` | veresiye defteri, ödendi işareti |
| `doner_uye()` / `doner_admin()` | RLS kapıları (aktif üye / aktif admin) |
| `doner_kayit_iste(p_ad)` | giriş yapan kişi kendini listeye yazar (aktif=false); admin onaylar |
| `doner_ozet(p_bas, p_bit)` | tezgah + QR (`kitchen_orders`, kafeden gelmeyenler) + kafe konsinye (hakediş kuralı: ikramda liste fiyatı) geliri; gider kategori/ödeyen; maliyet; açık borç; günlük seri. DEFINER, önce `doner_uye()` kontrolü |

RLS: aktif üye okur, ekler, düzeltir; **silme yalnız admin**; `anon` hiçbir
şeye erişemez. `doner_kullanicilar`: onay bekleyen yalnız kendini görür; yazma
yalnız admin; insert yalnız RPC ile.

## Kullanıcı akışı

1. Yeni kişi sitede **Kayıt ol** (ad, e-posta, şifre). E-posta onayı açıksa
   gelen bağlantıya dokunur.
2. Girince "Onay bekliyor" görür. Bir admin **Kullanıcılar** ekranından
   "Personel olarak onayla" ya da "Yönetici" der.
3. Personel: gider, gün sonu, adet, borç girer ve düzeltir; silemez.
   Yönetici: ek olarak siler, kullanıcı onaylar/çıkarır.

## Kurulum notları

- Vercel: proje `doner-defteri`, repo `baycura/NIPORDER`, Root Directory
  `isletme/doner`, `sourceFilesOutsideRootDirectory` açık. `vercel.json`
  repo kökünde `npm ci` + `vite build --config isletme/doner/vite.config.js`.
- `isletme/doner/vite.config.js` `VITE_PROFIL=doner` verir ve ortak
  `index.html`'in girişini `src/doner/main.jsx` yapar; kafe sayfaları pakete
  girmez (≈60 KB uygulama kodu).
- Supabase Auth > URL Configuration > **Redirect URLs** listesine
  `https://doner.notinparis.me/**` (ve geçici Vercel adresi) eklenmeli; yoksa
  şifre sıfırlama ve e-posta onayı bağlantıları kafe sitesine düşer.
- DNS: `doner` CNAME → `cname.vercel-dns.com` (notinparis.me DNS'i Vercel'de
  değil).

## Telegram botu (`20261021_doner_telegram_ortak.sql`)

Döner için **ayrı** bot; kafe botuna ve `nip_tg_*` fonksiyonlarına dokunulmaz.

| Parça | Görev |
|---|---|
| Vault `doner_tg_token` | bot anahtarı; sahip SQL Editor'de `select vault.create_secret('ANAHTAR', 'doner_tg_token');` ile yazar |
| `doner_ayar` | `tg_chat` (grup), `tg_chat_ad`, `site`; dışarıdan erişim yok |
| `doner_tg_gonder` / `doner_tg_giden` / `doner_tg_kontrol` | pg_net ile gönderim, kuyruk, 2 dk'da bir tekrar (en fazla 3) — cron `doner-tg-tekrar` |
| `trg_doner_tg_siparis` (kitchen_orders) | yeni sipariş (QR + kafe), kalem değişikliği, iptal (kalemler boşalınca ya da kafe köprüsü "İPTAL!" yazınca). Dakikada en fazla 12 mesaj. **Hata yutar**: kafe köprüsünün işlemi asla durmaz |
| `trg_doner_tg_gider` + `trg_doner_tg_gider_degisti` | girilen gider: tutar, kim ödedi, kim girdi; düzeltme (önce/şimdi) ve silme: kim yaptı |
| `doner_giren_ata` (5 tabloda) | `giren` istemciden değiştirilemez: girişte `auth.uid()`, düzeltmede ilk giren kalır (gün sonunda son düzelten) |
| `trg_doner_tg_gunsonu` | gün sonu girilince/düzeltilince günün özeti (tezgah, QR, kafe, gider, net) |
| `doner_gunsonu_hatirlat` | cron `doner-gunsonu-hatirlat` 20:00 UTC = 23:00 TR; gün sonu yoksa hatırlatma + `/gunsonu` bağlantısı |
| `doner_tg_kod_al`, `doner_tg_grup_bul` + `_sonuc` | admin "Kod al" → grupta `/baglan 123456` → "Grubu bul": `getUpdates` (offset ile ileri) yalnız **grup/supergrup**taki doğru kodu kabul eder; kod 30 dk geçerli (`20261022_doner_tg_duzeltme.sql`) |
| `doner_tg_durum`, `doner_tg_test`, `doner_tg_grup_cikar` | Ayarlar ekranı (yalnız admin) |

Kurulum: @BotFather → `/newbot` (kafe botunun anahtarı KULLANILMAZ) →
anahtarı Vault'a yaz → grup aç, botu ekle → Ayarlar → "Kod al" → grupta
`/baglan KOD` → "Grubu bul" → "Test mesajı". Anahtar değişirse:
`select vault.update_secret((select id from vault.secrets where name = 'doner_tg_token'), 'YENI');`

Çeviri sözlüğü `nip_mutfak_sozluk_tam()` (menünün `names/variants/extras`
tr/en/ru alanları + `nip_mutfak_sozluk`) 18.10'da canlıda açılmıştı; tanımı
artık `20261022_doner_tg_duzeltme.sql` içinde.

## Ortak ödemeleri ve e-Fatura

- `doner_ortaklar()`: ödeyene göre tüm zamanlar / bu ay / geçen ay / son tarih.
  Özet'te "ORTAK ÖDEMELERİ" kartı; ada dokununca Giderler `?odeyen=Ad` ile açılır.
- Giderler formunda **e-Fatura XML yükle**: `src/lib/ublInvoice.js` (kafeyle
  ortak UBL-TR çözümleyici) tedarikçi, fatura no, tarih ve KDV dahil toplamı
  doldurur; kalem adları açıklamaya yazılır. Otomatik API çekimi için
  entegratör (GİB özel entegratör) ve anahtar gerekir; henüz yok.

## Rusça sipariş

`kitchen_orders.items[].det` 05.10'dan beri `trg_mutfak_det_turkce` ile Türkçeye
çevrilir (`nip_mutfak_sozluk` + menü sözlüğü). 20.10: " · Not: ..." ile biten
parça da çevrilir (`nip_mutfak_parca_turkce`); müşteri notu olduğu gibi kalır.
Ürün adı (`name`) menüdeki ana ad; müşteri serbest notu (`note`) çevrilmez.
Fiş yazı boyutu nip-kitchen uygulamasının içindedir; kaynak kodu bu depoda yok.
