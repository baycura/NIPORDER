-- ============================================================================
-- KAPANIS SAYIMI DUKKANI KAPATIR              20260828_kapanis_dukkani_kapatir
-- ============================================================================
-- Sahibin duzeltmesi: "Her zaman 03:00'te kapatmiyoruz — bazen 00:30, bazen
-- 01:30. En son kapanis yapan kisi kasayi yapsin ve 'kasayi kapattik' gibi
-- bir tusla kapatsin."
--
-- Kapanis SAATE degil DUGMEYE baglanir. O dugme zaten var: kapanis sayimini
-- muhurlemek. Bu migration muhre ikinci bir anlam ekler: kapanis sayimi
-- girildiginde o gunun AKTIF vardiyalari da kapanir. Boylece tek dokunus =
-- kasa sayildi + vardiyalar kapandi + (04:30 bekcisi susturuldu).
--
-- Bu ozellikle part-time icin onemli: /myshift sayfasini goremedigi icin
-- vardiyasini kendisi KAPATAMIYORDU — ilk siparisle otomatik acilan kaydi
-- 03:00 cron'una kadar aktif kaliyordu. Kapanisci coğu gece part-time
-- (canli veri: 22:28 girisli "Part-time Servis"); artik muhur onun
-- vardiyasini da kapatir.
--
-- Devir sayimi vardiya KAPATMAZ: 17:00'de gelen vardiya calismaya devam
-- ediyor. Gecmis gun backfill'inde kosul no-op'tur (o gunun vardiyalari
-- zaten cron'la kapanmistir).
--
-- SECURITY INVOKER: shifts RLS'i (staff_full_access, is_staff()) personelin
-- vardiya guncellemesine zaten izin veriyor; DEFINER'a gerek yok.
--
-- Geri alma:
--   drop trigger if exists trg_kapanis_vardiya_kapat on public.cash_counts;
--   drop function if exists public.fn_kapanis_vardiya_kapat();
-- ============================================================================

create or replace function public.fn_kapanis_vardiya_kapat()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.tur = 'kapanis' then
    update public.shifts sh
       set status = 'done',
           checked_out_at = coalesce(sh.checked_out_at, now())
     where sh.date = new.business_day
       and sh.status = 'active'
       and (sh.store_id = new.store_id or sh.store_id is null);
  end if;
  return null;
end $$;

comment on function public.fn_kapanis_vardiya_kapat() is
  'Kapanis sayimi muhurlenince o gunun aktif vardiyalarini kapatir. '
  'Muhur = dukkani kapat dugmesi. Devir sayimi vardiya kapatmaz.';

revoke all on function public.fn_kapanis_vardiya_kapat() from anon, authenticated, public;

drop trigger if exists trg_kapanis_vardiya_kapat on public.cash_counts;
create trigger trg_kapanis_vardiya_kapat
  after insert on public.cash_counts
  for each row execute function public.fn_kapanis_vardiya_kapat();
