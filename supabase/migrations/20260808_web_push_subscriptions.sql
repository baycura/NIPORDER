-- Musteri web-push abonelikleri: siparis hazir olunca kilitli telefona bildirim
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  subscription jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_push_subs_order on public.push_subscriptions(order_id);
alter table public.push_subscriptions enable row level security;
drop policy if exists "push_subs_insert_anyone" on public.push_subscriptions;
create policy "push_subs_insert_anyone" on public.push_subscriptions
  for insert to anon, authenticated with check (true);
-- okuma/silme policy yok: yalniz service role (edge fn) erisir

insert into public.bot_config(key, value)
values ('push_fn_url','https://gbbxxcduuwdmvfayxzeg.supabase.co/functions/v1/web-push')
on conflict (key) do update set value=excluded.value, updated_at=now();

create or replace function public.wp_call(payload jsonb) returns void
language plpgsql security definer set search_path = public as $fn$
declare base text; sec text;
begin
  select value into base from public.bot_config where key='push_fn_url';
  select value into sec from public.bot_config where key='webhook_secret';
  if base is null or sec is null then return; end if;
  perform net.http_post(
    url := base || '?action=ready&secret=' || sec,
    body := payload,
    headers := '{"Content-Type":"application/json"}'::jsonb
  );
end $fn$;
revoke execute on function public.wp_call(jsonb) from anon, authenticated;

create or replace function public.trg_items_ready_push() returns trigger
language plpgsql security definer set search_path = public as $fn$
declare r record;
begin
  for r in
    select n.order_id, jsonb_agg(jsonb_build_object('name', coalesce(n.product_name,'Urun'), 'qty', coalesce(n.quantity,1))) as items
    from new_rows n join old_rows o on o.id = n.id
    where coalesce(o.kitchen_status,'') is distinct from 'ready' and n.kitchen_status = 'ready'
    group by n.order_id
  loop
    perform public.wp_call(jsonb_build_object('kind','items_ready','order_id', r.order_id, 'items', r.items));
  end loop;
  return null;
end $fn$;
revoke execute on function public.trg_items_ready_push() from anon, authenticated;

drop trigger if exists wp_items_ready on public.order_items;
create trigger wp_items_ready
after update on public.order_items
referencing old table as old_rows new table as new_rows
for each statement execute function public.trg_items_ready_push();

-- Gece 06:30 TR: 2 gunden eski push aboneliklerini temizle
select cron.unschedule(jobid) from cron.job where jobname = 'nip-clean-push-subs';
select cron.schedule('nip-clean-push-subs','30 3 * * *',
  $job$delete from public.push_subscriptions where created_at < now() - interval '2 days'$job$);
