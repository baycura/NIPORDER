-- ============================================================================
-- REZERVASYON ONAYI -> MUSTERIYE BILDIRIM; UYELIK ONAYSIZ       20261110_reserve_onay_bildirimi
-- ============================================================================
-- Sahip (10.11): "Uyelik icin onayi kaldiralim ama rezervasyon icin onay
-- gereksin. Rezervasyon onaylandiktan sonra da karsiya bildirim gitmeli."
--
-- RESERVE tarafi: ../reserve_migrations/20261110_uyelik_onaysiz_rez_onayli.sql
-- (yeni uye dogrudan onayli; rezervasyonu yalniz yonetici onaylar;
-- nip_onaylananlari_ver ucu).
--
-- Bu dosya (Order):
--  1) nip_reserve_onay_bildirim: onaylanan her rezervasyon icin bir satir ve
--     e-posta durumu (bekliyor / gonderildi / eposta_yok / hata).
--  2) nip_reserve_onay_kontrol(): RESERVE'den son 30 gunun onaylananlarini
--     ceker (ayni sir: Vault reserve_sync_sir), yenileri yazar, gonderilecekleri
--     rez-bildirim edge fonksiyonuna yollar (pg_net). Cron: 10 dakikada bir.
--  3) nip_reserve_onay_simdi(): panel "Onayla"dan hemen sonra cagirir
--     (yalniz yonetici), beklemeden gitsin diye.
--  4) Uyelik onaysiz oldugu icin Telegram mesaji "basvuru" yerine "yeni uye"
--     (bilgi; islem gerekmez).
-- Kafe botuna, bot_config'e yazilmaz (webhook_secret yalniz okunur).
-- Hicbir nesne kaldirilmaz.
-- ============================================================================

create table if not exists public.nip_reserve_onay_bildirim (
  rez_id   uuid primary key,
  ad       text,
  eposta   text,
  telefon  text,
  dil      text,
  etkinlik text,
  tarih    date,
  saat     text,
  kisi     integer,
  qr_id    text,
  onay_at  timestamptz,
  durum    text not null default 'bekliyor' check (durum in ('bekliyor', 'gonderildi', 'eposta_yok', 'hata')),
  hata     text,
  deneme   integer not null default 0,
  ilk      timestamptz not null default now(),
  son      timestamptz
);
comment on table public.nip_reserve_onay_bildirim is
  'Onaylanan rezervasyonlar icin musteriye e-posta bildirimi durumu (20261110).';
alter table public.nip_reserve_onay_bildirim enable row level security;
revoke all on public.nip_reserve_onay_bildirim from anon, authenticated, public;
grant select on public.nip_reserve_onay_bildirim to authenticated;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'nip_reserve_onay_bildirim' and policyname = 'nip_reserve_onay_bildirim_yonetici_okur') then
    create policy nip_reserve_onay_bildirim_yonetici_okur on public.nip_reserve_onay_bildirim
      for select to authenticated using (public.nip_yonetici_mi());
  end if;
end $$;

-- 1) Saf isleme: gelen JSON'dan yeni onaylari yazar. Ag yok; test edilebilir.
create or replace function public.nip_reserve_onaylari_isle(p json)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare r record; n int := 0; v_eposta text;
begin
  for r in
    select * from json_to_recordset(coalesce(p, '[]'::json))
      as x(id uuid, name text, phone text, email text, lang text, event_name text, event_date date, event_time text, guest_count int, qr_id text, approved_at timestamptz)
  loop
    if r.id is null then continue; end if;
    v_eposta := nullif(lower(btrim(coalesce(r.email, ''))), '');
    insert into public.nip_reserve_onay_bildirim (rez_id, ad, eposta, telefon, dil, etkinlik, tarih, saat, kisi, qr_id, onay_at, durum)
    values (r.id, r.name, v_eposta, r.phone, coalesce(r.lang, 'tr'), r.event_name, r.event_date, nullif(r.event_time, ''),
            coalesce(r.guest_count, 1), r.qr_id, r.approved_at,
            case when v_eposta is null then 'eposta_yok' else 'bekliyor' end)
    on conflict (rez_id) do nothing;
    if found then n := n + 1; end if;
  end loop;
  return n;
end $$;
revoke all on function public.nip_reserve_onaylari_isle(json) from public, anon, authenticated;

-- 2) Gonderilecekleri edge fonksiyonuna yolla (pg_net, asenkron).
--    p_gecerli: RESERVE'de SU AN onayli olan rezervasyonlar; yalniz bunlara
--    gider (onay geri alindiysa e-posta gitmez). Deneme BURADA sayilir (en cok
--    3): fonksiyon cevap vermezse ya da sonucu yazamazsa sonsuz tekrar olmaz.
--    Ayni kayit 15 dakikadan once yeniden denenmez; anahtar eksikse saatte bir
--    (fonksiyon o durumda denemeyi geri verir). Es zamanli iki cagri ayni
--    satiri iki kez yollamasin diye satirlar kilitlenir.
create or replace function public.nip_reserve_onay_gonder(p_gecerli uuid[])
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare sec text; v_kayitlar jsonb; v_idler uuid[]; n int;
begin
  select value into sec from public.bot_config where key = 'webhook_secret';
  if sec is null then return 0; end if;

  if p_gecerli is null then return 0; end if;

  with secilen as (
    select b.rez_id from public.nip_reserve_onay_bildirim b
     where b.durum in ('bekliyor', 'hata') and b.eposta is not null and b.deneme < 3
       and b.rez_id = any(p_gecerli)
       and (b.tarih is null or b.tarih >= public.nip_business_day(now()) - 1)
       and (b.son is null or b.son < now() - case when b.hata in ('anahtar-yok', 'gonderici-yok') then interval '60 minutes' else interval '15 minutes' end)
     order by b.ilk limit 40
     for update skip locked
  ), isaretli as (
    update public.nip_reserve_onay_bildirim b set son = now(), deneme = b.deneme + 1
      from secilen s where b.rez_id = s.rez_id
    returning b.*
  )
  select jsonb_agg(jsonb_build_object('rez_id', i.rez_id, 'ad', i.ad, 'eposta', i.eposta, 'dil', i.dil, 'etkinlik', i.etkinlik,
                                      'tarih', i.tarih, 'saat', i.saat, 'kisi', i.kisi, 'qr_id', i.qr_id, 'deneme', i.deneme)),
         array_agg(i.rez_id)
    into v_kayitlar, v_idler
    from isaretli i;
  n := coalesce(array_length(v_idler, 1), 0);
  if n = 0 then return 0; end if;

  perform net.http_post(
    url := 'https://gbbxxcduuwdmvfayxzeg.supabase.co/functions/v1/rez-bildirim',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-nip-cron', sec),
    body := jsonb_build_object('kayitlar', v_kayitlar),
    timeout_milliseconds := 45000);
  return n;
exception when others then return 0;
end $$;
revoke all on function public.nip_reserve_onay_gonder(uuid[]) from public, anon, authenticated;

-- Ilk surumun arguman almayan hali veritabaninda duruyor (nesne kaldirilmaz):
-- gecerli liste olmadan hicbir sey yollamaz.
create or replace function public.nip_reserve_onay_gonder()
returns integer
language sql
security definer
set search_path to 'public'
as $$ select 0 $$;
revoke all on function public.nip_reserve_onay_gonder() from public, anon, authenticated;

-- 3) Ag: RESERVE'den ceker, isler, gonderir. nip_reserve_bekleyen_kontrol deseni.
create or replace function public.nip_reserve_onay_kontrol()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_sir text;
  v_anon constant text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRpcXBhcmpydHZ2Znh2d3hlYm92Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5Mzc3OTMsImV4cCI6MjA4OTUxMzc5M30.pNI2yU6LDG8583HBPq-5puxkpEVEAYwhGp9ibJ1WBsI';
  v_url  constant text := 'https://diqparjrtvvfxvwxebov.supabase.co/rest/v1/rpc/nip_onaylananlari_ver';
  v_status int; v_content text; v_yeni int := 0; v_gecerli uuid[];
begin
  select decrypted_secret into v_sir from vault.decrypted_secrets where name = 'reserve_sync_sir';
  if v_sir is null then
    insert into public.nip_reserve_bildirim_log (ok, hata) values (false, 'onay: Vault''ta reserve_sync_sir yok');
    return 0;
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
    insert into public.nip_reserve_bildirim_log (ok, hata) values (false, 'onay ag: ' || sqlerrm);
    return 0;
  end;

  if v_status <> 200 then
    insert into public.nip_reserve_bildirim_log (ok, hata) values (false, 'onay ' || v_status || ' ' || left(coalesce(v_content, ''), 300));
    return 0;
  end if;

  v_yeni := public.nip_reserve_onaylari_isle(v_content::json);
  -- RESERVE'de su an onayli olanlar: yalniz bunlara e-posta gider
  select coalesce(array_agg(x.id), '{}'::uuid[]) into v_gecerli
    from json_to_recordset(v_content::json) as x(id uuid) where x.id is not null;
  -- Onayi geri alinan (reddedildi, giris yapti, gelmedi) ve sirada bekleyen kayit kapanir
  update public.nip_reserve_onay_bildirim b
     set durum = 'hata', hata = 'onay-kalkti', deneme = 3, son = now()
   where b.durum in ('bekliyor', 'hata') and b.deneme < 3 and not (b.rez_id = any(v_gecerli));
  -- Uc gonderimde de fonksiyondan yanit gelmediyse (acilis hatasi, zaman asimi)
  -- kayit "sirada" diye kalmasin: panel "gonderilemedi — WhatsApp'tan haber ver" der.
  update public.nip_reserve_onay_bildirim b
     set durum = 'hata', hata = 'cevap-yok'
   where b.durum = 'bekliyor' and b.deneme >= 3 and b.son < now() - interval '15 minutes';
  perform public.nip_reserve_onay_gonder(v_gecerli);
  return v_yeni;
end $$;
revoke all on function public.nip_reserve_onay_kontrol() from public, anon, authenticated;

-- 4) Panel: "Onayla"dan hemen sonra. Yalniz yonetici.
create or replace function public.nip_reserve_onay_simdi()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.nip_yonetici_mi() then raise exception 'rezervasyon bildirimi: yalniz yonetici'; end if;
  return public.nip_reserve_onay_kontrol();
end $$;
revoke all on function public.nip_reserve_onay_simdi() from public, anon;
grant execute on function public.nip_reserve_onay_simdi() to authenticated;

do $c$
begin
  if not exists (select 1 from cron.job where jobname = 'nip-reserve-onay-bildirim') then
    perform cron.schedule('nip-reserve-onay-bildirim', '7-59/10 * * * *', 'select public.nip_reserve_onay_kontrol()');
  end if;
end $c$;

-- ----------------------------------------------------------------------------
-- 5) Telegram: uyelik onaysiz -> "yeni uye" bilgisi (islem gerekmez).
--    Rezervasyon talebi mesaji ayni; onay sonrasi musteriye e-posta gider.
-- ----------------------------------------------------------------------------
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
      as x(id uuid, name text, email text, created_at timestamptz, kaynak text, durum text)
  loop
    if r.id is null or exists (select 1 from public.nip_reserve_bildirilen b where b.tur = 'uye' and b.kimlik = r.id) then continue; end if;
    v_metin := '🆕 Rezervasyon sitesine yeni üye' || E'\n'
            || coalesce(nullif(btrim(r.name), ''), 'İsimsiz') || coalesce(' · ' || nullif(btrim(r.email), ''), '') || E'\n'
            || 'Giriş: ' || coalesce(r.kaynak, 'site') || ' · ' || to_char(coalesce(r.created_at, now()) at time zone 'Europe/Istanbul', 'DD.MM HH24:MI') || E'\n'
            || 'Üyelik hemen açıldı; işlem gerekmez.';
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
            || 'Onay: order.notinparis.me/reserve (onaylayınca müşteriye e-posta gider)';
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
