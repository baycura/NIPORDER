-- 1) UYELIK TAMAMLAMA: telefon baska bir kayitta olunca uye kapida kaliyordu.
--
-- customers.phone UNIQUE. Mağazada elle acilmis 45 kayit telefonlu ve hicbiri
-- bir Google hesabina bagli degil. O kisi uygulamaya uye olunca kendi
-- numarasini yaziyor ve "duplicate key ... customers_phone_key" hatasi aliyor;
-- profil ekranini gecemedigi icin menuye HIC giremiyor (tek cikis: cikis yap).
--
-- Cozum: profili istemci dogrudan yazmasin, bu fonksiyon yazsin. Numara
-- sahipsiz bir kayitta duruyorsa o kayit hesaba katilir (gecmisi tasinir,
-- kopya satir silinir). Kayit gercekten baskasinin hesabina bagliysa ya da
-- icinde para varsa BIRLESTIRME YAPILMAZ — personel karar verir.
create or replace function public.save_member_profile(p_name text, p_phone text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare me public.customers%rowtype; ghost public.customers%rowtype;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'status', 'no_session'); end if;

  p_name  := btrim(coalesce(p_name, ''));
  p_phone := btrim(coalesce(p_phone, ''));
  -- E.164: +90... — istemci de dogruluyor, burada bir daha (istemciye guvenilmez)
  if length(p_name) < 3 or p_phone !~ '^\+[1-9][0-9]{7,14}$' then
    return jsonb_build_object('ok', false, 'status', 'invalid');
  end if;

  select * into me from public.customers where auth_user_id = auth.uid() limit 1;
  if me.id is null then return jsonb_build_object('ok', false, 'status', 'no_customer'); end if;

  select * into ghost from public.customers where phone = p_phone and id <> me.id limit 1;

  if ghost.id is not null then
    -- Numara CANLI bir uyelik hesabinda: dokunmayiz (hesap calmaya acik kapi olurdu)
    if ghost.auth_user_id is not null then
      return jsonb_build_object('ok', false, 'status', 'phone_taken');
    end if;
    -- Icinde para/puan olan kayit sessizce devredilmez — personel birlestirsin
    if coalesce(ghost.points, 0) <> 0 or coalesce(ghost.total_spent, 0) <> 0
       or coalesce(ghost.outstanding_balance, 0) <> 0 then
      return jsonb_build_object('ok', false, 'status', 'needs_staff');
    end if;

    -- Gecmisi tasi. orders FK'si ON DELETE NO ACTION — once tasinmali.
    update public.orders           set customer_id = me.id where customer_id = ghost.id;
    update public.debts            set customer_id = me.id where customer_id = ghost.id;
    update public.poll_votes       set customer_id = me.id where customer_id = ghost.id;
    -- member_discounts'ta (customer_id, product_id) UNIQUE: cakisani birakma
    update public.member_discounts d set customer_id = me.id
     where d.customer_id = ghost.id
       and not exists (select 1 from public.member_discounts x
                        where x.customer_id = me.id and x.product_id = d.product_id);
    delete from public.member_discounts where customer_id = ghost.id;

    -- Iz birak: personel ne olduğunu gorsun, gerekirse geri alsin
    update public.customers set
      avatar_url = coalesce(me.avatar_url, ghost.avatar_url),
      notes = concat_ws(chr(10),
        nullif(btrim(coalesce(me.notes, '')), ''),
        nullif(btrim(coalesce(ghost.notes, '')), ''),
        'Uyelik birlestirme ' || to_char(now(), 'DD.MM.YYYY HH24:MI') || ': "'
          || coalesce(ghost.name, '?') || '" (' || coalesce(ghost.email, 'e-posta yok')
          || ') kaydi bu hesaba katildi.')
      where id = me.id;

    delete from public.customers where id = ghost.id;
  end if;

  update public.customers set name = p_name, phone = p_phone, updated_at = now() where id = me.id;
  return jsonb_build_object('ok', true, 'status', case when ghost.id is not null then 'merged' else 'saved' end);

exception when unique_violation then
  -- Ayni numarayi ayni anda iki kisi kaydederse: her sey geri alinir
  return jsonb_build_object('ok', false, 'status', 'phone_taken');
end $$;

revoke all on function public.save_member_profile(text, text) from public;
revoke all on function public.save_member_profile(text, text) from anon;
grant execute on function public.save_member_profile(text, text) to authenticated;


-- 2) MUSTERI KENDI PARASINI YAZAMAZ (denetim bulgusu, kritik).
--
-- customers RLS'i satir sahipligini dogruluyordu ama HANGI kolonun
-- yazilabilecegini kisitlamiyordu: Google ile giren biri kendi satirinda
-- points=999999 (cuzdan = bedava kredi), outstanding_balance=0 (borc silme),
-- admin_discount=100 (bedava siparis) ya da tier='aileden' yapabiliyordu.
-- Ayni acik INSERT'te de vardi (yeni satiri istedigi puanla acabiliyordu).
--
-- Kolon bazli GRANT ise yaramaz: personel de 'authenticated' rolunde.
-- Ayirt edici olarak current_user kullaniliyor — SECURITY DEFINER fonksiyonlar
-- (puan tetikleyicisi, yukaridaki profil fonksiyonu) ve service_role sahibin
-- rolunde calisir, istemciden gelen dogrudan istek 'authenticated'/'anon'.
--
-- DIKKAT: bu fonksiyon SECURITY INVOKER olmali. DEFINER yazilirsa current_user
-- fonksiyon sahibi (postgres) olur, kontrol her cagrida muaf sayilir ve koruma
-- hic calismaz — ilk denemede tam olarak bu oldu.
create or replace function public.customers_guard_money_cols()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;  -- sunucu tarafi
  if public.is_staff() then return new; end if;                              -- personel

  if tg_op = 'INSERT' then
    new.points := 0;
    new.total_spent := 0;
    new.visit_count := 0;
    new.outstanding_balance := 0;
    new.admin_discount := null;
    new.tier := 'yeniyuz';
  else
    new.points := old.points;
    new.total_spent := old.total_spent;
    new.visit_count := old.visit_count;
    new.outstanding_balance := old.outstanding_balance;
    new.admin_discount := old.admin_discount;
    new.tier := old.tier;
    new.store_id := old.store_id;
    new.notes := old.notes;  -- personel notlari musteri tarafindan silinemesin
  end if;
  return new;
end $$;

drop trigger if exists trg_customers_guard_money on public.customers;
create trigger trg_customers_guard_money
  before insert or update on public.customers
  for each row execute function public.customers_guard_money_cols();
