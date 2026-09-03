-- ============================================================================
-- REZERVASYON UYELERI -> ORDER MUSTERILERI SENKRONU        2026-09-03
-- ============================================================================
-- Sahibin karari: rezervasyon sitesi kendi projesinde calismaya devam ediyor.
-- Oraya kaydolup onaylanan uyeler Order'daki musteri listesine kendiliginden
-- dussun. Yon tek: RESERVE kaynak, Order alici. (Uyelik rezervasyon sitesinin
-- kavrami; Order'daki musteri listesi bunun ust kumesi — gelip gecenler de var.)
--
-- Nasil: her 10 dakikada Order, RESERVE'deki nip_uyeleri_ver ucundan onayli
-- uye listesini ceker (paylasilan sirla; sir iki projenin Vault'unda —
-- RESERVE: order_sync_sir, ORDER: reserve_sync_sir; deger repo'da YOK).
-- Her uye icin: reserve_profile_id ile bul -> yoksa e-postayla bul ve bagla ->
-- yoksa yeni musteri ac. Ad / telefon / puan / seviye DOKUNULMAZ; yalniz
-- kimlik (bag + uye kodu). Her tur tam listeyi cektigi icin kendi kendini
-- onarir: bir tur kacsa sonraki toparlar.
--
-- Neden pull (cekme), push (itme) degil: RESERVE tarafinda tetikleyici +
-- pg_net ile aninda itmek mumkun ama Order'in kapali oldugu an kaybolur,
-- yine periyodik uzlastirma gerekirdi. 10 dakika uye onayi icin yeterli.
--
-- RESERVE tarafi: ../reserve_migrations/20260903_uye_senkron_ucu.sql
-- Sirri Vault'a koyma bu dosyada YOK; uygulama sirasinda elle yapildi:
--   select vault.create_secret('<64 hex>', 'reserve_sync_sir', '...');
-- ============================================================================

create extension if not exists http with schema extensions;

-- Her turun kaydi. Panelde "son senkron" buradan okunur.
create table if not exists public.reserve_sync_log (
  id          bigserial primary key,
  at          timestamptz not null default now(),
  ok          boolean not null,
  http_status integer,
  alinan      integer not null default 0,
  eklenen     integer not null default 0,
  baglanan    integer not null default 0,
  guncellenen integer not null default 0,
  atlanan     integer not null default 0,
  hata        text
);
create index if not exists reserve_sync_log_at on public.reserve_sync_log(at desc);
alter table public.reserve_sync_log enable row level security;
drop policy if exists reserve_sync_log_personel_okur on public.reserve_sync_log;
create policy reserve_sync_log_personel_okur on public.reserve_sync_log
  for select to authenticated using (public.is_staff());
revoke all on public.reserve_sync_log from anon, authenticated;
grant select on public.reserve_sync_log to authenticated;

-- ----------------------------------------------------------------------------
-- 1) Saf isleme: gelen JSON listesini customers'a uygular. Ag yok — test
--    edilebilir. Satir satir; bir satirin hatasi digerlerini durdurmaz.
-- ----------------------------------------------------------------------------
create or replace function public.nip_reserve_uyeleri_isle(p_uyeler json)
returns table (alinan int, eklenen int, baglanan int, guncellenen int, atlanan int)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r record; c record;
  v_alinan int := 0; v_eklenen int := 0; v_baglanan int := 0; v_guncellenen int := 0; v_atlanan int := 0;
  v_phone text;
begin
  if current_user in ('authenticated', 'anon') then
    raise exception 'dogrudan cagrilamaz';
  end if;

  for r in
    select * from json_to_recordset(p_uyeler)
      as x(id uuid, email text, name text, phone text, member_code text, status text)
  loop
    v_alinan := v_alinan + 1;
    begin
      if r.id is null or r.email is null or r.email = '' then
        v_atlanan := v_atlanan + 1; continue;
      end if;

      -- a) zaten bagli: yalniz uye kodu degismisse yaz (kaynak RESERVE)
      select id, member_code into c from public.customers where reserve_profile_id = r.id;
      if found then
        if r.member_code is not null and c.member_code is distinct from r.member_code then
          update public.customers set member_code = r.member_code where id = c.id;
          v_guncellenen := v_guncellenen + 1;
        end if;
        continue;
      end if;

      -- b) e-postayla bul, bagla (ad/telefon dokunulmaz)
      select id, member_code, reserve_profile_id into c
        from public.customers where lower(email) = r.email limit 1;
      if found then
        if c.reserve_profile_id is not null then
          -- ayni e-posta baska bir profile bagli: karar sahibin, atla
          v_atlanan := v_atlanan + 1; continue;
        end if;
        update public.customers
           set reserve_profile_id = r.id,
               member_code = coalesce(r.member_code, c.member_code)
         where id = c.id;
        v_baglanan := v_baglanan + 1;
        continue;
      end if;

      -- c) yeni musteri — yalniz onayli uyeler icin
      if r.status <> 'approved' then
        v_atlanan := v_atlanan + 1; continue;
      end if;
      v_phone := nullif(r.phone, '');
      if v_phone is not null and exists (select 1 from public.customers where phone = v_phone) then
        v_phone := null;                       -- customers.phone UNIQUE; bilinmeyen kisiyi eskisine yapistirma
      end if;
      insert into public.customers (name, email, phone, tier, reserve_profile_id, member_code)
      values (coalesce(nullif(trim(r.name), ''), r.email), r.email, v_phone, 'bronze', r.id, r.member_code);
      v_eklenen := v_eklenen + 1;
    exception when others then
      v_atlanan := v_atlanan + 1;
      raise warning 'reserve senkron: % atlandi: %', r.email, sqlerrm;
    end;
  end loop;

  return query select v_alinan, v_eklenen, v_baglanan, v_guncellenen, v_atlanan;
end $$;

revoke all on function public.nip_reserve_uyeleri_isle(json) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2) Cekme: RESERVE'den listeyi al, isle, logla. Zamanlanmis is bunu cagirir.
-- ----------------------------------------------------------------------------
create or replace function public.nip_reserve_uyeleri_cek()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_sir text;
  v_anon constant text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRpcXBhcmpydHZ2Znh2d3hlYm92Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5Mzc3OTMsImV4cCI6MjA4OTUxMzc5M30.pNI2yU6LDG8583HBPq-5puxkpEVEAYwhGp9ibJ1WBsI';
  v_url  constant text := 'https://diqparjrtvvfxvwxebov.supabase.co/rest/v1/rpc/nip_uyeleri_ver';
  v_status int; v_content text; v_s record;
begin
  if current_user in ('authenticated', 'anon') then
    raise exception 'dogrudan cagrilamaz';
  end if;

  select decrypted_secret into v_sir from vault.decrypted_secrets where name = 'reserve_sync_sir';
  if v_sir is null then
    insert into public.reserve_sync_log(ok, hata) values (false, 'Vault''ta reserve_sync_sir yok');
    return;
  end if;

  begin
    perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '15000');
    select status, content into v_status, v_content
      from extensions.http((
        'POST', v_url,
        array[extensions.http_header('apikey', v_anon),
              extensions.http_header('Authorization', 'Bearer ' || v_anon)],
        'application/json',
        json_build_object('p_sir', v_sir)::text
      )::extensions.http_request);
  exception when others then
    insert into public.reserve_sync_log(ok, hata) values (false, 'ag: ' || sqlerrm);
    return;
  end;

  if v_status <> 200 then
    insert into public.reserve_sync_log(ok, http_status, hata)
      values (false, v_status, left(coalesce(v_content, ''), 300));
    return;
  end if;

  select * into v_s from public.nip_reserve_uyeleri_isle(v_content::json);
  insert into public.reserve_sync_log(ok, http_status, alinan, eklenen, baglanan, guncellenen, atlanan)
    values (true, v_status, v_s.alinan, v_s.eklenen, v_s.baglanan, v_s.guncellenen, v_s.atlanan);
end $$;

revoke all on function public.nip_reserve_uyeleri_cek() from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3) Panelden "simdi senkronla": personel tetikler, son kaydi gorur.
-- ----------------------------------------------------------------------------
create or replace function public.nip_reserve_senkron_simdi()
returns public.reserve_sync_log
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_row public.reserve_sync_log;
begin
  if not public.is_staff() then
    raise exception 'yalniz personel';
  end if;
  perform public.nip_reserve_uyeleri_cek();
  select * into v_row from public.reserve_sync_log order by at desc limit 1;
  return v_row;
end $$;

revoke all on function public.nip_reserve_senkron_simdi() from public, anon;
grant execute on function public.nip_reserve_senkron_simdi() to authenticated;

-- ----------------------------------------------------------------------------
-- 4) Her 10 dakikada. Log tablosu 30 gunden eski satirlari kendisi temizler.
-- ----------------------------------------------------------------------------
select cron.unschedule(jobid) from cron.job where jobname in ('nip-reserve-uye-senkronu', 'nip-reserve-senkron-log-temizlik');
select cron.schedule('nip-reserve-uye-senkronu', '*/10 * * * *', $$ select public.nip_reserve_uyeleri_cek(); $$);
select cron.schedule('nip-reserve-senkron-log-temizlik', '15 2 * * *',
  $$ delete from public.reserve_sync_log where at < now() - interval '30 days'; $$);

-- ============================================================================
-- DOGRULAMA (hepsi gecti)
--
-- ISLEME (nip_reserve_uyeleri_isle, sentetik 7 satir, geri sarildi):
--   sayac alinan=7 eklenen=2 baglanan=1 guncellenen=1 atlanan=3 (beklenen 7/2/1/1/3)
--   a) bagli musterinin kodu degisti ................. guncellendi
--   b) e-postasi eslesen bagsiz musteri .............. baglandi
--   c) yepyeni onayli uye ............................ eklendi (bronze, telefonlu)
--   d) yepyeni ama dondurulmus ....................... acilmadi
--   e) telefonu baskasinda olan yeni uye ............. eklendi, telefon NULL
--   f) bagli musterinin e-postasiyla baska profil .... KAPTIRILMADI, atlandi
--   g) bos e-posta ................................... atlandi
--
-- UCTAN UCA (canli, Order -> RESERVE):
--   ilk deneme: 403 "senkron sirri tanimli degil" — sirri yazan sorguyla test
--   blogu ayni islemdeydi, testin sonundaki raise sirri geri sardi. Sir
--   yeniden konuldu.
--   ikinci deneme: ok=t http=200 alinan=71 eklenen=0 baglanan=0 guncellenen=0
--   (hepsi Adim 3'te zaten bagliydi — dogru: idempotent, hicbir seye dokunmadi)
--
-- ZAMANLAMA: nip-reserve-uye-senkronu @ */10 * * * * — kayitli.
-- ============================================================================
