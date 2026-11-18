-- ============================================================================
-- REZERVASYON GECIS HAZIRLIGI (ASAMA 2)            20261118_rezervasyon_gecis_hazirligi
-- ============================================================================
-- Sahip (12.11.2026): rezervasyon Order'in icine tasiniyor. Sahip (17.11.2026):
-- "Hali hazirda olan partileri de tasi."
--
-- Bu dosya uc sey ekler; bugunku akisi DEGISTIRMEZ (anahtar nip_rez_ayar.yerel
-- kapali kalir, dosya hicbir veri kopyalamaz):
--   1) VERI KOPYASI fonksiyonu: RESERVE'deki partileri (etkinlik), rezervasyonlari
--      ve uyelerin "geldi / gelmedi" sayilarini Order'a kopyalar. Yalniz SQL
--      oturumu calistirir.
--          select public.nip_rez_gecis_kopyala();        -- kuru calistirma: yalniz sayar
--          select public.nip_rez_gecis_kopyala(true);    -- yazar
--   2) ETKINLIK DEGISINCE REZERVASYON: etkinligin adi, tarihi ya da saati
--      degisirse o etkinligin rezervasyonlarindaki kopyalar da degisir. Kapi,
--      "Rezervasyonlarim" ve onay e-postasi bu kopyalara bakar (inceleme 18.11).
--   3) YETKI: rezervasyon tablosuna dogrudan yazma kapanir; okuma yalniz
--      yonetici. Personel islemleri sunucu fonksiyonlaridir (nip_rez_*).
--
-- Kopya kurallari:
--   * Kimlikler (uuid) ve rezervasyon kodlari (qr_id) KORUNUR: acik duran menu,
--     web sitesi ve e-postadaki kod gecisten sonra da ayni kaydi bulur.
--   * Tasinmaz (sahip karari): guven puani, seviye, seri, davet kodu, bekleme
--     listesi, DJ puani, afis.
--   * RESERVE'de "gelmedi" = approved + no_show_at; burada durum no_show olur.
--   * Uye bagi: once customers.reserve_profile_id (uye senkronu kuruyor).
--     Menuden (uygulamadan) acilmis talepte RESERVE'de profil olmayabilir; o
--     zaman Order'daki iz (nip_rez_talepleri: customer_id, eposta, dil, cihaz)
--     kullanilir. Boylece uye gecisten sonra talebini "Rezervasyonlarim"da
--     gormeye devam eder ve onay e-postasi dogru adrese gider. Ikisi de yoksa
--     kayit misafir kaydi gibi gelir (customer_id bos).
--   * Sayaclar: customers.rez_geldi / rez_gelmedi = RESERVE'deki toplamlar.
--   * Rezervasyondaki etkinlik adi / tarihi / saati: etkinlik buradaysa
--     ETKINLIKTEN alinir (RESERVE'deki kopya eski kalmis olabilir).
--   * TEKRAR CALISTIRILABILIR. Anahtar KAPALIYKEN ana kaynak RESERVE'dir: var
--     olan etkinlik ve rezervasyon RESERVE'deki haline getirilir (once deneme
--     kopyasi, gecis aninda son kopya). Anahtar ACIKKEN ana kaynak Order'dir:
--     var olan satira DOKUNULMAZ, yalniz burada hic olmayan rezervasyon eklenir
--     (gecisten sonra web sitesinden / rezervasyon sitesinden gelen talep).
--     Sayaclar yalniz anahtar kapaliyken yazilir.
--   * Kopyalanan onayli kayitlar ESKIDIR (son onay 23.08.2026): onay e-postasi
--     penceresinin (son 30 gun, tarihi gecmemis) disindadir; e-posta gitmez.
--     Ayni kimlikle zaten bildirilmis talep icin Telegram ikinci kez gitmez.
-- Yalniz EKLEME. Hicbir nesne ya da satir kaldirilmaz. Tekrar calistirilabilir.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) VERI KOPYASI
-- ----------------------------------------------------------------------------
-- Gelen JSON'u satirlara ceviren uc ic fonksiyon (yalniz kopya fonksiyonu
-- kullanir). Kolon listesi tek yerde durur.
create or replace function public.nip_rez_gecis_etk(v json)
returns table (id uuid, name text, genre text, subtitle text, date date, "time" text, time_end text,
               warmup_name text, warmup_start text, warmup_end text, capacity int, approved_count int,
               access_type text, rules text, rules_en text, rules_ru text, color text, note text,
               status text, created_at timestamptz)
language sql
immutable
set search_path to 'public'
as $$
  select * from json_to_recordset(coalesce(v->'etkinlikler', '[]'::json)) as x(
    id uuid, name text, genre text, subtitle text, date date, "time" text, time_end text,
    warmup_name text, warmup_start text, warmup_end text, capacity int, approved_count int,
    access_type text, rules text, rules_en text, rules_ru text, color text, note text,
    status text, created_at timestamptz);
$$;

create or replace function public.nip_rez_gecis_rez(v json)
returns table (id uuid, qr_id text, event_id uuid, event_name text, event_date date, event_time text,
               name text, phone text, guest_count int, guest_names text, note text, status text,
               rules_accepted boolean, profile_id uuid, email text, lang text,
               approved_at timestamptz, checked_in_at timestamptz, no_show_at timestamptz, created_at timestamptz)
language sql
immutable
set search_path to 'public'
as $$
  select * from json_to_recordset(coalesce(v->'rezervasyonlar', '[]'::json)) as x(
    id uuid, qr_id text, event_id uuid, event_name text, event_date date, event_time text,
    name text, phone text, guest_count int, guest_names text, note text, status text,
    rules_accepted boolean, profile_id uuid, email text, lang text,
    approved_at timestamptz, checked_in_at timestamptz, no_show_at timestamptz, created_at timestamptz);
$$;

create or replace function public.nip_rez_gecis_uye(v json)
returns table (id uuid, email text, geldi int, gelmedi int)
language sql
immutable
set search_path to 'public'
as $$
  select * from json_to_recordset(coalesce(v->'uyeler', '[]'::json)) as x(id uuid, email text, geldi int, gelmedi int);
$$;

create or replace function public.nip_rez_gecis_kopyala(p_yaz boolean default false)
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
  n_etk int; n_etk_yeni int; n_etk_yazilan int := 0;
  n_rez int; n_rez_yeni int; n_rez_uye int; n_rez_sorunlu int; n_rez_yazilan int := 0;
  n_kisi_kirpilan int; v_sorunlu json;
  n_uye int; n_uye_eslesen int; n_uye_yazilan int := 0;
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

  select count(*) into n_etk from public.nip_rez_gecis_etk(v) g where g.id is not null;
  select count(*) into n_etk_yeni from public.nip_rez_gecis_etk(v) g
   where g.id is not null and g.name is not null and g.date is not null
     and not exists (select 1 from public.events e where e.id = g.id);
  select count(*) into n_rez from public.nip_rez_gecis_rez(v) g where g.id is not null;
  -- Yazilabilir ve henuz burada olmayan satir (yazinca eklenecek olan)
  select count(*) into n_rez_yeni from public.nip_rez_gecis_rez(v) g
   where g.id is not null and length(btrim(coalesce(g.name, ''))) >= 2 and coalesce(g.qr_id, '') <> ''
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
           where g.id is not null and (length(btrim(coalesce(g.name, ''))) < 2 or coalesce(g.qr_id, '') = ''
              or g.status not in ('pending', 'approved', 'used', 'rejected', 'cancelled', 'no_show'))) q;
  -- Kisi sayisi 1-20 disinda olan satir yazilir ama sayi sinira cekilir
  select count(*) into n_kisi_kirpilan from public.nip_rez_gecis_rez(v) g
   where g.id is not null and coalesce(g.guest_count, 1) not between 1 and 20;
  select count(*) into n_uye from public.nip_rez_gecis_uye(v) g where g.id is not null;
  select count(*) into n_uye_eslesen from public.nip_rez_gecis_uye(v) g
   where exists (select 1 from public.customers k where k.reserve_profile_id = g.id);

  if coalesce(p_yaz, false) then
    -- ETKINLIK (parti). Anahtar kapaliyken var olan satir RESERVE'deki haline
    -- getirilir; acikken dokunulmaz (Order'da yapilan duzeltme ezilmez).
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
     where not v_yerel
       and (e.name, e.genre, e.subtitle, e.date, e."time", e.time_end, e.warmup_name, e.warmup_start, e.warmup_end,
            e.capacity, e.approved_count, e.access_type, e.rules, e.rules_en, e.rules_ru, e.color, e.note, e.status)
           is distinct from
           (excluded.name, excluded.genre, excluded.subtitle, excluded.date, excluded."time", excluded.time_end,
            excluded.warmup_name, excluded.warmup_start, excluded.warmup_end, excluded.capacity, excluded.approved_count,
            excluded.access_type, excluded.rules, excluded.rules_en, excluded.rules_ru, excluded.color, excluded.note,
            excluded.status);
    get diagnostics n_etk_yazilan = row_count;

    -- REZERVASYON. Kodu baska bir kimlikte kullanilan satir atlanir. Anahtar
    -- kapaliyken var olan satir RESERVE'deki haline getirilir; acikken yalniz
    -- burada hic olmayan satir eklenir.
    insert into public.reservations as r (id, qr_id, event_id, event_name, event_date, event_time, name, phone, guest_count,
                                          guest_names, note, status, rules_accepted, profile_id, customer_id, email, lang, device,
                                          approved_at, checked_in_at, no_show_at, came_counted, no_show_counted, created_at)
    select g.id, g.qr_id, ev.id,
           coalesce(ev.name, g.event_name), coalesce(ev.date, g.event_date), coalesce(nullif(ev."time", ''), g.event_time),
           left(btrim(g.name), 80),
           left(coalesce(public.nip_tel_duzelt(g.phone), btrim(coalesce(g.phone, ''))), 32),
           greatest(1, least(20, coalesce(g.guest_count, 1))),
           g.guest_names, nullif(left(coalesce(g.note, ''), 300), ''),
           case when g.status = 'approved' and g.no_show_at is not null then 'no_show' else g.status end,
           coalesce(g.rules_accepted, false), g.profile_id, coalesce(k.id, tk.id),
           coalesce(nullif(lower(btrim(t.eposta)), ''), nullif(lower(btrim(g.email)), '')),
           case when coalesce(t.dil, g.lang) in ('tr', 'en', 'ru') then coalesce(t.dil, g.lang) else 'tr' end,
           t.cihaz,
           g.approved_at, g.checked_in_at, g.no_show_at,
           -- Sayac isaretleri yalniz RESERVE'nin toplamina GIRMIS kayitta (profilli):
           -- kopyalanan sayaclar o toplamdir; geri almada ancak sayilmis olan duser.
           (g.status = 'used' and k.id is not null),
           (g.status = 'approved' and g.no_show_at is not null and k.id is not null),
           coalesce(g.created_at, now())
      from public.nip_rez_gecis_rez(v) g
      left join public.events ev on ev.id = g.event_id
      left join lateral (select c.id from public.customers c where c.reserve_profile_id = g.profile_id
                          order by c.created_at limit 1) k on true
      left join public.nip_rez_talepleri t on t.rez_id = g.id
      left join public.customers tk on tk.id = t.customer_id
     where g.id is not null and length(btrim(coalesce(g.name, ''))) >= 2 and coalesce(g.qr_id, '') <> ''
       and g.status in ('pending', 'approved', 'used', 'rejected', 'cancelled', 'no_show')
       and not exists (select 1 from public.reservations x where x.qr_id = g.qr_id and x.id <> g.id)
    on conflict (id) do update
       set qr_id = excluded.qr_id, event_id = excluded.event_id, event_name = excluded.event_name,
           event_date = excluded.event_date, event_time = excluded.event_time, name = excluded.name,
           phone = excluded.phone, guest_count = excluded.guest_count, guest_names = excluded.guest_names,
           note = excluded.note, status = excluded.status, rules_accepted = excluded.rules_accepted,
           profile_id = excluded.profile_id, customer_id = excluded.customer_id, email = excluded.email,
           lang = excluded.lang, device = excluded.device, approved_at = excluded.approved_at,
           checked_in_at = excluded.checked_in_at, no_show_at = excluded.no_show_at,
           came_counted = excluded.came_counted, no_show_counted = excluded.no_show_counted
     where not v_yerel
       and (r.qr_id, r.event_id, r.event_name, r.event_date, r.event_time, r.name, r.phone, r.guest_count, r.guest_names,
            r.note, r.status, r.rules_accepted, r.profile_id, r.customer_id, r.email, r.lang, r.device, r.approved_at,
            r.checked_in_at, r.no_show_at, r.came_counted, r.no_show_counted)
           is distinct from
           (excluded.qr_id, excluded.event_id, excluded.event_name, excluded.event_date, excluded.event_time, excluded.name,
            excluded.phone, excluded.guest_count, excluded.guest_names, excluded.note, excluded.status,
            excluded.rules_accepted, excluded.profile_id, excluded.customer_id, excluded.email, excluded.lang,
            excluded.device, excluded.approved_at, excluded.checked_in_at, excluded.no_show_at, excluded.came_counted,
            excluded.no_show_counted);
    get diagnostics n_rez_yazilan = row_count;

    -- UYE SAYACLARI (yalniz gecisten once: gecisten sonra Order'in kendi sayaci gecerlidir)
    if not v_yerel then
      update public.customers k
         set rez_geldi = greatest(0, coalesce(g.geldi, 0)), rez_gelmedi = greatest(0, coalesce(g.gelmedi, 0))
        from public.nip_rez_gecis_uye(v) g
       where k.reserve_profile_id = g.id
         and (k.rez_geldi is distinct from greatest(0, coalesce(g.geldi, 0))
           or k.rez_gelmedi is distinct from greatest(0, coalesce(g.gelmedi, 0)));
      get diagnostics n_uye_yazilan = row_count;
    end if;
  end if;

  return json_build_object('ok', true, 'yazildi', coalesce(p_yaz, false), 'anahtar_yerel', v_yerel,
    'etkinlik', n_etk, 'etkinlik_yeni', n_etk_yeni, 'etkinlik_yazilan', n_etk_yazilan,
    'rezervasyon', n_rez, 'rezervasyon_yeni', n_rez_yeni, 'rezervasyon_yazilan', n_rez_yazilan,
    'rezervasyon_uyeye_bagli', n_rez_uye,
    'rezervasyon_sorunlu', n_rez_sorunlu, 'sorunlu_ilk20', coalesce(v_sorunlu, '[]'::json),
    'kisi_sayisi_sinira_cekilen', n_kisi_kirpilan,
    'gecmisi_olan_uye', n_uye, 'uye_eslesen', n_uye_eslesen, 'uye_sayaci_yazilan', n_uye_yazilan);
end $$;

revoke all on function public.nip_rez_gecis_kopyala(boolean) from public, anon, authenticated;
revoke all on function public.nip_rez_gecis_etk(json) from public, anon, authenticated;
revoke all on function public.nip_rez_gecis_rez(json) from public, anon, authenticated;
revoke all on function public.nip_rez_gecis_uye(json) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2) ETKINLIK DEGISINCE REZERVASYON KOPYALARI
--    Rezervasyon satiri etkinligin adini, tarihini ve saatini talep aninda
--    kopyalar. Kapidaki "baska gun" sorusu (nip_rez_giris), musterinin
--    "Rezervasyonlarim" listesi ve onay e-postasi bu kopyalara bakar. Etkinlik
--    panelden duzeltilince (tarih ertelendi, ad degisti) kopyalar eski kaliyordu:
--    asil gece kapida her misafir icin "bugunun etkinligi degil" sorusu cikar,
--    eski tarihte ise sorusuz gecerdi. Kopyalar artik etkinligi izler.
--    Sirada bekleyen onay e-postasi da yeni bilgiyle gider.
-- ----------------------------------------------------------------------------
create or replace function public.events_rez_kopyalarini_esitle()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if (new.name, new.date, new."time") is distinct from (old.name, old.date, old."time") then
    update public.reservations r
       set event_name = new.name, event_date = new.date, event_time = new."time"
     where r.event_id = new.id
       and (r.event_name, r.event_date, r.event_time) is distinct from (new.name, new.date, new."time");
    update public.nip_reserve_onay_bildirim b
       set etkinlik = new.name, tarih = new.date, saat = nullif(new."time", '')
      from public.reservations r
     where r.event_id = new.id and b.rez_id = r.id
       and b.durum in ('bekliyor', 'hata') and b.deneme < 3
       and (b.etkinlik, b.tarih, b.saat) is distinct from (new.name, new.date, nullif(new."time", ''));
  end if;
  return null;
end $$;
revoke all on function public.events_rez_kopyalarini_esitle() from public, anon, authenticated;

do $t$
begin
  if not exists (select 1 from pg_trigger
                  where tgname = 'trg_events_rez_kopya' and tgrelid = 'public.events'::regclass) then
    create trigger trg_events_rez_kopya
      after update of name, date, "time" on public.events
      for each row execute function public.events_rez_kopyalarini_esitle();
  end if;
end $t$;

-- ----------------------------------------------------------------------------
-- 3) YETKI: rezervasyon tablosu
--    reservations_personel her aktif personele (garson, mutfak, part-time,
--    izleyici) tabloda TAM okuma ve yazma veriyordu. Panel artik butun
--    islemleri sunucu fonksiyonlariyla yapiyor (onay, red, giris, gelmedi);
--    dogrudan yazilan durum kapasite denetimini, yonetici sartini, sayaclari ve
--    e-posta kuyrugunu atlardi. Misafirin adi, telefonu ve e-postasi da her
--    personel hesabina acikti (inceleme 18.11).
--      * Dogrudan yazma KAPANIR (insert / update ve satir kaldirma yetkisi).
--      * Okuma yalniz yonetici (panel sayfasi zaten yalniz yoneticiye acik).
--    Sunucu fonksiyonlari SECURITY DEFINER'dir; etkilenmez. Kapida giris
--    (nip_rez_giris) aktif personele acik kalir.
-- ----------------------------------------------------------------------------
revoke insert, update, delete, truncate, references, trigger on public.reservations from authenticated;
do $p$
begin
  if exists (select 1 from pg_policies
              where schemaname = 'public' and tablename = 'reservations' and policyname = 'reservations_personel') then
    alter policy reservations_personel on public.reservations
      using (public.nip_yonetici_mi()) with check (public.nip_yonetici_mi());
    comment on policy reservations_personel on public.reservations is
      'Yalniz yonetici OKUR (20261118). Yazma yetkisi tabloda yok; islemler nip_rez_* fonksiyonlariyla.';
  end if;
end $p$;
