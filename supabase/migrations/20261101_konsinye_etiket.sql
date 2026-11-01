-- ============================================================================
-- KONSINYE PAYI ETIKET FIYATINDAN                        20261101_konsinye_etiket
-- ============================================================================
-- Sahip (1.11): "Indirimli fiyat uzerinden %60 degil, etiket fiyati uzerinden
-- %60 firmalarin." Tedarikci payi her zaman ETIKET (liste) fiyatinin yuzdesi;
-- kasada yapilan indirim ve ikram bizim paydan duser.
--
--   tedarikci_pay = etiket x adet x (100 - bizim pay) / 100
--   bizim_pay     = gercek satis - tedarikci_pay   (indirimde azalir, eksiye dusebilir)
--   karlilik      : maliyet = tedarikci_pay, kar = satis - maliyet
--
-- 20261024_konsinye.sql'deki urun_karliligi ve nip_konsinye_raporu yeniden
-- tanimlanir; yalniz "taban" satiri degisti. Hicbir nesne kaldirilmaz.
-- ============================================================================

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
           -- Tedarikci tabani: ETIKET fiyati (sahip 1.11: indirim ve ikram bizim
           -- paydan duser, tedarikci her zaman etiketin yuzdesini alir)
           coalesce(oi.product_price, 0) * coalesce(oi.quantity, 1) as taban,
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
             when kp.mi                                      then 'yok'
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
              when kp.mi then 0
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
      left join lateral (select coalesce(public.nip_konsinye_mi(p.id), false) as mi,
                                public.nip_konsinye_pay(p.id) as pay) kp on true
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
  'Urun bazli ciro / maliyet / kar. Maliyet sirasiyla: konsinye payi (ETIKET fiyatinin '
  'tedarikci yuzdesi), recete kaydi (stock_moves fotografi), recete tahmini, '
  'urunun alis fiyati. maliyet_kaynagi hangisi oldugunu soyler.';

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
           -- Tedarikci tabani: ETIKET fiyati; indirim ve ikram bizim paydan duser
           coalesce(oi.product_price, 0) * coalesce(oi.quantity, 1) as taban
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
  'Tedarikci payi ETIKET fiyatindan; indirim ve ikram bizim paydan duser. Donem isletme gunuyle (03:00) kesilir.';

revoke all on function public.urun_karliligi(uuid, date, date) from anon, public;
revoke all on function public.nip_konsinye_raporu(uuid, date, date) from anon, public;
grant execute on function public.urun_karliligi(uuid, date, date) to authenticated;
grant execute on function public.nip_konsinye_raporu(uuid, date, date) to authenticated;
