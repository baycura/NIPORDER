# Geçiş günü dosyaları (rezervasyon Order'a taşınırken)

Bu klasördeki dosyalar **kendiliğinden uygulanmaz**. Göçüş yalnız
`supabase/migrations/` klasörünü okur.

| Dosya | Ne zaman | Ne yapılır |
|---|---|---|
| `kvkk_rezervasyon_surumu.sql.taslak` | Geçiş günü, geçişten ÖNCE | `SURUM_TARIHI` yerine o günün tarihi (YYYY-AA-GG) yazılır. Dosya `supabase/migrations/<tarih>_kvkk_rezervasyon.sql` adıyla kopyalanır ve birleştirilir. Üyeler ilk girişte yeni metni görür ve bir kez işaretler. |

Geçiş sırası (`docs/isletme-profili.md` içindeki "Geçiş (Aşama 3)" maddesi):

1. KVKK sürümü yayınlanır (yukarıdaki dosya).
2. Order veritabanında, SQL oturumunda: `select public.nip_rez_gecis_yap(true);`
3. Kontrol: panel (Rezervasyon), menü (rezervasyon talebi), web sitesi
   (parti listesi, üyenin "rezervasyonlarım" ekranı).
4. Geri dönüş gerekirse: `select public.nip_rez_gecis_yap(false);`

Metin taslaktır. Hukuki esas Türkçe metindir; EN ve RU bilgilendirme
çevirisidir. Bir hukuk danışmanının gözden geçirmesi önerilir.
