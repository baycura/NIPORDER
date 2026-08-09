-- Uyelik puan sistemi: odenen her 10 TL = 2 puan; rutbeler puana gore otomatik
create or replace function public.fn_award_member_points() returns trigger
language plpgsql security definer set search_path = public as $fn$
declare pts int; new_tier text; delta int;
begin
  if new.customer_id is null then return null; end if;
  if old.status is not distinct from new.status then return null; end if;
  if new.status::text <> 'paid' or old.status::text = 'paid' then return null; end if;
  delta := floor(coalesce(new.total, 0) / 5);
  update public.customers set
    points = coalesce(points, 0) + delta,
    total_spent = coalesce(total_spent, 0) + coalesce(new.total, 0),
    visit_count = coalesce(visit_count, 0) + 1,
    updated_at = now()
  where id = new.customer_id
  returning points into pts;
  new_tier := case when pts >= 4000 then 'aileden' when pts >= 1500 then 'mudavim'
                   when pts >= 500 then 'mahalleli' else 'yeniyuz' end;
  update public.customers set tier = new_tier
  where id = new.customer_id and coalesce(tier, '') is distinct from new_tier;
  return null;
end $fn$;
revoke execute on function public.fn_award_member_points() from anon, authenticated;

drop trigger if exists trg_award_member_points on public.orders;
create trigger trg_award_member_points after update on public.orders
for each row execute function public.fn_award_member_points();
