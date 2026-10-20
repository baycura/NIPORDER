-- DONER DEFTERI — ayri limited sirketin basit defteri (sahip istegi 20.10).
--
-- Kafe uygulamasindan bagimsiz calisir: kendi kullanicilari
-- (doner_kullanicilar), kendi tablolari (doner_*). Doner kullanicilari kafe
-- personeli DEGILDIR (staff tablosunda yok); kafe tablolarina RLS gecit
-- vermez. Kafe personeli de doner tablolarini goremez; yalniz listede olan
-- ortaklar (Omer, Ceren) iki tarafi da gorur. Veritabani ortak oldugu icin
-- kafede satilan doner urunleri (konsinye, hakedis kurali) ve donerin QR
-- siparisleri gelire kendiliginden girer.
--
-- Tablolar:
--   doner_kullanicilar  kim girebilir (admin | personel), onay bekleyenler aktif=false
--   doner_giderler      fatura/gider: tarih, kategori, tutar, tedarikci, fatura no, KIM ODEDI
--   doner_gunsonu       tezgah satisi: gun basina nakit + kart
--   doner_urun_maliyet  kitchen_menu urunune maliyet
--   doner_satislar      gun + urun + adet (istege bagli; urun kari icin)
--   doner_borclular     veresiye defteri
-- RPC: doner_kayit_iste (kayit isteme, admin onaylar), doner_ozet (gun/hafta/ay).
--
-- Hicbir nesne silinmez.

-- 1. Kullanicilar ------------------------------------------------------------
create table if not exists public.doner_kullanicilar (
  auth_id    uuid primary key,
  ad         text not null,
  eposta     text,
  rol        text not null default 'personel' check (rol in ('admin', 'personel')),
  aktif      boolean not null default false,
  created_at timestamptz not null default now()
);
comment on table public.doner_kullanicilar is
  'Doner defteri kullanicilari. staff tablosundan bagimsiz; aktif=false onay bekler (20261020_doner_defter).';

insert into public.doner_kullanicilar (auth_id, ad, rol, aktif) values
  ('962c6124-c785-4f68-b3fd-fedef7b13f82', 'Ömer Baycura', 'admin', true),
  ('53578ee1-4a78-4047-adba-e4f1caca0ca0', 'Ceren Baycura', 'admin', true)
on conflict (auth_id) do nothing;

create or replace function public.doner_uye()
returns boolean language sql stable security definer set search_path to 'public'
as $$ select exists (select 1 from public.doner_kullanicilar k where k.auth_id = auth.uid() and k.aktif); $$;

create or replace function public.doner_admin()
returns boolean language sql stable security definer set search_path to 'public'
as $$ select exists (select 1 from public.doner_kullanicilar k where k.auth_id = auth.uid() and k.aktif and k.rol = 'admin'); $$;

revoke execute on function public.doner_uye(), public.doner_admin() from public, anon;
grant execute on function public.doner_uye(), public.doner_admin() to authenticated;

-- 2. Defter tablolari --------------------------------------------------------
create table if not exists public.doner_giderler (
  id         uuid primary key default gen_random_uuid(),
  tarih      date not null default (now() at time zone 'Europe/Istanbul')::date,
  kategori   text not null,
  aciklama   text,
  tutar      numeric(12,2) not null check (tutar > 0),
  kdv_dahil  boolean not null default true,
  tedarikci  text,
  fatura_no  text,
  odeyen     text not null default 'kasa',
  yontem     text not null default 'nakit' check (yontem in ('nakit', 'kart', 'havale')),
  fis_url    text,
  giren      uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);
comment on table public.doner_giderler is
  'Doner gider ve faturalari. odeyen: kasa ya da ortak adi (kim odedi) (20261020_doner_defter).';
create index if not exists doner_giderler_tarih on public.doner_giderler (tarih desc);

create table if not exists public.doner_gunsonu (
  tarih       date primary key,
  nakit       numeric(12,2) not null default 0 check (nakit >= 0),
  kart        numeric(12,2) not null default 0 check (kart >= 0),
  notu        text,
  giren       uuid not null default auth.uid(),
  created_at  timestamptz not null default now(),
  guncellendi timestamptz not null default now()
);
comment on table public.doner_gunsonu is 'Doner tezgah satisi: gun basina nakit + kart (20261020_doner_defter).';

create table if not exists public.doner_urun_maliyet (
  urun_id     text primary key references public.kitchen_menu(id) on delete cascade,
  maliyet     numeric(12,2) not null check (maliyet >= 0),
  giren       uuid not null default auth.uid(),
  guncellendi timestamptz not null default now()
);
comment on table public.doner_urun_maliyet is 'kitchen_menu urununun birim maliyeti (20261020_doner_defter).';

create table if not exists public.doner_satislar (
  id         uuid primary key default gen_random_uuid(),
  tarih      date not null,
  urun_id    text not null references public.kitchen_menu(id) on delete cascade,
  adet       integer not null check (adet >= 0),
  giren      uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (tarih, urun_id)
);
comment on table public.doner_satislar is 'Gun + urun + adet; urun kari icin istege bagli giris (20261020_doner_defter).';

create table if not exists public.doner_borclular (
  id           uuid primary key default gen_random_uuid(),
  ad           text not null,
  tutar        numeric(12,2) not null check (tutar > 0),
  tarih        date not null default (now() at time zone 'Europe/Istanbul')::date,
  notu         text,
  odendi       boolean not null default false,
  odeme_tarihi date,
  giren        uuid not null default auth.uid(),
  created_at   timestamptz not null default now()
);
comment on table public.doner_borclular is 'Doner veresiye defteri (20261020_doner_defter).';

-- 3. RLS: yalniz aktif doner kullanicisi; silme yalniz admin ---------------
do $$
declare t text;
begin
  foreach t in array array['doner_giderler', 'doner_gunsonu', 'doner_urun_maliyet', 'doner_satislar', 'doner_borclular'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = t || '_uye_okur') then
      execute format('create policy %I on public.%I for select to authenticated using (public.doner_uye())', t || '_uye_okur', t);
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = t || '_uye_yazar') then
      execute format('create policy %I on public.%I for insert to authenticated with check (public.doner_uye())', t || '_uye_yazar', t);
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = t || '_uye_duzeltir') then
      execute format('create policy %I on public.%I for update to authenticated using (public.doner_uye()) with check (public.doner_uye())', t || '_uye_duzeltir', t);
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = t || '_admin_siler') then
      execute format('create policy %I on public.%I for delete to authenticated using (public.doner_admin())', t || '_admin_siler', t);
    end if;
  end loop;
end $$;

-- Kullanici listesi: uye herkesi gorur (gider "kim odedi" secimi icin), onay
-- bekleyen yalniz kendini gorur. Yazma yalniz admin; kayit istegi RPC ile.
alter table public.doner_kullanicilar enable row level security;
revoke all on public.doner_kullanicilar from anon;
grant select, update, delete on public.doner_kullanicilar to authenticated;
revoke insert on public.doner_kullanicilar from authenticated;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'doner_kullanicilar' and policyname = 'doner_kullanicilar_okur') then
    create policy doner_kullanicilar_okur on public.doner_kullanicilar
      for select to authenticated using (auth_id = auth.uid() or public.doner_uye());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'doner_kullanicilar' and policyname = 'doner_kullanicilar_admin_duzeltir') then
    create policy doner_kullanicilar_admin_duzeltir on public.doner_kullanicilar
      for update to authenticated using (public.doner_admin()) with check (public.doner_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'doner_kullanicilar' and policyname = 'doner_kullanicilar_admin_siler') then
    create policy doner_kullanicilar_admin_siler on public.doner_kullanicilar
      for delete to authenticated using (public.doner_admin() and auth_id <> auth.uid());
  end if;
end $$;

-- 4. Kayit istegi: giris yapan kisi kendini listeye yazar, admin onaylar ---
create or replace function public.doner_kayit_iste(p_ad text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_uid uuid := auth.uid(); v_eposta text;
begin
  if v_uid is null then raise exception 'doner: once giris yap'; end if;
  select u.email into v_eposta from auth.users u where u.id = v_uid;
  insert into public.doner_kullanicilar (auth_id, ad, eposta)
  values (v_uid, coalesce(nullif(btrim(p_ad), ''), split_part(coalesce(v_eposta, 'kullanici'), '@', 1)), v_eposta)
  on conflict (auth_id) do update
    set ad = coalesce(nullif(btrim(p_ad), ''), public.doner_kullanicilar.ad),
        eposta = coalesce(excluded.eposta, public.doner_kullanicilar.eposta);
  return (select to_jsonb(k) from public.doner_kullanicilar k where k.auth_id = v_uid);
end $function$;

revoke execute on function public.doner_kayit_iste(text) from public, anon;
grant execute on function public.doner_kayit_iste(text) to authenticated;

-- 5. Ozet: gun, hafta, ay ----------------------------------------------------
-- Gelir = tezgah (gunsonu) + QR (kitchen_orders, kafeden gelmeyenler) +
-- kafe konsinye (hakedis kurali: ikramda liste fiyati). Gider kategori ve
-- odeyene gore. Maliyet = satilan adet x birim maliyet. Gunluk seri ciro
-- cubuklari icin. Kafe tablolarini doner kullanicisi okuyamaz; bu yuzden
-- DEFINER, ama once doner_uye() kontrolu.
create or replace function public.doner_ozet(p_bas date, p_bit date)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_doner uuid := 'c39da530-7f73-4f69-a752-029bf03790b1';
  v jsonb;
begin
  if not public.doner_uye() then raise exception 'doner: yetkisiz' using errcode = '42501'; end if;
  if p_bas is null or p_bit is null or p_bit < p_bas then raise exception 'doner: tarih araligi hatali'; end if;
  if p_bit - p_bas > 400 then raise exception 'doner: en fazla 400 gun'; end if;

  with kafe_kalem as (
    select (coalesce(o.paid_at, o.updated_at, o.created_at) at time zone 'Europe/Istanbul')::date as gun,
           coalesce(oi.quantity, 1) as adet,
           coalesce(oi.quantity, 1) * (case when coalesce(oi.is_treat, false) then coalesce(oi.product_price, 0)
                                            else coalesce(oi.final_price, oi.product_price, 0) end) as tutar
      from public.orders o
      join public.order_items oi on oi.order_id = o.id
     where o.status::text = 'paid'
       and oi.kitchen_destination_store_id = v_doner
       and (coalesce(o.paid_at, o.updated_at, o.created_at) at time zone 'Europe/Istanbul')::date between p_bas and p_bit
  ),
  qr as (
    select (k.created_at at time zone 'Europe/Istanbul')::date as gun, coalesce(k.total, 0)::numeric as tutar
      from public.kitchen_orders k
     where (k.created_at at time zone 'Europe/Istanbul')::date between p_bas and p_bit
       and coalesce(k.status, '') <> 'cancelled'
       and not exists (select 1 from public.nip_kitchen_cards c where c.kitchen_order_id = k.id)
  ),
  gider as (
    select g.tarih as gun, g.kategori, g.odeyen, g.tutar from public.doner_giderler g where g.tarih between p_bas and p_bit
  ),
  tezgah as (
    select t.tarih as gun, t.nakit, t.kart from public.doner_gunsonu t where t.tarih between p_bas and p_bit
  ),
  satis as (
    select s.tarih as gun, s.adet, m.maliyet from public.doner_satislar s
      left join public.doner_urun_maliyet m on m.urun_id = s.urun_id
     where s.tarih between p_bas and p_bit
  )
  select jsonb_build_object(
    'bas', p_bas, 'bit', p_bit,
    'tezgah', jsonb_build_object('nakit', (select coalesce(sum(nakit), 0) from tezgah), 'kart', (select coalesce(sum(kart), 0) from tezgah), 'gun', (select count(*) from tezgah)),
    'qr', jsonb_build_object('tutar', (select coalesce(sum(tutar), 0) from qr), 'adet', (select count(*) from qr)),
    'kafe', jsonb_build_object('tutar', (select coalesce(sum(tutar), 0) from kafe_kalem), 'adet', (select coalesce(sum(adet), 0) from kafe_kalem)),
    'gider', jsonb_build_object(
       'tutar', (select coalesce(sum(tutar), 0) from gider), 'adet', (select count(*) from gider),
       'kategori', coalesce((select jsonb_object_agg(x.kategori, x.t) from (select kategori, sum(tutar) t from gider group by kategori) x), '{}'::jsonb),
       'odeyen', coalesce((select jsonb_object_agg(y.odeyen, y.t) from (select odeyen, sum(tutar) t from gider group by odeyen) y), '{}'::jsonb)),
    'maliyet', jsonb_build_object(
       'tutar', (select coalesce(sum(adet * maliyet), 0) from satis),
       'adet', (select coalesce(sum(adet), 0) from satis),
       'maliyetsiz_adet', (select coalesce(sum(adet) filter (where maliyet is null), 0) from satis)),
    'borc', (select jsonb_build_object('acik', coalesce(sum(tutar) filter (where not odendi), 0), 'kisi', count(*) filter (where not odendi)) from public.doner_borclular),
    'gunler', (select coalesce(jsonb_agg(jsonb_build_object('gun', d.gun,
                  'tezgah', coalesce((select sum(nakit + kart) from tezgah where gun = d.gun), 0),
                  'qr', coalesce((select sum(tutar) from qr where gun = d.gun), 0),
                  'kafe', coalesce((select sum(tutar) from kafe_kalem where gun = d.gun), 0),
                  'gider', coalesce((select sum(tutar) from gider where gun = d.gun), 0)) order by d.gun), '[]'::jsonb)
               from (select generate_series(p_bas, p_bit, interval '1 day')::date as gun) d)
  ) into v;
  return v;
end $function$;

comment on function public.doner_ozet(date, date) is
  'Doner defteri ozeti: tezgah + QR + kafe konsinye geliri, gider, maliyet, borc, gunluk seri (20261020_doner_defter).';

revoke execute on function public.doner_ozet(date, date) from public, anon;
grant execute on function public.doner_ozet(date, date) to authenticated;
