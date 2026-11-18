-- ============================================================================
-- WEB SITESI KOPRUSU (ORDER)                              20261119_site_koprusu
-- ============================================================================
-- Sahip (17.11.2026): "Hali hazirda olan partileri de tasi. Web sitesiyle
-- entegre partiler oldugunu unutma."  Sahip (18.11.2026): "Kopru kur, site
-- ayni kalsin."
--
-- Web sitesi (notinparis.me, Shopify temasi) ve rezervasyon sitesi parti
-- listesini ve siteden yapilan rezervasyonu DOGRUDAN eski rezervasyon
-- veritabanindan (RESERVE) okuyup yaziyor; uye girisi de orada. Gecisten sonra
-- partileri ve rezervasyonlari Order yonetir, site DEGISMEZ. Bu dosya ikisini
-- bagli tutan kopruyu ekler:
--
--   Order -> RESERVE  parti listesi      (5 dakikada bir + panelde kaydedince)
--   Order -> RESERVE  rezervasyon durumu (5 dakikada bir)
--   RESERVE -> Order  siteden gelen yeni talepler (5 dakikada bir; mevcut
--                     kopya fonksiyonu anahtar acikken yalniz eksik
--                     rezervasyonu ekler)
--
-- Anahtar (nip_rez_ayar.yerel) KAPALIYKEN kopru hicbir sey yapmaz: zamanlanmis
-- is hemen doner, RESERVE tarafindaki uclar "tasinmadi" der. Bugunku akis
-- degismez.
--
-- GECIS tek cagridir (yalniz SQL oturumu):
--     select public.nip_rez_gecis_yap(true);     -- gec
--     select public.nip_rez_gecis_yap(false);    -- geri don
-- Sirasi: son veri kopyasi -> anahtar acilir -> RESERVE'de gecis isareti acilir
-- -> parti listesi ve durumlar yollanir. Herhangi bir adim hata verirse islem
-- geri sarilir ve anahtar kapali kalir. Kopya ile anahtarin acilmasi arasinda
-- kopru yolundan gelen talep kaybolmaz: bir sonraki 5 dakikalik turda cekilir.
--
-- Yalniz EKLEME; tekrar calistirilabilir. Hicbir nesne ya da satir kaldirilmaz.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) RESERVE'deki kopru uclarini cagiran yardimci (yalniz izinli uc adlari)
-- ----------------------------------------------------------------------------
create or replace function public.nip_rez_site_cagir(p_fn text, p_arg json)
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_sir text;
  v_anon constant text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRpcXBhcmpydHZ2Znh2d3hlYm92Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5Mzc3OTMsImV4cCI6MjA4OTUxMzc5M30.pNI2yU6LDG8583HBPq-5puxkpEVEAYwhGp9ibJ1WBsI';
  v_status int; v_content text;
begin
  if p_fn not in ('nip_order_gecis_yaz', 'nip_order_etkinlik_yaz', 'nip_order_rez_durum_yaz') then
    return json_build_object('ok', false, 'hata', 'izinsiz-uc');
  end if;
  select decrypted_secret into v_sir from vault.decrypted_secrets where name = 'reserve_sync_sir';
  if v_sir is null then return json_build_object('ok', false, 'hata', 'sir-yok'); end if;
  begin
    perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '15000');
    select status, content into v_status, v_content
      from extensions.http((
        'POST', 'https://diqparjrtvvfxvwxebov.supabase.co/rest/v1/rpc/' || p_fn,
        array[extensions.http_header('apikey', v_anon),
              extensions.http_header('Authorization', 'Bearer ' || v_anon)],
        'application/json',
        (coalesce(p_arg::jsonb, '{}'::jsonb) || jsonb_build_object('p_sir', v_sir))::text
      )::extensions.http_request);
  exception when others then
    return json_build_object('ok', false, 'hata', 'ag', 'ayrinti', left(sqlerrm, 200));
  end;
  if v_status <> 200 then
    return json_build_object('ok', false, 'hata', 'yanit', 'durum', v_status, 'ayrinti', left(coalesce(v_content, ''), 200));
  end if;
  return v_content::json;
exception when others then
  return json_build_object('ok', false, 'hata', 'beklenmedik', 'ayrinti', left(sqlerrm, 200));
end $$;
revoke all on function public.nip_rez_site_cagir(text, json) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2) PARTI LISTESI -> RESERVE
--    Yakin gecmis (7 gun) ve gelecek partiler yazilir; daha eskisi RESERVE'de
--    her gece arsive gider (14 gun), yollanirsa geri gelirdi. Butun parti
--    kimlikleri ayrica yollanir: Order'da kaldirilan gelecek parti sitede
--    kapanir (durum 'cancelled'; satir kalir).
-- ----------------------------------------------------------------------------
create or replace function public.nip_rez_site_etkinlik_gonder()
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_bugun date := (now() at time zone 'Europe/Istanbul')::date;
  v_liste json;
  v_kimlik uuid[];
begin
  select coalesce(json_agg(json_build_object(
           'id', e.id, 'name', e.name, 'subtitle', e.subtitle, 'genre', e.genre, 'date', e.date,
           'time', coalesce(e."time", ''), 'time_end', e.time_end, 'capacity', e.capacity,
           'approved_count', e.approved_count, 'rules', e.rules, 'rules_en', e.rules_en, 'rules_ru', e.rules_ru,
           'access_type', e.access_type, 'status', e.status, 'note', e.note,
           'warmup_name', e.warmup_name, 'warmup_start', e.warmup_start, 'warmup_end', e.warmup_end,
           'color', e.color) order by e.date), '[]'::json)
    into v_liste
    from public.events e
   where e.date >= v_bugun - 7;
  select coalesce(array_agg(e.id), '{}'::uuid[]) into v_kimlik from public.events e;
  return public.nip_rez_site_cagir('nip_order_etkinlik_yaz',
           json_build_object('p_etkinlikler', v_liste, 'p_kimlikler', v_kimlik));
end $$;
revoke all on function public.nip_rez_site_etkinlik_gonder() from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3) REZERVASYON DURUMU -> RESERVE
--    Son 30 gunun ve gelecegin butun rezervasyonlari yollanir; RESERVE yalniz
--    kendinde olan kimlikleri (siteden gelen ya da gecisten once kopyalanan)
--    gunceller, digerlerini atlar. RESERVE 'no_show' ve 'cancelled' durumlarini
--    tanimaz: gelmedi -> 'approved' + no_show_at, iptal -> 'rejected'.
-- ----------------------------------------------------------------------------
create or replace function public.nip_rez_site_durum_gonder()
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_bugun date := (now() at time zone 'Europe/Istanbul')::date;
  v_liste json;
begin
  select coalesce(json_agg(json_build_object(
           'id', r.id,
           'status', case r.status when 'no_show' then 'approved' when 'cancelled' then 'rejected' else r.status end,
           'approved_at', r.approved_at,
           'checked_in_at', case when r.status = 'used' then r.checked_in_at end,
           'no_show_at', case when r.status = 'no_show' then coalesce(r.no_show_at, now()) end)), '[]'::json)
    into v_liste
    from public.reservations r
   where r.event_date is null or r.event_date >= v_bugun - 30;
  return public.nip_rez_site_cagir('nip_order_rez_durum_yaz', json_build_object('p_durumlar', v_liste));
end $$;
revoke all on function public.nip_rez_site_durum_gonder() from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4) ZAMANLANMIS TUR (5 dakikada bir). Anahtar kapaliyken hemen doner.
--    Basarisizlik nip_reserve_bildirim_log'a yazilir (mevcut izleme); basarili
--    tur kayit birakmaz (gunde 288 satir olmasin).
-- ----------------------------------------------------------------------------
create or replace function public.nip_rez_site_esitle()
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_k json; v_e json; v_d json;
  v_hata text := '';
begin
  -- Yalniz zamanlanmis is / SQL oturumu (istek rolu yok).
  if coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') <> '' then
    raise exception 'dogrudan cagrilamaz' using errcode = '42501';
  end if;
  if not public.nip_rez_yerel_mi() then
    return json_build_object('ok', true, 'atlandi', 'anahtar-kapali');
  end if;
  -- RESERVE yok (rezervasyon sitesi olmayan isletme): kopru da yok.
  if not exists (select 1 from vault.decrypted_secrets where name = 'reserve_sync_sir') then
    return json_build_object('ok', true, 'atlandi', 'reserve-yok');
  end if;

  v_k := public.nip_rez_gecis_kopyala(true, true);          -- siteden gelen yeni talepler
  v_e := public.nip_rez_site_etkinlik_gonder();       -- parti listesi
  v_d := public.nip_rez_site_durum_gonder();          -- rezervasyon durumlari

  if coalesce(v_k->>'ok', '') <> 'true' then v_hata := v_hata || ' cekme: ' || coalesce(v_k->>'hata', '?') || ' ' || coalesce(v_k->>'ayrinti', ''); end if;
  if coalesce(v_e->>'ok', '') <> 'true' then v_hata := v_hata || ' parti: ' || coalesce(v_e->>'hata', '?') || ' ' || coalesce(v_e->>'ayrinti', ''); end if;
  if coalesce(v_d->>'ok', '') <> 'true' then v_hata := v_hata || ' durum: ' || coalesce(v_d->>'hata', '?') || ' ' || coalesce(v_d->>'ayrinti', ''); end if;
  if v_hata <> '' then
    insert into public.nip_reserve_bildirim_log (ok, hata) values (false, left('site koprusu:' || v_hata, 400));
  end if;

  return json_build_object('ok', v_hata = '',
    'gelen_rezervasyon', coalesce((v_k->>'rezervasyon_yazilan')::int, 0),
    'parti_yazilan', coalesce((v_e->>'yazilan')::int, 0), 'parti_kapanan', coalesce((v_e->>'kapanan')::int, 0),
    'durum_yazilan', coalesce((v_d->>'yazilan')::int, 0), 'hata', nullif(v_hata, ''));
end $$;
revoke all on function public.nip_rez_site_esitle() from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 5) PANEL: parti kaydedilince / kaldirilinca liste siteye hemen yollanir
--    (5 dakikayi beklemeden). Yalniz yonetici; anahtar kapaliyken bir sey yapmaz.
-- ----------------------------------------------------------------------------
create or replace function public.nip_rez_site_simdi()
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_e json;
begin
  if not public.nip_yonetici_mi() then
    raise exception 'site koprusu: yalniz yonetici' using errcode = '42501';
  end if;
  if not public.nip_rez_yerel_mi() then
    return json_build_object('ok', true, 'atlandi', 'anahtar-kapali');
  end if;
  if not exists (select 1 from vault.decrypted_secrets where name = 'reserve_sync_sir') then
    return json_build_object('ok', true, 'atlandi', 'reserve-yok');
  end if;
  v_e := public.nip_rez_site_etkinlik_gonder();
  return json_build_object('ok', coalesce(v_e->>'ok', '') = 'true',
    'parti_yazilan', coalesce((v_e->>'yazilan')::int, 0), 'parti_kapanan', coalesce((v_e->>'kapanan')::int, 0),
    'hata', v_e->>'hata');
end $$;
revoke all on function public.nip_rez_site_simdi() from public, anon;
grant execute on function public.nip_rez_site_simdi() to authenticated;

-- ----------------------------------------------------------------------------
-- 6) "YENI UYE / YENI TALEP" TELEGRAM BILDIRIMI
--    Anahtar acikken kontrol yalniz yerel talepleri yolluyordu; web sitesine
--    yeni uye olanlarin bildirimi kesilirdi (uyelik RESERVE'de kaliyor). Artik
--    yerel kontrolden SONRA RESERVE'ye de bakilir: yeni uyeler ve siteden gelip
--    henuz cekilmemis talepler bildirilir. Ayni kimlik iki kez bildirilmez
--    (nip_reserve_bekleyenleri_isle). RESERVE'si olmayan isletmede (kasada sir
--    yok) yerel kontrolle yetinilir. Govdenin geri kalani AYNI.
-- ----------------------------------------------------------------------------
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
  v_yerel boolean;
begin
  -- Yalniz zamanlanmis is / SQL oturumu. Eski denetim current_user'a
  -- bakiyordu; SECURITY DEFINER icinde o fonksiyon sahibidir ve denetim hic
  -- tutmuyordu. Istek rolune bakilir (calistirma yetkisi zaten kapali).
  if current_user in ('authenticated', 'anon')
     or coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') in ('anon', 'authenticated') then
    raise exception 'dogrudan cagrilamaz';
  end if;

  -- ANAHTAR (20261113): yerelde talepler bu veritabanindan okunur.
  v_yerel := public.nip_rez_yerel_mi();
  if v_yerel then
    perform public.nip_rez_yerel_bekleyen_kontrol();
  end if;

  select decrypted_secret into v_sir from vault.decrypted_secrets where name = 'reserve_sync_sir';
  if v_sir is null then
    -- Yerelde RESERVE'siz isletme olabilir: hata degil.
    if not v_yerel then
      insert into public.nip_reserve_bildirim_log (ok, hata) values (false, 'Vault''ta reserve_sync_sir yok');
    end if;
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

-- ----------------------------------------------------------------------------
-- 7) GECIS (tek cagri; yalniz SQL oturumu)
-- ----------------------------------------------------------------------------
create or replace function public.nip_rez_gecis_yap(p_ac boolean)
returns json
language plpgsql
security definer
set search_path to 'public'
set statement_timeout to '120s'
as $$
declare
  v_k json; v_g json; v_e json; v_d json;
begin
  if coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') <> '' then
    raise exception 'dogrudan cagrilamaz' using errcode = '42501';
  end if;

  if not coalesce(p_ac, false) then
    -- GERI DONUS: anahtar kapanir, RESERVE'de gecis isareti kapanir. Nesneler
    -- ve kopyalanan veri yerinde kalir. Yalniz ilk yerel talep / onaydan once
    -- kayipsizdir (20261113 basligindaki not).
    update public.nip_rez_ayar set yerel = false, durdu = false, degisti = now() where tek;
    v_g := public.nip_rez_site_cagir('nip_order_gecis_yaz', json_build_object('p_tasindi', false));
    if coalesce(v_g->>'ok', '') <> 'true' then
      raise exception 'geri donus: RESERVE gecis isareti kapatilamadi (%); hicbir sey degismedi', v_g;
    end if;
    return json_build_object('ok', true, 'yerel', false, 'reserve', v_g);
  end if;

  if public.nip_rez_yerel_mi() then
    return json_build_object('ok', true, 'zaten', true, 'yerel', true);
  end if;

  -- 1) Son veri kopyasi (anahtar kapaliyken: RESERVE ana kaynak)
  v_k := public.nip_rez_gecis_kopyala(true, true);
  if coalesce(v_k->>'ok', '') <> 'true' then
    raise exception 'gecis: veri kopyasi basarisiz (%); hicbir sey degismedi', v_k;
  end if;
  -- 2) Anahtar
  update public.nip_rez_ayar set yerel = true, durdu = false, degisti = now() where tek;
  -- 3) RESERVE'de gecis isareti. Basarisizsa islem geri sarilir (anahtar kapali kalir).
  v_g := public.nip_rez_site_cagir('nip_order_gecis_yaz', json_build_object('p_tasindi', true));
  if coalesce(v_g->>'ok', '') <> 'true' or coalesce(v_g->>'tasindi', '') <> 'true' then
    raise exception 'gecis: RESERVE gecis isareti acilamadi (%); hicbir sey degismedi', v_g;
  end if;
  -- 4) Parti listesi ve durumlar (basarisizlik gecisi bozmaz; 5 dakikalik tur yeniden dener)
  v_e := public.nip_rez_site_etkinlik_gonder();
  v_d := public.nip_rez_site_durum_gonder();

  return json_build_object('ok', true, 'yerel', true, 'kopya', v_k, 'reserve', v_g, 'parti', v_e, 'durum', v_d);
end $$;
revoke all on function public.nip_rez_gecis_yap(boolean) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 8) ZAMANLAMA: 5 dakikada bir. Anahtar kapaliyken tur hemen doner.
-- ----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('nip-rez-site-esitle', '3-59/5 * * * *', 'select public.nip_rez_site_esitle()');
  end if;
end $$;
