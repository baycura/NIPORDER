-- ============================================================================
-- UYE total_spent / visit_count GERIYE DONUK DOLDURMA
-- ============================================================================
-- Cuzdan (points) tetikleyiciyle artmis ama bazi kayitlarda total_spent
-- 0 kalmis — profil HARCAMA / "puan kazandın" 0 gorunuyordu.
--
-- 1) Odendi sayilan siparislerden topla (varsa)
-- 2) Hala 0 ve points > 0 ise asgari: points * 20 (kazanc orani)
-- ============================================================================

with siparis_ozet as (
  select
    o.customer_id,
    coalesce(sum(o.total), 0) as harcama,
    count(*)::int as ziyaret
  from public.orders o
  where o.customer_id is not null
    -- order_status enum: open/sent/preparing/ready/paid/cancelled/debt
    and o.status in ('paid', 'debt')
  group by o.customer_id
)
update public.customers c
set
  total_spent = greatest(
    coalesce(c.total_spent, 0),
    coalesce(s.harcama, 0)
  ),
  visit_count = greatest(
    coalesce(c.visit_count, 0),
    coalesce(s.ziyaret, 0)
  ),
  updated_at = now()
from siparis_ozet s
where s.customer_id = c.id
  and (
    coalesce(c.total_spent, 0) < coalesce(s.harcama, 0)
    or coalesce(c.visit_count, 0) < coalesce(s.ziyaret, 0)
  );

-- Siparisi okunamayan / baglanmamis ama cuzdani olanlar
update public.customers c
set
  total_spent = coalesce(c.points, 0) * 20,
  updated_at = now()
where coalesce(c.total_spent, 0) = 0
  and coalesce(c.points, 0) > 0;

-- Seviye (tier) total_spent ile hizala
update public.customers c
set tier = case
  when coalesce(c.total_spent, 0) >= 80000 then 'aileden'
  when coalesce(c.total_spent, 0) >= 30000 then 'mudavim'
  when coalesce(c.total_spent, 0) >= 10000 then 'mahalleli'
  else 'yeniyuz'
end
where coalesce(c.tier, '') is distinct from (
  case
    when coalesce(c.total_spent, 0) >= 80000 then 'aileden'
    when coalesce(c.total_spent, 0) >= 30000 then 'mudavim'
    when coalesce(c.total_spent, 0) >= 10000 then 'mahalleli'
    else 'yeniyuz'
  end
);
