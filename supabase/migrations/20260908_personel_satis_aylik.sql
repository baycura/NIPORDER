-- ============================================================================
-- PERSONEL SATISI: HAFTALIK + AYLIK                  20260908_personel_satis_aylik
-- ============================================================================
-- Sahip: "En cok satis yapan personelin haftalik ve aylik istatistikleri
-- nerede?" Haftalik vardi (nip_haftalik_lig), aylik yoktu. Tek fonksiyon:
-- donem 'hafta' ya da 'ay', ofset 0 bu / -1 gecen. Kurallar ayni: kalemi
-- kim ekledi (added_by), yoksa siparisi kim acti; yalniz odenmis hesaplar;
-- ikram sayilmaz; sinirlar Istanbul saatiyle.
-- nip_haftalik_lig duruyor (eski istemci), ayni mantigi bu fonksiyona verir.
--
-- Geri alma: drop function public.nip_personel_satis(uuid, text, integer);
-- ============================================================================

create or replace function public.nip_personel_satis(p_store_id uuid, p_donem text default 'hafta', p_ofset integer default 0)
returns table (
  personel_id uuid,
  personel    text,
  siparis     bigint,
  adet        numeric,
  ciro        numeric,
  baslangic   date,
  bitis       date
)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_basi date;
  v_sonu date;   -- haric
  v_from timestamptz;
  v_to   timestamptz;
begin
  if not public.is_staff() then
    raise exception 'personel satis: yetkisiz';
  end if;
  if p_donem = 'ay' then
    v_basi := (date_trunc('month', (now() at time zone 'Europe/Istanbul'))
               + make_interval(months => coalesce(p_ofset, 0)))::date;
    v_sonu := (v_basi + interval '1 month')::date;
  else
    v_basi := (date_trunc('week', (now() at time zone 'Europe/Istanbul'))
               + make_interval(weeks => coalesce(p_ofset, 0)))::date;
    v_sonu := v_basi + 7;
  end if;
  v_from := (v_basi::timestamp) at time zone 'Europe/Istanbul';
  v_to   := (v_sonu::timestamp) at time zone 'Europe/Istanbul';

  return query
  select s.id, s.name, count(distinct o.id),
         coalesce(sum(oi.quantity), 0)::numeric,
         coalesce(sum(oi.final_price * oi.quantity), 0)::numeric,
         v_basi, (v_sonu - 1)
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    join public.staff  s on s.id = coalesce(oi.added_by, o.staff_id)
   where o.status::text = 'paid'
     and o.paid_at >= v_from and o.paid_at < v_to
     and o.origin_store_id = p_store_id
     and coalesce(oi.is_treat, false) = false
   group by s.id, s.name
   order by 5 desc, 4 desc, 2;
end $$;

revoke all on function public.nip_personel_satis(uuid, text, integer) from anon, authenticated, public;
grant execute on function public.nip_personel_satis(uuid, text, integer) to authenticated;
