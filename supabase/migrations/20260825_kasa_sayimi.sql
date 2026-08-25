-- ============================================================================
-- GUN SONU KASA SAYIMI                                    20260825_kasa_sayimi
-- ============================================================================
-- Kapanista personel cekmecedeki nakdi kupur kupur sayar; sistem o isletme
-- gununun NAKIT tahsilatindan NAKIT giderini dusup "olmasi gereken"i bulur ve
-- farki mühürler. Kart / online / havale / borc / puan cekmecede olmadigi icin
-- FARKA KARISMAZ.
--
-- FORMUL
--   acilis_float   = onceki gecerli sayim.counted_total - onceki.withdrawn
--   beklenen_nakit = acilis_float + nakit_tahsilat - nakit_gider
--   fark           = sayilan_nakit - beklenen_nakit
--
-- withdrawn = sayim aninda cekmeceden alinip kasaya/bankaya konan tutar.
-- Bu kolon olmadan cekmecede para birakan bir isletmede fark her gece
-- sistematik pozitif cikar. opening_float ISTEMCIDEN ALINMAZ; sunucu onceki
-- sayimdan turetir. Aksi halde "2000'i cebe at, acilisa 0 yaz, fark 0" bedava.
--
-- ISTEMCI SADECE SUNU GONDERIR:
--   store_id, denoms, withdrawn, counted_by_person, note, supersedes, reason
-- Geri kalan her sayiyi BEFORE INSERT tetikleyicisi doldurur.
--
-- DEGISTIRILEMEZ
-- UPDATE ve DELETE politikasi YOK. Yanlis sayim silinmez; ustune supersedes
-- ile gerekceli yeni kayit girilir, eskisi gecmiste durur.
--
-- SECURITY INVOKER — bu dosyadaki en onemli satir:
--   Asagidaki fonksiyonlar SECURITY DEFINER OLMAMALI. DEFINER yazilirsa
--   current_user fonksiyon sahibi (postgres) olur, kimlik/rol/magaza
--   kontrollerinin HEPSI her cagrida muaf sayilir ve koruma hic calismaz.
--   Bu depo ayni hatayi bir kez yapti:
--   20260820_profil_birlestirme_ve_musteri_korumasi.sql:92-94
--   service_role BYPASSRLS'tir, bu yuzden invoker olmak bakim islerini engellemez.
--
-- CANLI VERI NOTU
-- expenses tablosu su an BOS (0 satir) ve payment_method hicbir satirda dolu
-- degil. ExpensesPage 'kasa' / 'kart' yaziyor; kasa gideri bundan sonra
-- olusacak. Sayim bu yuzden ilk gunlerde yalniz tahsilat tarafini gorur.
--
-- Geri alma:
--   drop trigger if exists trg_kasa_sayimi_doldur on public.cash_counts;
--   drop trigger if exists trg_gider_sayim_kilidi on public.expenses;
--   drop function if exists public.fn_kasa_sayimi_doldur() cascade;
--   drop function if exists public.fn_gider_sayim_kilidi() cascade;
--   drop view if exists public.cash_counts_gecerli;
--   drop table if exists public.cash_counts;
--   drop function if exists public.kasa_gun_ozeti(uuid, date);
--   drop function if exists public.nip_denom_total(jsonb);
--   drop function if exists public.nip_denoms_gecerli(jsonb);
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) KUPUR YARDIMCILARI
-- Sabit kupur listesi YOK: ₺500 banknot cikarsa migration gerekmesin.
-- Kural: anahtar pozitif ve en fazla 2 ondalikli sayi, deger negatif olmayan tamsayi.
-- ----------------------------------------------------------------------------
create or replace function public.nip_denoms_gecerli(d jsonb)
returns boolean language sql immutable set search_path to 'public' as
$$
  select d is not null and jsonb_typeof(d) = 'object'
     and not exists (
       select 1 from jsonb_each_text(d) as e(k, v)
       where k !~ '^[0-9]{1,4}(\.[0-9]{1,2})?$'
          or (k)::numeric <= 0
          or v !~ '^[0-9]{1,6}$'
     )
$$;

-- SAVUNMACI: stored generated column CHECK'ten ONCE hesaplanir, yani bozuk
-- girdi once burada cast hatasi verirdi. Gecersizi 0 sayiyoruz; reddi CHECK yapar.
create or replace function public.nip_denom_total(d jsonb)
returns numeric language sql immutable set search_path to 'public' as
$$
  select coalesce((
    select sum(case when e.k ~ '^[0-9]{1,4}(\.[0-9]{1,2})?$' and e.v ~ '^[0-9]{1,6}$'
                    then (e.k)::numeric * (e.v)::numeric else 0 end)
    from jsonb_each_text(coalesce(d, '{}'::jsonb)) as e(k, v)
  ), 0)::numeric
$$;

-- ----------------------------------------------------------------------------
-- 2) GUN OZETI
-- Ekranin onizlemesi ve tetikleyicinin dondurdugu deger AYNI fonksiyondan gelir;
-- boylece "ekranda gordugum sayi" ile "kaydedilen sayi" ayrisamaz.
-- ----------------------------------------------------------------------------
create or replace function public.kasa_gun_ozeti(p_store_id uuid, p_gun date default null)
returns table (
  isletme_gunu    date,
  acilis          numeric,
  nakit           numeric,
  kart            numeric,
  online          numeric,
  havale          numeric,
  borc            numeric,
  puan            numeric,
  nakit_gider     numeric,
  gider_adet      integer,
  beklenen        numeric,
  acik_bugun_adet integer, acik_bugun_tutar numeric,
  acik_eski_adet  integer, acik_eski_tutar numeric,
  eksik_adet      integer, eksik_tutar      numeric
)
language plpgsql stable set search_path to 'public' as
$$
declare v_gun date; v_bas timestamptz; v_bit timestamptz; v_acilis numeric;
begin
  if current_user in ('authenticated', 'anon') then
    if not public.is_staff() then
      raise exception 'kasa ozeti: yetkisiz';
    end if;
    if not exists (select 1 from public.staff s
                    where s.auth_id = (select auth.uid()) and s.is_active
                      and p_store_id = any(s.store_ids)) then
      raise exception 'kasa ozeti: bu magaza icin yetkin yok';
    end if;
  end if;

  v_gun := coalesce(p_gun, public.nip_business_day(now()));
  v_bas := (v_gun     + time '03:00') at time zone 'Europe/Istanbul';
  v_bit := (v_gun + 1 + time '03:00') at time zone 'Europe/Istanbul';

  -- Acilis: onceki gecerli sayimin kapanisindan cekilen dusulur.
  select coalesce(cc.counted_total - cc.withdrawn, 0) into v_acilis
    from public.cash_counts_gecerli cc
   where cc.store_id = p_store_id and cc.business_day < v_gun
   order by cc.business_day desc limit 1;
  v_acilis := coalesce(v_acilis, 0);

  return query
  with od as (
    -- Cekmece gercegi payments.amount'tir, orders.total DEGIL: tutar alani
    -- kasada serbest girilebiliyor (PaymentPage).
    select p.method::text as method, p.amount from public.payments p
     where p.store_id = p_store_id and p.created_at >= v_bas and p.created_at < v_bit
  ),
  gid as (
    -- expenses.payment_method serbest text; UI 'kasa' yaziyor.
    -- expense_date TAKVIM gunu oldugu icin kesim created_at ile yapilir.
    select e.amount from public.expenses e
     where e.store_id = p_store_id
       and lower(coalesce(e.payment_method, '')) = 'kasa'
       and e.created_at >= v_bas and e.created_at < v_bit
  ),
  sip as (
    select o.id, coalesce(o.total,0) total, coalesce(o.points_used,0) pts,
           coalesce((select sum(p.amount) from public.payments p where p.order_id = o.id), 0) odenen
      from public.orders o
     where o.origin_store_id = p_store_id and o.status = 'paid'
       and coalesce(o.paid_at, o.updated_at) >= v_bas
       and coalesce(o.paid_at, o.updated_at) <  v_bit
  ),
  acik as (
    -- 'debt' enumda var ve bugun kullanilmiyor; kullanilirsa odenmemis siparis
    -- sessizce kaybolmasin. total=0 hayaletler haric.
    select o.total, (public.nip_business_day(o.created_at) = v_gun) as bugun
      from public.orders o
     where o.origin_store_id = p_store_id
       and o.status in ('open','sent','preparing','ready','debt')
       and coalesce(o.total, 0) > 0
  )
  select
    v_gun,
    v_acilis,
    coalesce((select sum(amount) from od where method = 'cash'), 0)::numeric,
    coalesce((select sum(amount) from od where method = 'card'), 0)::numeric,
    coalesce((select sum(amount) from od where method = 'online'), 0)::numeric,
    coalesce((select sum(amount) from od where method = 'transfer'), 0)::numeric,
    coalesce((select sum(amount) from od where method = 'debt'), 0)::numeric,
    coalesce((select sum(pts) from sip), 0)::numeric,
    coalesce((select sum(amount) from gid), 0)::numeric,
    (select count(*) from gid)::integer,
    (v_acilis
      + coalesce((select sum(amount) from od where method = 'cash'), 0)
      - coalesce((select sum(amount) from gid), 0))::numeric,
    (select count(*)            from acik where bugun)::integer,
    coalesce((select sum(total) from acik where bugun), 0)::numeric,
    (select count(*)            from acik where not bugun)::integer,
    coalesce((select sum(total) from acik where not bugun), 0)::numeric,
    -- Fiste yazandan AZ tahsil edilmis siparisler. Farka karismaz ama
    -- gorunmezse gercek bir acik "kasa farki" sanilir.
    (select count(*)                       from sip where odenen + pts < total)::integer,
    coalesce((select sum(total-odenen-pts) from sip where odenen + pts < total), 0)::numeric;
end $$;

-- ----------------------------------------------------------------------------
-- 3) SAYIM TABLOSU
-- ----------------------------------------------------------------------------
create table if not exists public.cash_counts (
  id                uuid primary key default gen_random_uuid(),
  store_id          uuid not null references public.stores(id),
  business_day      date not null,
  denoms            jsonb not null,
  counted_total     numeric generated always as (public.nip_denom_total(denoms)) stored,
  withdrawn         numeric not null default 0,
  opening_float     numeric not null,
  cash_sales        numeric not null,
  cash_expenses     numeric not null,
  expected_cash     numeric not null,
  difference        numeric not null,
  counted_by        uuid references public.staff(id),
  counted_by_name   text,
  counted_by_person text not null,
  note              text,
  supersedes        uuid references public.cash_counts(id),
  reason            text,
  created_at        timestamptz not null default now(),
  constraint cash_counts_denoms_gecerli check (public.nip_denoms_gecerli(denoms)),
  constraint cash_counts_withdrawn_pozitif check (withdrawn >= 0),
  constraint cash_counts_sayan_dolu check (length(btrim(counted_by_person)) >= 2)
);

comment on table public.cash_counts is
  'Gun sonu kasa sayimlari. Insert-only: yanlis sayim silinmez, supersedes ile '
  'gerekceli yeni kayit girilir. Tutarlarin hepsi kayit aninda sunucuda '
  'dondurulur; sonradan veri degisse bile sayim degismez.';

create index if not exists ix_cash_counts_gun on public.cash_counts (store_id, business_day desc, created_at desc);
create index if not exists ix_cash_counts_ustune on public.cash_counts (supersedes) where supersedes is not null;

-- Gecerli sayim = ustune duzeltme girilmemis olan.
create or replace view public.cash_counts_gecerli
with (security_invoker = on) as
  select cc.* from public.cash_counts cc
   where not exists (select 1 from public.cash_counts d where d.supersedes = cc.id);

comment on view public.cash_counts_gecerli is
  'Her sayimin son gecerli hali. Duzeltilmis kayitlar burada gorunmez, '
  'cash_counts''ta gecmis olarak durur.';

-- ----------------------------------------------------------------------------
-- 4) SUNUCU TARAFI DOLDURMA VE KURALLAR
-- SECURITY INVOKER (bkz. dosya basi uyarisi).
-- ----------------------------------------------------------------------------
create or replace function public.fn_kasa_sayimi_doldur()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  o        record;
  v_staff  record;
  v_bugun  date;
  v_onceki uuid;
begin
  v_bugun := public.nip_business_day(now());

  if current_user in ('authenticated', 'anon') then
    select s.id, s.name, s.role::text as role, s.store_ids into v_staff
      from public.staff s
     where s.auth_id = (select auth.uid()) and s.is_active;

    if not found then raise exception 'kasa sayimi: yetkisiz'; end if;
    if v_staff.role in ('kitchen', 'viewer') then
      raise exception 'kasa sayimi: % rolu sayim giremez', v_staff.role;
    end if;
    if not (new.store_id = any(v_staff.store_ids)) then
      raise exception 'kasa sayimi: bu magaza icin yetkin yok';
    end if;

    new.counted_by      := v_staff.id;
    new.counted_by_name := v_staff.name;

    -- Gun: normalde bugun. Gecmis gun yalniz admin, en fazla 14 gun geriye,
    -- gerekce zorunlu. Atlanmis bir geceyi geri doldurabilmek icin var.
    new.business_day := coalesce(new.business_day, v_bugun);
    if new.business_day <> v_bugun then
      if not public.is_admin() then
        raise exception 'kasa sayimi: gecmis gun yalniz sahip tarafindan girilebilir';
      end if;
      if new.business_day > v_bugun then
        raise exception 'kasa sayimi: gelecek gun girilemez';
      end if;
      if new.business_day < v_bugun - 14 then
        raise exception 'kasa sayimi: 14 gunden eski gun girilemez';
      end if;
      if new.reason is null or length(btrim(new.reason)) < 3 then
        raise exception 'kasa sayimi: gecmis gun icin gerekce zorunlu';
      end if;
    end if;

    -- Duzeltme: kendi kaydinin ustune herkes, baskasininkinin ustune yalniz admin.
    if new.supersedes is not null then
      if new.reason is null or length(btrim(new.reason)) < 3 then
        raise exception 'kasa sayimi: duzeltme icin gerekce zorunlu';
      end if;
      if not exists (select 1 from public.cash_counts c
                      where c.id = new.supersedes and c.store_id = new.store_id) then
        raise exception 'kasa sayimi: duzeltilecek kayit bulunamadi';
      end if;
      if not public.is_admin()
         and not exists (select 1 from public.cash_counts c
                          where c.id = new.supersedes and c.counted_by = v_staff.id) then
        raise exception 'kasa sayimi: baskasinin sayimini yalniz sahip duzeltebilir';
      end if;
      -- Ayni kaydin ustune iki kez duzeltme girilmesin; zincir tek dallanir.
      if exists (select 1 from public.cash_counts c where c.supersedes = new.supersedes) then
        raise exception 'kasa sayimi: bu kayit zaten duzeltilmis';
      end if;
      select c.business_day into new.business_day
        from public.cash_counts c where c.id = new.supersedes;
    else
      -- Ayni gun icin ikinci kayit ancak duzeltme olarak girilebilir.
      select cc.id into v_onceki from public.cash_counts_gecerli cc
       where cc.store_id = new.store_id and cc.business_day = new.business_day
       limit 1;
      if v_onceki is not null then
        raise exception 'kasa sayimi: bu gun zaten sayilmis — duzeltmek icin mevcut kaydin ustune gir';
      end if;
    end if;
  else
    new.business_day := coalesce(new.business_day, v_bugun);
  end if;

  -- Sayilar SUNUCUDA hesaplanir; istemciden gelen degerler yok sayilir.
  select * into o from public.kasa_gun_ozeti(new.store_id, new.business_day);

  new.opening_float := o.acilis;
  new.cash_sales    := o.nakit;
  new.cash_expenses := o.nakit_gider;
  new.expected_cash := o.beklenen;
  new.difference    := public.nip_denom_total(new.denoms) - o.beklenen;

  if abs(new.difference) > 100 and (new.note is null or length(btrim(new.note)) < 3) then
    raise exception 'kasa sayimi: TL % fark icin aciklama zorunlu', round(abs(new.difference));
  end if;

  return new;
end $$;

-- Tetikleyici fonksiyonu PostgREST'ten cagrilamaz (dogrudan cagrilinca hata
-- verir) ama yetkiyi acik birakmanin faydasi yok.
revoke all on function public.fn_kasa_sayimi_doldur() from anon, authenticated, public;

drop trigger if exists trg_kasa_sayimi_doldur on public.cash_counts;
create trigger trg_kasa_sayimi_doldur
  before insert on public.cash_counts
  for each row execute function public.fn_kasa_sayimi_doldur();

-- ----------------------------------------------------------------------------
-- 5) RLS — insert + select; update/delete politikasi YOK
-- ----------------------------------------------------------------------------
alter table public.cash_counts enable row level security;

drop policy if exists cash_counts_read_personel on public.cash_counts;
create policy cash_counts_read_personel on public.cash_counts
  for select to authenticated using (public.is_staff());

drop policy if exists cash_counts_insert_personel on public.cash_counts;
create policy cash_counts_insert_personel on public.cash_counts
  for insert to authenticated with check (public.is_staff());

revoke all on table public.cash_counts from anon;
revoke update, delete on table public.cash_counts from authenticated;

revoke all on function public.kasa_gun_ozeti(uuid, date)   from anon, public;
grant execute on function public.kasa_gun_ozeti(uuid, date) to authenticated;
revoke all on function public.nip_denoms_gecerli(jsonb) from anon, public;
revoke all on function public.nip_denom_total(jsonb)    from anon, public;
grant execute on function public.nip_denoms_gecerli(jsonb) to authenticated;
grant execute on function public.nip_denom_total(jsonb)    to authenticated;

-- ----------------------------------------------------------------------------
-- 6) SAYIMIN DAYANDIGI VERIYI KORUMA
-- ----------------------------------------------------------------------------
-- payments: frontend'de yalniz INSERT var (grep teyitli). Guncelleme/silme
-- yetkisi acik kalirsa sayilmis bir gunun tahsilati sonradan silinip fark
-- sifirlanabilir. service_role BYPASSRLS oldugu icin PayTR akisi etkilenmez.
revoke update, delete on table public.payments from authenticated, anon;

-- expenses: sayilmis bir gunun kasa gideri sonradan degistirilemez/silinemez.
-- "Sahte gideri gir, ertesi gun sil" acigi boyle kapanir.
create or replace function public.fn_gider_sayim_kilidi()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare r record;
begin
  r := coalesce(new, old);
  if current_user not in ('authenticated', 'anon') then
    return r;
  end if;
  if exists (
    select 1 from public.cash_counts cc
     where cc.store_id = r.store_id
       and cc.business_day = public.nip_business_day(r.created_at)
  ) then
    raise exception 'bu gunun kasasi sayildi — gider degistirilemez, duzeltmeyi yeni satirla gir';
  end if;
  return r;
end $$;

revoke all on function public.fn_gider_sayim_kilidi() from anon, authenticated, public;

drop trigger if exists trg_gider_sayim_kilidi on public.expenses;
create trigger trg_gider_sayim_kilidi
  before update or delete on public.expenses
  for each row execute function public.fn_gider_sayim_kilidi();
