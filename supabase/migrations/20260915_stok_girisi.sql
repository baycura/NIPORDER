-- ============================================================================
-- STOK GIRISI — MEVCUDA EKLE                              20260915_stok_girisi
-- ============================================================================
-- SAHIP: "Siselerin stoklarini giriyorum ama her stok girdigimde stok o mu
--         sayiliyor? Girdigim stogu ekleyebildigim bir dugme ekleyebilir
--         misin?"
--
-- BUGUNKU DAVRANIS (sorunun cevabi: evet, uzerine yaziliyor)
--   Stok Yonetimi (ingredients.stock_qty) ve Urunler-Raf (products.retail_stock,
--   variants[].stock) ekranlarindaki stok alani MEVCUDUN UZERINE yazar: rafta
--   12 sise varken kutuya 6 yazilirsa stok 6 olur, 18 degil. Uzerine yazan tek
--   yol o degil — Stok Sayimi da bilerek uzerine yazar (sayim "su an ne var"i
--   muhurler). Ekleyen tek yer Fatura ekrani; o da istemcide okur-toplar-yazar,
--   yani ekran acikken satis olursa o satis kaybolur.
--
-- BU MIGRATION
--   nip_stok_ekle(): stogu SUNUCUDA artirir/azaltir. Satir "for update" ile
--   kilitlenip stok = stok + delta yazildigi icin arada gecen satis kaybolmaz;
--   iki kisi ayni anda girse ikisi de toplanir. Her giris stock_entries'e
--   kim/ne zaman/onceki/sonraki/not olarak dusulur.
--
--   stock_moves'a DOKUNULMAZ. O defter satis ve sayim dusumlerinin maliyet
--   defteri (her satirda order_item_id ya da count_id sart; urun_karliligi ve
--   eksik_maliyetler oradan okur). Elle stok girisi maliyeti degistirmez, bu
--   yuzden kendi defterine yazilir.
--
-- KURALLAR
--   * malzeme (ingredients): ondalik serbest (ml, g, sise...), birim malzemeden
--   * urun (products): tam sayi; bedenli urunde beden zorunlu, retail_stock
--     bedenlerin toplamina cekilir (satis tetigi fn_decrement_retail_stock ve
--     nip_stok_sayimi_kaydet ile ayni model)
--   * sonuc eksiye duserse yazilmaz — duzeltme Stok Sayimi'nin isi
--   * stok takibi kapali urune giris yapilirsa takip acilir; AMA urunun
--     recetesi varsa hata verir (recete zaten malzemeden dusuyor, ikinci kez
--     adetten dusmesin)
--   * Shopify'a baglı urunde (shopify_product_id dolu) trg_shopify_stok_push
--     kendiliginden calisir, magazadaki adet de guncellenir
--
-- YETKI: aktif personel, kitchen/viewer/parttime haric (Stok Sayimi ile ayni
--   kapi), yalniz kendi magazasi. Anon yok.
--
-- Geri alma:
--   drop function if exists public.nip_stok_ekle(uuid, jsonb, text);
--   drop table if exists public.stock_entries;
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Giris defteri
--
-- kalem_adi ad fotografidir: malzeme/urun silinse de "12 Eylul'de 24 Corona
-- girilmis" izi kalsin diye. FK'lar on delete set null — silme engellenmesin,
-- gecmis de kaybolmasin. Kaynagin tam olarak biri dolu olmasi fonksiyonun
-- sorumlulugu (silme sonrasi ikisi de bosalabilir, kisit onu yasaklamamali).
-- ----------------------------------------------------------------------------
create table if not exists public.stock_entries (
  id            uuid primary key default gen_random_uuid(),
  store_id      uuid not null references public.stores(id),
  ingredient_id uuid references public.ingredients(id) on delete set null,
  product_id    uuid references public.products(id) on delete set null,
  variant_name  text,
  kalem_adi     text not null,
  delta         numeric not null,
  before_qty    numeric not null,
  after_qty     numeric not null,
  unit          text,
  note          text,
  staff_id      uuid references public.staff(id),
  staff_name    text,
  created_at    timestamptz not null default now(),
  constraint stock_entries_tek_kaynak check (ingredient_id is null or product_id is null),
  constraint stock_entries_delta_sifir check (delta <> 0)
);

comment on table public.stock_entries is
  'Elle stok girisi defteri (nip_stok_ekle). Satis/sayim dusumleri burada '
  'DEGIL stock_moves''ta; bu tablo maliyet hesabina girmez.';
comment on column public.stock_entries.kalem_adi is
  'Giris anindaki malzeme/urun adi — kayit silinse de satir okunabilsin.';
comment on column public.stock_entries.delta is
  'Eklenen (+) ya da dusulen (-) miktar. before_qty + delta = after_qty.';

create index if not exists ix_stock_entries_magaza   on public.stock_entries (store_id, created_at desc);
create index if not exists ix_stock_entries_malzeme  on public.stock_entries (ingredient_id, created_at desc);
create index if not exists ix_stock_entries_urun     on public.stock_entries (product_id, created_at desc);

alter table public.stock_entries enable row level security;

drop policy if exists stock_entries_read_personel on public.stock_entries;
create policy stock_entries_read_personel on public.stock_entries
  for select to authenticated
  using (store_id = any (public.user_store_ids()));

revoke all on table public.stock_entries from anon, public;
grant select on table public.stock_entries to authenticated;
revoke insert, update, delete on table public.stock_entries from authenticated;

-- ----------------------------------------------------------------------------
-- 2) Stok ekle / dus
--
-- Guvenlik modeli nip_stok_sayimi_kaydet ile ayni: SECURITY DEFINER, kimlik
-- yalniz auth.uid()'den, rol kapisi fonksiyonun icinde. Istemciye guvenilmez.
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
    if abs(r.miktar) > 1000000 then
      raise exception 'stok girisi: miktar cok buyuk (%)', r.miktar;
    end if;

    if r.ing is not null then
      -- ---- Malzeme (bar/mutfak): sise, ml, adet... --------------------------
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
      -- Eksi stok zaten "sayim yapilmadan dusum basladi" demek; elle girisle
      -- daha da asagi cekilmesi hatayi gomer. Duzeltme sayimin isi.
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
      -- ---- Raf urunu: adet, beden varsa beden basina ------------------------
      select p.id, p.name, p.track_stock, coalesce(p.retail_stock, 0) as stok, p.variants
        into v_urun
        from public.products p
       where p.id = r.urun and p.store_id = p_store_id
         for update;
      if not found then
        raise exception 'stok girisi: urun bu magazada bulunamadi (%)', r.urun;
      end if;
      if r.miktar <> trunc(r.miktar) then
        raise exception 'stok girisi: "%" adetle sayilir, tam sayi gir (%)', v_urun.name, r.miktar;
      end if;
      -- Receteli urunun stogu malzemede yasar; adet takibi acilsaydi ayni satis
      -- hem malzemeden hem adetten duserdi.
      if v_urun.track_stock is not true
         and exists (select 1 from public.recipes rc where rc.product_id = v_urun.id) then
        raise exception 'stok girisi: "%" recete ile satiliyor; stogunu malzemeden gir', v_urun.name;
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
  'hata verir (duzeltme Stok Sayimi''nin isi). Yetki: aktif personel, '
  'kitchen/viewer/parttime haric, yalniz kendi magazasi.';

revoke all on function public.nip_stok_ekle(uuid, jsonb, text) from anon, public;
grant execute on function public.nip_stok_ekle(uuid, jsonb, text) to authenticated;
