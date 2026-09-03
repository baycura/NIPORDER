-- ============================================================================
-- DIKKAT: BU DOSYA ORDER'A DEGIL, "NIP RESERVE" PROJESINE UYGULANDI.
--
-- UYE SENKRONU — RESERVE tarafi (kaynak)                        2026-09-03
-- ============================================================================
-- Rezervasyon sitesine kaydolup onaylanan uyeler Order'daki musteri listesine
-- kendiliginden dussun. Order her 10 dakikada bu ucu cagirir
-- (Order tarafi: ../migrations/20260903_reserve_uye_senkronu.sql).
--
-- SIR: iki projenin Vault'unda ayni deger durur —
--   RESERVE: order_sync_sir     ORDER: reserve_sync_sir
-- Deger repo'da, istemcide, HTML'de YOKTUR. Dondurmek icin:
--   select vault.update_secret((select id from vault.secrets where name='order_sync_sir'), '<yeni>');
--   (ayni degeri Order'da reserve_sync_sir icin de)
-- Bu dosya Vault'a sir yazmaz; sir uygulama sirasinda elle konuldu.
-- ============================================================================

-- Yalniz kimlik alanlari doner (id, e-posta, ad, telefon, uye kodu, seviye,
-- guven puani, durum). Sifre / token / referans kodu gibi hicbir sey yok.
-- Anon cagirabilir ama sir olmadan bos bile donmez: hata.
create or replace function public.nip_uyeleri_ver(p_sir text)
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

  return (
    select coalesce(json_agg(json_build_object(
      'id', p.id,
      'email', lower(trim(p.email)),
      'name', p.name,
      'phone', nullif(regexp_replace(coalesce(p.phone, ''), '[^0-9]', '', 'g'), ''),
      'member_code', p.member_code,
      'tier', p.tier,
      'trust_score', p.trust_score,
      'status', p.status,
      'approved_at', p.approved_at,
      'updated_at', p.updated_at
    ) order by p.created_at), '[]'::json)
    from public.profiles p
    where p.status in ('approved', 'frozen')
      and p.email is not null and trim(p.email) <> ''
  );
end $$;

comment on function public.nip_uyeleri_ver(text) is
  'Order''in uye senkronu icin. Paylasilan sirla korunur (Vault: order_sync_sir). '
  'Onayli + dondurulmus uyelerin yalniz kimlik alanlarini doner.';

revoke all on function public.nip_uyeleri_ver(text) from public;
grant execute on function public.nip_uyeleri_ver(text) to anon, authenticated;

-- ============================================================================
-- DOGRULAMA (uygulandiktan sonra, hepsi gecti)
--   yanlis sir ........................... reddedildi ("yetkisiz")
--   bos sir .............................. reddedildi
--   anon + dogru sir ..................... 71 uye (66 eslesen + 5 yeni; 4 reddedilmis haric)
--   donen alanlar ........................ id,email,name,phone,member_code,tier,trust_score,status,approved_at,updated_at
--   sifre/referans sizmis mi ............. hayir
-- ============================================================================
