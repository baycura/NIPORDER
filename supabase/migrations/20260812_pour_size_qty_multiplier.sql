-- OLCU CARPANI: viski gibi "Tek / Duble" secenekli urunlerde recete BIR KEZ
-- (Tek olcusuyle) girilir; "Double" secilince icki satiri otomatik x2 duser.
-- Sarf malzemeler (buz, bardak, pipet) carpilmaz — duble de tek bardakta gider.
--
-- Kaynak: options_config.groups[].qty_multipliers = {"Single (4cl)": 1, "Double (8cl)": 2}
-- Carpan tanimli degilse secenek ADINDAN anlasilir: double/duble geciyorsa x2.
-- Kasadan opsiyonsuz eklenen satir Tek sayilir (carpan 1).
--
-- Test (canli): Jameson 40ml recete ile —
--   Tek -> 40ml viski + 150g buz · Duble -> 80ml viski + 150g buz (buz carpilmadi)
--   Opsiyonsuz -> 40ml. Hepsi dogrulandi.

-- 1) Mevcut "Pour size" gruplarina carpanlari yaz
update products p
set options_config = jsonb_set(p.options_config, '{groups}', (
  select jsonb_agg(
    case when g->>'name' = 'Pour size'
         then g || jsonb_build_object('qty_multipliers',
                (select jsonb_object_agg(o.val, case when o.val ~* '(double|duble)' then 2 else 1 end)
                 from jsonb_array_elements_text(g->'options') as o(val)))
         else g end)
  from jsonb_array_elements(p.options_config->'groups') as g
))
where p.options_config->'groups' is not null
  and exists (select 1 from jsonb_array_elements(p.options_config->'groups') g2
              where g2->>'name' = 'Pour size');

-- 2) Stok tetikleyicisi: secilen olcunun carpanini icki satirlarina uygula
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
  v_mult numeric := 1;
  g jsonb;
  sel text;
  m numeric;
begin
  if NEW.kitchen_status = 'preparing' and (OLD.kitchen_status is null or OLD.kitchen_status <> 'preparing') then
    v_party := public.fn_is_party_now(NEW.store_id);

    -- Olcu carpani: secilen opsiyonlarda qty_multipliers varsa uygula;
    -- yoksa adinda double/duble gecen secenek x2 sayilir
    if NEW.selected_options is not null and jsonb_typeof(NEW.selected_options) = 'object' then
      for g in
        select * from jsonb_array_elements(
          coalesce((select options_config->'groups' from products where id = NEW.product_id), '[]'::jsonb))
      loop
        sel := case when jsonb_typeof(NEW.selected_options->(g->>'name')) = 'string'
                    then NEW.selected_options->>(g->>'name') end;
        if sel is not null then
          m := coalesce((g->'qty_multipliers'->>sel)::numeric,
                        case when sel ~* '(double|duble)' then 2 else 1 end);
          v_mult := v_mult * coalesce(m, 1);
        end if;
      end loop;
    end if;

    for rec in
      select r.ingredient_id, r.qty_per_unit, r.party_only,
             coalesce(i.waste_pct, 0) as waste_pct,
             coalesce(i.is_consumable, false) as is_consumable
      from recipes r join ingredients i on i.id = r.ingredient_id
      where r.product_id = NEW.product_id
    loop
      continue when rec.party_only and not coalesce(v_party, false);

      -- Carpan yalniz gercek malzemeye (icki/mesrubat); sarf (buz, bardak) tek kalir
      effective_qty := rec.qty_per_unit * NEW.quantity
                       * (case when rec.is_consumable then 1 else v_mult end)
                       * (1 + rec.waste_pct / 100.0);
      update ingredients set stock_qty = stock_qty - effective_qty where id = rec.ingredient_id;
    end loop;

    if NEW.is_takeaway then
      select takeaway_cup, takeaway_straw into v_cup, v_straw
      from products where id = NEW.product_id;

      if v_cup is not null then
        select id into v_ing from ingredients
        where takeaway_role = v_cup and store_id = NEW.store_id limit 1;
        if v_ing is not null then
          update ingredients set stock_qty = stock_qty - NEW.quantity where id = v_ing;
        end if;
      end if;

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
