-- ============================================================
-- NIP Ride — Camps & Rent-from-Local backend (Supabase / Postgres)
-- Apply after schema.sql, in the Supabase SQL editor.
-- ============================================================

-- ------------------------------------------------------------
-- 1) CAMPS  (organized trips, e.g. "Gates of Sahara")
--    Camp content is admin-managed (no client write policies);
--    members can only apply.
-- ------------------------------------------------------------
create table if not exists public.camps (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  slug        text unique,
  location    text,                 -- "Fas / Morocco"
  start_date  date not null,
  end_date    date,
  summary     text,                 -- short teaser
  description text,                 -- full text
  capacity    int  not null default 12 check (capacity between 1 and 200),
  price       numeric,
  currency    text default 'EUR',
  cover_emoji text,                 -- lightweight visual placeholder
  status      text not null default 'open' check (status in ('open','closed','full')),
  created_at  timestamptz not null default now()
);
create index if not exists camps_start_idx on public.camps (start_date);

create table if not exists public.camp_applications (
  id         uuid primary key default gen_random_uuid(),
  camp_id    uuid not null references public.camps (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  full_name  text not null,
  phone      text,
  experience text,                  -- rider level / background
  notes      text,                  -- free text
  status     text not null default 'pending'
             check (status in ('pending','accepted','waitlist','rejected','cancelled')),
  created_at timestamptz not null default now(),
  unique (camp_id, user_id)
);
create index if not exists camp_apps_camp_idx on public.camp_applications (camp_id);

-- Public board: accepted seat counts, no applicant leak
create or replace view public.camp_board as
select c.*,
  coalesce(a.accepted, 0)                            as accepted_count,
  greatest(c.capacity - coalesce(a.accepted, 0), 0)  as spots_open
from public.camps c
left join (
  select camp_id, count(*) filter (where status = 'accepted') as accepted
  from public.camp_applications group by camp_id
) a on a.camp_id = c.id;
grant select on public.camp_board to anon, authenticated;

alter table public.camps             enable row level security;
alter table public.camp_applications enable row level security;

drop policy if exists camps_read on public.camps;
create policy camps_read on public.camps for select using (true);
-- No insert/update/delete policies => camps are managed via dashboard/service role.

drop policy if exists camp_apps_read   on public.camp_applications;
drop policy if exists camp_apps_insert on public.camp_applications;
drop policy if exists camp_apps_update on public.camp_applications;
drop policy if exists camp_apps_delete on public.camp_applications;
create policy camp_apps_read   on public.camp_applications for select using (auth.uid() = user_id);
create policy camp_apps_insert on public.camp_applications for insert with check (auth.uid() = user_id);
create policy camp_apps_update on public.camp_applications for update using (auth.uid() = user_id);
create policy camp_apps_delete on public.camp_applications for delete using (auth.uid() = user_id);

-- ------------------------------------------------------------
-- 2) RENT FROM LOCAL  (member-listed bikes, no images)
--    Non-members see specs only; PHONE + PRICE are member-gated.
--    Mechanism: base table is readable ONLY by authenticated
--    members (so anon can't read phone/price). A public VIEW
--    (definer) exposes specs WITHOUT phone/price to everyone.
-- ------------------------------------------------------------
create table if not exists public.bike_rentals (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references auth.users (id) on delete cascade,
  brand_model    text not null,        -- "Canyon Ultimate CF SL 8"
  bike_type      text,                 -- yol / gravel / mtb / tt
  frame_material text,                 -- karbon / alüminyum / çelik / titanyum
  frame_size     text,                 -- "54" / "M"
  groupset       text,                 -- "Shimano 105 Di2"
  gearing        text,                 -- dişli oranları, "50/34 · 11-34"
  tire_size      text,                 -- "700x28c"
  brake_type     text,                 -- disk / kaliper
  location       text,                 -- semt / şehir
  price          numeric,              -- GATED
  price_period   text default 'day' check (price_period in ('day','week')),
  currency       text default 'EUR',
  phone          text,                 -- GATED
  notes          text,
  status         text not null default 'available'
                 check (status in ('available','rented','hidden')),
  created_at     timestamptz not null default now()
);
create index if not exists bike_rentals_status_idx on public.bike_rentals (status);

-- Public view: specs only — NO price, NO phone. Runs as definer so it
-- bypasses the base-table RLS and is readable by anon.
create or replace view public.bike_rentals_public as
select id, owner_id, brand_model, bike_type, frame_material, frame_size,
       groupset, gearing, tire_size, brake_type, location, notes, status, created_at
from public.bike_rentals
where status <> 'hidden';
grant select on public.bike_rentals_public to anon, authenticated;

alter table public.bike_rentals enable row level security;

drop policy if exists bike_rentals_read   on public.bike_rentals;
drop policy if exists bike_rentals_insert on public.bike_rentals;
drop policy if exists bike_rentals_update on public.bike_rentals;
drop policy if exists bike_rentals_delete on public.bike_rentals;
-- Only signed-in members can read the FULL row (incl. phone + price).
create policy bike_rentals_read   on public.bike_rentals for select using (auth.uid() is not null);
create policy bike_rentals_insert on public.bike_rentals for insert with check (auth.uid() = owner_id);
create policy bike_rentals_update on public.bike_rentals for update using (auth.uid() = owner_id);
create policy bike_rentals_delete on public.bike_rentals for delete using (auth.uid() = owner_id);

-- Realtime (optional live updates)
alter publication supabase_realtime add table public.camps;
alter publication supabase_realtime add table public.camp_applications;
alter publication supabase_realtime add table public.bike_rentals;

-- ------------------------------------------------------------
-- 3) SEED — example camp so the apply flow works out of the box
-- ------------------------------------------------------------
insert into public.camps (title, slug, location, start_date, end_date, summary, description, capacity, price, currency, cover_emoji, status)
values (
  'Gates of Sahara',
  'gates-of-sahara',
  'Fas / Morocco',
  '2026-11-01', '2026-11-11',
  'Sahra kapılarında 11 günlük gravel kampı.',
  E'Atlas Dağları''ndan Sahra''nın eşiğine uzanan 11 günlük bir gravel macerası. Günlük etaplar, çöl kampları, yerel mutfak ve destek aracı dahil.\n\nSeviye: orta-ileri. Gravel veya dağ bisikleti önerilir.',
  16, 1850, 'EUR', '🏜️', 'open'
)
on conflict (slug) do nothing;
