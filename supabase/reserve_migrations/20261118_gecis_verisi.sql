-- ============================================================================
-- GECIS VERISI (RESERVE)                                  20261118_gecis_verisi
-- ============================================================================
-- Sahip (12.11.2026): rezervasyon Order'in icine tasiniyor; bu veritabani
-- (RESERVE) rezervasyon icin birakiliyor. Order, gecisten once buradaki
-- etkinlikleri, rezervasyonlari ve uyelerin "geldi / gelmedi" sayilarini bir
-- kez kopyalar (Order: nip_rez_gecis_kopyala). Bu dosya o kopyanin okudugu ucu
-- ekler.
--
-- TASINMAYANLAR (sahip karari): guven puani, seviye, seri, sadakat puani,
-- itibar defteri, davet kodu, bekleme listesi, DJ puani, afis. Bu uc onlari
-- vermez.
--
-- Yetki: diger kopru uclariyla ayni (nip_onaylananlari_ver): cagiran Order,
-- Vault'taki order_sync_sir ile kendini tanitir. Sir tutmazsa hata.
-- Yalniz OKUR; hicbir satiri degistirmez. Tekrar calistirilabilir.
-- ============================================================================
create or replace function public.nip_gecis_verisi(p_sir text)
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
    'etkinlikler', coalesce((
      select json_agg(json_build_object(
        'id', e.id, 'name', e.name, 'genre', e.genre, 'subtitle', e.subtitle,
        'date', e.date, 'time', e.time,
        'time_end', coalesce(nullif(e.time_end, ''), nullif(e.end_time, '')),
        'warmup_name', e.warmup_name, 'warmup_start', e.warmup_start, 'warmup_end', e.warmup_end,
        'capacity', e.capacity, 'approved_count', e.approved_count, 'access_type', e.access_type,
        'rules', e.rules, 'rules_en', e.rules_en, 'rules_ru', e.rules_ru,
        'color', e.color, 'note', e.note, 'status', e.status, 'created_at', e.created_at
      ) order by e.date, e.created_at)
      from public.events e), '[]'::json),
    'rezervasyonlar', coalesce((
      select json_agg(json_build_object(
        'id', r.id, 'qr_id', r.qr_id, 'event_id', r.event_id, 'event_name', r.event_name,
        'event_date', r.event_date, 'event_time', r.event_time, 'name', r.name, 'phone', r.phone,
        'guest_count', coalesce(r.guest_count, r.count, 1),
        'guest_names', nullif(array_to_string(r.guest_names, ', '), ''),
        'note', r.note, 'status', r.status, 'rules_accepted', coalesce(r.rules_accepted, false),
        'profile_id', r.profile_id,
        'email', nullif(lower(btrim(p.email)), ''), 'lang', coalesce(p.language, 'tr'),
        'approved_at', r.approved_at, 'checked_in_at', r.checked_in_at, 'no_show_at', r.no_show_at,
        'created_at', r.created_at
      ) order by r.created_at)
      from public.reservations r
      left join public.profiles p on p.id = r.profile_id), '[]'::json),
    'uyeler', coalesce((
      select json_agg(json_build_object(
        'id', p.id, 'email', nullif(lower(btrim(p.email)), ''),
        'geldi', coalesce(p.total_attended, 0), 'gelmedi', coalesce(p.total_no_show, 0)))
      from public.profiles p
      where coalesce(p.total_attended, 0) > 0 or coalesce(p.total_no_show, 0) > 0), '[]'::json));
end $$;

revoke all on function public.nip_gecis_verisi(text) from public;
grant execute on function public.nip_gecis_verisi(text) to anon, authenticated;
