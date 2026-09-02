-- ============================================================================
-- DIKKAT: BU DOSYA ORDER'A DEGIL, "NIP RESERVE" PROJESINE UYGULANDI.
--
-- Tarihi gecen etkinlikler iki hafta sonra panelden kalksin.  2026-09-02
-- ============================================================================
-- ISTEK: "Rezervasyon kismindaki admin panelinde gecmis etkinlikler silik
-- olarak duruyor, tarihi gecen etkinlikleri iki haftanin sonunda sil."
--
-- ONCE BULUNAN TUZAK -- BU YAZILMASAYDI GECMIS SILINIRDI
-- reservations.event_id kisiti ON DELETE CASCADE idi. Etkinligi duz "delete"
-- ile silmek, o etkinlige ait rezervasyonlari da goturuyordu. Olculdu:
-- 64 eski etkinlik silinseydi 20 rezervasyonun 17'si (yuzde 85) yok olacakti.
-- Kimin hangi geceye geldigi, DJ puanlari, giris saatleri hepsi.
-- Bu yuzden sira onemli: once bag koparilir, sonra silme yazilir.
--
-- "SILME" NEDEN ARSIV
-- Istenen sey panelin temizlenmesi. Geri donusu olmayan bir yok etme
-- istenmedi, o yuzden satirlar poster dahil TAM kopyayla events_arsiv'e
-- tasiniyor. Yanlislikla giden bir gece tek insert ile geri gelir.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Bagi kopar. Guvenli, cunku reservations zaten kendi kopyasini tutuyor:
--    event_name / event_date / event_time. 20 satirin 20'sinde dolu oldugu
--    kontrol edildi. On yuz de biletleri bu kolonlardan basiyor (index.html
--    1452, 1513, 1822 — hicbiri events'e join atmiyor), yani bag bosalinca
--    ekranda hicbir sey degismiyor.
-- ----------------------------------------------------------------------------
alter table public.reservations
  drop constraint reservations_event_id_fkey;
alter table public.reservations
  add constraint reservations_event_id_fkey
  foreign key (event_id) references public.events(id) on delete set null;

comment on column public.reservations.event_id is
  'Etkinlik arsivlenince NULL olur — rezervasyon kaydi silinmez. Gecenin adi '
  've tarihi event_name / event_date kolonlarinda zaten duruyor.';

-- waitlist'te CASCADE bilerek kaliyor: bekleme sirasi gecici bir kuyruk,
-- etkinlik bitince anlamini yitiriyor.

-- ----------------------------------------------------------------------------
-- 2) Arsiv
-- ----------------------------------------------------------------------------
create table if not exists public.events_arsiv (
  like public.events including defaults,
  arsivlendi_at timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'events_arsiv_pkey') then
    alter table public.events_arsiv add constraint events_arsiv_pkey primary key (id);
  end if;
end $$;

create index if not exists events_arsiv_tarih on public.events_arsiv(date desc);

comment on table public.events_arsiv is
  'Iki haftadan eski etkinliklerin tam kopyasi. Panel temiz kalsin diye events '
  'tablosundan cikarilirlar ama burada dururlar — geri getirmek tek insert.';

alter table public.events_arsiv enable row level security;
drop policy if exists events_arsiv_admin on public.events_arsiv;
create policy events_arsiv_admin on public.events_arsiv
  for select using (public.nip_is_admin());
revoke all on public.events_arsiv from anon, authenticated;
grant select on public.events_arsiv to authenticated;

-- ----------------------------------------------------------------------------
-- 3) Isin kendisi
--
-- IKI KAPI VAR, IKISI DE ZORUNLU:
--   KAPI 1 — admin. Fonksiyon SECURITY DEFINER, yani RLS'i atliyor. Ilk
--     yazdigimda icinde yetki kontrolu YOKTU: giris yapmis herhangi bir uye
--     butun etkinlikleri silebilirdi. Kimlik yalniz auth.uid() ile okunur;
--     current_user burada fonksiyon sahibidir, cagiran degil.
--   KAPI 2 — p_gun taban siniri. Kapi 1 olmasa p_gun => -9999 ile GELECEKTEKI
--     etkinlikler de silinirdi. En az 7 gunluk gecmis sart.
-- ----------------------------------------------------------------------------
create or replace function public.nip_eski_etkinlikleri_arsivle(
  p_gun integer default 14,
  p_prova boolean default false      -- true: hicbir sey silme, yalniz say
)
returns table (arsivlenen integer, bagi_bosalan_rezervasyon integer, sinir date)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_sinir date;
  v_adet  integer;
  v_rez   integer;
begin
  -- auth.uid() null ise cagiran zamanlanmis is (postgres), gecer.
  if auth.uid() is not null and not public.nip_is_admin() then
    raise exception 'Bu islem yalniz admin tarafindan yapilabilir';
  end if;

  if p_gun is null or p_gun < 7 then
    raise exception 'p_gun en az 7 olmali (verilen: %)', p_gun;
  end if;

  v_sinir := current_date - make_interval(days => p_gun);

  select count(*) into v_adet from public.events where date < v_sinir;
  select count(*) into v_rez  from public.reservations r
    join public.events e on e.id = r.event_id where e.date < v_sinir;

  if not p_prova then
    insert into public.events_arsiv
    select e.*, now() from public.events e
     where e.date < v_sinir
       and not exists (select 1 from public.events_arsiv a where a.id = e.id);

    delete from public.events where date < v_sinir;
  end if;

  return query select v_adet, v_rez, v_sinir;
end $$;

comment on function public.nip_eski_etkinlikleri_arsivle(integer, boolean) is
  'Tarihi p_gun gunden eski etkinlikleri events''ten cikarip events_arsiv''e '
  'tasir. p_prova=true ile hicbir sey silmeden ne olacagini sayar. '
  'Rezervasyonlar SILINMEZ — bagi NULL olur.';

-- REST ucu kapali: panelde bu fonksiyonu cagiran dugme yok, tek cagiran gece
-- calisan zamanlanmis is ve o postgres olarak calisiyor. En iyi kapi, hic
-- acilmayan kapi.
revoke execute on function public.nip_eski_etkinlikleri_arsivle(integer, boolean)
  from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4) Her gece TR 04:00 (UTC 01:00). Kafe TR 03:00'te kapaniyor; is o
--    kapanistan sonraki olu saate denk gelsin.
-- ----------------------------------------------------------------------------
create extension if not exists pg_cron;

select cron.unschedule(jobid) from cron.job where jobname = 'eski-etkinlikleri-arsivle';

select cron.schedule(
  'eski-etkinlikleri-arsivle',
  '0 1 * * *',
  $$ select public.nip_eski_etkinlikleri_arsivle(14, false); $$
);

-- ============================================================================
-- DOGRULAMA (once prova, sonra gercek; hepsi gecti)
--
-- PROVA (geri sarildi):
--   arsivlenecek ............................ 64
--   REZERVASYON kalan ....................... 20  <- HICBIRI SILINMEDI
--   bagi bosalan rezervasyon ................ 17
--   adi/tarihi kaybolan rezervasyon ......... 0
--   ornek: "Omer Baycura / SPACE CAST / 2026-04-01" arsivden sonra da yerinde
--
-- GERCEK CALISTIRMA: arsivlenen=64, sinir=2026-08-19
--   events (panelde gorunen) ................ 11  (4 gelecek + 7 son iki hafta)
--   events_arsiv ............................ 64
--   reservations ............................ 20
--
-- KAPILAR:
--   uye fonksiyonu cagirdi ................... reddedildi
--   p_gun = -9999 ............................ reddedildi
--   admin REST ucundan cagirdi ............... reddedildi (uc kapali)
--   zamanlanmis is ........................... calisiyor
--
-- ON YUZ (anon / uye / admin gozuyle):
--   ANON slogan .............................. INNER CIRCLE
--   ANON duyuru .............................. 1/1
--   ANON etkinlik listesi .................... 11
--   ANON baskasinin rezervasyonu ............. 0
--   ANON uye listesi ......................... 0
--   ANON arsiv ............................... tablo duzeyinde reddedildi
--   UYE kendi profili ........................ 1
--   UYE kendi rezervasyonu ................... 1
--   UYE arsiv ................................ 0
--   ADMIN profil / rezervasyon / arsiv ....... 75 / 20 / 64
-- ============================================================================
