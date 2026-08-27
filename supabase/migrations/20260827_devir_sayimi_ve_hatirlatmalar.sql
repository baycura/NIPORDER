-- ============================================================================
-- VARDIYA DEVIR SAYIMI + GUNLUK TELEGRAM HATIRLATMALARI
--                                    20260827_devir_sayimi_ve_hatirlatmalar
-- ============================================================================
-- Sahibin istekleri (ayni gun, kendi sozleriyle):
--   1. "Her sabah dokuzda tum hesaplar girilsin sistem aktif kullanilsin
--      mesaji dukkan acilirken."
--   2. "Beste vardiya degisiyor — vardiya degisiminde de herkes kasayi
--      yapsin oyle teslim etsin."
--   3. "Kasa sayimi yapilip kasa kapansin mesaji kapaniste."
--   4. "Her yeni guncelleme geldiginde Telegram'dan butun calisanlara."
--
-- (2) icin sayim tablosuna TUR ayrimi gerekiyor: gunde TEK sayim kurali
-- kapanis icin dogruydu ama 17:00 devri + gece kapanisi = ayni gun iki mesru
-- sayim. Cozum: cash_counts.tur ('kapanis' | 'devir').
--
--   - 'kapanis': eski davranis birebir — gunde tek, acilis zincirini besler,
--     acik hesap varken gerekce ister, bekciyi susturur.
--   - 'devir': o anki cekmece fotografi. Beklenen ayni formulle hesaplanir
--     (o saate kadarki nakit zaten payments'ta olan kadardir, formul kendi-
--     liginden "su ana kadar" olur). Gunde birden cok olabilir (cifte vardiya
--     degisimi). ACILIS ZINCIRINE GIRMEZ, bekciyi SUSTURMAZ, acik hesap
--     kurali uygulanmaz (17:00'de servis suruyor, acik hesap normal).
--
-- Devirde "cekmeceden alinan" ekranda gizlenir ve 0 gider: gun ortasi bankaya
-- para goturme pratigi su an yok; olursa beklenen formulune devir withdrawn
-- dusumu eklenmeli (bilincli birakilmis dikis yeri).
--
-- Hatirlatmalar (hepsi TUM aktif+Telegram'li personele, admin degil):
--   09:00 TR  acilis    "her satis sisteme girilecek"
--   16:45 TR  devir     17:00 degisiminden once sayilsin diye 15 dk erken
--   23:30 TR  kapanis   yalniz o gunun kapanis sayimi HENUZ YOKSA
-- Bekci (admin'e giden "sayilmadi" raporu) 03:15'ten 04:30'a cekildi:
-- gec kapanista 03:00-04:30 arasi girilen sayim alarmdan once yetissin.
--
-- Geri alma:
--   select cron.unschedule('nip-acilis-hatirlatma');
--   select cron.unschedule('nip-devir-hatirlatma');
--   select cron.unschedule('nip-kapanis-hatirlatma');
--   drop function if exists public.nip_gunluk_hatirlatma(text);
--   drop function if exists public.nip_duyuru_gonder(text);
--   drop function if exists public.nip_toplu_telegram(text);
--   -- tur kolonu ve fonksiyon yamalari onceki migration'lardaki hale donmeli
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Sayim turu
-- ----------------------------------------------------------------------------
alter table public.cash_counts
  add column if not exists tur text not null default 'kapanis';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'cash_counts_tur_gecerli') then
    alter table public.cash_counts add constraint cash_counts_tur_gecerli
      check (tur in ('kapanis', 'devir'));
  end if;
end $$;

comment on column public.cash_counts.tur is
  'kapanis: gun sonu sayimi (gunde tek, acilis zincirini besler). '
  'devir: vardiya degisimi cekmece fotografi (gunde birden cok olabilir, '
  'zinciri beslemez, bekciyi susturmaz).';

-- TUZAK: "select cc.*" ile yaratilan view kolon listesini yaratildigi anda
-- DONDURUR — sonradan eklenen tur (ve vardiya_kisileri) view'da yoktu ve
-- cc.tur okuyan her sorgu patliyordu. Yeniden yaratilir.
create or replace view public.cash_counts_gecerli
with (security_invoker = on) as
  select cc.* from public.cash_counts cc
   where not exists (select 1 from public.cash_counts d where d.supersedes = cc.id);

-- ----------------------------------------------------------------------------
-- 1b) KASA GUNU — gec kapanis penceresi
--
-- Isletme gunu 03:00'te devrilir ama dukkan bazen 03:00'ten SONRA kapanir.
-- 03:05'te sayan kapanisci nip_business_day'e gore YENI gunun icindedir:
-- sayimi yeni gune yazilir, dunu secmesi "gecmis gun yalniz sahip" kuralina
-- takilir ve 03:15 bekcisi "dun sayilmadi" diye yanlis alarm verirdi
-- (adversarial inceleme bulgusu).
--
-- Cozum tek kavram: KASA GUNU. Saat 03:00-07:00 arasindaysa ve DUNUN kapanis
-- sayimi henuz yoksa kasa hala dunundur. Ekran ozeti, sayim tetikleyicisi ve
-- vardiya listesi hep bu fonksiyondan gecer; uc katman ayni gunu gorur.
-- 07:00 siniri guvenli: acilis 09:00, o saatten sonra gec kapanis olmaz.
-- Bekci de 03:15'ten 04:30'a cekildi ki gec sayim alarmdan once yetissin.
-- ----------------------------------------------------------------------------
create or replace function public.nip_kasa_gunu(p_store_id uuid)
returns date
language sql stable set search_path to 'public' as
$$
  select case
    when (now() at time zone 'Europe/Istanbul')::time >= time '03:00'
     and (now() at time zone 'Europe/Istanbul')::time <  time '07:00'
     and not exists (select 1 from public.cash_counts_gecerli cc
                      where cc.store_id = p_store_id
                        and cc.business_day = public.nip_business_day(now()) - 1
                        and cc.tur = 'kapanis')
    then public.nip_business_day(now()) - 1
    else public.nip_business_day(now())
  end
$$;

comment on function public.nip_kasa_gunu(uuid) is
  'Sayimin ait oldugu gun. 03:00-07:00 arasi dunun kapanisi yapilmadiysa '
  'kasa hala dunundur — gec kapanan gece yanlis gune yazilmaz.';

revoke all on function public.nip_kasa_gunu(uuid) from anon, public;
grant execute on function public.nip_kasa_gunu(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 2) fn_kasa_sayimi_doldur — tur ayrimi + kasa gunu. Degisen yerler isaretli,
--    kalan 20260827_kapanis_vardiyasi_sayimi ile birebir.
-- ----------------------------------------------------------------------------
create or replace function public.fn_kasa_sayimi_doldur()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  o        record;
  v_staff  record;
  v_bugun  date;
  v_onceki uuid;
begin
  -- DEGISTI: takvim degil KASA gunu — 03:00-07:00 arasi gec kapanis dune yazilir.
  v_bugun := public.nip_kasa_gunu(new.store_id);

  if current_user in ('authenticated', 'anon') then
    select s.id, s.name, s.role::text as role, s.store_ids into v_staff
      from public.staff s
     where s.auth_id = (select auth.uid()) and s.is_active;

    if not found then raise exception 'kasa sayimi: yetkisiz'; end if;
    if v_staff.role in ('kitchen', 'viewer') then
      raise exception 'kasa sayimi: % rolu sayim giremez', v_staff.role;
    end if;
    if not (new.store_id = any(v_staff.store_ids)) then
      raise exception 'kasa sayimi: bu magaza icin yetkin yok';
    end if;

    new.counted_by      := v_staff.id;
    new.counted_by_name := v_staff.name;

    new.business_day := coalesce(new.business_day, v_bugun);
    if new.business_day <> v_bugun then
      if not public.is_admin() then
        raise exception 'kasa sayimi: gecmis gun yalniz sahip tarafindan girilebilir';
      end if;
      if new.business_day > v_bugun then
        raise exception 'kasa sayimi: gelecek gun girilemez';
      end if;
      if new.business_day < v_bugun - 14 then
        raise exception 'kasa sayimi: 14 gunden eski gun girilemez';
      end if;
      if new.reason is null or length(btrim(new.reason)) < 3 then
        raise exception 'kasa sayimi: gecmis gun icin gerekce zorunlu';
      end if;
    end if;

    if new.supersedes is not null then
      if new.reason is null or length(btrim(new.reason)) < 3 then
        raise exception 'kasa sayimi: duzeltme icin gerekce zorunlu';
      end if;
      if not exists (select 1 from public.cash_counts c
                      where c.id = new.supersedes and c.store_id = new.store_id) then
        raise exception 'kasa sayimi: duzeltilecek kayit bulunamadi';
      end if;
      if not public.is_admin()
         and not exists (select 1 from public.cash_counts c
                          where c.id = new.supersedes and c.counted_by = v_staff.id) then
        raise exception 'kasa sayimi: baskasinin sayimini yalniz sahip duzeltebilir';
      end if;
      if exists (select 1 from public.cash_counts c where c.supersedes = new.supersedes) then
        raise exception 'kasa sayimi: bu kayit zaten duzeltilmis';
      end if;
      -- DEGISTI: duzeltme gunu VE turu duzelttigi kayittan alir — kapanis
      -- duzeltmesi kapanis kalir, devir duzeltmesi devir kalir.
      select c.business_day, c.tur into new.business_day, new.tur
        from public.cash_counts c where c.id = new.supersedes;
    elsif new.tur = 'kapanis' then
      -- DEGISTI: "gunde tek sayim" yalniz KAPANIS icin. Devir gunde birden
      -- cok olabilir (cift vardiya degisimi) ve kapanisi engellememeli.
      select cc.id into v_onceki from public.cash_counts_gecerli cc
       where cc.store_id = new.store_id and cc.business_day = new.business_day
         and cc.tur = 'kapanis'
       limit 1;
      if v_onceki is not null then
        raise exception 'kasa sayimi: bu gun zaten sayilmis — duzeltmek icin mevcut kaydin ustune gir';
      end if;
    end if;
  else
    new.business_day := coalesce(new.business_day, v_bugun);
  end if;

  select string_agg(s.name, ', ' order by (sh.status = 'active') desc,
                                          sh.checked_in_at desc nulls last)
    into new.vardiya_kisileri
    from public.shifts sh join public.staff s on s.id = sh.staff_id
   where sh.date = new.business_day
     and (sh.store_id = new.store_id or sh.store_id is null);

  select * into o from public.kasa_gun_ozeti(new.store_id, new.business_day);

  -- DEGISTI: acik hesap kurali yalniz KAPANIS sayiminda. Devirde (17:00)
  -- servis suruyor, acik hesap isin dogasi.
  if new.tur = 'kapanis' and new.business_day = v_bugun and o.acik_bugun_adet > 0
     and (new.note is null or length(btrim(new.note)) < 3) then
    raise exception 'kasa sayimi: % acik hesap varken sayim icin aciklama zorunlu — once hesaplari kapat', o.acik_bugun_adet;
  end if;

  new.opening_float := o.acilis;
  new.cash_sales    := o.nakit;
  new.cash_expenses := o.nakit_gider;
  new.expected_cash := o.beklenen;
  new.difference    := public.nip_denom_total(new.denoms) - o.beklenen;

  if abs(new.difference) > 100 and (new.note is null or length(btrim(new.note)) < 3) then
    raise exception 'kasa sayimi: TL % fark icin aciklama zorunlu', round(abs(new.difference));
  end if;

  return new;
end $$;

revoke all on function public.fn_kasa_sayimi_doldur() from anon, authenticated, public;

-- ----------------------------------------------------------------------------
-- 3) Acilis zinciri yalniz KAPANIS sayimindan beslenir
--    (kasa_gun_ozeti'nin acilis sorgusuna tur filtresi; kalani birebir ayni)
-- ----------------------------------------------------------------------------
create or replace function public.kasa_gun_ozeti(p_store_id uuid, p_gun date default null)
returns table (
  isletme_gunu    date,
  acilis          numeric,
  nakit           numeric,
  kart            numeric,
  online          numeric,
  havale          numeric,
  borc            numeric,
  puan            numeric,
  nakit_gider     numeric,
  gider_adet      integer,
  beklenen        numeric,
  acik_bugun_adet integer, acik_bugun_tutar numeric,
  acik_eski_adet  integer, acik_eski_tutar numeric,
  eksik_adet      integer, eksik_tutar      numeric
)
language plpgsql stable set search_path to 'public' as
$$
declare v_gun date; v_bas timestamptz; v_bit timestamptz; v_acilis numeric;
begin
  if current_user in ('authenticated', 'anon') then
    if not public.is_staff() then
      raise exception 'kasa ozeti: yetkisiz';
    end if;
    if not exists (select 1 from public.staff s
                    where s.auth_id = (select auth.uid()) and s.is_active
                      and p_store_id = any(s.store_ids)) then
      raise exception 'kasa ozeti: bu magaza icin yetkin yok';
    end if;
  end if;

  -- DEGISTI: varsayilan gun kasa gunu — ekran 03:30'da dunun ozetini gorur.
  v_gun := coalesce(p_gun, public.nip_kasa_gunu(p_store_id));
  v_bas := (v_gun     + time '03:00') at time zone 'Europe/Istanbul';
  v_bit := (v_gun + 1 + time '03:00') at time zone 'Europe/Istanbul';

  -- DEGISTI: yalniz tur='kapanis' — devir fotografi acilis zincirine girmez.
  select coalesce(cc.counted_total - cc.withdrawn, 0) into v_acilis
    from public.cash_counts_gecerli cc
   where cc.store_id = p_store_id and cc.business_day < v_gun
     and cc.tur = 'kapanis'
   order by cc.business_day desc limit 1;
  v_acilis := coalesce(v_acilis, 0);

  return query
  with od as (
    select p.method::text as method, p.amount from public.payments p
     where p.store_id = p_store_id and p.created_at >= v_bas and p.created_at < v_bit
  ),
  gid as (
    select e.amount from public.expenses e
     where e.store_id = p_store_id
       and lower(coalesce(e.payment_method, '')) = 'kasa'
       and e.created_at >= v_bas and e.created_at < v_bit
  ),
  sip as (
    select o.id, coalesce(o.total,0) total, coalesce(o.points_used,0) pts,
           coalesce((select sum(p.amount) from public.payments p where p.order_id = o.id), 0) odenen
      from public.orders o
     where o.origin_store_id = p_store_id and o.status = 'paid'
       and coalesce(o.paid_at, o.updated_at) >= v_bas
       and coalesce(o.paid_at, o.updated_at) <  v_bit
  ),
  acik as (
    select o.total, (public.nip_business_day(o.created_at) = v_gun) as bugun
      from public.orders o
     where o.origin_store_id = p_store_id
       and o.status in ('open','sent','preparing','ready','debt')
       and coalesce(o.total, 0) > 0
  )
  select
    v_gun,
    v_acilis,
    coalesce((select sum(amount) from od where method = 'cash'), 0)::numeric,
    coalesce((select sum(amount) from od where method = 'card'), 0)::numeric,
    coalesce((select sum(amount) from od where method = 'online'), 0)::numeric,
    coalesce((select sum(amount) from od where method = 'transfer'), 0)::numeric,
    coalesce((select sum(amount) from od where method = 'debt'), 0)::numeric,
    coalesce((select sum(pts) from sip), 0)::numeric,
    coalesce((select sum(amount) from gid), 0)::numeric,
    (select count(*) from gid)::integer,
    (v_acilis
      + coalesce((select sum(amount) from od where method = 'cash'), 0)
      - coalesce((select sum(amount) from gid), 0))::numeric,
    (select count(*)            from acik where bugun)::integer,
    coalesce((select sum(total) from acik where bugun), 0)::numeric,
    (select count(*)            from acik where not bugun)::integer,
    coalesce((select sum(total) from acik where not bugun), 0)::numeric,
    (select count(*)                       from sip where odenen + pts < total)::integer,
    coalesce((select sum(total-odenen-pts) from sip where odenen + pts < total), 0)::numeric;
end $$;

-- ----------------------------------------------------------------------------
-- 4) Bekci yalniz KAPANIS sayimina bakar — 17:00 devri geceyi kurtarmaz
-- ----------------------------------------------------------------------------
create or replace function public.nip_kasa_sayilmadi_bekcisi()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_gun     date := public.nip_business_day(now()) - 1;
  v_token   text;
  v_chat    record;
  r         record;
  v_vardiya text;
  v_metin   text;
  v_uyari   integer := 0;
begin
  select value into v_token from bot_config where key = 'telegram_bot_token';
  if v_token is null then
    return jsonb_build_object('ok', false, 'hata', 'telegram_bot_token yok');
  end if;

  for r in
    select st.id, st.name, oz.beklenen, oz.nakit, oz.nakit_gider, oz.acilis
      from public.stores st
      cross join lateral public.kasa_gun_ozeti(st.id, v_gun) oz
     where not exists (select 1 from public.cash_counts_gecerli cc
                        where cc.store_id = st.id and cc.business_day = v_gun
                          and cc.tur = 'kapanis')            -- DEGISTI
       and (oz.nakit > 0 or oz.nakit_gider > 0 or oz.acilis > 0)
  loop
    v_uyari := v_uyari + 1;

    select string_agg(s.name, ', ' order by sh.checked_in_at desc nulls last)
      into v_vardiya
      from public.shifts sh join public.staff s on s.id = sh.staff_id
     where sh.date = v_gun and (sh.store_id = r.id or sh.store_id is null);

    v_metin := 'KASA SAYILMADI — ' || r.name || E'\n'
            || to_char(v_gun, 'DD.MM.YYYY') || ' gecesi kapanista kasa sayilmadi.' || E'\n\n'
            || 'Cekmecede olmasi gereken: TL ' || round(r.beklenen) || E'\n'
            || 'Kapanis vardiyasi: ' || coalesce(v_vardiya, 'vardiya kaydi yok') || E'\n\n'
            || 'Kural: dukkani kapatan sayar. Dunun sayimini sahip hesabi '
            || 'gerekcesiyle girebilir:' || E'\n'
            || 'https://order.notinparis.me/cash-count';

    for v_chat in
      select distinct telegram_chat_id from staff
       where role::text = 'admin' and is_active and telegram_chat_id is not null
    loop
      perform net.http_post(
        url     := 'https://api.telegram.org/bot' || v_token || '/sendMessage',
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body    := jsonb_build_object('chat_id', v_chat.telegram_chat_id, 'text', v_metin)
      );
    end loop;
  end loop;

  return jsonb_build_object('ok', true, 'gun', v_gun, 'uyari', v_uyari);
end $$;

revoke all on function public.nip_kasa_sayilmadi_bekcisi() from anon, authenticated, public;

-- ----------------------------------------------------------------------------
-- 5) Toplu Telegram — TUM aktif personele (bekci admin'e gider, bu herkese)
-- ----------------------------------------------------------------------------
create or replace function public.nip_toplu_telegram(p_metin text)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_token text; v_chat record; v_n integer := 0;
begin
  select value into v_token from bot_config where key = 'telegram_bot_token';
  if v_token is null or p_metin is null or length(btrim(p_metin)) < 2 then
    return 0;
  end if;
  for v_chat in
    select distinct telegram_chat_id from staff
     where is_active and telegram_chat_id is not null
  loop
    perform net.http_post(
      url     := 'https://api.telegram.org/bot' || v_token || '/sendMessage',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body    := jsonb_build_object('chat_id', v_chat.telegram_chat_id, 'text', p_metin)
    );
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

comment on function public.nip_toplu_telegram(text) is
  'Metni Telegram''i bagli TUM aktif personele yollar. Istemciden cagrilamaz; '
  'cron hatirlatmalari ve nip_duyuru_gonder kullanir.';

revoke all on function public.nip_toplu_telegram(text) from anon, authenticated, public;

-- ----------------------------------------------------------------------------
-- 6) Duyuru — sahip uygulama uzerinden butun ekibe mesaj atabilir.
--    Guncelleme notlari da bu kanaldan gider.
--    SECURITY DEFINER + auth.uid() kapisi (current_user DEGIL — o tuzaga
--    bir kez dusuldu, bkz. 20260826_stok_sayimi).
-- ----------------------------------------------------------------------------
create or replace function public.nip_duyuru_gonder(p_metin text)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not exists (select 1 from public.staff s
                  where s.auth_id = (select auth.uid())
                    and s.is_active and s.role::text = 'admin') then
    raise exception 'duyuru: yalniz sahip gonderebilir';
  end if;
  if p_metin is null or length(btrim(p_metin)) < 5 then
    raise exception 'duyuru: metin cok kisa';
  end if;
  return public.nip_toplu_telegram('DUYURU — Not in Paris' || E'\n\n' || btrim(p_metin));
end $$;

revoke all on function public.nip_duyuru_gonder(text) from anon, public;
grant execute on function public.nip_duyuru_gonder(text) to authenticated;

-- ----------------------------------------------------------------------------
-- 7) Gunluk hatirlatmalar
-- ----------------------------------------------------------------------------
create or replace function public.nip_gunluk_hatirlatma(p_tur text)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_metin text;
begin
  if p_tur = 'acilis' then
    v_metin := 'Günaydın! Dükkan açılırken:' || E'\n'
            || 'Bugün HER sipariş sisteme girilecek — nakit de kart da. '
            || 'Girilmeyen satış gün sonunda kasa farkı olarak dönüyor.' || E'\n'
            || 'https://order.notinparis.me/tables';
  elsif p_tur = 'devir' then
    v_metin := 'Vardiya değişimi 17:00''de.' || E'\n'
            || 'Çıkan kişi kasayı SAYIP devretsin: Kasa Sayımı ekranında '
            || '"Vardiya devri"ni seç. Sayılmadan teslim yok.' || E'\n'
            || 'https://order.notinparis.me/cash-count';
  elsif p_tur = 'kapanis' then
    -- Sayilmissa susar: is yapilmisken dirdir etmek kurali ucuzlatir.
    if exists (select 1 from public.cash_counts_gecerli cc
                where cc.business_day = public.nip_business_day(now())
                  and cc.tur = 'kapanis') then
      return 0;
    end if;
    v_metin := 'Kapanış yaklaşıyor.' || E'\n'
            || 'Açık hesapları kapat, kasayı say, kapanış sayımını mühürle. '
            || 'Dükkanı kapatan sayar.' || E'\n'
            || 'https://order.notinparis.me/cash-count';
  else
    return 0;
  end if;
  return public.nip_toplu_telegram(v_metin);
end $$;

revoke all on function public.nip_gunluk_hatirlatma(text) from anon, authenticated, public;

-- 09:00 / 16:45 / 23:30 TR = 06:00 / 13:45 / 20:30 UTC
select cron.unschedule('nip-acilis-hatirlatma')
 where exists (select 1 from cron.job where jobname = 'nip-acilis-hatirlatma');
select cron.schedule('nip-acilis-hatirlatma', '0 6 * * *',
  $$select public.nip_gunluk_hatirlatma('acilis')$$);

select cron.unschedule('nip-devir-hatirlatma')
 where exists (select 1 from cron.job where jobname = 'nip-devir-hatirlatma');
select cron.schedule('nip-devir-hatirlatma', '45 13 * * *',
  $$select public.nip_gunluk_hatirlatma('devir')$$);

select cron.unschedule('nip-kapanis-hatirlatma')
 where exists (select 1 from cron.job where jobname = 'nip-kapanis-hatirlatma');
select cron.schedule('nip-kapanis-hatirlatma', '30 20 * * *',
  $$select public.nip_gunluk_hatirlatma('kapanis')$$);

-- Bekci 04:30 TR'ye (01:30 UTC) tasindi — gerekce dosya basinda.
select cron.unschedule('nip-kasa-bekcisi')
 where exists (select 1 from cron.job where jobname = 'nip-kasa-bekcisi');
select cron.schedule('nip-kasa-bekcisi', '30 1 * * *',
  $$select public.nip_kasa_sayilmadi_bekcisi()$$);
