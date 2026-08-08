-- Satis urunleri (tisort, seramik, gozluk...): musteri menusunde gizli,
-- kasadan hesaba eklenebilir. Kategorilere staff_only bayragi + urunlere marka alani.
alter table public.categories add column if not exists staff_only boolean not null default false;
comment on column public.categories.staff_only is 'true: musteri QR menusunde gizli, yalniz personel siparis ekraninda gorunur';
alter table public.products add column if not exists brand text;
comment on column public.products.brand is 'Marka (ozellikle magaza/perakende urunleri icin)';

-- Merch kategorisini magaza kategorisine cevir
update public.categories set name = 'Mağaza', name_en = 'Shop', name_ru = 'Магазин', staff_only = true
where name = 'Merch';

-- Ornek satis urunleri (fiyat 0 = kasada tutar sorulur; duzenlenebilir/silinebilir)
insert into public.products (store_id, category_id, name, name_en, price, is_available, sort_order, kitchen_destination_store_id, has_options)
select c.store_id, c.id, v.name, v.name_en, 0, true, v.so, c.store_id, false
from public.categories c,
(values
  ('Tişört', 'T-Shirt', 10),
  ('Seramik', 'Ceramic', 20),
  ('Gözlük', 'Sunglasses', 30),
  ('Kozmetik', 'Cosmetics', 40),
  ('Bisiklet Aksesuarı', 'Bike Accessory', 50)
) as v(name, name_en, so)
where c.name = 'Mağaza' and c.staff_only
  and not exists (select 1 from public.products p where p.category_id = c.id and p.name = v.name);
