-- ============================================================================
-- DONER MUTFAGI KOPRUSU                              20260913_doner_mutfak_koprusu
-- ============================================================================
-- SAHIP (2026-09-12): "QR'dan verilen siparislerdeki doner urunleri doner
-- mutfaginin kendi ekranina Not in Paris siparisi olarak dussun, onlar da
-- bizden ne aldigimizi gorsun; garson her seferinde arkaya gidip soylemesin."
--
-- DURUM ONCESI: son 30 gunde NIP'ten giden 14 doner kalemi 'pending'de kaldi;
-- doner mutfagi NIP'in Mutfak ekranini kullanmiyor, kendi uygulamasi var
-- (nip-kitchen.netlify.app; ayni veritabani, kitchen_orders / kitchen_menu).
-- Garson sozlu soyluyordu.
--
-- PROVA (2026-09-12 19:15): kitchen_orders'a elle basilan 'new' kart panoya
-- yenilemeden dustu; ascinin "Hazir" dugmesi PATCH ?id=eq.<id> ile YALNIZ
-- status='done' yaziyor (not/kalemler korunuyor). Yani sozlesme:
--   yeni kart  = insert status 'new'      (kart: code, customer_name, note,
--                items[{name,det,qty,price}], total, lang)
--   asci bitti = update status 'done' (bazen once 'preparing')
--   kapanan    = 'archived'
--
-- TASARIM (uc bagimsiz tasarim + uc juri; kazanan "Doner Mutfagi Koprusu"):
--   * kitchen_orders ve order_items SEMASI DEGISMEZ. Kart <-> kalem esi iki
--     kucuk NIP tablosunda: nip_kitchen_cards, nip_kitchen_lines.
--   * ILERI YON: order_items'a doner hedefli, mutfaga gonderilmis kalem
--     girince kart acilir (QR toplu siparis = tek kart, tek INSERT; kasadan
--     sonraki kalemler pencere icinde ayni 'new' karta eklenir). Adet,
--     secenek, ikram, paket, not degisince kart yeniden kurulur; silme
--     karttan duser; siparis iptali karti kapatir.
--   * GERI YON: kart 'done' (ya da dogrudan 'archived') olunca bagli
--     kalemler 'ready' olur. Bu tek UPDATE mevcut tg_items_ready (garsona
--     Telegram) ve wp_items_ready (musteriye push) tetiklerini ateslar,
--     trg_stok_kalem stogu duser (NIP Mutfak ekraniyla ayni semantik).
--     Garson "Teslim edildi" deyince kart 'done' olur; "Hazir" karti
--     KAPATMAZ (asci pisirirken karsisindan kaybolmasin).
--   * PARA GERCEGI inter_company_settlement'ta kalir. Karttaki fiyat ayni
--     kural: ikram -> liste fiyati, digerleri -> final_price. Iptalde total 0.
--   * HATA KOPRUYU DURDURUR, SATISI DURDURMAZ: her tetik govdesi exception
--     yakalar, nip_mutfak_log'a yazar; 5 dk'lik onarim taramasi kacani toplar.
--   * GIZLILIK: kitchen_orders anon tarafindan okunabilir. Karta musteri adi
--     ve garson adi YAZILMAZ; baslik "NOT IN PARIS · Dis 4", masasiz siparis
--     "NOT IN PARIS · Paket". Not alanina yalniz siparis notu.
--   * GUVENLIK (juri bulgulari, bugun de acik):
--     - kitchen_orders orders_auth_update 'true' idi: NIP'e Google ile giren
--       bir uye bile kart durumunu degistirebilirdi -> artik yalniz mutfak
--       hesaplari (nip_mutfak_ortaklar) ve NIP personeli.
--     - inter_company_settlement anon dahil herkese acikti (hakedis rakami
--       anon anahtarla okunuyordu) -> security_invoker, anon'a kapali.
--   * MUTFAK TUKENDI: kitchen_menu.available=false olan urun NIP kasasinda
--     satilmaya devam ediyordu -> tek yonlu senkron: products.sold_out_today.
--   * Telegram: doner kalemleri artik panoda; NIP personeline giden "yeni
--     siparis" bildirimi doner kalemlerini atlar (cift kanal olmasin).
--
-- AYAR: app_settings 'mutfak_koprusu' (NIP magazasi). enabled=false ile
-- kopru kapanir (yeni kart acilmaz, acik kartlarin geri senkronu surer).
-- merge_window_sec=0: her kalem kendi karti (pano UPDATE'i cizmiyorsa).
--
-- GERI ALMA: dosyanin sonundaki yorumlu blok.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0) Tablolar, sekans, ayar, ortak hesaplar
-- ----------------------------------------------------------------------------
create sequence if not exists public.nip_kitchen_code_seq;

create table if not exists public.nip_kitchen_cards (
  kitchen_order_id    bigint primary key references public.kitchen_orders(id) on delete cascade,
  order_id            uuid not null references public.orders(id) on delete cascade,
  code                text not null,
  created_at          timestamptz not null default now(),
  preparing_at        timestamptz,
  done_at             timestamptz,
  cancelled_at        timestamptz,
  last_kitchen_status text,
  done_by             uuid
);
comment on table public.nip_kitchen_cards is
  'NIP siparisi <-> doner mutfagi karti (kitchen_orders) esi. Yalniz kopru fonksiyonlari yazar.';
create index if not exists nip_kitchen_cards_order_idx on public.nip_kitchen_cards(order_id, created_at desc);

create table if not exists public.nip_kitchen_lines (
  kitchen_order_id bigint not null references public.nip_kitchen_cards(kitchen_order_id) on delete cascade,
  order_item_id    uuid not null references public.order_items(id) on delete cascade,
  qty              integer not null check (qty > 0),
  created_at       timestamptz not null default now(),
  primary key (kitchen_order_id, order_item_id)
);
create index if not exists nip_kitchen_lines_item_idx on public.nip_kitchen_lines(order_item_id);

create table if not exists public.nip_mutfak_log (
  id               bigint generated by default as identity primary key,
  at               timestamptz not null default now(),
  yon              text not null,          -- ileri | geri | onarim | menu
  olay             text not null,
  order_id         uuid,
  kitchen_order_id bigint,
  ok               boolean not null default true,
  mesaj            text
);
comment on table public.nip_mutfak_log is 'Doner mutfagi koprusu izi. ok=false satirlar sabah ozetine gider.';
create index if not exists nip_mutfak_log_at_idx on public.nip_mutfak_log(at desc);

-- Mutfak tarafinin giris hesaplari: kart durumunu degistirebilen ve hakedis
-- raporunu gorebilen kimlikler. Personel satiri gerekmez.
create table if not exists public.nip_mutfak_ortaklar (
  auth_id    uuid primary key,
  ad         text,
  created_at timestamptz not null default now()
);
insert into public.nip_mutfak_ortaklar (auth_id, ad)
select u.id, u.email from auth.users u where u.email ilike '%@nipkitchen.com'
on conflict (auth_id) do nothing;

alter table public.nip_kitchen_cards   enable row level security;
alter table public.nip_kitchen_lines   enable row level security;
alter table public.nip_mutfak_log      enable row level security;
alter table public.nip_mutfak_ortaklar enable row level security;

drop policy if exists nip_kitchen_cards_personel on public.nip_kitchen_cards;
create policy nip_kitchen_cards_personel on public.nip_kitchen_cards
  for select to authenticated using (public.is_staff());
drop policy if exists nip_kitchen_lines_personel on public.nip_kitchen_lines;
create policy nip_kitchen_lines_personel on public.nip_kitchen_lines
  for select to authenticated using (public.is_staff());
drop policy if exists nip_mutfak_log_sahip on public.nip_mutfak_log;
create policy nip_mutfak_log_sahip on public.nip_mutfak_log
  for select to authenticated using (public.is_admin());
-- Ortak kendi satirini gorur (politikalarin exists kontrolu icin yeterli); sahip hepsini.
drop policy if exists nip_mutfak_ortaklar_kendi on public.nip_mutfak_ortaklar;
create policy nip_mutfak_ortaklar_kendi on public.nip_mutfak_ortaklar
  for select to authenticated using (auth_id = auth.uid() or public.is_admin());

revoke all on public.nip_kitchen_cards, public.nip_kitchen_lines, public.nip_mutfak_log, public.nip_mutfak_ortaklar from anon, authenticated;
grant select on public.nip_kitchen_cards, public.nip_kitchen_lines, public.nip_mutfak_log, public.nip_mutfak_ortaklar to authenticated;

insert into public.app_settings (key, store_id, value)
values ('mutfak_koprusu', 'c3c6e0c7-1821-4edd-993d-ad960cfbc452',
        '{"enabled": true, "kitchen_store_id": "c39da530-7f73-4f69-a752-029bf03790b1",
          "badge": "NOT IN PARIS", "code_prefix": "P-", "lang": "tr",
          "merge_window_sec": 900, "stale_ready_hours": 12, "mirror_preparing": true}'::jsonb)
on conflict (key, store_id) do update set value = excluded.value;

-- ----------------------------------------------------------------------------
-- 1) Yardimcilar
-- ----------------------------------------------------------------------------
create or replace function public.nip_mutfak_cfg(p_origin_store uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select s.value from public.app_settings s where s.key = 'mutfak_koprusu' and s.store_id = p_origin_store;
$$;

-- 'P-0K7': 3 haneli base34 (I ve O yok, sozlu okumada karismasin), sekansla artar
create or replace function public.nip_mutfak_kod(p_prefix text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_alf constant text := '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  v_n bigint := nextval('public.nip_kitchen_code_seq') % 39304;   -- 34^3
  v_s text := '';
  i int;
begin
  for i in 1..3 loop
    v_s := substr(v_alf, (v_n % 34)::int + 1, 1) || v_s;
    v_n := v_n / 34;
  end loop;
  return coalesce(p_prefix, 'P-') || v_s;
end $$;

create or replace function public.nip_mutfak_json_metin(p jsonb)
returns text language sql immutable as $$
  select case
    when p is null then null
    when jsonb_typeof(p) = 'string' then p #>> '{}'
    when jsonb_typeof(p) = 'array'  then (select string_agg(e #>> '{}', ', ') from jsonb_array_elements(p) e)
    else p::text end;
$$;

-- Kart satirindaki urun adi: mutfagin kendi menusundeki ad (istatistigi karismasin)
create or replace function public.nip_mutfak_ad(oi public.order_items)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    (select km.name from public.kitchen_menu km join public.products p on p.id = oi.product_id
      where upper(km.name) in (upper(p.name), upper(coalesce(p.name_en, ''))) limit 1),
    upper(coalesce(oi.product_name, 'ÜRÜN')));
$$;

-- 'PAKET · Döner, Cheddar, Tatziki, Soğan · Not: az acı' — mutfagin alisik oldugu virgullu dizi
create or replace function public.nip_mutfak_det(oi public.order_items)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  v_cfg jsonb; g jsonb; v_key text; v_val jsonb;
  v_sec text[] := '{}'; v_used text[] := '{}'; v_parca text[] := '{}'; v_not text;
begin
  select p.options_config into v_cfg from public.products p where p.id = oi.product_id;
  -- array_append: text[] || 'PAKET' plpgsql'de dizi literali sanilir ("malformed array literal")
  if coalesce(oi.is_takeaway, false) then v_parca := array_append(v_parca, 'PAKET'); end if;
  if oi.selected_options is not null and jsonb_typeof(oi.selected_options) = 'object' then
    for g in select * from jsonb_array_elements(coalesce(v_cfg -> 'groups', '[]'::jsonb)) loop
      v_key := g ->> 'name';
      v_val := oi.selected_options -> v_key;
      if v_val is not null and v_key is not null then
        v_used := v_used || v_key;
        v_sec := v_sec || public.nip_mutfak_json_metin(v_val);
      end if;
    end loop;
    for v_key in select e.key from jsonb_each(oi.selected_options) e where not (e.key = any (v_used)) loop
      v_sec := v_sec || public.nip_mutfak_json_metin(oi.selected_options -> v_key);
    end loop;
  end if;
  v_sec := array_remove(array_remove(v_sec, ''), null);
  if array_length(v_sec, 1) > 0 then v_parca := v_parca || array_to_string(v_sec, ', '); end if;
  if nullif(oi.variant_name, '') is not null then v_parca := v_parca || oi.variant_name; end if;
  v_not := coalesce(nullif(oi.notes, ''), nullif(oi.note, ''));
  if v_not is not null then v_parca := v_parca || ('Not: ' || v_not); end if;
  return coalesce(array_to_string(v_parca, ' · '), '');
end $$;

-- inter_company_settlement ile ayni kural: ikram -> liste fiyati, degilse final_price
create or replace function public.nip_mutfak_birim_fiyat(oi public.order_items)
returns integer language sql immutable as $$
  select round(case when coalesce(oi.is_treat, false) then coalesce(oi.product_price, 0)
                    else coalesce(oi.final_price, oi.product_price, 0) end)::int;
$$;

create or replace function public.nip_mutfak_satir(oi public.order_items, p_qty integer)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('name', public.nip_mutfak_ad(oi), 'det', public.nip_mutfak_det(oi),
                            'qty', p_qty, 'price', public.nip_mutfak_birim_fiyat(oi));
$$;

-- Kart basligi: musteri/garson adi YOK (tablo anon'a acik). Masa yoksa "Paket".
create or replace function public.nip_mutfak_baslik(p_order_id uuid, p_cfg jsonb, out customer_name text, out note text)
language sql stable security definer set search_path = public as $$
  select coalesce(p_cfg ->> 'badge', 'NOT IN PARIS') || ' · ' || coalesce(ct.name, 'Paket'),
         nullif(trim(coalesce(nullif(o.note, ''), nullif(o.notes, ''), '')), '')
    from public.orders o left join public.cafe_tables ct on ct.id = o.table_id
   where o.id = p_order_id;
$$;

create or replace function public.nip_mutfak_log(p_yon text, p_olay text, p_order uuid, p_card bigint, p_ok boolean, p_mesaj text)
returns void language sql security definer set search_path = public as $$
  insert into public.nip_mutfak_log(yon, olay, order_id, kitchen_order_id, ok, mesaj)
  values (p_yon, p_olay, p_order, p_card, p_ok, left(p_mesaj, 500));
$$;

create or replace function public.nip_mutfak_not_ekle(p_card bigint, p_text text)
returns void language sql security definer set search_path = public as $$
  update public.kitchen_orders
     set note = concat_ws(' | ', nullif(note, ''), '[' || to_char(now() at time zone 'Europe/Istanbul', 'HH24:MI') || ' ' || p_text || ']')
   where id = p_card;
$$;

-- Siparisin pencere icindeki acik ('new') karti; pencere 0 => hic birlestirme
create or replace function public.nip_mutfak_acik_kart(p_order_id uuid, p_window_sec integer)
returns bigint language sql stable security definer set search_path = public as $$
  select c.kitchen_order_id
    from public.nip_kitchen_cards c join public.kitchen_orders k on k.id = c.kitchen_order_id
   where c.order_id = p_order_id and k.status = 'new' and coalesce(p_window_sec, 0) > 0
     and c.created_at > now() - make_interval(secs => p_window_sec)
   order by c.created_at desc limit 1;
$$;

-- Karti gercege gore yeniden kur: satirlar, toplam; satir kalmadiysa kapat.
create or replace function public.nip_mutfak_kart_yenile(p_card bigint)
returns void language plpgsql security definer set search_path = public as $$
declare v_items jsonb; v_total int; v_status text;
begin
  select coalesce(jsonb_agg(public.nip_mutfak_satir(oi, l.qty) order by l.created_at, oi.created_at), '[]'::jsonb),
         coalesce(sum(l.qty * public.nip_mutfak_birim_fiyat(oi)), 0)::int
    into v_items, v_total
    from public.nip_kitchen_lines l join public.order_items oi on oi.id = l.order_item_id
   where l.kitchen_order_id = p_card;
  select status into v_status from public.kitchen_orders where id = p_card;
  if jsonb_array_length(v_items) = 0 and v_status in ('new', 'preparing') then
    perform set_config('nip.mutfak_yon', 'ileri', true);
    update public.kitchen_orders set status = 'archived', items = '[]'::jsonb, total = 0 where id = p_card;
    perform public.nip_mutfak_not_ekle(p_card, 'İPTAL — NIP');
    update public.nip_kitchen_cards set cancelled_at = coalesce(cancelled_at, now()) where kitchen_order_id = p_card;
    perform set_config('nip.mutfak_yon', '', true);
  else
    update public.kitchen_orders set items = v_items, total = v_total where id = p_card;
  end if;
end $$;

-- 'new' kartlarin basligini/notunu tazele (kasa once urun ekleyip sonra masa/not yazar)
create or replace function public.nip_mutfak_baslik_yenile(p_order_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_cfg jsonb; b record; c record;
begin
  select public.nip_mutfak_cfg(o.origin_store_id) into v_cfg from public.orders o where o.id = p_order_id;
  select * into b from public.nip_mutfak_baslik(p_order_id, v_cfg);
  for c in select k.id, k.note from public.nip_kitchen_cards nc join public.kitchen_orders k on k.id = nc.kitchen_order_id
            where nc.order_id = p_order_id and k.status = 'new' loop
    -- koseli isaretler ([12:41 EK: ...]) korunur, bas kisim yenilenir
    update public.kitchen_orders
       set customer_name = b.customer_name,
           note = nullif(concat_ws(' | ', b.note,
                    nullif((select string_agg(x, ' | ') from unnest(string_to_array(coalesce(c.note, ''), ' | ')) x where x like '[%'), '')), '')
     where id = c.id;
  end loop;
end $$;

-- Kart ac: TEK insert ile tam kart (pano yalniz INSERT dinliyorsa bile eksiksiz)
create or replace function public.nip_mutfak_kart_ac(p_order_id uuid, p_cfg jsonb, p_items jsonb, p_total integer)
returns bigint language plpgsql security definer set search_path = public as $$
declare b record; v_id bigint; v_code text;
begin
  select * into b from public.nip_mutfak_baslik(p_order_id, p_cfg);
  v_code := public.nip_mutfak_kod(p_cfg ->> 'code_prefix');
  perform set_config('nip.mutfak_yon', 'ileri', true);
  insert into public.kitchen_orders (code, customer_name, note, items, total, lang, status)
  values (v_code, b.customer_name, b.note, p_items, p_total, coalesce(p_cfg ->> 'lang', 'tr'), 'new')
  returning id into v_id;
  perform set_config('nip.mutfak_yon', '', true);
  insert into public.nip_kitchen_cards (kitchen_order_id, order_id, code) values (v_id, p_order_id, v_code);
  return v_id;
end $$;

-- CEKIRDEK: bir siparisin verilen kalemlerini karta baglar (yeni kart ya da acik karta ekleme)
create or replace function public.nip_mutfak_kalem_ekle(p_order_id uuid, p_item_ids uuid[])
returns void language plpgsql security definer set search_path = public as $$
declare
  v_cfg jsonb; v_origin uuid; v_kitchen uuid; v_ids uuid[]; v_card bigint; v_items jsonb; v_total int; v_ek text;
begin
  select o.origin_store_id into v_origin from public.orders o where o.id = p_order_id and o.status <> 'cancelled';
  if v_origin is null then return; end if;
  v_cfg := public.nip_mutfak_cfg(v_origin);
  if v_cfg is null or coalesce(v_cfg ->> 'enabled', 'false') <> 'true' then return; end if;
  v_kitchen := (v_cfg ->> 'kitchen_store_id')::uuid;

  -- yalniz kopru hedefindeki, mutfaga gonderilmis, bekleyen, henuz baglanmamis kalemler
  select array_agg(oi.id order by oi.created_at, oi.id) into v_ids
    from public.order_items oi
   where oi.id = any (p_item_ids) and oi.order_id = p_order_id
     and oi.kitchen_destination_store_id = v_kitchen and oi.kitchen_destination_store_id <> v_origin
     and coalesce(oi.sent_to_kitchen, false) and oi.kitchen_status = 'pending'
     and not exists (select 1 from public.nip_kitchen_lines l where l.order_item_id = oi.id);
  if v_ids is null then return; end if;

  -- ayni siparise es zamanli iki ekleme -> tek kart
  perform pg_advisory_xact_lock(hashtext('nip_mutfak:' || p_order_id::text));
  v_card := public.nip_mutfak_acik_kart(p_order_id, (v_cfg ->> 'merge_window_sec')::int);

  if v_card is null then
    select jsonb_agg(public.nip_mutfak_satir(oi, coalesce(oi.quantity, 1)) order by oi.created_at, oi.id),
           sum(coalesce(oi.quantity, 1) * public.nip_mutfak_birim_fiyat(oi))::int
      into v_items, v_total
      from public.order_items oi where oi.id = any (v_ids);
    v_card := public.nip_mutfak_kart_ac(p_order_id, v_cfg, v_items, v_total);
    insert into public.nip_kitchen_lines (kitchen_order_id, order_item_id, qty)
    select v_card, oi.id, coalesce(oi.quantity, 1) from public.order_items oi where oi.id = any (v_ids)
    on conflict do nothing;
    perform public.nip_mutfak_log('ileri', 'kart_acildi', p_order_id, v_card, true, array_length(v_ids, 1) || ' kalem');
  else
    insert into public.nip_kitchen_lines (kitchen_order_id, order_item_id, qty)
    select v_card, oi.id, coalesce(oi.quantity, 1) from public.order_items oi where oi.id = any (v_ids)
    on conflict do nothing;
    select string_agg(coalesce(oi.quantity, 1) || '× ' || public.nip_mutfak_ad(oi), ', ') into v_ek
      from public.order_items oi where oi.id = any (v_ids);
    perform public.nip_mutfak_kart_yenile(v_card);
    perform public.nip_mutfak_not_ekle(v_card, 'EK: +' || v_ek);
    perform public.nip_mutfak_log('ileri', 'karta_eklendi', p_order_id, v_card, true, v_ek);
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 2) Ileri yon tetikleri (order_items, orders)
-- ----------------------------------------------------------------------------
create or replace function public.nip_mutfak_trg_kalem_ins() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if current_setting('nip.mutfak_yon', true) = 'geri' then return null; end if;
  for r in
    select n.order_id, array_agg(n.id) as ids
      from new_rows n
     where coalesce(n.sent_to_kitchen, false) and n.kitchen_status = 'pending' and n.kitchen_destination_store_id is not null
     group by n.order_id
  loop
    begin
      perform public.nip_mutfak_kalem_ekle(r.order_id, r.ids);
    exception when others then
      perform public.nip_mutfak_log('ileri', 'kalem_ins', r.order_id, null, false, sqlerrm);
    end;
  end loop;
  return null;
end $$;

create or replace function public.nip_mutfak_trg_kalem_upd() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_synced int; v_delta int; v_card bigint; v_cfg jsonb; v_origin uuid; l record; v_kalan int; v_d int; v_yeni boolean := false;
begin
  if current_setting('nip.mutfak_yon', true) = 'geri' then return null; end if;
  begin
    select coalesce(sum(qty), 0) into v_synced from public.nip_kitchen_lines where order_item_id = NEW.id;
    if v_synced = 0 and not exists (select 1 from public.nip_kitchen_lines where order_item_id = NEW.id) then
      -- bagli degil: sonradan mutfaga gonderildiyse simdi bagla
      if coalesce(OLD.sent_to_kitchen, false) = false and coalesce(NEW.sent_to_kitchen, false) and NEW.kitchen_status = 'pending' then
        perform public.nip_mutfak_kalem_ekle(NEW.order_id, array[NEW.id]);
      end if;
      return null;
    end if;

    select o.origin_store_id into v_origin from public.orders o where o.id = NEW.order_id;
    v_cfg := public.nip_mutfak_cfg(v_origin);
    v_delta := coalesce(NEW.quantity, 1) - v_synced;

    if v_delta > 0 then
      perform pg_advisory_xact_lock(hashtext('nip_mutfak:' || NEW.order_id::text));
      -- once kalemin kendi 'new' karti, sonra siparisin acik karti, yoksa yalniz fark kadar yeni kart
      select l2.kitchen_order_id into v_card
        from public.nip_kitchen_lines l2 join public.kitchen_orders k on k.id = l2.kitchen_order_id
       where l2.order_item_id = NEW.id and k.status = 'new' order by l2.created_at desc limit 1;
      if v_card is null then v_card := public.nip_mutfak_acik_kart(NEW.order_id, (v_cfg ->> 'merge_window_sec')::int); end if;
      if v_card is null then
        v_card := public.nip_mutfak_kart_ac(NEW.order_id, v_cfg, jsonb_build_array(public.nip_mutfak_satir(NEW, v_delta)), v_delta * public.nip_mutfak_birim_fiyat(NEW));
        v_yeni := true;
      end if;
      insert into public.nip_kitchen_lines (kitchen_order_id, order_item_id, qty) values (v_card, NEW.id, v_delta)
      on conflict (kitchen_order_id, order_item_id) do update set qty = public.nip_kitchen_lines.qty + excluded.qty;
      if not v_yeni then
        perform public.nip_mutfak_kart_yenile(v_card);
        perform public.nip_mutfak_not_ekle(v_card, 'EK: +' || v_delta || '× ' || public.nip_mutfak_ad(NEW));
      end if;
      perform public.nip_mutfak_log('ileri', 'adet_artti', NEW.order_id, v_card, true, '+' || v_delta);
    elsif v_delta < 0 then
      v_kalan := -v_delta;
      for l in
        select l2.kitchen_order_id, l2.qty, k.status
          from public.nip_kitchen_lines l2 join public.kitchen_orders k on k.id = l2.kitchen_order_id
         where l2.order_item_id = NEW.id
         order by case k.status when 'new' then 0 when 'preparing' then 1 else 9 end, l2.created_at desc
      loop
        exit when v_kalan = 0;
        continue when l.status in ('done', 'archived');   -- pismis olan geri alinmaz
        v_d := least(v_kalan, l.qty);
        if v_d = l.qty then
          delete from public.nip_kitchen_lines where kitchen_order_id = l.kitchen_order_id and order_item_id = NEW.id;
        else
          update public.nip_kitchen_lines set qty = qty - v_d where kitchen_order_id = l.kitchen_order_id and order_item_id = NEW.id;
        end if;
        v_kalan := v_kalan - v_d;
        perform public.nip_mutfak_kart_yenile(l.kitchen_order_id);
        if l.status = 'preparing' then
          perform public.nip_mutfak_not_ekle(l.kitchen_order_id, 'EKSİLDİ: -' || v_d || '× ' || public.nip_mutfak_ad(NEW));
        end if;
      end loop;
      perform public.nip_mutfak_log('ileri', 'adet_azaldi', NEW.order_id, null, true, v_delta::text);
    else
      -- adet ayni: secenek/not/paket/ikram/fiyat degisti -> kartlar yeniden kurulur
      for l in select distinct l2.kitchen_order_id, k.status from public.nip_kitchen_lines l2 join public.kitchen_orders k on k.id = l2.kitchen_order_id where l2.order_item_id = NEW.id loop
        perform public.nip_mutfak_kart_yenile(l.kitchen_order_id);
        if l.status = 'preparing' and (OLD.selected_options is distinct from NEW.selected_options or OLD.is_takeaway is distinct from NEW.is_takeaway
                                       or OLD.notes is distinct from NEW.notes or OLD.note is distinct from NEW.note or OLD.variant_name is distinct from NEW.variant_name) then
          perform public.nip_mutfak_not_ekle(l.kitchen_order_id, 'DEĞİŞTİ: ' || public.nip_mutfak_ad(NEW));
        end if;
      end loop;
    end if;
  exception when others then
    perform public.nip_mutfak_log('ileri', 'kalem_upd', NEW.order_id, null, false, sqlerrm);
  end;
  return null;
end $$;

-- NIP tarafindan verilen durumun karta yansimasi: preparing -> kart preparing;
-- served ('Teslim edildi') -> kartin tum kalemleri bittiyse kart done.
-- 'ready' karti KAPATMAZ (asci pisirirken kart kaybolmasin). Dongu yok:
-- kart done -> kalem ready -> burada ready dali yok.
create or replace function public.nip_mutfak_trg_kalem_durum() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_cfg jsonb; v_origin uuid;
begin
  if current_setting('nip.mutfak_yon', true) = 'geri' then return null; end if;
  begin
    if NEW.kitchen_status = 'preparing' then
      select o.origin_store_id into v_origin from public.orders o where o.id = NEW.order_id;
      v_cfg := public.nip_mutfak_cfg(v_origin);
      if coalesce(v_cfg ->> 'mirror_preparing', 'true') = 'true' then
        perform set_config('nip.mutfak_yon', 'ileri', true);
        update public.kitchen_orders k set status = 'preparing'
          from public.nip_kitchen_lines l where l.order_item_id = NEW.id and k.id = l.kitchen_order_id and k.status = 'new';
        update public.nip_kitchen_cards c set preparing_at = coalesce(c.preparing_at, now())
          from public.nip_kitchen_lines l where l.order_item_id = NEW.id and c.kitchen_order_id = l.kitchen_order_id;
        perform set_config('nip.mutfak_yon', '', true);
      end if;
    elsif NEW.kitchen_status = 'served' then
      perform set_config('nip.mutfak_yon', 'ileri', true);
      update public.kitchen_orders k set status = 'done'
        from public.nip_kitchen_lines l
       where l.order_item_id = NEW.id and k.id = l.kitchen_order_id and k.status in ('new', 'preparing')
         and not exists (select 1 from public.nip_kitchen_lines l2 join public.order_items x on x.id = l2.order_item_id
                          where l2.kitchen_order_id = k.id and x.kitchen_status in ('pending', 'preparing'));
      update public.nip_kitchen_cards c set done_at = coalesce(c.done_at, now()), last_kitchen_status = 'done'
        from public.nip_kitchen_lines l join public.kitchen_orders k on k.id = l.kitchen_order_id
       where l.order_item_id = NEW.id and c.kitchen_order_id = l.kitchen_order_id and k.status = 'done' and c.done_at is null;
      perform set_config('nip.mutfak_yon', '', true);
    end if;
  exception when others then
    perform set_config('nip.mutfak_yon', '', true);
    perform public.nip_mutfak_log('ileri', 'kalem_durum', NEW.order_id, null, false, sqlerrm);
  end;
  return null;
end $$;

create or replace function public.nip_mutfak_trg_kalem_sil() returns trigger
language plpgsql security definer set search_path = public as $$
declare l record;
begin
  if current_setting('nip.mutfak_yon', true) = 'geri' then return OLD; end if;
  begin
    for l in select l2.kitchen_order_id, l2.qty, k.status from public.nip_kitchen_lines l2 join public.kitchen_orders k on k.id = l2.kitchen_order_id where l2.order_item_id = OLD.id loop
      delete from public.nip_kitchen_lines where kitchen_order_id = l.kitchen_order_id and order_item_id = OLD.id;
      perform public.nip_mutfak_kart_yenile(l.kitchen_order_id);   -- satir kalmadiysa kapatir
      if l.status = 'preparing' then
        perform public.nip_mutfak_not_ekle(l.kitchen_order_id, 'SİLİNDİ: ' || l.qty || '× ' || public.nip_mutfak_ad(OLD));
      end if;
      perform public.nip_mutfak_log('ileri', 'kalem_silindi', OLD.order_id, l.kitchen_order_id, true, public.nip_mutfak_ad(OLD));
    end loop;
  exception when others then
    perform public.nip_mutfak_log('ileri', 'kalem_sil', OLD.order_id, null, false, sqlerrm);
  end;
  return OLD;
end $$;

create or replace function public.nip_mutfak_trg_siparis() returns trigger
language plpgsql security definer set search_path = public as $$
declare c record;
begin
  if current_setting('nip.mutfak_yon', true) = 'geri' then return null; end if;
  begin
    if NEW.status::text = 'cancelled' and OLD.status::text is distinct from 'cancelled' then
      perform set_config('nip.mutfak_yon', 'ileri', true);
      for c in select nc.kitchen_order_id, k.status from public.nip_kitchen_cards nc join public.kitchen_orders k on k.id = nc.kitchen_order_id where nc.order_id = NEW.id loop
        if c.status = 'new' then
          update public.kitchen_orders set status = 'archived', items = '[]'::jsonb, total = 0 where id = c.kitchen_order_id;
        elsif c.status = 'preparing' then
          update public.kitchen_orders set total = 0, customer_name = 'İPTAL! ' || customer_name where id = c.kitchen_order_id;
        else
          update public.kitchen_orders set total = 0 where id = c.kitchen_order_id;
        end if;
        perform public.nip_mutfak_not_ekle(c.kitchen_order_id, 'İPTAL — NIP');
        update public.nip_kitchen_cards set cancelled_at = coalesce(cancelled_at, now()) where kitchen_order_id = c.kitchen_order_id;
        perform public.nip_mutfak_log('ileri', 'siparis_iptal', NEW.id, c.kitchen_order_id, true, c.status);
      end loop;
      perform set_config('nip.mutfak_yon', '', true);
    elsif (OLD.customer_name, OLD.note, OLD.notes, OLD.table_id) is distinct from (NEW.customer_name, NEW.note, NEW.notes, NEW.table_id) then
      perform public.nip_mutfak_baslik_yenile(NEW.id);
    end if;
  exception when others then
    perform set_config('nip.mutfak_yon', '', true);
    perform public.nip_mutfak_log('ileri', 'siparis', NEW.id, null, false, sqlerrm);
  end;
  return null;
end $$;

-- ----------------------------------------------------------------------------
-- 3) Geri yon: kart durumu -> NIP kalemleri
-- ----------------------------------------------------------------------------
-- Kartin kapanisini kalemlere uygula (tetikten ve onarim taramasindan cagrilir)
create or replace function public.nip_mutfak_geri_uygula(p_card bigint, p_status text, p_actor uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare v_order uuid; v_cfg jsonb; v_origin uuid; v_stale int; n int := 0;
begin
  select nc.order_id, o.origin_store_id into v_order, v_origin
    from public.nip_kitchen_cards nc join public.orders o on o.id = nc.order_id where nc.kitchen_order_id = p_card;
  if v_order is null then return 0; end if;
  v_cfg := public.nip_mutfak_cfg(v_origin);
  v_stale := coalesce((v_cfg ->> 'stale_ready_hours')::int, 12);

  perform set_config('nip.mutfak_yon', 'geri', true);
  update public.nip_kitchen_cards
     set last_kitchen_status = p_status,
         preparing_at = case when p_status = 'preparing' then coalesce(preparing_at, now()) else preparing_at end,
         done_at      = case when p_status in ('done', 'archived') then coalesce(done_at, now()) else done_at end,
         done_by      = case when p_status in ('done', 'archived') then coalesce(done_by, p_actor) else done_by end
   where kitchen_order_id = p_card;

  if p_status = 'preparing' then
    update public.order_items oi set kitchen_status = 'preparing'
      from public.nip_kitchen_lines l
     where l.order_item_id = oi.id and l.kitchen_order_id = p_card and oi.kitchen_status = 'pending';
    get diagnostics n = row_count;
  elsif p_status in ('done', 'archived') then
    -- Hazir: iptal edilmemis, bayat olmayan, baska acik karti kalmamis kalemler.
    -- Bu UPDATE tg_items_ready (Telegram), wp_items_ready (push), trg_stok_kalem'i ateslar.
    update public.order_items oi set kitchen_status = 'ready'
      from public.nip_kitchen_lines l join public.orders o on true
     where l.order_item_id = oi.id and l.kitchen_order_id = p_card and o.id = oi.order_id
       and oi.kitchen_status in ('pending', 'preparing')
       and o.status::text <> 'cancelled'
       and oi.created_at > now() - make_interval(hours => v_stale)
       and not exists (select 1 from public.nip_kitchen_lines l2 join public.kitchen_orders k2 on k2.id = l2.kitchen_order_id
                        where l2.order_item_id = oi.id and l2.kitchen_order_id <> p_card and k2.status in ('new', 'preparing'));
    get diagnostics n = row_count;
    -- OrdersPage.markReady ile ayni kural: bekleyen kalem kalmadiysa siparis 'ready'
    update public.orders o set status = 'ready'
     where o.id = v_order and o.status::text in ('open', 'sent', 'preparing')
       and not exists (select 1 from public.order_items x where x.order_id = o.id and coalesce(x.sent_to_kitchen, false) and x.kitchen_status in ('pending', 'preparing'));
  end if;
  perform set_config('nip.mutfak_yon', '', true);
  return n;
end $$;

create or replace function public.nip_mutfak_trg_kart_durum() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if current_setting('nip.mutfak_yon', true) = 'ileri' then return null; end if;
  if not exists (select 1 from public.nip_kitchen_cards where kitchen_order_id = NEW.id) then return null; end if;   -- mutfagin kendi kartlari
  if NEW.status = 'archived' and OLD.status = 'done' then return null; end if;   -- gece temizligi, cift bildirim yok
  begin
    n := public.nip_mutfak_geri_uygula(NEW.id, NEW.status, auth.uid());
    perform public.nip_mutfak_log('geri', 'kart_' || NEW.status, null, NEW.id, true, n || ' kalem');
  exception when others then
    perform set_config('nip.mutfak_yon', '', true);
    perform public.nip_mutfak_log('geri', 'kart_' || NEW.status, null, NEW.id, false, sqlerrm);
  end;
  return null;
end $$;

-- ----------------------------------------------------------------------------
-- 4) Mutfakta tukenen urun -> NIP'te "tukendi"
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
     and upper(km.name) in (upper(p.name), upper(coalesce(p.name_en, '')))
     and (coalesce(p.sold_out_today, false) is distinct from (not km.available));
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.nip_mutfak_trg_menu_stok() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  begin
    n := public.nip_mutfak_stok_esitle();
    if n > 0 then perform public.nip_mutfak_log('menu', 'tukendi_esitle', null, null, true, NEW.name || ' -> ' || (case when NEW.available then 'acik' else 'tukendi' end)); end if;
  exception when others then
    perform public.nip_mutfak_log('menu', 'tukendi_esitle', null, null, false, sqlerrm);
  end;
  return null;
end $$;

-- ----------------------------------------------------------------------------
-- 5) Onarim taramasi (cron, 5 dk): kacan kalem, kacan kapanis, stok esitleme
-- ----------------------------------------------------------------------------
create or replace function public.nip_mutfak_onarim()
returns jsonb language plpgsql security definer set search_path = public as $$
declare r record; v_kalem int := 0; v_kart int := 0; v_stok int := 0;
begin
  -- a) doner kalemi var, karti yok
  for r in
    select oi.order_id, array_agg(oi.id) as ids
      from public.order_items oi join public.orders o on o.id = oi.order_id
     where coalesce(oi.sent_to_kitchen, false) and oi.kitchen_status = 'pending'
       and oi.kitchen_destination_store_id is not null and oi.kitchen_destination_store_id <> o.origin_store_id
       and o.status::text not in ('cancelled', 'paid', 'debt')
       and oi.created_at > now() - interval '12 hours' and oi.created_at < now() - interval '1 minute'
       and not exists (select 1 from public.nip_kitchen_lines l where l.order_item_id = oi.id)
     group by oi.order_id
  loop
    begin
      perform public.nip_mutfak_kalem_ekle(r.order_id, r.ids);
      v_kalem := v_kalem + array_length(r.ids, 1);
    exception when others then
      perform public.nip_mutfak_log('onarim', 'kalem', r.order_id, null, false, sqlerrm);
    end;
  end loop;
  -- b) kart kapanmis, kalem hala bekliyor
  for r in
    select k.id, k.status
      from public.kitchen_orders k join public.nip_kitchen_cards nc on nc.kitchen_order_id = k.id
     where k.status in ('done', 'archived') and nc.cancelled_at is null
       and nc.created_at > now() - interval '12 hours'
       and exists (select 1 from public.nip_kitchen_lines l join public.order_items oi on oi.id = l.order_item_id
                    where l.kitchen_order_id = k.id and oi.kitchen_status in ('pending', 'preparing'))
  loop
    begin
      v_kart := v_kart + public.nip_mutfak_geri_uygula(r.id, r.status, null);
    exception when others then
      perform set_config('nip.mutfak_yon', '', true);
      perform public.nip_mutfak_log('onarim', 'kart', null, r.id, false, sqlerrm);
    end;
  end loop;
  -- c) mutfak stok isaretleri
  begin
    v_stok := public.nip_mutfak_stok_esitle();
  exception when others then
    perform public.nip_mutfak_log('onarim', 'stok', null, null, false, sqlerrm);
  end;
  if v_kalem + v_kart + v_stok > 0 then
    perform public.nip_mutfak_log('onarim', 'tarama', null, null, true, format('kalem=%s kart=%s stok=%s', v_kalem, v_kart, v_stok));
  end if;
  return jsonb_build_object('kalem', v_kalem, 'kart', v_kart, 'stok', v_stok);
end $$;

-- ----------------------------------------------------------------------------
-- 6) Hakedis raporu: sahip ve mutfak hesabi. Tek kaynak: settlement kurali.
-- ----------------------------------------------------------------------------
create or replace function public.nip_mutfak_hakedis_raporu(p_ay date default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_ay date := date_trunc('month', coalesce(p_ay, (now() at time zone 'Europe/Istanbul')::date))::date;
  v_from timestamptz; v_to timestamptz;
  v_nip uuid := 'c3c6e0c7-1821-4edd-993d-ad960cfbc452';
  v_cfg jsonb; v_kitchen uuid;
  v_out jsonb;
begin
  if not (public.is_admin() or exists (select 1 from public.nip_mutfak_ortaklar m where m.auth_id = auth.uid())) then
    raise exception 'hakedis raporu: yetkisiz' using errcode = '42501';
  end if;
  v_cfg := public.nip_mutfak_cfg(v_nip);
  v_kitchen := coalesce((v_cfg ->> 'kitchen_store_id')::uuid, 'c39da530-7f73-4f69-a752-029bf03790b1');
  -- settlement gorunumu ay sinirini UTC created_at ile ceker; ayni sinir
  v_from := v_ay::timestamp;  v_to := (v_ay + interval '1 month')::timestamp;

  with kalem as (
    select o.id as order_id, o.created_at, o.paid_at, o.status::text as durum, ct.name as masa,
           oi.product_name, public.nip_mutfak_ad(oi) as ad, coalesce(oi.quantity, 1) as adet,
           coalesce(oi.is_treat, false) as ikram,
           coalesce(oi.quantity, 1) * (case when coalesce(oi.is_treat, false) then coalesce(oi.product_price, 0) else coalesce(oi.final_price, oi.product_price, 0) end) as tutar
      from public.orders o
      join public.order_items oi on oi.order_id = o.id
      left join public.cafe_tables ct on ct.id = o.table_id
     where o.origin_store_id = v_nip and oi.kitchen_destination_store_id = v_kitchen
       and o.created_at >= v_from and o.created_at < v_to
  ),
  odenen as (select * from kalem where durum = 'paid'),
  acik as (select * from kalem where durum in ('open', 'sent', 'preparing', 'ready', 'debt'))
  select jsonb_build_object(
    'ay', to_char(v_ay, 'YYYY-MM'),
    'odenecek', jsonb_build_object(
        'tutar', coalesce((select sum(tutar) from odenen), 0),
        'siparis', (select count(distinct order_id) from odenen),
        'kalem', coalesce((select sum(adet) from odenen), 0)),
    'acik_tutar', coalesce((select sum(tutar) from acik), 0),
    'acik_siparis', (select count(distinct order_id) from acik),
    'iptal_kalem', (select count(*) from kalem where durum = 'cancelled'),
    'urunler', coalesce((select jsonb_agg(jsonb_build_object('ad', ad, 'adet', adet, 'tutar', tutar) order by tutar desc)
                         from (select ad, sum(adet) adet, sum(tutar) tutar from odenen group by ad) u), '[]'::jsonb),
    'gunler', coalesce((select jsonb_agg(jsonb_build_object('gun', gun, 'adet', adet, 'tutar', tutar) order by gun)
                        from (select (created_at at time zone 'Europe/Istanbul')::date as gun, sum(adet) adet, sum(tutar) tutar from odenen group by 1) g), '[]'::jsonb),
    'siparisler', coalesce((select jsonb_agg(jsonb_build_object(
                              'siparis', order_id, 'zaman', to_char(created_at at time zone 'Europe/Istanbul', 'DD.MM HH24:MI'),
                              'masa', masa, 'tutar', tutar, 'ikram', ikram,
                              'kalemler', kalemler) order by created_at desc)
                            from (select order_id, min(created_at) created_at, min(masa) masa, sum(tutar) tutar, bool_or(ikram) ikram,
                                         string_agg(adet || '× ' || ad || case when ikram then ' (ikram)' else '' end, ', ' order by ad) kalemler
                                    from odenen group by order_id) s), '[]'::jsonb),
    'kartlar', jsonb_build_object(
        'acilan', (select count(*) from public.nip_kitchen_cards nc where nc.created_at >= v_from and nc.created_at < v_to),
        'ort_hazirlik_dk', (select round(avg(extract(epoch from (nc.done_at - nc.created_at)) / 60))
                              from public.nip_kitchen_cards nc where nc.done_at is not null and nc.cancelled_at is null and nc.created_at >= v_from and nc.created_at < v_to))
  ) into v_out;
  return v_out;
end $$;

-- ----------------------------------------------------------------------------
-- 7) Yetkiler
-- ----------------------------------------------------------------------------
revoke all on function
  public.nip_mutfak_cfg(uuid), public.nip_mutfak_kod(text), public.nip_mutfak_json_metin(jsonb),
  public.nip_mutfak_ad(public.order_items), public.nip_mutfak_det(public.order_items),
  public.nip_mutfak_birim_fiyat(public.order_items), public.nip_mutfak_satir(public.order_items, integer),
  public.nip_mutfak_baslik(uuid, jsonb), public.nip_mutfak_log(text, text, uuid, bigint, boolean, text),
  public.nip_mutfak_not_ekle(bigint, text), public.nip_mutfak_acik_kart(uuid, integer),
  public.nip_mutfak_kart_yenile(bigint), public.nip_mutfak_baslik_yenile(uuid),
  public.nip_mutfak_kart_ac(uuid, jsonb, jsonb, integer), public.nip_mutfak_kalem_ekle(uuid, uuid[]),
  public.nip_mutfak_trg_kalem_ins(), public.nip_mutfak_trg_kalem_upd(), public.nip_mutfak_trg_kalem_durum(),
  public.nip_mutfak_trg_kalem_sil(), public.nip_mutfak_trg_siparis(), public.nip_mutfak_geri_uygula(bigint, text, uuid),
  public.nip_mutfak_trg_kart_durum(), public.nip_mutfak_stok_esitle(), public.nip_mutfak_trg_menu_stok(),
  public.nip_mutfak_onarim()
from anon, authenticated, public;

revoke all on function public.nip_mutfak_hakedis_raporu(date) from anon, public;
grant execute on function public.nip_mutfak_hakedis_raporu(date) to authenticated;

-- kitchen_orders: durumu yalniz mutfak hesaplari ve NIP personeli degistirir
drop policy if exists orders_auth_update on public.kitchen_orders;
create policy orders_auth_update on public.kitchen_orders
  for update to authenticated
  using (public.is_staff() or exists (select 1 from public.nip_mutfak_ortaklar m where m.auth_id = auth.uid()))
  with check (public.is_staff() or exists (select 1 from public.nip_mutfak_ortaklar m where m.auth_id = auth.uid()));

-- Hakedis gorunumu: anon'a kapali, okuyanin kendi yetkisiyle (personel gorur, uye gormez)
alter view public.inter_company_settlement set (security_invoker = true);
revoke all on public.inter_company_settlement from anon, authenticated;
grant select on public.inter_company_settlement to authenticated;

-- ----------------------------------------------------------------------------
-- 8) Telegram: NIP personeline "yeni siparis" doner kalemlerini atlasin
-- ----------------------------------------------------------------------------
create or replace function public.trg_items_sent_ins() returns trigger
language plpgsql security definer set search_path = public as $fn$
declare r record;
begin
  for r in
    select n.order_id, jsonb_agg(jsonb_build_object('name', coalesce(n.product_name,'Urun'), 'qty', coalesce(n.quantity,1))) as items
    from new_rows n join public.orders o on o.id = n.order_id
    where coalesce(n.sent_to_kitchen,false) = true
      and (n.kitchen_destination_store_id is null or n.kitchen_destination_store_id = o.origin_store_id)   -- doner kalemleri panoya gider
    group by n.order_id
  loop
    perform public.tg_call(jsonb_build_object('kind','items_sent','order_id', r.order_id, 'items', r.items));
  end loop;
  return null;
end $fn$;

create or replace function public.trg_items_sent_upd() returns trigger
language plpgsql security definer set search_path = public as $fn$
declare r record;
begin
  for r in
    select n.order_id, jsonb_agg(jsonb_build_object('name', coalesce(n.product_name,'Urun'), 'qty', coalesce(n.quantity,1))) as items
    from new_rows n join old_rows o on o.id = n.id join public.orders ord on ord.id = n.order_id
    where coalesce(o.sent_to_kitchen,false) = false and coalesce(n.sent_to_kitchen,false) = true
      and (n.kitchen_destination_store_id is null or n.kitchen_destination_store_id = ord.origin_store_id)
    group by n.order_id
  loop
    perform public.tg_call(jsonb_build_object('kind','items_sent','order_id', r.order_id, 'items', r.items));
  end loop;
  return null;
end $fn$;

-- ----------------------------------------------------------------------------
-- 9) Tetikleyiciler
-- ----------------------------------------------------------------------------
drop trigger if exists trg_mutfak_kalem_ins on public.order_items;
create trigger trg_mutfak_kalem_ins
after insert on public.order_items
referencing new table as new_rows
for each statement execute function public.nip_mutfak_trg_kalem_ins();

drop trigger if exists trg_mutfak_kalem_upd on public.order_items;
create trigger trg_mutfak_kalem_upd
after update of quantity, final_price, product_price, is_treat, is_takeaway, selected_options, note, notes, variant_name, product_name, sent_to_kitchen
on public.order_items
for each row execute function public.nip_mutfak_trg_kalem_upd();

drop trigger if exists trg_mutfak_kalem_durum on public.order_items;
create trigger trg_mutfak_kalem_durum
after update of kitchen_status on public.order_items
for each row when (old.kitchen_status is distinct from new.kitchen_status)
execute function public.nip_mutfak_trg_kalem_durum();

drop trigger if exists trg_mutfak_kalem_sil on public.order_items;
create trigger trg_mutfak_kalem_sil
before delete on public.order_items
for each row execute function public.nip_mutfak_trg_kalem_sil();

drop trigger if exists trg_mutfak_siparis on public.orders;
create trigger trg_mutfak_siparis
after update of status, customer_name, note, notes, table_id on public.orders
for each row execute function public.nip_mutfak_trg_siparis();

drop trigger if exists trg_mutfak_kart_durum on public.kitchen_orders;
create trigger trg_mutfak_kart_durum
after update of status on public.kitchen_orders
for each row when (old.status is distinct from new.status)
execute function public.nip_mutfak_trg_kart_durum();

drop trigger if exists trg_mutfak_menu_stok on public.kitchen_menu;
create trigger trg_mutfak_menu_stok
after update of available on public.kitchen_menu
for each row when (old.available is distinct from new.available)
execute function public.nip_mutfak_trg_menu_stok();

-- Onarim taramasi (5 dk) + ilk stok esitleme
select cron.unschedule(jobid) from cron.job where jobname = 'nip-mutfak-onarim';
select cron.schedule('nip-mutfak-onarim', '*/5 * * * *', $$select public.nip_mutfak_onarim()$$);
select public.nip_mutfak_stok_esitle();

-- ============================================================================
-- GERI ALMA (tamami ek tablo/tetik; kasa, QR menu ve mutfak uygulamasi etkilenmez)
-- select cron.unschedule(jobid) from cron.job where jobname = 'nip-mutfak-onarim';
-- drop trigger if exists trg_mutfak_kalem_ins on public.order_items;
-- drop trigger if exists trg_mutfak_kalem_upd on public.order_items;
-- drop trigger if exists trg_mutfak_kalem_durum on public.order_items;
-- drop trigger if exists trg_mutfak_kalem_sil on public.order_items;
-- drop trigger if exists trg_mutfak_siparis on public.orders;
-- drop trigger if exists trg_mutfak_kart_durum on public.kitchen_orders;
-- drop trigger if exists trg_mutfak_menu_stok on public.kitchen_menu;
-- drop function if exists public.nip_mutfak_onarim(), public.nip_mutfak_trg_menu_stok(), public.nip_mutfak_stok_esitle(),
--   public.nip_mutfak_trg_kart_durum(), public.nip_mutfak_geri_uygula(bigint,text,uuid), public.nip_mutfak_trg_siparis(),
--   public.nip_mutfak_trg_kalem_sil(), public.nip_mutfak_trg_kalem_durum(), public.nip_mutfak_trg_kalem_upd(),
--   public.nip_mutfak_trg_kalem_ins(), public.nip_mutfak_kalem_ekle(uuid,uuid[]), public.nip_mutfak_kart_ac(uuid,jsonb,jsonb,integer),
--   public.nip_mutfak_baslik_yenile(uuid), public.nip_mutfak_kart_yenile(bigint), public.nip_mutfak_acik_kart(uuid,integer),
--   public.nip_mutfak_not_ekle(bigint,text), public.nip_mutfak_log(text,text,uuid,bigint,boolean,text), public.nip_mutfak_baslik(uuid,jsonb),
--   public.nip_mutfak_satir(public.order_items,integer), public.nip_mutfak_birim_fiyat(public.order_items), public.nip_mutfak_det(public.order_items),
--   public.nip_mutfak_ad(public.order_items), public.nip_mutfak_json_metin(jsonb), public.nip_mutfak_kod(text), public.nip_mutfak_cfg(uuid),
--   public.nip_mutfak_hakedis_raporu(date);
-- drop table if exists public.nip_kitchen_lines, public.nip_kitchen_cards, public.nip_mutfak_log, public.nip_mutfak_ortaklar;
-- drop sequence if exists public.nip_kitchen_code_seq;
-- delete from public.app_settings where key = 'mutfak_koprusu';
-- Hizli kapatma (drop'suz): update public.app_settings set value = value || '{"enabled": false}' where key = 'mutfak_koprusu';
-- Panoda kalan NIP kartlari: update public.kitchen_orders set status='archived' where code like 'P-%' and status in ('new','preparing');
-- ============================================================================
