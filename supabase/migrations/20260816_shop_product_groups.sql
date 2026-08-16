-- Shop sekmesinde marka kutusu icinde ALT GRUP: "Tisortler", "Sapkalar",
-- "Takilar" gibi. Musteri once gruplari gorur, birine dokununca o grubun
-- urunleri acilir. Grup adi Turkce (kanonik) yazilir; EN/RU gosterimi
-- uygulamadaki sozlukten gelir (GROUP_I18N), sozlukte yoksa Turkcesi gorunur.
-- Markanin hicbir urununde grup yoksa urunler eskisi gibi dogrudan listelenir.

alter table public.products add column if not exists shop_group text;

comment on column public.products.shop_group is
  'Shop marka kutusundaki alt grup adi (Turkce). Bos ise urun "Diger" altinda cikar.';

create index if not exists products_shop_group_idx
  on public.products (category_id, shop_group) where shop_group is not null;
