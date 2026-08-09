-- Raf/magaza urunleri: alt markalar + beden varyantlari + adet stogu
create table if not exists public.brands (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  name text not null,
  description text,
  sort_order integer not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_brands_store on public.brands(store_id);
alter table public.brands enable row level security;
drop policy if exists brands_read on public.brands;
create policy brands_read on public.brands for select to anon, authenticated using (true);
drop policy if exists brands_write on public.brands;
create policy brands_write on public.brands for all to authenticated using (is_staff()) with check (is_staff());

alter table public.products add column if not exists brand_id uuid references public.brands(id) on delete set null;
alter table public.products add column if not exists track_stock boolean not null default false;
alter table public.products add column if not exists retail_stock integer not null default 0;
alter table public.products add column if not exists variants jsonb;
alter table public.order_items add column if not exists variant_name text;

create or replace function public.fn_decrement_retail_stock() returns trigger
language plpgsql security definer set search_path = public as $fn$
declare p record; vs jsonb; i int; found boolean := false;
begin
  if new.product_id is null then return null; end if;
  select id, track_stock, retail_stock, variants into p from public.products where id = new.product_id;
  if not found or p.track_stock is not true then return null; end if;
  if new.variant_name is not null and p.variants is not null then
    vs := p.variants;
    for i in 0 .. jsonb_array_length(vs) - 1 loop
      if vs->i->>'name' = new.variant_name then
        vs := jsonb_set(vs, array[i::text, 'stock'],
              to_jsonb(greatest(coalesce((vs->i->>'stock')::int, 0) - coalesce(new.quantity, 1), 0)));
        found := true;
      end if;
    end loop;
    if found then update public.products set variants = vs where id = p.id; end if;
  end if;
  update public.products set retail_stock = greatest(coalesce(retail_stock,0) - coalesce(new.quantity,1), 0) where id = p.id;
  return null;
end $fn$;
revoke execute on function public.fn_decrement_retail_stock() from anon, authenticated;

drop trigger if exists trg_decrement_retail_stock on public.order_items;
create trigger trg_decrement_retail_stock after insert on public.order_items
for each row execute function public.fn_decrement_retail_stock();
