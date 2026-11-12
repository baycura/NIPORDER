-- ============================================================
-- GELMEDI: tek islemde isaret + guven puani — RESERVE projesi
-- ============================================================
-- Bagimsiz inceleme (12.11.2026): panel isareti ve guven puanini IKI ayri
-- istekle yaziyordu. Arada ag koparsa isaret yazilip puan dusmuyor, geri
-- almada hic dusulmemis 40 puan ekleniyordu. Taban 0'a takilan dusus de geri
-- almada tam 40 olarak geri veriliyordu.
--
-- nip_gelmedi(p_rez, p_geri): yalniz yonetici. Rezervasyonu kilitler; isaret,
-- guven puani, gelmedi sayisi, seri ve itibar defteri TEK islemde yazilir.
--   p_geri = false : isaretle. Uyede guven -40 (taban 0), gelmedi +1, seri 0.
--   p_geri = true  : isareti kaldir. Dusulen GERCEK miktar defterden okunur ve
--                    o kadar geri verilir; gelmedi -1. Seri geri gelmez.
-- Kayit artik onayli degilse ya da isaret zaten o durumdaysa hicbir sey
-- yazilmaz: { ok: false, neden: 'degisti' } (iki cihaz ayni anda basarsa).
--
-- nip_rez_gelmedi_koru: "gelmedi" isaretli rezervasyona giris (status = used)
-- hicbir istemciden yazilamaz; once isaret kaldirilir. Site panelinden
-- okutulan kod da bu kurala uyar.
--
-- Yalniz EKLEME (fonksiyon + tetik). Canliya uygulandi.

create or replace function public.nip_gelmedi(p_rez uuid, p_geri boolean default false)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r        public.reservations;
  v_eski   integer;
  v_yeni   integer;
  v_delta  integer := 0;
begin
  if not public.nip_is_admin() then
    raise exception 'gelmedi: yetkisiz';
  end if;
  select * into r from public.reservations where id = p_rez for update;
  if not found then
    raise exception 'gelmedi: rezervasyon bulunamadi';
  end if;

  if not coalesce(p_geri, false) then
    if r.status is distinct from 'approved' or r.no_show_at is not null then
      return json_build_object('ok', false, 'neden', 'degisti');
    end if;
    update public.reservations set no_show_at = now() where id = p_rez;
    if r.profile_id is not null then
      select coalesce(trust_score, 100) into v_eski
        from public.profiles where id = r.profile_id for update;
      if found then
        v_yeni := greatest(0, v_eski - 40);
        v_delta := v_yeni - v_eski;
        update public.profiles
           set trust_score = v_yeni,
               total_no_show = coalesce(total_no_show, 0) + 1,
               attendance_streak = 0
         where id = r.profile_id;
        -- created_at = clock_timestamp(): ayni islemde art arda yazilan satirlar
        -- da sirali kalsin (now() islem basini verir, hepsi ayni olur).
        insert into public.reputation_ledger(profile_id, score_type, delta, balance_after,
                                             reason_code, source_type, source_id, created_by, created_at)
        values (r.profile_id, 'trust', v_delta, v_yeni, 'no_show', 'reservation', p_rez, auth.uid(), clock_timestamp());
      end if;
    end if;
    return json_build_object('ok', true, 'uye', r.profile_id is not null, 'delta', v_delta);
  end if;

  -- GERI AL
  if r.status is distinct from 'approved' or r.no_show_at is null then
    return json_build_object('ok', false, 'neden', 'degisti');
  end if;
  update public.reservations set no_show_at = null where id = p_rez;
  if r.profile_id is not null then
    -- Dusulen gercek miktar: bu rezervasyonun son "no_show" defter satiri.
    select -l.delta into v_delta
      from public.reputation_ledger l
     where l.profile_id = r.profile_id and l.score_type = 'trust'
       and l.reason_code = 'no_show' and l.source_id = p_rez
     order by l.created_at desc limit 1;
    v_delta := coalesce(v_delta, 40);
    update public.profiles
       set trust_score = coalesce(trust_score, 100) + v_delta,
           total_no_show = greatest(0, coalesce(total_no_show, 0) - 1)
     where id = r.profile_id
    returning trust_score into v_yeni;
    if found then
      insert into public.reputation_ledger(profile_id, score_type, delta, balance_after,
                                           reason_code, source_type, source_id, created_by, created_at)
      values (r.profile_id, 'trust', v_delta, v_yeni, 'no_show_geri', 'reservation', p_rez, auth.uid(), clock_timestamp());
    end if;
  end if;
  return json_build_object('ok', true, 'uye', r.profile_id is not null, 'delta', v_delta);
end $function$;

revoke all on function public.nip_gelmedi(uuid, boolean) from public, anon;
grant execute on function public.nip_gelmedi(uuid, boolean) to authenticated;

create or replace function public.nip_rez_gelmedi_koru()
returns trigger
language plpgsql
as $function$
begin
  if new.status = 'used' and old.status is distinct from 'used' and new.no_show_at is not null then
    raise exception 'Bu rezervasyon "gelmedi" isaretli. Giris icin once isareti kaldir.';
  end if;
  return new;
end $function$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'nip_rez_gelmedi_koru_trg') then
    create trigger nip_rez_gelmedi_koru_trg
      before update on public.reservations
      for each row execute function public.nip_rez_gelmedi_koru();
  end if;
end $$;
