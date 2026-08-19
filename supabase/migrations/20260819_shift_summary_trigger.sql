-- Vardiya kapaninca sahibe Telegram ozeti + isletme gunu 03:00 duzeni.
--
-- 1) Vardiya "active" -> "done" oldugunda telegram fonksiyonunun
--    shift_summary ucunu cagiran tetikleyici. Gece 03:00'teki toplu kapanis
--    da tek tek satir bazinda tetikler — her calisan icin ayri mesaj.
-- 2) Kapanista checked_out_at bos kalmasin: MyShiftPage eskiden yalniz
--    status yaziyordu, sure hesabi coplenirdi.
-- 3) nip-close-shifts cron'u 06:00 TR'de kapatiyordu; isletme gunu 03:00'te
--    bittigine gore vardiyalar da 03:00 TR'de (00:00 UTC) kapanmali.

-- checked_out_at guvencesi (BEFORE)
create or replace function public.shift_close_stamp()
returns trigger language plpgsql as $$
begin
  if new.status = 'done' and old.status = 'active' and new.checked_out_at is null then
    new.checked_out_at := now();
  end if;
  return new;
end $$;

drop trigger if exists trg_shift_close_stamp on public.shifts;
create trigger trg_shift_close_stamp
  before update on public.shifts
  for each row execute function public.shift_close_stamp();

-- Telegram cagrisi (AFTER) — tg_call ile ayni kalip, farkli action
create or replace function public.notify_shift_closed()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare base text; sec text;
begin
  if new.status = 'done' and old.status = 'active' then
    select value into base from public.bot_config where key = 'fn_url';
    select value into sec  from public.bot_config where key = 'webhook_secret';
    if base is not null and sec is not null then
      perform net.http_post(
        url := base || '?action=shift_summary&secret=' || sec,
        body := jsonb_build_object('shift_id', new.id),
        headers := '{"Content-Type":"application/json"}'::jsonb
      );
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_notify_shift_closed on public.shifts;
create trigger trg_notify_shift_closed
  after update on public.shifts
  for each row execute function public.notify_shift_closed();

-- Vardiya otomatik kapanisi: 00:00 UTC = 03:00 TR
do $$
declare jid int;
begin
  select jobid into jid from cron.job where jobname = 'nip-close-shifts';
  if jid is not null then
    perform cron.alter_job(jid, schedule := '0 0 * * *');
  end if;
end $$;
