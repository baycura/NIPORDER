-- IKRAM: kalem bazli "hesaptan dus, izini birak".
--
-- Sahip iki beyaz sarabi ikram etti; sistemde bunun yeri yoktu — ya kalem
-- silinir (mutfak/stok izi kaybolur, ne ikram edildigi gorunmez) ya da
-- musteriden para istenirdi. is_treat isaretli kalemin final_price'i 0
-- yazilir ama product_price (gercek degeri) durur: raporda ikramin maliyeti
-- gorunur, mutfak konsinye urunse mutfaga yine product_price uzerinden
-- borclanilir (ikrami mutfak degil biz yapiyoruz).
alter table public.order_items add column if not exists is_treat boolean not null default false;
alter table public.order_items add column if not exists treated_by uuid references public.staff(id);
comment on column public.order_items.is_treat is 'Ikram: kalem hesaba 0 yazilir, urun/stok/maliyet izi durur.';
comment on column public.order_items.treated_by is 'Ikrami veren personel — kim ikram etmis gorunsun.';
