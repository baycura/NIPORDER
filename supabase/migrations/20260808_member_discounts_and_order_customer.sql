-- Uyelik sistemi: siparise musteri bagi + uyeye ozel urun bazli sabit (TL) indirimler
-- Uygulandi: 2026-08-08 (Supabase migration: member_discounts_and_order_customer)

alter table public.orders add column if not exists customer_id uuid references public.customers(id);
create index if not exists idx_orders_customer on public.orders(customer_id);

create table if not exists public.member_discounts (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  amount numeric not null default 0 check (amount >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (customer_id, product_id)
);
create index if not exists idx_member_discounts_customer on public.member_discounts(customer_id);

alter table public.member_discounts enable row level security;
create policy anyone_read_member_discounts on public.member_discounts for select to anon, authenticated using (true);
create policy staff_insert_member_discounts on public.member_discounts for insert to authenticated with check (is_staff());
create policy staff_update_member_discounts on public.member_discounts for update to authenticated using (is_staff()) with check (is_staff());
create policy staff_delete_member_discounts on public.member_discounts for delete to authenticated using (is_staff());
