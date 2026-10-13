-- ============================================================================
-- BORC TAHSILATI                                      20261013_borc_tahsilat
-- ============================================================================
-- SAHIP (13.10.2026): "Borclularin borcunu odediginde hesabini temizlemek
-- icin bir ayarimiz yok."
--
-- OLCUM (13.10.2026). 4 borclu, toplam TL 12.950. 8 adet method='debt'
-- odeme satiri, toplami TL 12.950: bakiyeler tutarli. Bugune kadar SIFIR
-- tahsilat girilmis.
--
-- AYAR ASLINDA VARDI, KIMSE BULAMADI. nip_borc_tahsil fonksiyonu ve
-- Uyeler ekranindaki "Odeme al (borctan dus)" kutusu vardi. Ama:
--   * Uyeler ekrani yalniz yoneticiye acik. Borcu kasada kasiyer yaziyor,
--     tahsilati da kasada kasiyer almali.
--   * Kutu, duzenleme penceresinin en altindaydi.
-- Ayrica dort kusur vardi:
--   1. Tahsilat, paranin girdigi magazaya degil, kisinin kayitli magazasina
--      yaziliyordu. Nakit yanlis kasanin sayimina girebilirdi.
--   2. Fazla tutar sessizce kirpiliyordu: bakiye 0'da kaliyor, payments'a
--      tutarin TAMAMI yaziliyordu. Iki taraf ayrisiyordu.
--   3. Tahsilat satirinda KISI YOKTU. "Kim ne zaman ne odedi" sorulamiyordu.
--   4. "Acik borc" alani elle degistirilebiliyordu. Sifira cekilen borc icin
--      payments satiri olusmuyordu; o gecenin kasa sayimi FAZLA cikiyordu.
--      Bayat bir "Kaydet" de yeni yazilan borcu ya da tahsilati geri aliyordu.
--
-- MUHASEBE KURALI (degismedi, burada yaziyoruz ki bozulmasin):
--   * Satis, borcun yazildigi gun ciroya girdi (siparis 'paid').
--   * Tahsilat = order_id NULL olan payments satiri. Hicbir ciro sorgusu
--     payments okumaz; ciro IKI KEZ sayilmaz.
--   * kasa_gun_ozeti payments'i magaza ve saatle okur, order_id'ye bakmaz.
--     Nakit tahsilat o gunun beklenen nakdine KENDILIGINDEN girer. Kart
--     tahsilati kart toplamina girer, POS gun sonuyla eslesir.
--   * Tahsilati eski siparisin order_id'siyle yazmak YASAK (o sipariste
--     odeme toplami iki kat olur). Tahsilat icin yeni siparis acmak YASAK
--     (ciro, urun satisi ve stok ikinci kez duser).
--   * Tahsilatta PUAN VERILMEZ. Puan, siparis kapandiginda zaten verildi.
--
-- BU DOSYA:
--   1) payments.customer_id  : borc ve tahsilat satiri kisiye baglanir.
--   2) borc_affi             : para ALINMADAN silinen borcun defteri.
--   3) customers_guard_money_cols : personel de borcu dogrudan yazamaz.
--   4) nip_odeme_al          : borca yazarken kisiyi payments'a da yazar.
--   5) nip_borc_tahsil       : yeni imza; magaza, rol ve fazla tutar kapisi.
--   6) nip_borc_tahsil_geri_al : yanlis tahsilat, ayni gun, ters kayitla.
--   7) nip_borc_affet        : yalniz admin, gerekce zorunlu.
--   8) nip_borclular         : kasadaki liste (bakiye ve borc yasi).
--   9) nip_borc_ekstre       : kisi bazinda borc / tahsilat / af defteri.
--
-- Geri alma (sirayla):
--   drop function if exists public.nip_borc_ekstre(uuid);
--   drop function if exists public.nip_borclular();
--   drop function if exists public.nip_borc_affet(uuid, numeric, text, uuid);
--   drop function if exists public.nip_borc_tahsil_geri_al(uuid, text);
--   drop function if exists public.nip_borc_tahsil(uuid, numeric, text, uuid, numeric, text);
--   -- eski 3 parametreli nip_borc_tahsil 20260826_odeme_atomik.sql'den yeniden kurulur.
--   -- nip_odeme_al ve customers_guard_money_cols icin
--   -- 20260920_bolunmus_odeme.sql ve onceki guard tanimi yeniden uygulanir.
--   drop table if exists public.borc_affi;
--   alter table public.payments drop column if exists geri_alinan_id;
--   alter table public.payments drop column if exists customer_id;
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) payments.customer_id
-- ----------------------------------------------------------------------------
-- Dolu oldugu satirlar: method='debt' (borca yazildi) ve order_id NULL olan
-- tahsilat. Diger odemelerde bos kalir; kisi zaten orders.customer_id'de.
-- FK CASCADE DEGIL: kisi silinirse para gecmisi silinmesin, silme reddedilsin.
alter table public.payments
  add column if not exists customer_id uuid references public.customers(id);

create index if not exists payments_customer_id_idx
  on public.payments (customer_id) where customer_id is not null;

comment on column public.payments.customer_id is
  'Borc (method=debt) ve borc tahsilati (order_id NULL) satirlarinda kisi. Digerlerinde bos.';

-- Mevcut borc satirlari: kisi siparisten gelir.
update public.payments p
   set customer_id = o.customer_id
  from public.orders o
 where p.order_id = o.id
   and p.method = 'debt'
   and p.customer_id is null
   and o.customer_id is not null;

-- ----------------------------------------------------------------------------
-- 2) borc_affi — para alinmadan silinen borc
-- ----------------------------------------------------------------------------
-- Affetme bir PARA HAREKETI DEGIL: cekmeceye para girmedi. payments'a
-- yazilirsa kasa sayimi "eksik" cikar. Bu yuzden ayri defter.
-- Yazma yalniz nip_borc_affet uzerinden (SECURITY DEFINER). Istemciye yazma
-- politikasi YOK; personel yalniz okur.
create table if not exists public.borc_affi (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id),
  amount      numeric not null check (amount > 0),
  reason      text not null check (length(btrim(reason)) >= 3),
  staff_id    uuid references public.staff(id) on delete set null,
  store_id    uuid not null references public.stores(id),
  created_at  timestamptz not null default now()
);

create index if not exists borc_affi_customer_idx on public.borc_affi (customer_id);

comment on table public.borc_affi is
  'Para alinmadan silinen (affedilen) borc. Kasaya girmez, ciroyu degistirmez. Yazma yalniz nip_borc_affet.';

alter table public.borc_affi enable row level security;
revoke all on table public.borc_affi from anon, public;
revoke insert, update, delete on table public.borc_affi from authenticated;
grant select on table public.borc_affi to authenticated;

do $pol$
begin
  if not exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = 'borc_affi'
                    and policyname = 'borc_affi_staff_read') then
    create policy borc_affi_staff_read on public.borc_affi
      for select to authenticated using (public.is_staff());
  end if;
end $pol$;

-- ----------------------------------------------------------------------------
-- 3) Guard: personel de borcu dogrudan yazamaz
-- ----------------------------------------------------------------------------
-- Borc yalniz iki yoldan degisir:
--   * nip_odeme_al, "Borc" yontemi  -> artar
--   * nip_borc_tahsil               -> azalir
-- Ikisi de islem-yerel 'nip.borc_rpc' bayragini acar. nip_borc_affet SECURITY
-- DEFINER oldugu icin bu tetige hic takilmaz (current_user = sahip).
--
-- Bayrak yoksa personelin yazdigi deger SESSIZCE eski haline doner, hata
-- verilmez. Sebep: telefonda acik kalmis eski bir Uyeler ekrani "Kaydet"e
-- basarsa ad/telefon degisikligi yine kaydedilsin, yalniz borc korunsun.
--
-- Bayragi istemci acamaz: PostgREST yalniz RPC calistirir; set_config
-- disariya acik degildir. Bayrak RPC icinde acilir ve hemen kapatilir.
create or replace function public.customers_guard_money_cols()
returns trigger
language plpgsql
set search_path to 'public'
as $fn$
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;

  if public.is_staff() then
    if coalesce(current_setting('nip.borc_rpc', true), '') <> '1' then
      if tg_op = 'INSERT' then
        new.outstanding_balance := 0;
      else
        new.outstanding_balance := old.outstanding_balance;
      end if;
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.points := 0;
    new.total_spent := 0;
    new.visit_count := 0;
    new.outstanding_balance := 0;
    new.admin_discount := null;
    new.tier := 'yeniyuz';
  else
    new.points := old.points;
    new.total_spent := old.total_spent;
    new.visit_count := old.visit_count;
    new.outstanding_balance := old.outstanding_balance;
    new.admin_discount := old.admin_discount;
    new.tier := old.tier;
    new.store_id := old.store_id;
    new.notes := old.notes;
  end if;
  return new;
end $fn$;

-- ----------------------------------------------------------------------------
-- 4) nip_odeme_al — iki satir degisti
-- ----------------------------------------------------------------------------
-- Govde 20260920_bolunmus_odeme.sql ile BIREBIR ayni (canli tanimin md5'i
-- dosyayla eslesti). Yalniz iki degisiklik var:
--   a) Borc dalinda guard bayragi acilir ve kapatilir.
--   b) Borc satirinda payments.customer_id = kisi.
-- Imza ayni: yetkiler ve aciklama korunur.
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
    -- Guard bayragi: personel borcu yalniz RPC icinden degistirebilir
    -- (20261013_borc_tahsilat.sql).
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
    insert into public.payments(order_id, customer_id, amount, method, store_id, staff_id, note)
    values (p_order_id, case when p_method = 'debt' then v_uye end,
            p_amount, p_method::payment_method, o.origin_store_id, v_staff.id,
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

-- ----------------------------------------------------------------------------
-- 5) nip_borc_tahsil — yeni imza
-- ----------------------------------------------------------------------------
-- Eski 3 parametreli imza SILINMEZ, KAPATILIR: govdesi yalniz "sayfayi
-- yenile" hatasi verir ve HICBIR SEY yazmaz. Telefonda acik kalmis eski
-- Uyeler ekrani boylece anlasilir bir mesaj gorur. Yanlis magazaya yazmaktan
-- iyidir. (Yeni imza 4+ parametre ister; ikisi karismaz.)
create or replace function public.nip_borc_tahsil(p_customer_id uuid, p_amount numeric, p_method text)
returns numeric
language plpgsql
set search_path to 'public'
as $fn$
begin
  raise exception 'borc tahsili: uygulama guncellendi — sayfayi yenile';
end $fn$;

comment on function public.nip_borc_tahsil(uuid, numeric, text) is
  'KAPALI (20261013). Eski istemci icin: yalniz "sayfayi yenile" hatasi verir. Yeni imza 6 parametreli.';

-- payments.geri_alinan_id: geri alma satiri, geri aldigi tahsilati gosterir.
-- UNIQUE: bir tahsilat yalniz bir kez geri alinir.
alter table public.payments
  add column if not exists geri_alinan_id uuid unique references public.payments(id);

comment on column public.payments.geri_alinan_id is
  'Yanlis girilen borc tahsilatinin ters kaydi. Bu satir (eksi tutar) hangi tahsilati geri aldigini gosterir.';

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

  -- 5) Bakiyeyi dus. Guard yalniz bu bayrakla izin verir.
  perform set_config('nip.borc_rpc', '1', true);
  update public.customers
     set outstanding_balance = coalesce(outstanding_balance, 0) - v_tutar
   where id = p_customer_id
   returning outstanding_balance into v_kalan;
  perform set_config('nip.borc_rpc', '', true);

  -- 6) Para satiri. order_id NULL: ciroya girmez, kasa sayimina girer.
  --    store_id = paranin girdigi magaza (kisinin kayitli magazasi DEGIL).
  insert into public.payments (order_id, customer_id, amount, method, store_id, staff_id, note)
  values (null, p_customer_id, v_tutar, p_method::payment_method, p_store_id, v_staff.id,
          left('borç tahsilatı: ' || v_kisi.name
               || coalesce(' · ' || nullif(btrim(p_not), ''), ''), 300))
  returning id into v_pid;

  -- Puan, total_spent, visit_count ve seviye DEGISMEZ: hepsi borcun
  -- yazildigi gun siparis kapanirken verildi.
  return query select v_kalan, v_pid;
end $fn$;

comment on function public.nip_borc_tahsil(uuid, numeric, text, uuid, numeric, text) is
  'Borc tahsilati. order_id NULL payments satiri yazar: ciroya girmez, kasa_gun_ozeti kendiliginden sayar. '
  'Fazla tutari reddeder, magaza ve rol kapisi vardir, kisiyi kilitler. Puan vermez. SECURITY INVOKER.';

revoke all on function public.nip_borc_tahsil(uuid, numeric, text, uuid, numeric, text) from anon, public;
grant execute on function public.nip_borc_tahsil(uuid, numeric, text, uuid, numeric, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 6) nip_borc_tahsil_geri_al — yanlis girilen tahsilat
-- ----------------------------------------------------------------------------
-- Tahsilat silinmez; ters kayit yazilir (eksi tutar, ayni yontem, ayni
-- magaza). kasa_gun_ozeti tutarlari topladigi icin ikisi birbirini sifirlar.
-- YALNIZ AYNI ISLETME GUNUNDE (03:00 sinirli): ertesi gune dusen ters kayit
-- iki gunun sayimini da bozardi. Gecmis gunun hatasini admin "Borcu sil"
-- ya da yonetici duzeltmesiyle cozer.
-- Kim: tahsilati giren kisi ya da yonetici (admin, manager, owner, super_admin).
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
  if v_staff.id is null and current_user in ('authenticated', 'anon') then
    raise exception 'geri alma: yetkisiz';
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
    raise exception 'geri alma: yalniz ayni gun yapilir — gecmis gun icin yoneticiye haber ver';
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

  perform set_config('nip.borc_rpc', '1', true);
  update public.customers
     set outstanding_balance = coalesce(outstanding_balance, 0) + v_p.amount
   where id = v_p.customer_id
   returning outstanding_balance into v_kalan;
  perform set_config('nip.borc_rpc', '', true);

  insert into public.payments (order_id, customer_id, amount, method, store_id, staff_id, note, geri_alinan_id)
  values (null, v_p.customer_id, -v_p.amount, v_p.method, v_p.store_id, v_staff.id,
          left('geri alındı: ' || v_neden, 300), v_p.id);

  return v_kalan;
end $fn$;

comment on function public.nip_borc_tahsil_geri_al(uuid, text) is
  'Yanlis girilen borc tahsilatini ayni isletme gununde ters kayitla geri alir ve borcu geri yazar. SECURITY INVOKER.';

revoke all on function public.nip_borc_tahsil_geri_al(uuid, text) from anon, public;
grant execute on function public.nip_borc_tahsil_geri_al(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 7) nip_borc_affet — para alinmadan borcu silmek
-- ----------------------------------------------------------------------------
-- Yalniz admin. Gerekce zorunlu. payments'a YAZILMAZ: cekmeceye para girmedi.
-- Ciro geri alinmaz: satis o gun gercekten oldu. Puan geri alinmaz (sahibin
-- karari gelirse ayrica eklenir).
-- SECURITY DEFINER: borc_affi'ye istemci yazamaz. Yetki govdede kontrol edilir.
create or replace function public.nip_borc_affet(
  p_customer_id uuid,
  p_amount      numeric,
  p_gerekce     text,
  p_store_id    uuid)
returns table (kalan numeric, af_id uuid)
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_staff record;
  v_kisi  record;
  v_tutar numeric := round(coalesce(p_amount, 0), 2);
  v_neden text    := nullif(btrim(coalesce(p_gerekce, '')), '');
  v_kalan numeric;
  v_id    uuid;
begin
  select s.id, s.role::text as rol, s.store_ids into v_staff
    from public.staff s
   where s.auth_id = (select auth.uid()) and s.is_active;
  if v_staff.id is null or v_staff.rol <> 'admin' then
    raise exception 'borc silme: yalniz admin';
  end if;
  if p_store_id is null or not (p_store_id = any(coalesce(v_staff.store_ids, '{}'::uuid[]))) then
    raise exception 'borc silme: bu magaza icin yetkin yok';
  end if;
  if v_neden is null or length(v_neden) < 3 then
    raise exception 'borc silme: gerekce yaz (en az 3 harf)';
  end if;
  if v_tutar <= 0 then
    raise exception 'borc silme: gecerli tutar gir';
  end if;

  select c.id, c.name, coalesce(c.outstanding_balance, 0) as bakiye into v_kisi
    from public.customers c
   where c.id = p_customer_id
   for update;
  if not found then
    raise exception 'borc silme: kisi bulunamadi';
  end if;
  if v_kisi.bakiye <= 0.005 then
    raise exception 'borc silme: % kisisinin borcu yok', v_kisi.name;
  end if;
  if v_tutar > v_kisi.bakiye + 0.005 then
    raise exception 'borc silme: tutar borctan fazla (borc TL %, girilen TL %)',
      round(v_kisi.bakiye, 2), v_tutar;
  end if;
  if v_kisi.bakiye - v_tutar < 0.005 then
    v_tutar := v_kisi.bakiye;
  end if;

  update public.customers
     set outstanding_balance = coalesce(outstanding_balance, 0) - v_tutar
   where id = p_customer_id
   returning outstanding_balance into v_kalan;

  insert into public.borc_affi (customer_id, amount, reason, staff_id, store_id)
  values (p_customer_id, v_tutar, v_neden, v_staff.id, p_store_id)
  returning id into v_id;

  return query select v_kalan, v_id;
end $fn$;

comment on function public.nip_borc_affet(uuid, numeric, text, uuid) is
  'Para alinmadan borcu siler (affeder). Yalniz admin, gerekce zorunlu. payments''a yazmaz; borc_affi defterine yazar.';

revoke all on function public.nip_borc_affet(uuid, numeric, text, uuid) from anon, public;
grant execute on function public.nip_borc_affet(uuid, numeric, text, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 8) nip_borclular — kasadaki liste
-- ----------------------------------------------------------------------------
-- acik_borc_tarihi: ILK ODENMEMIS borcun tarihi (eski borc once kapanir
-- varsayimi). "45 gundur acik" rozeti buradan gelir; kimin once aranacagini
-- gosterir. Tahsilat ve af toplami ayrica tutulmaz: odenen = borclar - bakiye.
create or replace function public.nip_borclular()
returns table (
  customer_id      uuid,
  ad               text,
  telefon          text,
  bakiye           numeric,
  acik_borc_tarihi timestamptz,
  son_borc         timestamptz,
  son_tahsilat     timestamptz,
  borc_sayisi      int)
language sql
stable
set search_path to 'public'
as $fn$
  with k as (
    select c.id, c.name, c.phone, coalesce(c.outstanding_balance, 0) as bakiye
      from public.customers c
     where public.is_staff()
       and coalesce(c.outstanding_balance, 0) > 0.005
  ),
  borc as (
    select coalesce(p.customer_id, o.customer_id) as cid, p.created_at, p.amount, p.id
      from public.payments p
      join public.orders o on o.id = p.order_id
     where p.method = 'debt'
       and coalesce(p.customer_id, o.customer_id) in (select id from k)
  ),
  sira as (
    select b.cid, b.created_at,
           sum(b.amount) over (partition by b.cid order by b.created_at, b.id
                               rows between unbounded preceding and current row) as kum,
           sum(b.amount) over (partition by b.cid) as toplam
      from borc b
  )
  select k.id, k.name, k.phone, k.bakiye,
         (select min(s.created_at) from sira s
           where s.cid = k.id and s.kum > s.toplam - k.bakiye + 0.005),
         (select max(b.created_at) from borc b where b.cid = k.id),
         (select max(p.created_at) from public.payments p
           where p.customer_id = k.id and p.order_id is null and p.amount > 0),
         (select count(*)::int from borc b where b.cid = k.id)
    from k
   order by 5 nulls last, k.bakiye desc;
$fn$;

comment on function public.nip_borclular() is
  'Borcu olan kisiler: bakiye, ilk odenmemis borcun tarihi, son borc ve son tahsilat. Yalniz personel.';

revoke all on function public.nip_borclular() from anon, public;
grant execute on function public.nip_borclular() to authenticated;

-- ----------------------------------------------------------------------------
-- 9) nip_borc_ekstre — kisi bazinda defter
-- ----------------------------------------------------------------------------
-- tur: 'borc' (kasada borca yazildi), 'tahsilat', 'geri_alma', 'af'.
-- tutar her zaman pozitif; yon tur'den okunur.
-- Borc satirinin aciklamasi: o odemenin kapattigi kalemler (bolunmus
-- odemede yalniz secilenler, degilse siparisin tum kalemleri).
create or replace function public.nip_borc_ekstre(p_customer_id uuid)
returns table (
  tarih      timestamptz,
  tur        text,
  tutar      numeric,
  aciklama   text,
  yontem     text,
  personel   text,
  kayit_id   uuid,
  geri_alindi boolean)
language sql
stable
set search_path to 'public'
as $fn$
  select x.tarih, x.tur, x.tutar, x.aciklama, x.yontem, x.personel, x.kayit_id, x.geri_alindi
    from (
      select p.created_at as tarih, 'borc'::text as tur, p.amount as tutar,
             coalesce(
               (select string_agg(oi.product_name || case when pi.adet > 1 then ' ×' || pi.adet else '' end,
                                  ', ' order by oi.created_at)
                  from public.payment_items pi
                  join public.order_items oi on oi.id = pi.order_item_id
                 where pi.payment_id = p.id),
               (select string_agg(oi.product_name || case when oi.quantity > 1 then ' ×' || oi.quantity else '' end,
                                  ', ' order by oi.created_at)
                  from public.order_items oi
                 where oi.order_id = p.order_id and coalesce(oi.quantity, 0) > 0)
             ) as aciklama,
             'debt'::text as yontem, s.name as personel, p.id as kayit_id, false as geri_alindi
        from public.payments p
        join public.orders o on o.id = p.order_id
        left join public.staff s on s.id = p.staff_id
       where p.method = 'debt'
         and coalesce(p.customer_id, o.customer_id) = p_customer_id
      union all
      select p.created_at,
             case when p.geri_alinan_id is not null then 'geri_alma' else 'tahsilat' end,
             abs(p.amount), p.note, p.method::text, s.name, p.id,
             exists (select 1 from public.payments g where g.geri_alinan_id = p.id)
        from public.payments p
        left join public.staff s on s.id = p.staff_id
       where p.order_id is null and p.customer_id = p_customer_id
      union all
      select a.created_at, 'af', a.amount, a.reason, null, s.name, a.id, false
        from public.borc_affi a
        left join public.staff s on s.id = a.staff_id
       where a.customer_id = p_customer_id
    ) x
   where public.is_staff()
   order by x.tarih, x.kayit_id;
$fn$;

comment on function public.nip_borc_ekstre(uuid) is
  'Bir kisinin borc defteri: borclar, tahsilatlar, geri almalar ve aflar, tarih sirasiyla. Yalniz personel.';

revoke all on function public.nip_borc_ekstre(uuid) from anon, public;
grant execute on function public.nip_borc_ekstre(uuid) to authenticated;
