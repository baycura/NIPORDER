-- ============================================================================
-- BORC ODENMEDEN PUAN YOK                               20261013_borc_puan
-- ============================================================================
-- SAHIP (13.10.2026): "Borclular borcunu odemeden puan yok."
--
-- OLCUM. 4 borclu borc gunu toplam 646 puan kazandi (Yakup 277, Orhan 245,
-- Ayse 76, Ersin 48). Puanlarinin TAMAMI odenmemis borctan geliyor. Bugune
-- kadar hic tahsilat yok.
--
-- KURAL:
--   1. Hesabin borca yazilan kismi puan kazandirmaz (fn_award_member_points).
--   2. Puan borc odenince verilir: 20 TL = 1 puan (nip_borc_tahsil).
--   3. Yanlis tahsilat geri alinirsa ya da admin borcu geri yazarsa o
--      tahsilatin puani da geri alinir (eksiye dusmez).
--   4. Borcu olan kisi puan HARCAYAMAZ (nip_odeme_al). Nakit ya da kartla
--      aldiginda kazandigi puan durur; borcunu kapatinca kullanir.
--   5. Bugunku 646 puan geri alinir; borclu odedikce geri kazanir.
-- total_spent, visit_count ve seviye DEGISMEZ: satis ve ziyaret gercekten oldu.
--
-- Govdeler 20261013_borc_tahsilat.sql'deki halin uzerine yalniz yukaridaki
-- satirlar eklenerek kuruldu. Imzalar ve donus tipleri ayni.
--
-- Geri alma: 20261013_borc_tahsilat.sql'deki nip_odeme_al, nip_borc_tahsil,
-- nip_borc_tahsil_geri_al, nip_borc_geri_yaz ve 20260913_kasa_farki_indirim.sql
-- (ya da canli onceki tanim) fn_award_member_points yeniden kurulur. Geri
-- alinan puan bu dosyanin sonundaki sorgunun tersiyle geri yazilir.
-- ============================================================================

set local lock_timeout = '3s';

-- ----------------------------------------------------------------------------
-- 1) fn_award_member_points — borc kismi puan kazandirmaz
-- ----------------------------------------------------------------------------
create or replace function public.fn_award_member_points()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare bal int; use_amt int; delta int; spent numeric; new_tier text; v_borc numeric;
begin
  if new.customer_id is null then return null; end if;
  if old.status is not distinct from new.status then return null; end if;
  if new.status::text <> 'paid' or old.status::text = 'paid' then return null; end if;

  use_amt := 0;
  if coalesce(new.use_points, false) then
    select coalesce(points, 0) into bal from customers where id = new.customer_id for update;
    use_amt := least(bal, floor(coalesce(new.total, 0))::int);
  end if;

  -- BORC ODENMEDEN PUAN YOK (sahip karari 13.10.2026). Hesabin borca yazilan
  -- kismi bugun puan kazandirmaz; puani borc tahsil edilince nip_borc_tahsil
  -- verir. total_spent ve visit_count degismez: satis ve ziyaret gercekten oldu.
  -- Borc odemesi satiri nip_odeme_al'da siparis kapanmadan ONCE yazilir, bu
  -- yuzden burada gorunur.
  select coalesce(sum(p.amount), 0) into v_borc
    from public.payments p
   where p.order_id = new.id and p.method = 'debt';

  delta := greatest(0, floor((coalesce(new.total, 0) - use_amt - v_borc) / 20));
  update public.customers set
    points = coalesce(points, 0) - use_amt + delta,
    total_spent = coalesce(total_spent, 0) + coalesce(new.total, 0),
    visit_count = coalesce(visit_count, 0) + 1,
    updated_at = now()
  where id = new.customer_id
  returning total_spent into spent;

  if use_amt > 0 or coalesce(new.points_used, 0) <> 0 then
    update public.orders set points_used = use_amt where id = new.id;
  end if;

  new_tier := case
    when spent >= 80000 then 'aileden'
    when spent >= 30000 then 'mudavim'
    when spent >= 10000 then 'mahalleli'
    else 'yeniyuz' end;
  update public.customers set tier = new_tier
  where id = new.customer_id and coalesce(tier, '') is distinct from new_tier;
  return null;
end $fn$;

-- ----------------------------------------------------------------------------
-- 2) nip_odeme_al — borcu olan kisi puan harcayamaz
-- ----------------------------------------------------------------------------
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
  -- Borcu olan kisi puan HARCAYAMAZ: borcunu odemeden puan yok (sahip
  -- karari 13.10.2026, 20261013_borc_puan.sql).
  if p_method <> 'debt' and coalesce(p_use_points, false) and exists (
       select 1 from public.customers c
        where c.id = coalesce(o.customer_id, p_customer_id)
          and coalesce(c.outstanding_balance, 0) > 0.005) then
    raise exception 'odeme: borcu olan kisi puan kullanamaz — once borcunu kapatsin';
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
    -- Borc kilidi: personel borcu yalniz RPC icinden degistirebilir
    -- (20261013_borc_tahsilat_kilit.sql).
    perform set_config('nip.borc_rpc', '1', true);
    update public.customers
       set outstanding_balance = coalesce(outstanding_balance, 0) + p_amount
     where id = v_uye
     returning outstanding_balance into v_borc;
    if not found then raise exception 'odeme: kisi bulunamadi ya da yetki yok'; end if;
    perform set_config('nip.borc_rpc', '', true);
  end if;

  if coalesce(p_amount, 0) > 0 then
    -- Borc satiri kisiye baglanir: ekstre ve borc yasi buradan okunur.
    -- payments_guard_rpc kisili satiri yalniz bu bayrakla kabul eder.
    perform set_config('nip.odeme_rpc', '1', true);
    insert into public.payments(order_id, customer_id, amount, method, store_id, staff_id, note)
    values (p_order_id, case when p_method = 'debt' then v_uye end,
            p_amount, p_method::payment_method, o.origin_store_id, v_staff.id,
            case when v_kismi then btrim(coalesce(v_not, '') || ' [kismi]') else v_not end)
    returning id into v_payment_id;
    perform set_config('nip.odeme_rpc', '', true);

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

-- ----------------------------------------------------------------------------
-- 3) nip_borc_tahsil — odenen tutar kadar puan
-- ----------------------------------------------------------------------------
create or replace function public.nip_borc_tahsil(
  p_customer_id     uuid,
  p_amount          numeric,
  p_method          text,
  p_store_id        uuid,
  p_beklenen_bakiye numeric default null,
  p_not             text    default null)
returns table (kalan numeric, payment_id uuid)
language plpgsql
set search_path to 'public'
as $fn$
declare
  v_staff record;
  v_kisi  record;
  v_tutar numeric;
  v_kalan numeric;
  v_pid   uuid;
  v_puan  int;
begin
  -- 1) Girdi. 'debt' ve 'online' tahsilat yontemi degil.
  if p_method is null or p_method not in ('cash', 'card', 'transfer') then
    raise exception 'borc tahsili: gecersiz yontem % (cash | card | transfer)', p_method;
  end if;
  v_tutar := round(coalesce(p_amount, 0), 2);
  if v_tutar <= 0 then
    raise exception 'borc tahsili: gecerli tutar gir';
  end if;
  if p_store_id is null then
    raise exception 'borc tahsili: magaza secilmeli';
  end if;

  -- 2) Personel, rol ve magaza kapisi. Mutfak ve izleyici para almaz
  --    (kasa sayimindaki kuralla ayni).
  select s.id, s.role::text as rol, s.store_ids into v_staff
    from public.staff s
   where s.auth_id = (select auth.uid()) and s.is_active;
  if v_staff.id is null then
    if current_user in ('authenticated', 'anon') then
      raise exception 'borc tahsili: yetkisiz';
    end if;
  else
    if v_staff.rol in ('kitchen', 'viewer') then
      raise exception 'borc tahsili: bu rol tahsilat alamaz';
    end if;
    if not (p_store_id = any(coalesce(v_staff.store_ids, '{}'::uuid[]))) then
      raise exception 'borc tahsili: bu magaza icin yetkin yok';
    end if;
  end if;

  -- 3) Kisiyi KILITLE: ayni kisiye iki cihazdan gelen tahsilat sirayla islenir.
  select c.id, c.name, coalesce(c.outstanding_balance, 0) as bakiye into v_kisi
    from public.customers c
   where c.id = p_customer_id
   for update;
  if not found then
    raise exception 'borc tahsili: kisi bulunamadi';
  end if;

  -- 4) Bakiye kontrolleri KILITTEN SONRA.
  if v_kisi.bakiye <= 0.005 then
    raise exception 'borc tahsili: % kisisinin borcu yok', v_kisi.name;
  end if;
  -- Cift dokunus ve iki cihaz korumasi: ekranda gorulen bakiye degistiyse dur.
  if p_beklenen_bakiye is not null and abs(v_kisi.bakiye - p_beklenen_bakiye) > 0.005 then
    raise exception 'borc tahsili: bakiye degisti (ekranda TL %, simdi TL %) — ekrani yenile',
      round(p_beklenen_bakiye), round(v_kisi.bakiye);
  end if;
  -- Fazla tutar REDDEDILIR. Eskiden bakiye 0'da kesiliyor, payments'a tutarin
  -- tamami yaziliyordu; iki taraf ayrisiyordu.
  if v_tutar > v_kisi.bakiye + 0.005 then
    raise exception 'borc tahsili: tutar borctan fazla (borc TL %, girilen TL %)',
      round(v_kisi.bakiye, 2), v_tutar;
  end if;
  -- Kurus kalintisi birakma.
  if v_kisi.bakiye - v_tutar < 0.005 then
    v_tutar := v_kisi.bakiye;
  end if;

  -- 5) Bakiyeyi dus ve PUANI VER. Borcun puani borc gunu verilmedi
  --    (fn_award_member_points); odenen tutar kadar simdi verilir:
  --    20 TL = 1 puan. Borc kilidi yalniz bu bayrakla izin verir.
  v_puan := floor(v_tutar / 20);
  perform set_config('nip.borc_rpc', '1', true);
  update public.customers
     set outstanding_balance = coalesce(outstanding_balance, 0) - v_tutar,
         points = coalesce(points, 0) + v_puan
   where id = p_customer_id
   returning outstanding_balance into v_kalan;
  perform set_config('nip.borc_rpc', '', true);

  -- 6) Para satiri. order_id NULL: ciroya girmez, kasa sayimina girer.
  --    store_id = paranin girdigi magaza (kisinin kayitli magazasi DEGIL).
  perform set_config('nip.odeme_rpc', '1', true);
  insert into public.payments (order_id, customer_id, amount, method, store_id, staff_id, note)
  values (null, p_customer_id, v_tutar, p_method::payment_method, p_store_id, v_staff.id,
          left('borç tahsilatı: ' || v_kisi.name
               || coalesce(' · ' || nullif(btrim(p_not), ''), ''), 300))
  returning id into v_pid;
  perform set_config('nip.odeme_rpc', '', true);

  -- total_spent, visit_count ve seviye DEGISMEZ: satis ve ziyaret borcun
  -- yazildigi gun kaydedildi. Yalniz puan simdi verildi (yukarida).
  return query select v_kalan, v_pid;
end $fn$;

-- ----------------------------------------------------------------------------
-- 4) nip_borc_tahsil_geri_al — tahsilatin puani da geri alinir
-- ----------------------------------------------------------------------------
create or replace function public.nip_borc_tahsil_geri_al(p_payment_id uuid, p_gerekce text)
returns numeric
language plpgsql
set search_path to 'public'
as $fn$
declare
  v_staff  record;
  v_p      record;
  v_neden  text := nullif(btrim(coalesce(p_gerekce, '')), '');
  v_kalan  numeric;
begin
  if v_neden is null or length(v_neden) < 3 then
    raise exception 'geri alma: nedenini yaz (en az 3 harf)';
  end if;

  select s.id, s.role::text as rol, s.store_ids into v_staff
    from public.staff s
   where s.auth_id = (select auth.uid()) and s.is_active;
  if v_staff.id is null then
    if current_user in ('authenticated', 'anon') then
      raise exception 'geri alma: yetkisiz';
    end if;
  elsif v_staff.rol in ('kitchen', 'viewer') then
    raise exception 'geri alma: bu rol tahsilat geri alamaz';
  end if;

  -- payments istemciye yalniz EKLEME icin acik (UPDATE yetkisi yok), satir
  -- kilitlenemez. Sira kisi satirinin kilidiyle saglanir; ayni tahsilatin iki
  -- kez geri alinmasini geri_alinan_id UNIQUE kisiti kesin olarak engeller.
  select p.* into v_p from public.payments p where p.id = p_payment_id;
  if not found then
    raise exception 'geri alma: tahsilat bulunamadi';
  end if;
  if v_p.order_id is not null or v_p.customer_id is null or v_p.amount <= 0
     or v_p.geri_alinan_id is not null or v_p.method::text not in ('cash', 'card', 'transfer') then
    raise exception 'geri alma: bu satir bir borc tahsilati degil';
  end if;
  if ((v_p.created_at at time zone 'Europe/Istanbul') - interval '3 hours')::date
     <> ((now() at time zone 'Europe/Istanbul') - interval '3 hours')::date then
    raise exception 'geri alma: yalniz ayni gun yapilir — gecmis gun icin admin borcu geri yazar';
  end if;
  if v_staff.id is not null then
    if not (v_p.store_id = any(coalesce(v_staff.store_ids, '{}'::uuid[]))) then
      raise exception 'geri alma: bu magaza icin yetkin yok';
    end if;
    if v_staff.id is distinct from v_p.staff_id
       and v_staff.rol not in ('admin', 'manager', 'owner', 'super_admin') then
      raise exception 'geri alma: yalniz tahsilati giren kisi ya da yonetici geri alabilir';
    end if;
  end if;

  perform 1 from public.customers c where c.id = v_p.customer_id for update;
  -- Kilitten SONRA: ayni anda basilan ikinci "geri al" burada durur.
  if exists (select 1 from public.payments x where x.geri_alinan_id = v_p.id) then
    raise exception 'geri alma: bu tahsilat zaten geri alinmis';
  end if;
  if exists (select 1 from public.borc_duzeltme d where d.payment_id = v_p.id) then
    raise exception 'geri alma: bu tahsilat icin borc zaten geri yazilmis';
  end if;

  perform set_config('nip.borc_rpc', '1', true);
  -- Tahsilatin verdigi puan da geri alinir (eksiye dusmez).
  update public.customers
     set outstanding_balance = coalesce(outstanding_balance, 0) + v_p.amount,
         points = greatest(0, coalesce(points, 0) - floor(v_p.amount / 20)::int)
   where id = v_p.customer_id
   returning outstanding_balance into v_kalan;
  perform set_config('nip.borc_rpc', '', true);

  perform set_config('nip.odeme_rpc', '1', true);
  insert into public.payments (order_id, customer_id, amount, method, store_id, staff_id, note, geri_alinan_id)
  values (null, v_p.customer_id, -v_p.amount, v_p.method, v_p.store_id, v_staff.id,
          left('geri alındı: ' || v_neden, 300), v_p.id);
  perform set_config('nip.odeme_rpc', '', true);

  return v_kalan;
end $fn$;

-- ----------------------------------------------------------------------------
-- 5) nip_borc_geri_yaz — yanlis tahsilatin puani da geri alinir
-- ----------------------------------------------------------------------------
create or replace function public.nip_borc_geri_yaz(
  p_customer_id uuid,
  p_amount      numeric,
  p_gerekce     text,
  p_store_id    uuid,
  p_payment_id  uuid default null)
returns table (kalan numeric, duzeltme_id uuid)
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_staff record;
  v_p     record;
  v_tutar numeric := round(coalesce(p_amount, 0), 2);
  v_neden text    := nullif(btrim(coalesce(p_gerekce, '')), '');
  v_kalan numeric;
  v_id    uuid;
begin
  select s.id, s.role::text as rol, s.store_ids into v_staff
    from public.staff s
   where s.auth_id = (select auth.uid()) and s.is_active;
  if v_staff.id is null or v_staff.rol <> 'admin' then
    raise exception 'borc geri yazma: yalniz admin';
  end if;
  if p_store_id is null or not (p_store_id = any(coalesce(v_staff.store_ids, '{}'::uuid[]))) then
    raise exception 'borc geri yazma: bu magaza icin yetkin yok';
  end if;
  if v_neden is null or length(v_neden) < 3 then
    raise exception 'borc geri yazma: gerekce yaz (en az 3 harf)';
  end if;
  if v_tutar <= 0 then
    raise exception 'borc geri yazma: gecerli tutar gir';
  end if;

  perform 1 from public.customers c where c.id = p_customer_id for update;
  if not found then
    raise exception 'borc geri yazma: kisi bulunamadi';
  end if;

  if p_payment_id is not null then
    select p.* into v_p from public.payments p where p.id = p_payment_id;
    if not found or v_p.customer_id is distinct from p_customer_id
       or v_p.order_id is not null or v_p.amount <= 0 or v_p.geri_alinan_id is not null then
      raise exception 'borc geri yazma: bu satir bu kisinin bir tahsilati degil';
    end if;
    if exists (select 1 from public.payments x where x.geri_alinan_id = v_p.id) then
      raise exception 'borc geri yazma: bu tahsilat zaten geri alinmis';
    end if;
    if exists (select 1 from public.borc_duzeltme d where d.payment_id = v_p.id) then
      raise exception 'borc geri yazma: bu tahsilat icin borc zaten geri yazilmis';
    end if;
    if v_tutar > v_p.amount + 0.005 then
      raise exception 'borc geri yazma: tutar tahsilattan fazla (tahsilat TL %, girilen TL %)',
        v_p.amount, v_tutar;
    end if;
  end if;

  -- Yanlis tahsilat icin geri yaziliyorsa o tahsilatin verdigi puan da geri
  -- alinir (eksiye dusmez). Genel duzeltmede puana dokunulmaz.
  update public.customers
     set outstanding_balance = coalesce(outstanding_balance, 0) + v_tutar,
         points = case when p_payment_id is not null
                       then greatest(0, coalesce(points, 0) - floor(v_tutar / 20)::int)
                       else points end
   where id = p_customer_id
   returning outstanding_balance into v_kalan;

  insert into public.borc_duzeltme (customer_id, tur, tutar, reason, payment_id, staff_id, store_id)
  values (p_customer_id, 'geri_yaz', v_tutar, v_neden, p_payment_id, v_staff.id, p_store_id)
  returning id into v_id;

  return query select v_kalan, v_id;
end $fn$;

comment on function public.nip_borc_tahsil(uuid, numeric, text, uuid, numeric, text) is
  'Borc tahsilati. order_id NULL payments satiri yazar: ciroya girmez, kasa_gun_ozeti kendiliginden sayar. '
  'Odenen tutar kadar puan verir (20 TL = 1 puan). Fazla tutari reddeder, magaza ve rol kapisi vardir, '
  'kisiyi kilitler. SECURITY INVOKER.';

-- ----------------------------------------------------------------------------
-- 6) Bugunku borc puanlarini geri al
-- ----------------------------------------------------------------------------
-- Yalniz borcu duran ve HIC tahsilati olmayan kisiler: puanlarinin borctan
-- gelen kismi (borc satiri basina 20 TL = 1 puan) duser. Puan eksiye dusmez.
-- Kisi borcunu odedikce nip_borc_tahsil puani yeniden verir.
update public.customers c
   set points = greatest(0, coalesce(c.points, 0) - x.borc_puan)
  from (select p.customer_id, sum(floor(p.amount / 20))::int as borc_puan
          from public.payments p
         where p.method = 'debt' and p.customer_id is not null
         group by p.customer_id) x
 where x.customer_id = c.id
   and coalesce(c.outstanding_balance, 0) > 0.005
   and not exists (select 1 from public.payments t
                    where t.customer_id = c.id and t.order_id is null);
