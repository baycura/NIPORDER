-- ============================================================================
-- BIRIM MALIYET ONARIMI                       20260920_birim_maliyet_onarimi
-- ============================================================================
-- Panelde 50 sayi alani <input type="number"> idi ve tarayici o alanda virgulu
-- SESSIZCE yutuyordu: "12,50" yazilinca deger "1250" oluyor. Alan 20260918'de
-- SayiGirisi'ne gecirildi (virgul-guvenli), ama hata uygulamanin tum omru
-- boyunca canliydi — veritabaninda birikmis hasar kaldi.
--
-- 118 ajanli tarama (6 farkli acidan) 56 aday cikardi; her biri iki bagimsiz
-- denetciden gecirildi. Asagidakiler GECEN, kaniti veritabaninin kendisinde
-- olan duzeltmeler. Tahmine dayanan hicbir sey YOK: eksik maliyetler (Macallan,
-- Glenfiddich, Glenlivet, Aberlour + 9 malzeme) bilerek disarida birakildi,
-- onlar gercek alis fiyatiyla "Eksik Maliyetler" ekranindan girilmeli.
--
-- HEPSI KORUMALI: kosullar tutmazsa hicbir sey yazilmaz, iki kez calistirmak
-- guvenli. Zaten uygulanmis olanlar no-op gecer.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1) BIRIMI 'sise' AMA MALIYETI ML BASINA OLAN ICKILER
-- ----------------------------------------------------------------------------
-- Aperol, Monkey Shoulder, Bumbu Rom, Monkey 47 Sloe ve iki Cotes du Rhone:
-- unit='sise', stock_qty sise sayisi, ama cost_per_unit ML fiyati (3,26 gibi)
-- ve receteler de ml yaziyor (Monkey Shoulder recetesi "40" = 40 ml).
--
-- Maliyet hesabi bu yuzden DOGRU calisiyordu; bozulan STOK'tu. Bir kadeh
-- satista stoktan 40 dusuluyor, stok "2" yaziyor — ilk satista -38'e iniyor.
--
-- Bu tam olarak ayni hata 15.09.2026'da Campari'ye ELLE duzeltilmis; notu
-- stock_entries'te duruyor:
--   "Birim duzeltmesi: şişe -> ml, 1 sise = 1000 ml.
--    Recete 30 SISE dusuruyordu, artik 30 ml."
-- Alti kayit geride kalmis.
--
-- cost_per_unit'e DOKUNULMUYOR — o zaten ml basina dogru.
-- ABSOLUT VODKA disarida kalir: onun cost_per_unit'i 1739,24, yani gercekten
-- SISE fiyati; "< 10" kosulu onu eler.
with hedef as (
  select id, name, store_id, stock_qty as eski, unit_volume_ml,
         (stock_qty * unit_volume_ml) as yeni
  from ingredients
  where unit = 'şişe'
    and cost_per_unit > 0 and cost_per_unit < 10   -- ml fiyati mertebesi
    and unit_volume_ml is not null
),
defter as (
  insert into stock_entries (store_id, ingredient_id, kalem_adi, delta, before_qty, after_qty, unit, note)
  select store_id, id, name, yeni - eski, eski, yeni, 'ml',
         'Birim duzeltmesi: şişe -> ml, 1 sise = ' || unit_volume_ml ||
         -- NOT: bu metinde NOKTALI VIRGUL kullanma. Postgres icin sorun degil
         -- ama migrationlari ";" ile bolen bir calistiriciya denk gelirse
         -- ifadeyi ortasindan keser.
         ' ml. Maliyet zaten ml basinaydi, recete de ml yaziyordu, yalniz birim ' ||
         've stok olcegi yanlisti. Ayni duzeltme Campari''de 15.09.2026''da yapilmisti.'
  from hedef
  returning 1
)
update ingredients i set unit = 'ml', stock_qty = h.yeni
from hedef h where i.id = h.id;


-- ----------------------------------------------------------------------------
-- 2) BUD FICI BIRA — MALIYETI SIFIR KALMIS
-- ----------------------------------------------------------------------------
-- 17.09.2026 faturasi "BUD FIÇI 30 L" kalemini 137.500 ml @ 0,241745 = 33.240
-- TL diye yaziyor, ama malzeme kartinda cost_per_unit 0 kalmis. Deger uydurma
-- degil, faturanin kendi satiri: 33.240 / 137.500.
--
-- Etkisi: "Beer & Deer" (450 TL, recete 500 ml Bud) maliyeti 0,00 TL
-- gorunuyordu, yani %100 kar. Gercek marj %60.
update ingredients
set cost_per_unit = 0.2417454545454545
where name = 'Bud Fıçı Bira' and cost_per_unit = 0;


-- ----------------------------------------------------------------------------
-- 3) SODA (SISE) — SISENIN FIYATI ML HANESINE YAZILMIS
-- ----------------------------------------------------------------------------
-- Kayit ml bazinda (unit='ml', sise 200 ml) ama cost_per_unit = 30,85, yani
-- SISENIN fiyati. Her 1 ml soda 30,85 TL sayiliyor — 200 kat.
--
-- Sahip teyidi (18.09.2026): iki soda kaydi var; Fever Tree 97,88 TL/adet
-- dogru, sade soda "30 lira bandinda" — o rakam SISENIN fiyati.
--
-- Dogru deger: 30,85483870967742 / 200 = 0,1542741935483871 TL/ml
--
-- Etkisi (iki urun):
--   Churchill      150 TL satis: maliyet 6.178 TL -> 38 TL  (marj %75)
--   Aperol Spritz  600 TL satis: maliyet 1.104 TL -> 183 TL (marj %70)
--
-- STOGA DOKUNULMUYOR: -5.520 ml (-27,6 sise) duruyor, o fiziksel sayim isi.
update ingredients
set cost_per_unit = cost_per_unit / unit_volume_ml
where name = 'Soda (şişe)'
  and unit = 'ml'
  and unit_volume_ml > 1
  and cost_per_unit > 1;          -- duzeltilmis kayitta 0,154 — tekrar bolmez


-- ----------------------------------------------------------------------------
-- DOKUNULMAYANLAR (bilerek)
-- ----------------------------------------------------------------------------
-- * TORK PEAKSERVER HAND TOWEL — faturada 132 adet @ 17,63 yaziyor, denetciler
--   "12 koli @ 193,90" olmali diyor. Kagit faturayi gormeden stogu 132'den
--   12'ye cekmek tahmin olur. Sahibe soruldu.
-- * PET BARDAK KAPAK DUZ KLIPSLI 100 LU — faturada "1 adet @ 150 TL" kendi
--   icinde tutarli. 100'luk paketi 150 TL'ye aldiysa adet 1,50 olmali, ama
--   faturanin "paket" mi "adet" mi dedigi belirsiz. Sahibe soruldu.
-- * Macallan / Glenfiddich / Glenlivet / Aberlour + 9 malzeme — maliyetleri
--   sifir; bozuk degil, HIC GIRILMEMIS. Uretim verisine piyasa tahmini
--   yazilmaz; "Eksik Maliyetler" ekrani tam bunun icin var.
-- * Kucuk harfli mukerrer kayitlar (garrone rosso, garone bitter,
--   martinibianco, moly irish cream, tamnavulin, koskenkorva coffee liqueur)
--   — maliyetsiz, recetesiz, dogru kayitlari zaten var. Birlestirme/silme
--   ayri bir is, onay bekliyor.
--
-- Bu hata sinifinin TEKRARI 20260920'de kapatildi: lib/birimMaliyet.js
-- icindeki kapIkilemi(), kap fiyatinin olcu hanesine (ya da tersinin)
-- yazilmasini Stok Yonetimi ve Eksik Maliyetler ekranlarinda yakaliyor.
