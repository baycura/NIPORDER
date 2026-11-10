# Konsinye ürünler

Sahip (24.10): "IZIPIZI gözlükler konsinye ve %40'ı bizim. Konsinye ürünlerin
maliyetlerini bu şekilde girebiliriz."

## Kural

Konsinye ürün tedarikçinin malıdır. Alış fiyatı yoktur. Satış olunca
satışın bir yüzdesi bize kalır, kalanı tedarikçiye ödenir.

    tedarikçi payı = etiket fiyatı × (100 − bizim pay) / 100
    bizim pay      = gerçek satış − tedarikçi payı
    IZIPIZI: etiket ₺5.000, bizim pay %40 → tedarikçiye ₺3.000, bize ₺2.000
    İndirimli satış (₺4.500): tedarikçiye yine ₺3.000, bize ₺1.500 (1.11 kuralı)

## Tanım yeri (en özel kazanır)

| Düzey    | Nerede                                   | Alanlar                              |
|----------|------------------------------------------|--------------------------------------|
| Ürün     | Menü Yönetimi → ürün; Ürünler (Raf) → ürün | `konsinye` (boş = devral), `konsinye_pay_pct` |
| Marka    | Ürünler (Raf) → marka                    | `konsinye`, `konsinye_pay_pct`       |
| Kategori | Menü Yönetimi → kategori                 | `konsinye`, `konsinye_pay_pct`       |

Marka ya da kategori konsinye diyorsa ürün konsinyedir. Pay önce üründen,
sonra markadan, sonra kategoriden okunur. Ürün `konsinye = false` ile
kendini dışarıda bırakabilir.

## Raporlar

- **Ürün Kârlılığı**: kaynak `pay` ("konsinye payı"). Maliyet satışın
  tedarikçi payı kadar. Kâr = bizim pay.
- **Eksik Maliyetler**: payı yazılı konsinye ürün listelenmez. Konsinye ama
  payı yok ise "KONSİNYE" tipiyle listelenir; alış fiyatı değil pay istenir.
  Kârlılıkta böyle ürün "maliyet yok" sayılır, eski alış fiyatı kullanılmaz.
- **Konsinye Hesabı** (`/konsinye`, yalnız sahip): ay ay, tedarikçi tedarikçi
  adet, satış, bizim pay, ödenecek. "Mutabakat metnini kopyala" WhatsApp için.

Dönem: işletme günü (03:00), ödenmiş fişler, ödeme tarihine göre.
Tedarikçi payı her zaman etiket fiyatından; indirim ve ikram bizim paydan
düşer (ikramda bizim pay eksi olur). Göç: `20261101_konsinye_etiket.sql`.

## Veritabanı

`supabase/migrations/20261024_konsinye.sql`:
`nip_konsinye_mi(uuid)`, `nip_konsinye_pay(uuid)`, `nip_konsinye_tedarikci(uuid)`,
`nip_konsinye_raporu(store, bas, bit)`; `urun_karliligi` ve `eksik_maliyetler`
yeniden tanımlandı. IZIPIZI kategorisi %40 ile işaretlendi.

## Aylık hesap kesimi ve "Ödendi" (1.11.2026)

Her ayın 1'inde 04:15'te (`nip-konsinye-aylik` cron) geçen ayın hesabı
tedarikçi tedarikçi kesilir ve `konsinye_hesaplar` tablosuna yazılır:
adet, perakende toplamı, tedarikçi payı (etiket üzerinden), bizim pay,
ürün satırları (`satirlar` jsonb). Sahibe Telegram özeti gider.

- Kayıt "Bekliyor" olarak durur. Sahip (admin) Konsinye Hesabı sayfasında
  "Ödendi"ye basınca kapanır (`nip_konsinye_odendi`). Geri alınabilir.
- Ödenmiş kayıt yeniden kesimde değişmez. Bekleyen kayıt "Hesapları kes"
  ile güncel satışla tazelenir (`nip_konsinye_hesap_kes`, yalnız admin).
- Mağazanın tüm yöneticileri görür (RLS: `is_staff` + mağaza); "Ödendi"
  ve "Hesapları kes" yalnız admin.
- Her kart tedarikçiye giden Excel ile aynı düzendedir; "Excel (CSV) indir"
  ve "Metni kopyala" düğmeleri vardır. "Canlı" sekmesi ayın o anki durumunu
  gösterir, kesim yapmaz.

Göç: `supabase/migrations/20261101_konsinye_hesaplar.sql`.

### Elle düzeltme (kilit)

Kasaya girilmemiş bir satış hesaba elle eklenirse kayıt **kilitlenir**
(`kilitli`, `duzeltme_notu`): yeniden kesim ödenmiş kayıt gibi ona da
dokunmaz. Sayfada "Düzeltildi" etiketi ve not görünür; not tedarikçi
Excel'ine ve kopyalanan metne de girer. Kasa kaydı sonradan girilirse kilit
kaldırılıp yeniden kesilebilir. Örnek: Mashqhead Ekim 2026, Beige Linen
Sailor Hat 1 → 2 adet (`20261101_konsinye_hesap_duzeltme.sql`).

Yetki: `nip_konsinye_hesap_kes` SECURITY DEFINER olduğu için kimliği
`current_user`'dan değil `auth.uid()` / `auth.role()`'den alır; oturumdan
yalnız admin ve kendi mağazası için çağırabilir, cron ve edge fonksiyonu
serbesttir. `nip_konsinye_aylik` yalnız cron (`20261101_konsinye_yetki.sql`).

## Aylık e-posta (1.11.2026)

Her ayın 1'inde 04:45'te (`nip-konsinye-mail` cron → `nip_konsinye_mail_gonder`
→ edge fonksiyonu `konsinye-mail`) geçen ayın hesapları **tedarikçi başına bir
Excel** olarak tek e-postayla gider. Dosya düzeni tedarikçiye elden gönderilen
dosyayla aynı: başlık "MARKA × NOT IN PARIS / Ekim 2026 Satış Raporu", ürün
satırları, formüllü toplam ve paylar, sarı "Ödenecek tutar", varsa düzeltme
notu ya da "ödemesi yapıldı" satırı. E-posta gövdesinde tedarikçi özeti
(adet, perakende, oran, ödenecek, durum) ve Konsinye Hesabı bağlantısı vardır.

- Alıcılar ve son gönderim: `konsinye_mail` tablosu (mağaza başına bir satır;
  yalnız personel okur, yazma yalnız edge fonksiyonu). Varsayılan alıcı
  cerenbaycura@gmail.com. `app_settings` kullanılmadı: anon'a açık okunur.
- Sağlayıcı anahtarı edge fonksiyonu gizli değişkenlerinde (Supabase →
  Edge Functions → Secrets): `BREVO_API_KEY` (ya da `RESEND_API_KEY`).
  Gönderici adresi: Brevo hesabındaki doğrulanmış ilk gönderici kendiliğinden
  kullanılır; `MAIL_FROM` ("Not in Paris <adres>") isteğe bağlıdır.
  Anahtar yoksa fonksiyon açık hata verir, cron'da sahibe Telegram uyarısı
  gider; e-posta gönderilmez. Aynı anahtar rezervasyon onay e-postalarını da
  gönderir (`rez-bildirim`, bkz. `docs/rezervasyon-onay.md`).
- Sayfada admin "E-postayla gönder" ile seçili ayı hemen yollar; panelin
  altında alıcı ve son gönderim sonucu görünür.
- Kayıt yoksa fonksiyon önce kesim yapar (`nip_konsinye_hesap_kes`).
- Excel yazıcı: `supabase/functions/konsinye-mail/xlsx.ts` (fflate ile zip,
  stil + formül + önbellek değeri; Gmail önizlemesi formül hesaplamaz).

Göç: `supabase/migrations/20261101_konsinye_mail.sql`.

### Hesap düzeni (10.11.2026, `20261110_konsinye_duzen.sql`)

- Süren ay kesilmez ve "Ödendi" işaretlenmez (yarım ay donmasın); sayfa
  yalnız bitmiş ayları sunar. Ayın o anki durumu "Canlı" sekmesindedir.
- Bir tedarikçide ürün bazında farklı pay oranı varsa `pay_karisik` işaretlenir;
  sayfa, CSV ve Excel "karışık pay" der ve satır tutarlarını kullanır.
- Tedarikçi adı değişirse eski addaki bekleyen satır yeniden kesimde
  sıfırlanır ve not alır (silinmez); toplam iki kez sayılmaz.
- Telegram özeti tutarları "20.640" biçiminde yazar; ödenmiş satırlar
  "(ödendi)" diye listelenir, "Toplam ödenecek"e girmez.
- CSV'de pay oranı yazılmamışsa tutar yerine "pay yazılmadı" yazılır.
