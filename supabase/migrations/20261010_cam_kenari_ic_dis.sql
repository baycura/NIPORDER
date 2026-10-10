-- ============================================================================
-- CAM KENARI: IC + DIS                         20261010_cam_kenari_ic_dis
-- ============================================================================
-- Gercekte iki cam kenari var (iceride / disarida). Eski tek "Cam Kenarı"
-- satiri disariyi temsil ediyordu (Teras 2 -> Cam Kenarı). Onu yeniden
-- adlandirip icerideki icin ayri ortak masa (shared QR) ekliyoruz.
--
-- Geri alma:
--   delete from public.cafe_tables where name = 'Cam Kenarı İç';
--   update public.cafe_tables set name = 'Cam Kenarı', section = 'Ön Cam'
--     where name = 'Cam Kenarı Dış';
-- ============================================================================

update public.cafe_tables
   set name = 'Cam Kenarı Dış',
       section = 'Cam Kenarı',
       shared = true
 where name = 'Cam Kenarı';

-- Eski dosya bir kez uygulanmis, sonra elle "Cam Kenarı Dış" yazilmissa
-- tekrar calistirmak zararsiz.
update public.cafe_tables
   set section = 'Cam Kenarı',
       shared = true
 where name = 'Cam Kenarı Dış';

insert into public.cafe_tables (
  name, section, capacity, qr_token, is_active, is_walkin, sort_order, store_id, shared
)
select
  'Cam Kenarı İç',
  'Cam Kenarı',
  4,
  substr(md5(random()::text || clock_timestamp()::text), 1, 24),
  true,
  false,
  95,
  (select store_id from public.cafe_tables where store_id is not null limit 1),
  true
where not exists (
  select 1 from public.cafe_tables where name = 'Cam Kenarı İç'
);
