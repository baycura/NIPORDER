-- ============================================================================
-- REZERVASYON: BEKLEYEN BASVURU / TALEP BILDIRIMI                2026-10-24
-- ============================================================================
-- 23.10 bulgusu: rezervasyon sitesinde 5 Eylul'den beri kaydolan 16 uye
-- "onay bekliyor"da kaldi; onaysiz uye sitede hicbir sey yapamiyor, musteri
-- "uygulama calismiyor" dedi. 22 Agustos'tan beri rezervasyon yoktu.
-- Sahip: "bana haber de dussun."
--
-- Nasil: her 10 dakikada (senkrondan 5 dk sonra) Order, RESERVE'deki
-- nip_bekleyenleri_ver ucundan son 3 gunun bekleyen uyelerini ve rezervasyon
-- taleplerini ceker (ayni sir: Vault reserve_sync_sir). Daha once
-- bildirilmemis her kayit icin Telegram'a bagli yoneticilere mesaj gider
-- (nip_tg_gonder; kuyruk + tekrar). Bildirilenler nip_reserve_bildirilen'e
-- yazilir; ayni kayit iki kez gitmez.
--
-- RESERVE tarafi: ../reserve_migrations/20261024_bekleyenleri_ver.sql
-- Hicbir nesne silinmez.
-- ============================================================================

create table if not exists public.nip_reserve_bildirilen (
  tur    text not null check (tur in ('uye', 'rez')),
  kimlik uuid not null,
  zaman  timestamptz not null default now(),
  primary key (tur, kimlik)
);
comment on table public.nip_reserve_bildirilen is 'Rezervasyon sitesinden sahibe bildirilen bekleyen uye/talep kimlikleri (20261024).';
alter table public.nip_reserve_bildirilen enable row level security;
revoke all on public.nip_reserve_bildirilen from anon, authenticated, public;

create table if not exists public.nip_reserve_bildirim_log (
  id   bigint generated always as identity primary key,
  at   timestamptz not null default now(),
  ok   boolean not null,
  uye  integer not null default 0,
  rez  integer not null default 0,
  hata text
);
alter table public.nip_reserve_bildirim_log enable row level security;
revoke all on public.nip_reserve_bildirim_log from anon, authenticated, public;
grant select on public.nip_reserve_bildirim_log to authenticated;
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'nip_reserve_bildirim_log' and policyname = 'nip_reserve_bildirim_log_yonetici_okur') then
    create policy nip_reserve_bildirim_log_yonetici_okur on public.nip_reserve_bildirim_log for select to authenticated using (public.is_admin());
  end if;
end $$;

-- 1) Saf isleme: gelen JSON'dan yeni olanlari yazar. Ag yok; test edilebilir.
create or replace function public.nip_reserve_bekleyenleri_isle(p json)
returns table (uye int, rez int)
language plpgsql
security definer
set search_path to 'public'
as $$
declare r record; k record; v_metin text; v_uye int := 0; v_rez int := 0;
begin
  for r in
    select * from json_to_recordset(coalesce(p->'uyeler', '[]'::json))
      as x(id uuid, name text, email text, created_at timestamptz, kaynak text)
  loop
    if r.id is null or exists (select 1 from public.nip_reserve_bildirilen b where b.tur = 'uye' and b.kimlik = r.id) then continue; end if;
    v_metin := '🆕 Rezervasyon sitesine üyelik başvurusu' || E'\n'
            || coalesce(nullif(btrim(r.name), ''), 'İsimsiz') || coalesce(' · ' || nullif(btrim(r.email), ''), '') || E'\n'
            || 'Giriş: ' || coalesce(r.kaynak, 'site') || ' · ' || to_char(coalesce(r.created_at, now()) at time zone 'Europe/Istanbul', 'DD.MM HH24:MI') || E'\n'
            || 'Onaylamadan rezervasyon yapamaz. Onay: reservation.notinparis.me → Yönetici → Üyeler';
    for k in select sf.telegram_chat_id from public.staff sf where sf.is_active and sf.role = 'admin' and sf.telegram_chat_id is not null loop
      perform public.nip_tg_gonder(k.telegram_chat_id, v_metin, 'reserve_basvuru');
    end loop;
    insert into public.nip_reserve_bildirilen (tur, kimlik) values ('uye', r.id) on conflict do nothing;
    v_uye := v_uye + 1;
  end loop;

  for r in
    select * from json_to_recordset(coalesce(p->'rezervasyonlar', '[]'::json))
      as x(id uuid, name text, event_name text, event_date date, event_time text, guest_count int, created_at timestamptz)
  loop
    if r.id is null or exists (select 1 from public.nip_reserve_bildirilen b where b.tur = 'rez' and b.kimlik = r.id) then continue; end if;
    v_metin := '📅 Rezervasyon talebi' || E'\n'
            || coalesce(r.event_name, '?') || coalesce(' · ' || to_char(r.event_date, 'DD.MM'), '') || coalesce(' ' || nullif(r.event_time, ''), '') || E'\n'
            || coalesce(nullif(btrim(r.name), ''), 'İsimsiz') || ' · ' || coalesce(r.guest_count, 1) || ' kişi' || E'\n'
            || 'Onay: order.notinparis.me/reserve';
    for k in select sf.telegram_chat_id from public.staff sf where sf.is_active and sf.role = 'admin' and sf.telegram_chat_id is not null loop
      perform public.nip_tg_gonder(k.telegram_chat_id, v_metin, 'reserve_talep');
    end loop;
    insert into public.nip_reserve_bildirilen (tur, kimlik) values ('rez', r.id) on conflict do nothing;
    v_rez := v_rez + 1;
  end loop;

  uye := v_uye; rez := v_rez;
  return next;
end $$;
revoke all on function public.nip_reserve_bekleyenleri_isle(json) from public, anon, authenticated;

-- 2) Ag: RESERVE'den ceker, isler, loglar. nip_reserve_uyeleri_cek deseni.
create or replace function public.nip_reserve_bekleyen_kontrol()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_sir text;
  v_anon constant text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRpcXBhcmpydHZ2Znh2d3hlYm92Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5Mzc3OTMsImV4cCI6MjA4OTUxMzc5M30.pNI2yU6LDG8583HBPq-5puxkpEVEAYwhGp9ibJ1WBsI';
  v_url  constant text := 'https://diqparjrtvvfxvwxebov.supabase.co/rest/v1/rpc/nip_bekleyenleri_ver';
  v_status int; v_content text; v_s record;
begin
  if current_user in ('authenticated', 'anon') then
    raise exception 'dogrudan cagrilamaz';
  end if;

  select decrypted_secret into v_sir from vault.decrypted_secrets where name = 'reserve_sync_sir';
  if v_sir is null then
    insert into public.nip_reserve_bildirim_log (ok, hata) values (false, 'Vault''ta reserve_sync_sir yok');
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
    insert into public.nip_reserve_bildirim_log (ok, hata) values (false, 'ag: ' || sqlerrm);
    return;
  end;

  if v_status <> 200 then
    insert into public.nip_reserve_bildirim_log (ok, hata) values (false, v_status || ' ' || left(coalesce(v_content, ''), 300));
    return;
  end if;

  select * into v_s from public.nip_reserve_bekleyenleri_isle(v_content::json);
  insert into public.nip_reserve_bildirim_log (ok, uye, rez) values (true, v_s.uye, v_s.rez);
end $$;
revoke all on function public.nip_reserve_bekleyen_kontrol() from public, anon, authenticated;

do $c$
begin
  if not exists (select 1 from cron.job where jobname = 'nip-reserve-bekleyen-bildirim') then
    perform cron.schedule('nip-reserve-bekleyen-bildirim', '5-59/10 * * * *', 'select public.nip_reserve_bekleyen_kontrol()');
  end if;
end $c$;
