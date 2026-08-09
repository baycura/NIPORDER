-- Uyeye ozel SABIT FIYAT (yuzde degil).
--
-- Neden: yuzde indirim kusuratli tutar uretiyor (₺287,50 gibi). Sahip artik
-- urunu secip dogrudan "bu uye icin 250 TL" diyebiliyor. Musteri ustu cizili
-- liste fiyatini ve kendi fiyatini goruyor.
--
-- Kural: musteri her zaman DUSUK olani oder.
--   son fiyat = min(kampanya/happy hour fiyati, uye fiyati)
-- Kampanya uye fiyatindan ucuzsa kampanya gecerli; degilse uye fiyati.

alter table public.member_discounts
  add column if not exists price numeric check (price >= 0);

comment on column public.member_discounts.price is
  'Uyeye ozel SABIT fiyat (TL). Dolu ise gecerli olan budur; kampanya daha ucuzsa kampanya uygulanir.';

comment on column public.member_discounts.amount is
  'ESKI kullanim: liste fiyatindan dusulecek TL. price dolduysa yok sayilir.';

-- amount zorunlu degil artik (yeni kayitlar price ile gelir)
alter table public.member_discounts alter column amount drop not null;
alter table public.member_discounts alter column amount set default 0;

-- Kasadan manuel siparis acarken uyeyi siparise baglayabilmek icin
create index if not exists idx_orders_customer_id on public.orders (customer_id);
