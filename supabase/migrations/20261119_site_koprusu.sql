-- ============================================================================
-- WEB SITESI KOPRUSU (ORDER)                              20261119_site_koprusu
-- ============================================================================
-- Sahip (17.11.2026): "Hali hazirda olan partileri de tasi. Web sitesiyle
-- entegre partiler oldugunu unutma."  Sahip (18.11.2026): "Kopru kur, site
-- ayni kalsin."
--
-- Web sitesi (notinparis.me, Shopify temasi) ve rezervasyon sitesi parti
-- listesini ve siteden yapilan rezervasyonu DOGRUDAN eski rezervasyon
-- veritabanindan (RESERVE) okuyup yaziyor; uye girisi de orada. Gecisten sonra
-- partileri ve rezervasyonlari Order yonetir, site DEGISMEZ. Bu dosya ikisini
-- bagli tutan kopruyu ekler (5 dakikada bir tur):
--
--   Order -> RESERVE  parti listesi (ayrica panelde kaydedince hemen)
--   Order -> RESERVE  rezervasyon durumu (onay, red, giris, gelmedi)
--   RESERVE -> Order  siteden gelen yeni talepler; bekleyen talepte uyenin
--                     duzelttigi alanlar; uyenin sitede kaldirdigi talep
--
-- Anahtar (nip_rez_ayar.yerel) KAPALIYKEN kopru hicbir sey yapmaz: zamanlanmis
-- is hemen doner, RESERVE tarafindaki uclar "tasinmadi" der. Bugunku akis
-- degismez.
--
-- GECIS tek cagridir (yalniz SQL oturumu):
--     select public.nip_rez_gecis_yap(true);          -- gec
--     select public.nip_rez_gecis_yap(false);         -- geri don (son durumlar yollanir)
--     select public.nip_rez_gecis_yap(false, true);   -- kopru bozukken zorla geri don
--                                                        (donen "uyari" alanina bak)
-- Sirasi: RESERVE'de gecis isareti acilir (oradaki paneller durum ve parti
-- yazamaz) -> son veri kopyasi -> anahtar acilir -> parti listesi ve durumlar
-- yollanir. Kopya ya da anahtar adimi hata verirse Order geri sarilir ve
-- RESERVE isareti yeniden kapatilir. Iki veritabani tek islem DEGILDIR: cagri
-- geri sarilan bir islemin (begin ... rollback) icinde CALISTIRILMAZ; isaret
-- acik kalir. Supheli durumda ayni cagri yeniden calistirilir (zararsiz).
--
-- Bagimsiz incelemelerin (18.11, 20.11 ve 25.11.2026) bulgulari bu dosyada kapatildi:
-- gecis sirasi ve telafi, tur adimlari birbirinden ayri, uye bagi sonradan,
-- sitede duzeltilen / kaldirilan talep, geri donuste son yollama (basarisizsa
-- donulmez), ikinci geciste yerel kayitlarin ve sayac isaretlerinin korunmasi,
-- ariza uyarisi ile alinamayan talep uyarisinin ayri sayilmasi, tur boyunca
-- anahtar kilidi, kilit sirasi, siteden yazilan zaman alanlarina guvenilmemesi,
-- geri donuste kapali isaretin yeniden acilip son kararlarin yollanmasi, zorla
-- geri donusun kopru tamamen bozukken de tamamlanmasi, cekme calismayan turda
-- alinamayan talep sayacina dokunulmamasi.
--
-- Yalniz EKLEME; tekrar calistirilabilir. Hicbir nesne ya da satir kaldirilmaz.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0) KOLONLAR
-- ----------------------------------------------------------------------------
-- Kayit RESERVE'den mi geldi (web sitesi / rezervasyon sitesi / gecis kopyasi)?
-- Menuden acilan yerel talepte false. Kopru yalniz bu isaretli kayitlari
-- RESERVE ile karsilastirir. (profile_id yetmez: site misafir talebi de alir.)
alter table public.reservations add column if not exists site_kaydi boolean not null default false;
comment on column public.reservations.site_kaydi is
  'true: kayit eski rezervasyon veritabanindan geldi (site talebi ya da gecis kopyasi). false: menuden acilan yerel talep (20261119).';
-- Anahtarin ILK acildigi an. Dolu ise veri kopyasi uye sayaclarina dokunmaz.
alter table public.nip_rez_ayar add column if not exists ilk_gecis timestamptz;
comment on column public.nip_rez_ayar.ilk_gecis is
  'Anahtarin ilk acildigi an (gecis). Bos: hic gecilmedi.';
-- Kopru turu art arda kac kez hata verdi (0 = saglam). 3. hatada yonetici uyarilir.
alter table public.nip_rez_ayar add column if not exists kopru_hata integer not null default 0;
comment on column public.nip_rez_ayar.kopru_hata is
  'Web sitesi koprusu art arda kac tur ARIZA verdi (ag, sir, istisna); arizasiz turda sifirlanir.';
-- Siteden gelip alinamayan bekleyen talep kac turdur duruyor (0 = yok). Ariza
-- sayacindan AYRI: tek bozuk kayit ariza uyarisini bastirmasin (inceleme 20.11).
alter table public.nip_rez_ayar add column if not exists kopru_talep integer not null default 0;
comment on column public.nip_rez_ayar.kopru_talep is
  'Siteden gelip panele alinamayan bekleyen talep kac turdur duruyor; talep kalmayinca sifirlanir.';

-- ----------------------------------------------------------------------------
-- 1) RESERVE'deki kopru uclarini cagiran yardimci (yalniz izinli uc adlari)
-- ----------------------------------------------------------------------------
create or replace function public.nip_rez_site_cagir(p_fn text, p_arg json)
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
  if p_fn not in ('nip_order_gecis_yaz', 'nip_order_etkinlik_yaz', 'nip_order_rez_durum_yaz') then
    return json_build_object('ok', false, 'hata', 'izinsiz-uc');
  end if;
  select decrypted_secret into v_sir from vault.decrypted_secrets where name = 'reserve_sync_sir';
  if v_sir is null then return json_build_object('ok', false, 'hata', 'sir-yok'); end if;
  begin
    perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '15000');
    select status, content into v_status, v_content
      from extensions.http((
        'POST', 'https://diqparjrtvvfxvwxebov.supabase.co/rest/v1/rpc/' || p_fn,
        array[extensions.http_header('apikey', v_anon),
              extensions.http_header('Authorization', 'Bearer ' || v_anon)],
        'application/json',
        (coalesce(p_arg::jsonb, '{}'::jsonb) || jsonb_build_object('p_sir', v_sir))::text
      )::extensions.http_request);
  exception when others then
    return json_build_object('ok', false, 'hata', 'ag', 'ayrinti', left(sqlerrm, 200));
  end;
  if v_status <> 200 then
    return json_build_object('ok', false, 'hata', 'yanit', 'durum', v_status, 'ayrinti', left(coalesce(v_content, ''), 200));
  end if;
  return v_content::json;
exception when others then
  return json_build_object('ok', false, 'hata', 'beklenmedik', 'ayrinti', left(sqlerrm, 200));
end $$;
revoke all on function public.nip_rez_site_cagir(text, json) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2) VERI KOPYASI / CEKME (20261118'deki fonksiyonun yeni surumu)
--    Anahtar KAPALI: RESERVE ana kaynak (gecis kopyasi). Degisen:
--      * yalniz siteden gelen kayit (site_kaydi) kapanir; yerel talep kapanmaz
--      * uye sayaclari yalniz ILK gecisten once yazilir
--    Anahtar ACIK (kopru turu): yalniz eksik 'pending' talep eklenir. Yeni:
--      * uye bagi sonradan kurulur          * bekleyen talepte uyenin duzelttigi
--        alanlar alinir                     * sitede kaldirilan acik talep kapanir
--      * alinamayan bekleyen talep sayilir (tur hata sayar, yonetici uyarilir)
--    Ad: saklanan deger ile suzulen deger ayni ifadedir (kisit: 2-80 harf).
-- ----------------------------------------------------------------------------
create or replace function public.nip_rez_gecis_ad(p text)
returns text
language sql
immutable
set search_path to 'public'
as $$
  select btrim(left(btrim(coalesce(p, '')), 80));
$$;
revoke all on function public.nip_rez_gecis_ad(text) from public, anon, authenticated;

create or replace function public.nip_rez_gecis_kopyala(p_yaz boolean default false, p_kisisel boolean default false)
returns json
language plpgsql
security definer
set search_path to 'public'
set statement_timeout to '60s'
as $$
declare
  v_sir text;
  v_anon constant text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRpcXBhcmpydHZ2Znh2d3hlYm92Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5Mzc3OTMsImV4cCI6MjA4OTUxMzc5M30.pNI2yU6LDG8583HBPq-5puxkpEVEAYwhGp9ibJ1WBsI';
  v_url  constant text := 'https://diqparjrtvvfxvwxebov.supabase.co/rest/v1/rpc/nip_gecis_verisi';
  v_status int; v_content text; v json;
  v_yerel boolean := public.nip_rez_yerel_mi();
  v_kisisel boolean := coalesce(p_yaz, false) and coalesce(p_kisisel, false);
  n_etk int; n_etk_yeni int; n_etk_yazilan int := 0; n_etk_kapanan int := 0;
  n_rez int; n_rez_yeni int; n_rez_uye int; n_rez_sorunlu int; n_rez_yazilan int := 0; n_rez_kapanan int := 0;
  n_rez_atlanan int := 0;
  n_kisi_kirpilan int; v_sorunlu json;
  n_uye int; n_uye_eslesen int; n_uye_yazilan int := 0; n_uye_sifirlanan int := 0;
  v_ilk timestamptz;                       -- anahtar daha once acildi mi (ilk gecis ani)
  n_rez_baglanan int := 0; n_rez_guncellenen int := 0;
  n_bek_sorunlu int := 0; v_bek_sorunlu text;
  v_x record; v_r public.reservations; v_event uuid;
begin
  -- Yalniz SQL oturumu / zamanlanmis is (istek rolu yok). Tarayici oturumu cagiramaz.
  if coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') <> '' then
    raise exception 'dogrudan cagrilamaz' using errcode = '42501';
  end if;

  select decrypted_secret into v_sir from vault.decrypted_secrets where name = 'reserve_sync_sir';
  if v_sir is null then return json_build_object('ok', false, 'hata', 'sir-yok'); end if;
  begin
    perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '30000');
    select status, content into v_status, v_content
      from extensions.http((
        'POST', v_url,
        array[extensions.http_header('apikey', v_anon),
              extensions.http_header('Authorization', 'Bearer ' || v_anon)],
        'application/json',
        json_build_object('p_sir', v_sir)::text
      )::extensions.http_request);
  exception when others then
    return json_build_object('ok', false, 'hata', 'ag', 'ayrinti', left(sqlerrm, 200));
  end;
  if v_status <> 200 then
    return json_build_object('ok', false, 'hata', 'yanit', 'durum', v_status, 'ayrinti', left(coalesce(v_content, ''), 200));
  end if;
  v := v_content::json;
  select a.ilk_gecis into v_ilk from public.nip_rez_ayar a where a.tek;

  select count(*) into n_etk from public.nip_rez_gecis_etk(v) g where g.id is not null;
  -- Anahtar acikken parti EKLENMEZ (Order ana kaynak; Order'da kaldirilan parti geri gelmesin)
  select count(*) into n_etk_yeni from public.nip_rez_gecis_etk(v) g
   where not v_yerel and g.id is not null and g.name is not null and g.date is not null
     and not exists (select 1 from public.events e where e.id = g.id);
  select count(*) into n_rez from public.nip_rez_gecis_rez(v) g where g.id is not null;
  -- Yazilabilir ve henuz burada olmayan satir (yazinca eklenecek olan).
  -- Anahtar acikken yalniz 'pending' eklenir; digerleri "atlanan" sayilir.
  select count(*) filter (where not v_yerel or g.status = 'pending'),
         count(*) filter (where v_yerel and g.status <> 'pending')
    into n_rez_yeni, n_rez_atlanan
    from public.nip_rez_gecis_rez(v) g
   where g.id is not null and length(public.nip_rez_gecis_ad(g.name)) >= 2 and coalesce(g.qr_id, '') <> ''
     and g.status in ('pending', 'approved', 'used', 'rejected', 'cancelled', 'no_show')
     and not exists (select 1 from public.reservations r where r.id = g.id or r.qr_id = g.qr_id);
  select count(*) into n_rez_uye from public.nip_rez_gecis_rez(v) g
   where (g.profile_id is not null and exists (select 1 from public.customers k where k.reserve_profile_id = g.profile_id))
      or exists (select 1 from public.nip_rez_talepleri t join public.customers k on k.id = t.customer_id where t.rez_id = g.id);
  -- Order kisitlarina sigmayan satir (ad 2 harften kisa, kod bos, bilinmeyen
  -- durum) YAZILMAZ; raporda sayisi ve ilk 20 kimligi doner, elle bakilir.
  select count(*), json_agg(json_build_object('id', q.id, 'kod', q.qr_id, 'durum', q.status)) filter (where q.sira <= 20)
    into n_rez_sorunlu, v_sorunlu
    from (select g.id, g.qr_id, g.status, row_number() over (order by g.created_at) as sira
            from public.nip_rez_gecis_rez(v) g
           where g.id is not null and (length(public.nip_rez_gecis_ad(g.name)) < 2 or coalesce(g.qr_id, '') = ''
              or g.status not in ('pending', 'approved', 'used', 'rejected', 'cancelled', 'no_show'))) q;
  -- Kisi sayisi 1-20 disinda olan satir yazilir ama sayi sinira cekilir
  select count(*) into n_kisi_kirpilan from public.nip_rez_gecis_rez(v) g
   where g.id is not null and coalesce(g.guest_count, 1) not between 1 and 20;
  -- RESERVE'de artik olmayan satirlar (yalniz anahtar kapaliyken kapanir; asagida).
  -- Kuru calistirmada "kapanacak" sayisidir; yazinca gercek sayi ile degisir.
  if not v_yerel and n_etk > 0 then
    select count(*) into n_etk_kapanan from public.events e
     where e.status <> 'archived' and not exists (select 1 from public.nip_rez_gecis_etk(v) g where g.id = e.id);
  end if;
  if not v_yerel and n_rez > 0 then
    select count(*) into n_rez_kapanan from public.reservations r
     where r.site_kaydi and r.status in ('pending', 'approved', 'no_show')
       and not exists (select 1 from public.nip_rez_gecis_rez(v) g where g.id = r.id);
  end if;
  if v_yerel and n_rez > 0 then
    select count(*) into n_rez_kapanan from public.reservations r
     where r.site_kaydi and r.status in ('pending', 'approved') and r.no_show_at is null
       and not exists (select 1 from public.nip_rez_gecis_rez(v) g where g.id = r.id);
  end if;
  -- Anahtar acikken: sitede BEKLEYEN ama buraya alinamayan talep (ad cok kisa,
  -- kod bos ya da kod baska bir kayitta). Yalniz Order'da duran, tarihi gecmemis
  -- bir partiye aitse sayilir (siteden yazilan tarih alanina guvenilmez; parti
  -- gecince kayit kendiliginden sayilmaz). Yonetici ayri bir uyariyla haber alir.
  if v_yerel then
    select count(*), string_agg(coalesce(nullif(q.qr_id, ''), left(q.id::text, 8)), ', ') filter (where q.sira <= 3)
      into n_bek_sorunlu, v_bek_sorunlu
      from (select g.id, g.qr_id, row_number() over (order by g.created_at) as sira
              from public.nip_rez_gecis_rez(v) g
             where g.id is not null and g.status = 'pending'
               and exists (select 1 from public.events e where e.id = g.event_id and e.date >= current_date - 1)
               and not exists (select 1 from public.reservations r where r.id = g.id)
               and (length(public.nip_rez_gecis_ad(g.name)) < 2 or coalesce(g.qr_id, '') = ''
                    or exists (select 1 from public.reservations r2 where r2.qr_id = g.qr_id and r2.id <> g.id))) q;
  end if;
  select count(*) into n_uye from public.nip_rez_gecis_uye(v) g where g.id is not null;
  select count(*) into n_uye_eslesen from public.nip_rez_gecis_uye(v) g
   where exists (select 1 from public.customers k where k.reserve_profile_id = g.id);

  if coalesce(p_yaz, false) and not v_yerel then
    -- ETKINLIK (parti). Yalniz anahtar KAPALIYKEN: RESERVE ana kaynaktir, var
    -- olan satir oradaki haline getirilir. Anahtar acikken parti ne eklenir ne
    -- degisir (Order ana kaynak; inceleme 18.11: Order'da kaldirilan parti her
    -- turda geri geliyordu).
    insert into public.events as e (id, name, genre, subtitle, date, "time", time_end, warmup_name, warmup_start, warmup_end,
                                    capacity, approved_count, access_type, rules, rules_en, rules_ru, color, note, status, created_at)
    select g.id, g.name, g.genre, g.subtitle, g.date, g."time", g.time_end, g.warmup_name, g.warmup_start, g.warmup_end,
           greatest(1, coalesce(g.capacity, 100)), greatest(0, coalesce(g.approved_count, 0)),
           case when coalesce(g.access_type, 'open') = 'open' then 'open' else 'members_only' end,
           g.rules, g.rules_en, g.rules_ru, g.color, g.note,
           case when g.status in ('active', 'cancelled', 'archived') then g.status else 'archived' end,
           coalesce(g.created_at, now())
      from public.nip_rez_gecis_etk(v) g
     where g.id is not null and g.name is not null and g.date is not null
    on conflict (id) do update
       set name = excluded.name, genre = excluded.genre, subtitle = excluded.subtitle, date = excluded.date,
           "time" = excluded."time", time_end = excluded.time_end, warmup_name = excluded.warmup_name,
           warmup_start = excluded.warmup_start, warmup_end = excluded.warmup_end, capacity = excluded.capacity,
           approved_count = excluded.approved_count, access_type = excluded.access_type, rules = excluded.rules,
           rules_en = excluded.rules_en, rules_ru = excluded.rules_ru, color = excluded.color, note = excluded.note,
           status = excluded.status
     where (e.name, e.genre, e.subtitle, e.date, e."time", e.time_end, e.warmup_name, e.warmup_start, e.warmup_end,
            e.capacity, e.approved_count, e.access_type, e.rules, e.rules_en, e.rules_ru, e.color, e.note, e.status)
           is distinct from
           (excluded.name, excluded.genre, excluded.subtitle, excluded.date, excluded."time", excluded.time_end,
            excluded.warmup_name, excluded.warmup_start, excluded.warmup_end, excluded.capacity, excluded.approved_count,
            excluded.access_type, excluded.rules, excluded.rules_en, excluded.rules_ru, excluded.color, excluded.note,
            excluded.status);
    get diagnostics n_etk_yazilan = row_count;

    -- RESERVE'de artik olmayan parti (orada kaldirildi ya da arsive gitti)
    -- burada 'archived' olur; satir kalir. Liste bos geldiyse dokunulmaz.
    n_etk_kapanan := 0;
    if n_etk > 0 then
      update public.events e set status = 'archived'
       where e.status <> 'archived'
         and not exists (select 1 from public.nip_rez_gecis_etk(v) g where g.id = e.id);
      get diagnostics n_etk_kapanan = row_count;
    end if;
  end if;

  if v_kisisel then
    -- REZERVASYON (kisisel veri; yalniz p_kisisel ile). Kodu baska bir kimlikte
    -- kullanilan satir atlanir. Anahtar kapaliyken var olan satir RESERVE'deki
    -- haline getirilir; acikken yalniz burada hic olmayan 'pending' satir
    -- eklenir (inceleme 18.11: acikken 'used' / 'no_show' gelen satir sayac
    -- isaretini tasiyor ama sayaci artirmiyordu).
    insert into public.reservations as r (id, qr_id, event_id, event_name, event_date, event_time, name, phone, guest_count,
                                          guest_names, note, status, rules_accepted, profile_id, customer_id, email, lang, device,
                                          approved_at, checked_in_at, no_show_at, came_counted, no_show_counted, created_at,
                                          site_kaydi)
    select g.id, g.qr_id, ev.id,
           coalesce(ev.name, g.event_name), coalesce(ev.date, g.event_date), coalesce(nullif(ev."time", ''), g.event_time),
           public.nip_rez_gecis_ad(g.name),
           left(coalesce(public.nip_tel_duzelt(g.phone), btrim(coalesce(g.phone, ''))), 32),
           greatest(1, least(20, coalesce(g.guest_count, 1))),
           g.guest_names, nullif(left(coalesce(g.note, ''), 300), ''),
           case when g.status = 'approved' and g.no_show_at is not null then 'no_show' else g.status end,
           coalesce(g.rules_accepted, false), g.profile_id, coalesce(k.id, tk.id),
           coalesce(nullif(lower(btrim(t.eposta)), ''), nullif(lower(btrim(g.email)), '')),
           case when coalesce(t.dil, g.lang) in ('tr', 'en', 'ru') then coalesce(t.dil, g.lang) else 'tr' end,
           t.cihaz,
           -- Anahtar acikken eklenen kayit tanim geregi 'pending'dir: onay / giris /
           -- gelmedi ani alinmaz (RESERVE'de bu alanlari tarayici yazabiliyor).
           case when v_yerel then null else g.approved_at end,
           case when v_yerel then null else g.checked_in_at end,
           case when v_yerel then null else g.no_show_at end,
           -- Sayac isaretleri yalniz RESERVE'nin toplamina GIRMIS kayitta (profilli)
           -- ve yalniz ILK geciste: sonraki geciste sayaclar yazilmaz, isaret de
           -- yazilmaz (isaret = "bu kayit Order sayacina eklendi"; inceleme 20.11).
           (v_ilk is null and g.status = 'used' and k.id is not null),
           (v_ilk is null and g.status = 'approved' and g.no_show_at is not null and k.id is not null),
           -- Olusturma ani ileri bir tarih olamaz (hiz siniri bu alana bakar).
           least(coalesce(g.created_at, now()), now()),
           true
      from public.nip_rez_gecis_rez(v) g
      left join public.events ev on ev.id = g.event_id
      left join lateral (select c.id from public.customers c where c.reserve_profile_id = g.profile_id
                          order by c.created_at limit 1) k on true
      left join public.nip_rez_talepleri t on t.rez_id = g.id
      left join public.customers tk on tk.id = t.customer_id
     where g.id is not null and length(public.nip_rez_gecis_ad(g.name)) >= 2 and coalesce(g.qr_id, '') <> ''
       and g.status in ('pending', 'approved', 'used', 'rejected', 'cancelled', 'no_show')
       and (not v_yerel or (g.status = 'pending'
                            and not exists (select 1 from public.reservations y where y.id = g.id)))
       and not exists (select 1 from public.reservations x where x.qr_id = g.qr_id and x.id <> g.id)
    on conflict (id) do update
       set qr_id = excluded.qr_id, event_id = excluded.event_id, event_name = excluded.event_name,
           event_date = excluded.event_date, event_time = excluded.event_time, name = excluded.name,
           phone = excluded.phone, guest_count = excluded.guest_count, guest_names = excluded.guest_names,
           note = excluded.note, status = excluded.status, rules_accepted = excluded.rules_accepted,
           profile_id = excluded.profile_id, customer_id = excluded.customer_id, email = excluded.email,
           lang = excluded.lang, device = excluded.device, approved_at = excluded.approved_at,
           checked_in_at = excluded.checked_in_at, no_show_at = excluded.no_show_at,
           came_counted = case when v_ilk is null then excluded.came_counted else r.came_counted end,
           no_show_counted = case when v_ilk is null then excluded.no_show_counted else r.no_show_counted end,
           site_kaydi = true
     where not v_yerel
       and (r.qr_id, r.event_id, r.event_name, r.event_date, r.event_time, r.name, r.phone, r.guest_count, r.guest_names,
            r.note, r.status, r.rules_accepted, r.profile_id, r.customer_id, r.email, r.lang, r.device, r.approved_at,
            r.checked_in_at, r.no_show_at, r.came_counted, r.no_show_counted, r.site_kaydi)
           is distinct from
           (excluded.qr_id, excluded.event_id, excluded.event_name, excluded.event_date, excluded.event_time, excluded.name,
            excluded.phone, excluded.guest_count, excluded.guest_names, excluded.note, excluded.status,
            excluded.rules_accepted, excluded.profile_id, excluded.customer_id, excluded.email, excluded.lang,
            excluded.device, excluded.approved_at, excluded.checked_in_at, excluded.no_show_at,
            case when v_ilk is null then excluded.came_counted else r.came_counted end,
            case when v_ilk is null then excluded.no_show_counted else r.no_show_counted end, true);
    get diagnostics n_rez_yazilan = row_count;

    if not v_yerel then
      -- RESERVE'de artik olmayan ACIK rezervasyon (uye ya da yonetici orada
      -- kaldirdi) burada 'cancelled' olur; satir kalir. Bitmis kayit (girdi,
      -- red) oldugu gibi durur. YALNIZ siteden gelen kayit (site_kaydi):
      -- anahtar bir kez acilip geri kapandiysa burada menuden acilmis yerel
      -- talepler de vardir; onlar RESERVE'de hic olmadi, kapanmaz (inceleme
      -- 18.11). Liste bos geldiyse dokunulmaz.
      n_rez_kapanan := 0;
      if n_rez > 0 then
        update public.reservations r set status = 'cancelled'
         where r.site_kaydi and r.status in ('pending', 'approved', 'no_show')
           and not exists (select 1 from public.nip_rez_gecis_rez(v) g where g.id = r.id);
        get diagnostics n_rez_kapanan = row_count;
      end if;
    end if;

    if not v_yerel and v_ilk is null then
      -- UYE SAYACLARI: yalniz ILK gecisten once. Anahtar bir kez acildiysa
      -- Order kendi sayacini tutmustur; RESERVE toplami o donemi bilmez,
      -- ustune yazilirsa giris / gelmedi kayitlari kaybolur (inceleme 18.11).
      update public.customers k
         set rez_geldi = greatest(0, coalesce(g.geldi, 0)), rez_gelmedi = greatest(0, coalesce(g.gelmedi, 0))
        from public.nip_rez_gecis_uye(v) g
       where k.reserve_profile_id = g.id
         and (k.rez_geldi is distinct from greatest(0, coalesce(g.geldi, 0))
           or k.rez_gelmedi is distinct from greatest(0, coalesce(g.gelmedi, 0)));
      get diagnostics n_uye_yazilan = row_count;
      -- Listede olmayan uye (RESERVE'de gecmisi sifira donmus): onceki kopyanin
      -- yazdigi sayac sifirlanir. Liste yalniz gecmisi olanlari tasir.
      update public.customers k set rez_geldi = 0, rez_gelmedi = 0
       where k.reserve_profile_id is not null and (k.rez_geldi <> 0 or k.rez_gelmedi <> 0)
         and not exists (select 1 from public.nip_rez_gecis_uye(v) g where g.id = k.reserve_profile_id);
      get diagnostics n_uye_sifirlanan = row_count;
    end if;

    if v_yerel then
      -- ANAHTAR ACIKKEN (kopru turu). Web sitesi uyesi talebini sitede hala
      -- duzeltebilir ya da kaldirabilir (RESERVE: res_own, nip_rez_koru); Order
      -- bunu yalniz buradan ogrenir (inceleme 18.11).

      -- (a) Sitede KALDIRILAN acik talep burada 'cancelled' olur; onayliysa yeri
      --     bosalir, yoldaki onay e-postasi durur. Kilit sirasi onay / red ile
      --     ayni (once parti, sonra rezervasyon). Bu adim ILK calisir: sonraki
      --     adimlar rezervasyon satiri kilitler; parti kilidi onlardan sonra
      --     istenirse onay / red ile karsilikli kilitlenme olabilirdi (inceleme
      --     20.11). Liste bos geldiyse dokunulmaz.
      n_rez_kapanan := 0;
      if n_rez > 0 then
        for v_x in
          select q.id from public.reservations q
           where q.site_kaydi and q.status in ('pending', 'approved') and q.no_show_at is null
             and not exists (select 1 from public.nip_rez_gecis_rez(v) g where g.id = q.id)
        loop
          select q.event_id into v_event from public.reservations q where q.id = v_x.id;
          if v_event is not null then
            perform 1 from public.events e where e.id = v_event for update;
          end if;
          select * into v_r from public.reservations q where q.id = v_x.id for update;
          if v_r.id is null or v_r.event_id is distinct from v_event
             or v_r.status not in ('pending', 'approved') or v_r.no_show_at is not null then
            continue;
          end if;
          if v_r.status = 'approved' then
            if v_event is not null then
              update public.events set approved_count = greatest(0, coalesce(approved_count, 0) - v_r.guest_count)
               where id = v_event;
            end if;
            update public.nip_reserve_onay_bildirim b
               set durum = 'hata', hata = 'uye-kaldirdi', deneme = 3, son = now()
             where b.rez_id = v_r.id and b.durum in ('bekliyor', 'hata') and b.deneme < 3;
          end if;
          update public.reservations set status = 'cancelled', acted_at = now() where id = v_r.id;
          n_rez_kapanan := n_rez_kapanan + 1;
        end loop;
      end if;

      -- (b) Uye bagi: uye siteye yeni kaydolduysa musteri satiri talepten SONRA
      --     olusur (uye esitlemesi 10 dakikada bir). Acik talep sonradan baglanir;
      --     baglanmazsa panel "misafir" gosterir, geldi / gelmedi sayilmaz.
      update public.reservations q set customer_id = k.id
        from (select distinct on (c.reserve_profile_id) c.reserve_profile_id, c.id
                from public.customers c
               where c.reserve_profile_id is not null
               order by c.reserve_profile_id, c.created_at) k
       where q.site_kaydi and q.customer_id is null and q.profile_id is not null
         and q.status in ('pending', 'approved') and q.no_show_at is null
         and k.reserve_profile_id = q.profile_id;
      get diagnostics n_rez_baglanan = row_count;

      -- (c) Bekleyen talepte uyenin degistirebildigi alanlar (ad, telefon, kisi,
      --     misafir adlari, not, kural onayi). Durum ve baska alan DEGISMEZ.
      update public.reservations q
         set name = public.nip_rez_gecis_ad(g.name),
             phone = left(coalesce(public.nip_tel_duzelt(g.phone), btrim(coalesce(g.phone, ''))), 32),
             guest_count = greatest(1, least(20, coalesce(g.guest_count, 1))),
             guest_names = g.guest_names,
             note = nullif(left(coalesce(g.note, ''), 300), ''),
             rules_accepted = coalesce(g.rules_accepted, false)
        from public.nip_rez_gecis_rez(v) g
       where q.id = g.id and q.site_kaydi and q.status = 'pending' and g.status = 'pending'
         and length(public.nip_rez_gecis_ad(g.name)) >= 2
         and (q.name, q.phone, q.guest_count, q.guest_names, q.note, q.rules_accepted)
             is distinct from
             (public.nip_rez_gecis_ad(g.name),
              left(coalesce(public.nip_tel_duzelt(g.phone), btrim(coalesce(g.phone, ''))), 32),
              greatest(1, least(20, coalesce(g.guest_count, 1))),
              g.guest_names, nullif(left(coalesce(g.note, ''), 300), ''), coalesce(g.rules_accepted, false));
      get diagnostics n_rez_guncellenen = row_count;
    end if;
  end if;

  return json_build_object('ok', true, 'yazildi', coalesce(p_yaz, false), 'kisisel_yazildi', v_kisisel,
    'anahtar_yerel', v_yerel,
    'etkinlik', n_etk, 'etkinlik_yeni', n_etk_yeni, 'etkinlik_yazilan', n_etk_yazilan, 'etkinlik_kapanan', n_etk_kapanan,
    'rezervasyon', n_rez, 'rezervasyon_yeni', n_rez_yeni, 'rezervasyon_yazilan', n_rez_yazilan,
    'rezervasyon_kapanan', n_rez_kapanan, 'rezervasyon_atlanan', n_rez_atlanan,
    'rezervasyon_uyeye_bagli', n_rez_uye,
    'rezervasyon_sorunlu', n_rez_sorunlu, 'sorunlu_ilk20', coalesce(v_sorunlu, '[]'::json),
    'kisi_sayisi_sinira_cekilen', n_kisi_kirpilan,
    'gecmisi_olan_uye', n_uye, 'uye_eslesen', n_uye_eslesen, 'uye_sayaci_yazilan', n_uye_yazilan,
    'uye_sayaci_sifirlanan', n_uye_sifirlanan,
    'uye_sayaci_atlandi', (v_kisisel and not v_yerel and v_ilk is not null),
    'rezervasyon_baglanan', n_rez_baglanan, 'rezervasyon_guncellenen', n_rez_guncellenen,
    'bekleyen_sorunlu', n_bek_sorunlu, 'bekleyen_sorunlu_kod', v_bek_sorunlu);
end $$;

revoke all on function public.nip_rez_gecis_kopyala(boolean, boolean) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3) PARTI LISTESI -> RESERVE
--    Yakin gecmis (7 gun) ve gelecek partiler yazilir; daha eskisi RESERVE'de
--    her gece arsive gider (14 gun), yollanirsa geri gelirdi. Butun parti
--    kimlikleri ayrica yollanir: Order'da kaldirilan gelecek parti sitede
--    kapanir (durum 'cancelled'; satir kalir).
-- ----------------------------------------------------------------------------
create or replace function public.nip_rez_site_etkinlik_gonder()
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_bugun date := (now() at time zone 'Europe/Istanbul')::date;
  v_liste json;
  v_kimlik uuid[];
begin
  select coalesce(json_agg(json_build_object(
           'id', e.id, 'name', e.name, 'subtitle', e.subtitle, 'genre', e.genre, 'date', e.date,
           'time', coalesce(e."time", ''), 'time_end', e.time_end, 'capacity', e.capacity,
           'approved_count', e.approved_count, 'rules', e.rules, 'rules_en', e.rules_en, 'rules_ru', e.rules_ru,
           'access_type', e.access_type, 'status', e.status, 'note', e.note,
           'warmup_name', e.warmup_name, 'warmup_start', e.warmup_start, 'warmup_end', e.warmup_end,
           'color', e.color) order by e.date), '[]'::json)
    into v_liste
    from public.events e
   where e.date >= v_bugun - 7;
  select coalesce(array_agg(e.id), '{}'::uuid[]) into v_kimlik from public.events e;
  return public.nip_rez_site_cagir('nip_order_etkinlik_yaz',
           json_build_object('p_etkinlikler', v_liste, 'p_kimlikler', v_kimlik));
end $$;
revoke all on function public.nip_rez_site_etkinlik_gonder() from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4) REZERVASYON DURUMU -> RESERVE
--    Son 30 gunun ve gelecegin butun rezervasyonlari yollanir; RESERVE yalniz
--    kendinde olan kimlikleri (siteden gelen ya da gecisten once kopyalanan)
--    gunceller, digerlerini atlar. RESERVE 'no_show' ve 'cancelled' durumlarini
--    tanimaz: gelmedi -> 'approved' + no_show_at, iptal -> 'rejected'.
-- ----------------------------------------------------------------------------
create or replace function public.nip_rez_site_durum_gonder()
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_bugun date := (now() at time zone 'Europe/Istanbul')::date;
  v_liste json;
begin
  select coalesce(json_agg(json_build_object(
           'id', r.id,
           'status', case r.status when 'no_show' then 'approved' when 'cancelled' then 'rejected' else r.status end,
           'approved_at', r.approved_at,
           'checked_in_at', case when r.status = 'used' then r.checked_in_at end,
           'no_show_at', case when r.status = 'no_show' then coalesce(r.no_show_at, now()) end)), '[]'::json)
    into v_liste
    from public.reservations r
   where r.event_date is null or r.event_date >= v_bugun - 30;
  return public.nip_rez_site_cagir('nip_order_rez_durum_yaz', json_build_object('p_durumlar', v_liste));
end $$;
revoke all on function public.nip_rez_site_durum_gonder() from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 5) ZAMANLANMIS TUR (5 dakikada bir). Anahtar kapaliyken hemen doner.
--    * Uc adim birbirinden AYRI: biri hata verirse digerleri yine calisir.
--    * Once yollama, en son cekme: cekmenin aldigi satir kilitleri ag
--      cagrilari boyunca tutulmaz.
--    * RESERVE "tasinmadi" derse (isaret orada kapanmis) isaret yeniden acilir.
--    * Art arda 3 tur ARIZA: yoneticilere Telegram. Duzelince bir kez haber.
--      Kayit: nip_reserve_bildirim_log (1., 3. ve her 12. arizali tur).
--    * Siteden gelip alinamayan talep ARIZA sayilmaz; ayri sayilir (3. turda,
--      sonra gunde bir uyari). Tek bozuk kayit ariza uyarisini bastirmaz.
--    * Tur boyunca anahtar satiri kilitlidir (gecis / geri donus ile yarismaz).
-- ----------------------------------------------------------------------------
create or replace function public.nip_rez_site_esitle()
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_k json; v_e json; v_d json; v_g json;
  v_hata text := '';
  v_ariza boolean := false;      -- adimlardan biri calismadi (ag, sir, istisna)
  v_talep int := 0;              -- siteden gelip alinamayan bekleyen talep
  v_say int := 0;                -- art arda arizali tur
  v_tsay int := 0;               -- alinamayan talep kac turdur duruyor
  v_metin text; v_metin2 text; v_talep_metin text; v_m text;
  k record;
begin
  -- Yalniz zamanlanmis is / SQL oturumu (istek rolu yok).
  if coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') <> '' then
    raise exception 'dogrudan cagrilamaz' using errcode = '42501';
  end if;
  -- Anahtar satiri tur boyunca kilitlenir: iki tur ust uste binmez; gecis ve
  -- geri donus (nip_rez_gecis_yap) calisan turun bitmesini bekler, o sirada
  -- baslayan tur da onlari bekleyip anahtari YENIDEN okur. Kilitsiz okumada
  -- geri donus sirasinda baslayan tur RESERVE isaretini yeniden acabiliyordu
  -- (inceleme 20.11). Anahtari okuyan diger yerler bu kilitten etkilenmez.
  perform 1 from public.nip_rez_ayar a where a.tek and a.yerel for update;
  if not found then
    return json_build_object('ok', true, 'atlandi', 'anahtar-kapali');
  end if;
  -- RESERVE yok (rezervasyon sitesi olmayan isletme): kopru da yok.
  if not exists (select 1 from vault.decrypted_secrets where name = 'reserve_sync_sir') then
    return json_build_object('ok', true, 'atlandi', 'reserve-yok');
  end if;

  -- 1) Parti listesi
  begin
    v_e := public.nip_rez_site_etkinlik_gonder();
    if coalesce(v_e->>'hata', '') = 'tasinmadi' then
      -- Anahtar acik ama RESERVE'de isaret kapali (yarim kalmis gecis / geri
      -- donus). Order ana kaynaktir: isaret yeniden acilir, yollama yinelenir.
      v_g := public.nip_rez_site_cagir('nip_order_gecis_yaz', json_build_object('p_tasindi', true));
      if coalesce(v_g->>'tasindi', '') = 'true' then
        insert into public.nip_reserve_bildirim_log (ok, hata)
        values (false, 'site koprusu: eski veritabaninda gecis isareti kapaliydi, yeniden acildi');
        v_e := public.nip_rez_site_etkinlik_gonder();
      end if;
    end if;
  exception when others then
    v_e := json_build_object('ok', false, 'hata', 'istisna', 'ayrinti', left(sqlerrm, 200));
  end;
  -- 2) Rezervasyon durumlari
  begin
    v_d := public.nip_rez_site_durum_gonder();
  exception when others then
    v_d := json_build_object('ok', false, 'hata', 'istisna', 'ayrinti', left(sqlerrm, 200));
  end;
  -- 3) Siteden gelenler (yeni talep, duzeltme, kaldirma)
  begin
    v_k := public.nip_rez_gecis_kopyala(true, true);
  exception when others then
    v_k := json_build_object('ok', false, 'hata', 'istisna', 'ayrinti', left(sqlerrm, 200));
  end;

  if coalesce(v_e->>'ok', '') <> 'true' then v_hata := v_hata || ' parti: ' || coalesce(v_e->>'hata', '?') || ' ' || coalesce(v_e->>'ayrinti', ''); end if;
  if coalesce(v_d->>'ok', '') <> 'true' then v_hata := v_hata || ' durum: ' || coalesce(v_d->>'hata', '?') || ' ' || coalesce(v_d->>'ayrinti', ''); end if;
  if coalesce(v_k->>'ok', '') <> 'true' then v_hata := v_hata || ' cekme: ' || coalesce(v_k->>'hata', '?') || ' ' || coalesce(v_k->>'ayrinti', ''); end if;
  v_ariza := v_hata <> '';
  v_talep := coalesce((v_k->>'bekleyen_sorunlu')::int, 0);
  v_hata := btrim(v_hata);

  -- ARIZA (ag, sir, istisna): kendi sayaci, kendi uyarisi, kendi "duzeldi" haberi.
  select a.kopru_hata, a.kopru_talep into v_say, v_tsay from public.nip_rez_ayar a where a.tek;
  if v_ariza then
    v_say := coalesce(v_say, 0) + 1;
    update public.nip_rez_ayar set kopru_hata = v_say where tek;
    if v_say in (1, 3) or v_say % 12 = 0 then
      insert into public.nip_reserve_bildirim_log (ok, hata) values (false, left('site koprusu: ' || v_hata, 400));
    end if;
    if v_say = 3 or v_say % 144 = 0 then
      v_metin := '⚠️ Web sitesi köprüsü ' || (v_say * 5) || ' dakikadır çalışmıyor.' || E'\n'
              || 'Etki: parti ve rezervasyon durumu web sitesine gitmiyor ya da siteden gelen talep panele düşmüyor.' || E'\n'
              || 'Köprü 5 dakikada bir yeniden dener; düzelince haber verir.' || E'\n'
              || 'Ayrıntı: ' || left(v_hata, 300);
    end if;
  elsif coalesce(v_say, 0) > 0 then
    update public.nip_rez_ayar set kopru_hata = 0 where tek;
    if v_say >= 3 then
      v_metin := '✅ Web sitesi köprüsü düzeldi: parti, rezervasyon durumu ve siteden gelen talepler yeniden eşitleniyor.';
      insert into public.nip_reserve_bildirim_log (ok, hata) values (true, 'site koprusu: yeniden calisiyor');
    end if;
  end if;

  -- ALINAMAYAN TALEP: ariza degildir (kopru calisiyor). Ayri sayilir; 3. turda
  -- ve sonra gunde bir kez haber verilir. Talep duzelince ya da parti gecince biter.
  -- Cekme adimi CALISMADIYSA talep hakkinda bir sey ogrenilmemistir: sayaca
  -- dokunulmaz (yoksa tek bir ag kesintisi sayaci sifirlar, uyari 15 dakika
  -- sonra yinelenir ya da hic gitmezdi; inceleme 25.11).
  if coalesce(v_k->>'ok', '') <> 'true' then
    null;
  elsif v_talep > 0 then
    v_tsay := coalesce(v_tsay, 0) + 1;
    update public.nip_rez_ayar set kopru_talep = v_tsay where tek;
    v_talep_metin := 'talep: siteden gelen ' || v_talep || ' talep alinamadi (kod: '
              || coalesce(v_k->>'bekleyen_sorunlu_kod', '?') || '; ad 2 harften kisa, kod bos ya da kod baska kayitta)';
    if v_tsay in (1, 3) or v_tsay % 288 = 0 then
      insert into public.nip_reserve_bildirim_log (ok, hata) values (false, left('site koprusu: ' || v_talep_metin, 400));
    end if;
    if v_tsay = 3 or v_tsay % 288 = 0 then
      v_metin2 := '⚠️ Web sitesinden gelen ' || v_talep || ' rezervasyon talebi panele alınamadı.' || E'\n'
               || 'Kod: ' || coalesce(v_k->>'bekleyen_sorunlu_kod', '?') || E'\n'
               || 'Neden: talepteki ad 2 harften kısa, rezervasyon kodu boş ya da kod başka bir kayıtta.' || E'\n'
               || 'Çözüm: müşteri web sitesinden yeniden talep açsın. Bozuk kayıt parti gününden sonra sayılmaz.';
    end if;
  elsif coalesce(v_tsay, 0) > 0 then
    update public.nip_rez_ayar set kopru_talep = 0 where tek;
  end if;

  begin
    foreach v_m in array array_remove(array[v_metin, v_metin2], null) loop
      for k in select sf.telegram_chat_id from public.staff sf
                where sf.is_active and sf.role = 'admin' and sf.telegram_chat_id is not null
      loop
        perform public.nip_tg_gonder(k.telegram_chat_id, v_m, 'site_koprusu');
      end loop;
    end loop;
  exception when others then
    insert into public.nip_reserve_bildirim_log (ok, hata) values (false, left('site koprusu: uyari gonderilemedi: ' || sqlerrm, 400));
  end;

  return json_build_object('ok', not v_ariza, 'alinamayan_talep', v_talep,
    'gelen_rezervasyon', coalesce((v_k->>'rezervasyon_yazilan')::int, 0),
    'duzeltilen', coalesce((v_k->>'rezervasyon_guncellenen')::int, 0),
    'kaldirilan', case when coalesce(v_k->>'ok', '') = 'true' then coalesce((v_k->>'rezervasyon_kapanan')::int, 0) else 0 end,
    'baglanan', coalesce((v_k->>'rezervasyon_baglanan')::int, 0),
    'parti_yazilan', coalesce((v_e->>'yazilan')::int, 0), 'parti_kapanan', coalesce((v_e->>'kapanan')::int, 0),
    'durum_yazilan', coalesce((v_d->>'yazilan')::int, 0),
    'hata', nullif(btrim(v_hata || ' ' || coalesce(v_talep_metin, '')), ''));
end $$;
revoke all on function public.nip_rez_site_esitle() from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 6) PANEL: parti kaydedilince / kaldirilinca liste siteye hemen yollanir
--    (5 dakikayi beklemeden). Yalniz yonetici; anahtar kapaliyken bir sey yapmaz.
-- ----------------------------------------------------------------------------
create or replace function public.nip_rez_site_simdi()
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_e json;
begin
  if not public.nip_yonetici_mi() then
    raise exception 'site koprusu: yalniz yonetici' using errcode = '42501';
  end if;
  if not public.nip_rez_yerel_mi() then
    return json_build_object('ok', true, 'atlandi', 'anahtar-kapali');
  end if;
  if not exists (select 1 from vault.decrypted_secrets where name = 'reserve_sync_sir') then
    return json_build_object('ok', true, 'atlandi', 'reserve-yok');
  end if;
  v_e := public.nip_rez_site_etkinlik_gonder();
  return json_build_object('ok', coalesce(v_e->>'ok', '') = 'true',
    'parti_yazilan', coalesce((v_e->>'yazilan')::int, 0), 'parti_kapanan', coalesce((v_e->>'kapanan')::int, 0),
    'hata', v_e->>'hata');
end $$;
revoke all on function public.nip_rez_site_simdi() from public, anon;
grant execute on function public.nip_rez_site_simdi() to authenticated;

-- ----------------------------------------------------------------------------
-- 7) "YENI UYE / YENI TALEP" TELEGRAM BILDIRIMI
--    Anahtar acikken kontrol yalniz yerel talepleri yolluyordu; web sitesine
--    yeni uye olanlarin bildirimi kesilirdi (uyelik RESERVE'de kaliyor). Artik
--    yerel kontrolden SONRA RESERVE'ye de bakilir: yeni uyeler ve siteden gelip
--    henuz cekilmemis talepler bildirilir. Ayni kimlik iki kez bildirilmez
--    (nip_reserve_bekleyenleri_isle). RESERVE'si olmayan isletmede (kasada sir
--    yok) yerel kontrolle yetinilir. Govdenin geri kalani AYNI.
-- ----------------------------------------------------------------------------
create or replace function public.nip_reserve_bekleyen_kontrol()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_sir text;
  v_anon constant text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRpcXBhcmpydHZ2Znh2d3hlYm92Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5Mzc3OTMsImV4cCI6MjA4OTUxMzc5M30.pNI2yU6LDG8583HBPq-5puxkpEVEAYwhGp9ibJ1WBsI';
  v_url  constant text := 'https://diqparjrtvvfxvwxebov.supabase.co/rest/v1/rpc/nip_bekleyenleri_ver';
  v_status int; v_content text; v_s record;
  v_yerel boolean;
begin
  -- Yalniz zamanlanmis is / SQL oturumu. Eski denetim current_user'a
  -- bakiyordu; SECURITY DEFINER icinde o fonksiyon sahibidir ve denetim hic
  -- tutmuyordu. Istek rolune bakilir (calistirma yetkisi zaten kapali).
  if current_user in ('authenticated', 'anon')
     or coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') in ('anon', 'authenticated') then
    raise exception 'dogrudan cagrilamaz';
  end if;

  -- ANAHTAR (20261113): yerelde talepler bu veritabanindan okunur.
  v_yerel := public.nip_rez_yerel_mi();
  if v_yerel then
    perform public.nip_rez_yerel_bekleyen_kontrol();
  end if;

  select decrypted_secret into v_sir from vault.decrypted_secrets where name = 'reserve_sync_sir';
  if v_sir is null then
    -- Yerelde RESERVE'siz isletme olabilir: hata degil.
    if not v_yerel then
      insert into public.nip_reserve_bildirim_log (ok, hata) values (false, 'Vault''ta reserve_sync_sir yok');
    end if;
    return;
  end if;

  begin
    perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '15000');
    select status, content into v_status, v_content
      from extensions.http((
        'POST', v_url,
        array[extensions.http_header('apikey', v_anon),
              extensions.http_header('Authorization', 'Bearer ' || v_anon)],
        'application/json',
        json_build_object('p_sir', v_sir)::text
      )::extensions.http_request);
  exception when others then
    insert into public.nip_reserve_bildirim_log (ok, hata) values (false, 'ag: ' || sqlerrm);
    return;
  end;

  if v_status <> 200 then
    insert into public.nip_reserve_bildirim_log (ok, hata) values (false, v_status || ' ' || left(coalesce(v_content, ''), 300));
    return;
  end if;

  select * into v_s from public.nip_reserve_bekleyenleri_isle(v_content::json);
  insert into public.nip_reserve_bildirim_log (ok, uye, rez) values (true, v_s.uye, v_s.rez);
end $$;
revoke all on function public.nip_reserve_bekleyen_kontrol() from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 8) GECIS (tek cagri; yalniz SQL oturumu)
--    RESERVE isareti bir ag cagrisiyla yazilir; Order'in islemiyle birlikte
--    geri SARILMAZ. Bu yuzden:
--      * isaret ILK adimdir (oradaki paneller donar; kopya ile isaret arasinda
--        orada verilen karar ya da acilan parti kaybolmaz)
--      * sonraki adim hata verirse (iptal / zaman asimi dahil) isaret telafi
--        cagrisiyla yeniden kapatilir
--      * anahtar acildiktan SONRAKI yollama hatasi gecisi bozmaz (5 dakikalik
--        tur yeniden dener)
--      * cagri geri sarilan bir islemin icinde calistirilmaz
--      * ayni cagri yeniden calistirilabilir (her iki yon de zararsiz)
--    GERI DONUS: son parti listesi ve durumlar yollanamazsa geri donus YAPILMAZ
--    (RESERVE yeniden ana kaynak olunca son kararlar orada olmali). RESERVE'de
--    isaret kapali cikarsa (yarim kalmis geri donus, elle kapatma) isaret
--    yeniden acilir ve yollama yinelenir; "tasinmadi" yaniti basari SAYILMAZ.
--    Kopru bozukken yine de donmek gerekirse: nip_rez_gecis_yap(false, true).
--    Zorla donuste son yollama da RESERVE isaretinin kapatilmasi da basarisiz
--    olabilir; anahtar yine kapanir ve yanitta "uyari" doner. Isaret o zaman
--    RESERVE'de (SQL oturumu) elle kapatilir:
--      select public.nip_order_gecis_yaz((select decrypted_secret
--        from vault.decrypted_secrets where name = 'order_sync_sir'), false);
--    Kapanana kadar oradaki panellerde onay / red / parti duzenleme kilitlidir.
--    Anahtar satiri islem boyunca kilitlidir: calisan kopru turu beklenir, yeni
--    tur da bu islemi bekler.
-- ----------------------------------------------------------------------------
create or replace function public.nip_rez_gecis_yap(p_ac boolean, p_zorla boolean default false)
returns json
language plpgsql
security definer
set search_path to 'public'
set statement_timeout to '120s'
as $$
declare
  v_k json; v_g json; v_g2 json; v_e json; v_d json;
  v_neden text;
  v_yerel boolean;
begin
  if coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') <> '' then
    raise exception 'dogrudan cagrilamaz' using errcode = '42501';
  end if;

  -- Anahtar satiri kilidi (kopru turu ile ayni kilit).
  select a.yerel into v_yerel from public.nip_rez_ayar a where a.tek for update;
  v_yerel := coalesce(v_yerel, false);

  if not coalesce(p_ac, false) then
    -- GERI DONUS: son parti listesi ve durumlar yollanir (isaret acikken
    -- yazilabilir), anahtar kapanir, RESERVE'de isaret kapanir. Nesneler ve
    -- veri yerinde kalir. Menuden acilmis yerel talepler RESERVE'de yoktur;
    -- kopru panelinde gorunmez (20261113 basligindaki not).
    if v_yerel then
      v_e := public.nip_rez_site_etkinlik_gonder();
      if coalesce(v_e->>'hata', '') = 'tasinmadi' then
        -- RESERVE'de isaret kapali (yarim kalmis geri donus ya da orada elle
        -- kapatma): bu halde orasi hicbir sey YAZMAZ. Arada Order panelinde
        -- verilen karar kaybolmasin diye isaret yeniden acilir, yollama
        -- yinelenir (kopru turunun yaptigi gibi; inceleme 25.11).
        v_g2 := public.nip_rez_site_cagir('nip_order_gecis_yaz', json_build_object('p_tasindi', true));
        if coalesce(v_g2->>'tasindi', '') = 'true' then
          v_e := public.nip_rez_site_etkinlik_gonder();
        end if;
      end if;
      v_d := public.nip_rez_site_durum_gonder();
      -- Son yollama basarisizsa geri donulmez: RESERVE ana kaynak olunca son
      -- onay / red / giris orada eksik kalirdi ve bir daha yollanamazdi
      -- (inceleme 20.11). 'tasinmadi' da basarisizliktir: orasi yazmamistir.
      if not coalesce(p_zorla, false)
         and (coalesce(v_e->>'ok', '') <> 'true' or coalesce(v_d->>'ok', '') <> 'true') then
        raise exception 'geri donus: son yollama basarisiz (parti: %, durum: %). Order degismedi (anahtar acik); ayni cagriyi yeniden calistir. Kopru bozukken yine de donmek icin: nip_rez_gecis_yap(false, true)', v_e, v_d;
      end if;
    end if;
    update public.nip_rez_ayar set yerel = false, durdu = false, degisti = now() where tek;
    v_g := public.nip_rez_site_cagir('nip_order_gecis_yaz', json_build_object('p_tasindi', false));
    if coalesce(v_g->>'ok', '') <> 'true' or coalesce(v_g->>'tasindi', '') <> 'false' then
      if not coalesce(p_zorla, false) then
        raise exception 'geri donus: RESERVE gecis isareti kapatilamadi (%). Order DEGISMEDI (anahtar onceki halinde). Isaretin durumu belirsiz olabilir; ayni cagriyi yeniden calistir. Kopru tamamen bozuksa nip_rez_gecis_yap(false, true) anahtari kapatir; isaret sonra RESERVE''de elle kapatilir.', v_g;
      end if;
      -- ZORLA: kopru tamamen bozukken de donulebilsin (inceleme 25.11). Anahtar
      -- kapanir; RESERVE isareti acik kalmis olabilir ve orada elle kapatilir.
      insert into public.nip_reserve_bildirim_log (ok, hata)
      values (false, 'site koprusu: zorla geri donus; eski veritabaninda gecis isareti kapatilamadi, orada elle kapatilmali');
      return json_build_object('ok', true, 'yerel', false, 'reserve', v_g, 'parti', v_e, 'durum', v_d, 'zorla', true,
        'uyari', 'RESERVE gecis isareti KAPATILAMADI. Eski veritabaninda (SQL oturumu) elle kapat: select public.nip_order_gecis_yaz((select decrypted_secret from vault.decrypted_secrets where name = ''order_sync_sir''), false); Kapanana kadar oradaki panellerde onay / red / parti duzenleme kilitlidir.');
    end if;
    return json_build_object('ok', true, 'yerel', false, 'reserve', v_g, 'parti', v_e, 'durum', v_d,
                             'zorla', coalesce(p_zorla, false));
  end if;

  if v_yerel then
    -- Zaten gecilmis: isaret yeniden dogrulanir (yarim kalmis gecisi onarir).
    v_g := public.nip_rez_site_cagir('nip_order_gecis_yaz', json_build_object('p_tasindi', true));
    return json_build_object('ok', coalesce(v_g->>'tasindi', '') = 'true', 'zaten', true, 'yerel', true, 'reserve', v_g);
  end if;

  begin
    -- 1) RESERVE'de gecis isareti (oradaki paneller artik durum / parti yazamaz)
    v_g := public.nip_rez_site_cagir('nip_order_gecis_yaz', json_build_object('p_tasindi', true));
    if coalesce(v_g->>'ok', '') <> 'true' or coalesce(v_g->>'tasindi', '') <> 'true' then
      raise exception 'RESERVE gecis isareti acilamadi (%)', v_g;
    end if;
    -- 2) Son veri kopyasi (anahtar kapaliyken: RESERVE ana kaynak)
    v_k := public.nip_rez_gecis_kopyala(true, true);
    if coalesce(v_k->>'ok', '') <> 'true' then
      raise exception 'veri kopyasi basarisiz (%)', v_k;
    end if;
    -- 3) Anahtar
    update public.nip_rez_ayar
       set yerel = true, durdu = false, degisti = now(), ilk_gecis = coalesce(ilk_gecis, now()),
           kopru_hata = 0, kopru_talep = 0
     where tek;
  exception when query_canceled or others then
    -- Isaret acilmis olabilir (yanit kaybolsa da): her durumda telafi.
    v_neden := sqlerrm;
    v_g2 := public.nip_rez_site_cagir('nip_order_gecis_yaz', json_build_object('p_tasindi', false));
    raise exception 'gecis basarisiz: %. Order degismedi. RESERVE isareti geri kapatildi mi: %', v_neden, v_g2;
  end;

  -- 4) Parti listesi ve durumlar. Anahtar acildi: buradaki hata (iptal / zaman
  --    asimi dahil) gecisi geri SARMAZ; 5 dakikalik tur yollamayi yeniden dener.
  begin
    v_e := public.nip_rez_site_etkinlik_gonder();
    v_d := public.nip_rez_site_durum_gonder();
  exception when query_canceled or others then
    v_d := json_build_object('ok', false, 'hata', 'istisna', 'ayrinti', left(sqlerrm, 200));
    v_e := coalesce(v_e, v_d);
  end;

  return json_build_object('ok', true, 'yerel', true, 'kopya', v_k, 'reserve', v_g, 'parti', v_e, 'durum', v_d);
end $$;
revoke all on function public.nip_rez_gecis_yap(boolean, boolean) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 9) ZAMANLAMA: 5 dakikada bir. Anahtar kapaliyken tur hemen doner.
-- ----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('nip-rez-site-esitle', '3-59/5 * * * *', 'select public.nip_rez_site_esitle()');
  end if;
end $$;
