-- ============================================================================
-- KASA FARKI GERCEGE YAZILSIN                       20260913_kasa_farki_indirim
-- ============================================================================
-- SORUN
-- Kasada hesaptan dusuk tutar yazilinca (400'luk hesap 370 tahsil) tek iz
-- payments.note'taki serbest metindi. orders.total ve order_items.final_price
-- tam fiyatta kaliyordu: ciro raporu, urun karliligi, personel ligi ve doner
-- mutfagi hakedisi hepsi 400 goruyor, kasaya 370 giriyordu. Canli olcum (son
-- 30 gun): notlu 29 tahsilat, toplam TL 17.001 fark; notlarin cogu "Indirim",
-- "Hh", "Happy hour". Kalem indirimi (manual_discount) var ama tum zamanlarda
-- SIFIR kez kullanildi — kasiyer indirimi kalemde degil odeme aninda yapiyor.
--
-- Ayrica farklarin hepsi indirim degil: "Euro alindi" (kur yuvarlamasi),
-- "210t odendi" (eksik tahsilat), "Sea me ye gitti" (mal baska yere gitti).
-- Bunlarda hesap DEGISMEMELI; acik kalan tutar not olarak durmali.
--
-- COZUM
-- nip_odeme_al'a 7. parametre: p_fark_turu ('indirim' | 'eksik' | 'bahsis' |
-- 'diger'). Kasiyer farkin NE oldugunu soyler:
--   indirim : fark, uygun kalemlere (ikram degil, fiyati > 0) tutarlariyla
--             orantili dagitilir -> manual_discount/final_price guncellenir,
--             orders.subtotal = total = odenen, discount_amount += fark.
--             Kalem tetigi (trg_indirim_denetim) discount_audit'e kim/ne kadar
--             yazar; boylece kasa indirimi de sahibin denetimine girer.
--   eksik / bahsis / diger : bugunku davranis — hesap dokunulmaz, yalniz
--             payments.note yazilir; not turle onek alir ("eksik: 210t odendi")
--             ki raporlar ayirabilsin.
-- Tur verilmezse (eski istemci) tutar dusukse 'indirim', fazlaysa 'bahsis'
-- sayilir — canli veride en sik durum bu; eski frontend calismaya devam eder.
--
-- Yuvarlama: kalem payi 2 ondalik; SON uygun kalem kalani alir ki dagitilan
-- toplam farka esit olsun. Adet basina birim = pay / adet (2 ondalik); adet > 1
-- olan kalemde kurus duzeyinde sapma olabilir (33.33 x 3 = 99.99), kabul.
--
-- DROP + CREATE: parametre eklemek yeni overload yaratirdi; 6 parametreli imza
-- kalsaydi PostgREST cagrilari belirsizlesirdi. Yeni parametre default'lu.
--
-- Geri alma:
--   drop function if exists public.nip_odeme_al(uuid, text, numeric, uuid, boolean, text, text);
--   -- 20260828_tutar_kilidi_ve_pos_gunsonu.sql'deki 6 parametreli hali geri yukle
--   -- (dagitilmis indirimler kalemlerde kalir; discount_audit izleri durur)
-- ============================================================================

drop function if exists public.nip_odeme_al(uuid, text, numeric, uuid, boolean, text);

create or replace function public.nip_odeme_al(
  p_order_id    uuid,
  p_method      text,
  p_amount      numeric,
  p_customer_id uuid    default null,
  p_use_points  boolean default false,
  p_fark_nedeni text    default null,
  p_fark_turu   text    default null)
returns table (tahsil numeric, puan numeric, kalan_borc numeric)
language plpgsql
set search_path to 'public'
as $$
declare
  o           record;
  v_staff     record;
  v_uye       uuid;
  v_borc      numeric := 0;
  v_fark_var  boolean := false;
  v_tur       text;
  v_neden     text;
  v_not       text;
  v_fark      numeric := 0;      -- indirimde hesaptan dusulen toplam
  v_taban     numeric := 0;      -- uygun kalemlerin toplami (dagitim tabani)
  v_dagitilan numeric := 0;
  v_son_id    uuid;
  v_pay       numeric;
  v_birim     numeric;
  k           record;
  v_subtotal  numeric;
  v_total     numeric;
  v_indirim   numeric;
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

  v_subtotal := o.subtotal;
  v_total    := o.total;
  v_indirim  := o.discount_amount;
  v_neden    := nullif(btrim(coalesce(p_fark_nedeni, '')), '');

  -- TUTAR KILIDI: hesap toplamindan farkli tutar ancak gerekceyle gecer.
  -- Puanli odemede beklenen tutar burada bilinemez (puan dusumu tetikleyicide),
  -- o yol muaf. Fark tespiti degil BEYAN istiyoruz: 40 lira fazlanin bahsis mi
  -- yanlis tus mu oldugunu ancak o an oradaki kisi bilir.
  v_fark_var := coalesce(p_amount, 0) > 0
                and not coalesce(p_use_points, false)
                and p_amount <> coalesce(o.total, 0);

  if v_fark_var and (v_neden is null or length(v_neden) < 2) then
    raise exception 'odeme: tutar hesaptan farkli (hesap TL %, girilen TL %) — fark nedenini yaz',
      round(coalesce(o.total, 0)), round(p_amount);
  end if;

  if v_fark_var then
    -- Tur verilmediyse (eski istemci) canli verideki en sik durum varsayilir.
    v_tur := coalesce(p_fark_turu,
                      case when p_amount < coalesce(o.total, 0) then 'indirim' else 'bahsis' end);

    if v_tur = 'indirim' then
      if p_amount >= coalesce(o.total, 0) then
        raise exception 'odeme: indirim icin girilen tutar hesaptan kucuk olmali (hesap TL %, girilen TL %) — fazlaysa "bahsis" sec',
          round(coalesce(o.total, 0)), round(p_amount);
      end if;

      -- Dagitim tabani: ikram olmayan, fiyati ve adedi pozitif kalemler.
      select coalesce(sum(oi.final_price * oi.quantity), 0)
        into v_taban
        from public.order_items oi
       where oi.order_id = p_order_id
         and not coalesce(oi.is_treat, false)
         and oi.final_price > 0 and coalesce(oi.quantity, 0) > 0;
      if v_taban <= 0 then
        raise exception 'odeme: indirim dagitilacak kalem yok (hepsi ikram ya da 0 TL) — hesabi ikram olarak kapat';
      end if;
      -- Fark KALEMLERE gore: orders.total kalem toplamindan sapmis olabilir
      -- (kasa toplami istemci yazar). Dagitilan tutar tabani asamaz; yoksa
      -- kalem toplami ile odenen ayrisirdi.
      if p_amount >= v_taban then
        raise exception 'odeme: indirim icin girilen tutar kalem toplamindan kucuk olmali (kalemler TL %, girilen TL %)',
          round(v_taban), round(p_amount);
      end if;
      v_fark := v_taban - p_amount;

      -- Son uygun kalem (created_at, id sirasinda) kalani alir: yuvarlama
      -- kirintilari birikip toplami kacirmasin.
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
        -- Adet basina indirim; kalemin fiyatini asamaz (final_price >= 0 kurali).
        -- Dagitilan, NIYET degil fiilen uygulanan (birim x adet): son kalem
        -- gercek kalani alir, yuvarlama kirintisi birikmez.
        v_birim := least(round(v_pay / k.quantity, 2), k.final_price);
        v_dagitilan := v_dagitilan + v_birim * k.quantity;

        -- Kalem guncellemesi PAID guncellemesinden ONCE: trg_indirim_denetim
        -- (SECURITY DEFINER, auth.uid()) discount_audit'e iz yazar;
        -- trg_mutfak_kalem_upd final_price degisince kart toplamini yeniden
        -- kurar — kendi icinde exception yakalar, beklenen davranis.
        update public.order_items
           set manual_discount = coalesce(manual_discount, 0) + v_birim,
               final_price     = greatest(0, final_price - v_birim),
               discount_note   = coalesce(v_neden, discount_note)
         where id = k.id;
      end loop;

      -- Hesap artik odenen tutari soyler: ciro, karlilik, lig ve hakedis
      -- hepsi ayni sayiyi gorur. Indirim ayri kolonda tutulur ki kaybolmasin.
      v_subtotal := p_amount;
      v_total    := p_amount;
      v_indirim  := coalesce(o.discount_amount, 0) + v_fark;
      v_not      := 'indirim: ' || v_neden;
    else
      -- eksik / bahsis / diger: hesap dokunulmaz, not turle oneklenir.
      v_not := case v_tur when 'eksik' then 'eksik: ' when 'bahsis' then 'bahşiş: ' else 'diğer: ' end
               || v_neden;
    end if;
  else
    v_not := v_neden;
  end if;

  -- Siparis zaten bir uyeye bagliysa (QR ile giris) kasiyer ustune yazamaz.
  v_uye := coalesce(o.customer_id, p_customer_id);

  if p_method = 'debt' then
    if v_uye is null then raise exception 'odeme: borc icin kisi secilmeli'; end if;
    update public.customers
       set outstanding_balance = coalesce(outstanding_balance, 0) + p_amount
     where id = v_uye
     returning outstanding_balance into v_borc;
    if not found then raise exception 'odeme: kisi bulunamadi ya da yetki yok'; end if;
  end if;

  -- Puan tutarin tamamini karsiladiysa tahsilat 0 olabilir; bos satir atilmaz.
  if coalesce(p_amount, 0) > 0 then
    insert into public.payments(order_id, amount, method, store_id, staff_id, note)
    values (p_order_id, p_amount, p_method::payment_method, o.origin_store_id, v_staff.id, v_not);
  end if;

  -- staff_id: tahsil eden damgalanir ki satis "personelsiz" kalmasin; ama
  -- siparisi acan garson varsa o korunur, kasiyer ezmez. Toplamlar ayni
  -- UPDATE'te: puan tetigi (fn_award_member_points) 'paid' gecisinde new.total
  -- okur, indirimli tutari gormeli.
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

  return query
    select coalesce(p_amount, 0),
           (select coalesce(x.points_used, 0) from public.orders x where x.id = p_order_id),
           v_borc;
end $$;

comment on function public.nip_odeme_al(uuid, text, numeric, uuid, boolean, text, text) is
  'Tahsilati tek islemde alir: payments satiri + siparis kapatma + borc bakiyesi. '
  'Tutar hesap toplamindan farkliysa fark nedeni zorunlu; p_fark_turu farkin ne '
  'oldugunu soyler: indirim -> kalemlere dagitilir, orders.total odenen olur, '
  'discount_amount birikir, discount_audit iz tutar; eksik/bahsis/diger -> hesap '
  'dokunulmaz, payments.note turle oneklenir. Tur yoksa dusuk=indirim, fazla=bahsis. '
  'Siparisi kilitler.';

revoke all on function public.nip_odeme_al(uuid, text, numeric, uuid, boolean, text, text) from anon, public;
grant execute on function public.nip_odeme_al(uuid, text, numeric, uuid, boolean, text, text) to authenticated;
