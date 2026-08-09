-- Sadece SAHIP (admin) gorebilsin diye yardimci
create or replace function public.is_admin() returns boolean
language sql security definer stable set search_path to 'public'
as $$ select exists(select 1 from public.staff s where s.auth_id = auth.uid() and s.is_active and s.role::text = 'admin') $$;
revoke execute on function public.is_admin() from anon;

-- Aylik sabit giderler (kira, elektrik, maas...) — YALNIZ admin okur/yazar
create table if not exists public.fixed_expenses (
  id uuid primary key default gen_random_uuid(),
  store_id uuid,
  name text not null,
  category text not null default 'diger',
  amount numeric not null default 0,
  day_of_month integer,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.fixed_expenses enable row level security;
drop policy if exists fixed_expenses_admin_only on public.fixed_expenses;
create policy fixed_expenses_admin_only on public.fixed_expenses
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Bar/kokteyl malzeme paleti (recete girisini kolaylastirir)
insert into public.ingredients (store_id, name, unit, stock_qty, cost_per_unit, is_consumable, unit_volume_ml, pack_qty)
select 'c3c6e0c7-1821-4edd-993d-ad960cfbc452', v.name, v.unit, 0, 0, false, v.vol, 1
from (values
  ('Gin','ml',700),('Votka','ml',700),('Tekila','ml',700),('Beyaz Rom','ml',700),
  ('Viski (bar)','ml',700),('Campari','ml',700),('Aperol','ml',700),
  ('Kırmızı Vermut','ml',1000),('Beyaz Vermut','ml',1000),('Prosecco','ml',750),
  ('Kahve Likörü','ml',700),('Triple Sec','ml',700),('Jägermeister','ml',700),
  ('Limon Suyu','ml',1000),('Lime Suyu','ml',1000),('Şeker Şurubu','ml',1000),
  ('Tonik','ml',200),('Soda (şişe)','ml',200),('Kola','ml',250),
  ('Espresso Shot','ml',30),('Süt','ml',1000),('Krema','ml',200),
  ('Nane','g',0),('Angostura Bitter','ml',200),('Yumurta Akı','ml',30),
  ('Portakal Suyu','ml',1000),('Nar Suyu','ml',1000),('Greyfurt Suyu','ml',1000),
  ('Şeftali Püresi','ml',1000),('Vişne Şurubu','ml',700)
) as v(name, unit, vol)
where not exists (select 1 from public.ingredients i where lower(i.name) = lower(v.name) and i.store_id = 'c3c6e0c7-1821-4edd-993d-ad960cfbc452');

-- Isletmenin standart olcusu (cl) — recete kisayol dugmeleri bunu kullanir
insert into public.app_settings (key, value, store_id)
select 'house_pour_cl', to_jsonb(4), 'c3c6e0c7-1821-4edd-993d-ad960cfbc452'
where not exists (select 1 from public.app_settings where key = 'house_pour_cl');
