-- ============================================================================
-- BIRLESTIRME ADIM 1: SURUSLER ORDER'A            20260902_surusler_ordera_tasindi
-- ============================================================================
-- Sahibin karari: "Dogru sirada sistemi bozmadan butun olayi order kisminda
-- birlestirelim."
--
-- NEDEN ILK ADIM BU: risk sifir. Envanter sonucu (3 repo tarandi):
--   - ride_posts / ride_rsvps / stable_bikes tablolarina HICBIR uygulama
--     YAZMIYOR. NIPWEB (Shopify temasi) ve NOTINPARIS (rezervasyon HTML'i)
--     bu tablolarin adini bile gecirmiyor.
--   - Tek OKUYAN, NIPORDER'in musteri menusu (CustomerMenu "Surus" sekmesi).
-- Yani bu tablolar fiilen zaten Order'a ait; RESERVE'de durmalari tarihsel
-- kaza. Tasima kimseyi bozmaz.
--
-- KAYNAK VERI SILINMIYOR. RESERVE'deki kopyalar oldugu gibi kalir; geri donus
-- gerekirse frontend'i eski adrese cevirmek yeterli. Tek yon: once Order dolar,
-- sonra okuma Order'a cevrilir.
--
-- KIMLIK ESLEMESI: RESERVE'de user_id, RESERVE auth kullanicisina isaret
-- ediyordu. Order'da o kimlik yok. Bu tablolar personel tarafindan yonetilecegi
-- icin user_id yerine created_by (staff) kullaniliyor; eski kayitlarda null
-- kalir — 4 satirlik veride kimlik zorlamanin degeri yok.
--
-- Geri alma:
--   drop table if exists public.ride_rsvps;
--   drop table if exists public.ride_posts;
--   drop table if exists public.stable_bikes;
--   -- CustomerMenu tekrar RESERVE_URL'den okumaya dondurulur
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Surusler
-- ----------------------------------------------------------------------------
create table if not exists public.ride_posts (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  ride_date       date not null,
  ride_time       text,
  pace            text,
  distance_km     numeric,
  elevation_m     numeric,
  capacity        integer not null default 6,
  meet_point      text,
  route_url       text,
  notes           text,
  status          text not null default 'open',
  strava_event_id text unique,          -- Strava senkronu bunun uzerinden esler
  created_by      uuid references public.staff(id),
  store_id        uuid references public.stores(id),
  created_at      timestamptz not null default now(),
  constraint ride_posts_status_gecerli check (status in ('open','full','cancelled','done'))
);

comment on table public.ride_posts is
  'Planli kulup surusleri. RESERVE projesinden 2026-09-02 tasindi; oraya hicbir '
  'uygulama yazmiyordu, tek okuyan NIPORDER musteri menusuydu.';
comment on column public.ride_posts.strava_event_id is
  'Strava grup etkinligi id. UNIQUE — senkron ayni etkinligi iki kez eklemesin.';

create index if not exists ride_posts_tarih on public.ride_posts(ride_date desc);

-- ----------------------------------------------------------------------------
-- 2) Katilim (RSVP) — musteri tarafi. customers'a bagli, cunku uye kimligi
--    Order'da customers uzerinden yuruyor (auth.users degil).
-- ----------------------------------------------------------------------------
create table if not exists public.ride_rsvps (
  id         uuid primary key default gen_random_uuid(),
  ride_id    uuid not null references public.ride_posts(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  ad         text,                       -- uye degilse serbest isim
  status     text not null default 'going',
  created_at timestamptz not null default now(),
  constraint ride_rsvps_status_gecerli check (status in ('going','maybe','out'))
);

create index if not exists ride_rsvps_surus on public.ride_rsvps(ride_id);

-- ----------------------------------------------------------------------------
-- 3) Ahir — uyelerin odunc verdigi bisikletler
-- ----------------------------------------------------------------------------
create table if not exists public.stable_bikes (
  id               uuid primary key default gen_random_uuid(),
  owner_name       text,
  customer_id      uuid references public.customers(id) on delete set null,
  brand            text not null,
  model            text,
  type             text not null default 'Road',
  size             text,
  frame_cm         integer,
  height_range     text,
  groupset         text,
  wheels           text,
  pedals           text,
  location         text,
  terms            text,
  availability     text,
  contact_phone    text,
  contact_telegram text,
  note             text,
  status           text not null default 'available',
  created_at       timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 4) RLS
-- Surusler QR menude anon musteriye gorunur (vitrin). Yazma yalniz personel.
-- ----------------------------------------------------------------------------
alter table public.ride_posts   enable row level security;
alter table public.ride_rsvps   enable row level security;
alter table public.stable_bikes enable row level security;

drop policy if exists ride_posts_herkes_okur on public.ride_posts;
create policy ride_posts_herkes_okur on public.ride_posts
  for select to anon, authenticated using (true);

drop policy if exists ride_posts_personel_yazar on public.ride_posts;
create policy ride_posts_personel_yazar on public.ride_posts
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

drop policy if exists ride_rsvps_herkes_okur on public.ride_rsvps;
create policy ride_rsvps_herkes_okur on public.ride_rsvps
  for select to anon, authenticated using (true);

drop policy if exists ride_rsvps_personel_yazar on public.ride_rsvps;
create policy ride_rsvps_personel_yazar on public.ride_rsvps
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

drop policy if exists stable_bikes_herkes_okur on public.stable_bikes;
create policy stable_bikes_herkes_okur on public.stable_bikes
  for select to anon, authenticated using (true);

drop policy if exists stable_bikes_personel_yazar on public.stable_bikes;
create policy stable_bikes_personel_yazar on public.stable_bikes
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- Ledger'lardaki ayni tuzak: TRUNCATE RLS'i atlar, personelde durmasin.
revoke truncate, references, trigger on public.ride_posts   from anon, authenticated;
revoke truncate, references, trigger on public.ride_rsvps   from anon, authenticated;
revoke truncate, references, trigger on public.stable_bikes from anon, authenticated;
revoke all on public.ride_posts   from anon;
revoke all on public.ride_rsvps   from anon;
revoke all on public.stable_bikes from anon;
grant select on public.ride_posts   to anon;
grant select on public.ride_rsvps   to anon;
grant select on public.stable_bikes to anon;
