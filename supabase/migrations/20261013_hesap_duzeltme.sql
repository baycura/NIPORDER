-- Hesabi iptal etmeden duzelt (personel onerisi 6, sahip onayi 13.10).
--
-- Olcum: hesaplarin %10,6'si iptal ediliyor ve nedeni kaydedilmiyor. Mutfaga
-- giden kalem silinemedigi icin personel tum hesabi iptal edip yeniden aciyor.
--
-- 1. hesap_duzeltmeleri: iptal, kalem kaldirma, kalem tasima, masa degistirme
--    kaydi. Yalniz sahip okur. Yalniz asagidaki fonksiyonlar yazar.
-- 2. nip_hesap_iptal: neden zorunlu (5 hazir neden; "Diğer" ise aciklama).
--    Odeme alinmis hesap iptal edilmez: odenmemis kalemler tek tek kaldirilir.
-- 3. fn_iptal_yalniz_rpc: personel hesabi dogrudan "cancelled" yapamaz;
--    eski ekran (onbellekteki surum) da nedensiz iptal edemez.
-- 4. nip_kalem_kaldir: mutfaga gitmis kalem de kaldirilir, neden zorunlu.
--    Odenmis adet kaldirilmaz. Stok takipli urunun raf stogu geri eklenir.
--    Kalan tutar odenenle kapaniyorsa hesap "odendi" olur.
-- 5. nip_kalem_tasi: kalemi (ya da bir kismini) baska acik hesaba ya da yeni
--    "Misafir N" hesabina tasir. Tek islem: ya hepsi ya hicbiri.
-- 6. nip_masa_degistir: hesabin masasini degistirir (ya da masasiz yapar).
-- 7. nip_haftalik_denetim: iptal ve kaldirma ozeti; nedensiz iptal uyarisi.
--
-- Hicbir nesne silinmez. Fonksiyonlar ayni imzayla create or replace.

-- 1 ---------------------------------------------------------------------------
create table if not exists public.hesap_duzeltmeleri (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  store_id       uuid references public.stores(id),
  order_id       uuid references public.orders(id) on delete set null,
  hedef_order_id uuid references public.orders(id) on delete set null,
  staff_id       uuid references public.staff(id),
  tur            text not null
                 check (tur in ('hesap_iptal', 'kalem_kaldir', 'kalem_tasi', 'masa_degistir')),
  neden          text,
  aciklama       text,
  tutar          numeric not null default 0,
  detay          jsonb not null default '{}'::jsonb
);

comment on table public.hesap_duzeltmeleri is
  'Hesap iptali, kalem kaldirma/tasima, masa degistirme kaydi. Yalniz sahip '
  'okur; yalniz nip_hesap_iptal / nip_kalem_kaldir / nip_kalem_tasi / '
  'nip_masa_degistir yazar (20261013_hesap_duzeltme).';

create index if not exists hesap_duzeltmeleri_zaman on public.hesap_duzeltmeleri (created_at desc);
create index if not exists hesap_duzeltmeleri_siparis on public.hesap_duzeltmeleri (order_id);

alter table public.hesap_duzeltmeleri enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = 'hesap_duzeltmeleri'
                    and policyname = 'hesap_duzeltmeleri_sahip_okur') then
    create policy hesap_duzeltmeleri_sahip_okur on public.hesap_duzeltmeleri
      for select to authenticated using (public.is_admin());
  end if;
end $$;

revoke insert, update, delete, truncate on public.hesap_duzeltmeleri from anon, authenticated;
revoke select on public.hesap_duzeltmeleri from anon;
grant select on public.hesap_duzeltmeleri to authenticated;

-- Ortak: hesabin tutarini kalemlerden yeniden hesaplar (personel ekrani ile
-- ayni kural: ikram final_price=0, indirim final_price'tan dusulmus).
create or replace function public.nip_hesap_toplam_yenile(p_order_id uuid)
returns numeric
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_toplam numeric;
begin
  select coalesce(sum(coalesce(oi.final_price, 0) * coalesce(oi.quantity, 0)), 0)
    into v_toplam
    from public.order_items oi where oi.order_id = p_order_id;
  update public.orders o
     set subtotal = v_toplam,
         total    = greatest(0, v_toplam - coalesce(o.discount_amount, 0)),
         updated_at = now()
   where o.id = p_order_id
  returning o.total into v_toplam;
  return v_toplam;
end $function$;

revoke execute on function public.nip_hesap_toplam_yenile(uuid) from public, anon, authenticated;

-- Ortak: odeme alinmis hesap duzeltmeden sonra tamamen odenmis olduysa kapanir.
-- Fazla odenmis olursa islem reddedilir (tum islem geri alinir).
create or replace function public.nip_hesap_odendiyse_kapat(p_order_id uuid, p_staff_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_toplam numeric; v_odenen numeric;
begin
  select coalesce(o.total, 0) into v_toplam from public.orders o where o.id = p_order_id;
  select coalesce(sum(p.amount), 0) into v_odenen from public.payments p where p.order_id = p_order_id;
  if v_odenen <= 0.005 then
    return false;
  end if;
  if v_odenen > v_toplam + 0.005 then
    raise exception 'duzeltme: bu hesaptan TL % alinmis, islemden sonra hesap TL % olur. Fazla alinan para var — once odemeyi duzelt.',
      round(v_odenen), round(v_toplam);
  end if;
  if v_odenen >= v_toplam - 0.005 then
    update public.orders
       set status = 'paid', paid_at = now(), staff_id = coalesce(staff_id, p_staff_id)
     where id = p_order_id and status::text not in ('paid', 'cancelled', 'debt');
    return true;
  end if;
  return false;
end $function$;

revoke execute on function public.nip_hesap_odendiyse_kapat(uuid, uuid) from public, anon, authenticated;

-- 2 ---------------------------------------------------------------------------
create or replace function public.nip_hesap_iptal(p_order_id uuid, p_neden text, p_aciklama text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_staff    record;
  o          record;
  v_masa     text;
  v_kalemler jsonb;
  v_adet     integer;
begin
  select s.id, s.name, s.role::text as role, s.store_ids into v_staff
    from public.staff s where s.auth_id = (select auth.uid()) and s.is_active;
  if not found then raise exception 'iptal: yetkisiz'; end if;
  if v_staff.role in ('viewer', 'kitchen') then
    raise exception 'iptal: % rolu hesap iptal edemez', v_staff.role;
  end if;

  select * into o from public.orders where id = p_order_id for update;
  if not found then raise exception 'iptal: hesap bulunamadi'; end if;
  if not (o.origin_store_id = any(v_staff.store_ids)) then
    raise exception 'iptal: bu magaza icin yetkin yok';
  end if;
  if o.status::text in ('paid', 'cancelled', 'debt') then
    raise exception 'iptal: hesap zaten kapali';
  end if;
  if exists (select 1 from public.payments p where p.order_id = o.id) then
    raise exception 'iptal: bu hesaptan odeme alinmis. Hesap iptal edilmez; odenmemis urunleri tek tek kaldir.';
  end if;

  select count(*) into v_adet from public.order_items oi where oi.order_id = o.id;
  -- Bos hesap (urun yok) icin neden istenmez.
  if v_adet > 0 then
    if p_neden is null or length(btrim(p_neden)) < 3 then
      raise exception 'iptal: neden sec';
    end if;
    if lower(btrim(p_neden)) = 'diğer' and (p_aciklama is null or length(btrim(p_aciklama)) < 3) then
      raise exception 'iptal: "Diğer" icin kisa bir aciklama yaz';
    end if;
  end if;

  select t.name into v_masa from public.cafe_tables t where t.id = o.table_id;
  select coalesce(jsonb_agg(jsonb_build_object(
           'ad', oi.product_name, 'adet', oi.quantity,
           'tutar', coalesce(oi.final_price, 0) * coalesce(oi.quantity, 0),
           'durum', oi.kitchen_status) order by oi.created_at), '[]'::jsonb)
    into v_kalemler
    from public.order_items oi where oi.order_id = o.id;

  update public.orders set status = 'cancelled', updated_at = now() where id = o.id;

  insert into public.hesap_duzeltmeleri (store_id, order_id, staff_id, tur, neden, aciklama, tutar, detay)
  values (o.origin_store_id, o.id, v_staff.id, 'hesap_iptal',
          coalesce(nullif(btrim(coalesce(p_neden, '')), ''), 'Boş hesap'),
          nullif(btrim(coalesce(p_aciklama, '')), ''),
          coalesce(o.total, 0),
          jsonb_build_object('hesap', coalesce(nullif(btrim(coalesce(o.customer_name, '')), ''), v_masa, 'Hesap'),
                             'masa', v_masa, 'kalemler', v_kalemler));
end $function$;

comment on function public.nip_hesap_iptal(uuid, text, text) is
  'Hesabi nedenli iptal eder ve hesap_duzeltmeleri''ne yazar. Odeme alinmis '
  'hesap iptal edilmez (20261013_hesap_duzeltme).';

revoke execute on function public.nip_hesap_iptal(uuid, text, text) from public, anon;
grant execute on function public.nip_hesap_iptal(uuid, text, text) to authenticated;

-- 3 ---------------------------------------------------------------------------
create or replace function public.fn_iptal_yalniz_rpc()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if new.status::text = 'cancelled' and old.status::text is distinct from 'cancelled'
     and current_user in ('authenticated', 'anon') then
    raise exception 'iptal: neden zorunlu — hesabı "İptal Et" düğmesiyle iptal et (sayfayı yenile)';
  end if;
  return new;
end $function$;

do $$
begin
  if not exists (select 1 from pg_trigger
                  where tgname = 'trg_iptal_yalniz_rpc' and tgrelid = 'public.orders'::regclass) then
    create trigger trg_iptal_yalniz_rpc
      before update of status on public.orders
      for each row execute function public.fn_iptal_yalniz_rpc();
  end if;
end $$;

-- 4 ---------------------------------------------------------------------------
create or replace function public.nip_kalem_kaldir(p_item_id uuid, p_adet integer,
                                                   p_neden text, p_aciklama text default null)
returns table(kalan_adet integer, hesap_kapandi boolean, toplam numeric)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_staff   record;
  o         record;
  it        record;
  pr        record;
  v_siparis uuid;
  v_kaldir  integer;
  v_serbest integer;
  v_kalan   integer;
  v_masa    text;
  vs        jsonb;
  i         integer;
  v_toplam  numeric;
  v_kapandi boolean;
begin
  select s.id, s.name, s.role::text as role, s.store_ids into v_staff
    from public.staff s where s.auth_id = (select auth.uid()) and s.is_active;
  if not found then raise exception 'kaldir: yetkisiz'; end if;
  if v_staff.role in ('viewer', 'kitchen') then
    raise exception 'kaldir: % rolu urun kaldiramaz', v_staff.role;
  end if;

  select oi.order_id into v_siparis from public.order_items oi where oi.id = p_item_id;
  if v_siparis is null then raise exception 'kaldir: kalem bulunamadi'; end if;
  -- Kilit sirasi: once hesap, sonra kalem (odeme fonksiyonu ile ayni).
  select * into o from public.orders where id = v_siparis for update;
  select * into it from public.order_items where id = p_item_id for update;
  if not found or it.order_id <> o.id then raise exception 'kaldir: kalem degisti, sayfayi yenile'; end if;

  if not (o.origin_store_id = any(v_staff.store_ids)) then
    raise exception 'kaldir: bu magaza icin yetkin yok';
  end if;
  if o.status::text in ('paid', 'cancelled', 'debt') then
    raise exception 'kaldir: hesap kapali';
  end if;
  if p_neden is null or length(btrim(p_neden)) < 3 then
    raise exception 'kaldir: neden sec';
  end if;
  if lower(btrim(p_neden)) = 'diğer' and (p_aciklama is null or length(btrim(p_aciklama)) < 3) then
    raise exception 'kaldir: "Diğer" icin kisa bir aciklama yaz';
  end if;

  v_serbest := coalesce(it.quantity, 0) - coalesce(it.odenen_adet, 0);
  v_kaldir  := coalesce(p_adet, v_serbest);
  if v_kaldir < 1 then raise exception 'kaldir: adet en az 1'; end if;
  if v_kaldir > v_serbest then
    raise exception 'kaldir: en fazla % adet kaldirilabilir (% adedi odendi)',
      greatest(v_serbest, 0), coalesce(it.odenen_adet, 0);
  end if;

  -- Raf stogu geri: urun hala rafta (fn_decrement_retail_stock eklemede dusmustu).
  select p.id, p.track_stock, p.variants into pr from public.products p where p.id = it.product_id for update;
  if pr.id is not null and pr.track_stock then
    if it.variant_name is not null and jsonb_typeof(pr.variants) = 'array' then
      vs := pr.variants;
      for i in 0 .. jsonb_array_length(vs) - 1 loop
        if vs->i->>'name' = it.variant_name then
          vs := jsonb_set(vs, array[i::text, 'stock'],
                          to_jsonb(coalesce((vs->i->>'stock')::int, 0) + v_kaldir));
        end if;
      end loop;
      update public.products set variants = vs where id = pr.id;
    end if;
    update public.products set retail_stock = coalesce(retail_stock, 0) + v_kaldir where id = pr.id;
  end if;

  select t.name into v_masa from public.cafe_tables t where t.id = o.table_id;
  insert into public.hesap_duzeltmeleri (store_id, order_id, staff_id, tur, neden, aciklama, tutar, detay)
  values (o.origin_store_id, o.id, v_staff.id, 'kalem_kaldir', btrim(p_neden),
          nullif(btrim(coalesce(p_aciklama, '')), ''),
          coalesce(it.final_price, 0) * v_kaldir,
          jsonb_build_object('ad', it.product_name, 'adet', v_kaldir, 'onceki_adet', it.quantity,
                             'durum', it.kitchen_status, 'ikram', coalesce(it.is_treat, false),
                             'hesap', coalesce(nullif(btrim(coalesce(o.customer_name, '')), ''), v_masa, 'Hesap'),
                             'masa', v_masa));

  -- Mutfak (nip_mutfak_trg_kalem_sil / _upd) ve malzeme stogu (fn_stok_kalem_tetik)
  -- kendi tetikleriyle guncellenir.
  if v_kaldir >= coalesce(it.quantity, 0) then
    delete from public.order_items where id = it.id;
    v_kalan := 0;
  else
    v_kalan := it.quantity - v_kaldir;
    update public.order_items set quantity = v_kalan where id = it.id;
  end if;

  v_toplam  := public.nip_hesap_toplam_yenile(o.id);
  v_kapandi := public.nip_hesap_odendiyse_kapat(o.id, v_staff.id);

  return query select v_kalan, v_kapandi, v_toplam;
end $function$;

comment on function public.nip_kalem_kaldir(uuid, integer, text, text) is
  'Kalemi (mutfaga gitmis olsa da) nedenli kaldirir. Odenmis adet kaldirilmaz '
  '(20261013_hesap_duzeltme).';

revoke execute on function public.nip_kalem_kaldir(uuid, integer, text, text) from public, anon;
grant execute on function public.nip_kalem_kaldir(uuid, integer, text, text) to authenticated;

-- 5 ---------------------------------------------------------------------------
-- Tasima sirasinda Telegram'a "yeni siparis" ve raf stoguna ikinci dusum
-- gitmesin: nip.tasima bayragi (islem icinde). Iki tetige yalniz bu kontrol eklenir.
create or replace function public.trg_items_sent_ins()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare r record;
begin
  -- Kalem tasimasi (nip_kalem_tasi) yeni siparis degildir.
  if current_setting('nip.tasima', true) = '1' then
    return null;
  end if;
  for r in
    select n.order_id,
           jsonb_agg(jsonb_build_object('name', coalesce(n.product_name,'Urun'), 'qty', coalesce(n.quantity,1))) as items,
           -- Kalemi kim girdi: personel (staff.id) ya da musteri (bos = QR).
           coalesce(jsonb_agg(distinct n.added_by) filter (where n.added_by is not null), '[]'::jsonb) as added_by,
           bool_or(n.added_by is null) as qr
    from new_rows n join public.orders o on o.id = n.order_id
    where coalesce(n.sent_to_kitchen,false) = true
      and (n.kitchen_destination_store_id is null or n.kitchen_destination_store_id = o.origin_store_id)   -- doner kalemleri panoya gider
    group by n.order_id
  loop
    perform public.tg_call(jsonb_build_object('kind','items_sent','order_id', r.order_id, 'items', r.items,
                                              'added_by', r.added_by, 'qr', r.qr));
  end loop;
  return null;
end $function$;

create or replace function public.fn_decrement_retail_stock()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  p     record;
  vs    jsonb;
  i     int;
  hit   boolean := false;
  v_ad  text;
begin
  if new.product_id is null then return null; end if;
  -- Kalem tasimasinda urun rafa geri donmedi, yeniden de satilmadi.
  if current_setting('nip.tasima', true) = '1' then return null; end if;
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
end $function$;

-- p_kalemler: [{"id": "<order_item_id>", "adet": 1}, ...] — hepsi ayni hesaptan.
-- p_hedef_order_id bos ve p_yeni_misafir true ise yeni "Misafir N" acilir.
create or replace function public.nip_kalem_tasi(p_kalemler jsonb, p_hedef_order_id uuid default null,
                                                 p_yeni_misafir boolean default false, p_neden text default null)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_staff   record;
  o         record;
  h         record;
  it        record;
  e         jsonb;
  v_kaynak  uuid;
  v_adet    integer;
  v_serbest integer;
  v_no      integer;
  v_tutar   numeric := 0;
  v_liste   jsonb := '[]'::jsonb;
  v_masa    text;
  v_hmasa   text;
begin
  select s.id, s.name, s.role::text as role, s.store_ids into v_staff
    from public.staff s where s.auth_id = (select auth.uid()) and s.is_active;
  if not found then raise exception 'tasi: yetkisiz'; end if;
  if v_staff.role in ('viewer', 'kitchen') then
    raise exception 'tasi: % rolu kalem tasiyamaz', v_staff.role;
  end if;
  if p_kalemler is null or jsonb_typeof(p_kalemler) <> 'array' or jsonb_array_length(p_kalemler) = 0 then
    raise exception 'tasi: kalem sec';
  end if;

  select oi.order_id into v_kaynak from public.order_items oi
   where oi.id = nullif(p_kalemler->0->>'id', '')::uuid;
  if v_kaynak is null then raise exception 'tasi: kalem bulunamadi'; end if;
  if p_hedef_order_id is null and not coalesce(p_yeni_misafir, false) then
    raise exception 'tasi: hedef hesap sec';
  end if;
  if p_hedef_order_id = v_kaynak then raise exception 'tasi: kalem zaten bu hesapta'; end if;

  -- Kilit sirasi sabit (kucuk id once): iki kisi ters yonde tasirsa kilitlenmesin.
  if p_hedef_order_id is not null and p_hedef_order_id < v_kaynak then
    select * into h from public.orders where id = p_hedef_order_id for update;
    select * into o from public.orders where id = v_kaynak for update;
  else
    select * into o from public.orders where id = v_kaynak for update;
    if p_hedef_order_id is not null then
      select * into h from public.orders where id = p_hedef_order_id for update;
    end if;
  end if;

  if not (o.origin_store_id = any(v_staff.store_ids)) then
    raise exception 'tasi: bu magaza icin yetkin yok';
  end if;
  if o.status::text in ('paid', 'cancelled', 'debt') then
    raise exception 'tasi: kaynak hesap kapali';
  end if;

  if p_hedef_order_id is not null then
    if h.id is null then raise exception 'tasi: hedef hesap bulunamadi'; end if;
    if h.origin_store_id is distinct from o.origin_store_id then
      raise exception 'tasi: hedef hesap baska magazada';
    end if;
    if h.status::text in ('paid', 'cancelled', 'debt') then
      raise exception 'tasi: hedef hesap kapali';
    end if;
  else
    -- Yeni "Misafir N": isletme gunundeki en buyuk numaranin bir fazlasi
    -- (lib/misafirHesap.js ile ayni kural).
    select coalesce(max((regexp_match(x.customer_name, '^Misafir ([0-9]{1,5})$'))[1]::int), 0) + 1
      into v_no
      from public.orders x
     where x.origin_store_id = o.origin_store_id
       and x.created_at >= (public.nip_business_day(now()) + time '03:00') at time zone 'Europe/Istanbul';
    insert into public.orders (table_id, customer_name, origin_store_id, staff_id, status,
                               subtotal, total, discount_amount)
    values (null, 'Misafir ' || v_no, o.origin_store_id, v_staff.id, 'open', 0, 0, 0)
    returning * into h;
  end if;

  perform set_config('nip.tasima', '1', true);
  for e in select * from jsonb_array_elements(p_kalemler) loop
    select * into it from public.order_items where id = nullif(e->>'id', '')::uuid for update;
    if not found or it.order_id <> o.id then
      raise exception 'tasi: kalemler ayni hesaptan olmali';
    end if;
    v_serbest := coalesce(it.quantity, 0) - coalesce(it.odenen_adet, 0);
    v_adet := coalesce(nullif(e->>'adet', '')::int, v_serbest);
    if v_adet < 1 or v_adet > v_serbest then
      raise exception 'tasi: % icin en fazla % adet tasinabilir', it.product_name, greatest(v_serbest, 0);
    end if;

    if v_adet = coalesce(it.quantity, 0) then
      -- Tamami: kalem hesabiyla birlikte yer degistirir (mutfak durumu korunur).
      update public.order_items set order_id = h.id where id = it.id;
    else
      if coalesce(it.manual_discount, 0) > 0 then
        raise exception 'tasi: indirimli kalem bolunemez — tamamini tasi ya da once indirimi kaldir';
      end if;
      -- Bir kismi: kaynak adet azalir, hedefe ayni ozellikte yeni kalem acilir.
      -- Bekleyen kalem mutfaga hedef hesap adiyla gider; hazirlanmis kalem
      -- mutfaga tekrar gitmez.
      update public.order_items set quantity = it.quantity - v_adet where id = it.id;
      insert into public.order_items (order_id, product_id, product_name, product_price, final_price,
                                      quantity, note, sent_to_kitchen, kitchen_status, notes,
                                      selected_options, store_id, kitchen_destination_store_id,
                                      variant_name, is_takeaway, is_treat, treated_by,
                                      manual_discount, discount_note, added_by, odenen_adet)
      values (h.id, it.product_id, it.product_name, it.product_price, it.final_price,
              v_adet, it.note, coalesce(it.sent_to_kitchen, false) and it.kitchen_status = 'pending',
              it.kitchen_status, it.notes, it.selected_options, it.store_id,
              it.kitchen_destination_store_id, it.variant_name, it.is_takeaway, it.is_treat,
              it.treated_by, it.manual_discount, it.discount_note, it.added_by, 0);
    end if;
    v_tutar := v_tutar + coalesce(it.final_price, 0) * v_adet;
    v_liste := v_liste || jsonb_build_object('ad', it.product_name, 'adet', v_adet);
  end loop;
  perform set_config('nip.tasima', '', true);

  perform public.nip_hesap_toplam_yenile(o.id);
  perform public.nip_hesap_toplam_yenile(h.id);
  perform public.nip_hesap_odendiyse_kapat(o.id, v_staff.id);

  select t.name into v_masa from public.cafe_tables t where t.id = o.table_id;
  select t.name into v_hmasa from public.cafe_tables t where t.id = h.table_id;
  insert into public.hesap_duzeltmeleri (store_id, order_id, hedef_order_id, staff_id, tur, neden, tutar, detay)
  values (o.origin_store_id, o.id, h.id, v_staff.id, 'kalem_tasi',
          coalesce(nullif(btrim(coalesce(p_neden, '')), ''), 'Başka hesaba taşındı'),
          v_tutar,
          jsonb_build_object('kalemler', v_liste,
                             'hesap', coalesce(nullif(btrim(coalesce(o.customer_name, '')), ''), v_masa, 'Hesap'),
                             'hedef', coalesce(nullif(btrim(coalesce(h.customer_name, '')), ''), v_hmasa, 'Hesap'),
                             'yeni_misafir', p_hedef_order_id is null));
  return h.id;
end $function$;

comment on function public.nip_kalem_tasi(jsonb, uuid, boolean, text) is
  'Kalemleri (ya da bir kismini) baska acik hesaba ya da yeni Misafir N '
  'hesabina tasir; tek islem (20261013_hesap_duzeltme).';

revoke execute on function public.nip_kalem_tasi(jsonb, uuid, boolean, text) from public, anon;
grant execute on function public.nip_kalem_tasi(jsonb, uuid, boolean, text) to authenticated;

-- 6 ---------------------------------------------------------------------------
create or replace function public.nip_masa_degistir(p_order_id uuid, p_table_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_staff record;
  o       record;
  t       record;
  v_eski  text;
  v_yeni  text;
begin
  select s.id, s.name, s.role::text as role, s.store_ids into v_staff
    from public.staff s where s.auth_id = (select auth.uid()) and s.is_active;
  if not found then raise exception 'masa: yetkisiz'; end if;
  if v_staff.role in ('viewer', 'kitchen') then
    raise exception 'masa: % rolu masa degistiremez', v_staff.role;
  end if;

  select * into o from public.orders where id = p_order_id for update;
  if not found then raise exception 'masa: hesap bulunamadi'; end if;
  if not (o.origin_store_id = any(v_staff.store_ids)) then
    raise exception 'masa: bu magaza icin yetkin yok';
  end if;
  if o.status::text in ('paid', 'cancelled', 'debt') then
    raise exception 'masa: hesap kapali';
  end if;
  if o.table_id is not distinct from p_table_id then
    return;
  end if;
  if p_table_id is not null then
    select * into t from public.cafe_tables ct where ct.id = p_table_id;
    if not found then raise exception 'masa: masa bulunamadi'; end if;
    if t.store_id is not null and t.store_id <> o.origin_store_id then
      raise exception 'masa: masa baska magazada';
    end if;
    v_yeni := t.name;
  end if;

  select ct.name into v_eski from public.cafe_tables ct where ct.id = o.table_id;
  update public.orders set table_id = p_table_id, updated_at = now() where id = o.id;

  insert into public.hesap_duzeltmeleri (store_id, order_id, staff_id, tur, tutar, detay)
  values (o.origin_store_id, o.id, v_staff.id, 'masa_degistir', coalesce(o.total, 0),
          jsonb_build_object('hesap', coalesce(nullif(btrim(coalesce(o.customer_name, '')), ''), v_eski, 'Hesap'),
                             'eski_masa', v_eski, 'yeni_masa', v_yeni));
end $function$;

comment on function public.nip_masa_degistir(uuid, uuid) is
  'Hesabin masasini degistirir (p_table_id bos: masasiz) ve kaydeder (20261013_hesap_duzeltme).';

revoke execute on function public.nip_masa_degistir(uuid, uuid) from public, anon;
grant execute on function public.nip_masa_degistir(uuid, uuid) to authenticated;

-- 7 ---------------------------------------------------------------------------
-- Degisen yerler: iptal ve kaldirma ozeti, nedensiz iptal uyarisi. Gerisi
-- 20261013_kasa_yeniden_baslangic.sql'deki tanimla ayni.
create or replace function public.nip_haftalik_denetim()
returns table(onem text, baslik text, detay text, sayi numeric)
language sql
stable security definer
set search_path to 'public'
as $function$
  -- Odeme kaydi olmadan kapanmis siparisler (son 7 isletme gunu)
  select 'yuksek', 'Ödeme kaydı olmayan sipariş',
         count(*)::text || ' sipariş ₺' || round(sum(coalesce(o.total,0)))::text || ' — hangi yöntemle tahsil edildiği yok',
         count(*)::numeric
    from orders o
   where o.status = 'paid'
     and nip_business_day(coalesce(o.paid_at, o.created_at)) >= nip_business_day(now()) - 7
     and coalesce(o.points_used,0) < coalesce(o.total,0)
     and not exists (select 1 from payments p where p.order_id = o.id)
  having count(*) > 0

  union all
  -- Sayilmamis geceler: ciro olan ama sayimi olmayan gunler
  select 'yuksek', 'Kasası sayılmamış gece',
         count(*)::text || ' gece', count(*)::numeric
    from (
      select nip_business_day(p.created_at) g, p.store_id
        from payments p
       where nip_business_day(p.created_at) between nip_business_day(now()) - 7 and nip_business_day(now()) - 1
       group by 1, 2
    ) x
   where not exists (select 1 from cash_counts cc
                      where cc.store_id = x.store_id and cc.business_day = x.g)
  having count(*) > 0

  union all
  -- Buyuk kasa farki (yeniden baslangic sayimi haric: acilisi bilinmiyordu)
  select 'yuksek', 'Büyük kasa farkı',
         count(*)::text || ' gecede ₺100 üstü fark', count(*)::numeric
    from cash_counts_gecerli cc
   where cc.business_day >= nip_business_day(now()) - 7 and abs(cc.difference) > 100
     and not cc.yeniden_baslangic
  having count(*) > 0

  union all
  -- Nedensiz iptal: dolu hesap kayitsiz iptal edilmis (eski yol ya da sunucu islemi)
  select 'orta', 'Nedeni yazılmamış iptal',
         count(*)::text || ' hesap ₺' || round(sum(coalesce(o.total,0)))::text,
         count(*)::numeric
    from orders o
   where o.status = 'cancelled' and coalesce(o.total, 0) > 0
     and coalesce(o.updated_at, o.created_at) >= now() - interval '7 days'
     and not exists (select 1 from hesap_duzeltmeleri d where d.order_id = o.id and d.tur = 'hesap_iptal')
  having count(*) > 0

  union all
  -- Iptal edilen hesaplar (nedenli)
  select 'orta', 'İptal edilen hesap',
         count(*)::text || ' hesap ₺' || round(coalesce(sum(d.tutar), 0))::text
           || ' — en sık neden: ' || coalesce(mode() within group (order by d.neden), '—'),
         count(*)::numeric
    from hesap_duzeltmeleri d
   where d.tur = 'hesap_iptal' and d.created_at >= now() - interval '7 days'
     and d.tutar > 0
  having count(*) > 0

  union all
  -- Kaldirilan urunler (mutfaga gitmis olabilir)
  select 'bilgi', 'Hesaptan kaldırılan ürün',
         count(*)::text || ' kalem ₺' || round(coalesce(sum(d.tutar), 0))::text
           || ' — en sık neden: ' || coalesce(mode() within group (order by d.neden), '—'),
         count(*)::numeric
    from hesap_duzeltmeleri d
   where d.tur = 'kalem_kaldir' and d.created_at >= now() - interval '7 days'
  having count(*) > 0

  union all
  -- Yeniden baslangic: onceki geceler sayilmadigi icin farki hesaba katilmayan sayim
  select 'bilgi', 'Kasa yeniden başladı',
         count(*)::text || ' sayım önceki geceler sayılmadığı için yeni başlangıç sayıldı — farkı hesaba katılmadı',
         count(*)::numeric
    from cash_counts_gecerli cc
   where cc.business_day >= nip_business_day(now()) - 7 and cc.yeniden_baslangic
     and cc.tur = 'kapanis'
  having count(*) > 0

  union all
  -- Ciroya dokunan maliyetsiz malzeme
  select 'orta', 'Maliyeti girilmemiş malzeme',
         count(*)::text || ' malzeme satılan üründe kullanılıyor', count(*)::numeric
    from ingredients i
   where coalesce(i.cost_per_unit,0) = 0
     and exists (
       select 1 from recipes r join order_items oi on oi.product_id = r.product_id
        join orders o on o.id = oi.order_id and o.status = 'paid'
       where r.ingredient_id = i.id)
  having count(*) > 0

  union all
  -- Alis fiyati girilmemis, satilan urun
  select 'orta', 'Alış fiyatı girilmemiş ürün',
         count(*)::text || ' ürün, ₺' || round(coalesce(sum(x.ciro),0))::text || ' ciro', count(*)::numeric
    from (
      select p.id, sum(coalesce(oi.final_price,0)*coalesce(oi.quantity,1)) ciro
        from products p
        join order_items oi on oi.product_id = p.id
        join orders o on o.id = oi.order_id and o.status = 'paid'
       where p.cost_price is null and not p.kitchen_consignment
         and not exists (select 1 from recipes r where r.product_id = p.id)
       group by p.id
    ) x
  having count(*) > 0

  union all
  -- Esigin altina dusen stok
  select 'orta', 'Kritik stok',
         string_agg(i.name, ' · ' order by i.name), count(*)::numeric
    from ingredients i
   where coalesce(i.min_stock,0) > 0 and coalesce(i.stock_qty,0) < i.min_stock
  having count(*) > 0

  union all
  -- Eksi stok: dusum gercekten calistiginin isareti ama sayim hatasi da olabilir
  select 'orta', 'Eksiye düşen stok',
         string_agg(i.name, ' · ' order by i.name), count(*)::numeric
    from ingredients i where coalesce(i.stock_qty,0) < 0
  having count(*) > 0

  union all
  -- Recetesiz aktif urun
  select 'bilgi', 'Reçetesi olmayan ürün',
         count(*)::text || ' aktif ürün — stoktan düşmüyor', count(*)::numeric
    from products p
   where p.is_available and not p.kitchen_consignment and not p.track_stock
     and not exists (select 1 from recipes r where r.product_id = p.id)
  having count(*) > 0

  union all
  -- Uzun suredir acik hesap
  select 'bilgi', 'Unutulmuş açık hesap',
         count(*)::text || ' hesap ₺' || round(sum(coalesce(o.total,0)))::text,
         count(*)::numeric
    from orders o
   where o.status in ('open','sent','preparing','ready')
     and coalesce(o.total,0) > 0
     and o.created_at < now() - interval '2 days'
  having count(*) > 0
$function$;
