-- Menude alt kategoriler.
--
-- Neden: ust menudeki sekme sayisi 10'a cikmisti ve doner tarafinin menusu de
-- eklenecek. Shop'ta markalarin altina grup koydugumuz gibi (shop_group),
-- menude de kategorilerin altina kategori koyuyoruz.
--
-- Yontem: categories.parent_id — mevcut Shot/Highball/Viski/Kokteyl zaten
-- kategori oldugu icin urun tasimadan sadece ust kategoriye baglaniyorlar.
-- Boylece kategoriye bagli her sey (saat penceresi, party menu, staff_only,
-- zamanlama kurallari, recete ekrani) oldugu gibi calismaya devam eder.

alter table categories add column if not exists parent_id uuid references categories(id) on delete set null;
create index if not exists idx_categories_parent on categories(parent_id) where parent_id is not null;

comment on column categories.parent_id is
  'Ust kategori. NULL ise menude sekme olarak gorunur; dolu ise ust kategorinin icinde alt secim olarak.';

do $$
declare
  paris uuid := 'c3c6e0c7-1821-4edd-993d-ad960cfbc452';
  c_sicak uuid := '70f2475e-315b-4241-8dde-35b4705e2d77';
  c_soguk uuid := '619171f4-44b6-4198-8803-8cec78bea370';
  c_alkol uuid := 'e3bbae86-c62e-4a3e-bdbb-11fe3040dedb';
  c_demlik uuid := '875a91e1-fc28-4c95-a83b-ea4b1cabf15b';
  c_kahveler uuid;
  c_sogukkahve uuid;
  c_mesrubat uuid;
  c_bira uuid;
  c_sarap uuid;
begin
  -- 1) SICAK ICECEKLER -> Kahveler + Caylar
  insert into categories (name, name_en, name_ru, icon, sort_order, is_active, store_id, parent_id)
  values ('Kahveler', 'Coffee', 'Кофе', null, 10, true, paris, c_sicak)
  returning id into c_kahveler;

  update products set category_id = c_kahveler
  where category_id = c_sicak
    and name in ('Americano','Espresso','Filtre Kahve','Cappuccino','Latte','Flat White','Cortado','Türk Kahvesi');

  -- Demlik Cay zaten ayri bir kategoriydi: ust menuden alip Sicak Icecekler'in altina aliyoruz
  update categories
     set name = 'Çaylar', name_en = 'Teas', name_ru = 'Чаи',
         description = coalesce(description, 'Demlikte demlenir · 0.4L'),
         description_en = coalesce(description_en, 'Brewed in a pot · 0.4L'),
         description_ru = coalesce(description_ru, 'Заваривается в чайнике · 0.4L'),
         sort_order = 20, parent_id = c_sicak
   where id = c_demlik;

  -- Kakao ve Sahlep ust kategoride kalir; uygulama bunlari "Diger" basligi altinda gosterir.

  -- 2) SOGUK ICECEKLER -> Soguk Kahveler + Mesrubatlar
  insert into categories (name, name_en, name_ru, icon, sort_order, is_active, store_id, parent_id)
  values ('Soğuk Kahveler', 'Iced Coffee', 'Холодный кофе', null, 10, true, paris, c_soguk)
  returning id into c_sogukkahve;

  insert into categories (name, name_en, name_ru, icon, sort_order, is_active, store_id, parent_id)
  values ('Meşrubatlar', 'Soft Drinks', 'Напитки', null, 20, true, paris, c_soguk)
  returning id into c_mesrubat;

  update products set category_id = c_sogukkahve
  where category_id = c_soguk
    and name in ('Ice Bumble','Espresso Tonic','Ice Latte 0.3L','Ice Americano 0.3L','Cold Brew');

  update products set category_id = c_mesrubat where category_id = c_soguk;

  -- 3) ALKOL -> Bira, Highball, Kokteyl, Viski, Shot, Saraplar
  insert into categories (name, name_en, name_ru, icon, sort_order, is_active, store_id, parent_id)
  values ('Bira', 'Beer', 'Пиво', null, 10, true, paris, c_alkol)
  returning id into c_bira;

  insert into categories (name, name_en, name_ru, icon, sort_order, is_active, store_id, parent_id)
  values ('Şaraplar', 'Wines', 'Вина', null, 60, true, paris, c_alkol)
  returning id into c_sarap;

  update products set category_id = c_sarap
  where category_id = c_alkol and name ilike '%Şarap%';

  update products set category_id = c_bira where category_id = c_alkol;

  update categories set parent_id = c_alkol, sort_order = 20 where id = 'c2816baa-239d-40c0-bee6-427386c88e7c'; -- Highball
  update categories set parent_id = c_alkol, sort_order = 30 where id = '718b29ce-468e-472f-a486-11da502a3006'; -- Kokteyl
  update categories set parent_id = c_alkol, sort_order = 40 where id = 'db1a4170-0cc9-4e6e-a992-0e7715ab368a'; -- Viski
  update categories set parent_id = c_alkol, sort_order = 50 where id = '7e64c34d-4caa-4f66-97fe-bd3cdd274f31'; -- Shot
end $$;
