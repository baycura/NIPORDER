-- Not In Paris — Telegram bildirim tetikleyicileri + zamanlanmis isler
-- Supabase Dashboard > SQL Editor'e yapistir ve Run de. Tekrar calistirmak guvenlidir.

create extension if not exists pg_net;
create extension if not exists pg_cron;

insert into public.bot_config(key, value)
values ('fn_url','https://gbbxxcduuwdmvfayxzeg.supabase.co/functions/v1/telegram')
on conflict (key) do update set value=excluded.value, updated_at=now();

-- Edge fonksiyonuna guvenli cagri (secret bot_config'ten okunur)
create or replace function public.tg_call(payload jsonb) returns void
language plpgsql security definer set search_path = public as $fn$
declare base text; sec text;
begin
  select value into base from public.bot_config where key='fn_url';
  select value into sec from public.bot_config where key='webhook_secret';
  if base is null or sec is null then return; end if;
  perform net.http_post(
    url := base || '?action=notify&secret=' || sec,
    body := payload,
    headers := '{"Content-Type":"application/json"}'::jsonb
  );
end $fn$;

-- 1) Yeni siparis kalemleri (insert aninda mutfaga gonderilmis) -> items_sent
create or replace function public.trg_items_sent_ins() returns trigger
language plpgsql security definer set search_path = public as $fn$
declare r record;
begin
  for r in
    select order_id, jsonb_agg(jsonb_build_object('name', coalesce(product_name,'Urun'), 'qty', coalesce(quantity,1))) as items
    from new_rows where coalesce(sent_to_kitchen,false) = true
    group by order_id
  loop
    perform public.tg_call(jsonb_build_object('kind','items_sent','order_id', r.order_id, 'items', r.items));
  end loop;
  return null;
end $fn$;

drop trigger if exists tg_items_sent_ins on public.order_items;
create trigger tg_items_sent_ins
after insert on public.order_items
referencing new table as new_rows
for each statement execute function public.trg_items_sent_ins();

-- 2) Sonradan mutfaga gonderilen (sent_to_kitchen false->true) -> items_sent
create or replace function public.trg_items_sent_upd() returns trigger
language plpgsql security definer set search_path = public as $fn$
declare r record;
begin
  for r in
    select n.order_id, jsonb_agg(jsonb_build_object('name', coalesce(n.product_name,'Urun'), 'qty', coalesce(n.quantity,1))) as items
    from new_rows n join old_rows o on o.id = n.id
    where coalesce(o.sent_to_kitchen,false) = false and coalesce(n.sent_to_kitchen,false) = true
    group by n.order_id
  loop
    perform public.tg_call(jsonb_build_object('kind','items_sent','order_id', r.order_id, 'items', r.items));
  end loop;
  return null;
end $fn$;

drop trigger if exists tg_items_sent_upd on public.order_items;
create trigger tg_items_sent_upd
after update on public.order_items
referencing old table as old_rows new table as new_rows
for each statement execute function public.trg_items_sent_upd();

-- 3) Hazir (kitchen_status -> ready) -> items_ready
create or replace function public.trg_items_ready() returns trigger
language plpgsql security definer set search_path = public as $fn$
declare r record;
begin
  for r in
    select n.order_id, jsonb_agg(jsonb_build_object('name', coalesce(n.product_name,'Urun'), 'qty', coalesce(n.quantity,1))) as items
    from new_rows n join old_rows o on o.id = n.id
    where coalesce(o.kitchen_status,'') is distinct from 'ready' and n.kitchen_status = 'ready'
    group by n.order_id
  loop
    perform public.tg_call(jsonb_build_object('kind','items_ready','order_id', r.order_id, 'items', r.items));
  end loop;
  return null;
end $fn$;

drop trigger if exists tg_items_ready on public.order_items;
create trigger tg_items_ready
after update on public.order_items
referencing old table as old_rows new table as new_rows
for each statement execute function public.trg_items_ready();

-- 4) Gece 06:00 TR (03:00 UTC): acik kalan vardiyalari otomatik kapat
select cron.unschedule(jobid) from cron.job where jobname = 'nip-close-shifts';
select cron.schedule('nip-close-shifts','0 3 * * *',
  $job$update public.shifts set status='done', checked_out_at=now() where status='active'$job$);

-- 5) Sabah 09:00 TR (06:00 UTC): sahip gun-sonu ozeti (admin'lere)
select cron.unschedule(jobid) from cron.job where jobname = 'nip-daily-summary';
select cron.schedule('nip-daily-summary','0 6 * * *',
  $job$select net.http_post(
    url := (select value from public.bot_config where key='fn_url') || '?action=daily_summary&secret=' || (select value from public.bot_config where key='webhook_secret'),
    body := '{}'::jsonb,
    headers := '{"Content-Type":"application/json"}'::jsonb)$job$);

-- Kontrol: kurulan cron isleri
select jobname, schedule from cron.job where jobname like 'nip-%';
