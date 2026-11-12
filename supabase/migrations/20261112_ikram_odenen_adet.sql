-- ============================================================
-- IKRAM SAYIMI: 0 TL'lik odeme satiri ikrami gizlemesin
-- ============================================================
-- Sorun (bagimsiz inceleme, 11 Kasim): kasada "Kim ne ödüyor?" listesinde
-- ikram kalemi de secilebiliyor. nip_odeme_al secilen her kalemi
-- payment_items'a yazar; ikram kaleminin tutari 0'dir. Ikram raporu ve
-- "ikram olarak kapat" degeri "adet - odenmis adet" diye sayiyordu: boyle bir
-- ikram 0 adet / 0 TL gorunuyor, sahibin listesinde eksik cikiyordu.
--
-- Cozum: yalniz PARAYLA odenmis adet dusulur (payment_items.tutar > 0).
-- Hesap toplami hesabi degismedi (orada odenen tutar zaten ayri toplanir).
--
-- Yalniz iki fonksiyon yeniden tanimlanir; tablo, veri, yetki degismez.

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
  select s.id, s.name, s.role::text as role, s.store_ids into v_staff
    from public.staff s
   where s.auth_id = (select auth.uid()) and s.is_active
   limit 1;
  if v_staff.id is null then
    raise exception 'ikram: yetkisiz';
  end if;
  -- Hesap duzeltme fonksiyonlariyla ayni kural (20261013_hesap_duzeltme.sql).
  if v_staff.role in ('viewer', 'kitchen') then
    raise exception 'ikram: % rolu hesap kapatamaz', v_staff.role;
  end if;

  -- Hesabi KILITLE: iki kasiyer ayni anda kapatamaz, araya urun de giremez
  -- (yeni kalemin yabanci anahtar denetimi bu kilidi bekler).
  select * into o from public.orders where id = p_order_id for update;
  if not found then raise exception 'ikram: hesap bulunamadi'; end if;
  if o.status::text = 'paid' then
    raise exception 'ikram: bu hesap zaten kapatilmis';
  end if;
  if o.status::text = 'cancelled' then
    raise exception 'ikram: iptal edilmis hesap kapatilamaz';
  end if;
  -- Fonksiyon sahibin yetkisiyle calisir (satir guvenligi devrede degil):
  -- magaza denetimi bos degere karsi da KAPALI olmali.
  if not coalesce(o.origin_store_id = any(coalesce(v_staff.store_ids, '{}'::uuid[])), false) then
    raise exception 'ikram: bu magaza icin yetkin yok';
  end if;

  -- Kalemleri de KILITLE: hesap kilidi order_items satirlarini kapsamaz.
  -- Baska cihaz denetimle kapatma arasinda ikrami geri alirsa (fiyat geri
  -- gelir) hesap tahsilatsiz kapanirdi.
  perform 1 from public.order_items oi where oi.order_id = p_order_id for update;

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
  -- Kalem secilerek ODENMIS adetler ODENDIGI tutardan sayilir (payment_items):
  -- "3 bira, biri odendi, kalan ikram" hesabinda satirin fiyati 0 olur ama
  -- alinan para cirodan dusmemeli.
  select coalesce(sum(
           oi.final_price * greatest(0, oi.quantity - coalesce(pi.adet, 0))
           + coalesce(pi.tutar, 0)), 0)
    into v_toplam
    from public.order_items oi
    left join lateral (
      select sum(x.adet) as adet, sum(x.tutar) as tutar
        from public.payment_items x
       where x.order_item_id = oi.id
    ) pi on true
   where oi.order_id = p_order_id;
  update public.orders
     set subtotal = v_toplam, total = v_toplam
   where id = p_order_id;

  select * into v_sonuc
    from public.nip_odeme_al(p_order_id, 'cash', 0, null, false, null, null, null);
  if not coalesce(v_sonuc.kapandi, false) then
    raise exception 'ikram: hesap kapanmadi (kalan TL %)', round(coalesce(v_sonuc.kalan, 0));
  end if;

  -- Ikram degeri: PARAYLA odenmis adetler ikram degildir. 0 TL'lik odeme
  -- satiri (ikram kalemi kalem secilerek 'odendi' isaretlenmis) para degildir.
  select coalesce(sum(coalesce(oi.product_price, 0)
                      * greatest(0, oi.quantity - coalesce(pi.adet, 0))), 0),
         string_agg(distinct s.name, ', ')
    into v_deger, v_adlar
    from public.order_items oi
    left join public.staff s on s.id = oi.treated_by
    left join lateral (
      select sum(x.adet) filter (where x.tutar > 0) as adet
        from public.payment_items x where x.order_item_id = oi.id
    ) pi on true
   where oi.order_id = p_order_id and coalesce(oi.is_treat, false);

  insert into public.ikram_izi(store_id, order_id, islem, quantity, deger,
                               veren_id, veren_ad, yapan_id, yapan_ad)
  values (o.origin_store_id, p_order_id, 'kapat', v_kalem, v_deger,
          v_veren_id, v_adlar, v_staff.id, v_staff.name);

  return json_build_object('ok', true, 'deger', v_deger, 'verenler', v_adlar, 'urun', v_kalem);
end $function$;

revoke all on function public.nip_ikram_kapat(uuid, uuid) from public, anon;
grant execute on function public.nip_ikram_kapat(uuid, uuid) to authenticated;

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
         -- PARAYLA odenmis adet ikram degildir (kalem secilerek odeme);
         -- tutari 0 olan odeme satiri sayilmaz.
         greatest(0, oi.quantity - coalesce(pi.adet, 0))::integer,
         (coalesce(oi.product_price, 0) * greatest(0, oi.quantity - coalesce(pi.adet, 0)))::numeric,
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
    left join lateral (
      select sum(x.adet) filter (where x.tutar > 0) as adet
        from public.payment_items x where x.order_item_id = oi.id
    ) pi on true
   where coalesce(oi.is_treat, false)
     and oi.created_at >= p_from and oi.created_at < p_to
     and o.status::text <> 'cancelled'
   order by 3 desc;
end $function$;

revoke all on function public.nip_ikram_raporu(timestamptz, timestamptz) from public, anon;
grant execute on function public.nip_ikram_raporu(timestamptz, timestamptz) to authenticated;
