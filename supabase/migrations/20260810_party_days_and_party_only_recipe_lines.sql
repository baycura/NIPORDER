-- Parti gecesi mantigi + sadece parti gecesi tuketilen recete satirlari (PET bardak).
--
-- Ihtiyac: fici bira carsamba/cuma/cumartesi 22:00'den sonra PET bardakta servis
-- ediliyor. PET bardak bir maliyet ama sadece o gecelerde. Recete statik oldugu
-- icin satira "party_only" bayragi ekliyoruz; stok dususu yapan trigger, satis
-- aninda parti penceresinde miyiz diye bakip o satirlari uygular ya da atlar.

-- 1) Recete satirina bayrak
alter table public.recipes
  add column if not exists party_only boolean not null default false;

comment on column public.recipes.party_only is
  'true ise bu satir yalnizca parti penceresinde (bkz. fn_is_party_now) stoktan duser — orn. PET bardak.';

-- 2) Parti gunleri ayari (ISO gun: Pzt=1 ... Paz=7). Varsayilan: Car/Cum/Cmt.
insert into public.app_settings (key, value, store_id)
select 'party_days', '[3,5,6]'::jsonb, s.id
from public.stores s
on conflict (key, store_id) do nothing;

-- 3) Su an parti penceresinde miyiz?
--    Pencere gece yarisini asar (22:00 -> 04:00). "Parti gunu" pencerenin
--    BASLADIGI gundur: Cumartesi 02:00 aslinda Cuma partisidir.
create or replace function public.fn_is_party_now(p_store_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_from time;
  v_until time;
  v_days jsonb;
  v_now timestamptz := now();
  v_local timestamp;
  v_time time;
  v_party_date date;
begin
  select (value #>> '{}')::time into v_from
    from app_settings where key = 'party_mode_from' and store_id = p_store_id;
  select (value #>> '{}')::time into v_until
    from app_settings where key = 'party_mode_until' and store_id = p_store_id;
  select value into v_days
    from app_settings where key = 'party_days' and store_id = p_store_id;

  if v_from is null or v_until is null then return false; end if;
  if v_days is null or jsonb_typeof(v_days) <> 'array' or jsonb_array_length(v_days) = 0 then
    return false;
  end if;

  v_local := v_now at time zone 'Europe/Istanbul';
  v_time  := v_local::time;

  if v_from <= v_until then
    -- Ayni gun icinde kalan pencere (orn. 14:00 -> 18:00)
    if v_time >= v_from and v_time < v_until then
      v_party_date := v_local::date;
    else
      return false;
    end if;
  else
    -- Gece yarisini asan pencere (orn. 22:00 -> 04:00)
    if v_time >= v_from then
      v_party_date := v_local::date;              -- gece baslangici: bugun
    elsif v_time < v_until then
      v_party_date := (v_local - interval '1 day')::date;  -- sabaha karsi: dunku parti
    else
      return false;
    end if;
  end if;

  return v_days @> to_jsonb(extract(isodow from v_party_date)::int);
end $$;

comment on function public.fn_is_party_now(uuid) is
  'Verilen magaza icin su an parti penceresinde miyiz (gun + saat, Europe/Istanbul).';

-- 4) Stok dususu: party_only satirlari yalnizca parti penceresinde uygula
create or replace function public.fn_decrement_stock_from_recipe()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  rec RECORD;
  effective_qty NUMERIC;
  v_party boolean;
begin
  if NEW.kitchen_status = 'preparing' and (OLD.kitchen_status is null or OLD.kitchen_status <> 'preparing') then
    -- Parti kontrolu satir basina degil, kalem basina bir kez
    v_party := public.fn_is_party_now(NEW.store_id);

    for rec in
      select r.ingredient_id, r.qty_per_unit, r.party_only, coalesce(i.waste_pct, 0) as waste_pct
      from recipes r join ingredients i on i.id = r.ingredient_id
      where r.product_id = NEW.product_id
    loop
      -- Sadece parti gecesi tuketilen malzeme (PET bardak) parti disinda atlanir
      continue when rec.party_only and not coalesce(v_party, false);

      effective_qty := rec.qty_per_unit * NEW.quantity * (1 + rec.waste_pct / 100.0);
      update ingredients set stock_qty = stock_qty - effective_qty where id = rec.ingredient_id;
    end loop;
  end if;
  return NEW;
end $$;
