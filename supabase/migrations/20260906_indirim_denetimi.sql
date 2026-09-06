-- ============================================================================
-- INDIRIM DENETIMI — KIM NE KADAR INDIRIM YAPTI (YALNIZ SAHIP)
--                                              20260906_indirim_denetimi
-- ============================================================================
-- ISTEK: "Kimin ne kadar indirim yaptigini tut ama data olarak onu sadece
-- ben gorebileyim."
--
-- TASARIM
-- Kim verdi bilgisi kalemden (order_items) CIKIYOR: order_items'i her
-- personel okur; discount_by orada dursa kasadaki herkes gorurdu. Yerine
-- ayri bir denetim tablosu: discount_audit. Satirlari kasa DEGIL, order_items
-- uzerindeki tetik yazar (SECURITY DEFINER) — istemci atlayamaz, kimligi
-- auth.uid()'den alir. Okuma yalniz is_admin() (sahipler). Insert/update/
-- delete politikasi yok: tabloya yalniz tetik yazar.
--
-- Rapor (nip_indirim_raporu): guncel kalemlerden (manual_discount x adet)
-- hesaplanir, her kalem son indirimi veren personele yazilir. Adet sonradan
-- degisse de tutar dogru kalir; denetim satirlari ise degisikligin izi.
--
-- Geri alma:
--   drop function if exists public.nip_indirim_raporu(timestamptz, timestamptz);
--   drop trigger if exists trg_indirim_denetim on public.order_items;
--   drop function if exists public.fn_indirim_denetim();
--   drop table if exists public.discount_audit;
--   (discount_by sutunu geri gelmez; 20260905_kasa_kalem_indirimi'ne bak)
-- ============================================================================

create table if not exists public.discount_audit (
  id             bigint generated always as identity primary key,
  store_id       uuid,
  order_id       uuid not null,
  order_item_id  uuid,                 -- kalem silinebilir; FK yok, iz kalsin
  product_name   text not null,
  quantity       integer not null default 1,
  old_discount   numeric(10,2) not null default 0,
  new_discount   numeric(10,2) not null default 0,
  note           text,
  staff_id       uuid references public.staff(id),
  staff_name     text,
  created_at     timestamptz not null default now()
);

create index if not exists discount_audit_kalem on public.discount_audit(order_item_id);
create index if not exists discount_audit_tarih on public.discount_audit(created_at desc);

comment on table public.discount_audit is
  'Kasa kalem indiriminin izi: kim, ne zaman, hangi kalemde, kactan kaca. '
  'Yalniz tetik yazar, yalniz sahip (is_admin) okur.';

alter table public.discount_audit enable row level security;
drop policy if exists discount_audit_sahip_okur on public.discount_audit;
create policy discount_audit_sahip_okur on public.discount_audit
  for select to authenticated using (public.is_admin());
revoke all on public.discount_audit from anon, authenticated;
grant select on public.discount_audit to authenticated;

-- ----------------------------------------------------------------------------
-- Tetik: indirim degisince iz birak. Kimlik auth.uid() -> staff.
-- ----------------------------------------------------------------------------
create or replace function public.fn_indirim_denetim()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_staff record;
  v_old   numeric := 0;
begin
  if tg_op = 'UPDATE' then
    v_old := coalesce(old.manual_discount, 0);
  end if;
  -- Degisen bir sey yoksa iz yok. INSERT'te indirim 0 ise (her normal ekleme)
  -- da yok.
  if coalesce(new.manual_discount, 0) = v_old
     and (tg_op = 'INSERT' or coalesce(new.discount_note, '') = coalesce(old.discount_note, '')) then
    return null;
  end if;

  select s.id, s.name into v_staff
    from public.staff s
   where s.auth_id = (select auth.uid()) and s.is_active
   limit 1;

  insert into public.discount_audit(store_id, order_id, order_item_id, product_name, quantity,
                                    old_discount, new_discount, note, staff_id, staff_name)
  values (new.store_id, new.order_id, new.id, new.product_name, coalesce(new.quantity, 1),
          v_old, coalesce(new.manual_discount, 0), new.discount_note, v_staff.id, v_staff.name);
  return null;
end $$;

revoke execute on function public.fn_indirim_denetim() from anon, authenticated, public;

drop trigger if exists trg_indirim_denetim on public.order_items;
create trigger trg_indirim_denetim
  after insert or update of manual_discount, discount_note on public.order_items
  for each row execute function public.fn_indirim_denetim();

-- Kim verdi artik kalemde durmuyor.
alter table public.order_items drop column if exists discount_by;

-- ----------------------------------------------------------------------------
-- Rapor: yalniz sahip. Cikti sutun adlari tablo sutunlariyla cakismasin diye
-- Turkce (plpgsql belirsizligi).
-- ----------------------------------------------------------------------------
create or replace function public.nip_indirim_raporu(p_from timestamptz, p_to timestamptz)
returns table (
  kalem_id    uuid,
  siparis_id  uuid,
  tarih       timestamptz,
  personel_id uuid,
  personel    text,
  urun        text,
  adet        integer,
  indirim     numeric,
  tutar       numeric,
  neden       text,
  durum       text
)
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_admin() then
    raise exception 'indirim raporu: yalniz sahip gorebilir';
  end if;
  return query
  select oi.id, oi.order_id, coalesce(a.created_at, oi.created_at), a.staff_id,
         coalesce(a.staff_name, '—'), oi.product_name, oi.quantity,
         oi.manual_discount, (oi.manual_discount * oi.quantity)::numeric,
         oi.discount_note, o.status::text
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    left join lateral (
      select d.staff_id, d.staff_name, d.created_at
        from public.discount_audit d
       where d.order_item_id = oi.id and d.new_discount > 0
       order by d.created_at desc limit 1
    ) a on true
   where oi.manual_discount > 0
     and oi.created_at >= p_from and oi.created_at < p_to
     and o.status::text <> 'cancelled'
   order by 3 desc;
end $$;

revoke all on function public.nip_indirim_raporu(timestamptz, timestamptz) from anon, authenticated, public;
grant execute on function public.nip_indirim_raporu(timestamptz, timestamptz) to authenticated;
