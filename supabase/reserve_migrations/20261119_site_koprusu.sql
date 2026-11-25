-- ============================================================================
-- WEB SITESI KOPRUSU (RESERVE)                            20261119_site_koprusu
-- ============================================================================
-- Sahip (12.11.2026): rezervasyon yonetimi Order'in icine tasiniyor.
-- Sahip (18.11.2026): "Kopru kur, site ayni kalsin."
--
-- Bu veritabani (RESERVE) web sitesinin (notinparis.me, Shopify temasi) ve
-- rezervasyon sitesinin arka ucu olmaya DEVAM eder: uye girisi, parti listesi,
-- siteden rezervasyon, bisiklet ve surus panolari, basvurular. Gecisten sonra
-- degisen tek sey: partileri ve rezervasyon durumunu ORDER yonetir.
--
--   Order -> RESERVE : parti listesi (nip_order_etkinlik_yaz), rezervasyon
--                      durumu (nip_order_rez_durum_yaz). Site bunlari okur.
--   RESERVE -> Order : siteden gelen yeni talepler. Order mevcut ucla ceker
--                      (nip_gecis_verisi); bu dosyada yeni bir sey yok.
--
-- GECIS ISARETI (nip_gecis.tasindi) kapaliyken bu dosya HICBIR davranisi
-- degistirmez: korumalar gecer, parti yazma ucu "tasinmadi" der. Isareti gecis
-- aninda Order acar (nip_order_gecis_yaz), geri donuste kapatir.
--
-- Isaret acikken:
--   * Rezervasyon DURUMUNU (onay, red, giris, gelmedi) tarayici oturumu
--     degistiremez; rezervasyon sitesinin yonetim paneli ve gecisten once acik
--     kalmis Order paneli hata alir ("Order paneline tasindi"). Uye yeni talep
--     acabilir, kendi notunu duzeltebilir (bugunku gibi).
--   * Parti bilgisini tarayici oturumu degistiremez ve yeni parti acamaz;
--     AFIS sutunlari serbesttir (afis hala buradan yuklenir).
--   * Parti SATIRI buradan kaldirilamaz (afis yalniz burada durur; satir
--     giderse kopru partiyi afissiz geri yazardi). Son 10 gunun ve gelecegin
--     partileri bir kilit satiriyla tutulur (nip_gecis_parti_kilidi). Parti
--     Order panelinden kaldirilir; burada durumu 'cancelled' olur. 10 gunden
--     eski parti serbesttir (gece arsivi 14 gunden eskiyi tasir).
--   * Kopru uclari ve SQL oturumu / zamanlanmis is (arsiv) baska yonden
--     etkilenmez.
--
-- Yalniz EKLEME; tekrar calistirilabilir. Hicbir nesne ya da satir kaldirilmaz.
-- Geri donus yalniz ORDER'dan yapilir: select public.nip_rez_gecis_yap(false);
-- (son durumlari yollar, anahtari kapatir, sonra bu isareti kapatir).
-- nip_order_gecis_yaz('<sir>', false) TEK BASINA geri donus DEGILDIR: Order
-- anahtari acikken kopru isareti 5 dakika icinde yeniden acar ve Order'daki
-- durumu buraya yazar. Yalniz Order anahtari KAPALI oldugu halde isaret acik
-- kalmissa (zorla geri donus: nip_rez_gecis_yap(false, true) yanitinda "uyari")
-- burada, SQL oturumunda elle kullanilir:
--   select public.nip_order_gecis_yaz((select decrypted_secret
--     from vault.decrypted_secrets where name = 'order_sync_sir'), false);
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0) GECIS ISARETI (tek satir; yalniz kopru ve SQL oturumu yazar)
-- ----------------------------------------------------------------------------
create table if not exists public.nip_gecis (
  tek     boolean primary key default true check (tek),
  tasindi boolean not null default false,
  degisti timestamptz not null default now()
);
comment on table public.nip_gecis is
  'Rezervasyon yonetimi Order''a tasindi mi (tek satir). true: parti ve rezervasyon durumunu yalniz Order koprusu yazar (20261119).';
alter table public.nip_gecis enable row level security;
revoke all on public.nip_gecis from anon, authenticated, public;
insert into public.nip_gecis (tek) values (true) on conflict (tek) do nothing;

create or replace function public.nip_tasindi_mi()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce((select g.tasindi from public.nip_gecis g where g.tek), false);
$$;
revoke all on function public.nip_tasindi_mi() from public;
grant execute on function public.nip_tasindi_mi() to anon, authenticated, service_role;

-- Bu islem bir kopru cagrisi mi? Kopru uclari sirri dogruladiktan sonra islem
-- icinde 'nip.kopru' isaretini koyar, isi bitince kaldirir (isaret ayni
-- islemdeki baska bir ifadeye tasmasin). Tarayici bu isareti koyamaz (PostgREST
-- yalniz public semasindaki fonksiyonlari cagirtir; set_config orada degil).
create or replace function public.nip_kopru_mu()
returns boolean
language sql
stable
set search_path to 'public'
as $$
  select coalesce(current_setting('nip.kopru', true), '') = '1';
$$;

-- Istek bir tarayici oturumundan mi geliyor (anon / giris yapmis kullanici)?
-- SQL oturumu ve zamanlanmis iste istek rolu yoktur.
create or replace function public.nip_tarayici_mi()
returns boolean
language sql
stable
set search_path to 'public'
as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') in ('anon', 'authenticated');
$$;

-- ----------------------------------------------------------------------------
-- 1) YETKI: kopru cagrisi "yetkili" sayilir.
--    nip_rez_koru yetkisiz yazmada durum alanlarini eski haline cevirir. Kopru
--    uclari PostgREST'ten anon anahtariyla cagrilir (istek rolu anon); isaret
--    olmasa Order'in yazdigi durum sessizce geri alinirdi. Tanim bir satir
--    disinda AYNI.
-- ----------------------------------------------------------------------------
create or replace function public.nip_yetkili_mi()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.nip_kopru_mu()
         or coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') not in ('anon', 'authenticated')
         or public.nip_is_admin();
$$;

-- ----------------------------------------------------------------------------
-- 2) KORUMA (yalniz gecis isareti acikken etkili)
-- ----------------------------------------------------------------------------
-- Rezervasyon: durum alanlarini tarayici oturumu degistiremez. Tetik adi
-- nip_rez_koru_trg'den SONRA calisir (ad sirasi): yetkisiz uyenin durum
-- degisikligi orada zaten geri alinmistir, buraya degismemis gelir.
create or replace function public.nip_rez_tasindi_koru()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if not public.nip_tasindi_mi() or public.nip_kopru_mu() or not public.nip_tarayici_mi() then
    return new;
  end if;
  if (new.status, new.approved_at, new.checked_in_at, new.no_show_at)
     is distinct from (old.status, old.approved_at, old.checked_in_at, old.no_show_at) then
    raise exception 'Rezervasyon yonetimi Order paneline tasindi. order.notinparis.me/reserve adresini kullan.'
      using errcode = 'P0001';
  end if;
  return new;
end $$;

do $t$
begin
  if not exists (select 1 from pg_trigger
                  where tgname = 'nip_rez_tasindi_koru_trg' and tgrelid = 'public.reservations'::regclass) then
    create trigger nip_rez_tasindi_koru_trg
      before update on public.reservations
      for each row execute function public.nip_rez_tasindi_koru();
  end if;
end $t$;

-- Parti: tarayici oturumu yeni parti acamaz, parti bilgisini degistiremez.
-- Afis sutunlari (poster_*) serbest.
create or replace function public.nip_etkinlik_tasindi_koru()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if not public.nip_tasindi_mi() or public.nip_kopru_mu() or not public.nip_tarayici_mi() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    raise exception 'Partiler artik Order panelinden acilir. order.notinparis.me/reserve adresini kullan.'
      using errcode = 'P0001';
  end if;
  if (new.name, new.subtitle, new.genre, new.date, new."time", new.time_end, new.end_time, new.capacity,
      new.approved_count, new.rules, new.rules_en, new.rules_ru, new.access_type, new.min_tier, new.min_trust,
      new.status, new.note, new.warmup_name, new.warmup_start, new.warmup_end, new.color)
     is distinct from
     (old.name, old.subtitle, old.genre, old.date, old."time", old.time_end, old.end_time, old.capacity,
      old.approved_count, old.rules, old.rules_en, old.rules_ru, old.access_type, old.min_tier, old.min_trust,
      old.status, old.note, old.warmup_name, old.warmup_start, old.warmup_end, old.color) then
    raise exception 'Parti bilgisi artik Order panelinden degisir (afis buradan yuklenir). order.notinparis.me/reserve'
      using errcode = 'P0001';
  end if;
  return new;
end $$;

do $t$
begin
  if not exists (select 1 from pg_trigger
                  where tgname = 'nip_etkinlik_tasindi_koru_trg' and tgrelid = 'public.events'::regclass) then
    create trigger nip_etkinlik_tasindi_koru_trg
      before insert or update on public.events
      for each row execute function public.nip_etkinlik_tasindi_koru();
  end if;
end $t$;

-- PARTI KILIDI: isaret acikken parti satiri kaldirilamaz. Kilit satiri partiye
-- yabanci anahtarla baglidir (varsayilan kural: bagli satir varken ana satir
-- kaldirilamaz). Yonetici eski panelde "kaldir" derse veritabani reddeder;
-- hata metninde kisitin adi gorunur: parti_order_panelinden_kaldirilir.
-- Kilit satiri hic kaldirilmaz; birakilirken event_id bosaltilir.
create table if not exists public.nip_gecis_parti_kilidi (
  id       bigint generated always as identity primary key,
  event_id uuid,
  constraint nip_gecis_parti_kilidi_tek unique (event_id),
  constraint parti_order_panelinden_kaldirilir foreign key (event_id) references public.events (id)
);
comment on table public.nip_gecis_parti_kilidi is
  'Gecis isareti acikken parti satirini tutan kilit (son 10 gun + gelecek). Parti Order panelinden kaldirilir (20261119).';
alter table public.nip_gecis_parti_kilidi enable row level security;
revoke all on public.nip_gecis_parti_kilidi from anon, authenticated, public;

-- Kilitleri gunceller: isaret acik -> son 10 gunun ve gelecegin partileri
-- kilitli, daha eskisi serbest (gece arsivi takilmasin). Isaret kapali ->
-- hepsi serbest. Yalniz kopru uclari cagirir.
create or replace function public.nip_gecis_kilit_guncelle()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_n integer := 0;
begin
  if not public.nip_tasindi_mi() then
    update public.nip_gecis_parti_kilidi k set event_id = null where k.event_id is not null;
    return 0;
  end if;
  update public.nip_gecis_parti_kilidi k set event_id = null
   where k.event_id is not null
     and not exists (select 1 from public.events e where e.id = k.event_id and e.date >= current_date - 10);
  insert into public.nip_gecis_parti_kilidi (event_id)
  select e.id from public.events e
   where e.date >= current_date - 10
     and not exists (select 1 from public.nip_gecis_parti_kilidi k where k.event_id = e.id)
  on conflict (event_id) do nothing;
  select count(*) into v_n from public.nip_gecis_parti_kilidi k where k.event_id is not null;
  return v_n;
end $$;
revoke all on function public.nip_gecis_kilit_guncelle() from public, anon, authenticated;

-- Kilitler kopru cagrisindan BAGIMSIZ da her gece tazelenir (gece arsivinden
-- 10 dakika once). Kopru gunlerce calismazsa eskiyen partinin kilidi kalir,
-- arsiv isi yabanci anahtara takilirdi (inceleme 20.11). Isaret kapaliyken
-- butun kilitleri birakir.
do $z$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('nip-gecis-kilit', '50 0 * * *', 'select public.nip_gecis_kilit_guncelle()');
  end if;
end $z$;

-- ----------------------------------------------------------------------------
-- 3) KOPRU UCLARI. Cagiran Order; kendini Vault'taki order_sync_sir ile tanitir
--    (diger uclarla ayni: nip_order_sir_dogru). Sir tutmazsa hata.
-- ----------------------------------------------------------------------------

-- Gecis isaretini acar / kapatir.
create or replace function public.nip_order_gecis_yaz(p_sir text, p_tasindi boolean)
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.nip_order_sir_dogru(p_sir) then
    raise exception 'yetkisiz' using errcode = '28000';
  end if;
  update public.nip_gecis set tasindi = coalesce(p_tasindi, false), degisti = now()
   where tek and tasindi is distinct from coalesce(p_tasindi, false);
  perform public.nip_gecis_kilit_guncelle();
  return json_build_object('ok', true, 'tasindi', public.nip_tasindi_mi());
end $$;

-- PARTI LISTESI: Order'daki partiler buraya yazilir; web sitesi ve rezervasyon
-- sitesi listeyi buradan okumaya devam eder.
--   p_etkinlikler : yazilacak partiler (Order yakin gecmisi ve gelecegi yollar)
--   p_kimlikler   : Order'daki BUTUN parti kimlikleri. Buradaki gelecek tarihli
--                   aktif bir parti bu listede yoksa Order'da kaldirilmistir:
--                   durumu 'cancelled' olur (site yalniz 'active' gosterir).
--                   Satir KALDIRILMAZ. Liste bossa bu adim atlanir (yanlislikla
--                   bos liste gelirse butun partiler kapanmasin).
-- Afis sutunlarina (poster_*) ve min_tier / min_trust'a dokunulmaz.
-- Order yalniz 'open' / 'members_only' erisim turunu ve 'active' / 'cancelled' /
-- 'archived' durumunu tanir; gecis kopyasi baska degeri bunlara indirger.
-- Buradaki satir Order'in tanimadigi bir degerdeyse (ornek: 'tier_restricted')
-- ve Order indirgenmis karsiligini yolluyorsa buradaki deger KORUNUR.
-- Gecis isareti kapaliyken hicbir sey yazmaz.
create or replace function public.nip_order_etkinlik_yaz(p_sir text, p_etkinlikler json, p_kimlikler uuid[])
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_yazilan int := 0;
  v_kapanan int := 0;
begin
  if not public.nip_order_sir_dogru(p_sir) then
    raise exception 'yetkisiz' using errcode = '28000';
  end if;
  if not public.nip_tasindi_mi() then
    return json_build_object('ok', false, 'hata', 'tasinmadi');
  end if;
  perform set_config('nip.kopru', '1', true);

  insert into public.events as e (id, name, subtitle, genre, date, "time", time_end, end_time, capacity, approved_count,
                                  rules, rules_en, rules_ru, access_type, status, note,
                                  warmup_name, warmup_start, warmup_end, color)
  select x.id, x.name, x.subtitle, x.genre, x.date, coalesce(x."time", ''), x.time_end, coalesce(nullif(x.time_end, ''), '02:00'),
         greatest(1, coalesce(x.capacity, 100)), greatest(0, coalesce(x.approved_count, 0)),
         x.rules, x.rules_en, x.rules_ru,
         case when coalesce(x.access_type, 'open') = 'members_only'
                   and m.access_type is not null and m.access_type not in ('open', 'members_only')
              then m.access_type else coalesce(x.access_type, 'open') end,
         case when coalesce(x.status, 'active') = 'archived'
                   and m.status is not null and m.status not in ('active', 'cancelled', 'archived')
              then m.status else coalesce(x.status, 'active') end,
         x.note, x.warmup_name, x.warmup_start, x.warmup_end, x.color
    from json_to_recordset(coalesce(p_etkinlikler, '[]'::json)) as x(
      id uuid, name text, subtitle text, genre text, date date, "time" text, time_end text, capacity int,
      approved_count int, rules text, rules_en text, rules_ru text, access_type text, status text, note text,
      warmup_name text, warmup_start text, warmup_end text, color text)
    left join public.events m on m.id = x.id
   where x.id is not null and x.name is not null and x.date is not null
  on conflict (id) do update
     set name = excluded.name, subtitle = excluded.subtitle, genre = excluded.genre, date = excluded.date,
         "time" = excluded."time", time_end = excluded.time_end, end_time = excluded.end_time,
         capacity = excluded.capacity, approved_count = excluded.approved_count, rules = excluded.rules,
         rules_en = excluded.rules_en, rules_ru = excluded.rules_ru, access_type = excluded.access_type,
         status = excluded.status, note = excluded.note, warmup_name = excluded.warmup_name,
         warmup_start = excluded.warmup_start, warmup_end = excluded.warmup_end, color = excluded.color
   where (e.name, e.subtitle, e.genre, e.date, e."time", e.time_end, e.end_time, e.capacity, e.approved_count, e.rules,
          e.rules_en, e.rules_ru, e.access_type, e.status, e.note, e.warmup_name, e.warmup_start, e.warmup_end, e.color)
         is distinct from
         (excluded.name, excluded.subtitle, excluded.genre, excluded.date, excluded."time", excluded.time_end,
          excluded.end_time, excluded.capacity, excluded.approved_count, excluded.rules, excluded.rules_en,
          excluded.rules_ru, excluded.access_type, excluded.status, excluded.note, excluded.warmup_name,
          excluded.warmup_start, excluded.warmup_end, excluded.color);
  get diagnostics v_yazilan = row_count;

  if coalesce(cardinality(p_kimlikler), 0) > 0 then
    update public.events e set status = 'cancelled'
     where e.status = 'active' and e.date >= current_date and not (e.id = any(p_kimlikler));
    get diagnostics v_kapanan = row_count;
  end if;

  perform public.nip_gecis_kilit_guncelle();
  perform set_config('nip.kopru', '', true);

  return json_build_object('ok', true, 'yazilan', v_yazilan, 'kapanan', v_kapanan);
end $$;

-- REZERVASYON DURUMU: Order'da verilen karar (onay, red, giris, gelmedi) buradaki
-- ayni kayda yazilir; uye web sitesindeki "rezervasyonlarim"da dogru durumu
-- gorur. Bu veritabani 'no_show' ve 'cancelled' durumlarini tanimaz
-- (reservations_status_check); Order sunlari yollar:
--   gelmedi -> status 'approved' + no_show_at dolu,  iptal -> status 'rejected'.
-- Burada olmayan kayit atlanir (menuden acilmis talepler yalniz Order'dadir).
-- Guven puani, seviye, seri YAZILMAZ (sahip karari 12.11.2026).
-- Gecis isareti kapaliyken hicbir sey yazmaz.
create or replace function public.nip_order_rez_durum_yaz(p_sir text, p_durumlar json)
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_yazilan int := 0;
begin
  if not public.nip_order_sir_dogru(p_sir) then
    raise exception 'yetkisiz' using errcode = '28000';
  end if;
  if not public.nip_tasindi_mi() then
    return json_build_object('ok', false, 'hata', 'tasinmadi');
  end if;
  perform set_config('nip.kopru', '1', true);

  update public.reservations r
     set status = x.status, approved_at = x.approved_at, checked_in_at = x.checked_in_at, no_show_at = x.no_show_at
    from json_to_recordset(coalesce(p_durumlar, '[]'::json)) as x(
      id uuid, status text, approved_at timestamptz, checked_in_at timestamptz, no_show_at timestamptz)
   where r.id = x.id
     and x.status in ('pending', 'approved', 'rejected', 'used')
     and not (x.status = 'used' and x.no_show_at is not null)
     and (r.status, r.approved_at, r.checked_in_at, r.no_show_at)
         is distinct from (x.status, x.approved_at, x.checked_in_at, x.no_show_at);
  get diagnostics v_yazilan = row_count;
  perform set_config('nip.kopru', '', true);

  return json_build_object('ok', true, 'yazilan', v_yazilan);
end $$;

revoke all on function public.nip_order_gecis_yaz(text, boolean) from public;
grant execute on function public.nip_order_gecis_yaz(text, boolean) to anon, authenticated;
revoke all on function public.nip_order_etkinlik_yaz(text, json, uuid[]) from public;
grant execute on function public.nip_order_etkinlik_yaz(text, json, uuid[]) to anon, authenticated;
revoke all on function public.nip_order_rez_durum_yaz(text, json) from public;
grant execute on function public.nip_order_rez_durum_yaz(text, json) to anon, authenticated;
revoke all on function public.nip_rez_tasindi_koru() from public, anon, authenticated;
revoke all on function public.nip_etkinlik_tasindi_koru() from public, anon, authenticated;
