-- Bugun ekranina "Musteri aliskanligi" karti (musteri onerisi 5, sahip onayi 13.10).
--
-- Hafta hafta (pazartesi baslar, isletme gunu 03:00'te doner):
--   hesap       odenmis hesap sayisi
--   qr_hesap    en az bir kalemi musterinin QR'dan girdigi hesap (added_by bos)
--   uye_hesap   personel disi bir uyeye bagli hesap
--   yeni_uye    o hafta acilan personel disi uye
--   geri_gelen  o hafta hesap acan ve daha once de gelmis personel disi uye
--
-- Isim donmez; yalniz sayi. Yonetici ve sahip cagirir (Bugun ekrani managerOnly).
-- Personel uye hesabi: customers.auth_user_id = staff.auth_id ya da ayni e-posta.
--
-- Hicbir nesne silinmez.

create or replace function public.nip_aliskanlik_ozet(p_hafta integer default 6)
returns table(hafta_bas date, hesap integer, qr_hesap integer, uye_hesap integer,
              yeni_uye integer, geri_gelen integer)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_staff record;
  v_bas   date;
begin
  -- SECURITY DEFINER icinde current_user sahibin rolu olur; kontrol auth.uid()
  -- uzerinden yapilir. Oturumsuz cagri (sunucu, cron) tum magazalari gorur.
  select s.id, s.role::text as role, s.store_ids into v_staff
    from public.staff s where s.auth_id = (select auth.uid()) and s.is_active;
  if (select auth.uid()) is not null
     and (v_staff.id is null or v_staff.role not in ('admin', 'manager', 'owner')) then
    raise exception 'aliskanlik: yalniz yonetici';
  end if;

  v_bas := date_trunc('week', public.nip_business_day(now()))::date
           - 7 * (greatest(1, least(coalesce(p_hafta, 6), 26)) - 1);

  return query
  with personel_uye as (
    select c.id from public.customers c
     where exists (select 1 from public.staff s
                    where (c.auth_user_id is not null and s.auth_id = c.auth_user_id)
                       or (c.email is not null and s.email is not null
                           and lower(btrim(c.email)) = lower(btrim(s.email))))
  ),
  hesaplar as (
    select o.id, o.customer_id,
           date_trunc('week', public.nip_business_day(coalesce(o.paid_at, o.created_at)))::date as hafta,
           exists (select 1 from public.order_items oi
                    where oi.order_id = o.id and oi.added_by is null) as qr,
           (o.customer_id is not null
            and o.customer_id not in (select id from personel_uye)) as uye
      from public.orders o
     where o.status::text = 'paid'
       and coalesce(o.paid_at, o.created_at) >= (v_bas + time '03:00') at time zone 'Europe/Istanbul'
       and (v_staff.id is null or o.origin_store_id = any(v_staff.store_ids))
  ),
  haftalar as (
    select generate_series(v_bas, date_trunc('week', public.nip_business_day(now()))::date,
                           interval '7 days')::date as hafta
  )
  select h.hafta,
         (select count(*) from hesaplar x where x.hafta = h.hafta)::integer,
         (select count(*) from hesaplar x where x.hafta = h.hafta and x.qr)::integer,
         (select count(*) from hesaplar x where x.hafta = h.hafta and x.uye)::integer,
         (select count(*) from public.customers c
           where date_trunc('week', public.nip_business_day(c.created_at))::date = h.hafta
             and c.id not in (select id from personel_uye))::integer,
         (select count(distinct x.customer_id) from hesaplar x
           where x.hafta = h.hafta and x.uye
             and exists (select 1 from public.orders o2
                          where o2.customer_id = x.customer_id and o2.status::text = 'paid'
                            and public.nip_business_day(coalesce(o2.paid_at, o2.created_at)) < h.hafta))::integer
    from haftalar h
   order by h.hafta;
end $function$;

comment on function public.nip_aliskanlik_ozet(integer) is
  'Bugun ekrani "Musteri aliskanligi": haftalik hesap, QR, uye, yeni uye, geri gelen '
  'uye sayilari; isim donmez (20261013_aliskanlik_ozet).';

revoke execute on function public.nip_aliskanlik_ozet(integer) from public, anon;
grant execute on function public.nip_aliskanlik_ozet(integer) to authenticated;
