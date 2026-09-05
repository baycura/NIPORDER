-- ============================================================================
-- STOK SAYIMINA RAF URUNLERI                  20260904_stok_sayimina_raf_urunleri
-- ============================================================================
-- SORUN
-- Stok Sayimi ekrani yalniz ingredients'i (bar/mutfak malzemesi) listeliyordu.
-- Tisort, sapka gibi raf urunleri products tablosunda adet stogu tasiyor
-- (track_stock, retail_stock, beden basina variants[].stock) ve sayima hic
-- girmiyordu: "Not in Paris tisortlerinin adi stok sayimi sayfasinda gecmiyor."
--
-- TASARIM
-- stock_count_lines'a product_id + variant_name geliyor; ingredient_id
-- nullable oluyor. CHECK ikisinden TAM OLARAK BIRININ dolu olmasini sart
-- kosuyor — kaynaksiz ya da cift kaynakli satir yazilamaz. Beden varyanti
-- olan urun beden basina ayri satir olarak sayilir (Fethiye Lovers Tisort ·
-- Small); retail_stock bedenlerin toplamina cekilir, satis tetigi
-- (fn_decrement_retail_stock) ile ayni model.
--
-- stock_moves'a urun satiri YAZILMAZ: o defter malzeme defteridir
-- (ingredient_id not null) ve urun stogu products uzerinde tek sayi olarak
-- yasar. Sayimin izi stock_count_lines'ta (beklenen, sayilan, fark) kalir.
--
-- Birim maliyet products.cost_price'tan damgalanir; bos ise 0 — ekran bunu
-- "maliyeti girilmemis" diye gosterir, fark tutara girmez (malzemeyle ayni).
--
-- Fonksiyonun imzasi ve malzeme yolu DEGISMIYOR; eski istemci ayni sekilde
-- calisir. Yalniz satirlar artik product_id de tasiyabiliyor.
--
-- Geri alma:
--   (fonksiyonun eski govdesi: 20260826_stok_sayimi.sql)
--   delete from public.stock_count_lines where product_id is not null;
--   alter table public.stock_count_lines drop constraint stock_count_lines_kaynak_tek;
--   alter table public.stock_count_lines drop column variant_name, drop column product_id;
--   alter table public.stock_count_lines alter column ingredient_id set not null;
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Sayim satiri urunu de gosterebilsin
-- ----------------------------------------------------------------------------
alter table public.stock_count_lines alter column ingredient_id drop not null;
alter table public.stock_count_lines add column if not exists product_id uuid references public.products(id);
alter table public.stock_count_lines add column if not exists variant_name text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'stock_count_lines_kaynak_tek') then
    alter table public.stock_count_lines add constraint stock_count_lines_kaynak_tek
      check ((ingredient_id is not null) <> (product_id is not null)
             and (variant_name is null or product_id is not null));
  end if;
end $$;

create index if not exists stock_count_lines_urun on public.stock_count_lines(product_id);

comment on column public.stock_count_lines.product_id is
  'Raf urunu sayimi (products.track_stock). ingredient_id ile tam olarak biri dolu.';
comment on column public.stock_count_lines.variant_name is
  'Beden/varyant adi (products.variants[].name). Varyantli urun beden basina sayilir.';

-- ----------------------------------------------------------------------------
-- 2) Sayimi kaydet — malzeme VE raf urunu
--
-- Guvenlik modeli 20260826 ile ayni: SECURITY DEFINER, kimlik yalniz
-- auth.uid(), rol kapisi fonksiyonun icinde. current_user'a BAKILMAZ.
-- ----------------------------------------------------------------------------
create or replace function public.nip_stok_sayimi_kaydet(
  p_store_id uuid,
  p_sayimlar jsonb,          -- [{ingredient_id, sayilan} | {product_id, variant?, sayilan}, ...]
  p_sayan    text,
  p_note     text default null)
returns table (sayim_id uuid, kalem integer, fark_tutari numeric)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_staff   record;
  v_id      uuid;
  r         record;
  v_urun    record;
  v_vs      jsonb;
  v_i       integer;
  v_bulundu boolean;
  v_bek     numeric;
  v_cost    numeric;
  v_fark    numeric;
  v_adet    integer := 0;
  v_tutar   numeric := 0;
begin
  if p_sayan is null or length(btrim(p_sayan)) < 2 then
    raise exception 'sayim: sayan kisinin adi gerekli';
  end if;
  if p_sayimlar is null or jsonb_typeof(p_sayimlar) <> 'array' or jsonb_array_length(p_sayimlar) = 0 then
    raise exception 'sayim: en az bir malzeme sayilmali';
  end if;

  select s.id, s.name, s.role::text as role, s.store_ids into v_staff
    from public.staff s
   where s.auth_id = (select auth.uid()) and s.is_active;

  if v_staff.id is null then
    raise exception 'sayim: yetkisiz';
  end if;
  if v_staff.role in ('kitchen', 'viewer', 'parttime') then
    raise exception 'sayim: % rolu sayim giremez', v_staff.role;
  end if;
  if not (p_store_id = any(v_staff.store_ids)) then
    raise exception 'sayim: bu magaza icin yetkin yok';
  end if;

  insert into public.stock_counts(store_id, counted_by, counted_by_name, counted_by_person, note)
  values (p_store_id, v_staff.id, v_staff.name, btrim(p_sayan), nullif(btrim(coalesce(p_note, '')), ''))
  returning id into v_id;

  for r in
    select (x->>'ingredient_id')::uuid        as ing,
           (x->>'product_id')::uuid           as urun,
           nullif(btrim(x->>'variant'), '')   as varyant,
           (x->>'sayilan')::numeric           as sayilan
      from jsonb_array_elements(p_sayimlar) x
  loop
    if (r.ing is null) = (r.urun is null) or r.sayilan is null or r.sayilan < 0 then
      raise exception 'sayim: gecersiz satir (malzeme % / urun % / sayilan %)', r.ing, r.urun, r.sayilan;
    end if;

    if r.ing is not null then
      -- ---- Malzeme: 20260826 ile birebir ayni yol ----------------------------
      -- Beklenen, okundugu andaki stok. Sayim sirasinda satis olduysa fark ona
      -- da yazilir; bu bilinerek boyle — sayim "su an rafta ne var"i muhurler.
      select coalesce(i.stock_qty, 0), coalesce(i.cost_per_unit, 0)
        into v_bek, v_cost
        from public.ingredients i
       where i.id = r.ing and i.store_id = p_store_id;
      if not found then
        raise exception 'sayim: malzeme bu magazada bulunamadi (%)', r.ing;
      end if;

      v_fark := r.sayilan - v_bek;

      insert into public.stock_count_lines(count_id, ingredient_id, beklenen, sayilan, unit_cost)
      values (v_id, r.ing, v_bek, r.sayilan, v_cost);

      v_adet  := v_adet + 1;
      v_tutar := v_tutar + v_fark * v_cost;

      -- Fark deftere gerekceli hareket olarak yazilir; stok da ona gore duzelir.
      if abs(v_fark) >= 0.000001 then
        insert into public.stock_moves(order_item_id, count_id, ingredient_id, store_id,
                                       qty_delta, unit_cost, reason)
        values (null, v_id, r.ing, p_store_id, v_fark, v_cost, 'sayim');

        update public.ingredients set stock_qty = r.sayilan where id = r.ing;
      end if;

    else
      -- ---- Raf urunu: adet sayilir, beden varsa beden basina ----------------
      if r.sayilan <> trunc(r.sayilan) then
        raise exception 'sayim: urun adedi tam sayi olmali (%)', r.sayilan;
      end if;

      -- Ayni urunun iki bedeni ayni sayimda gelebilir; satir kilidi ikinci
      -- bedenin ilkini ezmesini onler, her tur guncel variants'i okur.
      select p.id, p.name, p.track_stock, p.retail_stock, p.variants,
             coalesce(p.cost_price, 0) as cost
        into v_urun
        from public.products p
       where p.id = r.urun and p.store_id = p_store_id
         for update;
      if not found then
        raise exception 'sayim: urun bu magazada bulunamadi (%)', r.urun;
      end if;
      if v_urun.track_stock is not true then
        raise exception 'sayim: "%" stok takipli degil', v_urun.name;
      end if;

      v_cost := v_urun.cost;
      v_vs   := case when jsonb_typeof(v_urun.variants) = 'array' then v_urun.variants else null end;

      if r.varyant is not null then
        if v_vs is null then
          raise exception 'sayim: "%" icin beden tanimli degil (%)', v_urun.name, r.varyant;
        end if;
        v_bulundu := false;
        for v_i in 0 .. jsonb_array_length(v_vs) - 1 loop
          if v_vs->v_i->>'name' = r.varyant then
            v_bek := coalesce((v_vs->v_i->>'stock')::numeric, 0);
            v_vs  := jsonb_set(v_vs, array[v_i::text, 'stock'], to_jsonb(r.sayilan::integer));
            v_bulundu := true;
          end if;
        end loop;
        if not v_bulundu then
          raise exception 'sayim: "%" icin "%" bedeni yok', v_urun.name, r.varyant;
        end if;
      else
        if v_vs is not null and jsonb_array_length(v_vs) > 0 then
          raise exception 'sayim: "%" beden basina sayilir, beden belirt', v_urun.name;
        end if;
        v_bek := coalesce(v_urun.retail_stock, 0);
      end if;

      v_fark := r.sayilan - v_bek;

      insert into public.stock_count_lines(count_id, product_id, variant_name, beklenen, sayilan, unit_cost)
      values (v_id, r.urun, r.varyant, v_bek, r.sayilan, v_cost);

      v_adet  := v_adet + 1;
      v_tutar := v_tutar + v_fark * v_cost;

      -- Urun stogu tek sayi olarak products'ta yasar; defter yok, dogrudan
      -- sayilana cekilir. Bedenli urunde retail_stock = bedenlerin toplami.
      if abs(v_fark) >= 0.000001 then
        if r.varyant is not null then
          update public.products
             set variants = v_vs,
                 retail_stock = (select coalesce(sum(coalesce((e->>'stock')::integer, 0)), 0)::integer
                                   from jsonb_array_elements(v_vs) e)
           where id = v_urun.id;
        else
          update public.products set retail_stock = r.sayilan::integer where id = v_urun.id;
        end if;
      end if;
    end if;
  end loop;

  update public.stock_counts
     set kalem_sayisi = v_adet, fark_tutari = round(v_tutar, 2)
   where id = v_id;

  return query select v_id, v_adet, round(v_tutar, 2);
end $$;

comment on function public.nip_stok_sayimi_kaydet(uuid, jsonb, text, text) is
  'Fiziksel sayimi kaydeder: malzeme (ingredient_id) ve raf urunu (product_id, '
  'beden icin variant) satirlarini beklenen/sayilan olarak muhurler. Malzeme '
  'farki stock_moves''a reason=''sayim'' yazilir; urun stogu dogrudan sayilana '
  'cekilir (bedenli urunde retail_stock = bedenlerin toplami). Gonderilmeyen '
  'kaleme dokunmaz.';

revoke all on function public.nip_stok_sayimi_kaydet(uuid, jsonb, text, text) from anon, authenticated, public;
grant execute on function public.nip_stok_sayimi_kaydet(uuid, jsonb, text, text) to authenticated;
