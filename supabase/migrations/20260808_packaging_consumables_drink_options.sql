-- Hammadde: ambalaj (koli/sise/fici) + fire + sarf malzeme
alter table public.ingredients add column if not exists pack_qty integer not null default 1;
alter table public.ingredients add column if not exists unit_volume_ml numeric;
alter table public.ingredients add column if not exists waste_per_pack numeric not null default 0;
alter table public.ingredients add column if not exists is_consumable boolean not null default false;

-- Sarf malzemeler (recetelerde tek dokunusla eklenir)
insert into public.ingredients (store_id, name, unit, stock_qty, cost_per_unit, is_consumable)
select 'c3c6e0c7-1821-4edd-993d-ad960cfbc452', v.name, v.unit, 0, v.cost, true
from (values ('Buz','g',0.02),('Pet Bardak','adet',2.50),('Karton Bardak','adet',3.50),
             ('Pipet','adet',0.50),('Peçete','adet',0.25),('Limon','adet',8.00),('Karıştırıcı','adet',0.40)
) as v(name, unit, cost)
where not exists (select 1 from public.ingredients i where i.name = v.name and i.store_id = 'c3c6e0c7-1821-4edd-993d-ad960cfbc452');

-- Kategori adlari TR/EN/RU tutarli
update public.categories set name='Sıcak İçecekler', name_en='Hot Drinks', name_ru='Горячие напитки' where name='Hot Drinks';
update public.categories set name='Soğuk İçecekler', name_en='Cold Drinks', name_ru='Холодные напитки' where name='Cold Drinks';
update public.categories set name='Demlik Çay', name_en='Tea Pots', name_ru='Чайники' where name='Tea Pots';
update public.categories set name='Ev Yapımı Fırın', name_en='Homemade Bakery', name_ru='Домашняя выпечка' where name='Homemade Bakery';
update public.categories set name='Alkol', name_en='Alcohol', name_ru='Алкоголь' where name='Alkol';
update public.categories set name='Shot', name_en='Shots', name_ru='Шоты' where name='Shots';
update public.categories set name='Highball', name_en='Highballs', name_ru='Хайболы' where name='Highballs';
update public.categories set name='Viski', name_en='Whiskey', name_ru='Виски' where name='Whiskey';
update public.categories set name='Kokteyl', name_en='Cocktails', name_ru='Коктейли' where name='Cocktails';

-- Highball + Beluga: mixer + limon secenekleri
update public.products set has_options = true, options_config = '{"groups":[
    {"name":"Mixer","options":["Soda","Tonic"],"required":true,"price_modifiers":{"Soda":0,"Tonic":0}},
    {"name":"Lemon","options":["Lemon juice","Lemon slice","No lemon"],"required":true,"price_modifiers":{"Lemon juice":0,"Lemon slice":0,"No lemon":0}}
  ]}'::jsonb
where name in ('Beefeater','Malfy','Hendricks','Monkey 47','Beluga');
