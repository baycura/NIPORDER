-- Google girisinde otomatik musteri kaydi store_id gondermiyor; kolon NOT NULL
-- oldugu icin kayit sessizce basarisiz oluyordu. Varsayilan: Paris magazasi.
alter table public.customers alter column store_id set default 'c3c6e0c7-1821-4edd-993d-ad960cfbc452';

-- Musteri kendi kaydini sahiplenebilsin: personelin e-postayla onceden actigi uyelik,
-- ilk Google girisinde auth hesabina baglanabilsin (yalniz kendi satiri).
drop policy if exists customer_update_own on public.customers;
create policy customer_update_own on public.customers
  for update to authenticated
  using (auth_user_id = auth.uid() or (auth_user_id is null and lower(email) = lower(auth.jwt()->>'email')))
  with check (auth_user_id = auth.uid());
