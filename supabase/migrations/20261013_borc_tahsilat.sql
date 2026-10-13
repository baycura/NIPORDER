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
--   * Borc duzeltmesi (af ya da geri yazma) PARA HAREKETI DEGILDIR:
--     payments'a yazilmaz, borc_duzeltme defterine yazilir.
--
-- IKI ADIMDA UYGULANIR. Bu dosya (A) once, 20261013_borc_tahsilat_kilit.sql
-- (B) sonra. Sebep: A'daki "alter table payments" tabloyu bir an kilitler.
-- O an baslayan bir "Borca yaz" islemi ESKI nip_odeme_al govdesiyle devam
-- eder. Yeni borc kilidi (B) ayni islemde gelseydi bu islemin borc artisi
-- sessizce yok sayilirdi. A tek basina zararsizdir: eski kilit personele
-- zaten izin veriyor.
--
-- BU DOSYA (A):
--   1) payments.customer_id, payments.geri_alinan_id
--   2) borc_duzeltme         : para hareketi olmayan borc degisikligi defteri
--   3) payments_guard_rpc    : borc anlami tasiyan payments satirini yalniz
--                              RPC yazar (inceleme bulgusu, asagida)
--   4) nip_odeme_al          : bayraklar ve borc satirinda kisi
--   5) nip_borc_tahsil       : yeni imza; magaza, rol ve fazla tutar kapisi
--   6) nip_borc_tahsil_geri_al : yanlis tahsilat, ayni gun, ters kayitla
--   7) nip_borc_affet, nip_borc_geri_yaz : yalniz admin, gerekce zorunlu
--   8) nip_borclular         : kasadaki liste (bakiye, borc yasi, bugun odeyen)
--   9) nip_borc_ekstre       : kisi bazinda borc / tahsilat / duzeltme defteri
--
-- Geri alma (sirayla; once B'nin geri almasi):
--   drop function if exists public.nip_borc_ekstre(uuid);
--   drop function if exists public.nip_borclular();
--   drop function if exists public.nip_borc_geri_yaz(uuid, numeric, text, uuid, uuid);
--   drop function if exists public.nip_borc_affet(uuid, numeric, text, uuid);
--   drop function if exists public.nip_borc_tahsil_geri_al(uuid, text);
--   drop function if exists public.nip_borc_tahsil(uuid, numeric, text, uuid, numeric, text);
--   -- eski 3 parametreli nip_borc_tahsil 20260826_odeme_atomik.sql'den,
--   -- nip_odeme_al 20260920_bolunmus_odeme.sql'den yeniden kurulur.
--   drop trigger if exists trg_payments_guard_rpc on public.payments;
--   drop function if exists public.payments_guard_rpc();
--   drop table if exists public.borc_duzeltme;
--   alter table public.payments drop column if exists geri_alinan_id;
--   alter table public.payments drop column if exists customer_id;
-- ============================================================================

-- Kilit beklerse hemen vazgec: kasadaki islemleri kuyruga sokmasin.
set local lock_timeout = '3s';

-- ----------------------------------------------------------------------------
-- 1) payments: kisi ve ters kayit baglantisi
-- ----------------------------------------------------------------------------
-- customer_id dolu oldugu satirlar: method='debt' (borca yazildi) ve
-- order_id NULL olan tahsilat. Diger odemelerde bos kalir; kisi zaten
-- orders.customer_id'de. FK CASCADE DEGIL: kisi silinirse para gecmisi
-- silinmesin, silme reddedilsin.
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

-- geri_alinan_id: yanlis tahsilatin ters kaydi (eksi tutar) hangi tahsilati
-- geri aldigini gosterir. UNIQUE: bir tahsilat yalniz bir kez geri alinir.
alter table public.payments
  add column if not exists geri_alinan_id uuid unique references public.payments(id);

comment on column public.payments.geri_alinan_id is
  'Yanlis girilen borc tahsilatinin ters kaydi. Bu satir (eksi tutar) hangi tahsilati geri aldigini gosterir.';

-- ----------------------------------------------------------------------------
-- 2) borc_duzeltme — para hareketi OLMAYAN borc degisikligi
-- ----------------------------------------------------------------------------
-- Iki tur var, ikisi de yalniz admin ve gerekceyle:
--   'af'       borc para alinmadan silindi (tutar EKSI). Cekmeceye para
--              girmedi; payments'a yazilsaydi kasa "eksik" cikardi.
--   'geri_yaz' borc geri yazildi (tutar ARTI). Ornek: 02:50'de yanlis kisiye
--              tahsilat girildi, hata 03:00'ten sonra fark edildi. Ayni gun
--              geri alma artik mumkun degil; o gunun sayimi notuyla kalir,
--              kisinin borcu buradan geri yazilir. payment_id hangi yanlis
--              tahsilat icin yapildigini gosterir.
-- Istemciye yazma yetkisi YOK; personel yalniz okur. Yazma SECURITY DEFINER
-- fonksiyonlarla (nip_borc_affet, nip_borc_geri_yaz).
create table if not exists public.borc_duzeltme (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id),
  tur         text not null check (tur in ('af', 'geri_yaz')),
  tutar       numeric not null,
  reason      text not null check (length(btrim(reason)) >= 3),
  payment_id  uuid references public.payments(id),
  staff_id    uuid references public.staff(id) on delete set null,
  store_id    uuid not null references public.stores(id),
  created_at  timestamptz not null default now(),
  constraint borc_duzeltme_yon check ((tur = 'af' and tutar < 0) or (tur = 'geri_yaz' and tutar > 0))
);

create index if not exists borc_duzeltme_customer_idx on public.borc_duzeltme (customer_id);
-- Bir yanlis tahsilat icin yalniz bir geri yazma.
create unique index if not exists borc_duzeltme_payment_uniq
  on public.borc_duzeltme (payment_id) where payment_id is not null;

comment on table public.borc_duzeltme is
  'Para hareketi olmayan borc degisikligi: af (eksi) ve geri_yaz (arti). Kasaya girmez, ciroyu degistirmez. Yazma yalniz admin RPC.';

alter table public.borc_duzeltme enable row level security;
revoke all on table public.borc_duzeltme from anon, public;
revoke insert, update, delete, truncate on table public.borc_duzeltme from authenticated;
grant select on table public.borc_duzeltme to authenticated;

do $pol$
begin
  if not exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = 'borc_duzeltme'
                    and policyname = 'borc_duzeltme_staff_read') then
    create policy borc_duzeltme_staff_read on public.borc_duzeltme
      for select to authenticated using (public.is_staff());
  end if;
end $pol$;

-- ----------------------------------------------------------------------------
-- 3) payments_guard_rpc — borc anlami tasiyan satiri yalniz RPC yazar
-- ----------------------------------------------------------------------------
-- INCELEME BULGUSU (13.10.2026). payments tablosuna her aktif personel
-- PostgREST ile dogrudan satir ekleyebiliyor (RLS staff_full_access).
-- Boyle elle yazilmis bir satir {order_id: null, customer_id: X, amount:
-- 5000} sonra nip_borc_tahsil_geri_al ile "geri alinsaydi" X'in borcu satis
-- olmadan 5000 artardi. Eksi tutarli elle satir da kasa sayimini sessizce
-- duzeltip para cekmeye izin verirdi.
--
-- Kural: istemci rolu (authenticated, anon) su satirlari YALNIZ RPC icinden
-- yazabilir (islem-yerel 'nip.odeme_rpc' bayragi):
--   * order_id bos satir (borc tahsilati)
--   * eksi tutar (ters kayit)
--   * customer_id ya da geri_alinan_id dolu satir
-- Normal siparis odemesi (order_id dolu, tutar >= 0) etkilenmez.
-- Canli olcum: 1096 satirin hicbiri bu kosullara uymuyor; uygulamada
-- payments'a dogrudan yazan kod yok (yalniz RPC'ler ve servis rolu).
create or replace function public.payments_guard_rpc()
returns trigger
language plpgsql
set search_path to 'public'
as $fn$
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if coalesce(current_setting('nip.odeme_rpc', true), '') = '1' then return new; end if;
  if new.order_id is null
     or coalesce(new.amount, 0) < 0
     or new.customer_id is not null
     or new.geri_alinan_id is not null then
    raise exception 'odeme: bu kayit yalniz kasa islemleriyle yazilir';
  end if;
  return new;
end $fn$;

do $trg$
begin
  if not exists (select 1 from pg_trigger
                  where tgname = 'trg_payments_guard_rpc'
                    and tgrelid = 'public.payments'::regclass) then
    create trigger trg_payments_guard_rpc
      before insert on public.payments
      for each row execute function public.payments_guard_rpc();
  end if;
end $trg$;

-- ----------------------------------------------------------------------------
-- 4) nip_odeme_al — uc satir degisti
-- ----------------------------------------------------------------------------
-- Govde 20260920_bolunmus_odeme.sql ile BIREBIR ayni (canli tanimin md5'i
-- dosyayla eslesti). Yalniz uc degisiklik var:
--   a) Borc dalinda 'nip.borc_rpc' bayragi acilir ve kapatilir (B dosyasindaki
--      borc kilidi icin).
--   b) payments insert'i 'nip.odeme_rpc' bayragi icinde (payments_guard_rpc).
--   c) Borc satirinda payments.customer_id = kisi.
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

  -- 5) Bakiyeyi dus. Borc kilidi (B dosyasi) yalniz bu bayrakla izin verir.
  perform set_config('nip.borc_rpc', '1', true);
  update public.customers
     set outstanding_balance = coalesce(outstanding_balance, 0) - v_tutar
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
-- iki gunun sayimini da bozardi. Gecmis gunun hatasi admin'in
-- nip_borc_geri_yaz'i ile cozulur: borc geri yazilir, o gunun sayimi notuyla
-- kalir.
-- Kim: tahsilati giren kisi ya da yonetici (admin, manager, owner,
-- super_admin). Mutfak ve izleyici hic geri alamaz.
-- Satirin bir RPC tarafindan yazildigi kesindir: payments_guard_rpc, order_id
-- bos ve customer_id dolu satiri istemcinin yazmasina izin vermez.
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
  update public.customers
     set outstanding_balance = coalesce(outstanding_balance, 0) + v_p.amount
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

comment on function public.nip_borc_tahsil_geri_al(uuid, text) is
  'Yanlis girilen borc tahsilatini ayni isletme gununde ters kayitla geri alir ve borcu geri yazar. SECURITY INVOKER.';

revoke all on function public.nip_borc_tahsil_geri_al(uuid, text) from anon, public;
grant execute on function public.nip_borc_tahsil_geri_al(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 7) Admin duzeltmeleri — para hareketi YOK
-- ----------------------------------------------------------------------------
-- nip_borc_affet   : borcu para alinmadan siler (af). Ciro geri alinmaz:
--                    satis o gun gercekten oldu. Puan geri alinmaz (sahibin
--                    karari gelirse ayrica eklenir).
-- nip_borc_geri_yaz: borcu geri yazar. Gecmis gunde yanlis girilmis tahsilat
--                    ya da yanlislikla yapilan af icin. p_payment_id verilirse
--                    o tahsilata baglanir ve tutar onu gecemez.
-- Ikisi de SECURITY DEFINER: borc_duzeltme'ye istemci yazamaz. Yetki govdede
-- kontrol edilir. current_user sahip oldugu icin borc kilidine takilmazlar.
create or replace function public.nip_borc_affet(
  p_customer_id uuid,
  p_amount      numeric,
  p_gerekce     text,
  p_store_id    uuid)
returns table (kalan numeric, duzeltme_id uuid)
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

  insert into public.borc_duzeltme (customer_id, tur, tutar, reason, staff_id, store_id)
  values (p_customer_id, 'af', -v_tutar, v_neden, v_staff.id, p_store_id)
  returning id into v_id;

  return query select v_kalan, v_id;
end $fn$;

comment on function public.nip_borc_affet(uuid, numeric, text, uuid) is
  'Para alinmadan borcu siler (af). Yalniz admin, gerekce zorunlu. payments''a yazmaz; borc_duzeltme defterine yazar.';

revoke all on function public.nip_borc_affet(uuid, numeric, text, uuid) from anon, public;
grant execute on function public.nip_borc_affet(uuid, numeric, text, uuid) to authenticated;

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

  update public.customers
     set outstanding_balance = coalesce(outstanding_balance, 0) + v_tutar
   where id = p_customer_id
   returning outstanding_balance into v_kalan;

  insert into public.borc_duzeltme (customer_id, tur, tutar, reason, payment_id, staff_id, store_id)
  values (p_customer_id, 'geri_yaz', v_tutar, v_neden, p_payment_id, v_staff.id, p_store_id)
  returning id into v_id;

  return query select v_kalan, v_id;
end $fn$;

comment on function public.nip_borc_geri_yaz(uuid, numeric, text, uuid, uuid) is
  'Borcu geri yazar (gecmis gunde yanlis girilen tahsilat ya da yanlis af). Yalniz admin, gerekce zorunlu. payments''a yazmaz.';

revoke all on function public.nip_borc_geri_yaz(uuid, numeric, text, uuid, uuid) from anon, public;
grant execute on function public.nip_borc_geri_yaz(uuid, numeric, text, uuid, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 8) nip_borclular — kasadaki liste
-- ----------------------------------------------------------------------------
-- acik_borc_tarihi: ILK ODENMEMIS borcun tarihi (eski borc once kapanir
-- varsayimi). Borcun tarihi, hesabin borca YAZILDIGI andir: satis ve alacak o
-- an kayda girdi (ciro raporlariyla ayni gun). "29 gundur acik" rozeti
-- buradan gelir; kimin once aranacagini gosterir.
-- bugun_tahsilat: bu isletme gunundeki (03:00 sinirli) geri alinmamis
-- tahsilatlar. Borcu bugun SIFIRLANAN kisi de listede kalir; kasiyer yanlis
-- girdiyse dokumden geri alabilsin.
create or replace function public.nip_borclular()
returns table (
  customer_id      uuid,
  ad               text,
  telefon          text,
  bakiye           numeric,
  acik_borc_tarihi timestamptz,
  son_borc         timestamptz,
  son_tahsilat     timestamptz,
  borc_sayisi      int,
  bugun_tahsilat   numeric)
language sql
stable
set search_path to 'public'
as $fn$
  with gun as (
    select ((now() at time zone 'Europe/Istanbul') - interval '3 hours')::date as d
  ),
  tahsil as (
    -- Geri alinmamis ve borcu geri yazilmamis tahsilatlar.
    select p.customer_id as cid, p.created_at, p.amount
      from public.payments p
     where p.order_id is null and p.customer_id is not null and p.amount > 0
       and not exists (select 1 from public.payments g where g.geri_alinan_id = p.id)
       and not exists (select 1 from public.borc_duzeltme d where d.payment_id = p.id)
  ),
  bugun as (
    select t.cid, sum(t.amount) as tutar
      from tahsil t, gun
     where ((t.created_at at time zone 'Europe/Istanbul') - interval '3 hours')::date = gun.d
     group by t.cid
  ),
  k as (
    select c.id, c.name, c.phone, coalesce(c.outstanding_balance, 0) as bakiye
      from public.customers c
     where public.is_staff()
       and (coalesce(c.outstanding_balance, 0) > 0.005
            or c.id in (select cid from bugun))
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
         case when k.bakiye > 0.005 then
           (select min(s.created_at) from sira s
             where s.cid = k.id and s.kum > s.toplam - k.bakiye + 0.005)
         end,
         (select max(b.created_at) from borc b where b.cid = k.id),
         (select max(t.created_at) from tahsil t where t.cid = k.id),
         (select count(*)::int from borc b where b.cid = k.id),
         coalesce((select bg.tutar from bugun bg where bg.cid = k.id), 0)
    from k
   order by (k.bakiye > 0.005) desc, 5 nulls last, k.bakiye desc;
$fn$;

comment on function public.nip_borclular() is
  'Borcu olan kisiler ve borcunu bugun odeyenler: bakiye, ilk odenmemis borcun tarihi, son borc, son tahsilat, bugunku tahsilat. Yalniz personel.';

revoke all on function public.nip_borclular() from anon, public;
grant execute on function public.nip_borclular() to authenticated;

-- ----------------------------------------------------------------------------
-- 9) nip_borc_ekstre — kisi bazinda defter
-- ----------------------------------------------------------------------------
-- tur: 'borc' (kasada borca yazildi), 'tahsilat', 'geri_alma', 'af',
-- 'geri_yaz'. tutar her zaman pozitif; yon tur'den okunur.
-- Borc satiri: siparis_tarihi hesabin ACILDIGI an (musteri "neyin parasi?"
-- diye sorunca tanidigi gun). aciklama o odemenin kapattigi kalemler:
--   * kalem secilerek odendiyse payment_items'tan;
--   * secilmediyse siparisin, BASKA odemelerin kapatmadigi kalemleri. Bolunmus
--     hesapta kalanin tamami borca yazildiginda diger kisinin odedigi kalem
--     dokume girmesin (inceleme bulgusu). Kalem secilmeyen odeme hesabin
--     kalaninin tamamini kapatir; onceki odemelerin hepsinde payment_items
--     vardir. Bu yuzden cikarma kesindir.
-- duzeltildi: tahsilat sonradan geri alindi ya da borcu geri yazildi.
create or replace function public.nip_borc_ekstre(p_customer_id uuid)
returns table (
  tarih          timestamptz,
  tur            text,
  tutar          numeric,
  aciklama       text,
  yontem         text,
  personel       text,
  kayit_id       uuid,
  duzeltildi     boolean,
  siparis_tarihi timestamptz,
  payment_id     uuid)
language sql
stable
set search_path to 'public'
as $fn$
  select x.tarih, x.tur, x.tutar, x.aciklama, x.yontem, x.personel, x.kayit_id,
         x.duzeltildi, x.siparis_tarihi, x.payment_id
    from (
      select p.created_at as tarih, 'borc'::text as tur, p.amount as tutar,
             coalesce(
               (select string_agg(oi.product_name || case when pi.adet > 1 then ' ×' || pi.adet else '' end,
                                  ', ' order by oi.created_at)
                  from public.payment_items pi
                  join public.order_items oi on oi.id = pi.order_item_id
                 where pi.payment_id = p.id),
               (select string_agg(oi.product_name || case when x2.adet > 1 then ' ×' || x2.adet else '' end,
                                  ', ' order by oi.created_at)
                  from public.order_items oi
                  cross join lateral (
                    select coalesce(oi.quantity, 0)
                           - coalesce((select sum(pi2.adet) from public.payment_items pi2
                                        where pi2.order_item_id = oi.id and pi2.payment_id <> p.id), 0) as adet
                  ) x2
                 where oi.order_id = p.order_id and x2.adet > 0)
             ) as aciklama,
             'debt'::text as yontem, s.name as personel, p.id as kayit_id, false as duzeltildi,
             o.created_at as siparis_tarihi, null::uuid as payment_id
        from public.payments p
        join public.orders o on o.id = p.order_id
        left join public.staff s on s.id = p.staff_id
       where p.method = 'debt'
         and coalesce(p.customer_id, o.customer_id) = p_customer_id
      union all
      select p.created_at,
             case when p.geri_alinan_id is not null then 'geri_alma' else 'tahsilat' end,
             abs(p.amount), p.note, p.method::text, s.name, p.id,
             (exists (select 1 from public.payments g where g.geri_alinan_id = p.id)
              or exists (select 1 from public.borc_duzeltme d where d.payment_id = p.id)),
             null::timestamptz, p.geri_alinan_id
        from public.payments p
        left join public.staff s on s.id = p.staff_id
       where p.order_id is null and p.customer_id = p_customer_id
      union all
      select d.created_at, d.tur, abs(d.tutar), d.reason, null, s.name, d.id, false,
             null::timestamptz, d.payment_id
        from public.borc_duzeltme d
        left join public.staff s on s.id = d.staff_id
       where d.customer_id = p_customer_id
    ) x
   where public.is_staff()
   order by x.tarih, x.kayit_id;
$fn$;

comment on function public.nip_borc_ekstre(uuid) is
  'Bir kisinin borc defteri: borclar, tahsilatlar, geri almalar ve duzeltmeler, tarih sirasiyla. Yalniz personel.';

revoke all on function public.nip_borc_ekstre(uuid) from anon, public;
grant execute on function public.nip_borc_ekstre(uuid) to authenticated;
