-- 1) GIZLILIK: uyeye ozel fiyatlar herkese acikti (USING true) — kim hangi
--    urune ne odedigi disariya sizabiliyordu. Artik uye YALNIZ kendi
--    fiyatlarini gorur; personel hepsini gorur.
drop policy if exists anyone_read_member_discounts on public.member_discounts;
create policy member_read_own_discounts on public.member_discounts
  for select to anon, authenticated
  using (
    public.is_staff()
    or customer_id in (select id from public.customers where auth_user_id = auth.uid())
  );

-- 2) Ayni uye + ayni urun icin iki fiyat satiri olusmasin. (Kaydetme akisinda
--    once silip sonra yazan adim sessizce basarisiz olursa mukerrer fiyat
--    riski vardi; istemci tarafinda da hata kontrolu eklendi.)
create unique index if not exists member_discounts_customer_product_uidx
  on public.member_discounts (customer_id, product_id);

-- 3) ORTAK UYE TABANI: rezervasyon uygulamasi (NIP RESERVE) ile siparis
--    uygulamasi ayri Supabase projeleri. Ortak anahtar e-posta: her iki
--    tarafta da Google girisi kullaniliyor. Ayni e-posta ile iki uye kaydi
--    olusmamasi icin tekil indeks.
--    Uye ilk kez QR menuye girdiginde AuthContext e-postadan eslestirip
--    auth_user_id'yi baglar; rezervasyon uyeleri boylece otomatik taninir.
create unique index if not exists customers_email_lower_uidx
  on public.customers (lower(email)) where email is not null and email <> '';
