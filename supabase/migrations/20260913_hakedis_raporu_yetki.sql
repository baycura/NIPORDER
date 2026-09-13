-- ============================================================================
-- HAKEDIS RAPORU YETKISI: yonetici, sahip ve izleyici de okusun
--                                              20260913_hakedis_raporu_yetki
-- ============================================================================
-- /settlement rotasi "viewer" (izleyici) ve yonetici rollerine acik; ama
-- nip_mutfak_hakedis_raporu yalniz is_admin() ile mutfak ortaklarina izin
-- veriyordu. Izleyici sayfayi acinca 42501 alirdi. Kapi: aktif personel
-- satiri olan admin/owner/manager/viewer VEYA mutfak ortagi (nip_mutfak_ortaklar).
-- Garson/kasiyer/mutfak rolleri hakedisi gormez (ekranda da yok).
-- Yalniz kapi degisti; rapor govdesi 20260913_doner_mutfak_koprusu ile ayni.
-- ============================================================================

create or replace function public.nip_mutfak_hakedis_yetkili()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or exists (select 1 from public.staff s
                  where s.auth_id = auth.uid() and coalesce(s.is_active, true)
                    and s.role in ('admin', 'owner', 'manager', 'viewer'))
      or exists (select 1 from public.nip_mutfak_ortaklar m where m.auth_id = auth.uid());
$$;
revoke all on function public.nip_mutfak_hakedis_yetkili() from anon, public;
grant execute on function public.nip_mutfak_hakedis_yetkili() to authenticated;

create or replace function public.nip_mutfak_hakedis_raporu(p_ay date default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_ay date := date_trunc('month', coalesce(p_ay, (now() at time zone 'Europe/Istanbul')::date))::date;
  v_from timestamptz; v_to timestamptz;
  v_nip uuid := 'c3c6e0c7-1821-4edd-993d-ad960cfbc452';
  v_cfg jsonb; v_kitchen uuid;
  v_out jsonb;
begin
  if not public.nip_mutfak_hakedis_yetkili() then
    raise exception 'hakedis raporu: yetkisiz' using errcode = '42501';
  end if;
  v_cfg := public.nip_mutfak_cfg(v_nip);
  v_kitchen := coalesce((v_cfg ->> 'kitchen_store_id')::uuid, 'c39da530-7f73-4f69-a752-029bf03790b1');
  -- settlement gorunumu ay sinirini UTC created_at ile ceker; ayni sinir
  v_from := v_ay::timestamp;  v_to := (v_ay + interval '1 month')::timestamp;

  with kalem as (
    select o.id as order_id, o.created_at, o.paid_at, o.status::text as durum, ct.name as masa,
           oi.product_name, public.nip_mutfak_ad(oi) as ad, coalesce(oi.quantity, 1) as adet,
           coalesce(oi.is_treat, false) as ikram,
           coalesce(oi.quantity, 1) * (case when coalesce(oi.is_treat, false) then coalesce(oi.product_price, 0) else coalesce(oi.final_price, oi.product_price, 0) end) as tutar
      from public.orders o
      join public.order_items oi on oi.order_id = o.id
      left join public.cafe_tables ct on ct.id = o.table_id
     where o.origin_store_id = v_nip and oi.kitchen_destination_store_id = v_kitchen
       and o.created_at >= v_from and o.created_at < v_to
  ),
  odenen as (select * from kalem where durum = 'paid'),
  acik as (select * from kalem where durum in ('open', 'sent', 'preparing', 'ready', 'debt'))
  select jsonb_build_object(
    'ay', to_char(v_ay, 'YYYY-MM'),
    'odenecek', jsonb_build_object(
        'tutar', coalesce((select sum(tutar) from odenen), 0),
        'siparis', (select count(distinct order_id) from odenen),
        'kalem', coalesce((select sum(adet) from odenen), 0)),
    'acik_tutar', coalesce((select sum(tutar) from acik), 0),
    'acik_siparis', (select count(distinct order_id) from acik),
    'iptal_kalem', (select count(*) from kalem where durum = 'cancelled'),
    'urunler', coalesce((select jsonb_agg(jsonb_build_object('ad', ad, 'adet', adet, 'tutar', tutar) order by tutar desc)
                         from (select ad, sum(adet) adet, sum(tutar) tutar from odenen group by ad) u), '[]'::jsonb),
    'gunler', coalesce((select jsonb_agg(jsonb_build_object('gun', gun, 'adet', adet, 'tutar', tutar) order by gun)
                        from (select (created_at at time zone 'Europe/Istanbul')::date as gun, sum(adet) adet, sum(tutar) tutar from odenen group by 1) g), '[]'::jsonb),
    'siparisler', coalesce((select jsonb_agg(jsonb_build_object(
                              'siparis', order_id, 'zaman', to_char(created_at at time zone 'Europe/Istanbul', 'DD.MM HH24:MI'),
                              'masa', masa, 'tutar', tutar, 'ikram', ikram,
                              'kalemler', kalemler) order by created_at desc)
                            from (select order_id, min(created_at) created_at, min(masa) masa, sum(tutar) tutar, bool_or(ikram) ikram,
                                         string_agg(adet || '× ' || ad || case when ikram then ' (ikram)' else '' end, ', ' order by ad) kalemler
                                    from odenen group by order_id) s), '[]'::jsonb),
    'kartlar', jsonb_build_object(
        'acilan', (select count(*) from public.nip_kitchen_cards nc where nc.created_at >= v_from and nc.created_at < v_to),
        'ort_hazirlik_dk', (select round(avg(extract(epoch from (nc.done_at - nc.created_at)) / 60))
                              from public.nip_kitchen_cards nc where nc.done_at is not null and nc.cancelled_at is null and nc.created_at >= v_from and nc.created_at < v_to))
  ) into v_out;
  return v_out;
end $$;

-- Geri alma: 20260913_doner_mutfak_koprusu.sql icindeki nip_mutfak_hakedis_raporu
-- tanimini yeniden calistir; drop function public.nip_mutfak_hakedis_yetkili();
