-- NIP — Ride Buddy backend (Supabase / Postgres)
-- Source: design handoff (Claude design). Apply in Supabase SQL editor.

create table if not exists public.ride_posts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  title       text not null,
  ride_date   date not null,
  ride_time   text,
  pace        text,
  distance_km numeric,
  elevation_m numeric,
  capacity    int  not null default 6 check (capacity between 1 and 50),
  meet_point  text,
  route_url   text,
  notes       text,
  status      text not null default 'open' check (status in ('open','full','cancelled')),
  created_at  timestamptz not null default now()
);
create index if not exists ride_posts_date_idx on public.ride_posts (ride_date);

create table if not exists public.ride_rsvps (
  id         uuid primary key default gen_random_uuid(),
  ride_id    uuid not null references public.ride_posts (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  status     text not null default 'going' check (status in ('going','waitlist','cancelled')),
  created_at timestamptz not null default now(),
  unique (ride_id, user_id)
);
create index if not exists ride_rsvps_ride_idx on public.ride_rsvps (ride_id);

-- Public board view: aggregated seat counts, no individual RSVP leak
create or replace view public.ride_board as
select
  p.*,
  coalesce(c.going_count, 0)                           as going_count,
  greatest(p.capacity - coalesce(c.going_count, 0), 0) as seats_open
from public.ride_posts p
left join (
  select ride_id, count(*) filter (where status = 'going') as going_count
  from public.ride_rsvps group by ride_id
) c on c.ride_id = p.id;
grant select on public.ride_board to anon, authenticated;

alter table public.ride_posts enable row level security;
alter table public.ride_rsvps enable row level security;

drop policy if exists ride_posts_read   on public.ride_posts;
drop policy if exists ride_posts_insert on public.ride_posts;
drop policy if exists ride_posts_update on public.ride_posts;
drop policy if exists ride_posts_delete on public.ride_posts;
create policy ride_posts_read   on public.ride_posts for select using (true);
create policy ride_posts_insert on public.ride_posts for insert with check (auth.uid() = user_id);
create policy ride_posts_update on public.ride_posts for update using (auth.uid() = user_id);
create policy ride_posts_delete on public.ride_posts for delete using (auth.uid() = user_id);

drop policy if exists ride_rsvps_read   on public.ride_rsvps;
drop policy if exists ride_rsvps_insert on public.ride_rsvps;
drop policy if exists ride_rsvps_update on public.ride_rsvps;
drop policy if exists ride_rsvps_delete on public.ride_rsvps;
create policy ride_rsvps_read on public.ride_rsvps for select using (
  auth.uid() = user_id
  or auth.uid() = (select user_id from public.ride_posts where id = ride_id)
);
create policy ride_rsvps_insert on public.ride_rsvps for insert with check (auth.uid() = user_id);
create policy ride_rsvps_update on public.ride_rsvps for update using (auth.uid() = user_id);
create policy ride_rsvps_delete on public.ride_rsvps for delete using (auth.uid() = user_id);

-- Auto-flip status open/full as RSVPs change
create or replace function public.nip_sync_ride_status() returns trigger
language plpgsql security definer as $$
declare rid uuid := coalesce(new.ride_id, old.ride_id); cap int; going int;
begin
  select capacity into cap from public.ride_posts where id = rid;
  select count(*) filter (where status = 'going') into going from public.ride_rsvps where ride_id = rid;
  update public.ride_posts set status = case
    when status = 'cancelled' then 'cancelled'
    when going >= cap then 'full' else 'open' end
  where id = rid;
  return null;
end $$;
drop trigger if exists ride_rsvps_status_sync on public.ride_rsvps;
create trigger ride_rsvps_status_sync after insert or update or delete on public.ride_rsvps
  for each row execute function public.nip_sync_ride_status();

-- Realtime (live board)
alter publication supabase_realtime add table public.ride_posts;
alter publication supabase_realtime add table public.ride_rsvps;
