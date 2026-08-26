-- ============================================================================
-- TAHSILAT TEK ISLEMDE                                   20260826_odeme_atomik
-- ============================================================================
-- SORUN
-- Kasa iki ayri istek atiyordu: once payments'a satir, sonra orders'a "paid".
-- Ilki dusunce siparis kapaniyor ama tahsilat kaydi hic yazilmiyordu. Canli
-- olcum: 6 siparis boyle olusmus — cirosu sayiliyor, hangi yontemle tahsil
-- edildigi hicbir yerde yok. Veresiye tahsilati (Uyeler ekrani) da ayni
-- sekilde iki parcaliydi.
--
-- COZUM
-- Iki RPC. Her biri kendi isini tek transaction'da yapiyor: biri duserse
-- hicbiri yazilmiyor. Ayrica siparis KILITLENIYOR (for update), yani ayni
-- hesap iki kasiyer tarafindan ayni anda tahsil edilemiyor.
--
-- SECURITY INVOKER — DEFINER OLMAMALI. Personel zaten orders/payments/customers
-- yazabiliyor; RLS'i devre disi birakacak sebep yok. DEFINER yazilsaydi
-- magaza kontrolu current_user uzerinden olu koda donerdi (bkz.
-- 20260820_profil_birlestirme_ve_musteri_korumasi.sql:92-94).
--
-- points_used BURADAN YAZILMAZ. Cuzdan tetikleyicisi (fn_award_member_points)
-- siparis 'paid' olunca bakiyeyi kilitleyip kendisi hesaplar. Buradan
-- gonderilse istemciden gelen sayiya guvenilmis olurdu.
--
-- Geri alma:
--   drop function if exists public.nip_odeme_al(uuid, text, numeric, uuid, boolean);
--   drop function if exists public.nip_borc_tahsil(uuid, numeric, text);
--   -- frontend eski iki adimli akisa dondurulmeli
-- ============================================================================

create or replace function public.nip_odeme_al(
  p_order_id    uuid,
  p_method      text,
  p_amount      numeric,
  p_customer_id uuid    default null,
  p_use_points  boolean default false)
returns table (tahsil numeric, puan numeric, kalan_borc numeric)
language plpgsql
set search_path to 'public'
as $$
declare
  o       record;
  v_staff record;
  v_uye   uuid;
  v_borc  numeric := 0;
begin
  if p_method not in ('cash','card','transfer','debt','online') then
    raise exception 'odeme: gecersiz yontem %', p_method;
  end if;
  if coalesce(p_amount, 0) < 0 then
    raise exception 'odeme: tutar negatif olamaz';
  end if;

  select s.id, s.store_ids into v_staff
    from public.staff s
   where s.auth_id = (select auth.uid()) and s.is_active;
  if current_user in ('authenticated', 'anon') and v_staff.id is null then
    raise exception 'odeme: yetkisiz';
  end if;

  -- Siparisi KILITLE: iki kasiyer ayni hesabi ayni anda kapatamaz.
  select * into o from public.orders where id = p_order_id for update;
  if not found then raise exception 'odeme: siparis bulunamadi'; end if;
  if o.status::text = 'paid' then
    raise exception 'odeme: bu hesap zaten kapatilmis';
  end if;
  if o.status::text = 'cancelled' then
    raise exception 'odeme: iptal edilmis hesap tahsil edilemez';
  end if;
  if v_staff.id is not null and not (o.origin_store_id = any(v_staff.store_ids)) then
    raise exception 'odeme: bu magaza icin yetkin yok';
  end if;

  -- Siparis zaten bir uyeye bagliysa (QR ile giris) kasiyer ustune yazamaz.
  v_uye := coalesce(o.customer_id, p_customer_id);

  if p_method = 'debt' then
    if v_uye is null then raise exception 'odeme: borc icin uye secilmeli'; end if;
    update public.customers
       set outstanding_balance = coalesce(outstanding_balance, 0) + p_amount
     where id = v_uye
     returning outstanding_balance into v_borc;
    if not found then raise exception 'odeme: uye bulunamadi ya da yetki yok'; end if;
  end if;

  -- Puan tutarin tamamini karsiladiysa tahsilat 0 olabilir; bos satir atilmaz.
  if coalesce(p_amount, 0) > 0 then
    insert into public.payments(order_id, amount, method, store_id, staff_id)
    values (p_order_id, p_amount, p_method::payment_method, o.origin_store_id, v_staff.id);
  end if;

  -- staff_id: tahsil eden damgalanir ki satis "personelsiz" kalmasin; ama
  -- siparisi acan garson varsa o korunur, kasiyer ezmez.
  update public.orders set
    status      = 'paid',
    paid_at     = now(),
    use_points  = (p_method <> 'debt' and coalesce(p_use_points, false) and v_uye is not null),
    customer_id = v_uye,
    staff_id    = coalesce(o.staff_id, v_staff.id)
  where id = p_order_id;

  return query
    select coalesce(p_amount, 0),
           (select coalesce(x.points_used, 0) from public.orders x where x.id = p_order_id),
           v_borc;
end $$;

comment on function public.nip_odeme_al(uuid, text, numeric, uuid, boolean) is
  'Tahsilati tek islemde alir: payments satiri + siparis kapatma + borc bakiyesi. '
  'Biri duserse hicbiri yazilmaz. Siparisi kilitler, ayni hesabin iki kez tahsil '
  'edilmesini engeller.';

revoke all on function public.nip_odeme_al(uuid, text, numeric, uuid, boolean) from anon, public;
grant execute on function public.nip_odeme_al(uuid, text, numeric, uuid, boolean) to authenticated;

-- ----------------------------------------------------------------------------
-- Veresiye tahsilati. Bugune kadar yalniz bakiyeyi guncelliyordu; cekmeceye
-- giren nakit payments'a hic yazilmadigi icin gun sonu kasa sayimi her
-- seferinde sistematik "fazla" verirdi ve bu bilinen fazlanin altina gercek
-- bir acik gizlenebilirdi.
-- ----------------------------------------------------------------------------
create or replace function public.nip_borc_tahsil(
  p_customer_id uuid,
  p_amount      numeric,
  p_method      text)
returns numeric
language plpgsql
set search_path to 'public'
as $$
declare v_staff record; v_kalan numeric; v_store uuid;
begin
  if p_method not in ('cash','card','transfer','online') then
    raise exception 'borc tahsili: gecersiz yontem %', p_method;
  end if;
  if coalesce(p_amount, 0) <= 0 then
    raise exception 'borc tahsili: gecerli tutar gir';
  end if;

  select s.id, s.store_ids into v_staff
    from public.staff s
   where s.auth_id = (select auth.uid()) and s.is_active;
  if current_user in ('authenticated', 'anon') and v_staff.id is null then
    raise exception 'borc tahsili: yetkisiz';
  end if;

  select c.store_id into v_store from public.customers c where c.id = p_customer_id for update;
  if not found then raise exception 'borc tahsili: uye bulunamadi'; end if;

  update public.customers
     set outstanding_balance = greatest(0, coalesce(outstanding_balance, 0) - p_amount)
   where id = p_customer_id
   returning outstanding_balance into v_kalan;

  -- order_id NULL: birikmis borca ait, tek bir siparise degil.
  insert into public.payments(order_id, amount, method, store_id, staff_id)
  values (null, p_amount, p_method::payment_method,
          coalesce(v_store, v_staff.store_ids[1]), v_staff.id);

  return v_kalan;
end $$;

comment on function public.nip_borc_tahsil(uuid, numeric, text) is
  'Veresiye tahsilati tek islemde: bakiye dusumu + payments satiri. Kasa sayimi '
  'bu satiri gormeden cekmeceye giren nakit gorunmez olurdu.';

revoke all on function public.nip_borc_tahsil(uuid, numeric, text) from anon, public;
grant execute on function public.nip_borc_tahsil(uuid, numeric, text) to authenticated;
