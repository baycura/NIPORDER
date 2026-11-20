-- ============================================================================
-- URUN YEDEGI                                               20261120_urun_yedek
-- ============================================================================
-- Sahip (20.11.2026): menu birlikte duzenleniyor (fici bira Bud, alkollu
-- urunlerin aciklamalari, mutfak kartlari; fiyat calismasi sonra).
--
-- Toplu menu degisikliginden ONCE urun satirinin tam kopyasi buraya alinir.
-- Bir degisiklik yanlis cikarsa eski ad / aciklama / secenek / fiyat buradan
-- okunur ve geri yazilir. Satir hic kaldirilmaz.
--
--   select public.nip_urun_yedek_al('etiket');                 -- butun urunler
--   select public.nip_urun_yedek_al('etiket', array[...]);     -- secilen urunler
--
-- Yalniz SQL oturumu yazar ve okur (tarayici oturumu erisemez).
-- Yalniz EKLEME; tekrar calistirilabilir.
-- ============================================================================
create table if not exists public.nip_urun_yedek (
  id         bigint generated always as identity primary key,
  alindi     timestamptz not null default now(),
  etiket     text not null,
  product_id uuid not null,
  veri       jsonb not null
);
comment on table public.nip_urun_yedek is
  'Toplu menu degisikliginden once alinan urun satiri kopyalari (products satirinin tamami, jsonb). Yalniz SQL oturumu (20261120).';
create index if not exists nip_urun_yedek_urun on public.nip_urun_yedek (product_id, alindi desc);
alter table public.nip_urun_yedek enable row level security;
revoke all on public.nip_urun_yedek from anon, authenticated, public;

create or replace function public.nip_urun_yedek_al(p_etiket text, p_urunler uuid[] default null)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_n integer := 0;
begin
  -- Yalniz SQL oturumu / zamanlanmis is (istek rolu yok).
  if coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') <> '' then
    raise exception 'dogrudan cagrilamaz' using errcode = '42501';
  end if;
  if coalesce(btrim(p_etiket), '') = '' then
    raise exception 'etiket bos olamaz';
  end if;
  insert into public.nip_urun_yedek (etiket, product_id, veri)
  select btrim(p_etiket), p.id, to_jsonb(p)
    from public.products p
   where p_urunler is null or p.id = any(p_urunler);
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke all on function public.nip_urun_yedek_al(text, uuid[]) from public, anon, authenticated;
