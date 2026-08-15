-- Shop marka kutulari: her show_in_shop kategorisi Shop sekmesinde bir
-- "marka kutusu" olarak gorunur — marka adi + kategori etiketi (chip) +
-- mini tanitim yazisi ayni kutunun icinde, urun kartlari ustunde.
--
-- Siralama: Not in Paris (100) en ustte, Ceren Studio (101) hemen altinda,
-- diger markalar 110+ ile alfabetik devam eder. sort_order esitse isim.
--
-- Metinler TR/EN/RU uc dilde tutulur; Menu Yonetimi > kategori formundaki
-- "MARKA KUTUSU" panelinden duzenlenir. Buradaki tanitimlar taslaktir.

alter table public.categories
  add column if not exists description    text,
  add column if not exists description_en text,
  add column if not exists description_ru text,
  add column if not exists shop_tag       text,
  add column if not exists shop_tag_en    text,
  add column if not exists shop_tag_ru    text;

comment on column public.categories.description is
  'Shop marka kutusundaki mini tanitim yazisi (TR). show_in_shop=true kategorilerde kullanilir.';
comment on column public.categories.shop_tag is
  'Shop marka kutusundaki kategori etiketi/chip (TR), orn: Seramik, Taki, Merch.';

-- NIP Merch -> Not in Paris (kafenin kendi markasi, en ustte)
update public.categories set
  name    = 'Not in Paris',
  name_en = 'Not in Paris',
  name_ru = 'Not in Paris'
where name = 'NIP Merch';

update public.categories set sort_order = 100,
  shop_tag = 'Merch', shop_tag_en = 'Merch', shop_tag_ru = 'Мерч',
  description    = 'Kafenin kendi tasarımları. Paris''te değilsin — şapkası burada.',
  description_en = 'Our own designs. You''re not in Paris — but the cap is here.',
  description_ru = 'Наши собственные дизайны. Ты не в Париже — но кепка здесь.'
where name = 'Not in Paris' and show_in_shop;

update public.categories set sort_order = 101,
  shop_tag = 'Giyim & Aksesuar', shop_tag_en = 'Clothing & Accessories', shop_tag_ru = 'Одежда и аксессуары',
  description    = 'Bağımsız bir stüdyodan giyim ve aksesuarlar.',
  description_en = 'Clothing and accessories from an independent studio.',
  description_ru = 'Одежда и аксессуары от независимой студии.'
where name = 'Ceren Studio' and show_in_shop;

update public.categories set sort_order = 110,
  shop_tag = 'Seramik', shop_tag_en = 'Ceramics', shop_tag_ru = 'Керамика',
  description    = 'El yapımı seramikler — fincanlar, bardaklar ve tütsülükler.',
  description_en = 'Handmade ceramics — cups, mugs and incense holders.',
  description_ru = 'Керамика ручной работы — чашки, стаканы и подставки для благовоний.'
where name = 'Azqua Ceramics' and show_in_shop;

update public.categories set sort_order = 111,
  shop_tag = 'Kahve Çekirdeği', shop_tag_en = 'Coffee Beans', shop_tag_ru = 'Кофе в зёрнах',
  description    = 'Tek kökenli çekirdekler — evde demlemek için.',
  description_en = 'Single-origin beans to brew at home.',
  description_ru = 'Зёрна одного происхождения — заваривай дома.'
where name = 'Deep Drip' and show_in_shop;

update public.categories set sort_order = 112,
  shop_tag = 'Gözlük', shop_tag_en = 'Eyewear', shop_tag_ru = 'Очки',
  description    = 'Güneş gözlükleri.',
  description_en = 'Sunglasses.',
  description_ru = 'Солнцезащитные очки.'
where name = 'Görüşbaz' and show_in_shop;

update public.categories set sort_order = 113,
  shop_tag = 'Takı', shop_tag_en = 'Jewellery', shop_tag_ru = 'Украшения',
  description    = 'El yapımı kolyeler ve yüzükler.',
  description_en = 'Handmade necklaces and rings.',
  description_ru = 'Кольца и колье ручной работы.'
where name = 'Jewelery' and show_in_shop;

update public.categories set sort_order = 114,
  shop_tag = 'Şapka', shop_tag_en = 'Caps', shop_tag_ru = 'Кепки',
  description    = 'Jüjü''den şapkalar.',
  description_en = 'Caps by Jüjü.',
  description_ru = 'Кепки от Jüjü.'
where name = 'Jüjü' and show_in_shop;

update public.categories set sort_order = 115,
  shop_tag = 'Doğal Bakım', shop_tag_en = 'Natural Care', shop_tag_ru = 'Натуральный уход',
  description    = 'Doğal sabunlar ve bakım ürünleri.',
  description_en = 'Natural soaps and skincare.',
  description_ru = 'Натуральное мыло и уход за кожей.'
where name = 'Personal Care' and show_in_shop;
