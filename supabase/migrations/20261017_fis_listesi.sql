-- Fis listesi: kapanmis her hesap tek tek (sahip istegi 17.10).
--
-- Satis Raporu urun adedini anlatir (nip_urun_satis, sinirsiz liste). Bu
-- fonksiyon fisi anlatir: hangi hesap, ne zaman, kim acti, kim tahsil etti,
-- nasil odendi, icinde ne var (kalemler jsonb). Kurallar nip_urun_satis ile
-- ayni: yalniz kapanmis (paid) hesaplar, gun odeme anina gore 03:00'te biter.
-- Aralik en cok 31 gun: bir ay ~900 fis kalemleriyle gelir, yil gelmez.
-- Yetki: aktif personel, yalniz kendi magazasi (invoker; RLS gecerli).
--
-- Hicbir nesne silinmez.

create or replace function public.nip_fis_listesi(p_store_id uuid, p_bas date default null, p_bit date default null)
returns table(id uuid, zaman timestamptz, acilis timestamptz, ad text, masa text, personel text, kasiyer text,
              uye text, toplam numeric, puan numeric, odeme text, kalem_adedi integer, qr boolean, kalemler jsonb)
language plpgsql
stable
set search_path to 'public'
as $function$
declare v_bas date; v_bit date;
begin
  if current_user in ('authenticated', 'anon') then
    if not public.is_staff() then raise exception 'fis listesi: yetkisiz'; end if;
    if not exists (select 1 from public.staff s
                    where s.auth_id = (select auth.uid()) and s.is_active
                      and p_store_id = any(s.store_ids)) then
      raise exception 'fis listesi: bu magaza icin yetkin yok';
    end if;
  end if;
  v_bit := coalesce(p_bit, public.nip_business_day(now()));
  v_bas := coalesce(p_bas, v_bit);
  if v_bit < v_bas then raise exception 'fis listesi: bitis baslangictan once olamaz'; end if;
  if v_bit - v_bas > 31 then raise exception 'fis listesi: en fazla 31 gunluk aralik'; end if;

  return query
  select o.id,
         coalesce(o.paid_at, o.updated_at, o.created_at) as zaman,
         o.created_at as acilis,
         coalesce(t.name, o.customer_name, 'Misafir')::text as ad,
         t.name::text as masa,
         sf.name::text as personel,
         (select sf2.name from public.payments p2 join public.staff sf2 on sf2.id = p2.staff_id
           where p2.order_id = o.id order by p2.created_at desc limit 1)::text as kasiyer,
         c.name::text as uye,
         coalesce(o.total, 0)::numeric as toplam,
         coalesce(o.points_used, 0)::numeric as puan,
         -- "kart ₺640" ya da "nakit ₺300 + kart ₺340"; geri alinan odeme eksi satirla netlenir.
         (select string_agg(x.yontem || ' ₺' || x.tutar, ' + ' order by x.yontem)
            from (select case p3.method::text when 'cash' then 'nakit' when 'card' then 'kart'
                              when 'transfer' then 'havale' when 'debt' then 'borç' else p3.method::text end as yontem,
                         round(sum(p3.amount))::text as tutar
                    from public.payments p3 where p3.order_id = o.id
                   group by p3.method having sum(p3.amount) <> 0) x)::text as odeme,
         (select coalesce(sum(oi.quantity), 0) from public.order_items oi where oi.order_id = o.id)::integer as kalem_adedi,
         exists (select 1 from public.order_items oi where oi.order_id = o.id and oi.added_by is null) as qr,
         (select coalesce(jsonb_agg(jsonb_build_object(
             'ad', coalesce(p.name, oi.product_name) || coalesce(' · ' || nullif(oi.variant_name, ''), ''),
             'adet', oi.quantity,
             'fiyat', oi.final_price,
             'liste', oi.product_price,
             'ikram', coalesce(oi.is_treat, false),
             'indirim', coalesce(oi.manual_discount, 0),
             'not', coalesce(nullif(oi.notes, ''), nullif(oi.note, '')),
             'secenek', oi.selected_options,
             'paket', coalesce(oi.is_takeaway, false),
             'qr', oi.added_by is null) order by oi.created_at), '[]'::jsonb)
            from public.order_items oi
            left join public.products p on p.id = oi.product_id
           where oi.order_id = o.id) as kalemler
    from public.orders o
    left join public.cafe_tables t on t.id = o.table_id
    left join public.staff sf on sf.id = o.staff_id
    left join public.customers c on c.id = o.customer_id
   where o.origin_store_id = p_store_id
     and o.status = 'paid'
     and public.nip_business_day(coalesce(o.paid_at, o.updated_at, o.created_at)) between v_bas and v_bit
   order by 2 desc;
end $function$;

comment on function public.nip_fis_listesi(uuid, date, date) is
  'Satis Raporu "Fisler": kapanmis hesaplar tek tek, kalemler jsonb; en cok 31 gun (20261017_fis_listesi).';

revoke execute on function public.nip_fis_listesi(uuid, date, date) from public, anon;
grant execute on function public.nip_fis_listesi(uuid, date, date) to authenticated;
