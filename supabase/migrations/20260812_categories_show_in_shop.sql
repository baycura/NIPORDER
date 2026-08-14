-- Musteri tarafi ayrimi: Menu sekmesi yalniz yiyecek/icecek; raf urunleri
-- (kisisel bakim, sapka, kolye, seramik, merch...) Shop sekmesine tasinir.
--
-- Davranis:
--   * show_in_shop=true kategoriler musteri MENU pill'lerinde gorunmez;
--     Shop sekmesinde marka basliklariyla 2 sutunlu, sepete eklenebilir
--     bir vitrin olarak listelenir. Ayni sepet/odeme akisi calisir.
--   * Bu urunler siparis verildiginde sent_to_kitchen=false yazilir:
--     siparis ekraninda gorunur (personel getirir) ama mutfak ekranlarina
--     dusmez (Kitchen sorgulari sent_to_kitchen=true filtreler).
--   * Kasada hicbir sey degismez.

alter table public.categories
  add column if not exists show_in_shop boolean not null default false;

comment on column public.categories.show_in_shop is
  'true ise kategori musteri MENUsunde degil SHOP sekmesinde listelenir. Kasada fark etmez.';

update public.categories set show_in_shop = true
where name in ('Azqua Ceramics','Ceren Studio','Deep Drip','Görüşbaz','Jewelery','Jüjü','NIP Merch','Personal Care');
