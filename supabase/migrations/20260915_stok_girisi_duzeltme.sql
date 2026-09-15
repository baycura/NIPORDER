-- ============================================================================
-- STOK GIRISI — INCELEME DUZELTMELERI            20260915_stok_girisi_duzeltme
-- ============================================================================
-- 20260915_stok_girisi.sql uygulandiktan sonra yapilan hata avinin uc gercek
-- bulgusu:
--
-- 1) track_stock OTOMATIK ACILMASI MUTFAGI KOPARIYORDU
--    Kapi yalnizca "recetesi var mi" diye soruyordu. Recetesi olmayan ama raf
--    urunu de olmayan 85 menu urunu var (Cilbir, Durum, Cokertme, Sahlep...).
--    Bunlardan birine stok girilseydi track_stock acilir, kasada urun "raf
--    urunu" davranisina gecer (OrderDetailPage: isRetail) ve siparis mutfak
--    panosuna dusmezdi. Yeni kapi kategoriye bakiyor: stok takibi yalniz raf
--    kategorisinde (staff_only ya da show_in_shop) kendiliginden acilir —
--    Gozluk, Sapka, Corap, tisort oraya girer; Brunch ve Doner girmez.
--
-- 2) "for update" KILIDI SATIS TETIGINE KARSI ISE YARAMIYORDU
--    fn_decrement_retail_stock satiri kilitsiz okuyor, variants dizisini
--    bellekte hesaplayip MUTLAK deger yaziyordu. Stok girisi ayni anda olursa
--    tetik, girisi gormeden hesapladigi eski diziyi yaziyor ve yeni giris
--    siliniyordu (kilit ancak iki taraf da alirsa is gorur). Tetik artik
--    satiri "for update" ile okuyor; bu ayrica iki es zamanli satisin
--    birbirini ezmesini de onler.
--
-- 3) DEFTER PERSONELI SILINEMEZ YAPIYORDU
--    stock_entries.staff_id FK'sinde on delete kurali yoktu; bir kez stok
--    giren personel StaffMgmtPage'den silinemiyordu. Malzeme/urun FK'lari gibi
--    o da "on delete set null" oluyor (staff_name zaten fotograf olarak duruyor).
--    Ayni yerde deftere TRUNCATE hakki da kapatiliyor — stock_moves icin
--    20260826'da bilerek yapilan seyin ayni (RLS TRUNCATE'i kapsamaz).
--
-- Ayrica cok kucuk miktar kapisi: 0.0000006 gibi bir yazim hatasi ekranda
-- "0" gorunup deftere gercek deger yaziyordu; 0.001'in altina izin yok.
--
-- Geri alma: 20260915_stok_girisi.sql'deki govde + 20260908_shopify_baglantisi
--   .sql:191-237'deki tetik govdesi geri yuklenir.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Stok ekle — raf kategorisi kapisi + kucuk miktar kapisi
-- ----------------------------------------------------------------------------
create or replace function public.nip_stok_ekle(
  p_store_id uuid,
  p_kalemler jsonb,      -- [{ingredient_id|product_id, variant?, miktar}, ...]
  p_not      text default null)
returns table (kalem text, beden text, onceki numeric, sonraki numeric, birim text)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_staff record;
  r       record;
  v_ing   record;
  v_urun  record;
  v_vs    jsonb;
  v_i     integer;
  v_var   boolean;
  v_onc   numeric;
  v_son   numeric;
  v_not   text := nullif(btrim(coalesce(p_not, '')), '');
begin
  if p_kalemler is null or jsonb_typeof(p_kalemler) <> 'array' or jsonb_array_length(p_kalemler) = 0 then
    raise exception 'stok girisi: en az bir kalem gerekli';
  end if;
  if jsonb_array_length(p_kalemler) > 100 then
    raise exception 'stok girisi: tek seferde en fazla 100 kalem';
  end if;

  select s.id, s.name, s.role::text as role, s.store_ids into v_staff
    from public.staff s
   where s.auth_id = (select auth.uid()) and s.is_active;

  if v_staff.id is null then
    raise exception 'stok girisi: yetkisiz';
  end if;
  if v_staff.role in ('kitchen', 'viewer', 'parttime') then
    raise exception 'stok girisi: % rolu stok giremez', v_staff.role;
  end if;
  if not (p_store_id = any (v_staff.store_ids)) then
    raise exception 'stok girisi: bu magaza icin yetkin yok';
  end if;

  for r in
    select (x->>'ingredient_id')::uuid      as ing,
           (x->>'product_id')::uuid         as urun,
           nullif(btrim(x->>'variant'), '') as varyant,
           (x->>'miktar')::numeric          as miktar
      from jsonb_array_elements(p_kalemler) x
  loop
    if (r.ing is null) = (r.urun is null) then
      raise exception 'stok girisi: her satirda malzeme ya da urun olmali (ikisi birden olmaz)';
    end if;
    if r.miktar is null or r.miktar = 0 then
      raise exception 'stok girisi: miktar 0 olamaz';
    end if;
    -- Yazim hatasi kapisi: ekranda "0" gorunen ama deftere gercek deger yazan
    -- 0,0000006 gibi girisler.
    if abs(r.miktar) < 0.001 then
      raise exception 'stok girisi: miktar cok kucuk (%) — en az 0,001', r.miktar;
    end if;
    if abs(r.miktar) > 1000000 then
      raise exception 'stok girisi: miktar cok buyuk (%)', r.miktar;
    end if;

    if r.ing is not null then
      select i.id, i.name, i.unit, coalesce(i.stock_qty, 0) as stok
        into v_ing
        from public.ingredients i
       where i.id = r.ing and i.store_id = p_store_id
         for update;
      if not found then
        raise exception 'stok girisi: malzeme bu magazada bulunamadi (%)', r.ing;
      end if;
      if r.varyant is not null then
        raise exception 'stok girisi: malzemede beden olmaz ("%")', v_ing.name;
      end if;

      v_onc := v_ing.stok;
      v_son := v_onc + r.miktar;
      if v_son < 0 then
        raise exception 'stok girisi: "%" stogu eksiye duserdi (% -> %). Duzeltmek icin Stok Sayimi kullan.',
          v_ing.name, v_onc, v_son;
      end if;

      update public.ingredients set stock_qty = v_son where id = v_ing.id;

      insert into public.stock_entries(store_id, ingredient_id, kalem_adi, delta,
                                       before_qty, after_qty, unit, note, staff_id, staff_name)
      values (p_store_id, v_ing.id, v_ing.name, r.miktar, v_onc, v_son, v_ing.unit, v_not, v_staff.id, v_staff.name);

      kalem := v_ing.name; beden := null; onceki := v_onc; sonraki := v_son; birim := v_ing.unit;
      return next;

    else
      select p.id, p.name, p.track_stock, coalesce(p.retail_stock, 0) as stok, p.variants,
             coalesce(c.staff_only, false) or coalesce(c.show_in_shop, false) as raf_kategorisi
        into v_urun
        from public.products p
        left join public.categories c on c.id = p.category_id
       where p.id = r.urun and p.store_id = p_store_id
         for update of p;
      if not found then
        raise exception 'stok girisi: urun bu magazada bulunamadi (%)', r.urun;
      end if;
      if r.miktar <> trunc(r.miktar) then
        raise exception 'stok girisi: "%" adetle sayilir, tam sayi gir (%)', v_urun.name, r.miktar;
      end if;

      -- Takibi kendiliginden acmak yalniz RAF urununde dogru. Menu urununde
      -- (Cilbir, Durum...) track_stock acilirsa kasa onu raf urunu sanar ve
      -- siparis mutfak panosuna dusmez.
      if v_urun.track_stock is not true then
        if exists (select 1 from public.recipes rc where rc.product_id = v_urun.id) then
          raise exception 'stok girisi: "%" recete ile satiliyor; stogunu malzemeden gir', v_urun.name;
        end if;
        if not v_urun.raf_kategorisi then
          raise exception 'stok girisi: "%" mutfak/bar menusunde; adet stogu tutulmaz (raf urunu icin kategoriyi "Yalniz kasada" ya da "Vitrinde" yap)', v_urun.name;
        end if;
      end if;

      v_vs := case when jsonb_typeof(v_urun.variants) = 'array' and jsonb_array_length(v_urun.variants) > 0
                   then v_urun.variants else null end;

      if r.varyant is not null then
        if v_vs is null then
          raise exception 'stok girisi: "%" icin beden tanimli degil ("%")', v_urun.name, r.varyant;
        end if;
        v_var := false;
        for v_i in 0 .. jsonb_array_length(v_vs) - 1 loop
          if v_vs->v_i->>'name' = r.varyant then
            v_onc := coalesce((v_vs->v_i->>'stock')::numeric, 0);
            v_son := v_onc + r.miktar;
            if v_son < 0 then
              raise exception 'stok girisi: "% · %" stogu eksiye duserdi (% -> %). Duzeltmek icin Stok Sayimi kullan.',
                v_urun.name, r.varyant, v_onc, v_son;
            end if;
            v_vs  := jsonb_set(v_vs, array[v_i::text, 'stock'], to_jsonb(v_son::integer));
            v_var := true;
          end if;
        end loop;
        if not v_var then
          raise exception 'stok girisi: "%" icin "%" bedeni yok', v_urun.name, r.varyant;
        end if;

        update public.products
           set variants     = v_vs,
               track_stock  = true,
               retail_stock = (select coalesce(sum(coalesce((e->>'stock')::integer, 0)), 0)::integer
                                 from jsonb_array_elements(v_vs) e)
         where id = v_urun.id;
      else
        if v_vs is not null then
          raise exception 'stok girisi: "%" beden basina girilir, beden sec', v_urun.name;
        end if;
        v_onc := v_urun.stok;
        v_son := v_onc + r.miktar;
        if v_son < 0 then
          raise exception 'stok girisi: "%" stogu eksiye duserdi (% -> %). Duzeltmek icin Stok Sayimi kullan.',
            v_urun.name, v_onc, v_son;
        end if;
        update public.products
           set retail_stock = v_son::integer, track_stock = true
         where id = v_urun.id;
      end if;

      insert into public.stock_entries(store_id, product_id, variant_name, kalem_adi, delta,
                                       before_qty, after_qty, unit, note, staff_id, staff_name)
      values (p_store_id, v_urun.id, r.varyant, v_urun.name, r.miktar, v_onc, v_son, 'adet', v_not, v_staff.id, v_staff.name);

      kalem := v_urun.name; beden := r.varyant; onceki := v_onc; sonraki := v_son; birim := 'adet';
      return next;
    end if;
  end loop;
end $$;

comment on function public.nip_stok_ekle(uuid, jsonb, text) is
  'Stogu mevcudun UZERINE YAZMADAN artirir/azaltir: stok = stok + miktar, satir '
  'kilitli (arada gecen satis kaybolmaz). Kalemler [{ingredient_id|product_id, '
  'variant?, miktar}]. Her giris stock_entries''e yazilir. Sonuc eksiye duserse '
  'hata verir (duzeltme Stok Sayimi''nin isi). Takipsiz urunde stok takibi '
  'yalniz raf kategorisinde (staff_only/show_in_shop) acilir; menu urununde ve '
  'receteli urunde hata verir. Yetki: aktif personel, kitchen/viewer/parttime '
  'haric, yalniz kendi magazasi.';

revoke all on function public.nip_stok_ekle(uuid, jsonb, text) from anon, public;
grant execute on function public.nip_stok_ekle(uuid, jsonb, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 2) Satis tetigi satiri kilitleyerek okusun
--
-- Govde 20260908_shopify_baglantisi.sql:191-237 ile ayni; tek fark 205. satirdaki
-- "for update". Kilitsiz okuma + mutlak yazma, ayni anda yapilan stok girisini
-- (ve ikinci bir satisi) sessizce siliyordu.
-- ----------------------------------------------------------------------------
create or replace function public.fn_decrement_retail_stock()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  p     record;
  vs    jsonb;
  i     int;
  hit   boolean := false;
  v_ad  text;
begin
  if new.product_id is null then return null; end if;
  select id, track_stock, retail_stock, variants into p
    from public.products where id = new.product_id
     for update;
  if p.id is null or p.track_stock is not true then return null; end if;

  v_ad := new.variant_name;
  if v_ad is null and jsonb_typeof(p.variants) = 'array' and jsonb_typeof(new.selected_options) = 'object' then
    select v0->>'name' into v_ad
      from jsonb_array_elements(p.variants) v0
     where exists (
       select 1
         from jsonb_each(new.selected_options) t(k, val)
         cross join lateral jsonb_array_elements(
           case when jsonb_typeof(t.val) = 'array' then t.val else jsonb_build_array(t.val) end) e
        where lower(btrim(e #>> '{}')) = lower(btrim(v0->>'name')))
     limit 1;
  end if;

  if v_ad is not null and jsonb_typeof(p.variants) = 'array' then
    vs := p.variants;
    for i in 0 .. jsonb_array_length(vs) - 1 loop
      if vs->i->>'name' = v_ad then
        vs := jsonb_set(vs, array[i::text, 'stock'],
              to_jsonb(greatest(coalesce((vs->i->>'stock')::int, 0) - coalesce(new.quantity, 1), 0)));
        hit := true;
      end if;
    end loop;
    if hit then update public.products set variants = vs where id = p.id; end if;
  end if;

  update public.products
     set retail_stock = greatest(coalesce(retail_stock, 0) - coalesce(new.quantity, 1), 0)
   where id = p.id;
  return null;
end $$;

revoke execute on function public.fn_decrement_retail_stock() from anon, authenticated, public;

-- ----------------------------------------------------------------------------
-- 3) Defter personeli silinemez yapmasin; TRUNCATE kapali olsun
-- ----------------------------------------------------------------------------
alter table public.stock_entries drop constraint if exists stock_entries_staff_id_fkey;
alter table public.stock_entries
  add constraint stock_entries_staff_id_fkey
  foreign key (staff_id) references public.staff(id) on delete set null;

revoke truncate on table public.stock_entries from authenticated;
