-- ============================================================================
-- KONSINYE URUNLER                                            20261024_konsinye
-- ============================================================================
-- Sahip (24.10): "IZIPIZI gozlukler konsinye ve %40'i bizim. Konsinye urunlerin
-- maliyetlerini bu sekilde girebiliriz."
--
-- Konsinye: tedarikcinin mali bizde satilir. Satis bedelinin bir yuzdesi bize
-- kalir, kalani tedarikciye odenir. Alis fiyati yoktur; maliyet SATIS ANINDA
-- belli olur:  maliyet = satis x (100 - bizim pay) / 100.
--
-- Uc duzeyde tanim, en ozel kazanir:
--   products.konsinye / konsinye_pay_pct    null = ustten devral, false = degil
--   brands.konsinye / konsinye_pay_pct      Urunler (Raf) sayfasindaki markalar
--   categories.konsinye / konsinye_pay_pct  IZIPIZI gibi "marka = kategori" gruplari
-- Marka ya da kategori konsinye diyorsa urun konsinyedir; pay once urunden,
-- sonra markadan, sonra kategoriden okunur.
--
-- Ikram: ikram kalemin cirosu 0, ama tedarikcinin mali gitti. Mutfak hakedisi
-- gibi (nip_mutfak_hakedis_raporu) ikram LISTE fiyatindan tedarikciye borc
-- yazar; karlilikta ikramin bedeli eksi kar olarak gorunur. Dogrusu budur.
--
-- Dokunulan raporlar: urun_karliligi (yeni kaynak 'pay'), eksik_maliyetler
-- (konsinye urun "alis fiyati eksik" listesine dusmez). Yeni rapor:
-- nip_konsinye_raporu — tedarikci bazinda satis, bizim pay, odenecek.
--
-- Bu dosya hicbir nesneyi kaldirmaz; yalniz ekler ve yeniden tanimlar.
-- ============================================================================

alter table public.categories add column if not exists konsinye boolean not null default false;
alter table public.categories add column if not exists konsinye_pay_pct numeric;
alter table public.brands     add column if not exists konsinye boolean not null default false;
alter table public.brands     add column if not exists konsinye_pay_pct numeric;
alter table public.products   add column if not exists konsinye boolean;
alter table public.products   add column if not exists konsinye_pay_pct numeric;

comment on column public.categories.konsinye is 'Kategorideki urunler tedarikcinin mali (konsinye). Urun kendi alaniyla ezebilir.';
comment on column public.categories.konsinye_pay_pct is 'Konsinye satista BIZE kalan yuzde (orn. 40). Kalan tedarikciye odenir.';
comment on column public.brands.konsinye is 'Markanin urunleri tedarikcinin mali (konsinye). Urun kendi alaniyla ezebilir.';
comment on column public.brands.konsinye_pay_pct is 'Konsinye satista BIZE kalan yuzde (orn. 40).';
comment on column public.products.konsinye is 'null = marka/kategoriden devral; true/false urun bazinda ezer.';
comment on column public.products.konsinye_pay_pct is 'Urun bazinda bize kalan yuzde; null ise marka/kategori payi.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'categories_konsinye_pay_aralik') then
    alter table public.categories add constraint categories_konsinye_pay_aralik
      check (konsinye_pay_pct is null or (konsinye_pay_pct >= 0 and konsinye_pay_pct <= 100));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'brands_konsinye_pay_aralik') then
    alter table public.brands add constraint brands_konsinye_pay_aralik
      check (konsinye_pay_pct is null or (konsinye_pay_pct >= 0 and konsinye_pay_pct <= 100));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'products_konsinye_pay_aralik') then
    alter table public.products add constraint products_konsinye_pay_aralik
      check (konsinye_pay_pct is null or (konsinye_pay_pct >= 0 and konsinye_pay_pct <= 100));
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- Etkin konsinye durumu ve pay. Tek yerde hesaplanir; raporlar bunu okur.
-- ----------------------------------------------------------------------------
create or replace function public.nip_konsinye_mi(p_product_id uuid)
returns boolean
language sql
stable
set search_path to 'public'
as $$
  select coalesce(p.konsinye, (coalesce(b.konsinye, false) or coalesce(c.konsinye, false)))
    from public.products p
    left join public.brands b on b.id = p.brand_id
    left join public.categories c on c.id = p.category_id
   where p.id = p_product_id
$$;

create or replace function public.nip_konsinye_pay(p_product_id uuid)
returns numeric
language sql
stable
set search_path to 'public'
as $$
  select case
           when coalesce(p.konsinye, (coalesce(b.konsinye, false) or coalesce(c.konsinye, false)))
             then coalesce(p.konsinye_pay_pct,
                           case when coalesce(b.konsinye, false) then b.konsinye_pay_pct end,
                           case when coalesce(c.konsinye, false) then c.konsinye_pay_pct end)
         end
    from public.products p
    left join public.brands b on b.id = p.brand_id
    left join public.categories c on c.id = p.category_id
   where p.id = p_product_id
$$;

comment on function public.nip_konsinye_mi(uuid) is 'Urun konsinye mi: urun alani, yoksa marka ya da kategori.';
comment on function public.nip_konsinye_pay(uuid) is 'Konsinye urunde BIZE kalan yuzde (urun > marka > kategori). Konsinye degilse ya da pay yazilmadiysa null.';

-- Tedarikci adi: konsinye diyen marka, yoksa kategori, yoksa urunun marka metni.
create or replace function public.nip_konsinye_tedarikci(p_product_id uuid)
returns text
language sql
stable
set search_path to 'public'
as $$
  select coalesce(case when coalesce(b.konsinye, false) then b.name end,
                  case when coalesce(c.konsinye, false) then c.name end,
                  nullif(p.brand, ''), b.name, c.name, '—')
    from public.products p
    left join public.brands b on b.id = p.brand_id
    left join public.categories c on c.id = p.category_id
   where p.id = p_product_id
$$;

-- ----------------------------------------------------------------------------
-- URUN KARLILIGI — yeni maliyet kaynagi 'pay' (konsinye payi).
-- 20260825_urun_karliligi.sql ile ayni govde; farklar:
--   kalem.taban  : ikramda liste fiyati, digerinde satis fiyati (tedarikci tabani)
--   hesap.kaynak : kitchen_consignment'tan hemen sonra 'pay'
--   hesap.maliyet: 'pay' ise taban x (100 - pay) / 100
-- ----------------------------------------------------------------------------
create or replace function public.urun_karliligi(
  p_store_id uuid,
  p_bas date default null,
  p_bit date default null)
returns table (
  product_id      uuid,
  urun            text,
  kategori        text,
  adet            numeric,
  ikram_adet      numeric,
  ciro            numeric,
  maliyet         numeric,
  maliyet_kaynagi text,     -- kayit | tahmini | karma | alis | pay | konsinye | yok
  maliyet_eksik   boolean,
  kar             numeric,
  marj            numeric
)
language plpgsql
stable
set search_path to 'public'
as $$
declare v_bas date; v_bit date;
begin
  if current_user in ('authenticated', 'anon') then
    if not public.is_staff() then
      raise exception 'urun karliligi: yetkisiz';
    end if;
    if not exists (select 1 from public.staff s
                    where s.auth_id = (select auth.uid()) and s.is_active
                      and p_store_id = any(s.store_ids)) then
      raise exception 'urun karliligi: bu magaza icin yetkin yok';
    end if;
  end if;

  v_bit := coalesce(p_bit, public.nip_business_day(now()));
  v_bas := coalesce(p_bas, v_bit - 29);

  return query
  with kalem as (
    select oi.id, oi.product_id, coalesce(oi.quantity, 1) as adet,
           coalesce(oi.final_price, 0) * coalesce(oi.quantity, 1) as ciro,
           -- Tedarikci tabani: ikramda liste fiyati (tedarikci ikramdan zarar etmez)
           case when oi.is_treat then coalesce(oi.product_price, 0) * coalesce(oi.quantity, 1)
                else coalesce(oi.final_price, 0) * coalesce(oi.quantity, 1) end as taban,
           oi.is_treat,
           (select coalesce(sum(-sm.qty_delta * sm.unit_cost), 0)
              from public.stock_moves sm where sm.order_item_id = oi.id) as kayitli_maliyet,
           exists (select 1 from public.stock_moves sm where sm.order_item_id = oi.id) as kayit_var
      from public.order_items oi
      join public.orders o on o.id = oi.order_id
     where o.origin_store_id = p_store_id
       and o.status = 'paid'
       and public.nip_business_day(coalesce(o.paid_at, o.updated_at)) between v_bas and v_bit
  ),
  recete as (
    select r.product_id,
           sum(r.qty_per_unit * (1 + coalesce(i.waste_pct, 0) / 100.0) * coalesce(i.cost_per_unit, 0)) as birim,
           bool_or(coalesce(i.cost_per_unit, 0) = 0) as eksik
      from public.recipes r
      join public.ingredients i on i.id = r.ingredient_id
     where not coalesce(r.party_only, false)
     group by r.product_id
  ),
  toplu as (
    select k.product_id,
           sum(k.adet)                                       as adet,
           sum(case when k.is_treat then k.adet else 0 end)  as ikram_adet,
           sum(k.ciro)                                       as ciro,
           sum(k.taban)                                      as taban,
           sum(k.kayitli_maliyet)                            as kayitli,
           sum(case when k.kayit_var then 0 else k.adet end) as kayitsiz_adet
      from kalem k
     where k.product_id is not null
     group by k.product_id
  ),
  hesap as (
    select t.*, p.name as urun, coalesce(c.name, '—') as kategori,
           case
             when p.kitchen_consignment                      then 'konsinye'
             when kp.pay is not null                         then 'pay'
             when r.product_id is not null and t.kayitsiz_adet = 0 then 'kayit'
             when r.product_id is not null and t.kayitli = 0 then 'tahmini'
             when r.product_id is not null                   then 'karma'
             when coalesce(p.cost_price, 0) > 0              then 'alis'
             when t.kayitli > 0                              then 'kayit'
             else 'yok'
           end as kaynak,
           coalesce(r.eksik, false) as eksik,
           (case
              when p.kitchen_consignment then 0
              when kp.pay is not null
                then t.taban * (100 - kp.pay) / 100.0
              when r.product_id is not null
                then t.kayitli + coalesce(r.birim, 0) * t.kayitsiz_adet
              when coalesce(p.cost_price, 0) > 0
                then p.cost_price * t.adet
              else t.kayitli
            end)::numeric as maliyet
      from toplu t
      join public.products p on p.id = t.product_id
      left join public.categories c on c.id = p.category_id
      left join recete r on r.product_id = t.product_id
      left join lateral (select public.nip_konsinye_pay(p.id) as pay) kp on true
  )
  select
    h.product_id,
    h.urun::text,
    h.kategori::text,
    h.adet::numeric,
    h.ikram_adet::numeric,
    round(h.ciro::numeric, 2),
    case when h.kaynak in ('yok', 'konsinye') then null else round(h.maliyet, 2) end,
    h.kaynak::text,
    (h.eksik and h.kaynak not in ('yok', 'konsinye')),
    case when h.kaynak in ('yok', 'konsinye') then null
         else round(h.ciro::numeric - h.maliyet, 2) end,
    case when h.ciro > 0 and h.kaynak not in ('yok', 'konsinye')
         then round((h.ciro::numeric - h.maliyet) / h.ciro::numeric * 100, 1) end
  from hesap h
  order by case when h.kaynak in ('yok', 'konsinye') then 1 else 0 end,
           case when h.kaynak in ('yok', 'konsinye') then h.ciro
                else h.ciro - h.maliyet end desc nulls last;
end $$;

comment on function public.urun_karliligi(uuid, date, date) is
  'Urun bazli ciro / maliyet / kar. Maliyet sirasiyla: konsinye payi (satisin '
  'tedarikci yuzdesi), recete kaydi (stock_moves fotografi), recete tahmini, '
  'urunun alis fiyati. maliyet_kaynagi hangisi oldugunu soyler.';

-- ----------------------------------------------------------------------------
-- EKSIK MALIYETLER — konsinye urun "alis fiyati yok" diye listelenmez.
-- 20260826_denetim_maliyet_ve_sure.sql govdesi + tek sart.
-- ----------------------------------------------------------------------------
create or replace function public.eksik_maliyetler(p_store_id uuid)
returns table (tip text, kayit_id uuid, ad text, alt text, nerede text, ciro numeric, adet numeric)
language plpgsql
stable
set search_path to 'public'
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if not public.is_staff() then
      raise exception 'eksik maliyetler: yetkisiz';
    end if;
    if not exists (select 1 from public.staff s
                    where s.auth_id = (select auth.uid()) and s.is_active
                      and p_store_id = any(s.store_ids)) then
      raise exception 'eksik maliyetler: bu magaza icin yetkin yok';
    end if;
  end if;

  return query
  with satis as (
    select oi.product_id,
           sum(coalesce(oi.final_price,0) * coalesce(oi.quantity,1)) as ciro,
           sum(coalesce(oi.quantity,1))                              as adet
      from public.order_items oi
      join public.orders o on o.id = oi.order_id
     where o.status = 'paid' and o.origin_store_id = p_store_id
     group by oi.product_id
  ),
  malzeme as (
    select 'malzeme'::text tip, i.id, i.name::text ad, i.unit::text alt,
           string_agg(distinct p.name, ' · ' order by p.name)::text nerede,
           coalesce(sum(s.ciro), 0)::numeric ciro,
           coalesce(sum(s.adet), 0)::numeric adet
      from public.ingredients i
      join public.recipes r on r.ingredient_id = i.id
      join public.products p on p.id = r.product_id
      left join satis s on s.product_id = r.product_id
     where coalesce(i.cost_per_unit, 0) = 0
       and i.store_id = p_store_id
     group by i.id, i.name, i.unit
  ),
  -- Alis fiyati girilmemis urunler: recetesi yok, mutfak konsinyesi degil,
  -- tedarikci konsinyesi de degil (onun maliyeti satistan hesaplanir).
  urun as (
    select 'urun'::text tip, p.id, p.name::text ad, coalesce(c.name, '—')::text alt,
           ('Satış ₺' || trim(to_char(p.price, 'FM999999990.00')))::text nerede,
           coalesce(s.ciro, 0)::numeric ciro,
           coalesce(s.adet, 0)::numeric adet
      from public.products p
      left join public.categories c on c.id = p.category_id
      left join satis s on s.product_id = p.id
     where p.store_id = p_store_id
       and p.cost_price is null
       and not p.kitchen_consignment
       and not coalesce(public.nip_konsinye_mi(p.id), false)
       and not exists (select 1 from public.recipes r where r.product_id = p.id)
  )
  select * from malzeme
  union all
  select * from urun
  order by ciro desc, adet desc, ad;
end $$;

-- ----------------------------------------------------------------------------
-- KONSINYE RAPORU — tedarikciye ne odenecek.
-- Donem: isletme gunu (03:00) ile, odenmis fisler, odeme tarihine gore.
-- Varsayilan: icinde bulunulan ay. satis = gercek tahsilat; taban = tedarikci
-- tabani (ikram liste fiyatindan); bizim_pay = taban x pay / 100 (ikramda
-- eksi: mali verdik, para almadik); tedarikci_pay = taban - bizim_pay.
-- ----------------------------------------------------------------------------
create or replace function public.nip_konsinye_raporu(
  p_store_id uuid,
  p_bas date default null,
  p_bit date default null)
returns table (
  tedarikci     text,
  product_id    uuid,
  urun          text,
  adet          numeric,
  ikram_adet    numeric,
  satis         numeric,
  taban         numeric,
  pay_pct       numeric,
  bizim_pay     numeric,
  tedarikci_pay numeric
)
language plpgsql
stable
set search_path to 'public'
as $$
declare v_bas date; v_bit date;
begin
  if current_user in ('authenticated', 'anon') then
    if not public.is_staff() then
      raise exception 'konsinye raporu: yetkisiz';
    end if;
    if not exists (select 1 from public.staff s
                    where s.auth_id = (select auth.uid()) and s.is_active
                      and p_store_id = any(s.store_ids)) then
      raise exception 'konsinye raporu: bu magaza icin yetkin yok';
    end if;
  end if;

  v_bit := coalesce(p_bit, public.nip_business_day(now()));
  v_bas := coalesce(p_bas, date_trunc('month', v_bit)::date);

  return query
  with kalem as (
    select oi.product_id, coalesce(oi.quantity, 1) as adet, oi.is_treat,
           coalesce(oi.final_price, 0) * coalesce(oi.quantity, 1) as satis,
           case when oi.is_treat then coalesce(oi.product_price, 0) * coalesce(oi.quantity, 1)
                else coalesce(oi.final_price, 0) * coalesce(oi.quantity, 1) end as taban
      from public.order_items oi
      join public.orders o on o.id = oi.order_id
     where o.origin_store_id = p_store_id
       and o.status = 'paid'
       and oi.product_id is not null
       and public.nip_business_day(coalesce(o.paid_at, o.updated_at)) between v_bas and v_bit
       and coalesce(public.nip_konsinye_mi(oi.product_id), false)
  ),
  toplu as (
    select k.product_id,
           sum(k.adet) as adet,
           sum(case when k.is_treat then k.adet else 0 end) as ikram_adet,
           sum(k.satis) as satis,
           sum(k.taban) as taban
      from kalem k
     group by k.product_id
  )
  select
    public.nip_konsinye_tedarikci(t.product_id)::text,
    t.product_id,
    p.name::text,
    t.adet::numeric,
    t.ikram_adet::numeric,
    round(t.satis::numeric, 2),
    round(t.taban::numeric, 2),
    kp.pay,
    case when kp.pay is null then null
         else round((t.satis - t.taban * (100 - kp.pay) / 100.0)::numeric, 2) end,
    case when kp.pay is null then null
         else round((t.taban * (100 - kp.pay) / 100.0)::numeric, 2) end
  from toplu t
  join public.products p on p.id = t.product_id
  left join lateral (select public.nip_konsinye_pay(t.product_id) as pay) kp on true
  order by 1, t.satis desc, p.name;
end $$;

comment on function public.nip_konsinye_raporu(uuid, date, date) is
  'Konsinye urunlerin donem satisi: tedarikci, adet, satis, bizim pay, tedarikciye odenecek. '
  'Ikram liste fiyatindan tedarikciye borc yazar. Donem isletme gunuyle (03:00) kesilir.';

revoke all on function public.nip_konsinye_mi(uuid) from anon, public;
revoke all on function public.nip_konsinye_pay(uuid) from anon, public;
revoke all on function public.nip_konsinye_tedarikci(uuid) from anon, public;
revoke all on function public.nip_konsinye_raporu(uuid, date, date) from anon, public;
revoke all on function public.urun_karliligi(uuid, date, date) from anon, public;
revoke all on function public.eksik_maliyetler(uuid) from anon, public;
grant execute on function public.nip_konsinye_mi(uuid) to authenticated;
grant execute on function public.nip_konsinye_pay(uuid) to authenticated;
grant execute on function public.nip_konsinye_tedarikci(uuid) to authenticated;
grant execute on function public.nip_konsinye_raporu(uuid, date, date) to authenticated;
grant execute on function public.urun_karliligi(uuid, date, date) to authenticated;
grant execute on function public.eksik_maliyetler(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Sahibin verdigi ilk tanim: IZIPIZI kategorisi konsinye, %40 bizim.
-- Yalniz pay bos ise yazar; sonradan degistirilen deger ezilmez.
-- ----------------------------------------------------------------------------
update public.categories
   set konsinye = true, konsinye_pay_pct = 40
 where id = 'a5722dd1-e0f9-4a71-ae2d-30fb19003475'
   and store_id = 'c3c6e0c7-1821-4edd-993d-ad960cfbc452'
   and konsinye_pay_pct is null;
