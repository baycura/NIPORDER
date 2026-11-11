-- IKRAM OLARAK KAPAT + IKRAM IZI (sahip karari 11.11.2026)
--
-- Sorun: kalemlerin tamami ikram edilen hesabin toplami 0 TL olur. Kasa 0 TL
-- tahsil etmeyi reddediyordu ("Tutar gir"), hesap acik kaliyordu; personel
-- hesabi IPTAL ediyordu ve ikramin izi (ne verildi, kim verdi) kayboluyordu.
--
-- Sahip karari: "Ikram olarak kapatilabilsin ama kim ikram etti ise bilgimiz
-- olsun."
--
-- Bu gocus:
--   1) Ikram isaretli kalemin vereni bos olamaz (kisit).
--   2) ikram_izi: ikrami KIM ISARETLEDI, KIM GERI ALDI, hesabi KIM KAPATTI.
--      Veren, personelin sectigi kisidir (kendisi ya da sahip); isaretleyen
--      oturumdan okunur, personel degistiremez. Yalniz sahip okur.
--   3) nip_ikram_kapat: 0 TL kalan hesabi tek adimda, tahsilat yazmadan
--      kapatir. Verensiz kalem varsa veren ister.
--   4) nip_ikram_raporu: sahibin "Ikramlar" listesi.
--
-- Hicbir nesne kaldirilmaz. Geri alma: iki tetik "alter table ... disable
-- trigger" ile durdurulur, kisit "not valid" birakilabilir; fonksiyonlar
-- cagrilmadikca etkisizdir.

-- 1) ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_constraint
                  where conname = 'order_items_ikram_veren'
                    and conrelid = 'public.order_items'::regclass) then
    alter table public.order_items
      add constraint order_items_ikram_veren
      check (not is_treat or treated_by is not null) not valid;
  end if;
end $$;
alter table public.order_items validate constraint order_items_ikram_veren;

-- 2) ---------------------------------------------------------------------
create table if not exists public.ikram_izi (
  id            bigint generated always as identity primary key,
  created_at    timestamptz not null default now(),
  store_id      uuid,
  order_id      uuid not null,
  order_item_id uuid,
  islem         text not null check (islem in ('ikram', 'geri_al', 'kapat')),
  product_name  text,
  quantity      integer,
  deger         numeric,
  veren_id      uuid,
  veren_ad      text,
  yapan_id      uuid,
  yapan_ad      text
);
create index if not exists ikram_izi_kalem on public.ikram_izi(order_item_id);
create index if not exists ikram_izi_hesap on public.ikram_izi(order_id);
create index if not exists ikram_izi_tarih on public.ikram_izi(created_at desc);

comment on table public.ikram_izi is
  'Ikram izi: kim isaretledi, kim geri aldi, 0 TL hesabi kim kapatti. Satirlari tetik ve nip_ikram_kapat yazar; yalniz sahip okur.';
comment on column public.ikram_izi.deger is
  'Liste degeri (product_price x adet). kapat satirinda hesabin ikram toplami.';

alter table public.ikram_izi enable row level security;
do $$
begin
  if not exists (select 1 from pg_policy
                  where polname = 'ikram_izi_sahip_okur'
                    and polrelid = 'public.ikram_izi'::regclass) then
    create policy ikram_izi_sahip_okur on public.ikram_izi
      for select to authenticated using (public.is_admin());
  end if;
end $$;
revoke all on public.ikram_izi from anon, authenticated;
grant select on public.ikram_izi to authenticated;

-- Kalem tetigi. KASAYI ASLA DURDURMAZ: iz yazilamazsa uyari birakir, kalem
-- yine kaydedilir.
create or replace function public.fn_ikram_izi()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_yapan  record;
  v_islem  text;
  v_veren  uuid;
  v_ad     text;
begin
  if tg_op = 'INSERT' then
    if not coalesce(new.is_treat, false) then return null; end if;
    v_islem := 'ikram';
  else
    if coalesce(new.is_treat, false) = coalesce(old.is_treat, false)
       and new.treated_by is not distinct from old.treated_by then
      return null;
    end if;
    v_islem := case when coalesce(new.is_treat, false) then 'ikram' else 'geri_al' end;
  end if;

  begin
    select s.id, s.name into v_yapan
      from public.staff s
     where s.auth_id = (select auth.uid()) and s.is_active
     limit 1;

    v_veren := case when v_islem = 'ikram' then new.treated_by
                    else (case when tg_op = 'UPDATE' then old.treated_by end) end;
    select s.name into v_ad from public.staff s where s.id = v_veren;

    insert into public.ikram_izi(store_id, order_id, order_item_id, islem, product_name, quantity,
                                 deger, veren_id, veren_ad, yapan_id, yapan_ad)
    values (new.store_id, new.order_id, new.id, v_islem, new.product_name, coalesce(new.quantity, 1),
            coalesce(new.product_price, 0) * coalesce(new.quantity, 1),
            v_veren, v_ad, v_yapan.id, v_yapan.name);
  exception when others then
    raise warning 'ikram izi yazilamadi: %', sqlerrm;
  end;
  return null;
end $function$;

do $$
begin
  if not exists (select 1 from pg_trigger
                  where tgname = 'trg_ikram_izi'
                    and tgrelid = 'public.order_items'::regclass) then
    create trigger trg_ikram_izi
      after insert or update of is_treat, treated_by on public.order_items
      for each row execute function public.fn_ikram_izi();
  end if;
end $$;

-- 3) ---------------------------------------------------------------------
-- 0 TL kalan hesabi tahsilat yazmadan kapatir. Kapatma isini nip_odeme_al
-- yapar (tutar 0): kalem isaretleme, puan, hesap durumu tek yerde kalir.
create or replace function public.nip_ikram_kapat(p_order_id uuid, p_veren uuid default null)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_staff    record;
  o          record;
  v_kalem    integer;
  v_kalan    numeric;
  v_eksik    integer;
  v_veren_id uuid;
  v_toplam   numeric;
  v_deger    numeric;
  v_adlar    text;
  v_sonuc    record;
begin
  select s.id, s.name, s.store_ids into v_staff
    from public.staff s
   where s.auth_id = (select auth.uid()) and s.is_active
   limit 1;
  if v_staff.id is null then
    raise exception 'ikram: yetkisiz';
  end if;

  -- Hesabi KILITLE: iki kasiyer ayni anda kapatamaz, araya urun de giremez.
  select * into o from public.orders where id = p_order_id for update;
  if not found then raise exception 'ikram: hesap bulunamadi'; end if;
  if o.status::text = 'paid' then
    raise exception 'ikram: bu hesap zaten kapatilmis';
  end if;
  if o.status::text = 'cancelled' then
    raise exception 'ikram: iptal edilmis hesap kapatilamaz';
  end if;
  if not (o.origin_store_id = any(v_staff.store_ids)) then
    raise exception 'ikram: bu magaza icin yetkin yok';
  end if;

  select count(*) into v_kalem
    from public.order_items oi
   where oi.order_id = p_order_id and coalesce(oi.quantity, 0) > 0;
  if v_kalem = 0 then
    raise exception 'ikram: hesapta urun yok — bos hesabi iptal et';
  end if;

  v_kalan := public.nip_kalan_tutar(p_order_id);
  if v_kalan > 0.005 then
    raise exception 'ikram: hesapta tahsil edilecek TL % var — once tahsil et ya da urunleri ikram isaretle',
      round(v_kalan);
  end if;

  -- Odenmemis kalemlerin hepsi 0 TL. Ikram isareti ya da vereni eksik olana
  -- veren yazilir: "kim ikram etti" bos kalmaz.
  select count(*) into v_eksik
    from public.order_items oi
   where oi.order_id = p_order_id and oi.quantity > oi.odenen_adet
     and (not coalesce(oi.is_treat, false) or oi.treated_by is null);

  if v_eksik > 0 then
    if p_veren is null then
      raise exception 'ikram: ikrami kimin verdigini sec';
    end if;
    -- Veren: islemi yapan ya da sahip. Baska personel adina ikram yazilmaz.
    select s.id into v_veren_id
      from public.staff s
     where s.id = p_veren and s.is_active
       and (s.id = v_staff.id or s.role::text = 'admin');
    if v_veren_id is null then
      raise exception 'ikram: veren olarak yalniz kendini ya da sahibi secebilirsin';
    end if;

    update public.order_items oi
       set is_treat = true, treated_by = v_veren_id, final_price = 0
     where oi.order_id = p_order_id and oi.quantity > oi.odenen_adet
       and (not coalesce(oi.is_treat, false) or oi.treated_by is null);
  end if;

  -- Toplam kalemlerden yeniden hesaplanir. Ekran toplami arkadan yazar; o yazi
  -- gecikirse hesap eski (dolu) toplamla kapanir ve ciroya para yazilirdi.
  select coalesce(sum(oi.final_price * oi.quantity), 0) into v_toplam
    from public.order_items oi
   where oi.order_id = p_order_id;
  update public.orders
     set subtotal = v_toplam, total = v_toplam
   where id = p_order_id;

  select * into v_sonuc
    from public.nip_odeme_al(p_order_id, 'cash', 0, null, false, null, null, null);
  if not coalesce(v_sonuc.kapandi, false) then
    raise exception 'ikram: hesap kapanmadi (kalan TL %)', round(coalesce(v_sonuc.kalan, 0));
  end if;

  select coalesce(sum(oi.product_price * oi.quantity), 0),
         string_agg(distinct s.name, ', ')
    into v_deger, v_adlar
    from public.order_items oi
    left join public.staff s on s.id = oi.treated_by
   where oi.order_id = p_order_id and coalesce(oi.is_treat, false);

  insert into public.ikram_izi(store_id, order_id, islem, quantity, deger,
                               veren_id, veren_ad, yapan_id, yapan_ad)
  values (o.origin_store_id, p_order_id, 'kapat', v_kalem, v_deger,
          v_veren_id, v_adlar, v_staff.id, v_staff.name);

  return json_build_object('ok', true, 'deger', v_deger, 'verenler', v_adlar, 'urun', v_kalem);
end $function$;

revoke all on function public.nip_ikram_kapat(uuid, uuid) from public, anon;
grant execute on function public.nip_ikram_kapat(uuid, uuid) to authenticated;

-- 4) ---------------------------------------------------------------------
-- Sahibin listesi: GUNCEL ikram kalemleri (geri alinan ikram cikmaz).
create or replace function public.nip_ikram_raporu(p_from timestamptz, p_to timestamptz)
returns table(kalem_id uuid, siparis_id uuid, tarih timestamptz, veren_id uuid, veren text,
              isaretleyen text, urun text, adet integer, deger numeric, durum text,
              hesap text, tam_ikram boolean, kapatan text)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.is_admin() then
    raise exception 'ikram raporu: yalniz sahip gorebilir';
  end if;
  return query
  select oi.id, oi.order_id, coalesce(a.created_at, oi.created_at), oi.treated_by,
         coalesce(s.name, '—'), a.yapan_ad,
         (oi.product_name || coalesce(' · ' || nullif(oi.variant_name, ''), ''))::text,
         oi.quantity, (coalesce(oi.product_price, 0) * oi.quantity)::numeric,
         o.status::text,
         coalesce(t.name, nullif(btrim(o.customer_name), ''), 'Hesap')::text,
         (o.status::text = 'paid' and coalesce(o.total, 0) <= 0.005),
         k.yapan_ad
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    left join public.staff s on s.id = oi.treated_by
    left join public.cafe_tables t on t.id = o.table_id
    left join lateral (
      select i.yapan_ad, i.created_at
        from public.ikram_izi i
       where i.order_item_id = oi.id and i.islem = 'ikram'
       order by i.created_at desc limit 1
    ) a on true
    left join lateral (
      select i.yapan_ad
        from public.ikram_izi i
       where i.order_id = oi.order_id and i.islem = 'kapat'
       order by i.created_at desc limit 1
    ) k on true
   where coalesce(oi.is_treat, false)
     and oi.created_at >= p_from and oi.created_at < p_to
     and o.status::text <> 'cancelled'
   order by 3 desc;
end $function$;

revoke all on function public.nip_ikram_raporu(timestamptz, timestamptz) from public, anon;
grant execute on function public.nip_ikram_raporu(timestamptz, timestamptz) to authenticated;
