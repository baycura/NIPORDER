-- ============================================================================
-- PARTI DUGMESI — vardiyadaki calisan tek dokunusla acar  20260828_parti_dugmesi
-- ============================================================================
-- Sahibin istegi: "Carsamba, cuma, cumartesi partilerimiz var. Tek bir tusla
-- vardiyadaki calisanin aktif edebilecegi bir parti menusune donelim. Menu cok
-- kalabalik, aksam muzik varken insanlar alkol iciyor. Parti dugmesine
-- bastigimizda sadece partide sattigimiz urunler listelensin, normal menu
-- gozukmesin."
--
-- BUGUNE KADARKI DURUM
-- Parti modu yalniz Ayarlar'dan (manager+) ve ZAMANA bagli aciliyordu:
-- party_mode_enabled + party_days [3,5,6] + 22:00-04:00. Ama:
--   - party_mode_enabled = false, yani mekanizma hic acilmamis.
--   - Vardiyadaki calisan Ayarlar'a giremez (can_manage_settings: manager+).
--   - Parti erken/gec baslarsa saat penceresi tutmuyor.
--
-- YENI: MANUEL PENCERE
-- app_settings.party_manual_until — timestamptz (jsonb string). Parti manuel
-- olarak ACIK iff now() < party_manual_until.
--
-- Acilista pencere ISLETME GUNU SONU + 2 SAAT'e (yani ertesi 05:00 TR)
-- kurulur. Neden bu deger:
--   - Isletme gunu 03:00'te doner ama parti 04:00'e kadar surebiliyor; gun
--     sinirini kullansaydik menu gecenin ortasinda kendiliginden normale
--     donerdi.
--   - Ust sinir olmasi SART: kimse "kapatmayi unuttum" diyemesin. En kotu
--     ihtimalle 05:00'te kendiliginden kapanir, ertesi sabah kahve isteyen
--     musteri sadece votka goren bir menuyle karsilasmaz.
--
-- GUVENLIK KILIDI (en onemli satir)
-- Parti menusu ARTIK SERT FILTRE: isaretli urun yoksa menu BOS kalir
-- (frontend'deki "hicbiri isaretli degilse hepsini goster" tavizi kalkiyor,
-- cunku sahip acikca "normal menu gozukmesin" dedi). Bu yuzden RPC, isaretli
-- ve satista olan urun YOKSA partiyi acmayi REDDEDER. Aksi halde tek dokunus
-- menuyu komple bosaltabilirdi.
--
-- fn_is_party_now DA GUNCELLENIYOR: stok dusumu (nip_stok_esitle) parti-ozel
-- malzemeleri (PET bardak) bu fonksiyona sorarak dusuyor. Manuel parti onu da
-- etkilemezse "menude parti var ama stokta yok" gibi iki ayri gercek olusurdu.
--
-- Geri alma:
--   drop function if exists public.nip_parti_ac(uuid, boolean);
--   drop function if exists public.nip_parti_durum(uuid);
--   delete from public.app_settings where key = 'party_manual_until';
--   -- fn_is_party_now'un manuel blogu cikarilmali
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Parti durumu — ekranlar ve fonksiyonlar tek kaynaktan okur
-- ----------------------------------------------------------------------------
create or replace function public.nip_parti_durum(p_store_id uuid)
returns table (
  aktif        boolean,
  kaynak       text,          -- 'manuel' | 'program' | 'kapali'
  biter        timestamptz,   -- manuel pencerenin bitisi
  urun_sayisi  integer        -- parti menusunde satista kac urun var
)
language plpgsql stable security definer set search_path to 'public' as
$$
declare
  v_until timestamptz;
  v_prog  boolean;
  v_adet  integer;
begin
  select (value #>> '{}')::timestamptz into v_until
    from app_settings where key = 'party_manual_until' and store_id = p_store_id;

  v_prog := public.fn_is_party_now_programli(p_store_id);

  select count(*) into v_adet
    from public.products p
   where p.show_in_party_menu and p.is_available
     and (p.store_id = p_store_id or p_store_id = any(coalesce(p.additional_store_ids, '{}')));

  return query select
    (v_until is not null and now() < v_until) or coalesce(v_prog, false),
    case when v_until is not null and now() < v_until then 'manuel'
         when coalesce(v_prog, false) then 'program'
         else 'kapali' end,
    v_until,
    coalesce(v_adet, 0);
end $$;

revoke all on function public.nip_parti_durum(uuid) from public;
grant execute on function public.nip_parti_durum(uuid) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2) Programli parti (eski davranis) ayri isim altina alindi ki
--    fn_is_party_now ikisini birlestirebilsin. Govde birebir eski hali.
-- ----------------------------------------------------------------------------
create or replace function public.fn_is_party_now_programli(p_store_id uuid)
returns boolean
language plpgsql stable security definer set search_path to 'public' as
$$
declare
  v_from time; v_until time; v_days jsonb; v_enabled jsonb;
  v_now timestamptz := now(); v_local timestamp; v_time time; v_party_date date;
begin
  select value into v_enabled
    from app_settings where key = 'party_mode_enabled' and store_id = p_store_id;
  if coalesce(v_enabled #>> '{}', 'false') <> 'true' then return false; end if;

  select (value #>> '{}')::time into v_from
    from app_settings where key = 'party_mode_from' and store_id = p_store_id;
  select (value #>> '{}')::time into v_until
    from app_settings where key = 'party_mode_until' and store_id = p_store_id;
  select value into v_days
    from app_settings where key = 'party_days' and store_id = p_store_id;

  if v_from is null or v_until is null then return false; end if;
  if v_days is null or jsonb_typeof(v_days) <> 'array' or jsonb_array_length(v_days) = 0 then
    return false;
  end if;

  v_local := v_now at time zone 'Europe/Istanbul';
  v_time  := v_local::time;

  if v_from <= v_until then
    if v_time >= v_from and v_time < v_until then v_party_date := v_local::date;
    else return false; end if;
  else
    if v_time >= v_from then v_party_date := v_local::date;
    elsif v_time < v_until then v_party_date := (v_local - interval '1 day')::date;
    else return false; end if;
  end if;

  return v_days @> to_jsonb(extract(isodow from v_party_date)::int);
end $$;

revoke all on function public.fn_is_party_now_programli(uuid) from anon, authenticated, public;

-- ----------------------------------------------------------------------------
-- 3) fn_is_party_now — manuel VEYA programli. Stok dusumu bunu okuyor,
--    dolayisiyla parti-ozel malzemeler manuel partide de duser.
-- ----------------------------------------------------------------------------
create or replace function public.fn_is_party_now(p_store_id uuid)
returns boolean
language plpgsql stable security definer set search_path to 'public' as
$$
declare v_until timestamptz;
begin
  select (value #>> '{}')::timestamptz into v_until
    from app_settings where key = 'party_manual_until' and store_id = p_store_id;
  if v_until is not null and now() < v_until then return true; end if;
  return public.fn_is_party_now_programli(p_store_id);
end $$;

-- ----------------------------------------------------------------------------
-- 4) Parti dugmesi — vardiyadaki calisan basar
--
-- Ayar yazma yetkisi manager+ (can_manage_settings) oldugu icin dogrudan
-- app_settings'e yazdiramiyoruz; RPC bu yuzden SECURITY DEFINER. Yetki kapisi
-- iceride ve current_user'a BAKMAZ (DEFINER icinde o fonksiyon sahibidir —
-- bu tuzaga bir kez dusuldu, bkz. 20260826_stok_sayimi).
-- ----------------------------------------------------------------------------
create or replace function public.nip_parti_ac(p_store_id uuid, p_ac boolean)
returns table (aktif boolean, kaynak text, biter timestamptz, urun_sayisi integer)
language plpgsql security definer set search_path to 'public' as
$$
declare
  v_staff record;
  v_adet  integer;
  v_until timestamptz;
begin
  select s.id, s.name, s.role::text as role, s.store_ids into v_staff
    from public.staff s
   where s.auth_id = (select auth.uid()) and s.is_active;

  if v_staff.id is null then raise exception 'parti: yetkisiz'; end if;
  if v_staff.role in ('viewer', 'kitchen') then
    raise exception 'parti: % rolu parti menusunu degistiremez', v_staff.role;
  end if;
  if not (p_store_id = any(v_staff.store_ids)) then
    raise exception 'parti: bu magaza icin yetkin yok';
  end if;

  if p_ac then
    -- SERT FILTRE KILIDI: isaretli urun yoksa parti menusu bos kalirdi.
    select count(*) into v_adet
      from public.products p
     where p.show_in_party_menu and p.is_available
       and (p.store_id = p_store_id or p_store_id = any(coalesce(p.additional_store_ids, '{}')));
    if coalesce(v_adet, 0) = 0 then
      raise exception 'parti: parti menusunde satista urun yok — once Parti Menusu ekranindan urun sec';
    end if;

    -- Pencere: isletme gunu sonu + 2 saat = ertesi 05:00 TR. Ust sinir sart,
    -- "kapatmayi unuttum" diye ertesi gune sarkmasin.
    v_until := ((public.nip_business_day(now()) + 1) + time '05:00') at time zone 'Europe/Istanbul';

    insert into public.app_settings(key, value, store_id, updated_at)
    values ('party_manual_until', to_jsonb(v_until::text), p_store_id, now())
    on conflict (key, store_id) do update
      set value = excluded.value, updated_at = now();
  else
    delete from public.app_settings
     where key = 'party_manual_until' and store_id = p_store_id;
  end if;

  return query select * from public.nip_parti_durum(p_store_id);
end $$;

comment on function public.nip_parti_ac(uuid, boolean) is
  'Parti menusunu vardiyadaki calisan tek dokunusla acar/kapatir. Acarken '
  'parti menusunde satista urun yoksa REDDEDER (sert filtre menuyu bosaltirdi). '
  'Pencere ertesi 05:00 TR''de kendiliginden kapanir.';

revoke all on function public.nip_parti_ac(uuid, boolean) from anon, public;
grant execute on function public.nip_parti_ac(uuid, boolean) to authenticated;
