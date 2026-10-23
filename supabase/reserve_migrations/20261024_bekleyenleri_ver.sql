-- ============================================================================
-- DIKKAT: BU DOSYA ORDER'A DEGIL, "NIP RESERVE" PROJESINE UYGULANDI.
--
-- BEKLEYEN BASVURU / TALEP UCU                                  2026-10-24
-- ============================================================================
-- 23.10 bulgusu: 5 Eylul'den beri kaydolan 16 uye "onay bekliyor"da kaldi,
-- kimse gormedi; 22 Agustos'tan beri rezervasyon yoktu. Sahip: "bana haber
-- de dussun." Order her 10 dakikada bu ucu cagirir, yeni bekleyenleri
-- Telegram'dan sahibe yazar (Order tarafi:
-- ../migrations/20261024_reserve_bekleyen_bildirimi.sql).
--
-- SIR: nip_uyeleri_ver ile ayni (Vault order_sync_sir). Yalniz son 3 gunun
-- bekleyenleri doner: uyeler (ad, e-posta, kaynak) ve rezervasyon talepleri
-- (ad, etkinlik, kisi). Telefon, sifre, token yok.
-- ============================================================================
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
        'id', p.id, 'name', p.name, 'email', lower(trim(p.email)), 'created_at', p.created_at,
        'kaynak', case when exists (select 1 from auth.identities i where i.user_id = p.id and i.provider = 'google') then 'Google' else 'e-posta' end
      ) order by p.created_at)
      from public.profiles p
      where p.status = 'pending' and p.created_at > now() - interval '3 days'), '[]'::json),
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
