-- Uygulama ici rezervasyon: musteri menusunden cikmadan etkinlige yer ayirtir.
--
-- Sahip (11.11.2026): "Menu kismindan girip etkinlikleri sectigimizde
-- rezervasyon butonuna basarsan web sitesine yonlendiriyor, bu cok sacma."
--
-- Akis:
--   1) Menu (CustomerMenu) -> RPC nip_rezervasyon_iste(json). Girdi denetlenir,
--      telefon duzeltilir, hiz siniri uygulanir.
--   2) Bu veritabani, rezervasyon sistemindeki (RESERVE) nip_order_rezervasyon
--      fonksiyonunu senkron sirriyla cagirir (Vault: reserve_sync_sir; ayni
--      desen: nip_reserve_onay_kontrol). Sir tarayiciya HIC gitmez. RESERVE
--      sitedeki kurallari uygular (uyelere ozel, kapasite, kurallar, ayni kisi
--      iki kez yazilmaz) ve talebi "bekliyor" olarak yazar.
--   3) Talep nip_rez_talepleri tablosuna da yazilir: uyenin e-postasi ve dili
--      burada durur. Rezervasyon onaylaninca onay e-postasi bu adrese, bu dilde
--      gider (nip_reserve_onaylari_isle) ve e-posta "uygulamada ac" der.
--   4) Menu -> RPC nip_rezervasyonlarim(kodlar): musteri taleplerinin durumunu
--      ve kapida gosterecegi kodu menude gorur.
-- Sahibin paneli degismez: talep Rezervasyon sayfasina "Bekleyen" olarak duser,
-- Telegram bildirimi eskisi gibi gelir (nip-reserve-bekleyen-bildirim).
--
-- KVKK: yeni veri turu ya da amac yok. Ad ve telefon ile "etkinlik kayitlarinin
-- yonetilmesi" amaci 2026-10-11 surumunde yazili; surum degismedi.
-- Hicbir nesne kaldirilmaz; tekrar calistirilabilir.

-- 1) Telefon: ulke kodlu tek bicim ("+905321234567"). Kullanilamiyorsa NULL.
create or replace function public.nip_tel_duzelt(p text)
returns text
language plpgsql
immutable
set search_path to 'public'
as $$
declare s text := btrim(coalesce(p, '')); d text; arti boolean;
begin
  arti := s like '+%' or s like '00%';
  d := regexp_replace(s, '\D', '', 'g');
  if s like '00%' then d := substr(d, 3); end if;
  if d = '' then return null; end if;
  if not arti then
    d := regexp_replace(d, '^0+', '');
    if d ~ '^5[0-9]{9}$' or d ~ '^[2-4][0-9]{9}$' then d := '90' || d;   -- TR: 10 hane
    elsif d !~ '^90[1-9][0-9]{9}$' then return null;
    end if;
  end if;
  -- ulke kodu iki kez yazilmis ya da koddan sonra 0 var
  if d ~ '^9090[1-9][0-9]{9}$' then d := substr(d, 3);
  elsif d ~ '^900[1-9][0-9]{9}$' then d := '90' || substr(d, 4);
  end if;
  if d like '90%' then
    if d ~ '^90[1-9][0-9]{9}$' then return '+' || d; else return null; end if;
  end if;
  if d ~ '^[1-9][0-9]{7,14}$' then return '+' || d; end if;
  return null;
end $$;

-- 2) Uygulamadan acilan talepler (RESERVE'deki kaydin bu taraftaki izi)
create table if not exists public.nip_rez_talepleri (
  rez_id      uuid primary key,
  qr_id       text not null unique,
  customer_id uuid,          -- customers.id (yabanci anahtar yok: musteri kaydi kalksa da iz kalir)
  cihaz       text,
  ad          text,
  telefon     text,
  eposta      text,
  dil         text not null default 'tr',
  event_id    uuid,
  etkinlik    text,
  tarih       date,
  saat        text,
  kisi        integer not null default 1,
  durum       text not null default 'pending',
  durum_at    timestamptz,
  created_at  timestamptz not null default now()
);
comment on table public.nip_rez_talepleri is
  'Musteri menusunden acilan rezervasyon talepleri: RESERVE kaydinin izi, uyenin e-postasi ve dili (20261111).';
create index if not exists nip_rez_talepleri_customer_idx on public.nip_rez_talepleri (customer_id);
create index if not exists nip_rez_talepleri_created_idx on public.nip_rez_talepleri (created_at);
alter table public.nip_rez_talepleri enable row level security;
revoke all on public.nip_rez_talepleri from anon, authenticated, public;
grant select on public.nip_rez_talepleri to authenticated;
do $p$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'nip_rez_talepleri' and policyname = 'nip_rez_talepleri_yonetici') then
    create policy nip_rez_talepleri_yonetici on public.nip_rez_talepleri
      for select to authenticated using (public.nip_yonetici_mi());
  end if;
end $p$;

-- Dakikalik sayac: hiz siniri (satir silinmez; dakikada bir satir)
create table if not exists public.nip_rez_sayac (
  dakika timestamptz primary key,
  n      integer not null default 0
);
alter table public.nip_rez_sayac enable row level security;
revoke all on public.nip_rez_sayac from anon, authenticated, public;

-- 3) RESERVE cagrisi (yalniz bu dosyadaki fonksiyonlar kullanir)
create or replace function public.nip_rez_reserve_cagir(p_fn text, p_arg json)
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_sir text;
  v_anon constant text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRpcXBhcmpydHZ2Znh2d3hlYm92Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5Mzc3OTMsImV4cCI6MjA4OTUxMzc5M30.pNI2yU6LDG8583HBPq-5puxkpEVEAYwhGp9ibJ1WBsI';
  v_status int; v_content text;
begin
  if p_fn not in ('nip_order_rezervasyon', 'nip_order_rez_durum') then return null; end if;
  select decrypted_secret into v_sir from vault.decrypted_secrets where name = 'reserve_sync_sir';
  if v_sir is null then
    insert into public.nip_reserve_bildirim_log (ok, hata) values (false, 'rez: Vault''ta reserve_sync_sir yok');
    return null;
  end if;
  begin
    perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '6000');
    select status, content into v_status, v_content
      from extensions.http((
        'POST', 'https://diqparjrtvvfxvwxebov.supabase.co/rest/v1/rpc/' || p_fn,
        array[extensions.http_header('apikey', v_anon),
              extensions.http_header('Authorization', 'Bearer ' || v_anon)],
        'application/json',
        (coalesce(p_arg::jsonb, '{}'::jsonb) || jsonb_build_object('p_sir', v_sir))::text
      )::extensions.http_request);
  exception when others then
    insert into public.nip_reserve_bildirim_log (ok, hata) values (false, 'rez ag: ' || left(sqlerrm, 300));
    return null;
  end;
  if v_status <> 200 then
    insert into public.nip_reserve_bildirim_log (ok, hata) values (false, 'rez ' || p_fn || ' ' || v_status || ' ' || left(coalesce(v_content, ''), 300));
    return null;
  end if;
  return v_content::json;
exception when others then
  return null;
end $$;
revoke all on function public.nip_rez_reserve_cagir(text, json) from public, anon, authenticated;

-- Not: anon rolunun sorgu suresi siniri 3 sn; RESERVE cagrisi icin fonksiyona
-- 10 sn tanindi (PostgREST fonksiyon ayarini cagri oncesi uygular).
-- 4) Menu: rezervasyon iste. Misafir de cagirir (acik etkinlik); uye girisi
--    varsa e-posta ve RESERVE profili SUNUCUDA bulunur, istemciden alinmaz.
--    Donen: { ok:true, kod, durum, etkinlik, tarih, saat, kisi, eposta, zaten }
--        ya { ok:false, hata }  (hata: ad | telefon | etkinlik_yok | gecti |
--           uye_gerekli | guven_dusuk | seviye_yetersiz | dolu | kural | zaten |
--           cok_hizli | baglanti)
create or replace function public.nip_rezervasyon_iste(p json)
returns json
language plpgsql
security definer
set search_path to 'public'
set statement_timeout to '10s'
as $$
declare
  v_uid uuid := auth.uid();
  c public.customers;
  v_ad text := btrim(coalesce(p->>'ad', ''));
  v_tel text := public.nip_tel_duzelt(p->>'telefon');
  v_event uuid;
  v_kisi int := 1;
  v_not text := nullif(left(btrim(coalesce(p->>'not', '')), 300), '');
  v_dil text := case when p->>'dil' in ('tr', 'en', 'ru') then p->>'dil' else 'tr' end;
  v_cihaz text := nullif(left(btrim(coalesce(p->>'cihaz', '')), 64), '');
  v_kural boolean := coalesce(p->>'kural', '') = 'true';
  -- Kuru calistirma yalniz dogrudan veritabani oturumundan (test): tarayicidan gelen istek acamaz.
  v_deneme boolean := coalesce(p->>'deneme', '') = 'true' and nullif(coalesce(auth.role(), ''), '') is null;
  v_n int;
  v_yanit json;
  v_id uuid;
begin
  if length(v_ad) < 2 or length(v_ad) > 80 then return json_build_object('ok', false, 'hata', 'ad'); end if;
  if v_tel is null then return json_build_object('ok', false, 'hata', 'telefon'); end if;
  begin v_event := (p->>'event_id')::uuid; exception when others then v_event := null; end;
  if v_event is null then return json_build_object('ok', false, 'hata', 'etkinlik_yok'); end if;
  begin v_kisi := greatest(1, least(20, coalesce((p->>'kisi')::int, 1))); exception when others then v_kisi := 1; end;

  if v_uid is not null then
    select * into c from public.customers where auth_user_id = v_uid order by created_at limit 1;
  end if;

  -- Hiz siniri: dakikada toplam 30 istek; ayni kisi 10 dakikada 5 talep
  insert into public.nip_rez_sayac (dakika, n) values (date_trunc('minute', now()), 1)
    on conflict (dakika) do update set n = public.nip_rez_sayac.n + 1
    returning n into v_n;
  if v_n > 30 then return json_build_object('ok', false, 'hata', 'cok_hizli'); end if;
  select count(*) into v_n from public.nip_rez_talepleri t
   where t.created_at > now() - interval '10 minutes'
     and (t.telefon = v_tel or (v_cihaz is not null and t.cihaz = v_cihaz) or (c.id is not null and t.customer_id = c.id));
  if v_n >= 5 then return json_build_object('ok', false, 'hata', 'cok_hizli'); end if;

  v_yanit := public.nip_rez_reserve_cagir('nip_order_rezervasyon', json_build_object('p', json_build_object(
    'event_id', v_event, 'ad', v_ad, 'telefon', v_tel, 'kisi', v_kisi, 'not', v_not, 'kural', v_kural,
    'uye', c.id is not null, 'profil_id', c.reserve_profile_id, 'eposta', c.email, 'deneme', v_deneme)));
  if v_yanit is null then return json_build_object('ok', false, 'hata', 'baglanti'); end if;
  if coalesce(v_yanit->>'ok', '') <> 'true' then
    return json_build_object('ok', false, 'hata', coalesce(v_yanit->>'kod', 'baglanti'));
  end if;

  v_id := (v_yanit->>'id')::uuid;
  insert into public.nip_rez_talepleri (rez_id, qr_id, customer_id, cihaz, ad, telefon, eposta, dil, event_id, etkinlik, tarih, saat, kisi, durum, durum_at)
  values (v_id, v_yanit->>'qr_id', c.id, v_cihaz, v_ad, v_tel, nullif(lower(btrim(coalesce(c.email, ''))), ''), v_dil, v_event,
          v_yanit->>'event_name', (v_yanit->>'event_date')::date, nullif(v_yanit->>'event_time', ''),
          coalesce((v_yanit->>'kisi')::int, v_kisi), coalesce(v_yanit->>'status', 'pending'), now())
  on conflict (rez_id) do update
     set customer_id = coalesce(excluded.customer_id, public.nip_rez_talepleri.customer_id),
         eposta = coalesce(excluded.eposta, public.nip_rez_talepleri.eposta),
         dil = excluded.dil, durum = excluded.durum, durum_at = now();

  return json_build_object('ok', true, 'zaten', coalesce(v_yanit->>'zaten', '') = 'true',
    'kod', v_yanit->>'qr_id', 'durum', coalesce(v_yanit->>'status', 'pending'),
    'etkinlik', v_yanit->>'event_name', 'tarih', v_yanit->>'event_date', 'saat', nullif(v_yanit->>'event_time', ''),
    'kisi', coalesce((v_yanit->>'kisi')::int, v_kisi), 'eposta', c.email is not null and btrim(c.email) <> '');
end $$;
revoke all on function public.nip_rezervasyon_iste(json) from public;
grant execute on function public.nip_rezervasyon_iste(json) to anon, authenticated;

-- 5) Menu: rezervasyonlarim. Uye kendi taleplerini, misafir elindeki kodlarin
--    taleplerini gorur (kod = bilet; ad ve telefon DONMEZ). Bekleyen / onayli
--    olanlarin durumu RESERVE'den tazelenir.
create or replace function public.nip_rezervasyonlarim(p_kodlar text[] default null)
returns json
language plpgsql
security definer
set search_path to 'public'
set statement_timeout to '10s'
as $$
declare
  v_uid uuid := auth.uid();
  c public.customers;
  v_kodlar text[];
  v_ids uuid[];
  v_yanit json;
  v_bugun date := (now() at time zone 'Europe/Istanbul')::date;
begin
  select array_agg(k) into v_kodlar from (
    select distinct upper(btrim(x)) as k from unnest(coalesce(p_kodlar, '{}'::text[])) x
     where upper(btrim(x)) ~ '^[A-Z0-9]{2,6}-[A-Z0-9]{6,12}$' limit 20) q;
  v_kodlar := coalesce(v_kodlar, '{}'::text[]);
  if v_uid is not null then
    select * into c from public.customers where auth_user_id = v_uid order by created_at limit 1;
  end if;

  -- Misafirken acilan talep, giris yapinca hesaba baglanir (onay e-postasi da gelsin)
  if c.id is not null and array_length(v_kodlar, 1) > 0 then
    update public.nip_rez_talepleri t
       set customer_id = c.id,
           eposta = coalesce(t.eposta, nullif(lower(btrim(coalesce(c.email, ''))), ''))
     where t.customer_id is null and t.qr_id = any(v_kodlar);
  end if;

  select array_agg(t.rez_id) into v_ids from public.nip_rez_talepleri t
   where ((c.id is not null and t.customer_id = c.id) or t.qr_id = any(v_kodlar))
     and t.durum in ('pending', 'approved')
     and (t.durum_at is null or t.durum_at < now() - interval '20 seconds')
     and (t.tarih is null or t.tarih >= v_bugun - 1);
  if v_ids is not null then
    v_yanit := public.nip_rez_reserve_cagir('nip_order_rez_durum', json_build_object('p_ids', v_ids));
    if v_yanit is not null then
      update public.nip_rez_talepleri t set durum = x.status, durum_at = now()
        from json_to_recordset(v_yanit) as x(id uuid, status text)
       where t.rez_id = x.id and x.status is not null;
      -- RESERVE'de artik olmayan kayit listede gosterilmez
      update public.nip_rez_talepleri t set durum = 'yok', durum_at = now()
       where t.rez_id = any(v_ids)
         and not exists (select 1 from json_to_recordset(v_yanit) as x(id uuid) where x.id = t.rez_id);
    end if;
  end if;

  return coalesce((
    select json_agg(json_build_object('kod', t.qr_id, 'etkinlik', t.etkinlik, 'tarih', t.tarih, 'saat', t.saat,
                                      'kisi', t.kisi, 'durum', t.durum) order by t.tarih, t.created_at)
      from public.nip_rez_talepleri t
     where ((c.id is not null and t.customer_id = c.id) or t.qr_id = any(v_kodlar))
       and t.durum <> 'yok'
       and (t.tarih is null or t.tarih >= v_bugun - 1)), '[]'::json);
end $$;
revoke all on function public.nip_rezervasyonlarim(text[]) from public;
grant execute on function public.nip_rezervasyonlarim(text[]) to anon, authenticated;

-- 6) Onay e-postasi: uygulamadan acilan talepte adres ve dil bu taraftan gelir,
--    e-posta "uygulamada ac" der (kaynak = 'uygulama').
alter table public.nip_reserve_onay_bildirim add column if not exists kaynak text not null default 'site';

create or replace function public.nip_reserve_onaylari_isle(p json)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare r record; n int := 0; v_eposta text; t public.nip_rez_talepleri;
begin
  for r in
    select * from json_to_recordset(coalesce(p, '[]'::json))
      as x(id uuid, name text, phone text, email text, lang text, event_name text, event_date date, event_time text, guest_count int, qr_id text, approved_at timestamptz)
  loop
    if r.id is null then continue; end if;
    t := null;
    select * into t from public.nip_rez_talepleri where rez_id = r.id;
    v_eposta := coalesce(nullif(lower(btrim(coalesce(r.email, ''))), ''), nullif(lower(btrim(coalesce(t.eposta, ''))), ''));
    insert into public.nip_reserve_onay_bildirim (rez_id, ad, eposta, telefon, dil, etkinlik, tarih, saat, kisi, qr_id, onay_at, durum, kaynak)
    values (r.id, r.name, v_eposta, r.phone, coalesce(t.dil, r.lang, 'tr'), r.event_name, r.event_date, nullif(r.event_time, ''),
            coalesce(r.guest_count, 1), r.qr_id, r.approved_at,
            case when v_eposta is null then 'eposta_yok' else 'bekliyor' end,
            case when t.rez_id is not null then 'uygulama' else 'site' end)
    on conflict (rez_id) do nothing;
    if found then n := n + 1; end if;
    if t.rez_id is not null and t.durum is distinct from 'approved' then
      update public.nip_rez_talepleri set durum = 'approved', durum_at = now() where rez_id = r.id;
    end if;
  end loop;
  return n;
end $$;
revoke all on function public.nip_reserve_onaylari_isle(json) from public, anon, authenticated;

-- Gonderici: kayda 'kaynak' eklenir (rez-bildirim e-postanin baglantisini buna gore secer)
create or replace function public.nip_reserve_onay_gonder(p_gecerli uuid[])
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare sec text; v_kayitlar jsonb; v_idler uuid[]; n int;
begin
  select value into sec from public.bot_config where key = 'webhook_secret';
  if sec is null then return 0; end if;

  if p_gecerli is null then return 0; end if;

  with secilen as (
    select b.rez_id from public.nip_reserve_onay_bildirim b
     where b.durum in ('bekliyor', 'hata') and b.eposta is not null and b.deneme < 3
       and b.rez_id = any(p_gecerli)
       and (b.tarih is null or b.tarih >= public.nip_business_day(now()) - 1)
       and (b.son is null or b.son < now() - case when b.hata in ('anahtar-yok', 'gonderici-yok') then interval '60 minutes' else interval '15 minutes' end)
     order by b.ilk limit 40
     for update skip locked
  ), isaretli as (
    update public.nip_reserve_onay_bildirim b set son = now(), deneme = b.deneme + 1
      from secilen s where b.rez_id = s.rez_id
    returning b.*
  )
  select jsonb_agg(jsonb_build_object('rez_id', i.rez_id, 'ad', i.ad, 'eposta', i.eposta, 'dil', i.dil, 'etkinlik', i.etkinlik,
                                      'tarih', i.tarih, 'saat', i.saat, 'kisi', i.kisi, 'qr_id', i.qr_id, 'deneme', i.deneme, 'kaynak', i.kaynak)),
         array_agg(i.rez_id)
    into v_kayitlar, v_idler
    from isaretli i;
  n := coalesce(array_length(v_idler, 1), 0);
  if n = 0 then return 0; end if;

  perform net.http_post(
    url := 'https://gbbxxcduuwdmvfayxzeg.supabase.co/functions/v1/rez-bildirim',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-nip-cron', sec),
    body := jsonb_build_object('kayitlar', v_kayitlar),
    timeout_milliseconds := 45000);
  return n;
exception when others then return 0;
end $$;
revoke all on function public.nip_reserve_onay_gonder(uuid[]) from public, anon, authenticated;
