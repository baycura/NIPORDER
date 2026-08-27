-- ============================================================================
-- KAPANIS VARDIYASI KASAYI SAYAR                20260827_kapanis_vardiyasi_sayimi
-- ============================================================================
-- ISLETME KURALI (sahibin sozuyle): "Dukkani kapatan vardiyada kim varsa kasa
-- yapsin ve kapanis sonrasinda gerceklessin."
--
-- Kural uc yerde birden zorlanmazsa ritüel olur, kayit olmaz:
--
--   1. SAYIM ANINDA — sayim kaydina o gecenin kapanis vardiyasi damgalanir
--      (vardiya_kisileri). Kim sayarsa saysin, "o gece kimler vardi" sorusunun
--      cevabi kayitta durur. Ayrica gunun ACIK HESABI varken sayim ancak
--      gerekceyle girilebilir: acik hesap = servis suruyor = kapanis olmamis.
--
--   2. EKRANDA — nip_kapanis_vardiyasi() gunun vardiyasini dondurur; ekran
--      "sayan kisi"yi tek dokunusla bu listeden sectirir, acik hesap varken
--      muhurlemeyi kilitler (frontend: CashCountPage).
--
--   3. ERTESI SABAH — 03:15 TR'de bekci calisir: biten gunun cekmecesinde
--      para hareketi varsa ve sayim yoksa, admin'lere Telegram'dan "kasa
--      sayilmadi + kapanis vardiyasi su kisilerdi" duser. Atlanan gece
--      sessizce kaybolmaz.
--
-- Neden sert engel degil de gerekce: gece 03:00'e kadar kapanmayan tek bir
-- hesap (borclu musteri) sayimi tamamen kilitleseydi personel sayimi hic
-- yapmazdi. Kural "engelle" degil "izsiz gecirtme".
--
-- Geri alma:
--   select cron.unschedule('nip-kasa-bekcisi');
--   drop function if exists public.nip_kasa_sayilmadi_bekcisi();
--   drop function if exists public.nip_kapanis_vardiyasi(uuid);
--   alter table public.cash_counts drop column if exists vardiya_kisileri;
--   -- fn_kasa_sayimi_doldur 20260825_kasa_sayimi.sql'deki halina dondurulmeli
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Sayim kaydina kapanis vardiyasi damgasi
-- ----------------------------------------------------------------------------
alter table public.cash_counts add column if not exists vardiya_kisileri text;

comment on column public.cash_counts.vardiya_kisileri is
  'Sayilan isletme gununun vardiya personeli (aktifler once). Tetikleyici '
  'doldurur; istemciden gelen deger yok sayilir. "O gece kimler vardi" '
  'sorusunun kalici cevabi.';

-- ----------------------------------------------------------------------------
-- 2) Gunun vardiyasi — ekranin "sayan kisi" cipleri buradan beslenir
-- SECURITY INVOKER: shifts/staff RLS'inden gecer (ikisi de is_staff() okumali).
-- ----------------------------------------------------------------------------
create or replace function public.nip_kapanis_vardiyasi(p_store_id uuid)
returns table (ad text, aktif boolean)
language sql stable set search_path to 'public' as
$$
  select s.name, sh.status = 'active'
    from public.shifts sh
    join public.staff s on s.id = sh.staff_id
   where sh.date = public.nip_business_day(now())
     and (sh.store_id = p_store_id or sh.store_id is null)
   order by (sh.status = 'active') desc, sh.checked_in_at desc nulls last
$$;

comment on function public.nip_kapanis_vardiyasi(uuid) is
  'Icinde bulunulan isletme gununun vardiya personeli; aktif olanlar once. '
  'Kasa sayiminda "sayan kisi" tek dokunusla bu listeden secilir.';

revoke all on function public.nip_kapanis_vardiyasi(uuid) from anon, public;
grant execute on function public.nip_kapanis_vardiyasi(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 3) fn_kasa_sayimi_doldur — iki ekleme, geri kalani 20260825 ile birebir:
--    a) vardiya_kisileri damgasi (sayilan GUNUN vardiyasi; backfill'de de dogru)
--    b) gunun acik hesabi varken gerekcesiz sayim reddedilir
-- SECURITY INVOKER kalir (bkz. 20260825_kasa_sayimi.sql bas uyarisi).
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
  v_bugun := public.nip_business_day(now());

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

    -- Gun: normalde bugun. Gecmis gun yalniz admin, en fazla 14 gun geriye,
    -- gerekce zorunlu. Atlanmis bir geceyi geri doldurabilmek icin var.
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

    -- Duzeltme: kendi kaydinin ustune herkes, baskasininkinin ustune yalniz admin.
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
      -- Ayni kaydin ustune iki kez duzeltme girilmesin; zincir tek dallanir.
      if exists (select 1 from public.cash_counts c where c.supersedes = new.supersedes) then
        raise exception 'kasa sayimi: bu kayit zaten duzeltilmis';
      end if;
      select c.business_day into new.business_day
        from public.cash_counts c where c.id = new.supersedes;
    else
      -- Ayni gun icin ikinci kayit ancak duzeltme olarak girilebilir.
      select cc.id into v_onceki from public.cash_counts_gecerli cc
       where cc.store_id = new.store_id and cc.business_day = new.business_day
       limit 1;
      if v_onceki is not null then
        raise exception 'kasa sayimi: bu gun zaten sayilmis — duzeltmek icin mevcut kaydin ustune gir';
      end if;
    end if;
  else
    new.business_day := coalesce(new.business_day, v_bugun);
  end if;

  -- Kapanis vardiyasi damgasi: sayilan GUNUN vardiyasi (bugun de backfill'de
  -- de dogru gun). Istemciden gelen deger yok sayilir.
  select string_agg(s.name, ', ' order by (sh.status = 'active') desc,
                                          sh.checked_in_at desc nulls last)
    into new.vardiya_kisileri
    from public.shifts sh join public.staff s on s.id = sh.staff_id
   where sh.date = new.business_day
     and (sh.store_id = new.store_id or sh.store_id is null);

  -- Sayilar SUNUCUDA hesaplanir; istemciden gelen degerler yok sayilir.
  select * into o from public.kasa_gun_ozeti(new.store_id, new.business_day);

  -- KAPANIS SONRASI kurali: gunun acik hesabi varsa servis bitmemis demektir;
  -- o hesabin nakdi henuz payments'ta olmadigi icin beklenen EKSIK hesaplanir.
  -- Engellemiyoruz (kapanmayan tek hesap sayimi kilitlemesin) ama iz istiyoruz.
  if new.business_day = v_bugun and o.acik_bugun_adet > 0
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
-- 4) Gece bekcisi — sayilmayan kasa sessizce gecmez
--
-- 03:15 TR'de (00:15 UTC) calisir: yeni bitmis isletme gununde cekmeceden para
-- gecmis (nakit tahsilat / nakit gider / devreden acilis) ama sayim girilmemisse
-- admin'lere Telegram'dan uyari duser — kapanis vardiyasinin adlariyla.
--
-- SECURITY DEFINER: cron oturumsuz calisir, is_staff() yanlis doner.
-- current_user'a BAKMAZ (DEFINER icinde sahibi gorunur, cagiran degil).
-- Telegram kalibi nip_haftalik_denetim_gonder ile birebir ayni
-- (bot_config.telegram_bot_token + net.http_post).
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
                        where cc.store_id = st.id and cc.business_day = v_gun)
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

comment on function public.nip_kasa_sayilmadi_bekcisi() is
  'Her sabah 03:15 TR: biten isletme gununde para hareketi olup sayim '
  'girilmemisse admin''lere Telegram uyarisi. Kapanis vardiyasinin adlarini '
  'da yazar — "kim sayacakti" tartismasi kayitla biter.';

revoke all on function public.nip_kasa_sayilmadi_bekcisi() from anon, authenticated, public;

select cron.unschedule('nip-kasa-bekcisi')
 where exists (select 1 from cron.job where jobname = 'nip-kasa-bekcisi');
select cron.schedule('nip-kasa-bekcisi', '15 0 * * *',
  $$select public.nip_kasa_sayilmadi_bekcisi()$$);
