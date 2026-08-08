-- Gercek yerlesim: 6 dis masa + on camda uzun masa (4 sandalye) + ortada co-work masasi.
-- Ortak masalar (shared=true): ayni QR, herkes kendi ismiyle siparis verir.
alter table public.cafe_tables add column if not exists shared boolean not null default false;
comment on column public.cafe_tables.shared is 'Ortak masa: ayni QR, musteri ismiyle siparis (co-work / cam kenari)';

update public.cafe_tables set name = 'Dış 1', section = 'Dış', sort_order = 10  where name = 'Bar 1';
update public.cafe_tables set name = 'Dış 2', section = 'Dış', sort_order = 20  where name = 'Bar 2';
update public.cafe_tables set name = 'Dış 3', section = 'Dış', sort_order = 30  where name = 'Masa 1';
update public.cafe_tables set name = 'Dış 4', section = 'Dış', sort_order = 40  where name = 'Masa 2';
update public.cafe_tables set name = 'Dış 5', section = 'Dış', sort_order = 50  where name = 'Masa 3';
update public.cafe_tables set name = 'Dış 6', section = 'Dış', sort_order = 60  where name = 'Teras 1';
update public.cafe_tables set name = 'Cam Kenarı', section = 'Ön Cam', capacity = 4, sort_order = 100, shared = true where name = 'Teras 2';

insert into public.cafe_tables (name, section, capacity, qr_token, is_active, is_walkin, sort_order, store_id, shared)
select 'Co-work', 'Orta', 6, substr(md5(random()::text || clock_timestamp()::text), 1, 24), true, false, 110,
       (select store_id from public.cafe_tables where store_id is not null limit 1), true
where not exists (select 1 from public.cafe_tables where name = 'Co-work');
