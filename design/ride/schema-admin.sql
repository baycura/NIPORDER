-- ============================================================
-- NIP Ride — Shared admin layer (staff-gated moderation)
-- Apply after schema.sql and schema-camps-rentals.sql.
-- The unified admin (reservation.notinparis.me/#admin) and the ride app
-- both use the SAME Supabase project + `staff` table for authorization.
-- ============================================================

-- Who counts as "staff/admin": a row in public.staff with a managing role.
-- SECURITY DEFINER so it can read staff regardless of that table's RLS.
create or replace function public.nip_is_staff() returns boolean
language sql stable security definer
set search_path = public as $$
  select exists (
    select 1 from public.staff
    where auth_id = auth.uid() and role in ('admin','owner','manager')
  );
$$;
grant execute on function public.nip_is_staff() to anon, authenticated;

-- ------------------------------------------------------------
-- Official "Social Ride" support on ride_posts
-- ------------------------------------------------------------
alter table public.ride_posts add column if not exists is_official boolean not null default false;
alter table public.ride_posts add column if not exists strava_url  text;

-- Recreate the board view so p.* picks up the new columns.
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

-- Only staff may publish/keep an official ride; staff may moderate any ride.
drop policy if exists ride_posts_insert on public.ride_posts;
create policy ride_posts_insert on public.ride_posts for insert with check (
  auth.uid() = user_id and (is_official = false or public.nip_is_staff())
);
drop policy if exists ride_posts_update on public.ride_posts;
create policy ride_posts_update on public.ride_posts for update using (
  auth.uid() = user_id or public.nip_is_staff()
);
drop policy if exists ride_posts_delete on public.ride_posts;
create policy ride_posts_delete on public.ride_posts for delete using (
  auth.uid() = user_id or public.nip_is_staff()
);

-- ------------------------------------------------------------
-- Camps: staff CRUD from the client
-- ------------------------------------------------------------
drop policy if exists camps_insert on public.camps;
drop policy if exists camps_update on public.camps;
drop policy if exists camps_delete on public.camps;
create policy camps_insert on public.camps for insert with check (public.nip_is_staff());
create policy camps_update on public.camps for update using (public.nip_is_staff());
create policy camps_delete on public.camps for delete using (public.nip_is_staff());

-- Camp applications: staff can read all + change status (accept/reject/waitlist)
drop policy if exists camp_apps_read on public.camp_applications;
create policy camp_apps_read on public.camp_applications for select using (
  auth.uid() = user_id or public.nip_is_staff()
);
drop policy if exists camp_apps_update on public.camp_applications;
create policy camp_apps_update on public.camp_applications for update using (
  auth.uid() = user_id or public.nip_is_staff()
);

-- ------------------------------------------------------------
-- Rentals: staff moderation (hide/unhide/delete any listing)
-- ------------------------------------------------------------
drop policy if exists bike_rentals_update on public.bike_rentals;
create policy bike_rentals_update on public.bike_rentals for update using (
  auth.uid() = owner_id or public.nip_is_staff()
);
drop policy if exists bike_rentals_delete on public.bike_rentals;
create policy bike_rentals_delete on public.bike_rentals for delete using (
  auth.uid() = owner_id or public.nip_is_staff()
);
