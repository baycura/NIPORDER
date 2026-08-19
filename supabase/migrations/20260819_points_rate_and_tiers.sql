-- Puan kurali degisti (sahip talimati, 19 Agu):
--   Kazanc: 5 TL = 1 puan  ->  20 TL = 1 puan (harcamanin %5'i)
--   Esikler: 500/1500/4000 -> 5000/15000/40000
-- Frontend'deki TIERS listesi (CustomerMenu.jsx) ayni kurali anlatir;
-- biri degisirse digeri de degismeli.

create or replace function public.fn_award_member_points()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare pts int; new_tier text; delta int;
begin
  if new.customer_id is null then return null; end if;
  if old.status is not distinct from new.status then return null; end if;
  if new.status::text <> 'paid' or old.status::text = 'paid' then return null; end if;
  delta := floor(coalesce(new.total, 0) / 20); -- 20 TL = 1 puan (%5)
  update public.customers set
    points = coalesce(points, 0) + delta,
    total_spent = coalesce(total_spent, 0) + coalesce(new.total, 0),
    visit_count = coalesce(visit_count, 0) + 1,
    updated_at = now()
  where id = new.customer_id
  returning points into pts;
  new_tier := case
    when pts >= 40000 then 'aileden'
    when pts >= 15000 then 'mudavim'
    when pts >= 5000 then 'mahalleli'
    else 'yeniyuz' end;
  update public.customers set tier = new_tier
  where id = new.customer_id and coalesce(tier, '') is distinct from new_tier;
  return null;
end $$;
