-- ============================================================================
-- MUTFAK MENUSU -> NIP SENKRONU                     20261024_mutfak_menu_senkron
-- ============================================================================
-- Sahip (24.10): "Doner tarafindan cilbiri cikardim, sucuklu yumurtayi 350
-- yapip donerli yumurta olarak ekledim; NIP tarafina gecmemis."
--
-- Iki menu var: mutfak uygulamasinin kendi listesi (kitchen_menu; fiyatin
-- sahibi orasi) ve NIP'teki kopya (products, DONER magazasi, Paris menusunde
-- gorunen kategoriler). Bugune kadar yalniz "tukendi" bilgisi geciyordu
-- (nip_mutfak_stok_esitle, AD ile eslesme). Ad degisince eslesme kopuyor,
-- fiyat degisikligi hic gecmiyordu.
--
-- Simdi:
--   products.kitchen_menu_id  — kalici baglanti (mutfak satirinin id'si)
--   nip_mutfak_menu_uygula    — baglantili urune fiyat, acik/kapali, uc dilde ad
--   nip_mutfak_menu_yeni      — mutfaga eklenen yemek NIP'e de eklenir
--                                (kitchen -> Brunch acik; doner -> Doner, secenekler
--                                 tanimlanana kadar kapali)
--   trg_mutfak_menu_senkron   — kitchen_menu insert/update/delete tetigi; her
--                                adim hatayi yutar (mutfak uygulamasi bozulmaz)
--   nip-mutfak-menu-esitle    — 15 dk'da bir emniyet taramasi
--   Silinen mutfak satiri NIP'te SILINMEZ, satistan kapatilir (gecmis kalir).
--   Her degisiklik yoneticiye Telegram ile kisa not olarak gider.
--
-- Kafe tarafi: yalniz DONER magazasinin urunleri dokunulur
-- (store_id = mutfak_koprusu.kitchen_store_id). Hicbir nesne kaldirilmaz.
-- ============================================================================

alter table public.products add column if not exists kitchen_menu_id text;
create index if not exists ix_products_kitchen_menu on public.products (kitchen_menu_id) where kitchen_menu_id is not null;
comment on column public.products.kitchen_menu_id is
  'Doner mutfagi menusundeki satirin id''si (kitchen_menu.id). Dolu ise fiyat/ad/tukendi oradan senkronlanir.';

-- ----------------------------------------------------------------------------
-- Baglantilari kur: mutfaga giden DONER urunleri, ad ya da Ingilizce adla.
-- ----------------------------------------------------------------------------
update public.products p
   set kitchen_menu_id = km.id
  from public.kitchen_menu km
 where p.kitchen_menu_id is null
   and p.store_id = 'c39da530-7f73-4f69-a752-029bf03790b1'
   and upper(km.name) in (upper(p.name), upper(coalesce(p.name_en, '')));

-- Sahibin yeniden adlandirdigi urun: NIP "Donerli Yumurta" <-> mutfak sucuklu_yumurta
update public.products
   set kitchen_menu_id = 'sucuklu_yumurta'
 where id = '091cb0e8-acce-4597-8254-00bb4685333c' and kitchen_menu_id is null;

-- ----------------------------------------------------------------------------
-- Mutfak satiri duzeltmesi (sahip 24.10): ad, fiyat, acik; uc dilde ad.
-- Tetik henuz yok; NIP tarafi zaten ayni degerlerde.
-- ----------------------------------------------------------------------------
update public.kitchen_menu
   set name = 'EGGS WITH DÖNER', price = 350, available = true,
       names = jsonb_build_object('tr', 'Dönerli Yumurta', 'en', 'Eggs with Döner', 'ru', 'Яичница с донером'),
       descs = jsonb_build_object('tr', 'Dönerli yumurta; tavada.', 'en', 'Eggs with döner; pan-cooked.', 'ru', 'Яичница с донером; на сковороде.')
 where id = 'sucuklu_yumurta';

-- ----------------------------------------------------------------------------
-- Yoneticiye kisa not (kuyruk + tekrar: nip_tg_gonder). Hata yutulur.
-- ----------------------------------------------------------------------------
create or replace function public.nip_mutfak_menu_not(p_metin text)
returns void language plpgsql security definer set search_path = public as $$
declare k record;
begin
  for k in select sf.telegram_chat_id from public.staff sf
            where sf.is_active and sf.role = 'admin' and sf.telegram_chat_id is not null loop
    perform public.nip_tg_gonder(k.telegram_chat_id, p_metin, 'mutfak_menu');
  end loop;
exception when others then null;
end $$;

-- ----------------------------------------------------------------------------
-- Mutfak satiri -> baglantili NIP urunleri: fiyat, acik/kapali, adlar.
-- Donen metin: 'ayni' | 'yok' | 'kapali' | degisiklik ozeti ("fiyat ₺300 → ₺350, ...")
-- ----------------------------------------------------------------------------
create or replace function public.nip_mutfak_menu_uygula(p_id text)
returns text language plpgsql security definer set search_path = public as $$
declare
  km record; p record; v_cfg jsonb; v_kitchen uuid;
  v_degis text[] := '{}'; v_tr text; v_en text; v_ru text; v_acik boolean;
begin
  v_cfg := public.nip_mutfak_cfg('c3c6e0c7-1821-4edd-993d-ad960cfbc452');
  if v_cfg is null or coalesce(v_cfg ->> 'enabled', 'false') <> 'true' then return 'kapali'; end if;
  v_kitchen := (v_cfg ->> 'kitchen_store_id')::uuid;

  select * into km from public.kitchen_menu where id = p_id;
  if not found then return 'yok'; end if;
  v_acik := coalesce(km.available, true);
  v_tr := nullif(btrim(km.names ->> 'tr'), '');
  v_en := nullif(btrim(km.names ->> 'en'), '');
  v_ru := nullif(btrim(km.names ->> 'ru'), '');

  for p in select * from public.products where kitchen_menu_id = p_id and store_id = v_kitchen loop
    -- Fiyat: mutfak uygulamasi fiyatin sahibi (TL urunlerde; EUR urun yok ama kapi dursun)
    if km.price is not null and km.price > 0 and coalesce(p.currency, 'TRY') = 'TRY'
       and p.price is distinct from km.price::numeric then
      update public.products set price = km.price, updated_at = now() where id = p.id;
      v_degis := v_degis || ('fiyat ₺' || round(p.price)::text || ' → ₺' || km.price::text);
    end if;
    -- Acik/kapali: mutfakta tukendi
    if coalesce(p.sold_out_today, false) is distinct from (not v_acik) then
      update public.products
         set sold_out_today = not v_acik,
             unavailable_reason = case when v_acik then null else 'Mutfakta tükendi' end,
             updated_at = now()
       where id = p.id;
      v_degis := v_degis || (case when v_acik then 'satışa açıldı' else 'mutfakta tükendi' end);
    end if;
    -- Adlar: mutfak uc dilde ad yazdiysa NIP onu kullanir
    if v_tr is not null and p.name is distinct from v_tr then
      update public.products
         set name = v_tr, name_en = coalesce(v_en, p.name_en), name_ru = coalesce(v_ru, p.name_ru), updated_at = now()
       where id = p.id;
      v_degis := v_degis || ('ad ' || p.name || ' → ' || v_tr);
    elsif v_en is not null and p.name_en is distinct from v_en then
      update public.products set name_en = v_en, name_ru = coalesce(v_ru, p.name_ru), updated_at = now() where id = p.id;
      v_degis := v_degis || ('İngilizce ad → ' || v_en);
    end if;
  end loop;

  if array_length(v_degis, 1) > 0 then return array_to_string(v_degis, ', '); end if;
  return 'ayni';
end $$;

-- ----------------------------------------------------------------------------
-- Mutfaga eklenen yemek NIP'e de eklenir. Donen: yeni urun id'si ya da null.
-- kitchen -> Brunch (acik); doner -> Doner (secenekler tanimlanana kadar KAPALI;
-- protein/sos secimi olmadan siparis mutfaga eksik gider). Diger bolumler
-- (drink, garnish, sauce) NIP'e eklenmez.
-- ----------------------------------------------------------------------------
create or replace function public.nip_mutfak_menu_yeni(p_id text)
returns uuid language plpgsql security definer set search_path = public as $$
declare km record; v_cfg jsonb; v_kitchen uuid; v_kat uuid; v_kat_ad text; v_pid uuid; v_tr text; v_en text; v_ru text;
begin
  v_cfg := public.nip_mutfak_cfg('c3c6e0c7-1821-4edd-993d-ad960cfbc452');
  if v_cfg is null or coalesce(v_cfg ->> 'enabled', 'false') <> 'true' then return null; end if;
  v_kitchen := (v_cfg ->> 'kitchen_store_id')::uuid;
  select * into km from public.kitchen_menu where id = p_id;
  if not found then return null; end if;
  if exists (select 1 from public.products where kitchen_menu_id = p_id) then return null; end if;
  v_kat_ad := case km.section when 'kitchen' then 'Brunch' when 'doner' then 'Döner' else null end;
  if v_kat_ad is null then return null; end if;
  select c.id into v_kat from public.categories c
   where c.store_id = v_kitchen and c.is_active and c.name = v_kat_ad
   order by c.sort_order limit 1;
  if v_kat is null then return null; end if;
  v_tr := coalesce(nullif(btrim(km.names ->> 'tr'), ''), initcap(lower(km.name)));
  v_en := coalesce(nullif(btrim(km.names ->> 'en'), ''), initcap(lower(km.name)));
  v_ru := nullif(btrim(km.names ->> 'ru'), '');
  insert into public.products
    (name, name_en, name_ru, price, category_id, store_id, kitchen_destination_store_id, kitchen_consignment,
     is_available, sold_out_today, unavailable_reason, sort_order, kitchen_menu_id, track_stock, currency, has_options)
  values
    (v_tr, v_en, v_ru, coalesce(km.price, 0), v_kat, v_kitchen, v_kitchen, true,
     km.section = 'kitchen', not coalesce(km.available, true),
     case when coalesce(km.available, true) then null else 'Mutfakta tükendi' end,
     coalesce(km.sort, 100), km.id, false, 'TRY', false)
  returning id into v_pid;
  return v_pid;
end $$;

-- ----------------------------------------------------------------------------
-- Tetik: her adim kendi try/catch'inde; mutfak uygulamasinin kaydi hic bozulmaz.
-- ----------------------------------------------------------------------------
create or replace function public.nip_mutfak_trg_menu_senkron()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_sonuc text; v_pid uuid; v_adi text; v_bulundu boolean;
begin
  begin
    if tg_op = 'INSERT' then
      if new.section in ('kitchen', 'doner') then
        v_pid := public.nip_mutfak_menu_yeni(new.id);
        if v_pid is not null then
          select name into v_adi from public.products where id = v_pid;
          perform public.nip_mutfak_menu_not(
            '🍳 Mutfak menüsüne yeni ürün: ' || coalesce(new.name, '?') || ' ₺' || coalesce(new.price::text, '-') || E'\n'
            || 'NIP menüsüne eklendi: ' || coalesce(v_adi, '?')
            || case when new.section = 'doner'
                 then E'\nSeçenekleri (protein, sos) Menü Yönetimi''nden tanımla, sonra satışa aç.'
                 else '' end);
        end if;
      end if;
    elsif tg_op = 'UPDATE' then
      v_sonuc := public.nip_mutfak_menu_uygula(new.id);
      if v_sonuc not in ('ayni', 'yok', 'kapali') then
        perform public.nip_mutfak_menu_not('🍳 Mutfak menüsü → NIP: ' || coalesce(new.name, '?') || ' — ' || v_sonuc);
      end if;
      -- Ad degisti ama Turkce ad (names.tr) yok: NIP'teki Turkce ad elle duzeltilir
      if new.name is distinct from old.name and nullif(btrim(new.names ->> 'tr'), '') is null then
        perform public.nip_mutfak_menu_not(
          '🍳 Mutfak menüsünde ad değişti: ' || coalesce(old.name, '?') || ' → ' || coalesce(new.name, '?') || E'\n'
          || 'NIP''teki Türkçe ad değişmedi. Gerekiyorsa Menü Yönetimi''nden düzelt.');
      end if;
    elsif tg_op = 'DELETE' then
      update public.products set is_available = false, updated_at = now()
       where kitchen_menu_id = old.id and is_available;
      get diagnostics v_bulundu = row_count;
      if v_bulundu then
        perform public.nip_mutfak_menu_not(
          '🍳 Mutfak menüsünden silindi: ' || coalesce(old.name, '?') || E'\n' || 'NIP''te satıştan kapatıldı (silinmedi, geçmiş satışlar kalır).');
      end if;
    end if;
  exception when others then
    begin perform public.nip_mutfak_log('menu', tg_op, null, null, false, sqlerrm); exception when others then null; end;
  end;
  return null;
end $$;

create or replace trigger trg_mutfak_menu_senkron
after insert or update of name, names, price, available or delete on public.kitchen_menu
for each row execute function public.nip_mutfak_trg_menu_senkron();

-- ----------------------------------------------------------------------------
-- Tukendi esitleme: once baglanti, yoksa ad (eski davranis). 20260913 govdesi + baglanti.
-- ----------------------------------------------------------------------------
create or replace function public.nip_mutfak_stok_esitle()
returns integer language plpgsql security definer set search_path = public as $$
declare v_cfg jsonb; v_kitchen uuid; n int := 0;
begin
  v_cfg := public.nip_mutfak_cfg('c3c6e0c7-1821-4edd-993d-ad960cfbc452');
  if v_cfg is null or coalesce(v_cfg ->> 'enabled', 'false') <> 'true' then return 0; end if;
  v_kitchen := (v_cfg ->> 'kitchen_store_id')::uuid;
  update public.products p
     set sold_out_today = not km.available,
         unavailable_reason = case when km.available then null else 'Mutfakta tükendi' end
    from public.kitchen_menu km
   where p.kitchen_destination_store_id = v_kitchen
     and (p.kitchen_menu_id = km.id
          or (p.kitchen_menu_id is null and upper(km.name) in (upper(p.name), upper(coalesce(p.name_en, '')))))
     and (coalesce(p.sold_out_today, false) is distinct from (not km.available));
  get diagnostics n = row_count;
  return n;
end $$;

-- ----------------------------------------------------------------------------
-- Emniyet taramasi: tetik kacirdiysa 15 dk icinde esitlenir.
-- ----------------------------------------------------------------------------
create or replace function public.nip_mutfak_menu_esitle()
returns integer language plpgsql security definer set search_path = public as $$
declare r record; n int := 0; v_s text;
begin
  for r in select distinct p.kitchen_menu_id as id from public.products p where p.kitchen_menu_id is not null loop
    begin
      v_s := public.nip_mutfak_menu_uygula(r.id);
      if v_s not in ('ayni', 'yok', 'kapali') then
        n := n + 1;
        perform public.nip_mutfak_menu_not('🍳 Mutfak menüsü → NIP (tarama): ' || r.id || ' — ' || v_s);
      end if;
    exception when others then null;
    end;
  end loop;
  return n;
end $$;

select cron.unschedule(jobid) from cron.job where jobname = 'nip-mutfak-menu-esitle';
select cron.schedule('nip-mutfak-menu-esitle', '*/15 * * * *', $$select public.nip_mutfak_menu_esitle()$$);

revoke all on function public.nip_mutfak_menu_not(text) from anon, public;
revoke all on function public.nip_mutfak_menu_uygula(text) from anon, public;
revoke all on function public.nip_mutfak_menu_yeni(text) from anon, public;
revoke all on function public.nip_mutfak_menu_esitle() from anon, public;
revoke all on function public.nip_mutfak_trg_menu_senkron() from anon, public;
revoke all on function public.nip_mutfak_stok_esitle() from anon, public;
