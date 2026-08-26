-- ============================================================================
-- STOK SAYIMI                                             20260826_stok_sayimi
-- ============================================================================
-- SORUN
-- Bari saymak icin Stok Yonetimi'nde 128 malzeme tek tek acilip sayi USTUNE
-- YAZILIYORDU. Karsilastirilacak bir sey yoktu — "olmasi gereken" hicbir yerde
-- durmuyordu — ve yazilan sayinin oncekinden ne kadar saptigi kaydedilmiyordu.
-- Yani fire, kayip ve olcum hatasi ayni tek sayinin altinda kayboluyordu.
--
-- Artik stock_moves (20260825_stok_hareketleri_ve_maliyet.sql) ne olmasi
-- gerektigini biliyor. Bu migration onun uzerine SAYIMI oturtuyor: sayilan
-- ile beklenen yan yana yazilir, fark hesaplanir, fark deftere GEREKCELI bir
-- hareket olarak duser. Sessiz uzerine yazma yerine izi kalan bir duzeltme.
--
-- TASARIM
-- stock_moves tek defter kalir. Simdiye kadar her hareketin bir order_item_id
-- kaynagi vardi; sayim farkinin siparisi yok. Bu yuzden order_item_id nullable
-- yapiliyor, yanina count_id konuyor ve CHECK ikisinden BIRININ dolu olmasini
-- sart kosuyor — kaynaksiz hareket yazilamaz.
--
-- Gonderilmeyen malzemeye DOKUNULMAZ. Sayim kismi olabilir (bugun sadece bar,
-- yarin mutfak); listelenmeyen malzemenin stogu oldugu gibi kalir. Sifir
-- gonderilirse o gercekten "sifir sayildi" demektir.
--
-- Fark sifirsa hareket yazilmaz: dogru sayilan malzeme defteri sismez.
--
-- ROL KAPISI: kitchen / viewer / parttime sayim giremez. Sayim stogu duzelten
-- bir islem — mutfaktaki tabletten yanlislikla girilmesi, gunun tuketim
-- kaydini sessizce ezerdi.
--
-- Geri alma:
--   drop function if exists public.nip_stok_sayimi_kaydet(uuid, jsonb, text, text);
--   drop table if exists public.stock_count_lines;
--   drop table if exists public.stock_counts;
--   delete from public.stock_moves where reason = 'sayim';
--   alter table public.stock_moves drop constraint stock_moves_kaynak_var;
--   alter table public.stock_moves drop column count_id;
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Defteri sayim hareketine ac
-- ----------------------------------------------------------------------------
alter table public.stock_moves alter column order_item_id drop not null;
alter table public.stock_moves add column if not exists count_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'stock_moves_kaynak_var') then
    alter table public.stock_moves add constraint stock_moves_kaynak_var
      check (order_item_id is not null or count_id is not null);
  end if;
end $$;

comment on column public.stock_moves.count_id is
  'Sayim farkindan dogan hareketin sayim kaydi. order_item_id ile birlikte '
  'en az biri dolu olmali (stock_moves_kaynak_var).';

-- Ledger'a TRUNCATE hakki personelde durmasin: RLS TRUNCATE'i kapsamaz, yani
-- bu grant defterin tamaminin tek komutla silinebilmesi demekti.
revoke truncate, references, trigger on public.stock_moves from anon, authenticated;
revoke truncate, references, trigger on public.cash_counts from anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2) Sayim basligi
-- ----------------------------------------------------------------------------
create table if not exists public.stock_counts (
  id                uuid primary key default gen_random_uuid(),
  store_id          uuid not null references public.stores(id),
  counted_by        uuid references public.staff(id),
  counted_by_name   text,
  -- Hesabi paylasan personel var; fiilen kimin saydigini ayrica soruyoruz.
  counted_by_person text not null,
  note              text,
  kalem_sayisi      integer not null default 0,
  fark_tutari       numeric not null default 0,   -- eksi = kayip
  created_at        timestamptz not null default now(),
  constraint stock_counts_sayan_dolu check (length(btrim(counted_by_person)) >= 2)
);

create index if not exists stock_counts_store_tarih
  on public.stock_counts(store_id, created_at desc);

comment on table public.stock_counts is
  'Fiziksel stok sayimi basligi. Silinmez — sayim bir olcumdur, yanlissa '
  'ustune yeni sayim girilir.';

create table if not exists public.stock_count_lines (
  id            bigint generated always as identity primary key,
  count_id      uuid not null references public.stock_counts(id) on delete cascade,
  ingredient_id uuid not null references public.ingredients(id),
  beklenen      numeric not null,
  sayilan       numeric not null,
  fark          numeric generated always as (sayilan - beklenen) stored,
  unit_cost     numeric not null default 0
);

create index if not exists stock_count_lines_sayim on public.stock_count_lines(count_id);
create index if not exists stock_count_lines_malzeme on public.stock_count_lines(ingredient_id);

comment on column public.stock_count_lines.unit_cost is
  'Sayim anindaki birim maliyet. Sonradan cost_per_unit degisirse eski sayimin '
  'fark tutari degismesin diye satira damgalanir.';

-- ----------------------------------------------------------------------------
-- 3) RLS — okuma personelde, yazma yalniz RPC'de
-- ----------------------------------------------------------------------------
alter table public.stock_counts      enable row level security;
alter table public.stock_count_lines enable row level security;

drop policy if exists stock_counts_read on public.stock_counts;
create policy stock_counts_read on public.stock_counts
  for select to authenticated using (public.is_staff());

drop policy if exists stock_count_lines_read on public.stock_count_lines;
create policy stock_count_lines_read on public.stock_count_lines
  for select to authenticated using (public.is_staff());

revoke all on public.stock_counts      from anon, authenticated;
revoke all on public.stock_count_lines from anon, authenticated;
grant select on public.stock_counts      to authenticated;
grant select on public.stock_count_lines to authenticated;

-- ----------------------------------------------------------------------------
-- 4) Sayimi kaydet
--
-- SECURITY DEFINER, cunku islem ingredients.stock_qty'yi ve append-only
-- stock_moves'u yaziyor — ikisine de dogrudan yazma hakki personelde yok.
-- Yetki kapisi bu yuzden fonksiyonun ICINDE.
--
-- KAPI current_user'a BAKMAZ. SECURITY DEFINER icinde current_user fonksiyonun
-- SAHIBIDIR (postgres), cagiran degil — 'authenticated' ile karsilastiran bir
-- kosul her zaman false doner ve butun kontrolu olu koda cevirir. Kimlik
-- yalniz auth.uid() uzerinden okunur ve kontroller kosulsuz calisir.
-- (Ayni tuzak: 20260820_profil_birlestirme_ve_musteri_korumasi.sql:92-94.)
--
-- Bunun bedeli: fonksiyon JWT'siz cagrilamaz, yani pg_cron/servis isleri
-- kullanamaz. Sayimi her zaman bir insan yaptigi icin dogru takas.
-- ----------------------------------------------------------------------------
create or replace function public.nip_stok_sayimi_kaydet(
  p_store_id uuid,
  p_sayimlar jsonb,          -- [{ingredient_id, sayilan}, ...]
  p_sayan    text,
  p_note     text default null)
returns table (sayim_id uuid, kalem integer, fark_tutari numeric)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_staff record;
  v_id    uuid;
  r       record;
  v_bek   numeric;
  v_cost  numeric;
  v_fark  numeric;
  v_adet  integer := 0;
  v_tutar numeric := 0;
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
    select (x->>'ingredient_id')::uuid as ing, (x->>'sayilan')::numeric as sayilan
      from jsonb_array_elements(p_sayimlar) x
  loop
    if r.ing is null or r.sayilan is null or r.sayilan < 0 then
      raise exception 'sayim: gecersiz satir (malzeme % / sayilan %)', r.ing, r.sayilan;
    end if;

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
  end loop;

  update public.stock_counts
     set kalem_sayisi = v_adet, fark_tutari = round(v_tutar, 2)
   where id = v_id;

  return query select v_id, v_adet, round(v_tutar, 2);
end $$;

comment on function public.nip_stok_sayimi_kaydet(uuid, jsonb, text, text) is
  'Fiziksel sayimi kaydeder: beklenen ile sayilani satir satir muhurler, farki '
  'stock_moves''a reason=''sayim'' olarak yazar ve stogu sayilana ceker. '
  'Gonderilmeyen malzemeye dokunmaz.';

revoke all on function public.nip_stok_sayimi_kaydet(uuid, jsonb, text, text) from anon, authenticated, public;
grant execute on function public.nip_stok_sayimi_kaydet(uuid, jsonb, text, text) to authenticated;
