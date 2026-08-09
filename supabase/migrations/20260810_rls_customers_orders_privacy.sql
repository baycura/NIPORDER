-- GIZLILIK DUZELTMESI: anon rolu tum uye listesini ve tum siparisleri okuyabiliyordu.
--
-- Bulgu: customers / orders / order_items uzerinde SELECT policy'si USING (true)
-- ve rol listesi {anon, authenticated} idi. anon anahtari yayinlanan JS paketinin
-- icinde oldugu icin internetteki herhangi biri
--   GET /rest/v1/customers?select=*
-- diyerek tum uyelerin adini, e-postasini, telefonunu, puanini ve harcamasini,
--   GET /rest/v1/orders?select=*
-- diyerek tum siparisleri dokebiliyordu. (KVKK acisindan da sorunlu.)
--
-- Cozum:
--   * customers: anon hic okuyamaz. Uye yalniz KENDI satirini gorur, personel hepsini.
--   * orders / order_items: anon hic listeleyemez. Uye kendi siparislerini gorur,
--     personel hepsini. Misafirin "siparisim hazir mi" sorgusu icin siparis
--     numarasini parametre alan bir RPC var (UUID tahmin edilemez, yetenek anahtari
--     gibi calisir) — sadece durum doner, tutar/isim donmez.

-- ---------- customers ----------
drop policy if exists anyone_read_customers on public.customers;

create policy customers_read_own on public.customers
  for select to authenticated
  using (
    auth_user_id = auth.uid()
    or (auth_user_id is null and lower(email) = lower(auth.jwt() ->> 'email'))
  );

create policy customers_read_staff on public.customers
  for select to authenticated
  using (is_staff());

-- ---------- orders ----------
drop policy if exists anyone_read_orders on public.orders;

create policy orders_read_own on public.orders
  for select to authenticated
  using (customer_id in (select id from public.customers where auth_user_id = auth.uid()));

create policy orders_read_staff on public.orders
  for select to authenticated
  using (is_staff());

-- ---------- order_items ----------
drop policy if exists anyone_read_items on public.order_items;

create policy order_items_read_own on public.order_items
  for select to authenticated
  using (order_id in (
    select o.id from public.orders o
    join public.customers c on c.id = o.customer_id
    where c.auth_user_id = auth.uid()
  ));

create policy order_items_read_staff on public.order_items
  for select to authenticated
  using (is_staff());

-- ---------- Misafir icin siparis durumu ----------
-- Yalnizca durum bilgisi doner; tutar, musteri adi, urun adi DONMEZ.
create or replace function public.order_public_status(p_order_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select jsonb_build_object(
    'status',     (select o.status from orders o where o.id = p_order_id),
    'item_count', (select count(*) from order_items where order_id = p_order_id),
    'any_ready',  (select coalesce(bool_or(kitchen_status in ('ready','served')), false)
                   from order_items where order_id = p_order_id),
    'all_served', (select coalesce(bool_and(kitchen_status = 'served'), false)
                   from order_items where order_id = p_order_id)
  );
$$;

comment on function public.order_public_status(uuid) is
  'Misafir siparis takibi: yalniz durum bilgisi. Siparis UUID''si bilinmeden cagrilamaz.';

grant execute on function public.order_public_status(uuid) to anon, authenticated;
