-- Take away: siparis kalemine tek tikla "gotur" secenegi.
-- Sicak icecek -> karton bardak, soguk icecek -> pet bardak. Sert alkoller haric.
--
-- Bardak maliyeti recete satiri DEGIL: her urune ayri satir eklemek yerine
-- urun "hangi bardagi kullanir" bilgisini tasiyor, stok trigger'i kalem
-- take away isaretliyse o bardagi bir adet dusuyor.

-- 1) Hangi hammadde hangi rolde? (Karton Bardak = sicak, Pet Bardak = soguk)
alter table public.ingredients
  add column if not exists takeaway_role text
  check (takeaway_role in ('hot', 'cold'));

comment on column public.ingredients.takeaway_role is
  'Take away bardagi rolu: hot = sicak icecek bardagi (karton), cold = soguk icecek bardagi (pet).';

update public.ingredients set takeaway_role = 'hot'  where name = 'Karton Bardak' and takeaway_role is null;
update public.ingredients set takeaway_role = 'cold' where name = 'Pet Bardak'    and takeaway_role is null;

-- Rol basina tek hammadde olsun ki trigger tekil secim yapabilsin
create unique index if not exists uq_ingredients_takeaway_role
  on public.ingredients (store_id, takeaway_role)
  where takeaway_role is not null;

-- 2) Urun take away'e uygun mu, uygunsa hangi bardak?
alter table public.products
  add column if not exists takeaway_cup text
  check (takeaway_cup in ('hot', 'cold'));

comment on column public.products.takeaway_cup is
  'NULL ise urunde take away secenegi gosterilmez (sert alkoller, tabakta servis). hot/cold = kullanilacak bardak.';

-- Sicak icecekler + demlik cay -> karton; soguk icecekler -> pet.
-- Alkol/kokteyl/shot/viski ve yemekler bilerek disarida: take away sunulmuyor.
update public.products p set takeaway_cup = 'hot'
from public.categories c
where c.id = p.category_id and p.takeaway_cup is null
  and c.name in ('Sıcak İçecekler', 'Demlik Çay');

update public.products p set takeaway_cup = 'cold'
from public.categories c
where c.id = p.category_id and p.takeaway_cup is null
  and c.name = 'Soğuk İçecekler';

-- 3) Siparis kaleminde take away bayragi
alter table public.order_items
  add column if not exists is_takeaway boolean not null default false;

comment on column public.order_items.is_takeaway is
  'Musteri ya da kasa "gotur" sectiyse true — stok dususunde uygun bardak eklenir.';

-- 4) Stok dususu: recete + parti sarfi + take away bardagi
create or replace function public.fn_decrement_stock_from_recipe()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  rec RECORD;
  effective_qty NUMERIC;
  v_party boolean;
  v_cup text;
  v_cup_ing uuid;
begin
  if NEW.kitchen_status = 'preparing' and (OLD.kitchen_status is null or OLD.kitchen_status <> 'preparing') then
    v_party := public.fn_is_party_now(NEW.store_id);

    for rec in
      select r.ingredient_id, r.qty_per_unit, r.party_only, coalesce(i.waste_pct, 0) as waste_pct
      from recipes r join ingredients i on i.id = r.ingredient_id
      where r.product_id = NEW.product_id
    loop
      continue when rec.party_only and not coalesce(v_party, false);

      effective_qty := rec.qty_per_unit * NEW.quantity * (1 + rec.waste_pct / 100.0);
      update ingredients set stock_qty = stock_qty - effective_qty where id = rec.ingredient_id;
    end loop;

    -- Take away bardagi: urunun rolune gore tek adet / porsiyon
    if NEW.is_takeaway then
      select takeaway_cup into v_cup from products where id = NEW.product_id;
      if v_cup is not null then
        select id into v_cup_ing
        from ingredients
        where takeaway_role = v_cup and store_id = NEW.store_id
        limit 1;

        if v_cup_ing is not null then
          update ingredients set stock_qty = stock_qty - NEW.quantity where id = v_cup_ing;
        end if;
      end if;
    end if;
  end if;
  return NEW;
end $$;
