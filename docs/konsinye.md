# Konsinye ürünler

Sahip (24.10): "IZIPIZI gözlükler konsinye ve %40'ı bizim. Konsinye ürünlerin
maliyetlerini bu şekilde girebiliriz."

## Kural

Konsinye ürün tedarikçinin malıdır. Alış fiyatı yoktur. Satış olunca
satışın bir yüzdesi bize kalır, kalanı tedarikçiye ödenir.

    maliyet = satış × (100 − bizim pay) / 100
    IZIPIZI: satış ₺5.000, bizim pay %40 → maliyet ₺3.000, kâr ₺2.000

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
İkram: tedarikçiye liste fiyatından borç yazar; kârlılıkta eksi kâr görünür.

## Veritabanı

`supabase/migrations/20261024_konsinye.sql`:
`nip_konsinye_mi(uuid)`, `nip_konsinye_pay(uuid)`, `nip_konsinye_tedarikci(uuid)`,
`nip_konsinye_raporu(store, bas, bit)`; `urun_karliligi` ve `eksik_maliyetler`
yeniden tanımlandı. IZIPIZI kategorisi %40 ile işaretlendi.
