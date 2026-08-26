-- ============================================================================
-- HAFTALIK DENETIM · EKSIK MALIYETLER · KATEGORI SURESI
--                                             20260826_denetim_maliyet_ve_sure
-- ============================================================================
-- Uc kucuk is, hepsi ayni olcumden cikti:
--   1) prep_time_minutes 152 urunun 152'sinde bostu -> kategoriye varsayilan
--   2) maliyeti eksik olani bulmak iki ekran arasinda gezmek demekti -> tek liste
--   3) bu bulgular elle ayda bir cikiyordu -> haftada bir kendisi ciksin
--
-- Geri alma:
--   alter table public.categories drop column if exists prep_time_minutes;
--   drop function if exists public.eksik_maliyetler(uuid);
--   drop function if exists public.nip_haftalik_denetim_gonder();
--   drop function if exists public.nip_haftalik_denetim();
--   select cron.unschedule('nip-weekly-audit');
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) KATEGORI BAZLI HAZIRLANMA SURESI
-- Musteri menusunde "~8 dk" rozeti var ve urun basina sure bekliyordu; 152
-- urunun tamami bos oldugu icin rozet hic gorunmedi. Urun basina 152 kayit
-- yerine kategori basina bir varsayilan: urun kendi suresini girdiyse o kazanir.
-- ----------------------------------------------------------------------------
alter table public.categories add column if not exists prep_time_minutes integer;

comment on column public.categories.prep_time_minutes is
  'Bu kategorideki urunler icin varsayilan hazirlanma suresi (dk). Urunun kendi '
  'prep_time_minutes''i doluysa o kazanir.';

-- ----------------------------------------------------------------------------
-- 2) EKSIK MALIYETLER — toplu giris ekraninin veri kaynagi
-- Malzeme ve urunu TEK listede, dokundugu ciroya gore siralar.
-- ----------------------------------------------------------------------------
create or replace function public.eksik_maliyetler(p_store_id uuid)
returns table (
  tip      text,      -- malzeme | urun
  kayit_id uuid,
  ad       text,
  alt      text,      -- birim ya da kategori
  nerede   text,      -- hangi urunlerde gectigi / satis fiyati
  ciro     numeric,   -- dokundugu ciro
  adet     numeric
)
language plpgsql
stable
set search_path to 'public'
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if not public.is_staff() then
      raise exception 'eksik maliyetler: yetkisiz';
    end if;
    if not exists (select 1 from public.staff s
                    where s.auth_id = (select auth.uid()) and s.is_active
                      and p_store_id = any(s.store_ids)) then
      raise exception 'eksik maliyetler: bu magaza icin yetkin yok';
    end if;
  end if;

  return query
  with satis as (
    select oi.product_id,
           sum(coalesce(oi.final_price,0) * coalesce(oi.quantity,1)) as ciro,
           sum(coalesce(oi.quantity,1))                              as adet
      from public.order_items oi
      join public.orders o on o.id = oi.order_id
     where o.status = 'paid' and o.origin_store_id = p_store_id
     group by oi.product_id
  ),
  -- Maliyeti girilmemis malzemeler: recetede geciyor ama cost_per_unit bos.
  malzeme as (
    select 'malzeme'::text tip, i.id, i.name::text ad, i.unit::text alt,
           string_agg(distinct p.name, ' · ' order by p.name)::text nerede,
           coalesce(sum(s.ciro), 0)::numeric ciro,
           coalesce(sum(s.adet), 0)::numeric adet
      from public.ingredients i
      join public.recipes r on r.ingredient_id = i.id
      join public.products p on p.id = r.product_id
      left join satis s on s.product_id = r.product_id
     where coalesce(i.cost_per_unit, 0) = 0
       and i.store_id = p_store_id
     group by i.id, i.name, i.unit
  ),
  -- Alis fiyati girilmemis urunler: recetesi de yok, konsinye de degil.
  urun as (
    select 'urun'::text tip, p.id, p.name::text ad, coalesce(c.name, '—')::text alt,
           ('Satış ₺' || trim(to_char(p.price, 'FM999999990.00')))::text nerede,
           coalesce(s.ciro, 0)::numeric ciro,
           coalesce(s.adet, 0)::numeric adet
      from public.products p
      left join public.categories c on c.id = p.category_id
      left join satis s on s.product_id = p.id
     where p.store_id = p_store_id
       and p.cost_price is null
       and not p.kitchen_consignment
       and not exists (select 1 from public.recipes r where r.product_id = p.id)
  )
  select * from malzeme
  union all
  select * from urun
  order by ciro desc, adet desc, ad;
end $$;

comment on function public.eksik_maliyetler(uuid) is
  'Maliyeti girilmemis malzeme ve urunleri tek listede, dokundugu ciroya gore siralar.';

revoke all on function public.eksik_maliyetler(uuid) from anon, public;
grant execute on function public.eksik_maliyetler(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 3) HAFTALIK DENETIM
-- SECURITY DEFINER: cron oturumsuz calisir, is_staff() yanlis doner.
-- Yetki authenticated'dan da alinir — bu fonksiyon istemciden cagrilmaz.
-- ----------------------------------------------------------------------------
create or replace function public.nip_haftalik_denetim()
returns table (
  onem    text,      -- yuksek | orta | bilgi
  baslik  text,
  detay   text,
  sayi    numeric
)
language sql
stable
security definer
set search_path to 'public'
as $$
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
  -- Ciro olan ama sayimi olmayan geceler
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
  select 'yuksek', 'Büyük kasa farkı',
         count(*)::text || ' gecede ₺100 üstü fark', count(*)::numeric
    from cash_counts_gecerli cc
   where cc.business_day >= nip_business_day(now()) - 7 and abs(cc.difference) > 100
  having count(*) > 0

  union all
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
  select 'orta', 'Kritik stok',
         string_agg(i.name, ' · ' order by i.name), count(*)::numeric
    from ingredients i
   where coalesce(i.min_stock,0) > 0 and coalesce(i.stock_qty,0) < i.min_stock
  having count(*) > 0

  union all
  -- Eksi stok: ya recete yanlis ya sayim; ikisi de bakilmali.
  select 'orta', 'Eksiye düşen stok',
         string_agg(i.name, ' · ' order by i.name), count(*)::numeric
    from ingredients i where coalesce(i.stock_qty,0) < 0
  having count(*) > 0

  union all
  select 'bilgi', 'Reçetesi olmayan ürün',
         count(*)::text || ' aktif ürün — stoktan düşmüyor', count(*)::numeric
    from products p
   where p.is_available and not p.kitchen_consignment and not p.track_stock
     and not exists (select 1 from recipes r where r.product_id = p.id)
  having count(*) > 0

  union all
  select 'bilgi', 'Unutulmuş açık hesap',
         count(*)::text || ' hesap ₺' || round(sum(coalesce(o.total,0)))::text,
         count(*)::numeric
    from orders o
   where o.status in ('open','sent','preparing','ready')
     and coalesce(o.total,0) > 0
     and o.created_at < now() - interval '2 days'
  having count(*) > 0
$$;

comment on function public.nip_haftalik_denetim() is
  'Haftalik otomatik denetim bulgulari. SECURITY DEFINER: cron oturumsuz calisir.';

revoke all on function public.nip_haftalik_denetim() from anon, public, authenticated;
grant execute on function public.nip_haftalik_denetim() to service_role;

-- ----------------------------------------------------------------------------
-- 4) BULGULARI TELEGRAM'DAN YOLLA
-- Tamamen SQL: calisan telegram edge function'ina dokunmuyor. O fonksiyon
-- siparis bildirimleri, vardiya ozeti ve gunluk ozetin de tek yolu; haftalik
-- rapor icin onu yeniden dagitmak orantisiz risk olurdu. Mesaj bicimi ile
-- sorgu yan yana duruyor, ikisi birlikte degisir.
-- ----------------------------------------------------------------------------
create or replace function public.nip_haftalik_denetim_gonder()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  b        record;
  v_metin  text;
  v_onem   text := '';
  v_sayi   int := 0;
  v_token  text;
  v_gonderilen int := 0;
  v_chat   record;
  v_baslik text;
begin
  select value into v_token from bot_config where key = 'telegram_bot_token';
  if v_token is null then
    return jsonb_build_object('ok', false, 'hata', 'telegram_bot_token yok');
  end if;

  v_metin := 'Not In Paris — haftalık kontrol · ' ||
             to_char((now() at time zone 'Europe/Istanbul')::date, 'DD.MM.YYYY') || E'\n';

  for b in
    select * from public.nip_haftalik_denetim()
     order by case onem when 'yuksek' then 1 when 'orta' then 2 else 3 end, sayi desc
  loop
    v_sayi := v_sayi + 1;
    if b.onem is distinct from v_onem then
      v_baslik := case b.onem when 'yuksek' then 'ACİL'
                              when 'orta'   then 'BEKLEYEN'
                              else 'BİLGİ' end;
      v_metin := v_metin || E'\n' || v_baslik || E'\n';
      v_onem := b.onem;
    end if;
    v_metin := v_metin || '• ' || b.baslik || ': ' || b.detay || E'\n';
  end loop;

  -- Temiz hafta sessiz gecilir. Her hafta ayni "sorun yok" mesaji bildirim
  -- korlugu yaratir, sonra gercek uyari da okunmaz.
  if v_sayi = 0 then
    return jsonb_build_object('ok', true, 'bulgu', 0, 'gonderilen', 0,
                              'not', 'temiz hafta, bildirim gonderilmedi');
  end if;

  v_metin := v_metin || E'\nEksik maliyetleri buradan girebilirsin:\nhttps://order.notinparis.me/costs';

  for v_chat in
    select distinct telegram_chat_id from staff
     where role::text = 'admin' and is_active and telegram_chat_id is not null
  loop
    perform net.http_post(
      url     := 'https://api.telegram.org/bot' || v_token || '/sendMessage',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body    := jsonb_build_object('chat_id', v_chat.telegram_chat_id, 'text', v_metin)
    );
    v_gonderilen := v_gonderilen + 1;
  end loop;

  return jsonb_build_object('ok', true, 'bulgu', v_sayi, 'gonderilen', v_gonderilen);
end $$;

comment on function public.nip_haftalik_denetim_gonder() is
  'Haftalik denetim bulgularini Telegram''dan aktif admin''lere yollar. pg_cron '
  'cagirir. Bulgu yoksa sessiz gecer.';

revoke all on function public.nip_haftalik_denetim_gonder() from anon, public, authenticated;

-- Pazartesi 10:00 TR = 07:00 UTC. Hafta basi: bulgular haftaya girerken gorulsun.
select cron.unschedule('nip-weekly-audit') where exists (select 1 from cron.job where jobname='nip-weekly-audit');
select cron.schedule('nip-weekly-audit', '0 7 * * 1', $$select public.nip_haftalik_denetim_gonder()$$);
