-- IZIPIZI rafa tasindi + raf urunleri mutfaga dusmez.
--
-- Sahibin karari (13.10): "IZIPIZI Kitchen tarafinda, shop tarafinda olmali.
-- Urunlerin kod numaralarina gore siteden isimleri girilsin."
--
-- 1. IZIPIZI kategorisi musteri Shop sekmesine acilir (show_in_shop). Etiket
--    ve aciklama tr/en/ru.
-- 2. 26 urunun adi barkoddu ("3701210449258"). Adlar barkoda gore perakende
--    ve izipizi.com sayfalarindan bulundu (IZIPIZI'nin Turkiye distributoru
--    Popcorner'in fiyatlari raftaki fiyatlarla ayni). Marka "IZIPIZI": kasada
--    "izipizi" aramasi hepsini bulur, fiste "Sun #D Black (IZIPIZI)" yazar.
--    3701210447742 hicbir kaynakta yok: "Sun #D" diye girildi, rengi kutudan
--    okunup Menu Yonetimi'nden eklenmeli.
-- 3. Raf urunu mutfaga dusmez (sunucu kurali). Olcum (60 gun): personelin
--    girdigi raf urunlerinin cogu mutfaga dustu — Murphy, Pas Normal, Lot
--    Roastery, Not in Paris (28), IZIPIZI. Sebep: kasa ekrani yalniz
--    "staff_only" ya da "track_stock"u raf sayiyordu, Shop kategorisini degil.
--    QR'dan gelen raf kalemi de "pending" kaliyordu (hic hazir olmuyordu).
--    Raf urunu = urun stok takipli YA DA kategorisi Shop'ta YA DA yalniz
--    personel. Bu urunlerin kalemi sent_to_kitchen=false, kitchen_status=
--    'served' yazilir. Stok takipli urunlerin hepsi zaten Shop ya da yalniz
--    personel kategorisinde (13.10 olcumu): icecek siparisleri etkilenmez.
--
-- Hicbir nesne silinmez. Gecmis kalemlere dokunulmaz.

-- 3 ---------------------------------------------------------------------------
create or replace function public.fn_raf_kalemi_mutfaga_gitmez()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if coalesce(new.sent_to_kitchen, true) and new.product_id is not null and exists (
       select 1 from public.products p
         left join public.categories c on c.id = p.category_id
        where p.id = new.product_id
          and (coalesce(p.track_stock, false)
               or coalesce(c.show_in_shop, false)
               or coalesce(c.staff_only, false))) then
    new.sent_to_kitchen := false;
    if tg_op = 'INSERT' and coalesce(new.kitchen_status, 'pending') = 'pending' then
      new.kitchen_status := 'served';
    end if;
  end if;
  return new;
end $function$;

comment on function public.fn_raf_kalemi_mutfaga_gitmez() is
  'Raf urunu (stok takipli, Shop ya da yalniz personel kategorisi) mutfaga '
  'dusmez: sent_to_kitchen=false, yeni kalemde kitchen_status=served '
  '(20261013_izipizi_raf).';

revoke execute on function public.fn_raf_kalemi_mutfaga_gitmez() from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_trigger
                  where tgname = 'trg_raf_kalemi_mutfaga_gitmez'
                    and tgrelid = 'public.order_items'::regclass) then
    create trigger trg_raf_kalemi_mutfaga_gitmez
      before insert or update of sent_to_kitchen on public.order_items
      for each row execute function public.fn_raf_kalemi_mutfaga_gitmez();
  end if;
end $$;

-- 1 ---------------------------------------------------------------------------
update public.categories
   set show_in_shop   = true,
       staff_only     = false,
       icon           = '🕶️',
       shop_tag       = 'Güneş Gözlüğü',
       shop_tag_en    = 'Sunglasses',
       shop_tag_ru    = 'Солнцезащитные очки',
       description    = 'Paris''ten IZIPIZI: güneş gözlükleri ve spor gözlükleri.',
       description_en = 'IZIPIZI from Paris: sunglasses and sports glasses.',
       description_ru = 'IZIPIZI из Парижа: солнцезащитные и спортивные очки.'
 where id = 'a5722dd1-e0f9-4a71-ae2d-30fb19003475';

-- 2 ---------------------------------------------------------------------------
-- Eslesme ADA (barkoda) gore: yeniden calistirilirsa ad degistigi icin hicbir
-- satira dokunmaz. Fiyat, stok ve kategori degismez.
with yeni(ean, ad, grup, sira, tr, en, ru) as (values
  -- Klasik Sun
  ('3701210445120', 'Sun #D Black', 'Güneş Gözlüğü', 10,
   'Güneş gözlüğü · siyah · gri cam', 'Sunglasses · black · grey lenses',
   'Солнцезащитные очки · чёрные · серые линзы'),
  ('3701210434766', 'Sun #C Tortoise', 'Güneş Gözlüğü', 11,
   'Güneş gözlüğü · kaplumbağa deseni (kahverengi)', 'Sunglasses · tortoise (brown)',
   'Солнцезащитные очки · черепаховый узор (коричневые)'),
  ('3760222625388', 'Sun #C Blue Tortoise', 'Güneş Gözlüğü', 12,
   'Güneş gözlüğü · mavi kaplumbağa deseni · gri cam', 'Sunglasses · blue tortoise · grey lenses',
   'Солнцезащитные очки · синий черепаховый узор · серые линзы'),
  ('3760222625456', 'Sun #D Blue Tortoise', 'Güneş Gözlüğü', 13,
   'Güneş gözlüğü · mavi kaplumbağa deseni · gri cam', 'Sunglasses · blue tortoise · grey lenses',
   'Солнцезащитные очки · синий черепаховый узор · серые линзы'),
  ('3701210432885', 'Sun #C Golden Green', 'Güneş Gözlüğü', 14,
   'Güneş gözlüğü · altın yeşili (sarı)', 'Sunglasses · golden green (yellow)',
   'Солнцезащитные очки · золотисто-зелёные (жёлтые)'),
  ('3701210449258', 'Sun #D Station Seat', 'Güneş Gözlüğü', 15,
   'Güneş gözlüğü · su yeşili · Morning Express koleksiyonu', 'Sunglasses · soft pale green · Morning Express collection',
   'Солнцезащитные очки · светло-зелёные · коллекция Morning Express'),
  ('3701210449265', 'Sun #D Dark Expresso', 'Güneş Gözlüğü', 16,
   'Güneş gözlüğü · koyu kahverengi · Morning Express koleksiyonu', 'Sunglasses · dark brown · Morning Express collection',
   'Солнцезащитные очки · тёмно-коричневые · коллекция Morning Express'),
  ('3701210449272', 'Sun #D Urban Steel', 'Güneş Gözlüğü', 17,
   'Güneş gözlüğü · açık gri · Morning Express koleksiyonu', 'Sunglasses · light grey · Morning Express collection',
   'Солнцезащитные очки · светло-серые · коллекция Morning Express'),
  -- Barkod hicbir kaynakta yok: renk kutudan okunacak.
  ('3701210447742', 'Sun #D', 'Güneş Gözlüğü', 18,
   'Güneş gözlüğü', 'Sunglasses', 'Солнцезащитные очки'),
  -- Polarize Sun
  ('3701210428666', 'Sun #D Tortoise Polarized', 'Güneş Gözlüğü', 30,
   'Polarize güneş gözlüğü · kaplumbağa deseni (kahverengi)', 'Polarized sunglasses · tortoise (brown)',
   'Поляризационные солнцезащитные очки · черепаховый узор (коричневые)'),
  ('3701210428673', 'Sun #D Light Tortoise Polarized', 'Güneş Gözlüğü', 31,
   'Polarize güneş gözlüğü · açık kaplumbağa deseni (açık kahverengi)', 'Polarized sunglasses · light tortoise (light brown)',
   'Поляризационные солнцезащитные очки · светлый черепаховый узор (светло-коричневые)'),
  ('3701210444055', 'Sun #D Black Road Polarized', 'Güneş Gözlüğü', 32,
   'Polarize güneş gözlüğü · parlak siyah · Crossroads 2026 koleksiyonu', 'Polarized sunglasses · glossy black · Crossroads 2026 collection',
   'Поляризационные солнцезащитные очки · глянцевые чёрные · коллекция Crossroads 2026'),
  ('3701210444093', 'Sun #C Golden Canyon Polarized', 'Güneş Gözlüğü', 33,
   'Polarize güneş gözlüğü · sıcak kum rengi · Crossroads 2026 koleksiyonu', 'Polarized sunglasses · warm sand · Crossroads 2026 collection',
   'Поляризационные солнцезащитные очки · тёплый песочный · коллекция Crossroads 2026'),
  ('3701210444109', 'Sun #D Golden Canyon Polarized', 'Güneş Gözlüğü', 34,
   'Polarize güneş gözlüğü · sıcak kum rengi · Crossroads 2026 koleksiyonu', 'Polarized sunglasses · warm sand · Crossroads 2026 collection',
   'Поляризационные солнцезащитные очки · тёплый песочный · коллекция Crossroads 2026'),
  -- ACTIVE (spor)
  ('3701210418001', 'Zenith L Hazel Crystal', 'Spor Gözlüğü', 50,
   'Spor gözlüğü · her hava (kategori 3) · çıkarılabilir yan koruma · şeffaf kahverengi',
   'Sports glasses · all weather (category 3) · removable side shields · translucent brown',
   'Спортивные очки · для любой погоды (категория 3) · съёмные боковые щитки · прозрачно-коричневые'),
  ('3701210428895', 'Speed L Night Blue', 'Spor Gözlüğü', 51,
   'Bisiklet ve koşu gözlüğü · her hava (kategori 3) · aynalı cam · lacivert',
   'Cycling and running glasses · all weather (category 3) · mirrored lens · navy',
   'Очки для велоспорта и бега · для любой погоды (категория 3) · зеркальные линзы · тёмно-синие'),
  ('3701210428956', 'Speed L Sand', 'Spor Gözlüğü', 52,
   'Bisiklet ve koşu gözlüğü · her hava (kategori 3) · kum rengi',
   'Cycling and running glasses · all weather (category 3) · sand',
   'Очки для велоспорта и бега · для любой погоды (категория 3) · песочные'),
  ('3701210429014', 'Speed L Hazel', 'Spor Gözlüğü', 53,
   'Bisiklet ve koşu gözlüğü · her hava (kategori 3) · kahverengi',
   'Cycling and running glasses · all weather (category 3) · hazel brown',
   'Очки для велоспорта и бега · для любой погоды (категория 3) · коричневые'),
  ('3701210425542', 'Journey Sand Polarized', 'Spor Gözlüğü', 54,
   'Spor gözlüğü · polarize (kategori 3) · kum rengi',
   'Sports glasses · polarized (category 3) · sand',
   'Спортивные очки · поляризационные (категория 3) · песочные'),
  ('3760247696622', 'Journey Night Blue Polarized', 'Spor Gözlüğü', 55,
   'Spor gözlüğü · polarize (kategori 3) · lacivert',
   'Sports glasses · polarized (category 3) · navy',
   'Спортивные очки · поляризационные (категория 3) · тёмно-синие'),
  ('3701210437767', 'Horizon Night Blue Polarized', 'Spor Gözlüğü', 56,
   'Su sporları gözlüğü · polarize (kategori 3) · aynalı cam · lacivert',
   'Water sports glasses · polarized (category 3) · mirrored lens · navy',
   'Очки для водных видов спорта · поляризационные (категория 3) · зеркальные линзы · тёмно-синие'),
  ('3701210433158', 'Glacier #G Black', 'Spor Gözlüğü', 57,
   'Dağ gözlüğü · her hava (kategori 3) · yan koruma · siyah',
   'Mountain glasses · all weather (category 3) · side shields · black',
   'Горные очки · для любой погоды (категория 3) · боковые щитки · чёрные'),
  ('3701210433226', 'Glacier #I Black', 'Spor Gözlüğü', 58,
   'Dağ gözlüğü · pilot çerçeve · her hava (kategori 3) · siyah',
   'Mountain glasses · pilot frame · all weather (category 3) · black',
   'Горные очки · оправа-пилот · для любой погоды (категория 3) · чёрные'),
  ('3701210433288', 'Glacier #I Icey Blue', 'Spor Gözlüğü', 59,
   'Dağ gözlüğü · pilot çerçeve · her hava (kategori 3) · buz mavisi',
   'Mountain glasses · pilot frame · all weather (category 3) · icy blue',
   'Горные очки · оправа-пилот · для любой погоды (категория 3) · ледяной голубой'),
  ('3701210444086', 'CLIFF Black Road', 'Spor Gözlüğü', 60,
   'Spor gözlüğü · pilot çerçeve · aynalı cam (kategori 3) · çıkarılabilir yan koruma · Crossroads 2026',
   'Sports glasses · pilot frame · mirrored lens (category 3) · removable side shields · Crossroads 2026',
   'Спортивные очки · оправа-пилот · зеркальные линзы (категория 3) · съёмные боковые щитки · Crossroads 2026'),
  ('3701210444130', 'CLIFF Golden Canyon', 'Spor Gözlüğü', 61,
   'Spor gözlüğü · pilot çerçeve · degrade cam (kategori 2) · çıkarılabilir yan koruma · Crossroads 2026',
   'Sports glasses · pilot frame · gradient lens (category 2) · removable side shields · Crossroads 2026',
   'Спортивные очки · оправа-пилот · градиентные линзы (категория 2) · съёмные боковые щитки · Crossroads 2026')
)
update public.products p
   set name           = y.ad,
       brand          = 'IZIPIZI',
       shop_group     = y.grup,
       sort_order     = y.sira,
       description    = y.tr,
       description_en = y.en,
       description_ru = y.ru,
       updated_at     = now()
  from yeni y
 where p.category_id = 'a5722dd1-e0f9-4a71-ae2d-30fb19003475'
   and p.name = y.ean;
