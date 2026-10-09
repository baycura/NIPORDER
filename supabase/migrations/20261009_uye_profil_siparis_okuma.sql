-- ============================================================================
-- UYE PROFIL: SIPARIS / KALEM OKUMA = CUSTOMERS ILE AYNI
-- ============================================================================
-- Sorun: customers_read_own e-posta eslesmesine izin veriyor
-- (auth_user_id bosken JWT email). orders_read_own yalniz
-- auth_user_id = auth.uid() bakiyordu. Sonuc: uye cuzdanini
-- (customers.points) goruyor, kendi siparislerini / harcamasini
-- gormuyordu — profilde SİPARİŞ/HARCAMA 0, CÜZDAN dolu.
--
-- Cozum: orders + order_items SELECT politikasini customers ile hizala.
-- ============================================================================

drop policy if exists orders_read_own on public.orders;
create policy orders_read_own on public.orders
  for select to authenticated
  using (
    customer_id in (
      select c.id from public.customers c
      where c.auth_user_id = auth.uid()
         or (c.auth_user_id is null
             and lower(c.email) = lower(auth.jwt() ->> 'email'))
    )
  );

drop policy if exists order_items_read_own on public.order_items;
create policy order_items_read_own on public.order_items
  for select to authenticated
  using (
    order_id in (
      select o.id from public.orders o
      join public.customers c on c.id = o.customer_id
      where c.auth_user_id = auth.uid()
         or (c.auth_user_id is null
             and lower(c.email) = lower(auth.jwt() ->> 'email'))
    )
  );
