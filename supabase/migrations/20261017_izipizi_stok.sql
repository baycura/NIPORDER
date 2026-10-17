-- IZIPIZI ceki listesi (sevkiyat 06.10.2026, 26 adet; sahip 17.10'da verdi).
--
-- 1. products.barkod: EAN/GTIN. Sevkiyat listesi, stok sayimi ve ileride
--    Shopify eslesmesi barkoda gore yapilir. 13.10'da adlar barkoda gore
--    yazilmisti ama barkod saklanmamisti; eslesme ancak goc dosyasindan
--    okunabiliyordu.
-- 2. 26 urunun barkodu yazilir (ad eslesmesi 20261013_izipizi_raf ile ayni).
-- 3. Stok: listede her urunden 1 adet. Sevkiyattan sonra satilan dusulur
--    (Speed L Sand 11.10'da satildi -> 0). track_stock acilir: satista
--    fn_decrement_retail_stock duser, personel ekrani "Stok: 0" gosterir.
-- 4. 3701210447742 rengi listede: GOLDEN GREEN. "Sun #D" -> "Sun #D Golden Green".
--
-- Listedeki perakende fiyatlar (Psf) sistemdeki fiyatlarla ayni; dokunulmaz.
-- Hicbir nesne silinmez.

alter table public.products add column if not exists barkod text;

comment on column public.products.barkod is
  'EAN/GTIN barkod. Sevkiyat listesi ve stok eslesmesi icin (20261017_izipizi_stok).';

create unique index if not exists products_barkod_tek
  on public.products (barkod) where barkod is not null;

with liste(ean, ad) as (values
  ('3701210418001', 'Zenith L Hazel Crystal'),
  ('3701210425542', 'Journey Sand Polarized'),
  ('3701210428666', 'Sun #D Tortoise Polarized'),
  ('3701210428673', 'Sun #D Light Tortoise Polarized'),
  ('3701210428895', 'Speed L Night Blue'),
  ('3701210428956', 'Speed L Sand'),
  ('3701210429014', 'Speed L Hazel'),
  ('3701210432885', 'Sun #C Golden Green'),
  ('3701210433158', 'Glacier #G Black'),
  ('3701210433226', 'Glacier #I Black'),
  ('3701210433288', 'Glacier #I Icey Blue'),
  ('3701210434766', 'Sun #C Tortoise'),
  ('3701210437767', 'Horizon Night Blue Polarized'),
  ('3701210444055', 'Sun #D Black Road Polarized'),
  ('3701210444086', 'CLIFF Black Road'),
  ('3701210444093', 'Sun #C Golden Canyon Polarized'),
  ('3701210444109', 'Sun #D Golden Canyon Polarized'),
  ('3701210444130', 'CLIFF Golden Canyon'),
  ('3701210445120', 'Sun #D Black'),
  ('3701210447742', 'Sun #D'),
  ('3701210449258', 'Sun #D Station Seat'),
  ('3701210449265', 'Sun #D Dark Expresso'),
  ('3701210449272', 'Sun #D Urban Steel'),
  ('3760222625388', 'Sun #C Blue Tortoise'),
  ('3760222625456', 'Sun #D Blue Tortoise'),
  ('3760247696622', 'Journey Night Blue Polarized'))
update public.products p
   set barkod = l.ean
  from liste l
 where p.category_id = 'a5722dd1-e0f9-4a71-ae2d-30fb19003475'
   and p.name = l.ad
   and p.barkod is null;

-- Stok yalniz ilk calismada yazilir (track_stock henuz kapaliyken).
update public.products p
   set track_stock = true,
       retail_stock = greatest(0, 1 - coalesce((
         select sum(oi.quantity)
           from public.order_items oi
           join public.orders o on o.id = oi.order_id
          where oi.product_id = p.id
            and o.status::text = 'paid'
            and o.created_at >= timestamptz '2026-10-06 00:00+03'), 0)),
       updated_at = now()
 where p.category_id = 'a5722dd1-e0f9-4a71-ae2d-30fb19003475'
   and p.barkod is not null
   and p.track_stock is not true;

update public.products
   set name = 'Sun #D Golden Green',
       name_en = null, name_ru = null,
       description = 'Güneş gözlüğü · altın yeşili (sarı)',
       description_en = 'Sunglasses · golden green (yellow)',
       description_ru = 'Солнцезащитные очки · золотисто-зелёные (жёлтые)',
       updated_at = now()
 where barkod = '3701210447742' and name = 'Sun #D';
