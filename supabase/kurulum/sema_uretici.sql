-- ============================================================================
-- SEMA URETICI — kaynak projede (Order) calisir, hedef projeye tasinacak
-- DDL'i sirali parcalar halinde kurulum.sema tablosuna yazar.
-- ============================================================================
-- NEDEN VAR: Repodaki migration'lar 2026-08-07'den baslar; orders, products,
-- staff gibi temel tablolar daha eski ve dosyada yok. Yeni bir isletme icin
-- bos bir projeye "ayni sema" kurmanin tek guvenilir yolu canli katalogdan
-- uretmek. pg_dump kullanilamiyor (veritabani sifresi ve dogrudan baglanti
-- yok), o yuzden katalog sorgulariyla ayni isi yapiyoruz.
--
-- KULLANIM (Order'da, postgres rolüyle):
--   \i supabase/kurulum/sema_uretici.sql      -- bu dosya: sema + fonksiyonlar
--   select kurulum.uret();                    -- kurulum.sema doldurulur
--   select bolum, count(*) from kurulum.sema group by 1;
-- Sonra ya kurulum.gonder(...) ile pg_net uzerinden hedefe (bkz. README),
-- ya da parcalar tek tek kopyalanip hedefte calistirilir.
--
-- ISI BITINCE: drop schema kurulum cascade;  (kaynakta iz birakmaz)
--
-- URETILEN SIRA (bagimlilik sirasi, degistirme):
--   00 baslik      set check_function_bodies=off (govdeler tablo sirasi
--                  beklemeden yazilsin)
--   01 uzanti      pgcrypto, uuid-ossp, pg_net, http, pg_cron, vault
--   02 tip         enum tipleri
--   03 sekans      identity OLMAYAN sekanslar (identity'ler tabloyla dogar)
--   03b fonksiyon  imzasinda tablo tipi olmayan fonksiyonlar (tablo
--                  tanimlari generated kolon/check ile bunlari cagirir)
--   04 tablo       kolonlar + default + not null + identity/generated
--   05 kisit       pk, unique, check, exclusion (fk sonra)
--   06 fonksiyon   imzasinda tablo tipi olan fonksiyonlar (setof orders vb.)
--   07 gorunum     pg_get_viewdef + security_invoker
--   08 fk          foreign key'ler (butun tablolar var artik)
--   09 indeks      kisit disi indeksler
--   10 tetikleyici pg_get_triggerdef
--   11 rls         enable/force + politikalar
--   12 yetki       relacl / proacl'den anon, authenticated, service_role, public
--   13 yorum       tablo, kolon, fonksiyon, gorunum yorumlari
--   14 yayin       supabase_realtime + replica identity
--   15 depolama    storage.buckets satirlari + storage.objects politikalari
--
-- Butun nesne adlari search_path = pg_catalog ile uretildigi icin TAM
-- NITELIKLI cikar (public.x, extensions.uuid_generate_v4()). Hedefte hangi
-- search_path olursa olsun ayni yere gider.
-- ============================================================================

create schema if not exists kurulum;

create table if not exists kurulum.sema (
  sira   serial primary key,
  bolum  text not null,
  nesne  text,
  sql    text not null
);

create or replace function kurulum.ekle(p_bolum text, p_nesne text, p_sql text)
returns void language sql as $$
  insert into kurulum.sema(bolum, nesne, sql) values (p_bolum, p_nesne, p_sql);
$$;

-- Politika DDL'i: pg_policy'den. Roller: 0 = public.
create or replace function kurulum.politika_ddl(p_pol pg_catalog.pg_policy)
returns text
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_roller text;
  v_cmd text;
  v_tablo text;
begin
  select coalesce(string_agg(case when r = 0 then 'public' else quote_ident(pg_get_userbyid(r)) end, ', '), 'public')
    into v_roller
    from unnest(p_pol.polroles) r;
  v_cmd := case p_pol.polcmd when 'r' then 'select' when 'a' then 'insert' when 'w' then 'update' when 'd' then 'delete' else 'all' end;
  v_tablo := p_pol.polrelid::regclass::text;
  return format('create policy %I on %s as %s for %s to %s%s%s;',
    p_pol.polname, v_tablo,
    case when p_pol.polpermissive then 'permissive' else 'restrictive' end,
    v_cmd, v_roller,
    case when p_pol.polqual is not null then E'\n  using (' || pg_get_expr(p_pol.polqual, p_pol.polrelid) || ')' else '' end,
    case when p_pol.polwithcheck is not null then E'\n  with check (' || pg_get_expr(p_pol.polwithcheck, p_pol.polrelid) || ')' else '' end);
end $$;

-- ACL'den grant/revoke: yalniz anon, authenticated, service_role, public.
create or replace function kurulum.yetki_ddl(p_nesne_ddl text, p_acl aclitem[], p_tur text)
returns text
language plpgsql
set search_path = pg_catalog
as $$
declare
  v text := '';
  r record;
begin
  if p_acl is null then return null; end if;
  v := format('revoke all on %s %s from anon, authenticated, service_role, public;', p_tur, p_nesne_ddl);
  for r in
    select case when x.grantee = 0 then 'public' else pg_get_userbyid(x.grantee) end as rol,
           string_agg(x.privilege_type, ', ' order by x.privilege_type) as haklar
      from aclexplode(p_acl) x
     where x.grantee = 0 or pg_get_userbyid(x.grantee) in ('anon','authenticated','service_role')
     group by 1 order by 1
  loop
    v := v || format(E'\ngrant %s on %s %s to %s;', r.haklar, p_tur, p_nesne_ddl, r.rol);
  end loop;
  return v;
end $$;

create or replace function kurulum.uret()
returns table(bolum text, adet bigint)
language plpgsql
set search_path = pg_catalog
as $$
declare
  r record;
  v text;
  v_kolonlar text;
begin
  delete from kurulum.sema;
  perform setval(pg_get_serial_sequence('kurulum.sema', 'sira'), 1, false);

  -- 00 baslik
  perform kurulum.ekle('00_baslik', null, 'set check_function_bodies = off;');

  -- 01 uzantilar
  perform kurulum.ekle('01_uzanti', 'pgcrypto',   'create extension if not exists pgcrypto with schema extensions;');
  perform kurulum.ekle('01_uzanti', 'uuid-ossp',  'create extension if not exists "uuid-ossp" with schema extensions;');
  perform kurulum.ekle('01_uzanti', 'pg_net',     'create extension if not exists pg_net with schema extensions;');
  perform kurulum.ekle('01_uzanti', 'http',       'create extension if not exists http with schema extensions;');
  perform kurulum.ekle('01_uzanti', 'pg_cron',    'create extension if not exists pg_cron;');
  perform kurulum.ekle('01_uzanti', 'pg_cron_yetki', 'grant usage on schema cron to postgres; grant all privileges on all tables in schema cron to postgres;');
  perform kurulum.ekle('01_uzanti', 'vault',      'create extension if not exists supabase_vault with schema vault;');

  -- 02 enum tipleri
  for r in
    select t.typname, string_agg(quote_literal(e.enumlabel), ', ' order by e.enumsortorder) as etiketler
      from pg_type t
      join pg_namespace n on n.oid = t.typnamespace
      join pg_enum e on e.enumtypid = t.oid
     where n.nspname = 'public' and t.typtype = 'e'
     group by t.typname order by t.typname
  loop
    perform kurulum.ekle('02_tip', r.typname, format('create type public.%I as enum (%s);', r.typname, r.etiketler));
  end loop;

  -- 03 sekanslar (identity disi)
  for r in
    select s.relname, q.data_type, q.increment_by, q.min_value, q.max_value, q.start_value, q.cache_size, q.cycle
      from pg_class s
      join pg_namespace n on n.oid = s.relnamespace
      join pg_sequences q on q.schemaname = n.nspname and q.sequencename = s.relname
     where n.nspname = 'public' and s.relkind = 'S'
       and not exists (select 1 from pg_depend d where d.objid = s.oid and d.deptype = 'i')
     order by s.relname
  loop
    perform kurulum.ekle('03_sekans', r.relname,
      format('create sequence if not exists public.%I as %s increment by %s minvalue %s maxvalue %s start with %s cache %s%s;',
        r.relname, r.data_type, r.increment_by, r.min_value, r.max_value, r.start_value, r.cache_size,
        case when r.cycle then ' cycle' else '' end));
  end loop;

  -- 03b fonksiyonlar, tablo tipi gerektirmeyenler ONCE. Tablo tanimlari
  -- fonksiyon cagirabiliyor (cash_counts.counted_total generated kolonu
  -- nip_denom_total'i kullanir; check kisitlari, politikalar da). Govde
  -- check_function_bodies=off ile dogrulanmadigi icin tablo beklemez;
  -- yalniz imzasinda public tablo tipi gecenler (setof orders gibi)
  -- tablolardan sonra (06) yazilir.
  for r in
    select p.oid, p.oid::regprocedure as imza
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind in ('f','p')
       and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
       and not exists (
         select 1 from unnest(coalesce(p.proallargtypes, p.proargtypes::oid[]) || p.prorettype) t(tip)
          where t.tip in (select c.reltype from pg_class c join pg_namespace cn on cn.oid = c.relnamespace where cn.nspname = 'public'))
     order by p.oid
  loop
    perform kurulum.ekle('03b_fonksiyon', r.imza::text, pg_get_functiondef(r.oid) || ';');
  end loop;

  -- 04 tablolar
  for r in
    select c.oid, c.relname, c.relpersistence
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'
     order by c.oid
  loop
    select string_agg(
             format('%I %s%s%s%s',
               a.attname,
               format_type(a.atttypid, a.atttypmod),
               case when a.attcollation <> 0 and a.attcollation <> t.typcollation
                    then ' collate ' || quote_ident(coll.collname) else '' end,
               case when a.attidentity in ('a','d')
                      then ' generated ' || case a.attidentity when 'a' then 'always' else 'by default' end || ' as identity'
                    when a.attgenerated = 's'
                      then ' generated always as (' || pg_get_expr(d.adbin, d.adrelid) || ') stored'
                    when d.adbin is not null
                      then ' default ' || pg_get_expr(d.adbin, d.adrelid)
                    else '' end,
               case when a.attnotnull then ' not null' else '' end),
             E',\n  ' order by a.attnum)
      into v_kolonlar
      from pg_attribute a
      join pg_type t on t.oid = a.atttypid
      left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
      left join pg_collation coll on coll.oid = a.attcollation
     where a.attrelid = r.oid and a.attnum > 0 and not a.attisdropped;

    perform kurulum.ekle('04_tablo', r.relname,
      format(E'create %stable public.%I (\n  %s\n);', case when r.relpersistence = 'u' then 'unlogged ' else '' end, r.relname, v_kolonlar));
  end loop;

  -- sekans sahipligi (serial kolonlar)
  for r in
    select s.relname as sekans, c.relname as tablo, a.attname
      from pg_class s
      join pg_namespace n on n.oid = s.relnamespace
      join pg_depend d on d.objid = s.oid and d.deptype = 'a' and d.classid = 'pg_class'::regclass and d.refclassid = 'pg_class'::regclass
      join pg_class c on c.oid = d.refobjid
      join pg_attribute a on a.attrelid = c.oid and a.attnum = d.refobjsubid
     where n.nspname = 'public' and s.relkind = 'S'
       and not exists (select 1 from pg_depend i where i.objid = s.oid and i.deptype = 'i')
  loop
    perform kurulum.ekle('04_tablo', r.sekans || '_sahip',
      format('alter sequence public.%I owned by public.%I.%I;', r.sekans, r.tablo, r.attname));
  end loop;

  -- 05 kisitlar (fk haric)
  for r in
    select con.conname, con.conrelid::regclass as tablo, pg_get_constraintdef(con.oid, true) as tanim, con.contype
      from pg_constraint con
      join pg_namespace n on n.oid = con.connamespace
     where n.nspname = 'public' and con.contype in ('p','u','c','x')
       and con.conrelid <> 0
     order by case con.contype when 'p' then 0 when 'u' then 1 when 'c' then 2 else 3 end, con.conrelid, con.conname
  loop
    perform kurulum.ekle('05_kisit', r.conname,
      format('alter table %s add constraint %I %s;', r.tablo, r.conname, r.tanim));
  end loop;

  -- 06 fonksiyonlar: imzasinda tablo tipi olanlar (tablolar artik var)
  for r in
    select p.oid, p.proname, p.oid::regprocedure as imza
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind in ('f','p')
       and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
       and exists (
         select 1 from unnest(coalesce(p.proallargtypes, p.proargtypes::oid[]) || p.prorettype) t(tip)
          where t.tip in (select c.reltype from pg_class c join pg_namespace cn on cn.oid = c.relnamespace where cn.nspname = 'public'))
     order by p.oid
  loop
    perform kurulum.ekle('06_fonksiyon', r.imza::text, pg_get_functiondef(r.oid) || ';');
  end loop;

  -- 07 gorunumler
  for r in
    select c.oid, c.relname, c.reloptions
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'v'
     order by c.oid
  loop
    perform kurulum.ekle('07_gorunum', r.relname,
      format(E'create view public.%I%s as\n%s', r.relname,
        case when r.reloptions is not null then ' with (' || array_to_string(r.reloptions, ', ') || ')' else '' end,
        pg_get_viewdef(r.oid, true) || ';'));
  end loop;

  -- 08 foreign key'ler
  for r in
    select con.conname, con.conrelid::regclass as tablo, pg_get_constraintdef(con.oid, true) as tanim
      from pg_constraint con
      join pg_namespace n on n.oid = con.connamespace
     where n.nspname = 'public' and con.contype = 'f'
     order by con.conrelid, con.conname
  loop
    perform kurulum.ekle('08_fk', r.conname,
      format('alter table %s add constraint %I %s;', r.tablo, r.conname, r.tanim));
  end loop;

  -- 09 indeksler (kisit indeksleri haric)
  for r in
    select i.indexrelid, ic.relname, pg_get_indexdef(i.indexrelid) as tanim
      from pg_index i
      join pg_class ic on ic.oid = i.indexrelid
      join pg_class tc on tc.oid = i.indrelid
      join pg_namespace n on n.oid = tc.relnamespace
     where n.nspname = 'public'
       and not exists (select 1 from pg_constraint con where con.conindid = i.indexrelid and con.contype in ('p','u','x'))
     order by tc.relname, ic.relname
  loop
    perform kurulum.ekle('09_indeks', r.relname, r.tanim || ';');
  end loop;

  -- 10 tetikleyiciler
  for r in
    select t.oid, t.tgname, t.tgenabled, c.oid::regclass as tablo, pg_get_triggerdef(t.oid) as tanim
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and not t.tgisinternal
     order by c.relname, t.tgname
  loop
    perform kurulum.ekle('10_tetikleyici', r.tgname, r.tanim || ';');
    if r.tgenabled = 'D' then
      perform kurulum.ekle('10_tetikleyici', r.tgname || '_kapali', format('alter table %s disable trigger %I;', r.tablo, r.tgname));
    end if;
  end loop;

  -- 11 rls + politikalar
  for r in
    select c.oid::regclass as tablo, c.relrowsecurity, c.relforcerowsecurity
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'
     order by c.relname
  loop
    if r.relrowsecurity then
      perform kurulum.ekle('11_rls', r.tablo::text, format('alter table %s enable row level security;', r.tablo));
    end if;
    if r.relforcerowsecurity then
      perform kurulum.ekle('11_rls', r.tablo::text || '_force', format('alter table %s force row level security;', r.tablo));
    end if;
  end loop;
  for r in
    select p as pol, p.polname
      from pg_policy p
      join pg_class c on c.oid = p.polrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
     order by c.relname, p.polname
  loop
    perform kurulum.ekle('11_rls', r.polname, kurulum.politika_ddl(r.pol));
  end loop;

  -- 12 yetkiler
  for r in
    select c.oid::regclass as nesne, c.relacl, c.relkind
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r','v','S') and c.relacl is not null
     order by c.relkind, c.relname
  loop
    perform kurulum.ekle('12_yetki', r.nesne::text,
      kurulum.yetki_ddl(r.nesne::text, r.relacl, case when r.relkind = 'S' then 'sequence' else 'table' end));
  end loop;
  for r in
    select p.oid::regprocedure as nesne, p.proacl
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind in ('f','p') and p.proacl is not null
       and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
     order by p.proname
  loop
    perform kurulum.ekle('12_yetki', r.nesne::text, kurulum.yetki_ddl(r.nesne::text, r.proacl, 'function'));
  end loop;
  -- kolon yetkileri (attacl)
  for r in
    select c.oid::regclass as tablo, a.attname, a.attacl
      from pg_attribute a
      join pg_class c on c.oid = a.attrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and a.attacl is not null and a.attnum > 0 and not a.attisdropped
  loop
    select string_agg(format('grant %s (%I) on %s to %s;', x.privilege_type, r.attname, r.tablo,
                             case when x.grantee = 0 then 'public' else quote_ident(pg_get_userbyid(x.grantee)) end), E'\n')
      into v
      from aclexplode(r.attacl) x
     where x.grantee = 0 or pg_get_userbyid(x.grantee) in ('anon','authenticated','service_role');
    if v is not null then
      perform kurulum.ekle('12_yetki', r.tablo::text || '.' || r.attname, v);
    end if;
  end loop;

  -- 13 yorumlar
  for r in
    select c.oid::regclass as tablo, c.relkind, d.description
      from pg_description d
      join pg_class c on c.oid = d.objoid and d.classoid = 'pg_class'::regclass and d.objsubid = 0
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r','v')
  loop
    perform kurulum.ekle('13_yorum', r.tablo::text,
      format('comment on %s %s is %L;', case when r.relkind = 'v' then 'view' else 'table' end, r.tablo, r.description));
  end loop;
  for r in
    select c.oid::regclass as tablo, a.attname, d.description
      from pg_description d
      join pg_class c on c.oid = d.objoid and d.classoid = 'pg_class'::regclass and d.objsubid > 0
      join pg_attribute a on a.attrelid = c.oid and a.attnum = d.objsubid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
  loop
    perform kurulum.ekle('13_yorum', r.tablo::text || '.' || r.attname,
      format('comment on column %s.%I is %L;', r.tablo, r.attname, r.description));
  end loop;
  for r in
    select p.oid::regprocedure as imza, d.description
      from pg_description d
      join pg_proc p on p.oid = d.objoid and d.classoid = 'pg_proc'::regclass
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
  loop
    perform kurulum.ekle('13_yorum', r.imza::text, format('comment on function %s is %L;', r.imza, r.description));
  end loop;
  for r in
    select con.conname, con.conrelid::regclass as tablo, d.description
      from pg_description d
      join pg_constraint con on con.oid = d.objoid and d.classoid = 'pg_constraint'::regclass
      join pg_namespace n on n.oid = con.connamespace
     where n.nspname = 'public'
  loop
    perform kurulum.ekle('13_yorum', r.conname, format('comment on constraint %I on %s is %L;', r.conname, r.tablo, r.description));
  end loop;

  -- 14 realtime yayini + replica identity
  for r in
    select c.oid::regclass as tablo, c.relreplident
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and c.relreplident <> 'd'
  loop
    perform kurulum.ekle('14_yayin', r.tablo::text || '_replident',
      format('alter table %s replica identity %s;', r.tablo, case r.relreplident when 'f' then 'full' when 'n' then 'nothing' else 'default' end));
  end loop;
  for r in
    select schemaname, tablename from pg_publication_tables where pubname = 'supabase_realtime' order by tablename
  loop
    perform kurulum.ekle('14_yayin', r.tablename,
      format('alter publication supabase_realtime add table %I.%I;', r.schemaname, r.tablename));
  end loop;

  -- 15 depolama
  for r in
    select id, name, public, file_size_limit, allowed_mime_types from storage.buckets order by id
  loop
    perform kurulum.ekle('15_depolama', r.id,
      format('insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values (%L, %L, %L, %s, %s) on conflict (id) do nothing;',
        r.id, r.name, r.public,
        coalesce(r.file_size_limit::text, 'null'),
        case when r.allowed_mime_types is null then 'null' else quote_literal(r.allowed_mime_types::text) || '::text[]' end));
  end loop;
  for r in
    select p as pol, p.polname
      from pg_policy p
      join pg_class c on c.oid = p.polrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'storage'
     order by c.relname, p.polname
  loop
    perform kurulum.ekle('15_depolama', r.polname, kurulum.politika_ddl(r.pol));
  end loop;

  return query select s.bolum, count(*) from kurulum.sema s group by s.bolum order by s.bolum;
end $$;
