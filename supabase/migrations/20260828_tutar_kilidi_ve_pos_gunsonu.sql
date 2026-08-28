-- ============================================================================
-- TUTAR KILIDI + POS GUNSONU              20260828_tutar_kilidi_ve_pos_gunsonu
-- ============================================================================
-- Ciro/kasa farkinin (tum zamanlarda TL 5.370, 19 siparis) iki kok nedenine
-- birden cozum:
--
-- 1) TUTAR KILIDI — kasada tutar alani serbestti: 400'luk hesap 440 yazilip
--    kapatilabiliyor, kimse sormuyordu. Atomik RPC'den SONRA bile 3 uyusmazlik
--    olustu; hepsi bu siniftan. Artik nip_odeme_al hesap toplamindan farkli
--    tutari ancak FARK NEDENIYLE kabul eder; neden payments.note'a yazilir.
--    Puanli odemede kural atlanir (puan dusumu tetikleyicide hesaplandigi
--    icin sunucu beklenen tutari bilemez).
--
-- 2) POS GUNSONU — kapanis sayimi nakdi dogruluyordu ama kartin bagimsiz
--    dogrulamasi yoktu. Kapanista POS cihazinin gunsonu (Z) toplami tek
--    kutuya yazilir; sunucu kendi kart toplamini (kart_satis) yanina
--    muhurler, fark uretilir. Nakit + kart + stok — "her hesap girildi mi"
--    sorusunun uc bacagi tamamlanir. Alan istege bagli: girilmezse null,
--    kapanisi BLOKLAMAZ (yorgun geceyi kilitlemek kurali oldurur).
--
-- nip_odeme_al DROP + CREATE: parametre eklemek yeni bir overload yaratirdi;
-- eski 5-parametreli imza kalsaydi PostgREST cagrilari belirsizlesirdi.
-- Yeni parametre default'lu: eski frontend (dagitim araligi boyunca) tutari
-- degistirmedigi surece calismaya devam eder.
--
-- Geri alma:
--   drop function if exists public.nip_odeme_al(uuid, text, numeric, uuid, boolean, text);
--   -- 20260826_odeme_atomik.sql'deki 5 parametreli hali geri yukle
--   alter table public.payments drop column if exists note;
--   alter table public.cash_counts drop column if exists pos_gunsonu;
--   alter table public.cash_counts drop column if exists kart_satis;
--   -- fn_kasa_sayimi_doldur onceki migration'daki haline dondurulmeli
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) payments.note — fark nedeni buraya damgalanir
-- ----------------------------------------------------------------------------
alter table public.payments add column if not exists note text;

comment on column public.payments.note is
  'Tahsilat tutari hesap toplamindan farkliysa nedeni (bahsis / eksik tahsilat '
  'aciklamasi). nip_odeme_al doldurur.';

-- ----------------------------------------------------------------------------
-- 2) nip_odeme_al — fark nedeni zorunlulugu
-- ----------------------------------------------------------------------------
drop function if exists public.nip_odeme_al(uuid, text, numeric, uuid, boolean);

create or replace function public.nip_odeme_al(
  p_order_id    uuid,
  p_method      text,
  p_amount      numeric,
  p_customer_id uuid    default null,
  p_use_points  boolean default false,
  p_fark_nedeni text    default null)
returns table (tahsil numeric, puan numeric, kalan_borc numeric)
language plpgsql
set search_path to 'public'
as $$
declare
  o       record;
  v_staff record;
  v_uye   uuid;
  v_borc  numeric := 0;
begin
  if p_method not in ('cash','card','transfer','debt','online') then
    raise exception 'odeme: gecersiz yontem %', p_method;
  end if;
  if coalesce(p_amount, 0) < 0 then
    raise exception 'odeme: tutar negatif olamaz';
  end if;

  select s.id, s.store_ids into v_staff
    from public.staff s
   where s.auth_id = (select auth.uid()) and s.is_active;
  if current_user in ('authenticated', 'anon') and v_staff.id is null then
    raise exception 'odeme: yetkisiz';
  end if;

  -- Siparisi KILITLE: iki kasiyer ayni hesabi ayni anda kapatamaz.
  select * into o from public.orders where id = p_order_id for update;
  if not found then raise exception 'odeme: siparis bulunamadi'; end if;
  if o.status::text = 'paid' then
    raise exception 'odeme: bu hesap zaten kapatilmis';
  end if;
  if o.status::text = 'cancelled' then
    raise exception 'odeme: iptal edilmis hesap tahsil edilemez';
  end if;
  if v_staff.id is not null and not (o.origin_store_id = any(v_staff.store_ids)) then
    raise exception 'odeme: bu magaza icin yetkin yok';
  end if;

  -- TUTAR KILIDI: hesap toplamindan farkli tutar ancak gerekceyle gecer.
  -- Puanli odemede beklenen tutar burada bilinemez (puan dusumu tetikleyicide),
  -- o yol muaf. Fark tespiti degil BEYAN istiyoruz: 40 lira fazlanin bahsis mi
  -- yanlis tus mu oldugunu ancak o an oradaki kisi bilir.
  if coalesce(p_amount, 0) > 0
     and not coalesce(p_use_points, false)
     and p_amount <> coalesce(o.total, 0)
     and (p_fark_nedeni is null or length(btrim(p_fark_nedeni)) < 2) then
    raise exception 'odeme: tutar hesaptan farkli (hesap TL %, girilen TL %) — fark nedenini yaz',
      round(coalesce(o.total, 0)), round(p_amount);
  end if;

  -- Siparis zaten bir uyeye bagliysa (QR ile giris) kasiyer ustune yazamaz.
  v_uye := coalesce(o.customer_id, p_customer_id);

  if p_method = 'debt' then
    if v_uye is null then raise exception 'odeme: borc icin uye secilmeli'; end if;
    update public.customers
       set outstanding_balance = coalesce(outstanding_balance, 0) + p_amount
     where id = v_uye
     returning outstanding_balance into v_borc;
    if not found then raise exception 'odeme: uye bulunamadi ya da yetki yok'; end if;
  end if;

  -- Puan tutarin tamamini karsiladiysa tahsilat 0 olabilir; bos satir atilmaz.
  if coalesce(p_amount, 0) > 0 then
    insert into public.payments(order_id, amount, method, store_id, staff_id, note)
    values (p_order_id, p_amount, p_method::payment_method, o.origin_store_id, v_staff.id,
            nullif(btrim(coalesce(p_fark_nedeni, '')), ''));
  end if;

  -- staff_id: tahsil eden damgalanir ki satis "personelsiz" kalmasin; ama
  -- siparisi acan garson varsa o korunur, kasiyer ezmez.
  update public.orders set
    status      = 'paid',
    paid_at     = now(),
    use_points  = (p_method <> 'debt' and coalesce(p_use_points, false) and v_uye is not null),
    customer_id = v_uye,
    staff_id    = coalesce(o.staff_id, v_staff.id)
  where id = p_order_id;

  return query
    select coalesce(p_amount, 0),
           (select coalesce(x.points_used, 0) from public.orders x where x.id = p_order_id),
           v_borc;
end $$;

comment on function public.nip_odeme_al(uuid, text, numeric, uuid, boolean, text) is
  'Tahsilati tek islemde alir: payments satiri + siparis kapatma + borc bakiyesi. '
  'Tutar hesap toplamindan farkliysa fark nedeni zorunlu; neden payments.note''a '
  'yazilir. Siparisi kilitler.';

revoke all on function public.nip_odeme_al(uuid, text, numeric, uuid, boolean, text) from anon, public;
grant execute on function public.nip_odeme_al(uuid, text, numeric, uuid, boolean, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 3) POS gunsonu kolonlari
-- ----------------------------------------------------------------------------
alter table public.cash_counts add column if not exists pos_gunsonu numeric;
alter table public.cash_counts add column if not exists kart_satis  numeric;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'cash_counts_pos_pozitif') then
    alter table public.cash_counts add constraint cash_counts_pos_pozitif
      check (pos_gunsonu is null or pos_gunsonu >= 0);
  end if;
end $$;

comment on column public.cash_counts.pos_gunsonu is
  'POS cihazinin gunsonu (Z raporu) kart toplami — kapanista elle girilir, '
  'istege bagli. Devir sayiminda her zaman null.';
comment on column public.cash_counts.kart_satis is
  'Sayim anindaki sistem kart toplami (kasa_gun_ozeti.kart). Tetikleyici '
  'muhurler; pos_gunsonu ile fark kartin bagimsiz dogrulamasidir.';

-- View kolon listesini donduruyor (ayni tuzak ucuncu kez): yeniden yarat.
create or replace view public.cash_counts_gecerli
with (security_invoker = on) as
  select cc.* from public.cash_counts cc
   where not exists (select 1 from public.cash_counts d where d.supersedes = cc.id);

-- ----------------------------------------------------------------------------
-- 4) fn_kasa_sayimi_doldur — iki ekleme: kart_satis muhru, devirde pos null.
--    Kalan govde bir onceki migration ile birebir.
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
  v_bugun := public.nip_kasa_gunu(new.store_id);

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
      if exists (select 1 from public.cash_counts c where c.supersedes = new.supersedes) then
        raise exception 'kasa sayimi: bu kayit zaten duzeltilmis';
      end if;
      select c.business_day, c.tur into new.business_day, new.tur
        from public.cash_counts c where c.id = new.supersedes;
    elsif new.tur = 'kapanis' then
      select cc.id into v_onceki from public.cash_counts_gecerli cc
       where cc.store_id = new.store_id and cc.business_day = new.business_day
         and cc.tur = 'kapanis'
       limit 1;
      if v_onceki is not null then
        raise exception 'kasa sayimi: bu gun zaten sayilmis — duzeltmek icin mevcut kaydin ustune gir';
      end if;
    end if;
  else
    new.business_day := coalesce(new.business_day, v_bugun);
  end if;

  select string_agg(s.name, ', ' order by (sh.status = 'active') desc,
                                          sh.checked_in_at desc nulls last)
    into new.vardiya_kisileri
    from public.shifts sh join public.staff s on s.id = sh.staff_id
   where sh.date = new.business_day
     and (sh.store_id = new.store_id or sh.store_id is null);

  select * into o from public.kasa_gun_ozeti(new.store_id, new.business_day);

  if new.tur = 'kapanis' and new.business_day = v_bugun and o.acik_bugun_adet > 0
     and (new.note is null or length(btrim(new.note)) < 3) then
    raise exception 'kasa sayimi: % acik hesap varken sayim icin aciklama zorunlu — once hesaplari kapat', o.acik_bugun_adet;
  end if;

  -- YENI: sistem kart toplami sayima muhurlenir; POS gunsonu ile fark kartin
  -- bagimsiz dogrulamasi. Devirde POS gunsonu anlamsiz (Z raporu gun sonu isi).
  new.kart_satis := o.kart;
  if new.tur = 'devir' then
    new.pos_gunsonu := null;
  end if;

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

revoke all on function public.fn_kasa_sayimi_doldur() from anon, authenticated, public;
