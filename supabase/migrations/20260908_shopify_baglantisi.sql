-- ============================================================================
-- SHOPIFY BAGLANTISI — STOK TEK KAYNAK                20260908_shopify_baglantisi
-- ============================================================================
-- ISTEK: "Shopify baglantisi isterim; uygulamaya urunleri oradan cek; personel
-- de kasadan girebilsin, musteri sepetine ekleyebilsin, ama stok TEK olmali."
--
-- TASARIM
-- Stogun tek kaynagi products (kasa, Shop sekmesi, sayim zaten oraya bakar).
-- Shopify bir "ayna": her urun/beden Shopify kimligiyle bagli durur.
--   - Order'da stok degisince (satis, sayim, elle) Shopify'a MUTLAK deger
--     itilir (trg_shopify_stok_push -> pg_net -> shopify-sync?action=stok).
--   - Shopify'da odenen siparisler 5 dakikada bir cekilir, kalemler Order
--     stogundan dusulur (cron -> shopify-sync?action=siparisler).
--   - Katalog (baglantilar, gorsel, yeni urunler) gunde bir cekilir; yeni
--     urunler GIZLI acilir, sahip Menu Yonetimi'nden gorunur yapar.
-- Dongu yok: pull siparis dusunce push Shopify'a ayni sayiyi yazar (idempotent).
-- Shopify panelinden elle degistirilen stok bir sonraki push'ta ezilir —
-- stok yalniz Order'da duzenlenir.
--
-- GIZLILIK: Shopify erisim anahtari bot_config'te (RLS: politika yok ->
-- personel okuyamaz; yalniz servis rolu). Sahip Ayarlar'dan yazar
-- (nip_shopify_ayar_kaydet), okuyamaz; durum fonksiyonu son 4 hanesini gosterir.
--
-- Geri alma:
--   select cron.unschedule(jobid) from cron.job where jobname in ('nip-shopify-siparisler','nip-shopify-urunler');
--   drop trigger if exists trg_shopify_stok_push on public.products;
--   drop function if exists public.fn_shopify_stok_push(), public.nip_shopify_cagir(text, jsonb),
--     public.nip_shopify_ayar_kaydet(text, text), public.nip_shopify_durum();
--   drop table if exists public.shopify_sync_log, public.shopify_sync_state;
--   alter table public.products drop column shopify_product_id, drop column shopify_handle,
--     drop column shopify_variant_id, drop column shopify_inventory_item_id;
--   (fn_decrement_retail_stock eski govdesi: 20260808_retail_brands_and_variants.sql)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Urun <-> Shopify baglari
--    Bedenli urunde kimlikler variants JSON'unda durur:
--      [{name, stock, shopify_variant_id, inventory_item_id}, ...]
--    Tek varyantli urunde (kolye, sapka) urun seviyesinde.
-- ----------------------------------------------------------------------------
alter table public.products add column if not exists shopify_product_id bigint;
alter table public.products add column if not exists shopify_handle text;
alter table public.products add column if not exists shopify_variant_id bigint;
alter table public.products add column if not exists shopify_inventory_item_id bigint;
create unique index if not exists products_shopify_product_id_tek
  on public.products(shopify_product_id) where shopify_product_id is not null;

comment on column public.products.shopify_product_id is 'Shopify Product id (gid sayisal kismi). Dolu ise stok Shopify ile aynalanir.';
comment on column public.products.shopify_inventory_item_id is 'Tek varyantli urun icin InventoryItem id; bedenli urunde variants[].inventory_item_id.';

-- ----------------------------------------------------------------------------
-- 2) Kayit ve durum
-- ----------------------------------------------------------------------------
create table if not exists public.shopify_sync_log (
  id         bigint generated always as identity primary key,
  islem      text not null,                 -- urunler | siparisler | stok
  ok         boolean not null default true,
  mesaj      text,
  detay      jsonb,
  created_at timestamptz not null default now()
);
create index if not exists shopify_sync_log_tarih on public.shopify_sync_log(created_at desc);

create table if not exists public.shopify_sync_state (
  key        text primary key,
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.shopify_sync_log   enable row level security;
alter table public.shopify_sync_state enable row level security;
drop policy if exists shopify_sync_log_sahip on public.shopify_sync_log;
create policy shopify_sync_log_sahip on public.shopify_sync_log for select to authenticated using (public.is_admin());
drop policy if exists shopify_sync_state_sahip on public.shopify_sync_state;
create policy shopify_sync_state_sahip on public.shopify_sync_state for select to authenticated using (public.is_admin());
revoke all on public.shopify_sync_log   from anon, authenticated;
revoke all on public.shopify_sync_state from anon, authenticated;
grant select on public.shopify_sync_log   to authenticated;
grant select on public.shopify_sync_state to authenticated;

-- Hangi Shopify markasi (vendor) hangi Order kategorisine iner. Baska marka
-- eklemek = buraya satir eklemek.
insert into public.shopify_sync_state(key, value)
values ('kategori_esleme', '{"NOT IN PARIS": "80ed8215-5e0f-4b4f-847a-b41df6040bcb"}'::jsonb)
on conflict (key) do nothing;

-- ----------------------------------------------------------------------------
-- 3) Ayar: sahip yazar, kimse okuyamaz (bot_config politikasiz -> yalniz servis)
-- ----------------------------------------------------------------------------
create or replace function public.nip_shopify_ayar_kaydet(p_shop text, p_token text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_admin() then
    raise exception 'shopify ayar: yalniz sahip';
  end if;
  if nullif(btrim(coalesce(p_shop, '')), '') is not null then
    insert into public.bot_config(key, value, updated_at)
    values ('shopify_shop', regexp_replace(btrim(p_shop), '^https?://|/+$', '', 'g'), now())
    on conflict (key) do update set value = excluded.value, updated_at = now();
  end if;
  if nullif(btrim(coalesce(p_token, '')), '') is not null then
    insert into public.bot_config(key, value, updated_at)
    values ('shopify_admin_token', btrim(p_token), now())
    on conflict (key) do update set value = excluded.value, updated_at = now();
  end if;
end $$;
revoke all on function public.nip_shopify_ayar_kaydet(text, text) from anon, authenticated, public;
grant execute on function public.nip_shopify_ayar_kaydet(text, text) to authenticated;

create or replace function public.nip_shopify_durum()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_shop text; v_token text;
begin
  if not public.is_admin() then
    raise exception 'shopify durum: yalniz sahip';
  end if;
  select value into v_shop  from public.bot_config where key = 'shopify_shop';
  select value into v_token from public.bot_config where key = 'shopify_admin_token';
  return jsonb_build_object(
    'shop', v_shop,
    'token_var', v_token is not null,
    'token_son4', right(v_token, 4),
    'bagli_urun', (select count(*) from public.products where shopify_product_id is not null),
    'siparis_durum', (select value from public.shopify_sync_state where key = 'siparisler'),
    'log', (select coalesce(jsonb_agg(to_jsonb(l) order by l.created_at desc), '[]'::jsonb)
              from (select islem, ok, mesaj, detay, created_at from public.shopify_sync_log order by created_at desc limit 12) l)
  );
end $$;
revoke all on function public.nip_shopify_durum() from anon, authenticated, public;
grant execute on function public.nip_shopify_durum() to authenticated;

-- ----------------------------------------------------------------------------
-- 4) Fonksiyonu cagir (pg_net, asenkron). tg_call ile ayni kalip.
-- ----------------------------------------------------------------------------
create or replace function public.nip_shopify_cagir(p_islem text, p_body jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare sec text;
begin
  select value into sec from public.bot_config where key = 'webhook_secret';
  if sec is null then return; end if;
  perform net.http_post(
    url     := 'https://gbbxxcduuwdmvfayxzeg.supabase.co/functions/v1/shopify-sync?action=' || p_islem || '&secret=' || sec,
    body    := coalesce(p_body, '{}'::jsonb),
    headers := '{"Content-Type":"application/json"}'::jsonb
  );
end $$;
revoke all on function public.nip_shopify_cagir(text, jsonb) from anon, authenticated, public;

-- ----------------------------------------------------------------------------
-- 5) Order'da stok degisince Shopify'a it
-- ----------------------------------------------------------------------------
create or replace function public.fn_shopify_stok_push()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.shopify_product_id is null then return null; end if;
  if old.variants is not distinct from new.variants
     and old.retail_stock is not distinct from new.retail_stock then
    return null;
  end if;
  perform public.nip_shopify_cagir('stok', jsonb_build_object('product_id', new.id));
  return null;
end $$;
revoke execute on function public.fn_shopify_stok_push() from anon, authenticated, public;

drop trigger if exists trg_shopify_stok_push on public.products;
create trigger trg_shopify_stok_push
  after update of variants, retail_stock on public.products
  for each row execute function public.fn_shopify_stok_push();

-- ----------------------------------------------------------------------------
-- 6) Musteri sepeti bedeni variant_name ile degil selected_options ile
--    gonderiyor ({"Beden":"Small"}); satis tetigi bedeni oradan da alsin.
--    (Kasa variant_name gonderir; o yol ayni.)
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
  select id, track_stock, retail_stock, variants into p from public.products where id = new.product_id;
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
-- 7) Zamanlayici: siparisler 5 dk, katalog gunde bir (04:20 UTC = 07:20 TR)
-- ----------------------------------------------------------------------------
select cron.unschedule(jobid) from cron.job where jobname in ('nip-shopify-siparisler', 'nip-shopify-urunler');
select cron.schedule('nip-shopify-siparisler', '*/5 * * * *', $$select public.nip_shopify_cagir('siparisler')$$);
select cron.schedule('nip-shopify-urunler',    '20 4 * * *',  $$select public.nip_shopify_cagir('urunler')$$);
