-- ============================================================================
-- YEREL ETKINLIK + REZERVASYON                  20260911_yerel_etkinlik_rezervasyon
-- ============================================================================
-- NEDEN: Uygulama ikinci bir isletmeye kuruluyor (ayri Supabase projesi).
-- O isletmede rezervasyon sitesi (RESERVE projesi) yok; etkinlik ve
-- rezervasyon bu veritabasinda tutulacak. Tablolar RESERVE'deki events /
-- reservations ile AYNI KOLON ADLARINI tasir ki Rezervasyon sayfasi
-- (ReservePage.jsx) tek kodla iki kaynaga da yazabilsin: profil "nip"te
-- reserve istemcisi RESERVE'e gider, profil "temel"de bu tablolara.
--
-- NIP'in kendi Order'inda bu tablolar BOS durur; NIP RESERVE'i kullanmaya
-- devam eder (lib/profil.js REZERVASYON_KAYNAK). Zararsiz, cunku yeni
-- isletmenin semasi Order'dan kopyalaniyor (supabase/kurulum) ve tablolar
-- orada da olmali.
--
-- Akis (yerel):
--   musteri  QR menu > Etkinlik > etkinlige dokunur > ad, telefon, kisi > talep
--            (anon INSERT, status='pending', baska hicbir sey)
--   personel Rezervasyon sayfasi > Onayla / Reddet / Giris / Gelmedi
--            (is_staff; etkinlik acma/duzenleme yonetici: nip_yonetici_mi)
--
-- Geri alma: drop table public.reservations; drop table public.events;
--            drop function public.nip_yonetici_mi();
-- ============================================================================

-- Yonetici mi? admin / manager / owner, aktif. RESERVE'deki nip_is_admin'in
-- Order karsiligi; Rezervasyon sayfasi yerel modda bunu sorar.
create or replace function public.nip_yonetici_mi()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.staff s
     where s.auth_id = auth.uid() and s.is_active = true
       and s.role::text in ('admin','manager','owner')
  );
$$;
revoke all on function public.nip_yonetici_mi() from anon, public;
grant execute on function public.nip_yonetici_mi() to authenticated, service_role;

create table if not exists public.events (
  id             uuid primary key default gen_random_uuid(),
  store_id       uuid references public.stores(id) on delete set null,
  name           text not null,
  genre          text,
  subtitle       text,
  date           date not null,
  time           text,
  time_end       text,
  warmup_name    text,
  warmup_start   text,
  warmup_end     text,
  capacity       integer not null default 100 check (capacity > 0),
  approved_count integer not null default 0 check (approved_count >= 0),
  access_type    text not null default 'open' check (access_type in ('open','members_only')),
  min_tier       text default 'bronze',
  min_trust      integer default 0,
  rules          text,
  color          text,
  note           text,
  poster_thumb   text,
  poster_blur    text,
  status         text not null default 'active' check (status in ('active','cancelled','archived')),
  created_at     timestamptz not null default now()
);
comment on table public.events is
  'Yerel etkinlikler (rezervasyon sitesi olmayan isletme). Kolon adlari RESERVE.events ile ayni; Rezervasyon sayfasi iki kaynaga tek kodla yazar.';
create index if not exists events_tarih on public.events(date desc);

create table if not exists public.reservations (
  id             uuid primary key default gen_random_uuid(),
  event_id       uuid references public.events(id) on delete set null,
  event_name     text,
  event_date     date,
  event_time     text,
  name           text not null check (length(trim(name)) between 2 and 80),
  phone          text check (phone is null or length(phone) <= 32),
  guest_count    integer not null default 1 check (guest_count between 1 and 20),
  guest_names    text,
  note           text check (note is null or length(note) <= 300),
  status         text not null default 'pending'
                 check (status in ('pending','approved','used','no_show','rejected','cancelled')),
  qr_id          text unique,
  profile_id     uuid,   -- RESERVE uyumu icin; yerelde hep null (misafir)
  customer_id    uuid references public.customers(id) on delete set null,
  approved_at    timestamptz,
  checked_in_at  timestamptz,
  created_at     timestamptz not null default now()
);
comment on table public.reservations is
  'Yerel rezervasyon talepleri. Musteri anon olarak yalniz pending talep acar; gerisi personel.';
create index if not exists reservations_etkinlik on public.reservations(event_id);
create index if not exists reservations_durum on public.reservations(status, created_at desc);

alter table public.events enable row level security;
alter table public.reservations enable row level security;

-- Etkinlik: herkes aktif olanlari gorur (QR menu), personel hepsini; yazan yonetici.
drop policy if exists events_okur on public.events;
create policy events_okur on public.events
  for select to anon, authenticated
  using (status = 'active' or public.is_staff());
drop policy if exists events_yonetim on public.events;
create policy events_yonetim on public.events
  for all to authenticated
  using (public.nip_yonetici_mi())
  with check (public.nip_yonetici_mi());

-- Rezervasyon: musteri (anon dahil) yalniz bekleyen talep acar; okuma/degistirme personel.
drop policy if exists reservations_talep on public.reservations;
create policy reservations_talep on public.reservations
  for insert to anon, authenticated
  with check (
    status = 'pending'
    and event_id is not null
    and approved_at is null and checked_in_at is null
    and profile_id is null
  );
drop policy if exists reservations_personel on public.reservations;
create policy reservations_personel on public.reservations
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- Tablo yetkileri: anon yalniz okuma (events) ve talep (reservations).
revoke all on public.events from anon;
grant select on public.events to anon;
revoke all on public.reservations from anon;
grant insert on public.reservations to anon;
