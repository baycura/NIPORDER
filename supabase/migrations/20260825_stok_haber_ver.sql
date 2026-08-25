-- ============================================================================
-- TUKENEN URUNDE "HABER VER"                        20260825_stok_haber_ver
-- ============================================================================
-- Shop'ta tukenen urun bugune kadar sadece soluklasiyordu; musteri sessizce
-- kayboluyordu ve o urune talep oldugunu kimse ogrenmiyordu.
-- Bu tablo talebi kaydeder: hangi urune kac kisi bakti.
--
-- Geri alma:  drop table if exists public.restock_requests;
-- ============================================================================

create table if not exists public.restock_requests (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products(id) on delete cascade,
  store_id    uuid          references public.stores(id)   on delete set null,
  customer_id uuid          references public.customers(id) on delete set null,
  created_at  timestamptz not null default now()
);

comment on table public.restock_requests is
  'Tukenen urun icin "haber ver" talepleri. Urun geri gelince kime haber verilecegi ve talebin buyuklugu buradan gorunur.';

create index if not exists ix_restock_requests_urun on public.restock_requests (product_id, created_at desc);

alter table public.restock_requests enable row level security;

-- Musteri QR'dan isimsiz geziyor; siparis akisiyla ayni kural (anyone_insert_order).
create policy restock_requests_insert_herkes on public.restock_requests
  for insert to anon, authenticated with check (true);

-- Talebi yalniz personel okur/temizler.
create policy restock_requests_read_personel on public.restock_requests
  for select to authenticated using (public.is_staff());
create policy restock_requests_delete_personel on public.restock_requests
  for delete to authenticated using (public.is_staff());
