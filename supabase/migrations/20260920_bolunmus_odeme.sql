-- ============================================================================
-- BOLUNMUS ODEME — bir hesaba birden cok tahsilat    20260920_bolunmus_odeme
-- ============================================================================
-- KASADAN GELEN IHTIYAC (20.09.2026):
--   "Musteriler bir masaya kalabalik oturup siparis veriyor, sonra ayri ayri
--    odemek istiyor. Kimisi oturmaya devam ediyor, kimisi gidiyor."
--
-- BUGUN BU IMKANSIZ VE TAKLIDI TEHLIKELI. nip_odeme_al hesabi HER ZAMAN
-- kapatiyor (status='paid'). Hesabin bir kismini tahsil etmenin tek yolu
-- farki 'indirim' diye beyan etmek — o da kalan tutari GERCEK INDIRIM sayip
-- her order_items satirinin final_price'ini dusuruyor. Yani 1.200 TL'lik
-- masadan 340 TL alan kasiyer, 860 TL'lik sahte indirim yaziyor: ciro,
-- urun karliligi, hakedis ve lig hepsi bozuluyor.
-- (Canli veride 26 supheli "Indirim/Happy hour" odemesi var — muhtemelen
--  tam olarak bu.)
--
-- COZUM: payments zaten bir siparise birden cok satir kabul ediyor. Eksik
-- olan, ODENEN TOPLAM hesaba ulasana kadar siparisin ACIK kalmasi.
--
-- SAHIP KARARI: bolme KALEM SECEREK yapilacak ("kim ne yedi"), tutari
-- kasiyer kafadan bolmeyecek. O yuzden hangi kalemin kac adedinin odendigi
-- takip ediliyor.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1) KALEM BASINA ODENEN ADET
-- ----------------------------------------------------------------------------
-- Bir satir 3 adet olabilir (kasada +/- ile artirilir). Giden kisi o 3
-- biradan yalniz 1'ini oduyor olabilir, o yuzden bayrak degil SAYAC.
alter table public.order_items
  add column if not exists odenen_adet integer not null default 0;

comment on column public.order_items.odenen_adet is
  'Bu satirin kac adedi tahsil edildi. Kalan = quantity - odenen_adet. '
  'Bolunmus odemede kasiyer kalem secer; tam odemede sunucu hepsini isaretler.';

-- Odenen adet hicbir zaman siparis adedini asamaz, negatif olamaz.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'order_items_odenen_adet_sinir') then
    alter table public.order_items
      add constraint order_items_odenen_adet_sinir
      check (odenen_adet >= 0 and odenen_adet <= quantity);
  end if;
end $$;

-- Kapanmis hesaplarin kalemleri tam odenmis sayilir: yoksa gecmis siparisler
-- "yarim odenmis" gorunur ve kalan hesaplari bozardi.
update public.order_items oi
   set odenen_adet = oi.quantity
  from public.orders o
 where o.id = oi.order_id
   and o.status::text = 'paid'
   and oi.odenen_adet = 0
   and oi.quantity > 0;


-- ----------------------------------------------------------------------------
-- 2) HANGI ODEME NEYI KAPATTI
-- ----------------------------------------------------------------------------
-- "Bu kalemi kim, ne zaman, hangi odemeyle kapatti" sorusunun cevabi.
-- order_items.odenen_adet tek basina toplami verir ama izini vermez;
-- bolunmus hesapta "ben bunu odemistim" tartismasi cikarsa defter burasi.
create table if not exists public.payment_items (
  id            uuid primary key default gen_random_uuid(),
  payment_id    uuid not null references public.payments(id)    on delete cascade,
  order_item_id uuid not null references public.order_items(id) on delete cascade,
  adet          integer not null check (adet > 0),
  tutar         numeric not null check (tutar >= 0),
  created_at    timestamptz not null default now()
);

create index if not exists payment_items_payment_idx on public.payment_items(payment_id);
create index if not exists payment_items_item_idx    on public.payment_items(order_item_id);

comment on table public.payment_items is
  'Bolunmus odemede hangi tahsilatin hangi kalemin kac adedini kapattigi. '
  'order_items.odenen_adet toplami tutar; bu tablo izini tutar.';

alter table public.payment_items enable row level security;

-- nip_odeme_al SECURITY INVOKER'dir (payments tablosunda oldugu gibi): yazma
-- hakki cagirana bagli, RLS calismaya devam eder. Tabloyu definer bir
-- fonksiyona tasimak para yolunun guvenlik modelini sessizce degistirirdi,
-- o yuzden payments ile AYNI kalip: aktif personel okur ve yazar.
drop policy if exists payment_items_personel_okur on public.payment_items;
create policy payment_items_personel_okur on public.payment_items
  for select to authenticated
  using (exists (select 1 from public.staff s
                  where s.auth_id = (select auth.uid()) and s.is_active));

drop policy if exists payment_items_personel_yazar on public.payment_items;
create policy payment_items_personel_yazar on public.payment_items
  for insert to authenticated
  with check (exists (select 1 from public.staff s
                       where s.auth_id = (select auth.uid()) and s.is_active));

revoke all on table public.payment_items from anon, public;
grant select, insert on table public.payment_items to authenticated;


-- ----------------------------------------------------------------------------
-- 3) KALAN TUTAR — tek dogru kaynak
-- ----------------------------------------------------------------------------
-- Hem sunucu hem ekran ayni hesabi kullansin diye fonksiyon. Kalan, ODENMEMIS
-- kalemlerin toplamidir; orders.total'dan odenenleri cikarmak DEGIL — cunku
-- orders.total'i istemci yaziyor ve kalem toplamindan sapabiliyor (bu sapma
-- nip_odeme_al'in indirim dalinda zaten ayrica ele aliniyor).
create or replace function public.nip_kalan_tutar(p_order_id uuid)
returns numeric
language sql
stable
set search_path to 'public'
as $$
  select coalesce(sum(oi.final_price * (oi.quantity - oi.odenen_adet)), 0)
    from public.order_items oi
   where oi.order_id = p_order_id
     and oi.quantity > oi.odenen_adet;
$$;

comment on function public.nip_kalan_tutar(uuid) is
  'Bir hesabin odenmemis kalemlerinin toplami. Bolunmus odemede "kalan" budur.';

grant execute on function public.nip_kalan_tutar(uuid) to authenticated;



-- ----------------------------------------------------------------------------
-- 4) nip_odeme_al — KALEM SECIMI VE KISMI TAHSILAT
-- ----------------------------------------------------------------------------
-- Yeni parametre: p_kalemler jsonb = [{"id":"<order_item_id>","adet":2}, ...]
--   null  -> bugunku davranis: kalan ne ise hepsi tahsil edilir, hesap kapanir
--   dolu  -> yalniz o kalemler tahsil edilir; geriye kalem kalirsa hesap ACIK
--
-- BUGUNKU YOL BIT BIT KORUNUR. Hicbir odeme alinmamis VE kalem secilmemis
-- hesapta beklenen tutar yine orders.total'dir (istemcinin yazdigi sayi),
-- fark kilidi ve indirim dagitimi aynen calisir. Yeni davranis yalniz kalem
-- secildiginde ya da hesapta onceden odeme varsa devreye girer.
--
-- KISMI ODEMEDE INDIRIM YOK, PUAN YOK. Eksik tahsilat, kalanini baskasinin
-- odeyecegi bir hesapta "indirim" olamaz — baskasinin kalemini ucuzlatirdi.
-- Ayni sebeple BIR KEZ BOLUNMUS hesabin son odemesinde de indirim yasak:
-- dagitim tabani tum kalemler oldugu icin, once tam fiyattan odeyenin kalemi
-- de geriye donuk ucuzlardi ve ciro ile tahsilat ayrisirdi.
--
-- GUVENLIK: fonksiyon SECURITY INVOKER kalir (eskisi gibi). Definer yapmak
-- payments/orders/customers yazmalarini RLS disina cikarirdi.

drop function if exists public.nip_odeme_al(uuid, text, numeric, uuid, boolean, text, text);

create or replace function public.nip_odeme_al(
  p_order_id    uuid,
  p_method      text,
  p_amount      numeric,
  p_customer_id uuid    default null,
  p_use_points  boolean default false,
  p_fark_nedeni text    default null,
  p_fark_turu   text    default null,
  p_kalemler    jsonb   default null)
returns table (tahsil numeric, puan numeric, kalan_borc numeric, kalan numeric, kapandi boolean)
language plpgsql
set search_path to 'public'
as $fn$
declare
  o             record;
  v_staff       record;
  v_uye         uuid;
  v_borc        numeric := 0;
  v_fark_var    boolean := false;
  v_tur         text;
  v_neden       text;
  v_not         text;
  v_fark        numeric := 0;
  v_taban       numeric := 0;
  v_dagitilan   numeric := 0;
  v_son_id      uuid;
  v_pay         numeric;
  v_birim       numeric;
  k             record;
  v_subtotal    numeric;
  v_total       numeric;
  v_indirim     numeric;
  -- bolunmus odeme
  v_odenen_once numeric := 0;   -- bu hesapta daha once tahsil edilen
  v_kalan_once  numeric := 0;   -- bu odemeden ONCE odenmemis kalem toplami
  v_secilen     numeric := 0;   -- bu odemenin kapattigi kalemlerin toplami
  v_beklenen    numeric := 0;   -- fark kilidinin karsilastirdigi tutar
  v_kalan       numeric := 0;   -- bu odemeden SONRA kalan
  v_kapanir     boolean := false;
  v_kismi       boolean := false;
  v_payment_id  uuid;
  sec           record;
  v_it          record;
begin
  if p_method not in ('cash','card','transfer','debt','online') then
    raise exception 'odeme: gecersiz yontem %', p_method;
  end if;
  if coalesce(p_amount, 0) < 0 then
    raise exception 'odeme: tutar negatif olamaz';
  end if;
  if p_fark_turu is not null and p_fark_turu not in ('indirim','eksik','bahsis','diger') then
    raise exception 'odeme: gecersiz fark turu % (indirim | eksik | bahsis | diger)', p_fark_turu;
  end if;

  select st.id, st.store_ids into v_staff
    from public.staff st
   where st.auth_id = (select auth.uid()) and st.is_active;
  if current_user in ('authenticated', 'anon') and v_staff.id is null then
    raise exception 'odeme: yetkisiz';
  end if;

  -- Siparisi KILITLE: iki kasiyer ayni hesabi ayni anda kapatamaz. Bolunmus
  -- odemede daha da onemli — iki kasiyer ayni kalemi ayri ayri tahsil ederdi.
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

  v_subtotal := o.subtotal;
  v_total    := o.total;
  v_indirim  := o.discount_amount;
  v_neden    := nullif(btrim(coalesce(p_fark_nedeni, '')), '');

  select coalesce(sum(pm.amount), 0) into v_odenen_once
    from public.payments pm where pm.order_id = p_order_id;

  -- KALAN, kalemler ISARETLENMEDEN once olculur. (Ilk yazisimda once
  -- isaretleyip sonra olcuyordum; o halde her odeme "kalan sifir" goruyor,
  -- hesap daima kapaniyordu — yani ozellik hic calismiyordu.)
  v_kalan_once := public.nip_kalan_tutar(p_order_id);

  -- ---- SECILEN KALEMLERI ISARETLE -------------------------------------
  if p_kalemler is not null then
    for sec in
      select (e->>'id')::uuid as id, greatest(1, coalesce((e->>'adet')::int, 1)) as adet
        from jsonb_array_elements(p_kalemler) e
    loop
      -- Kalemi de KILITLE: siparis kilidi order_items'i kapsamaz.
      select oi.* into v_it from public.order_items oi
       where oi.id = sec.id and oi.order_id = p_order_id for update;
      if not found then
        raise exception 'odeme: kalem bu hesaba ait degil (%)', sec.id;
      end if;
      if sec.adet > (v_it.quantity - v_it.odenen_adet) then
        raise exception 'odeme: "%" icin % adet secildi ama % adet odenmemis kaldi',
          v_it.product_name, sec.adet, (v_it.quantity - v_it.odenen_adet);
      end if;
      v_secilen := v_secilen + v_it.final_price * sec.adet;
      update public.order_items
         set odenen_adet = odenen_adet + sec.adet
       where id = v_it.id;
    end loop;
  else
    -- Kalem secilmedi: kalan ne ise hepsi odeniyor.
    v_secilen := v_kalan_once;
    update public.order_items
       set odenen_adet = quantity
     where order_id = p_order_id and quantity > odenen_adet;
  end if;

  v_kalan   := public.nip_kalan_tutar(p_order_id);
  v_kapanir := v_kalan <= 0.005;
  v_kismi   := not v_kapanir;

  -- ---- BEKLENEN TUTAR --------------------------------------------------
  -- Temiz hesapta kalem secilmediyse beklenen yine orders.total (bugunku yol).
  -- Kalem secildiyse secilenlerin toplami; hesap zaten bolunmusse kalan.
  v_beklenen := case
                  when p_kalemler is not null then v_secilen
                  when v_odenen_once > 0      then v_kalan_once
                  else coalesce(o.total, 0)
                end;

  if v_kismi then
    -- Kismi tahsilatta eksik odeme yasak: kalani baskasi odeyecek.
    if coalesce(p_amount,0) < v_beklenen - 0.005 then
      raise exception 'odeme: kismi tahsilatta girilen tutar secilen kalemlerin altinda olamaz (secilen TL %, girilen TL %)',
        round(v_beklenen), round(coalesce(p_amount,0));
    end if;
    if coalesce(p_use_points, false) then
      raise exception 'odeme: puan yalniz hesabin tamami kapatilirken kullanilabilir';
    end if;
  end if;

  -- TUTAR KILIDI: beklenenden farkli tutar ancak gerekceyle gecer.
  v_fark_var := coalesce(p_amount, 0) > 0
                and not coalesce(p_use_points, false)
                and abs(coalesce(p_amount,0) - v_beklenen) > 0.005;

  if v_fark_var and (v_neden is null or length(v_neden) < 2) then
    raise exception 'odeme: tutar beklenenden farkli (beklenen TL %, girilen TL %) — fark nedenini yaz',
      round(v_beklenen), round(coalesce(p_amount,0));
  end if;

  if v_fark_var then
    v_tur := coalesce(p_fark_turu,
                      case when p_amount < v_beklenen then 'indirim' else 'bahsis' end);

    -- Bolunmus hesapta indirim YOK: dagitim tabani tum kalemler oldugu icin
    -- once tam fiyattan odeyenin kalemi de geriye donuk ucuzlar, tahsilat
    -- toplami ile ciro ayrisirdi.
    if v_tur = 'indirim' and (v_kismi or v_odenen_once > 0 or p_kalemler is not null) then
      raise exception 'odeme: bolunmus hesapta indirim yazilamaz — indirimi kalem kalem "İndirim" dugmesiyle uygula';
    end if;

    if v_tur = 'indirim' then
      if p_amount >= v_beklenen then
        raise exception 'odeme: indirim icin girilen tutar beklenenden kucuk olmali (beklenen TL %, girilen TL %) — fazlaysa "bahsis" sec',
          round(v_beklenen), round(p_amount);
      end if;

      select coalesce(sum(oi.final_price * oi.quantity), 0) into v_taban
        from public.order_items oi
       where oi.order_id = p_order_id
         and not coalesce(oi.is_treat, false)
         and oi.final_price > 0 and coalesce(oi.quantity, 0) > 0;
      if v_taban <= 0 then
        raise exception 'odeme: indirim dagitilacak kalem yok (hepsi ikram ya da 0 TL) — hesabi ikram olarak kapat';
      end if;
      if p_amount >= v_taban then
        raise exception 'odeme: indirim icin girilen tutar kalem toplamindan kucuk olmali (kalemler TL %, girilen TL %)',
          round(v_taban), round(p_amount);
      end if;
      v_fark := v_taban - p_amount;

      select oi.id into v_son_id
        from public.order_items oi
       where oi.order_id = p_order_id
         and not coalesce(oi.is_treat, false)
         and oi.final_price > 0 and coalesce(oi.quantity, 0) > 0
       order by oi.created_at desc, oi.id desc
       limit 1;

      for k in
        select oi.id, oi.final_price, oi.quantity, oi.manual_discount
          from public.order_items oi
         where oi.order_id = p_order_id
           and not coalesce(oi.is_treat, false)
           and oi.final_price > 0 and coalesce(oi.quantity, 0) > 0
         order by oi.created_at, oi.id
      loop
        if k.id = v_son_id then
          v_pay := v_fark - v_dagitilan;
        else
          v_pay := round(v_fark * (k.final_price * k.quantity) / v_taban, 2);
        end if;
        v_birim := least(round(v_pay / k.quantity, 2), k.final_price);
        v_dagitilan := v_dagitilan + v_birim * k.quantity;

        update public.order_items
           set manual_discount = coalesce(manual_discount, 0) + v_birim,
               final_price     = greatest(0, final_price - v_birim),
               discount_note   = coalesce(v_neden, discount_note)
         where id = k.id;
      end loop;

      v_subtotal := p_amount;
      v_total    := p_amount;
      v_indirim  := coalesce(o.discount_amount, 0) + v_fark;
      v_not      := 'indirim: ' || v_neden;
    else
      v_not := case v_tur when 'eksik' then 'eksik: ' when 'bahsis' then 'bahşiş: ' else 'diğer: ' end
               || v_neden;
    end if;
  else
    v_not := v_neden;
  end if;

  v_uye := coalesce(o.customer_id, p_customer_id);

  if p_method = 'debt' then
    if v_uye is null then raise exception 'odeme: borc icin kisi secilmeli'; end if;
    update public.customers
       set outstanding_balance = coalesce(outstanding_balance, 0) + p_amount
     where id = v_uye
     returning outstanding_balance into v_borc;
    if not found then raise exception 'odeme: kisi bulunamadi ya da yetki yok'; end if;
  end if;

  if coalesce(p_amount, 0) > 0 then
    insert into public.payments(order_id, amount, method, store_id, staff_id, note)
    values (p_order_id, p_amount, p_method::payment_method, o.origin_store_id, v_staff.id,
            case when v_kismi then btrim(coalesce(v_not, '') || ' [kismi]') else v_not end)
    returning id into v_payment_id;

    -- Hangi odeme neyi kapatti (bolunmus hesapta "ben bunu odemistim" defteri)
    if p_kalemler is not null and v_payment_id is not null then
      insert into public.payment_items(payment_id, order_item_id, adet, tutar)
      select v_payment_id, oi.id, x.adet, oi.final_price * x.adet
        from (select (e->>'id')::uuid as id,
                     greatest(1, coalesce((e->>'adet')::int, 1)) as adet
                from jsonb_array_elements(p_kalemler) e) x
        join public.order_items oi on oi.id = x.id;
    end if;
  end if;

  -- ---- HESAP KAPANIYOR MU ----------------------------------------------
  if v_kapanir then
    -- CIRO = SATILAN MAL, tahsilat toplami DEGIL. Ilk yazisimda bolunmus
    -- hesabin toplamini odemelerin toplamina esitliyordum; yerel Postgres'te
    -- kosturunca 150 TL'lik biraya 200 veren musterinin 50 TL bahsisi
    -- CIROYA yazildi. Bugunku kod bahsiste total'a hic dokunmuyor, ayni
    -- kurali koruyoruz: subtotal/total kalem toplamidir (o.total), yalniz
    -- indirim dalinda degisir.
    update public.orders set
      status          = 'paid',
      paid_at         = now(),
      use_points      = (p_method <> 'debt' and coalesce(p_use_points, false) and v_uye is not null),
      customer_id     = v_uye,
      staff_id        = coalesce(o.staff_id, v_staff.id),
      subtotal        = v_subtotal,
      total           = v_total,
      discount_amount = v_indirim
    where id = p_order_id;
  else
    -- Hesap ACIK kaliyor. status'a DOKUNULMAZ — mutfak/masa akisi bozulmasin.
    -- Uye yalniz siparis uyesiz ve borc yazildiysa baglanir; kismi odemede
    -- kasiyerin sectigi uye hesabin tamamini sahiplenmemeli.
    update public.orders set
      customer_id = case when p_method = 'debt' then coalesce(o.customer_id, v_uye) else o.customer_id end,
      staff_id    = coalesce(o.staff_id, v_staff.id)
    where id = p_order_id;
  end if;

  return query
    select coalesce(p_amount, 0),
           (select coalesce(x.points_used, 0) from public.orders x where x.id = p_order_id),
           v_borc,
           v_kalan,
           v_kapanir;
end $fn$;

comment on function public.nip_odeme_al(uuid, text, numeric, uuid, boolean, text, text, jsonb) is
  'Tahsilati tek islemde alir. p_kalemler verilirse yalniz o kalemler kapanir ve '
  'geriye kalem kalirsa hesap ACIK kalir (bolunmus odeme: masa kalabalik oturup '
  'ayri ayri oduyor). p_kalemler null ise kalan ne ise hepsi tahsil edilir ve hesap '
  'kapanir — bugunku davranis. Bolunmus hesapta indirim ve puan yasak. Siparisi ve '
  'secilen kalemleri kilitler. SECURITY INVOKER.';

revoke all on function public.nip_odeme_al(uuid, text, numeric, uuid, boolean, text, text, jsonb) from anon, public;
grant execute on function public.nip_odeme_al(uuid, text, numeric, uuid, boolean, text, text, jsonb) to authenticated;
