-- Gun sonu kasa sayimi: yeniden baslangic, "Toplami yaz", hedefli 23:30
-- hatirlatmasi, 03:00 otomatik vardiya kapanisi.
--
-- Neden: Paris kasasinda 14.09'dan beri kapanis sayimi yok (28 gece, yaklasik
-- 180 bin TL nakit tahsilat). Acilis zinciri koptu: kasa_gun_ozeti "dunden
-- devreden"i son gecerli kapanistan, yani 14.09'dan alir. Ilk yeni sayimda
-- fark anlamsiz cikar ve personelden bu farkin aciklamasi istenir; sayim yine
-- yapilmaz. Sahibin karari (13.10, personel onerisi 5): ilk sayim "yeniden
-- baslangic" sayilsin, fark aciklamasi istenmesin. Bosluk yalniz sahibe gorunur.
--
-- 1. cash_counts.yeniden_baslangic: onceki kapanis ile bu gun arasinda
--    sayilmamis nakit hareketi varsa (ya da hic kapanis yoksa) TRUE. Sunucu
--    hesaplar; istemcinin gonderdigi deger ezilir.
-- 2. nip_kasa_yeniden_mi(magaza, gun): kural tek yerde.
-- 3. fn_kasa_sayimi_doldur: yeniden baslangicta fark aciklamasi istenmez.
--    Beklenen ve fark yine yazilir (bilgi icin), raporlar bu satiri farka katmaz.
-- 4. nip_denom_total / nip_denoms_gecerli: {"toplam": 12345.5} gecerli olur.
--    Personel kupur saymadan cekmecedeki toplami yazabilir. Kupurle karisik
--    da olur; ikisi toplanir. counted_total bu fonksiyondan uretilen sutun:
--    eski satirlarda "toplam" anahtari olmadigi icin degerleri degismez.
-- 5. nip_kasa_durumu(magaza): Masalar, Siparis ve Kasa ekranlarindaki gece
--    "Kasayi say" karti ve sayim ekrani icin tek cagri. Bosluk tutarlari
--    yalniz sahibe doner.
-- 6. nip_haftalik_denetim: yeniden baslangic satiri "Buyuk kasa farki"na
--    girmez; ayri bir bilgi satiri olur.
-- 7. nip_gunluk_hatirlatma('kapanis'): 23:30'da herkese degil, son 2 saatte
--    tahsilat alan kisiye ADIYLA gider. Magaza magaza. Bagli kimse yoksa sahibe.
-- 8. nip_vardiya_otomatik_kapat(): 03:00'te acik vardiyayi "simdi" ile degil
--    son islem + 15 dk ile kapatir ve notuna "otomatik kapandi" yazar.
--
-- Hicbir nesne silinmez: tum fonksiyonlar ayni imzayla create or replace.

-- 1 ---------------------------------------------------------------------------
alter table public.cash_counts
  add column if not exists yeniden_baslangic boolean not null default false;

comment on column public.cash_counts.yeniden_baslangic is
  'TRUE: onceki gece(ler) sayilmadigi icin acilis bilinmiyordu; bu sayim yeni '
  'baslangictir. Fark bilgi icindir, aciklama istenmez, raporlarda farka katilmaz. '
  'fn_kasa_sayimi_doldur hesaplar.';

-- Gorunum acik sutun listesiyle tanimli: yeni sutun sona eklenir.
-- security_invoker korunur (create or replace view secenekleri sifirlar).
create or replace view public.cash_counts_gecerli with (security_invoker = on) as
 select cc.id,
    cc.store_id,
    cc.business_day,
    cc.denoms,
    cc.counted_total,
    cc.withdrawn,
    cc.opening_float,
    cc.cash_sales,
    cc.cash_expenses,
    cc.expected_cash,
    cc.difference,
    cc.counted_by,
    cc.counted_by_name,
    cc.counted_by_person,
    cc.note,
    cc.supersedes,
    cc.reason,
    cc.created_at,
    cc.vardiya_kisileri,
    cc.tur,
    cc.pos_gunsonu,
    cc.kart_satis,
    cc.yeniden_baslangic
   from public.cash_counts cc
  where not exists (select 1 from public.cash_counts d where d.supersedes = cc.id);

-- 2 ---------------------------------------------------------------------------
create or replace function public.nip_kasa_yeniden_mi(p_store_id uuid, p_gun date)
returns boolean
language plpgsql
stable
set search_path to 'public'
as $function$
declare
  v_son date;
  v_bas timestamptz;
  v_bit timestamptz;
begin
  select max(cc.business_day) into v_son
    from public.cash_counts_gecerli cc
   where cc.store_id = p_store_id and cc.tur = 'kapanis'
     and cc.business_day < p_gun;

  -- Hic kapanis yok: ilk sayim zaten baslangictir.
  if v_son is null then
    return true;
  end if;
  -- Dun sayildi: zincir saglam.
  if v_son >= p_gun - 1 then
    return false;
  end if;

  -- Arada sayilmamis gece(ler) var. Cekmeceye dokunan hareket yoksa (dukkan
  -- kapaliydi) acilis hala gecerli; varsa acilis bilinmiyor.
  v_bas := ((v_son + 1) + time '03:00') at time zone 'Europe/Istanbul';
  v_bit := (p_gun + time '03:00') at time zone 'Europe/Istanbul';
  return exists (select 1 from public.payments p
                  where p.store_id = p_store_id and p.method::text = 'cash'
                    and p.created_at >= v_bas and p.created_at < v_bit)
      or exists (select 1 from public.expenses e
                  where e.store_id = p_store_id
                    and lower(coalesce(e.payment_method, '')) = 'kasa'
                    and e.created_at >= v_bas and e.created_at < v_bit);
end $function$;

comment on function public.nip_kasa_yeniden_mi(uuid, date) is
  'Kasa zinciri kopuk mu: onceki gecerli kapanis ile p_gun arasinda sayilmamis '
  'nakit hareketi varsa ya da hic kapanis yoksa TRUE (20261013_kasa_yeniden_baslangic).';

revoke execute on function public.nip_kasa_yeniden_mi(uuid, date) from public, anon;
grant execute on function public.nip_kasa_yeniden_mi(uuid, date) to authenticated;

-- 3 ---------------------------------------------------------------------------
-- Degisen yerler: yeniden_baslangic hesabi ve fark aciklamasi kurali. Gerisi
-- canlidaki tanimla birebir ayni.
create or replace function public.fn_kasa_sayimi_doldur()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
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

  new.kart_satis := o.kart;
  if new.tur = 'devir' then
    new.pos_gunsonu := null;
  end if;

  new.opening_float := o.acilis;
  new.cash_sales    := o.nakit;
  new.cash_expenses := o.nakit_gider;
  new.expected_cash := o.beklenen;
  new.difference    := public.nip_denom_total(new.denoms) - o.beklenen;

  -- Yeniden baslangic: onceki gece(ler) sayilmadi, acilis bilinmiyor. Fark
  -- anlamsiz oldugu icin aciklama istenmez. Istemci bu alani belirleyemez.
  new.yeniden_baslangic := public.nip_kasa_yeniden_mi(new.store_id, new.business_day);

  if abs(new.difference) > 100 and not new.yeniden_baslangic
     and (new.note is null or length(btrim(new.note)) < 3) then
    raise exception 'kasa sayimi: TL % fark icin aciklama zorunlu', round(abs(new.difference));
  end if;

  return new;
end $function$;

-- 4 ---------------------------------------------------------------------------
create or replace function public.nip_denom_total(d jsonb)
returns numeric
language sql
immutable
set search_path to 'public'
as $function$
  select coalesce((
    select sum(case
                 when e.k ~ '^[0-9]{1,4}(\.[0-9]{1,2})?$' and e.v ~ '^[0-9]{1,6}$'
                   then (e.k)::numeric * (e.v)::numeric
                 -- "Toplami yaz": kupur saymadan cekmecedeki toplam.
                 when e.k = 'toplam' and e.v ~ '^[0-9]{1,7}(\.[0-9]{1,2})?$'
                   then (e.v)::numeric
                 else 0 end)
    from jsonb_each_text(coalesce(d, '{}'::jsonb)) as e(k, v)
  ), 0)::numeric
$function$;

create or replace function public.nip_denoms_gecerli(d jsonb)
returns boolean
language sql
immutable
set search_path to 'public'
as $function$
  select d is not null and jsonb_typeof(d) = 'object'
     and not exists (
       select 1 from jsonb_each_text(d) as e(k, v)
       where case
               when e.k = 'toplam'
                 then e.v !~ '^[0-9]{1,7}(\.[0-9]{1,2})?$'
               when e.k ~ '^[0-9]{1,4}(\.[0-9]{1,2})?$'
                 then (e.k)::numeric <= 0 or e.v !~ '^[0-9]{1,6}$'
               else true
             end
     )
$function$;

-- 5 ---------------------------------------------------------------------------
create or replace function public.nip_kasa_durumu(p_store_id uuid)
returns table(isletme_gunu date, sayildi boolean, hareket boolean, acik_adet integer,
              yeniden boolean, son_kapanis date, bosluk_gece integer, bosluk_nakit numeric)
language plpgsql
stable
set search_path to 'public'
as $function$
declare
  o       record;
  v_son   date;
  v_admin boolean := public.is_admin();
  v_nakit numeric;
begin
  -- Yetki kasa_gun_ozeti'nde: personel degilse ya da magaza yetkisi yoksa hata.
  select * into o from public.kasa_gun_ozeti(p_store_id, null);

  select max(cc.business_day) into v_son
    from public.cash_counts_gecerli cc
   where cc.store_id = p_store_id and cc.tur = 'kapanis'
     and cc.business_day < o.isletme_gunu;

  if v_admin and v_son is not null then
    select coalesce(sum(p.amount), 0) into v_nakit
      from public.payments p
     where p.store_id = p_store_id and p.method::text = 'cash'
       and p.created_at >= ((v_son + 1) + time '03:00') at time zone 'Europe/Istanbul'
       and p.created_at <  (o.isletme_gunu + time '03:00') at time zone 'Europe/Istanbul';
  end if;

  return query select
    o.isletme_gunu,
    exists (select 1 from public.cash_counts_gecerli cc
             where cc.store_id = p_store_id and cc.business_day = o.isletme_gunu
               and cc.tur = 'kapanis'),
    (o.nakit + o.kart + o.online + o.havale + o.borc + o.puan + o.nakit_gider) > 0
      or o.acik_bugun_adet > 0,
    o.acik_bugun_adet,
    public.nip_kasa_yeniden_mi(p_store_id, o.isletme_gunu),
    -- Bosluk yalniz sahibe: personel yalniz "yeniden baslangic" bilgisini gorur.
    case when v_admin then v_son end,
    case when v_admin and v_son is not null then (o.isletme_gunu - v_son - 1) end,
    case when v_admin then v_nakit end;
end $function$;

comment on function public.nip_kasa_durumu(uuid) is
  'Gece "Kasayi say" karti ve sayim ekrani: kasa gunu, sayildi mi, hareket var mi, '
  'acik hesap, yeniden baslangic. son_kapanis/bosluk_* yalniz sahibe dolu doner.';

revoke execute on function public.nip_kasa_durumu(uuid) from public, anon;
grant execute on function public.nip_kasa_durumu(uuid) to authenticated;

-- 6 ---------------------------------------------------------------------------
-- Degisen yerler: "Buyuk kasa farki" yeniden baslangici saymaz; yeni bilgi
-- satiri "Kasa yeniden basladi". Gerisi canlidaki tanimla birebir ayni.
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

-- 7 ---------------------------------------------------------------------------
-- 23:30 kapanis hatirlatmasi. Eskiden butun bagli personele (izinliler ve
-- sahip dahil) tek metin gidiyordu ve herhangi bir magazada sayim varsa hic
-- gitmiyordu. Simdi magaza magaza: bugun tahsilat olan ve kapanisi sayilmamis
-- magazada son 2 saatte tahsilat alan kisiye adiyla. O kisi(ler) Telegram'a
-- bagli degilse vardiyadakilere; kimse yoksa sahibe "kime soyleyelim" notu.
create or replace function public.nip_kapanis_hatirlat()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_token  text;
  v_gun    date := public.nip_business_day(now());
  st       record;
  k        record;
  v_n      integer := 0;
  v_hedef  integer;
  v_adlar  text;
  v_diger  text;
  v_metin  text;
  v_link   text := 'https://order.notinparis.me/cash-count';
begin
  select value into v_token from bot_config where key = 'telegram_bot_token';
  if v_token is null then
    return 0;
  end if;

  for st in
    select s.id, s.name
      from public.stores s
     where exists (select 1 from public.payments p
                    where p.store_id = s.id
                      and p.created_at >= (v_gun + time '03:00') at time zone 'Europe/Istanbul')
       and not exists (select 1 from public.cash_counts_gecerli cc
                        where cc.store_id = s.id and cc.business_day = v_gun
                          and cc.tur = 'kapanis')
  loop
    v_hedef := 0;

    -- Son 2 saatte tahsilat alanlar: kapanisi buyuk olasilikla onlar yapar.
    select string_agg(x.name, ', ' order by x.son desc) into v_adlar
      from (select sf.name, max(p.created_at) son
              from public.payments p join public.staff sf on sf.id = p.staff_id
             where p.store_id = st.id and p.created_at >= now() - interval '2 hours'
               and sf.is_active
             group by sf.id, sf.name) x;

    for k in
      select sf.id, sf.name, sf.telegram_chat_id
        from public.staff sf
       where sf.is_active and sf.telegram_chat_id is not null
         and sf.id in (select p.staff_id from public.payments p
                        where p.store_id = st.id
                          and p.created_at >= now() - interval '2 hours')
    loop
      -- Birden cok kisi tahsilat aldiysa her biri otekileri de gorur: biri sayar.
      select string_agg(x.name, ', ' order by x.son desc) into v_diger
        from (select sf2.name, max(p.created_at) son
                from public.payments p join public.staff sf2 on sf2.id = p.staff_id
               where p.store_id = st.id and p.created_at >= now() - interval '2 hours'
                 and sf2.is_active and sf2.id <> k.id
               group by sf2.id, sf2.name) x;
      v_metin := split_part(k.name, ' ', 1)
              || case when v_diger is null then ', bu gece kasayı sen sayıyorsun.'
                      else ', bu gece kasayı sen ya da ' || v_diger
                           || ' sayacak. Birinizin sayması yeter.' end || E'\n\n'
              || 'Son hesap kapanınca Masalar ekranındaki "Kasayı say" kartına dokun. '
              || 'Kupür saymak zorunlu değil: çekmecedeki toplamı yazman yeterli. '
              || 'Kasadan bir şey aldıysan önce sayım ekranında "Gider ekle"ye bas.' || E'\n'
              || v_link;
      perform net.http_post(
        url     := 'https://api.telegram.org/bot' || v_token || '/sendMessage',
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body    := jsonb_build_object('chat_id', k.telegram_chat_id, 'text', v_metin)
      );
      v_hedef := v_hedef + 1;
    end loop;

    -- Tahsilat alan bagli degilse: vardiyasi acik ve bagli olanlara.
    if v_hedef = 0 then
      for k in
        select distinct sf.name, sf.telegram_chat_id
          from public.shifts sh join public.staff sf on sf.id = sh.staff_id
         where sh.date = v_gun and sh.status = 'active'
           and (sh.store_id = st.id or sh.store_id is null)
           and sf.is_active and sf.telegram_chat_id is not null
      loop
        v_metin := split_part(k.name, ' ', 1) || ', kapanış yaklaşıyor.' || E'\n\n'
                || 'Dükkanı kapatan kasayı sayar. Son hesap kapanınca Masalar ekranındaki '
                || '"Kasayı say" kartına dokun. Toplamı yazman yeterli.'
                || case when v_adlar is not null
                        then E'\n' || 'Son 2 saatte tahsilat alan: ' || v_adlar || '.'
                        else '' end || E'\n'
                || v_link;
        perform net.http_post(
          url     := 'https://api.telegram.org/bot' || v_token || '/sendMessage',
          headers := jsonb_build_object('Content-Type', 'application/json'),
          body    := jsonb_build_object('chat_id', k.telegram_chat_id, 'text', v_metin)
        );
        v_hedef := v_hedef + 1;
      end loop;
    end if;

    -- Kimseye ulasilamadiysa sahibe: kime soylemesi gerektigini yaz.
    if v_hedef = 0 then
      v_metin := 'Kapanış hatırlatması kimseye ulaşmadı — ' || st.name || E'\n\n'
              || case when v_adlar is not null
                      then 'Son 2 saatte tahsilat alan: ' || v_adlar
                           || '. Telegram''a bağlı değil.'
                      else 'Son 2 saatte tahsilat yok ve vardiyada bağlı kimse yok.' end
              || E'\n' || 'Bu gece kasayı kimin sayacağını ona sen söyle.';
      for k in
        select distinct telegram_chat_id from public.staff
         where role::text = 'admin' and is_active and telegram_chat_id is not null
      loop
        perform net.http_post(
          url     := 'https://api.telegram.org/bot' || v_token || '/sendMessage',
          headers := jsonb_build_object('Content-Type', 'application/json'),
          body    := jsonb_build_object('chat_id', k.telegram_chat_id, 'text', v_metin)
        );
        v_hedef := v_hedef + 1;
      end loop;
    end if;

    v_n := v_n + v_hedef;
  end loop;

  return v_n;
end $function$;

comment on function public.nip_kapanis_hatirlat() is
  '23:30 kapanis hatirlatmasi: sayilmamis magazada son 2 saatte tahsilat alan '
  'kisiye adiyla; yoksa vardiyadakilere; yoksa sahibe (20261013_kasa_yeniden_baslangic).';

revoke execute on function public.nip_kapanis_hatirlat() from public, anon, authenticated;

-- Degisen yer: yalniz 'kapanis' dali. 'acilis' ve 'devir' canlidakiyle ayni.
create or replace function public.nip_gunluk_hatirlatma(p_tur text)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_metin text;
begin
  if p_tur = 'acilis' then
    v_metin := 'Günaydın! Dükkan açılırken:' || E'\n'
            || 'Bugün HER sipariş sisteme girilecek — nakit de kart da. '
            || 'Girilmeyen satış gün sonunda kasa farkı olarak dönüyor.' || E'\n'
            || 'https://order.notinparis.me/tables';
  elsif p_tur = 'devir' then
    v_metin := 'Vardiya değişimi 17:00''de.' || E'\n'
            || 'Çıkan kişi kasayı SAYIP devretsin: Kasa Sayımı ekranında '
            || '"Vardiya devri"ni seç. Sayılmadan teslim yok.' || E'\n'
            || 'https://order.notinparis.me/cash-count';
  elsif p_tur = 'kapanis' then
    return public.nip_kapanis_hatirlat();
  else
    return 0;
  end if;
  return public.nip_toplu_telegram(v_metin);
end $function$;

-- 8 ---------------------------------------------------------------------------
-- 03:00 cron'u acik vardiyalari "simdi" ile kapatiyordu: unutulan her vardiya
-- 03:00'e kadar sayiliyordu (15:00 → 03:00 = 12 saat). Simdi son islem
-- (tahsilat, acilan hesap, eklenen kalem) + 15 dk. Hic islem yoksa (mutfak gibi)
-- eskisi gibi simdi. Notuna "otomatik kapandi" yazilir.
create or replace function public.nip_vardiya_otomatik_kapat()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_n integer;
begin
  with son as (
    select sh.id,
           greatest(
             (select max(p.created_at) from public.payments p
               where p.staff_id = sh.staff_id and p.created_at >= sh.checked_in_at),
             (select max(o.created_at) from public.orders o
               where o.staff_id = sh.staff_id and o.created_at >= sh.checked_in_at),
             (select max(oi.created_at) from public.order_items oi
               where oi.added_by = sh.staff_id and oi.created_at >= sh.checked_in_at)
           ) as son_islem
      from public.shifts sh
     where sh.status = 'active'
  )
  update public.shifts sh
     set status = 'done',
         checked_out_at = case
           when son.son_islem is null then now()
           else least(now(), greatest(coalesce(sh.checked_in_at, son.son_islem),
                                      son.son_islem + interval '15 minutes'))
         end,
         note = case when coalesce(btrim(sh.note), '') = '' then 'otomatik kapandı'
                     else sh.note || ' · otomatik kapandı' end
    from son
   where son.id = sh.id;
  get diagnostics v_n = row_count;
  return v_n;
end $function$;

comment on function public.nip_vardiya_otomatik_kapat() is
  '03:00 cron: acik vardiyayi son islem + 15 dk ile kapatir, notuna "otomatik kapandi" yazar.';

revoke execute on function public.nip_vardiya_otomatik_kapat() from public, anon, authenticated;

do $$
declare v_job bigint;
begin
  select jobid into v_job from cron.job where jobname = 'nip-close-shifts';
  if v_job is not null then
    perform cron.alter_job(v_job, command := 'select public.nip_vardiya_otomatik_kapat()');
  end if;
end $$;
