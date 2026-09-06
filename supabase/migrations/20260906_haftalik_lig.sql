-- ============================================================================
-- HAFTALIK SATIS LIGI                                    20260906_haftalik_lig
-- ============================================================================
-- ISTEK: "Personel sisteme daha cok urun girsin ve kendi aralarinda tatli
-- bir rekabet olussun diye haftalik satislarini kolay bir yerde gorsun,
-- lig gibi siralama olsun."
--
-- KIME YAZILIR: kalemi kim ekledi. order_items.added_by kasada eklerken
-- dolar; eski kalemlerde ve QR siparislerinde bos — o zaman siparisi kim
-- acti (orders.staff_id). Siparisi baskasi acip urunu sen eklediysen satis
-- senin.
--
-- NE SAYILIR: yalniz odenmis hesaplar (status = paid, paid_at haftada),
-- ikramlar sayilmaz. Hafta Pazartesi 00:00 Istanbul'da baslar.
-- p_hafta_ofset: 0 bu hafta, -1 gecen hafta.
--
-- Herkes gorur (is_staff): ligin anlami bu.
--
-- Geri alma:
--   drop function if exists public.nip_haftalik_lig(uuid, integer);
--   alter table public.order_items drop column added_by;
-- ============================================================================

alter table public.order_items add column if not exists added_by uuid references public.staff(id);
comment on column public.order_items.added_by is
  'Kalemi kasada ekleyen personel (staff.id). Bos ise siparisi acan sayilir.';

create or replace function public.nip_haftalik_lig(p_store_id uuid, p_hafta_ofset integer default 0)
returns table (
  personel_id uuid,
  personel    text,
  siparis     bigint,
  adet        numeric,
  ciro        numeric,
  hafta_basi  date,
  hafta_sonu  date
)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_basi date;
  v_from timestamptz;
  v_to   timestamptz;
begin
  if not public.is_staff() then
    raise exception 'lig: yetkisiz';
  end if;
  v_basi := (date_trunc('week', (now() at time zone 'Europe/Istanbul'))
             + make_interval(weeks => coalesce(p_hafta_ofset, 0)))::date;
  v_from := (v_basi::timestamp) at time zone 'Europe/Istanbul';
  v_to   := ((v_basi + 7)::timestamp) at time zone 'Europe/Istanbul';

  return query
  select s.id, s.name, count(distinct o.id),
         coalesce(sum(oi.quantity), 0)::numeric,
         coalesce(sum(oi.final_price * oi.quantity), 0)::numeric,
         v_basi, (v_basi + 6)
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

revoke all on function public.nip_haftalik_lig(uuid, integer) from anon, authenticated, public;
grant execute on function public.nip_haftalik_lig(uuid, integer) to authenticated;
