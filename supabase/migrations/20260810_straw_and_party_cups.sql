-- Pipet + partide kokteyl/highball PET bardagi + sisede servis duzeltmesi.
--
-- 1) Take away soguk icecek: PET bardak + PIPET. Sicakta pipet yok.
-- 2) Sisede gelen urun (Su, Soda) take away'de bardak/pipet harcamaz — sise
--    zaten kapali gider. Kategori bazli ilk atamada yanlislikla 'cold' olmustu.
-- 3) Parti gecesi cin tonik / kokteyller de PET bardakta -> party_only satir.

-- --- 1) Pipet rolu ---
alter table public.ingredients drop constraint if exists ingredients_takeaway_role_check;
alter table public.ingredients
  add constraint ingredients_takeaway_role_check
  check (takeaway_role in ('hot', 'cold', 'straw'));

update public.ingredients set takeaway_role = 'straw'
where name = 'Pipet' and takeaway_role is null;

-- Urun bazinda pipet: soguk bardakli icecekler true, sicaklar false
alter table public.products
  add column if not exists takeaway_straw boolean not null default false;

comment on column public.products.takeaway_straw is
  'Take away secilirse pipet de harcanir mi (soguk bardakli icecekler).';

-- --- 2) Sisede servis edilenler take away bardagi harcamaz ---
update public.products set takeaway_cup = null
where name in ('Su', 'Soda');

-- Kalan soguk bardakli icecekler pipetli
update public.products set takeaway_straw = true where takeaway_cup = 'cold';

-- --- 3) Stok dususu: bardak + pipet ---
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
  v_straw boolean;
  v_ing uuid;
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

    if NEW.is_takeaway then
      select takeaway_cup, takeaway_straw into v_cup, v_straw
      from products where id = NEW.product_id;

      -- Bardak (sicak -> karton, soguk -> pet)
      if v_cup is not null then
        select id into v_ing from ingredients
        where takeaway_role = v_cup and store_id = NEW.store_id limit 1;
        if v_ing is not null then
          update ingredients set stock_qty = stock_qty - NEW.quantity where id = v_ing;
        end if;
      end if;

      -- Pipet (yalniz soguk bardakli icecekler)
      if v_straw then
        select id into v_ing from ingredients
        where takeaway_role = 'straw' and store_id = NEW.store_id limit 1;
        if v_ing is not null then
          update ingredients set stock_qty = stock_qty - NEW.quantity where id = v_ing;
        end if;
      end if;
    end if;
  end if;
  return NEW;
end $$;
