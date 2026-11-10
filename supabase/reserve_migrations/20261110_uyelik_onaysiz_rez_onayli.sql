-- ============================================================================
-- DIKKAT: BU DOSYA ORDER'A DEGIL, "NIP RESERVE" PROJESINE UYGULANDI.
--
-- UYELIK ONAYSIZ, REZERVASYON ONAYLI                            2026-11-10
-- ============================================================================
-- Sahip (10.11): "Uyelik icin onayi kaldiralim ama rezervasyon icin onay
-- gereksin. Rezervasyon onaylandiktan sonra da karsiya bildirim gitmeli."
--
-- 1) UYELIK: yeni hesap dogrudan "approved" acilir (uye kodu + guven kaydi).
--    Tablo duzeyinde de kural: "pending" kalmaz (site eski surumu acik kalsa
--    bile). Red / dondurma / ban karari korunur; uye kendi durumunu acamaz.
-- 2) KORUMA (inceleme bulgusu): own_profile ve res_own politikalari satirin
--    TUM kolonlarini uyeye aciyordu. Uye kendi profilinde is_admin=true
--    yazabiliyor (yonetici oluyor), kendi rezervasyonunu "approved"
--    yapabiliyordu. Tetikleyiciler bu alanlari yonetici / servis disinda
--    dondurur. Politikalar degismedi; hicbir nesne kaldirilmadi.
-- 3) BILDIRIM: nip_onaylananlari_ver — Order son 3 gunun onayli
--    rezervasyonlarini ceker ve musteriye e-posta yollar (Order tarafi:
--    ../migrations/20261110_reserve_onay_bildirimi.sql). Bu projede pg_net
--    yok; o yuzden cekme (pull) deseni.
-- 4) nip_bekleyenleri_ver: "uyeler" artik son 3 gunun YENI uyeleri (bilgi);
--    bekleyen rezervasyon talepleri ayni.
-- ============================================================================

-- Kimin elinde yetki var? Servis / cron / panel SQL (JWT yok ya da
-- service_role) ya da yonetici. anon ve authenticated uye degildir.
create or replace function public.nip_yetkili_mi()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') not in ('anon', 'authenticated')
         or public.nip_is_admin();
$$;

create or replace function public.nip_uye_kodu()
returns text
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare k text; i int := 0;
begin
  loop
    k := 'NIP-MBR-' || upper(substring(md5(gen_random_uuid()::text), 1, 6));
    exit when i > 8 or not exists (select 1 from public.profiles p where p.member_code = k);
    i := i + 1;
  end loop;
  return k;
end $$;
revoke all on function public.nip_uye_kodu() from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 1) Yeni hesap: dogrudan uye
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into public.profiles (
    id, email, name, phone, instagram,
    status, member_code, approved_at, referral_code
  ) values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', 'İsimsiz'),
    new.raw_user_meta_data->>'phone',
    new.raw_user_meta_data->>'instagram',
    'approved',
    public.nip_uye_kodu(),
    now(),
    'NIP-REF-' || upper(substring(replace(new.id::text,'-',''), 1, 6))
  );
  -- Panelin approveMember'i gibi guven kaydi; hata hesabi engellemez
  begin
    insert into public.reputation_ledger (profile_id, score_type, delta, balance_after, reason_code, source_type, reason_note)
    values (new.id, 'trust', 100, 100, 'approved', 'system', 'Otomatik: üyelik onaysız');
  exception when others then null;
  end;
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 2a) Profil korumasi + "pending kalmaz"
-- ----------------------------------------------------------------------------
create or replace function public.nip_profil_koru()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_serbest boolean := public.nip_yetkili_mi();
begin
  if not v_serbest then
    if tg_op = 'INSERT' then
      -- Profili yalniz sistem acar (handle_new_user / servis). Uye kendi satirini
      -- silip yeniden EKLEYEREK red / dondurma kararini ve puanini sifirlayamasin
      -- (own_profile politikasi satir silmeye ve eklemeye izin veriyor).
      raise exception 'profil yalnizca sistem tarafindan acilir' using errcode = '42501';
    else
      -- Uye kendi satirinda yetki, puan, sayac ve kimlik alanlarini degistiremez
      new.id := old.id; new.email := old.email; new.created_at := old.created_at;
      new.is_admin := old.is_admin; new.tier := old.tier;
      new.trust_score := old.trust_score; new.loyalty_score := old.loyalty_score; new.reward_points := old.reward_points;
      new.total_attended := old.total_attended; new.total_no_show := old.total_no_show; new.total_reservations := old.total_reservations;
      new.attendance_streak := old.attendance_streak; new.max_streak := old.max_streak; new.last_attended_at := old.last_attended_at;
      new.referral_code := old.referral_code; new.referral_used := old.referral_used; new.referral_limit := old.referral_limit;
      new.member_code := old.member_code;
      new.approved_at := old.approved_at;
      -- Red / dondurma / ban karari uyenin elinde degil; uye kendini bu durumlara da alamaz
      if old.status in ('rejected', 'frozen', 'banned') or new.status not in ('pending', 'approved') then
        new.status := old.status;
      end if;
    end if;
  end if;

  -- Uyelik onaysiz (sahip 10.11.2026): bekleyen kalmaz
  if new.status = 'pending' then new.status := 'approved'; end if;
  if new.status = 'approved' then
    if new.member_code is null then new.member_code := public.nip_uye_kodu(); end if;
    if new.approved_at is null then new.approved_at := now(); end if;
  end if;
  return new;
end $$;

create or replace trigger nip_profil_koru_trg
  before insert or update on public.profiles
  for each row execute function public.nip_profil_koru();

-- ----------------------------------------------------------------------------
-- 2b) Rezervasyon korumasi: onay yalniz yonetici / servis
-- ----------------------------------------------------------------------------
create or replace function public.nip_rez_koru()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare v public.reservations;
begin
  if public.nip_yetkili_mi() then return new; end if;
  if tg_op = 'INSERT' then
    new.status := 'pending'; new.approved_at := null; new.checked_in_at := null;
    new.dj_rating := null; new.rated_at := null;
    return new;
  end if;
  -- Uye / misafir: durum, onay, giris, kod, etkinlik degismez.
  -- Serbest: not ve puan; talep beklerken ad, telefon, kisi bilgisi.
  v := old;
  v.note := new.note; v.dj_rating := new.dj_rating; v.rated_at := new.rated_at;
  if old.status = 'pending' then
    v.name := new.name; v.phone := new.phone; v.count := new.count;
    v.guest_count := new.guest_count; v.guest_names := new.guest_names; v.guest_name := new.guest_name;
    v.rules_accepted := new.rules_accepted;
  end if;
  return v;
end $$;

create or replace trigger nip_rez_koru_trg
  before insert or update on public.reservations
  for each row execute function public.nip_rez_koru();

-- ----------------------------------------------------------------------------
-- 3) Onaylananlar (Order ceker, musteriye bildirir). Sir: order_sync_sir.
--    Son 30 gunde onaylanan ve tarihi gecmemis rezervasyonlar (e-posta
--    anahtari gec girilse de yaklasan etkinligin onayi gidebilsin; Order ayni
--    rezervasyona bir kez yollar ve yalniz HALA onayli olanlara).
-- ----------------------------------------------------------------------------
create or replace function public.nip_onaylananlari_ver(p_sir text)
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_sir text;
begin
  select decrypted_secret into v_sir from vault.decrypted_secrets where name = 'order_sync_sir';
  if v_sir is null then
    raise exception 'senkron sirri tanimli degil' using errcode = '28000';
  end if;
  if p_sir is null or length(p_sir) <> length(v_sir) or p_sir <> v_sir then
    raise exception 'yetkisiz' using errcode = '28000';
  end if;

  return coalesce((
    select json_agg(json_build_object(
      'id', r.id, 'name', r.name, 'phone', r.phone,
      'email', lower(trim(p.email)), 'lang', coalesce(p.language, 'tr'),
      'event_name', r.event_name, 'event_date', r.event_date, 'event_time', r.event_time,
      'guest_count', coalesce(r.guest_count, r.count, 1), 'qr_id', r.qr_id, 'approved_at', r.approved_at
    ) order by r.approved_at)
    from public.reservations r
    left join public.profiles p on p.id = r.profile_id
    where r.status = 'approved'
      and r.approved_at > now() - interval '30 days'
      and (r.event_date is null or r.event_date >= ((now() at time zone 'Europe/Istanbul')::date - 1))), '[]'::json);
end $$;

revoke all on function public.nip_onaylananlari_ver(text) from public;
grant execute on function public.nip_onaylananlari_ver(text) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4) Bekleyenler: uyeler = son 3 gunun yeni uyeleri (bilgi amacli)
-- ----------------------------------------------------------------------------
create or replace function public.nip_bekleyenleri_ver(p_sir text)
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_sir text;
begin
  select decrypted_secret into v_sir from vault.decrypted_secrets where name = 'order_sync_sir';
  if v_sir is null then
    raise exception 'senkron sirri tanimli degil' using errcode = '28000';
  end if;
  if p_sir is null or length(p_sir) <> length(v_sir) or p_sir <> v_sir then
    raise exception 'yetkisiz' using errcode = '28000';
  end if;

  return json_build_object(
    'uyeler', coalesce((
      select json_agg(json_build_object(
        'id', p.id, 'name', p.name, 'email', lower(trim(p.email)), 'created_at', p.created_at, 'durum', p.status,
        'kaynak', case when exists (select 1 from auth.identities i where i.user_id = p.id and i.provider = 'google') then 'Google' else 'e-posta' end
      ) order by p.created_at)
      from public.profiles p
      where p.status in ('pending', 'approved') and p.created_at > now() - interval '3 days'), '[]'::json),
    'rezervasyonlar', coalesce((
      select json_agg(json_build_object(
        'id', r.id, 'name', r.name, 'event_name', r.event_name, 'event_date', r.event_date, 'event_time', r.event_time,
        'guest_count', coalesce(r.guest_count, r.count, 1), 'created_at', r.created_at
      ) order by r.created_at)
      from public.reservations r
      where r.status = 'pending' and r.created_at > now() - interval '3 days'), '[]'::json)
  );
end $$;

revoke all on function public.nip_bekleyenleri_ver(text) from public;
grant execute on function public.nip_bekleyenleri_ver(text) to anon, authenticated;
