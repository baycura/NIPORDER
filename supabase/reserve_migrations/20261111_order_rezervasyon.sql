-- Rezervasyon sitesi veritabani (RESERVE): Order uygulamasindan (musteri
-- menusu) gelen rezervasyon talebi.
--
-- Sahip (11.11.2026): "Menu kismindan girip etkinlikleri sectigimizde
-- rezervasyon butonuna basarsan web sitesine yonlendiriyor, bu cok sacma."
-- Artik talep menunun icinde alinir. Order veritabani bu iki fonksiyonu
-- senkron sirriyla (Vault: order_sync_sir; nip_onaylananlari_ver ile ayni)
-- cagirir. Tarayici bu fonksiyonlari CAGIRAMAZ: sir yalniz Order
-- veritabaninda durur.
--
--   nip_order_rezervasyon(p_sir, p json) -> json
--     p: event_id, ad, telefon, kisi, not, kural (kurallar kabul edildi),
--        uye (Order'da giris yapmis uye), profil_id, eposta (Order'in
--        DOGRULADIGI oturum adresi; profil yalniz bununla eslesirse baglanir),
--        deneme
--     Sitedeki kurallarin aynisi: uyelere ozel etkinlik, guven puani, seviye,
--     kapasite, kurallarin kabulu. Ayni kisi ayni etkinlige iki kez yazilmaz.
--     Donen: { ok, id, qr_id, status, ... } ya da { ok:false, kod }.
--     kod: eksik | etkinlik_yok | gecti | uye_gerekli | guven_dusuk |
--          seviye_yetersiz | dolu | kural | zaten
--   nip_order_rez_durum(p_sir, p_ids uuid[]) -> json
--     Order'in bildigi rezervasyonlarin guncel durumu (musteri menude gorur).
-- Hicbir nesne kaldirilmaz; tekrar calistirilabilir.

create or replace function public.nip_order_sir_dogru(p_sir text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_sir text;
begin
  select decrypted_secret into v_sir from vault.decrypted_secrets where name = 'order_sync_sir';
  return v_sir is not null and p_sir is not null and length(p_sir) = length(v_sir) and p_sir = v_sir;
end $$;
revoke all on function public.nip_order_sir_dogru(text) from public, anon, authenticated;

create or replace function public.nip_order_rezervasyon(p_sir text, p json)
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  e public.events;
  pr public.profiles;
  v_pid uuid;
  v_ad text := btrim(coalesce(p->>'ad', ''));
  v_tel text := btrim(coalesce(p->>'telefon', ''));
  v_kisi int;
  v_not text := nullif(left(btrim(coalesce(p->>'not', '')), 300), '');
  v_uye boolean := coalesce(p->>'uye', '') = 'true';
  v_kural boolean := coalesce(p->>'kural', '') = 'true';
  v_deneme boolean := coalesce(p->>'deneme', '') = 'true';
  v_eposta text := nullif(lower(btrim(coalesce(p->>'eposta', ''))), '');
  v_guven int := 100;
  v_seviye text := 'bronze';
  v_sira constant text[] := array['bronze', 'silver', 'gold', 'elite'];   -- site: TIER_ORDER
  v_var public.reservations;
  v_id uuid;
  v_kod text;
  v_bugun date := (now() at time zone 'Europe/Istanbul')::date;
  i int;
begin
  if not public.nip_order_sir_dogru(p_sir) then
    raise exception 'yetkisiz' using errcode = '28000';
  end if;

  begin
    v_kisi := greatest(1, least(20, coalesce((p->>'kisi')::int, 1)));
  exception when others then v_kisi := 1; end;

  if length(v_ad) < 2 or v_tel !~ '^\+[1-9][0-9]{7,14}$' or (p->>'event_id') is null then
    return json_build_object('ok', false, 'kod', 'eksik');
  end if;

  begin
    select * into e from public.events where id = (p->>'event_id')::uuid;
  exception when others then
    return json_build_object('ok', false, 'kod', 'etkinlik_yok');
  end;
  if e.id is null or e.status is distinct from 'active' then
    return json_build_object('ok', false, 'kod', 'etkinlik_yok');
  end if;
  if e.date < v_bugun then
    return json_build_object('ok', false, 'kod', 'gecti');
  end if;

  -- Uye baglantisi: profil YALNIZ Order'in gonderdigi dogrulanmis e-postayla
  -- eslesirse baglanir. profil_id tek basina yetmez (inceleme bulgusu: Order'daki
  -- musteri kaydi baska bir uyenin profiline baglanmis olabilir). E-posta yoksa
  -- kimse baglanmaz. Yalniz ONAYLI profil baglanir; digerleri misafir sayilir.
  if v_eposta is not null then
    begin
      if nullif(p->>'profil_id', '') is not null then
        select * into pr from public.profiles
         where id = (p->>'profil_id')::uuid and lower(btrim(email)) = v_eposta;
      end if;
    exception when others then pr := null; end;
    if pr.id is null then
      select * into pr from public.profiles where lower(btrim(email)) = v_eposta order by created_at limit 1;
    end if;
  end if;
  if pr.id is not null and pr.status = 'approved' then
    v_pid := pr.id;
    v_guven := coalesce(pr.trust_score, 100);
    v_seviye := coalesce(pr.tier, 'bronze');
  elsif pr.id is not null then
    v_uye := false;   -- profili var ama onayli degil (reddedildi / donduruldu)
  end if;

  -- Erisim kurallari (site: canAccess)
  if e.access_type = 'members_only' and v_pid is null and not v_uye then
    return json_build_object('ok', false, 'kod', 'uye_gerekli');
  end if;
  if (v_pid is not null or v_uye) and v_guven < coalesce(e.min_trust, 0) then
    return json_build_object('ok', false, 'kod', 'guven_dusuk');
  end if;
  if e.access_type = 'tier_restricted'
     and coalesce(array_position(v_sira, v_seviye), 1) < coalesce(array_position(v_sira, coalesce(e.min_tier, 'bronze')), 1) then
    return json_build_object('ok', false, 'kod', 'seviye_yetersiz');
  end if;
  if coalesce(e.approved_count, 0) >= coalesce(e.capacity, 0) then
    return json_build_object('ok', false, 'kod', 'dolu');
  end if;
  if nullif(btrim(coalesce(e.rules, '')), '') is not null and not v_kural then
    return json_build_object('ok', false, 'kod', 'kural');
  end if;

  -- Ayni kisi, ayni etkinlik: ikinci talep acilmaz.
  if v_pid is not null then
    select * into v_var from public.reservations
     where event_id = e.id and profile_id = v_pid and status in ('pending', 'approved')
     order by created_at desc limit 1;
    if v_var.id is not null then
      -- Uyenin kendi kaydi: kodu geri verilir (Order tarafi kimligi dogruladi)
      return json_build_object('ok', true, 'zaten', true, 'id', v_var.id, 'qr_id', v_var.qr_id, 'status', v_var.status,
        'event_name', e.name, 'event_date', e.date, 'event_time', e.time, 'kisi', coalesce(v_var.guest_count, v_var.count, 1), 'profil', true);
    end if;
  end if;
  if exists (select 1 from public.reservations
              where event_id = e.id and phone = v_tel and status in ('pending', 'approved')) then
    -- Yalniz telefon eslesti: kod VERILMEZ (numarayi bilen baskasinin biletini alamasin)
    return json_build_object('ok', false, 'kod', 'zaten');
  end if;

  -- Kuru calistirma (Order'in testi): butun denetimler calisir, kayit yazilmaz.
  -- Kod 'DNM-' ile baslar; gercek bir biletle karismaz.
  if v_deneme then
    return json_build_object('ok', true, 'deneme', true, 'id', gen_random_uuid(), 'qr_id', 'DNM-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)), 'status', 'pending',
      'event_name', e.name, 'event_date', e.date, 'event_time', e.time, 'kisi', v_kisi, 'profil', v_pid is not null);
  end if;

  for i in 1..5 loop
    v_kod := 'NIP-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    begin
      insert into public.reservations (qr_id, event_id, event_name, event_date, event_time, name, phone,
                                       guest_count, guest_names, note, status, rules_accepted, profile_id)
      values (v_kod, e.id, e.name, e.date, e.time, v_ad, v_tel, v_kisi, '{}', v_not, 'pending', v_kural, v_pid)
      returning id into v_id;
      exit;
    exception when unique_violation then
      v_id := null;   -- kod cakisti: yeni kodla bir daha
    end;
  end loop;
  if v_id is null then
    return json_build_object('ok', false, 'kod', 'tekrar_dene');
  end if;

  return json_build_object('ok', true, 'id', v_id, 'qr_id', v_kod, 'status', 'pending',
    'event_name', e.name, 'event_date', e.date, 'event_time', e.time, 'kisi', v_kisi, 'profil', v_pid is not null);
end $$;
revoke all on function public.nip_order_rezervasyon(text, json) from public;
grant execute on function public.nip_order_rezervasyon(text, json) to anon, authenticated, service_role;

create or replace function public.nip_order_rez_durum(p_sir text, p_ids uuid[])
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.nip_order_sir_dogru(p_sir) then
    raise exception 'yetkisiz' using errcode = '28000';
  end if;
  return coalesce((
    select json_agg(json_build_object('id', r.id, 'status', r.status, 'approved_at', r.approved_at, 'checked_in_at', r.checked_in_at))
      from public.reservations r
     where r.id = any(coalesce(p_ids, '{}'::uuid[]))), '[]'::json);
end $$;
revoke all on function public.nip_order_rez_durum(text, uuid[]) from public;
grant execute on function public.nip_order_rez_durum(text, uuid[]) to anon, authenticated, service_role;
