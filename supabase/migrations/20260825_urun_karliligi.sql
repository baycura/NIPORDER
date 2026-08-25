-- ============================================================================
-- URUN BAZLI KARLILIK                                  20260825_urun_karliligi
-- ============================================================================
-- "Hangi urun para kazandiriyor?" sorusunun cevabi bugune kadar hicbir ekranda
-- yoktu. Recete sayfasi tek bir urunun birim maliyetini gosteriyor ama satis
-- adediyle carpilmis hali, yani gercek katki hicbir yerde gorunmuyordu.
--
-- MALIYET UC KAYNAKTAN GELIR — sirasiyla:
--   1) KAYIT   — stock_moves'taki satis anindaki fotograf (dogru olan budur)
--   2) TAHMINI — kaydi olmayan satislar icin BUGUNKU recete maliyeti
--   3) ALIS    — recetesi olmayan urunlerde products.cost_price (tisort, gozluk)
-- Karistirilmaz: her satir maliyetinin hangi kaynaktan geldigini soyler.
-- Stok dusumu 20260825_stok_hareketleri_ve_maliyet.sql ile basladigi icin
-- ondan onceki satislarda kayit yoktur; ekran bunu "tahmini" diye isaretler,
-- gizlemez.
--
-- NEDEN cost_price KOLONU EKLENDI
-- Canli olcum: PARIS'te 12 urun / 66.246 TL ciro "maliyet bilinmiyor" grubunda
-- kaliyordu — toplam cironun ucte ikisi. Hepsi tisort, gozluk, sapka gibi
-- recetesi olmayan satis urunleri. Cironun ucte ikisini goremeyen bir karlilik
-- raporu is gormez.
--
-- MALIYETI EKSIK GIRILMIS MALZEME
-- Recetede maliyeti 0 olan bir malzeme varsa urun oldugundan karli gorunur
-- (canli ornek: Corona %100 marj). maliyet_eksik bayragi bunu isaretler,
-- ekran uyari rozetiyle gosterir — sayiyi gizlemez ama guvenilmez oldugunu soyler.
--
-- IKRAM
-- is_treat kaleminin final_price'i 0'a cekiliyor (OrderDetailPage.jsx:134), yani
-- cirosu zaten sifir. Maliyeti ise gercek. Bu yuzden ikram verilen urun eksi
-- karla gorunur — dogrusu budur, ikramin bedeli boyle gorunur olur.
--
-- PUAN
-- points_used SIPARIS duzeyinde tutuluyor, kalem duzeyinde degil. Kalem bazli
-- ciroya dagitilmaz; urunun kendi performansini olcuyoruz.
--
-- KONSINYE
-- kitchen_consignment=true urunlerin maliyeti bizde tutulmuyor (mutfak
-- hazirliyor, ay sonu hakedis olarak odeniyor — SettlementPage). Kar hesabi
-- yapilmaz, ciro tarafiyla listelenir.
--
-- Geri alma:
--   drop function if exists public.urun_karliligi(uuid, date, date);
--   drop function if exists public.nip_business_day(timestamptz);
--   alter table public.products drop column if exists cost_price;
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Isletme gunu: gun 03:00 TR'de biter (src/lib/businessDay.js ile birebir ayni).
-- Tarayicidan tarih GONDERILMEZ; cihaz saati yanlissa rapor kayar.
-- ----------------------------------------------------------------------------
create or replace function public.nip_business_day(ts timestamptz default now())
returns date
language sql
stable
set search_path to 'public'
as $$ select ((ts at time zone 'Europe/Istanbul') - interval '3 hours')::date $$;

comment on function public.nip_business_day(timestamptz) is
  'Bir zaman damgasinin ait oldugu isletme gunu. Gun TR saatiyle 03:00''te biter.';

-- ----------------------------------------------------------------------------
-- Recetesi olmayan urunlerin birim alis fiyati.
-- ----------------------------------------------------------------------------
alter table public.products add column if not exists cost_price numeric;

comment on column public.products.cost_price is
  'Birim alis fiyati (TL). Recetesi olmayan urunler icin maliyet buradan gelir. '
  'Recetesi olan urunlerde KULLANILMAZ, orada maliyet receteden hesaplanir.';

-- ----------------------------------------------------------------------------
-- URUN KARLILIGI
-- SECURITY INVOKER: personel zaten orders/order_items/stock_moves/products
-- okuyabiliyor; RLS'i devre disi birakacak bir sebep yok. Magaza yetkisi
-- ayrica kontrol ediliyor — bir magazanin muduru otekinin cirosunu gormesin.
-- ----------------------------------------------------------------------------
drop function if exists public.urun_karliligi(uuid, date, date);

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
  maliyet_kaynagi text,     -- kayit | tahmini | karma | alis | konsinye | yok
  maliyet_eksik   boolean,  -- recetede maliyeti girilmemis malzeme var mi
  kar             numeric,
  marj            numeric   -- kar / ciro * 100, ciro 0 ise null
)
language plpgsql
stable
set search_path to 'public'
as $$
declare v_bas date; v_bit date;
begin
  -- Yetki. service_role (BYPASSRLS, PayTR/bakim) bu kapidan muaf.
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
           oi.is_treat,
           -- Kayitli maliyet: satis anindaki birim fiyattan. Iptal edilmis
           -- kalemler ters kayitla sifirlandigi icin buraya 0 gelir.
           (select coalesce(sum(-sm.qty_delta * sm.unit_cost), 0)
              from public.stock_moves sm where sm.order_item_id = oi.id) as kayitli_maliyet,
           exists (select 1 from public.stock_moves sm where sm.order_item_id = oi.id) as kayit_var
      from public.order_items oi
      join public.orders o on o.id = oi.order_id
     where o.origin_store_id = p_store_id
       and o.status = 'paid'
       and public.nip_business_day(coalesce(o.paid_at, o.updated_at)) between v_bas and v_bit
  ),
  -- Bugunku recete maliyeti. party_only satirlar haric: normal gunun maliyeti
  -- baz alinir (RecipesMgmtPage de "normal gun" maliyetini ayri gosteriyor).
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
           sum(k.kayitli_maliyet)                            as kayitli,
           sum(case when k.kayit_var then 0 else k.adet end) as kayitsiz_adet
      from kalem k
     where k.product_id is not null
     group by k.product_id
  ),
  hesap as (
    select t.*, p.name as urun, coalesce(c.name, '—') as kategori,
           case
             when p.kitchen_consignment                            then 'konsinye'
             when r.product_id is not null and t.kayitsiz_adet = 0 then 'kayit'
             when r.product_id is not null and t.kayitli = 0       then 'tahmini'
             when r.product_id is not null                         then 'karma'
             when coalesce(p.cost_price, 0) > 0                    then 'alis'
             when t.kayitli > 0                                    then 'kayit'
             else 'yok'
           end as kaynak,
           coalesce(r.eksik, false) as eksik,
           -- Kayitli olan kayitli fiyattan, kayitsiz olan bugunku receteden;
           -- recetesi hic yoksa alis fiyatindan.
           (case
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
  'Urun bazli ciro / maliyet / kar. Maliyet sirasiyla: recete kaydi (stock_moves '
  'fotografi), recete tahmini, urunun alis fiyati. maliyet_kaynagi hangisi '
  'oldugunu, maliyet_eksik ise recetede maliyeti girilmemis malzeme olup '
  'olmadigini soyler.';

-- DIKKAT: yalniz "from public" YETMEZ. Supabase, public semasindaki
-- fonksiyonlara anon icin de VARSAYILAN EXECUTE verir ve revoke from public
-- bunu kaldirmaz.
revoke all on function public.urun_karliligi(uuid, date, date) from anon, public;
grant execute on function public.urun_karliligi(uuid, date, date) to authenticated;
revoke all on function public.nip_business_day(timestamptz) from anon, public;
grant execute on function public.nip_business_day(timestamptz) to authenticated;
