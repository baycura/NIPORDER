-- DONER TELEGRAM + ORTAK DOKUMU + RUSCA NOT PARCASI (sahip istegi 20.10 aksam)
--
-- 1. Telegram: doner icin AYRI bot. Bot anahtari Vault'ta ('doner_tg_token';
--    sahip SQL editorunden yazar, repoya ve sohbete girmez). Grup sohbeti
--    doner_ayar.tg_chat'te; admin uygulamadan "Grubu bul" ile baglar
--    (getUpdates). Mesajlar: yeni/degisen/iptal mutfak siparisi (QR + kafe),
--    girilen gider (kim odedi), gun sonu ozeti, 23:00'te gun sonu girilmediyse
--    hatirlatma. Gonderim nip_tg_gonder deseniyle: pg_net + kuyruk + 2 dk'da
--    bir tekrar (doner_tg_giden / doner_tg_kontrol). Kafe botuna, kafe
--    tablolarina ve nip_tg_* fonksiyonlarina dokunulmaz.
-- 2. Ortak dokumu: doner_ortaklar() — kim ne kadar odedi (tum zamanlar, bu ay,
--    gecen ay, son tarih). Gider ekrani odeyene gore suzer.
-- 3. doner_ozet ikiye ayrildi: doner_ozet_hesapla (ic, uye kontrolu yok;
--    tetikleyici ve cron kullanir) + doner_ozet (uye kontrolu, ayni cikti).
-- 4. Rusca siparis: items[].det parcasi " · Not: ..." ile bitince sozluk
--    eslesmiyordu ("Майонез · Not: острый" oldugu gibi kaliyordu). Parca
--    " · " ile de bolunur; "Not:" ile baslayan kisim musteri notudur, dokunulmaz.
--
-- GUVENLIK: kitchen_orders tetikleyicisi kafe koprusunun (nip_mutfak_kart_ac)
-- islemi icinde calisir. Hata siparisi DURDURMAZ: govde her hatayi yutar.
-- Hicbir nesne silinmez.

-- 1. Ayar ve gonderim gunlugu --------------------------------------------------
create table if not exists public.doner_ayar (
  anahtar     text primary key,
  deger       text,
  guncellendi timestamptz not null default now()
);
comment on table public.doner_ayar is 'Doner defteri ayarlari (tg_chat, tg_chat_ad, site). Disaridan erisim yok; yalniz DEFINER fonksiyonlar (20261021_doner_telegram_ortak).';
alter table public.doner_ayar enable row level security;
revoke all on public.doner_ayar from anon, authenticated, public;
insert into public.doner_ayar (anahtar, deger) values ('site', 'https://doner.notinparis.me') on conflict (anahtar) do nothing;

create table if not exists public.doner_tg_giden (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  guncellendi timestamptz not null default now(),
  kaynak      text not null default 'genel',
  govde       jsonb not null,
  istek_id    bigint,
  deneme      integer not null default 1,
  durum       text not null default 'yolda' check (durum in ('yolda', 'ulasti', 'basarisiz')),
  son_hata    text
);
comment on table public.doner_tg_giden is 'Doner botunun gonderdigi mesajlar; doner_tg_kontrol 2 dk''da bir sonucu isler, en fazla 3 deneme (20261021_doner_telegram_ortak).';
create index if not exists doner_tg_giden_yolda on public.doner_tg_giden (id) where durum = 'yolda';
alter table public.doner_tg_giden enable row level security;
revoke all on public.doner_tg_giden from anon, authenticated, public;
grant select on public.doner_tg_giden to authenticated;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'doner_tg_giden' and policyname = 'doner_tg_giden_admin_okur') then
    create policy doner_tg_giden_admin_okur on public.doner_tg_giden for select to authenticated using (public.doner_admin());
  end if;
end $$;

-- 2. Yardimcilar ---------------------------------------------------------------
create or replace function public.doner_tl(n numeric)
returns text language sql immutable
as $$ select '₺' || replace(to_char(round(coalesce(n, 0)), 'FM999,999,999,999'), ',', '.'); $$;

create or replace function public.doner_tarih_kisa(d date)
returns text language sql immutable
as $$
  select extract(day from d)::int || ' ' ||
         (array['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'])[extract(month from d)::int] || ' ' ||
         (array['Paz','Pzt','Sal','Çar','Per','Cum','Cmt'])[extract(dow from d)::int + 1];
$$;

create or replace function public.doner_kullanici_adi(p_auth uuid)
returns text language sql stable security definer set search_path to 'public'
as $$ select coalesce((select k.ad from public.doner_kullanicilar k where k.auth_id = p_auth), '—'); $$;
revoke execute on function public.doner_kullanici_adi(uuid) from public, anon, authenticated;

create or replace function public.doner_tg_token()
returns text language sql stable security definer set search_path to 'public'
as $$ select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'doner_tg_token' limit 1; $$;
revoke execute on function public.doner_tg_token() from public, anon, authenticated;

create or replace function public.doner_ayar_oku(p_anahtar text)
returns text language sql stable security definer set search_path to 'public'
as $$ select a.deger from public.doner_ayar a where a.anahtar = p_anahtar; $$;
revoke execute on function public.doner_ayar_oku(text) from public, anon, authenticated;

create or replace function public.doner_ayar_yaz(p_anahtar text, p_deger text)
returns void language sql security definer set search_path to 'public'
as $$
  insert into public.doner_ayar (anahtar, deger) values (p_anahtar, p_deger)
  on conflict (anahtar) do update set deger = excluded.deger, guncellendi = now();
$$;
revoke execute on function public.doner_ayar_yaz(text, text) from public, anon, authenticated;

-- 3. Gonderim + tekrar ---------------------------------------------------------
create or replace function public.doner_tg_gonder(p_metin text, p_kaynak text default 'genel')
returns bigint
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_token text; v_chat text; v_govde jsonb; v_istek bigint; v_id bigint;
begin
  if p_metin is null or length(btrim(p_metin)) < 2 then return null; end if;
  v_chat := public.doner_ayar_oku('tg_chat');
  if v_chat is null then return null; end if;
  v_token := public.doner_tg_token();
  if v_token is null then return null; end if;
  v_govde := jsonb_build_object('chat_id', v_chat, 'text', left(p_metin, 3900), 'disable_web_page_preview', true);
  v_istek := net.http_post(
    url                  := 'https://api.telegram.org/bot' || v_token || '/sendMessage',
    body                 := v_govde,
    headers              := jsonb_build_object('Content-Type', 'application/json'),
    timeout_milliseconds := 20000);
  insert into public.doner_tg_giden (kaynak, govde, istek_id) values (coalesce(p_kaynak, 'genel'), v_govde, v_istek) returning id into v_id;
  return v_id;
end $function$;
revoke execute on function public.doner_tg_gonder(text, text) from public, anon, authenticated;

create or replace function public.doner_tg_kontrol()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare g record; v_token text; v_istek bigint; v_hata text; v_ulasti int := 0; v_tekrar int := 0; v_basarisiz int := 0;
begin
  v_token := public.doner_tg_token();
  for g in
    select t.id, t.govde, t.deneme, t.guncellendi, r.id is not null as yanit_var, r.status_code, r.error_msg, r.content
      from public.doner_tg_giden t
      left join net._http_response r on r.id = t.istek_id
     where t.durum = 'yolda'
     order by t.id
       for update of t skip locked
  loop
    v_hata := coalesce(left(g.error_msg, 200), g.status_code::text || ' ' || left(coalesce(g.content, ''), 200), 'yanit yok');
    if g.status_code between 200 and 299 then
      update public.doner_tg_giden set durum = 'ulasti', son_hata = null, guncellendi = now() where id = g.id;
      v_ulasti := v_ulasti + 1;
    elsif g.status_code between 400 and 499 and g.status_code <> 429 then
      update public.doner_tg_giden set durum = 'basarisiz', son_hata = v_hata, guncellendi = now() where id = g.id;
      v_basarisiz := v_basarisiz + 1;
    elsif g.yanit_var or g.guncellendi < now() - interval '10 minutes' then
      if g.deneme >= 3 or v_token is null then
        update public.doner_tg_giden set durum = 'basarisiz', son_hata = v_hata, guncellendi = now() where id = g.id;
        v_basarisiz := v_basarisiz + 1;
      else
        v_istek := net.http_post(
          url := 'https://api.telegram.org/bot' || v_token || '/sendMessage', body := g.govde,
          headers := jsonb_build_object('Content-Type', 'application/json'), timeout_milliseconds := 20000);
        update public.doner_tg_giden set istek_id = v_istek, deneme = g.deneme + 1, son_hata = v_hata, guncellendi = now() where id = g.id;
        v_tekrar := v_tekrar + 1;
      end if;
    end if;
  end loop;
  return jsonb_build_object('ulasti', v_ulasti, 'tekrar', v_tekrar, 'basarisiz', v_basarisiz);
end $function$;
revoke execute on function public.doner_tg_kontrol() from public, anon, authenticated;

do $c$
begin
  if not exists (select 1 from cron.job where jobname = 'doner-tg-tekrar') then
    perform cron.schedule('doner-tg-tekrar', '*/2 * * * *', 'select public.doner_tg_kontrol()');
  end if;
end $c$;

-- 4. Ozet: ic hesap + uye kapili sarmal ------------------------------------------
create or replace function public.doner_ozet_hesapla(p_bas date, p_bit date)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_doner uuid := 'c39da530-7f73-4f69-a752-029bf03790b1';
  v jsonb;
begin
  if p_bas is null or p_bit is null or p_bit < p_bas then raise exception 'doner: tarih araligi hatali'; end if;
  if p_bit - p_bas > 400 then raise exception 'doner: en fazla 400 gun'; end if;

  with kafe_kalem as (
    select (coalesce(o.paid_at, o.updated_at, o.created_at) at time zone 'Europe/Istanbul')::date as gun,
           coalesce(oi.quantity, 1) as adet,
           coalesce(oi.quantity, 1) * (case when coalesce(oi.is_treat, false) then coalesce(oi.product_price, 0)
                                            else coalesce(oi.final_price, oi.product_price, 0) end) as tutar
      from public.orders o
      join public.order_items oi on oi.order_id = o.id
     where o.status::text = 'paid'
       and oi.kitchen_destination_store_id = v_doner
       and (coalesce(o.paid_at, o.updated_at, o.created_at) at time zone 'Europe/Istanbul')::date between p_bas and p_bit
  ),
  qr as (
    select (k.created_at at time zone 'Europe/Istanbul')::date as gun, coalesce(k.total, 0)::numeric as tutar
      from public.kitchen_orders k
     where (k.created_at at time zone 'Europe/Istanbul')::date between p_bas and p_bit
       and coalesce(k.status, '') <> 'cancelled'
       and not exists (select 1 from public.nip_kitchen_cards c where c.kitchen_order_id = k.id)
  ),
  gider as (
    select g.tarih as gun, g.kategori, g.odeyen, g.tutar from public.doner_giderler g where g.tarih between p_bas and p_bit
  ),
  tezgah as (
    select t.tarih as gun, t.nakit, t.kart from public.doner_gunsonu t where t.tarih between p_bas and p_bit
  ),
  satis as (
    select s.tarih as gun, s.adet, m.maliyet from public.doner_satislar s
      left join public.doner_urun_maliyet m on m.urun_id = s.urun_id
     where s.tarih between p_bas and p_bit
  )
  select jsonb_build_object(
    'bas', p_bas, 'bit', p_bit,
    'tezgah', jsonb_build_object('nakit', (select coalesce(sum(nakit), 0) from tezgah), 'kart', (select coalesce(sum(kart), 0) from tezgah), 'gun', (select count(*) from tezgah)),
    'qr', jsonb_build_object('tutar', (select coalesce(sum(tutar), 0) from qr), 'adet', (select count(*) from qr)),
    'kafe', jsonb_build_object('tutar', (select coalesce(sum(tutar), 0) from kafe_kalem), 'adet', (select coalesce(sum(adet), 0) from kafe_kalem)),
    'gider', jsonb_build_object(
       'tutar', (select coalesce(sum(tutar), 0) from gider), 'adet', (select count(*) from gider),
       'kategori', coalesce((select jsonb_object_agg(x.kategori, x.t) from (select kategori, sum(tutar) t from gider group by kategori) x), '{}'::jsonb),
       'odeyen', coalesce((select jsonb_object_agg(y.odeyen, y.t) from (select odeyen, sum(tutar) t from gider group by odeyen) y), '{}'::jsonb)),
    'maliyet', jsonb_build_object(
       'tutar', (select coalesce(sum(adet * maliyet), 0) from satis),
       'adet', (select coalesce(sum(adet), 0) from satis),
       'maliyetsiz_adet', (select coalesce(sum(adet) filter (where maliyet is null), 0) from satis)),
    'borc', (select jsonb_build_object('acik', coalesce(sum(tutar) filter (where not odendi), 0), 'kisi', count(*) filter (where not odendi)) from public.doner_borclular),
    'gunler', (select coalesce(jsonb_agg(jsonb_build_object('gun', d.gun,
                  'tezgah', coalesce((select sum(nakit + kart) from tezgah where gun = d.gun), 0),
                  'qr', coalesce((select sum(tutar) from qr where gun = d.gun), 0),
                  'kafe', coalesce((select sum(tutar) from kafe_kalem where gun = d.gun), 0),
                  'gider', coalesce((select sum(tutar) from gider where gun = d.gun), 0)) order by d.gun), '[]'::jsonb)
               from (select generate_series(p_bas, p_bit, interval '1 day')::date as gun) d)
  ) into v;
  return v;
end $function$;
revoke execute on function public.doner_ozet_hesapla(date, date) from public, anon, authenticated;

create or replace function public.doner_ozet(p_bas date, p_bit date)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if not public.doner_uye() then raise exception 'doner: yetkisiz' using errcode = '42501'; end if;
  return public.doner_ozet_hesapla(p_bas, p_bit);
end $function$;
revoke execute on function public.doner_ozet(date, date) from public, anon;
grant execute on function public.doner_ozet(date, date) to authenticated;

-- 5. Mesaj metinleri ----------------------------------------------------------
create or replace function public.doner_siparis_metni(k public.kitchen_orders, p_baslik text)
returns text
language sql
stable
set search_path to 'public'
as $$
  select p_baslik || ' · ' || coalesce(k.code, '#' || k.id) || ' · ' || to_char(k.created_at at time zone 'Europe/Istanbul', 'HH24:MI') || E'\n' ||
         (case when k.code like 'P-%' or k.customer_name ilike 'not in paris%' then '🏠 Kafe' else '📱 QR' end) ||
         (case when nullif(btrim(k.customer_name), '') is not null then ' · ' || left(k.customer_name, 60) else '' end) || E'\n' ||
         coalesce((select string_agg(coalesce(it->>'qty', '1') || '× ' || coalesce(it->>'name', '?') ||
                                     (case when nullif(btrim(it->>'det'), '') is not null then ' — ' || left(it->>'det', 160) else '' end), E'\n' order by ord)
                     from jsonb_array_elements(case when jsonb_typeof(k.items) = 'array' then k.items else '[]'::jsonb end) with ordinality as x(it, ord)), '(kalem yok)') ||
         (case when nullif(btrim(k.note), '') is not null then E'\n📝 ' || left(k.note, 200) else '' end) ||
         E'\nToplam ' || public.doner_tl(coalesce(k.total, 0)::numeric);
$$;
revoke execute on function public.doner_siparis_metni(public.kitchen_orders, text) from public, anon, authenticated;

create or replace function public.doner_gunsonu_metni(p_tarih date, p_giren uuid, p_duzeltme boolean)
returns text
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare o jsonb; t record; v_gelir numeric; v_gider numeric;
begin
  o := public.doner_ozet_hesapla(p_tarih, p_tarih);
  select * into t from public.doner_gunsonu g where g.tarih = p_tarih;
  v_gelir := coalesce((o->'tezgah'->>'nakit')::numeric, 0) + coalesce((o->'tezgah'->>'kart')::numeric, 0) + coalesce((o->'qr'->>'tutar')::numeric, 0) + coalesce((o->'kafe'->>'tutar')::numeric, 0);
  v_gider := coalesce((o->'gider'->>'tutar')::numeric, 0);
  return '🧮 Gün sonu' || (case when p_duzeltme then ' (düzeltildi)' else '' end) || ' · ' || public.doner_tarih_kisa(p_tarih) || E'\n' ||
         'Tezgah ' || public.doner_tl(coalesce(t.nakit, 0) + coalesce(t.kart, 0)) || ' (nakit ' || public.doner_tl(coalesce(t.nakit, 0)) || ' · kart ' || public.doner_tl(coalesce(t.kart, 0)) || ')' || E'\n' ||
         'QR ' || public.doner_tl((o->'qr'->>'tutar')::numeric) || ' · ' || (o->'qr'->>'adet') || ' sipariş' || E'\n' ||
         'Kafeden ' || public.doner_tl((o->'kafe'->>'tutar')::numeric) || ' · ' || (o->'kafe'->>'adet') || ' adet' || E'\n' ||
         'Gider ' || public.doner_tl(v_gider) || ' · ' || (o->'gider'->>'adet') || ' kayıt' || E'\n' ||
         'Net ' || public.doner_tl(v_gelir - v_gider) ||
         (case when nullif(btrim(t.notu), '') is not null then E'\n📝 ' || left(t.notu, 200) else '' end) ||
         E'\nGiren: ' || public.doner_kullanici_adi(p_giren);
end $function$;
revoke execute on function public.doner_gunsonu_metni(date, uuid, boolean) from public, anon, authenticated;

-- 6. Tetikleyiciler (hata yutar; siparis ve giris asla durmaz) ------------------
create or replace function public.doner_tg_trg_siparis()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_bos boolean; v_eski_bos boolean;
begin
  begin
    if public.doner_ayar_oku('tg_chat') is null then return null; end if;
    if tg_op = 'INSERT' then
      if jsonb_typeof(new.items) = 'array' and jsonb_array_length(new.items) > 0 then
        perform public.doner_tg_gonder(public.doner_siparis_metni(new, '🧾 Yeni sipariş'), 'siparis');
      end if;
    elsif new.items is distinct from old.items then
      v_bos := jsonb_typeof(new.items) <> 'array' or jsonb_array_length(new.items) = 0;
      v_eski_bos := jsonb_typeof(old.items) <> 'array' or jsonb_array_length(old.items) = 0;
      if v_bos and not v_eski_bos then
        perform public.doner_tg_gonder('❌ İptal · ' || coalesce(new.code, '#' || new.id) ||
                                       (case when nullif(btrim(new.note), '') is not null then E'\n📝 ' || left(new.note, 200) else '' end), 'siparis');
      elsif not v_bos then
        perform public.doner_tg_gonder(public.doner_siparis_metni(new, '✏️ Sipariş değişti'), 'siparis');
      end if;
    end if;
  exception when others then
    null;  -- bildirim hatasi siparisi durdurmaz
  end;
  return null;
end $function$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_doner_tg_siparis' and tgrelid = 'public.kitchen_orders'::regclass) then
    create trigger trg_doner_tg_siparis
      after insert or update of items on public.kitchen_orders
      for each row execute function public.doner_tg_trg_siparis();
  end if;
end $$;

create or replace function public.doner_tg_trg_gider()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  begin
    perform public.doner_tg_gonder(
      '💸 Gider · ' || public.doner_tarih_kisa(new.tarih) || ' · ' || new.kategori || ' · ' || public.doner_tl(new.tutar) || E'\n' ||
      concat_ws(' · ', nullif(btrim(new.aciklama), ''), nullif(btrim(new.tedarikci), ''), case when nullif(btrim(new.fatura_no), '') is not null then 'no ' || new.fatura_no end) ||
      E'\nÖdeyen: ' || (case when new.odeyen = 'kasa' then 'Döner kasası' else new.odeyen end) || ' (' || new.yontem || (case when new.kdv_dahil then '' else ', KDV hariç' end) || ')' ||
      E'\nGiren: ' || public.doner_kullanici_adi(new.giren), 'gider');
  exception when others then null;
  end;
  return null;
end $function$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_doner_tg_gider' and tgrelid = 'public.doner_giderler'::regclass) then
    create trigger trg_doner_tg_gider after insert on public.doner_giderler for each row execute function public.doner_tg_trg_gider();
  end if;
end $$;

create or replace function public.doner_tg_trg_gunsonu()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  begin
    if tg_op = 'UPDATE' and new.nakit = old.nakit and new.kart = old.kart and new.notu is not distinct from old.notu then return null; end if;
    perform public.doner_tg_gonder(public.doner_gunsonu_metni(new.tarih, new.giren, tg_op = 'UPDATE'), 'gunsonu');
  exception when others then null;
  end;
  return null;
end $function$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_doner_tg_gunsonu' and tgrelid = 'public.doner_gunsonu'::regclass) then
    create trigger trg_doner_tg_gunsonu after insert or update on public.doner_gunsonu for each row execute function public.doner_tg_trg_gunsonu();
  end if;
end $$;

-- 7. 23:00 hatirlatma -----------------------------------------------------------
create or replace function public.doner_gunsonu_hatirlat()
returns bigint
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_bugun date := (now() at time zone 'Europe/Istanbul')::date; o jsonb;
begin
  if exists (select 1 from public.doner_gunsonu g where g.tarih = v_bugun) then return null; end if;
  o := public.doner_ozet_hesapla(v_bugun, v_bugun);
  return public.doner_tg_gonder(
    '⏰ Gün sonu girilmedi · ' || public.doner_tarih_kisa(v_bugun) || E'\n' ||
    'Kasayı say, nakit ve kartı gir: ' || coalesce(public.doner_ayar_oku('site'), 'https://doner.notinparis.me') || '/gunsonu' || E'\n' ||
    'Bugün QR ' || public.doner_tl((o->'qr'->>'tutar')::numeric) || ' · kafeden ' || public.doner_tl((o->'kafe'->>'tutar')::numeric) ||
    ' · gider ' || public.doner_tl((o->'gider'->>'tutar')::numeric), 'hatirlatma');
end $function$;
revoke execute on function public.doner_gunsonu_hatirlat() from public, anon, authenticated;

do $c$
begin
  if not exists (select 1 from cron.job where jobname = 'doner-gunsonu-hatirlat') then
    perform cron.schedule('doner-gunsonu-hatirlat', '0 20 * * *', 'select public.doner_gunsonu_hatirlat()');  -- 23:00 Istanbul
  end if;
end $c$;

-- 8. Admin RPC'leri (uygulama > Ayarlar) ---------------------------------------
create or replace function public.doner_tg_durum()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if not public.doner_admin() then raise exception 'doner: yetkisiz' using errcode = '42501'; end if;
  return jsonb_build_object(
    'token_var', public.doner_tg_token() is not null,
    'chat', public.doner_ayar_oku('tg_chat'),
    'chat_ad', public.doner_ayar_oku('tg_chat_ad'),
    'bul_bekliyor', public.doner_ayar_oku('tg_bul_istek') is not null,
    'site', public.doner_ayar_oku('site'),
    'son', coalesce((select jsonb_agg(jsonb_build_object('zaman', to_char(t.created_at at time zone 'Europe/Istanbul', 'DD.MM HH24:MI'), 'kaynak', t.kaynak, 'durum', t.durum, 'hata', t.son_hata, 'metin', left(t.govde->>'text', 80)) order by t.id desc)
                      from (select * from public.doner_tg_giden order by id desc limit 8) t), '[]'::jsonb));
end $function$;

create or replace function public.doner_tg_test()
returns bigint
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_id bigint;
begin
  if not public.doner_admin() then raise exception 'doner: yetkisiz' using errcode = '42501'; end if;
  if public.doner_tg_token() is null then raise exception 'Bot anahtarı yok (Vault: doner_tg_token).'; end if;
  if public.doner_ayar_oku('tg_chat') is null then raise exception 'Grup bağlı değil.'; end if;
  v_id := public.doner_tg_gonder('✅ Döner Defteri bağlandı. Siparişler, giderler ve gün sonu buraya düşer. Gün sonu girilmezse 23:00''te hatırlatırım.', 'test');
  return v_id;
end $function$;

-- Grup bulma: sahip botu gruba ekler, grupta "/baglan" yazar, uygulamada
-- "Grubu bul"a dokunur. Bot webhook kullanmadigi icin getUpdates calisir.
create or replace function public.doner_tg_grup_bul()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_token text; v_istek bigint;
begin
  if not public.doner_admin() then raise exception 'doner: yetkisiz' using errcode = '42501'; end if;
  v_token := public.doner_tg_token();
  if v_token is null then raise exception 'Bot anahtarı yok (Vault: doner_tg_token).'; end if;
  v_istek := net.http_post(
    url := 'https://api.telegram.org/bot' || v_token || '/getUpdates',
    body := jsonb_build_object('allowed_updates', jsonb_build_array('message'), 'limit', 100),
    headers := jsonb_build_object('Content-Type', 'application/json'), timeout_milliseconds := 15000);
  perform public.doner_ayar_yaz('tg_bul_istek', v_istek::text);
  return jsonb_build_object('istek', v_istek);
end $function$;

create or replace function public.doner_tg_grup_bul_sonuc()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_istek bigint; r record; v jsonb; m jsonb; v_chat text; v_ad text; v_n int := 0;
begin
  if not public.doner_admin() then raise exception 'doner: yetkisiz' using errcode = '42501'; end if;
  v_istek := public.doner_ayar_oku('tg_bul_istek')::bigint;
  if v_istek is null then return jsonb_build_object('hata', 'önce Grubu bul'); end if;
  select * into r from net._http_response x where x.id = v_istek;
  if not found then return jsonb_build_object('bekle', true); end if;
  perform public.doner_ayar_yaz('tg_bul_istek', null);
  if r.status_code is distinct from 200 then
    return jsonb_build_object('hata', coalesce(r.error_msg, r.status_code::text) ||
      case when r.status_code = 409 then ' — botta webhook kurulu; önce deleteWebhook' when r.status_code = 401 then ' — bot anahtarı yanlış' else '' end);
  end if;
  v := r.content::jsonb;
  if coalesce((v->>'ok')::boolean, false) is not true then return jsonb_build_object('hata', left(coalesce(v->>'description', 'telegram hata'), 200)); end if;
  for m in select e from jsonb_array_elements(v->'result') e order by (e->>'update_id')::bigint desc loop
    v_n := v_n + 1;
    if (m->'message'->>'text') ~* '^/(baglan|bağlan|start)(@\w+)?\s*$' then
      v_chat := m->'message'->'chat'->>'id';
      v_ad := coalesce(m->'message'->'chat'->>'title', concat_ws(' ', m->'message'->'chat'->>'first_name', m->'message'->'chat'->>'last_name'), 'sohbet');
      exit;
    end if;
  end loop;
  if v_chat is null then return jsonb_build_object('bulunamadi', true, 'mesaj', v_n); end if;
  perform public.doner_ayar_yaz('tg_chat', v_chat);
  perform public.doner_ayar_yaz('tg_chat_ad', v_ad);
  return jsonb_build_object('bagli', true, 'ad', v_ad);
end $function$;

create or replace function public.doner_tg_grup_cikar()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.doner_admin() then raise exception 'doner: yetkisiz' using errcode = '42501'; end if;
  perform public.doner_ayar_yaz('tg_chat', null);
  perform public.doner_ayar_yaz('tg_chat_ad', null);
end $function$;

revoke execute on function public.doner_tg_durum(), public.doner_tg_test(), public.doner_tg_grup_bul(), public.doner_tg_grup_bul_sonuc(), public.doner_tg_grup_cikar() from public, anon;
grant execute on function public.doner_tg_durum(), public.doner_tg_test(), public.doner_tg_grup_bul(), public.doner_tg_grup_bul_sonuc(), public.doner_tg_grup_cikar() to authenticated;

-- 9. Ortak dokumu ---------------------------------------------------------------
create or replace function public.doner_ortaklar()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare v_bugun date := (now() at time zone 'Europe/Istanbul')::date; v_ay date; v_gecen date;
begin
  if not public.doner_uye() then raise exception 'doner: yetkisiz' using errcode = '42501'; end if;
  v_ay := date_trunc('month', v_bugun)::date;
  v_gecen := (v_ay - interval '1 month')::date;
  return coalesce((
    select jsonb_agg(jsonb_build_object('ad', x.odeyen, 'tum', x.tum, 'adet', x.adet, 'bu_ay', x.bu_ay, 'gecen_ay', x.gecen_ay, 'son_tarih', x.son)
                     order by (x.odeyen = 'kasa'), x.tum desc)
      from (select g.odeyen, sum(g.tutar) as tum, count(*) as adet,
                   coalesce(sum(g.tutar) filter (where g.tarih >= v_ay), 0) as bu_ay,
                   coalesce(sum(g.tutar) filter (where g.tarih >= v_gecen and g.tarih < v_ay), 0) as gecen_ay,
                   max(g.tarih) as son
              from public.doner_giderler g group by g.odeyen) x), '[]'::jsonb);
end $function$;
revoke execute on function public.doner_ortaklar() from public, anon;
grant execute on function public.doner_ortaklar() to authenticated;

-- 10. Rusca det: " · Not: ..." parcasi --------------------------------------------
create or replace function public.nip_mutfak_parca_turkce(p text)
returns text
language sql
stable
set search_path to 'public'
as $$
  select string_agg(
           case when a.alt ~* '^\s*(not|note|примечание|заметка)\s*:' then trim(a.alt)
                else coalesce((select t.turkce from public.nip_mutfak_sozluk_tam() t where t.yabanci = trim(a.alt) order by t.oncelik limit 1), trim(a.alt)) end,
           ' · ' order by a.sira)
    from unnest(string_to_array(p, ' · ')) with ordinality as a(alt, sira);
$$;

create or replace function public.nip_mutfak_det_turkce(p_items jsonb)
returns jsonb
language sql
stable
set search_path to 'public'
as $$
  select case
    when p_items is null or jsonb_typeof(p_items) <> 'array' then p_items
    else (
      select coalesce(jsonb_agg(
               case when e.it ? 'det' and nullif(trim(e.it->>'det'), '') is not null
                    then jsonb_set(e.it, '{det}', to_jsonb((
                           select string_agg(public.nip_mutfak_parca_turkce(u.parca), ', ' order by u.parca_sira)
                             from unnest(string_to_array(e.it->>'det', ',')) with ordinality as u(parca, parca_sira)
                         )))
                    else e.it
               end
               order by e.kalem_sira), p_items)
        from jsonb_array_elements(p_items) with ordinality as e(it, kalem_sira)
    )
  end;
$$;
