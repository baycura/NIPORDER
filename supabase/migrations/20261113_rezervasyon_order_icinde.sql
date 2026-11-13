-- ============================================================================
-- REZERVASYON ORDER'IN ICINDE (ASAMA 1: SUNUCU)        20261113_rezervasyon_order_icinde
-- ============================================================================
-- Sahip (12.11.2026): ayri rezervasyon uygulamasi ve onun veritabani (RESERVE)
-- birakiliyor; rezervasyon tamamen bu veritabaninda (Order) yurur.
--
-- Bugun: menu -> nip_rezervasyon_iste -> HTTP ile RESERVE (nip_order_rezervasyon).
-- Bu dosya Order'i kendi basina yeterli kilar ama bugunku akisi DEGISTIRMEZ:
-- gecis bir anahtara baglidir (nip_rez_ayar.yerel). Anahtar kapali (varsayilan)
-- iken butun fonksiyonlar bugunku kopru yolunu aynen kullanir. Hemen etkili
-- olan tek sey guvenliktir: tabloya dogrudan talep yazma kapanir (bolum 6).
-- Veri kopyasi ve anahtarin acilmasi ayri adimlardir; bu dosyada yoktur.
--
-- Sahip kararlari (baglayici):
--   * Tek puan sistemi: Order'in harcama puani. Guven puani, seviye, seri,
--     sadakat puani, itibar defteri YOK. Personel uye icin iki sayi gorur:
--     kac kez geldi, kac kez gelmedi (customers.rez_geldi / rez_gelmedi).
--   * Tasinmayanlar: davet kodu, bekleme listesi, DJ puani, afis, sifreli giris.
--   * Misafir (girissiz) acik etkinlige talep acabilir; uyelere ozel etkinlik surer.
--   * Veritabanindan hicbir sey kaldirilmaz.
--
-- Tasarim kararlari:
--   * "Gelmedi" yerelde DURUMDUR: status = 'no_show' (yerel kisit zaten izin
--     veriyor; ReservePage yerel dali da boyle yaziyor), no_show_at isaret
--     zamanini tutar. RESERVE bicimi (status 'approved' + no_show_at dolu)
--     kopyadan gelirse fonksiyonlar onu da "gelmedi" sayar (nip_rez_durum).
--   * "Gelmedi" koltugu BOSALTMAZ: approved_count degismez (bugunku davranis;
--     isaret kapi saatinde / ertesi gun konur, geri alma her zaman calismali).
--     Koltuk yalniz onayli kayit reddedilince bosalir (nip_rez_reddet).
--   * Yetki: onay / red / gelmedi / uye engeli yonetici (nip_yonetici_mi);
--     kapida giris aktif personel (is_staff; yerel RLS ile ayni).
--   * Sayaclar tam bir kez: rezervasyon satiri kilitlenir, sayacin yazildigi
--     satirda isaretlenir (came_counted / no_show_counted).
--
-- DIKKAT (rezervasyon sitesi olmayan isletme, profil "temel"): bu dosya
-- menuden dogrudan tabloya yazilan talebi kapatir (bolum 6). O veritabaninda
-- dosyadan hemen sonra anahtar acilir ve menu nip_rezervasyon_iste'yi cagiran
-- surumle birlikte yayina alinir. NIP'te anahtar gecise kadar KAPALI kalir.
--
-- KVKK: uye icin yeni turetilmis veri var (geldi / gelmedi sayisi, rezervasyon
-- engeli). Anahtar acilana kadar hicbiri yazilmaz. Gecisten once aydinlatma
-- metninin yeni surumu gerekip gerekmedigine karar verilir (bkz. kvkk-onay);
-- bu dosya kvkk_documents'a dokunmaz.
--
-- Yalniz EKLEME; tekrar calistirilabilir. Geri donus: anahtar kapatilir
-- (update public.nip_rez_ayar set yerel = false); nesneler yerinde kalir.
-- DIKKAT: geri donus yalniz ILK yerel talep / onaydan ONCE kayipsizdir. Sonra
-- yerel talepler kopru yolunda gorunmez ve sirada bekleyen onay e-postalari
-- kapanir. Gecis sirasi (asama 3): durdu = true -> son veri kopyasi ->
-- yerel = true, durdu = false (bkz. bolum 0).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0) ANAHTAR: rezervasyon yerelde mi sunuluyor?
--    app_settings KULLANILMADI: magaza bazli (rezervasyon veritabani genelinde),
--    anon'a acik ve her yonetici Ayarlar sayfasindan yazabiliyor; gecis anahtari
--    tarayicidan cevrilememeli. Tek satirlik tablo; yalniz SQL oturumu yazar.
-- ----------------------------------------------------------------------------
create table if not exists public.nip_rez_ayar (
  tek        boolean primary key default true check (tek),   -- tek satir
  yerel      boolean not null default false,                  -- false = RESERVE koprusu (bugun)
  kod_on_eki text not null default 'NIP' check (kod_on_eki ~ '^[A-Z0-9]{2,6}$'),
  degisti    timestamptz not null default now()
);
comment on table public.nip_rez_ayar is
  'Rezervasyon anahtari (tek satir). yerel = true: talepler bu veritabanindaki events / reservations tablolarina yazilir; false: RESERVE koprusu. kod_on_eki: rezervasyon kodunun basi (20261113).';
alter table public.nip_rez_ayar enable row level security;
revoke all on public.nip_rez_ayar from anon, authenticated, public;
insert into public.nip_rez_ayar (tek) values (true) on conflict (tek) do nothing;
-- GECIS MOLASI (inceleme 13.11): son veri kopyasi ile anahtarin acilmasi arasinda
-- kopru yolunda yazilan talep yerelde gorunmezdi. durdu = true iken yeni talep
-- alinmaz (menu "tekrar dene" der); okuma calisir.
alter table public.nip_rez_ayar add column if not exists durdu boolean not null default false;
comment on column public.nip_rez_ayar.durdu is
  'true: yeni rezervasyon talebi gecici olarak alinmaz (gecis sirasinda son kopya icin).';

-- Herkes cagirabilir: yalniz acik / kapali bilgisi doner (menu ve panel hangi
-- kaynaktan okuyacagini bununla secer). Satir yoksa kopru (bugunku davranis).
create or replace function public.nip_rez_yerel_mi()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce((select a.yerel from public.nip_rez_ayar a where a.tek), false);
$$;

-- Ekranda, suzgecte ve kapida kullanilan durum (ReservePage.rezDurumu ile ayni):
-- RESERVE bicimindeki isaret (approved + no_show_at) de "gelmedi" sayilir.
create or replace function public.nip_rez_durum(p_status text, p_no_show_at timestamptz)
returns text
language sql
immutable
set search_path to 'public'
as $$
  select case when p_status = 'approved' and p_no_show_at is not null then 'no_show' else p_status end;
$$;

-- ----------------------------------------------------------------------------
-- 1) SEMA: yerel tablolarin eksikleri
-- ----------------------------------------------------------------------------
-- Etkinlik kurallari uc dilde (menu secili dilde gosterir; yoksa Turkce).
alter table public.events add column if not exists rules_en text;
alter table public.events add column if not exists rules_ru text;

-- Rezervasyon: kurallarin kabulu, uyenin DOGRULANMIS e-postasi ve dili (onay
-- e-postasi buraya, bu dilde gider), cihaz anahtari (hiz siniri), gelmedi
-- isareti, sayac isaretleri, son personel islemi.
alter table public.reservations add column if not exists rules_accepted  boolean not null default false;
alter table public.reservations add column if not exists email           text;
alter table public.reservations add column if not exists lang            text not null default 'tr';
alter table public.reservations add column if not exists device          text;
alter table public.reservations add column if not exists no_show_at      timestamptz;
alter table public.reservations add column if not exists came_counted    boolean not null default false;
alter table public.reservations add column if not exists no_show_counted boolean not null default false;
alter table public.reservations add column if not exists acted_by        uuid;
alter table public.reservations add column if not exists acted_at        timestamptz;
comment on column public.reservations.email is
  'Talep anindaki oturumun dogrulanmis e-postasi (auth.users). Misafirde bos. Onay e-postasi buraya gider.';
comment on column public.reservations.no_show_at is
  'Gelmedi isaretinin zamani. Yerelde durum da no_show olur; geri alininca bosalir.';
comment on column public.reservations.came_counted is
  'Bu rezervasyon uyenin rez_geldi sayacina yazildi mi (tam bir kez).';
comment on column public.reservations.no_show_counted is
  'Bu rezervasyon uyenin rez_gelmedi sayacina yazildi mi; geri almada yalniz yazilmis olan dusulur.';
comment on column public.reservations.acted_by is
  'Son personel islemini (onay, red, giris, gelmedi) yapan hesabin auth kimligi.';

create index if not exists reservations_etkinlik_tel on public.reservations (event_id, phone);
create index if not exists reservations_musteri on public.reservations (customer_id) where customer_id is not null;
create index if not exists reservations_yeni on public.reservations (created_at desc);

-- Uye: iki sade sayac ve rezervasyon engeli. Baska puan / seviye yok.
alter table public.customers add column if not exists rez_geldi   integer not null default 0 check (rez_geldi >= 0);
alter table public.customers add column if not exists rez_gelmedi integer not null default 0 check (rez_gelmedi >= 0);
alter table public.customers add column if not exists rez_engelli boolean not null default false;
comment on column public.customers.rez_geldi is
  'Rezervasyonla kac kez geldi (kapida giris). Yalniz nip_rez_giris yazar.';
comment on column public.customers.rez_gelmedi is
  'Rezervasyonu onayliyken kac kez gelmedi. Yalniz nip_rez_gelmedi yazar / geri alir.';
comment on column public.customers.rez_engelli is
  'true: bu uye rezervasyon talebi acamaz. Yalniz nip_rez_engel (yonetici) yazar.';
create index if not exists customers_rez_engelli on public.customers (id) where rez_engelli;

-- Kalkan (customers_guard_money_cols ile ayni desen): REST'ten gelen hicbir
-- istek (uye de personel de) bu uc kolonu yazamaz; yalniz sunucu fonksiyonlari.
-- Tetikte current_user istegin roludur; SECURITY DEFINER fonksiyonun icinden
-- gelen yazmada fonksiyon sahibidir ve gecer.
create or replace function public.customers_guard_rez_cols()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if tg_op = 'INSERT' then
    new.rez_geldi := 0;
    new.rez_gelmedi := 0;
    new.rez_engelli := false;
  else
    new.rez_geldi := old.rez_geldi;
    new.rez_gelmedi := old.rez_gelmedi;
    new.rez_engelli := old.rez_engelli;
  end if;
  return new;
end $$;

do $t$
begin
  if not exists (select 1 from pg_trigger
                  where tgname = 'trg_customers_guard_rez' and tgrelid = 'public.customers'::regclass) then
    create trigger trg_customers_guard_rez
      before insert or update on public.customers
      for each row execute function public.customers_guard_rez_cols();
  end if;
end $t$;

-- ----------------------------------------------------------------------------
-- 2) TALEP (yerel dal). nip_rezervasyon_iste girdiyi denetleyip hiz sinirini
--    uyguladiktan sonra buraya gecer. RESERVE'deki nip_order_rezervasyon ile
--    ayni kurallar, ayni sira: etkinlik var / aktif / gecmemis, uyelere ozel,
--    engelli uye, kapasite (onayli kisi sayisi), kurallarin kabulu, ayni kisi
--    ayni etkinlige iki kez yazilmaz. Guven puani ve seviye kurali YOK.
--    Dogrudan cagrilamaz (yetki yok); cagiranin haklariyla calisir.
-- ----------------------------------------------------------------------------
create or replace function public.nip_rez_yerel_iste(
  p_event uuid, p_ad text, p_tel text, p_kisi integer, p_not text, p_kural boolean,
  p_dil text, p_cihaz text, p_customer uuid, p_eposta text, p_deneme boolean)
returns json
language plpgsql
set search_path to 'public'
as $$
declare
  e public.events;
  v_var public.reservations;
  v_bugun date := (now() at time zone 'Europe/Istanbul')::date;
  v_kural_metni text;
  v_on text;
  v_kod text;
  v_id uuid;
  v_n int;
begin
  -- Ayni kisi 10 dakikada 5 talep (kopru dalinda nip_rez_talepleri uzerinden
  -- sayiliyor; yerelde talebin kendisi reservations'tadir).
  select count(*) into v_n from public.reservations r
   where r.created_at > now() - interval '10 minutes'
     and (r.phone = p_tel or (p_cihaz is not null and r.device = p_cihaz) or (p_customer is not null and r.customer_id = p_customer));
  if v_n >= 5 then return json_build_object('ok', false, 'hata', 'cok_hizli'); end if;

  -- Etkinlik satiri kilitlenir: ayni etkinlige es zamanli iki talep sirayla
  -- islenir (ayni telefon iki kez yazilamaz), onay da ayni kilidi alir
  -- (kapasite denetimi ile sayac ayni anda dogru kalir).
  select * into e from public.events where id = p_event for update;
  if e.id is null or e.status is distinct from 'active' then
    return json_build_object('ok', false, 'hata', 'etkinlik_yok');
  end if;
  if e.date < v_bugun then
    return json_build_object('ok', false, 'hata', 'gecti');
  end if;

  -- Uyelere ozel: giris yapmis uye ister ("open" disindaki her deger uyelere ozel sayilir).
  if coalesce(e.access_type, 'open') <> 'open' and p_customer is null then
    return json_build_object('ok', false, 'hata', 'uye_gerekli');
  end if;
  -- Engelli uye. Cikis yapip misafir olarak yazmasin diye engelli uyenin
  -- telefonu da tutulur. Kod "guven_dusuk": menudeki metni "uyelik kosulu
  -- saglanmiyor, bize yaz" (yeni hata kodu yok).
  -- (Inceleme 13.11: uyelerin cogunda customers.phone bos; yalniz ona bakmak
  -- engeli deliyordu. Engelli uyenin ONCEKI rezervasyonlarindaki telefon da
  -- tutulur; oturum aciksa o oturumun butun musteri satirlarina bakilir.)
  if (p_customer is not null and exists (select 1 from public.customers k where k.id = p_customer and k.rez_engelli))
     or (auth.uid() is not null and exists (select 1 from public.customers k where k.auth_user_id = auth.uid() and k.rez_engelli))
     or exists (select 1 from public.customers k where k.rez_engelli and public.nip_tel_duzelt(k.phone) = p_tel)
     or exists (select 1 from public.customers k join public.reservations x on x.customer_id = k.id
                 where k.rez_engelli and public.nip_tel_duzelt(x.phone) = p_tel) then
    return json_build_object('ok', false, 'hata', 'guven_dusuk');
  end if;
  if coalesce(e.approved_count, 0) >= coalesce(e.capacity, 0) then
    return json_build_object('ok', false, 'hata', 'dolu');
  end if;
  -- Kurallar: menunun gosterdigi metin neyse o (secili dil doluysa o, degilse
  -- Turkce). Menu metin gostermiyorsa kabul de istenmez; yoksa musteri
  -- isaretleyemeyecegi bir kutu yuzunden takilirdi.
  v_kural_metni := case when p_dil = 'en' and coalesce(e.rules_en, '') <> '' then e.rules_en
                        when p_dil = 'ru' and coalesce(e.rules_ru, '') <> '' then e.rules_ru
                        else coalesce(e.rules, '') end;
  if btrim(v_kural_metni) <> '' and not coalesce(p_kural, false) then
    return json_build_object('ok', false, 'hata', 'kural');
  end if;

  -- Ayni kisi, ayni etkinlik: ikinci talep acilmaz.
  -- "Gelmedi" isaretli kayit da sayilir (RESERVE'de oyleydi): isaret yanlissa
  -- personel geri alir; yeni talep acilsaydi ayni kisi iki kez onaylanir ve
  -- koltuk iki kez sayilirdi. Gelmedi isaretliyken kod VERILMEZ.
  if p_customer is not null then
    select * into v_var from public.reservations
     where event_id = e.id and customer_id = p_customer and status in ('pending', 'approved', 'no_show')
     order by created_at desc limit 1;
    if v_var.id is not null and public.nip_rez_durum(v_var.status, v_var.no_show_at) = 'no_show' then
      return json_build_object('ok', false, 'hata', 'zaten');
    end if;
    if v_var.id is not null then
      -- Uyenin kendi kaydi: kodu geri verilir (kimlik oturumla dogrulandi)
      return json_build_object('ok', true, 'zaten', true, 'kod', v_var.qr_id, 'durum', v_var.status,
        'etkinlik', e.name, 'tarih', e.date, 'saat', nullif(e.time, ''), 'kisi', coalesce(v_var.guest_count, 1),
        'eposta', p_eposta is not null);
    end if;
  end if;
  if exists (select 1 from public.reservations
              where event_id = e.id and phone = p_tel and status in ('pending', 'approved', 'no_show')) then
    -- Yalniz telefon eslesti: kod VERILMEZ (numarayi bilen baskasinin biletini alamasin)
    return json_build_object('ok', false, 'hata', 'zaten');
  end if;

  -- Kuru calistirma (test): butun denetimler calisir, kayit yazilmaz. Kod
  -- 'DNM-' ile baslar; gercek bir biletle karismaz.
  if coalesce(p_deneme, false) then
    return json_build_object('ok', true, 'zaten', false,
      'kod', 'DNM-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)), 'durum', 'pending',
      'etkinlik', e.name, 'tarih', e.date, 'saat', nullif(e.time, ''), 'kisi', p_kisi, 'eposta', p_eposta is not null);
  end if;

  select a.kod_on_eki into v_on from public.nip_rez_ayar a where a.tek;
  v_on := coalesce(v_on, 'NIP');
  for i in 1..5 loop
    v_kod := v_on || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    begin
      insert into public.reservations (qr_id, event_id, event_name, event_date, event_time, name, phone,
                                       guest_count, note, status, rules_accepted, customer_id, email, lang, device)
      values (v_kod, e.id, e.name, e.date, e.time, p_ad, p_tel, p_kisi, p_not, 'pending',
              coalesce(p_kural, false), p_customer, p_eposta, coalesce(p_dil, 'tr'), p_cihaz)
      returning id into v_id;
      exit;
    exception when unique_violation then
      v_id := null;   -- kod cakisti: yeni kodla bir daha
    end;
  end loop;
  if v_id is null then
    return json_build_object('ok', false, 'hata', 'baglanti');
  end if;

  -- Sahibe Telegram: koprunun bugun urettigi mesajin AYNISI, ayni gonderici
  -- (nip_reserve_bekleyenleri_isle -> nip_tg_gonder). Istek pg_net kuyruguna
  -- yazilir ve ancak bu islem kaydedilince yola cikar. Bildirim hata verirse
  -- talep yine yazilir: 10 dakikalik kontrol (nip_reserve_bekleyen_kontrol)
  -- bildirilmemis talebi yeniden dener.
  begin
    perform 1 from public.nip_reserve_bekleyenleri_isle(json_build_object('rezervasyonlar', json_build_array(
      json_build_object('id', v_id, 'name', p_ad, 'event_name', e.name, 'event_date', e.date,
                        'event_time', e.time, 'guest_count', p_kisi, 'created_at', now()))));
  exception when others then
    null;
  end;

  return json_build_object('ok', true, 'zaten', false, 'kod', v_kod, 'durum', 'pending',
    'etkinlik', e.name, 'tarih', e.date, 'saat', nullif(e.time, ''), 'kisi', p_kisi, 'eposta', p_eposta is not null);
end $$;

-- Menu: rezervasyon iste. Imza, girdi, donen bicim ve hata kodlari AYNI
-- (20261111_uygulama_ici_rezervasyon). Tek fark: hiz sinirindan sonra anahtara
-- bakar; yerel ise nip_rez_yerel_iste, degilse bugunku RESERVE cagrisi.
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
  v_eposta text;     -- oturumun DOGRULANMIS e-postasi (auth.users); customers.email DEGIL
  v_h json;
  v_ip text;
  v_anahtar text;
  v_top int;
begin
  if length(v_ad) < 2 or length(v_ad) > 80 then return json_build_object('ok', false, 'hata', 'ad'); end if;
  if v_tel is null then return json_build_object('ok', false, 'hata', 'telefon'); end if;
  begin v_event := (p->>'event_id')::uuid; exception when others then v_event := null; end;
  if v_event is null then return json_build_object('ok', false, 'hata', 'etkinlik_yok'); end if;
  begin v_kisi := greatest(1, least(20, coalesce((p->>'kisi')::int, 1))); exception when others then v_kisi := 1; end;

  if v_uid is not null then
    select * into c from public.customers where auth_user_id = v_uid order by created_at limit 1;
    -- Kimlik: uyenin kendisinin degistirebildigi customers.email degil, giris
    -- sisteminin dogruladigi adres. (Inceleme bulgusu: uye customers.email'i
    -- baska bir uyenin adresine cevirip onun rezervasyon profiline baglanabiliyordu.)
    select nullif(lower(btrim(u.email)), '') into v_eposta
      from auth.users u where u.id = v_uid and u.email_confirmed_at is not null;
  end if;
  if c.id is null then v_eposta := null; end if;

  -- Hiz siniri: istek sahibi basina dakikada 12; toplam 120 (sigorta, kilitsiz
  -- okunur); ayni kisi 10 dakikada 5 talep.
  begin
    v_h := nullif(current_setting('request.headers', true), '')::json;
  exception when others then v_h := null; end;
  v_ip := coalesce(nullif(btrim(v_h->>'cf-connecting-ip'), ''),
                   nullif(btrim(split_part(coalesce(v_h->>'x-forwarded-for', ''), ',', 1)), ''),
                   nullif(btrim(v_h->>'x-real-ip'), ''));
  v_anahtar := case when v_ip is not null then 'ip:' || left(md5(v_ip), 16)
                    when v_cihaz is not null then 'c:' || left(md5(v_cihaz), 16)
                    else '?' end;
  insert into public.nip_rez_sayac_ip (dakika, anahtar, n) values (date_trunc('minute', now()), v_anahtar, 1)
    on conflict (dakika, anahtar) do update set n = public.nip_rez_sayac_ip.n + 1
    returning n into v_n;
  if v_n > 12 then return json_build_object('ok', false, 'hata', 'cok_hizli'); end if;
  -- (Inceleme 13.11) Ayni kaynak 10 dakikada en cok 30 deneme: telefon ve cihaz
  -- degistirerek kisi basi siniri asan betik saatte yuzlerce bekleyen talep ve
  -- Telegram mesaji uretebiliyordu. Mekan Wi-Fi'si icin genis tutuldu.
  if v_anahtar <> '?' then
    select coalesce(sum(s.n), 0) into v_n from public.nip_rez_sayac_ip s
     where s.anahtar = v_anahtar and s.dakika > now() - interval '10 minutes';
    if v_n > 30 then return json_build_object('ok', false, 'hata', 'cok_hizli'); end if;
  end if;
  -- Sigorta: tek kaynak tek basina dolduramaz (kaynak basina en cok 12 sayilir);
  -- kod sorgusu sayaclari ('k:') talep sigortasina katilmaz.
  select coalesce(sum(least(s.n, 12)), 0) into v_top from public.nip_rez_sayac_ip s
   where s.dakika = date_trunc('minute', now()) and s.anahtar not like 'k:%';
  if v_top > 120 then return json_build_object('ok', false, 'hata', 'cok_hizli'); end if;
  select count(*) into v_n from public.nip_rez_talepleri t
   where t.created_at > now() - interval '10 minutes'
     and (t.telefon = v_tel or (v_cihaz is not null and t.cihaz = v_cihaz) or (c.id is not null and t.customer_id = c.id));
  if v_n >= 5 then return json_build_object('ok', false, 'hata', 'cok_hizli'); end if;

  -- GECIS MOLASI: son kopya sirasinda yeni talep alinmaz (menu "tekrar dene" der).
  if coalesce((select a.durdu from public.nip_rez_ayar a where a.tek), false) then
    return json_build_object('ok', false, 'hata', 'baglanti');
  end if;

  -- ANAHTAR (20261113): rezervasyon yerelde sunuluyorsa RESERVE cagrilmaz.
  if public.nip_rez_yerel_mi() then
    return public.nip_rez_yerel_iste(v_event, v_ad, v_tel, v_kisi, v_not, v_kural, v_dil, v_cihaz, c.id, v_eposta, v_deneme);
  end if;

  v_yanit := public.nip_rez_reserve_cagir('nip_order_rezervasyon', json_build_object('p', json_build_object(
    'event_id', v_event, 'ad', v_ad, 'telefon', v_tel, 'kisi', v_kisi, 'not', v_not, 'kural', v_kural,
    'uye', c.id is not null, 'profil_id', c.reserve_profile_id, 'eposta', v_eposta, 'deneme', v_deneme)));
  if v_yanit is null then return json_build_object('ok', false, 'hata', 'baglanti'); end if;
  if coalesce(v_yanit->>'ok', '') <> 'true' then
    return json_build_object('ok', false, 'hata', coalesce(v_yanit->>'kod', 'baglanti'));
  end if;

  v_id := (v_yanit->>'id')::uuid;
  insert into public.nip_rez_talepleri (rez_id, qr_id, customer_id, cihaz, ad, telefon, eposta, dil, event_id, etkinlik, tarih, saat, kisi, durum, durum_at)
  values (v_id, v_yanit->>'qr_id', c.id, v_cihaz, v_ad, v_tel, v_eposta, v_dil, v_event,
          v_yanit->>'event_name', (v_yanit->>'event_date')::date, nullif(v_yanit->>'event_time', ''),
          coalesce((v_yanit->>'kisi')::int, v_kisi), coalesce(v_yanit->>'status', 'pending'), now())
  on conflict (rez_id) do update
     set customer_id = coalesce(public.nip_rez_talepleri.customer_id, excluded.customer_id),
         eposta = coalesce(public.nip_rez_talepleri.eposta, excluded.eposta),
         dil = excluded.dil, durum = excluded.durum, durum_at = now();

  return json_build_object('ok', true, 'zaten', coalesce(v_yanit->>'zaten', '') = 'true',
    'kod', v_yanit->>'qr_id', 'durum', coalesce(v_yanit->>'status', 'pending'),
    'etkinlik', v_yanit->>'event_name', 'tarih', v_yanit->>'event_date', 'saat', nullif(v_yanit->>'event_time', ''),
    'kisi', coalesce((v_yanit->>'kisi')::int, v_kisi), 'eposta', v_eposta is not null);
end $$;

-- ----------------------------------------------------------------------------
-- 3) OKUMA (yerel dal): uye kendi taleplerini (customer_id), misafir elindeki
--    kodlarin taleplerini gorur. Kod = bilet; ad ve telefon DONMEZ. Alanlar
--    kopru dali ile ayni: kod, etkinlik, tarih, saat, kisi, durum.
--    durum: pending | approved | used | rejected | no_show | cancelled.
-- ----------------------------------------------------------------------------
create or replace function public.nip_rez_yerel_listem(p_customer uuid, p_kodlar text[])
returns json
language sql
stable
set search_path to 'public'
as $$
  select coalesce((
    select json_agg(json_build_object('kod', r.qr_id, 'etkinlik', r.event_name, 'tarih', r.event_date,
                                      'saat', nullif(r.event_time, ''), 'kisi', r.guest_count,
                                      'durum', public.nip_rez_durum(r.status, r.no_show_at))
                    order by r.event_date, r.created_at)
      from public.reservations r
     where ((p_customer is not null and r.customer_id = p_customer)
            or r.qr_id = any(coalesce(p_kodlar, '{}'::text[])))
       and r.qr_id is not null
       and (r.event_date is null or r.event_date >= (now() at time zone 'Europe/Istanbul')::date - 1)), '[]'::json);
$$;

-- Menu: rezervasyonlarim. Imza ve donen bicim AYNI; kodlar ve uye bulunduktan
-- sonra anahtara bakar.
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
  v_h json;
  v_ip text;
  v_bos int;
  v_n int;
begin
  select array_agg(k) into v_kodlar from (
    select distinct upper(btrim(x)) as k from unnest(coalesce(p_kodlar, '{}'::text[])) x
     where upper(btrim(x)) ~ '^[A-Z0-9]{2,6}-[A-Z0-9]{6,12}$' limit 20) q;
  v_kodlar := coalesce(v_kodlar, '{}'::text[]);
  if v_uid is not null then
    select * into c from public.customers where auth_user_id = v_uid order by created_at limit 1;
  end if;

  -- Kodla "sahiplenme" YOK (inceleme bulgusu): kodu bilen bir uye misafirin
  -- talebini hesabina baglayip onay e-postasini kendine cekebiliyordu. Uyenin
  -- talebi istek aninda baglanir; misafir, telefonundaki kodla gormeye devam eder.

  -- ANAHTAR (20261113): yerelde durum dogrudan reservations'tan okunur.
  if public.nip_rez_yerel_mi() then
    -- Kod tahmini (inceleme 13.11): kod = bilet. Bu fonksiyon girissiz
    -- cagrilir; sinirsiz olsaydi kodlar denenerek baskasinin rezervasyonu
    -- bulunabilirdi. Kaynak basina dakikada 40'tan fazla TUTMAYAN kod
    -- gonderilirse o istekte kodlara bakilmaz (uye kendi kayitlarini gorur).
    select count(*) into v_bos from unnest(v_kodlar) k
     where not exists (select 1 from public.reservations r where r.qr_id = k);
    if v_bos > 0 then
      begin
        v_h := nullif(current_setting('request.headers', true), '')::json;
      exception when others then v_h := null; end;
      v_ip := coalesce(nullif(btrim(v_h->>'cf-connecting-ip'), ''),
                       nullif(btrim(split_part(coalesce(v_h->>'x-forwarded-for', ''), ',', 1)), ''),
                       nullif(btrim(v_h->>'x-real-ip'), ''));
      insert into public.nip_rez_sayac_ip (dakika, anahtar, n)
      values (date_trunc('minute', now()), 'k:' || left(md5(coalesce(v_ip, '?')), 16), v_bos)
      on conflict (dakika, anahtar) do update set n = public.nip_rez_sayac_ip.n + excluded.n
      returning n into v_n;
      if v_n > 40 then v_kodlar := '{}'::text[]; end if;
    end if;
    return public.nip_rez_yerel_listem(c.id, v_kodlar);
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

-- ----------------------------------------------------------------------------
-- 4) PERSONEL ISLEMLERI. Her biri kucuk bir JSON doner: { ok, neden, ... }.
--    Yetkisiz cagri hata firlatir (42501). Kilit sirasi her yerde ayni: once
--    etkinlik, sonra rezervasyon, sonra uye; iki cihaz ayni anda basarsa
--    ikincisi guncel satiri gorur ve { ok:false, neden:'degisti' } alir.
-- ----------------------------------------------------------------------------

-- ONAYLA: bekleyen talep -> onayli. Kapasite asilmaz (onayli kisi + bu talep
-- <= kapasite; yer yoksa once etkinligin kapasitesi artirilir). Sayac kisi
-- kadar artar. Onay e-postasi mevcut kuyruga (nip_reserve_onay_bildirim)
-- yazilir ve gonderici hemen cagrilir; rez-bildirim fonksiyonu yollar.
--   { ok:true, durum:'approved', kisi, onayli, kapasite, eposta }
--   { ok:false, neden:'yok' | 'degisti' (durum) | 'dolu' (kalan, kisi) }
create or replace function public.nip_rez_onayla(p_rez uuid)
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r public.reservations;
  e public.events;
  v_event uuid;
  v_onayli int;
  v_eposta text;
begin
  if not public.nip_yonetici_mi() then
    raise exception 'rezervasyon onayi: yalniz yonetici' using errcode = '42501';
  end if;

  select x.event_id into v_event from public.reservations x where x.id = p_rez;
  if not found then return json_build_object('ok', false, 'neden', 'yok'); end if;
  if v_event is not null then
    select * into e from public.events where id = v_event for update;
  end if;
  select * into r from public.reservations where id = p_rez for update;
  if r.id is null then return json_build_object('ok', false, 'neden', 'yok'); end if;
  if r.status is distinct from 'pending' or r.event_id is distinct from v_event then
    return json_build_object('ok', false, 'neden', 'degisti', 'durum', public.nip_rez_durum(r.status, r.no_show_at));
  end if;

  if e.id is not null then
    if coalesce(e.approved_count, 0) + r.guest_count > coalesce(e.capacity, 0) then
      return json_build_object('ok', false, 'neden', 'dolu', 'kisi', r.guest_count,
        'kalan', greatest(0, coalesce(e.capacity, 0) - coalesce(e.approved_count, 0)));
    end if;
    update public.events set approved_count = coalesce(approved_count, 0) + r.guest_count
     where id = e.id returning approved_count into v_onayli;
  end if;

  update public.reservations
     set status = 'approved', approved_at = now(), acted_by = auth.uid(), acted_at = now()
   where id = p_rez;

  -- E-posta kuyrugu. Adres talep anindaki dogrulanmis oturum adresidir; yoksa
  -- (misafir) kayit "eposta_yok" yazilir ve panel "WhatsApp'tan haber ver" der.
  v_eposta := nullif(lower(btrim(coalesce(r.email, ''))), '');
  insert into public.nip_reserve_onay_bildirim (rez_id, ad, eposta, telefon, dil, etkinlik, tarih, saat, kisi, qr_id, onay_at, durum, kaynak)
  values (r.id, r.name, v_eposta, r.phone, coalesce(r.lang, 'tr'), r.event_name, r.event_date, nullif(r.event_time, ''),
          coalesce(r.guest_count, 1), r.qr_id, now(),
          case when v_eposta is null then 'eposta_yok' else 'bekliyor' end, 'uygulama')
  on conflict (rez_id) do nothing;
  if v_eposta is not null then
    -- Gonderim pg_net kuyrugundan, onay kaydedildikten sonra cikar. Hata onayi
    -- bozmaz; 10 dakikalik kontrol (nip_reserve_onay_kontrol) yeniden dener.
    begin
      perform public.nip_reserve_onay_gonder(array[r.id]);
    exception when others then
      null;
    end;
  end if;

  return json_build_object('ok', true, 'durum', 'approved', 'kisi', r.guest_count,
    'onayli', v_onayli, 'kapasite', e.capacity, 'eposta', v_eposta is not null);
end $$;

-- REDDET: bekleyen talep -> red (p_onayli = false). Onayli (girmemis, gelmedi
-- isaretsiz) kayit AYRI bir istekle iptal edilir (p_onayli = true; musteri
-- vazgecti): koltuk bosalir, sirada bekleyen onay e-postasi kapanir. Gitmis
-- e-posta geri alinamaz; eposta_gitti = true ise personel musteriye haber verir.
-- Cagiran HANGI durumu reddettigini soyler (inceleme 13.11): eski listeye bakan
-- ikinci cihaz "Reddet"e bastiginda az once onaylanmis kayit iptal olmaz,
-- neden:'degisti' doner.
--   { ok:true, durum:'rejected', bosalan, eposta_gitti }
--   { ok:false, neden:'yok' | 'degisti' (durum) }
create or replace function public.nip_rez_reddet(p_rez uuid, p_onayli boolean default false)
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r public.reservations;
  e public.events;
  v_event uuid;
  v_bosalan int := 0;
  v_gitti boolean := false;
begin
  if not public.nip_yonetici_mi() then
    raise exception 'rezervasyon reddi: yalniz yonetici' using errcode = '42501';
  end if;

  select x.event_id into v_event from public.reservations x where x.id = p_rez;
  if not found then return json_build_object('ok', false, 'neden', 'yok'); end if;
  if v_event is not null then
    select * into e from public.events where id = v_event for update;
  end if;
  select * into r from public.reservations where id = p_rez for update;
  if r.id is null then return json_build_object('ok', false, 'neden', 'yok'); end if;
  if r.event_id is distinct from v_event
     or not ((r.status = 'pending' and not coalesce(p_onayli, false))
          or (r.status = 'approved' and r.no_show_at is null and coalesce(p_onayli, false))) then
    return json_build_object('ok', false, 'neden', 'degisti', 'durum', public.nip_rez_durum(r.status, r.no_show_at));
  end if;

  if r.status = 'approved' then
    if e.id is not null then
      update public.events set approved_count = greatest(0, coalesce(approved_count, 0) - r.guest_count)
       where id = e.id;
      v_bosalan := r.guest_count;
    end if;
    select coalesce(bool_or(b.durum = 'gonderildi'), false) into v_gitti
      from public.nip_reserve_onay_bildirim b where b.rez_id = p_rez;
    update public.nip_reserve_onay_bildirim b
       set durum = 'hata', hata = 'onay-kalkti', deneme = 3, son = now()
     where b.rez_id = p_rez and b.durum in ('bekliyor', 'hata') and b.deneme < 3;
  end if;

  update public.reservations
     set status = 'rejected', acted_by = auth.uid(), acted_at = now()
   where id = p_rez;

  return json_build_object('ok', true, 'durum', 'rejected', 'bosalan', v_bosalan, 'eposta_gitti', v_gitti);
end $$;

-- KAPIDA GIRIS: kayit kimligiyle (p_rez) ya da kodla (p_kod). Yalniz HALA
-- onayli ve gelmedi isaretsiz kayit girer; uyenin "geldi" sayaci bir kez artar.
-- Baska gunun rezervasyonu (inceleme 13.11): once SORULUR, yazilmaz
-- (neden:'tarih'). Kapi "yine de giris yap" derse p_zorla = true ile yeniden
-- cagirir. Eskiden giris yazilip uyari sonra geliyordu; yanlis satira basilan
-- giris geri alinamiyor, asil gunun kaydi "gelmedi" oluyordu.
--   { ok:true, durum:'used', ad, kisi, etkinlik, tarih, saat, bugun, uye, geldi, gelmedi }
--   { ok:false, neden:'yok' (kod) | 'kullanilmis' | 'onaysiz' | 'tarih', durum, ad, kisi, etkinlik, tarih, giris_at }
create or replace function public.nip_rez_giris(p_rez uuid default null, p_kod text default null, p_zorla boolean default false)
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r public.reservations;
  v_kod text := nullif(upper(btrim(coalesce(p_kod, ''))), '');
  v_durum text;
  v_say boolean := false;
  v_geldi int;
  v_gelmedi int;
begin
  if not public.is_staff() then
    raise exception 'rezervasyon girisi: yalniz personel' using errcode = '42501';
  end if;

  if p_rez is not null then
    select * into r from public.reservations where id = p_rez for update;
  elsif v_kod is not null then
    select * into r from public.reservations where qr_id = v_kod for update;
  end if;
  if r.id is null then
    return json_build_object('ok', false, 'neden', 'yok', 'kod', v_kod);
  end if;

  v_durum := public.nip_rez_durum(r.status, r.no_show_at);
  if v_durum is distinct from 'approved' then
    return json_build_object('ok', false, 'neden', case when v_durum = 'used' then 'kullanilmis' else 'onaysiz' end,
      'durum', v_durum, 'ad', r.name, 'kisi', r.guest_count, 'etkinlik', r.event_name, 'tarih', r.event_date,
      'giris_at', r.checked_in_at);
  end if;

  if r.event_date is not null and r.event_date <> public.nip_business_day(now()) and not coalesce(p_zorla, false) then
    return json_build_object('ok', false, 'neden', 'tarih', 'durum', v_durum, 'ad', r.name, 'kisi', r.guest_count,
      'etkinlik', r.event_name, 'tarih', r.event_date);
  end if;

  if r.customer_id is not null then
    if not r.came_counted then
      update public.customers set rez_geldi = rez_geldi + 1
       where id = r.customer_id returning rez_geldi, rez_gelmedi into v_geldi, v_gelmedi;
      v_say := found;
    else
      select k.rez_geldi, k.rez_gelmedi into v_geldi, v_gelmedi from public.customers k where k.id = r.customer_id;
    end if;
  end if;

  update public.reservations
     set status = 'used', checked_in_at = now(), came_counted = (came_counted or v_say),
         acted_by = auth.uid(), acted_at = now()
   where id = r.id;

  return json_build_object('ok', true, 'durum', 'used', 'ad', r.name, 'kisi', r.guest_count,
    'etkinlik', r.event_name, 'tarih', r.event_date, 'saat', nullif(r.event_time, ''),
    'bugun', r.event_date is null or r.event_date = public.nip_business_day(now()),
    'uye', r.customer_id is not null, 'geldi', v_geldi, 'gelmedi', v_gelmedi);
end $$;

-- GELMEDI ve geri alma (RESERVE'deki nip_gelmedi ile ayni imza). Guven puani
-- yok; uyenin "gelmedi" sayaci tam bir kez artar, geri almada yalniz bu kayit
-- icin gercekten artmis olan sayi dusulur (no_show_counted). Koltuk bosalmaz.
--   p_geri = false : onayli -> gelmedi.   p_geri = true : gelmedi -> onayli.
--   { ok:true, durum:'no_show' | 'approved', uye, gelmedi }
--   { ok:false, neden:'yok' | 'degisti' (durum) }
create or replace function public.nip_rez_gelmedi(p_rez uuid, p_geri boolean default false)
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r public.reservations;
  v_durum text;
  v_say boolean := false;
  v_gelmedi int;
begin
  if not public.nip_yonetici_mi() then
    raise exception 'gelmedi: yalniz yonetici' using errcode = '42501';
  end if;

  select * into r from public.reservations where id = p_rez for update;
  if r.id is null then return json_build_object('ok', false, 'neden', 'yok'); end if;
  v_durum := public.nip_rez_durum(r.status, r.no_show_at);

  if not coalesce(p_geri, false) then
    if v_durum is distinct from 'approved' then
      return json_build_object('ok', false, 'neden', 'degisti', 'durum', v_durum);
    end if;
    if r.customer_id is not null then
      if not r.no_show_counted then
        update public.customers set rez_gelmedi = rez_gelmedi + 1
         where id = r.customer_id returning rez_gelmedi into v_gelmedi;
        v_say := found;
      else
        select k.rez_gelmedi into v_gelmedi from public.customers k where k.id = r.customer_id;
      end if;
    end if;
    update public.reservations
       set status = 'no_show', no_show_at = now(), no_show_counted = (no_show_counted or v_say),
           acted_by = auth.uid(), acted_at = now()
     where id = p_rez;
    return json_build_object('ok', true, 'durum', 'no_show', 'uye', r.customer_id is not null, 'gelmedi', v_gelmedi);
  end if;

  -- GERI AL (yanlis isaret ya da gec gelen misafir): yeniden onayli, kapida girebilir.
  if v_durum is distinct from 'no_show' then
    return json_build_object('ok', false, 'neden', 'degisti', 'durum', v_durum);
  end if;
  if r.customer_id is not null then
    if r.no_show_counted then
      update public.customers set rez_gelmedi = greatest(0, rez_gelmedi - 1)
       where id = r.customer_id returning rez_gelmedi into v_gelmedi;
    else
      select k.rez_gelmedi into v_gelmedi from public.customers k where k.id = r.customer_id;
    end if;
  end if;
  update public.reservations
     set status = 'approved', no_show_at = null, no_show_counted = false,
         acted_by = auth.uid(), acted_at = now()
   where id = p_rez;
  return json_build_object('ok', true, 'durum', 'approved', 'uye', r.customer_id is not null, 'gelmedi', v_gelmedi);
end $$;

-- UYE ENGELI: engelli uye rezervasyon talebi acamaz (nip_rez_yerel_iste).
-- Bekleyen talepleri oldugu gibi kalir; karari yonetici verir.
--   { ok:true, engelli }   { ok:false, neden:'yok' }
create or replace function public.nip_rez_engel(p_customer uuid, p_engel boolean)
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_var boolean;
begin
  if not public.nip_yonetici_mi() then
    raise exception 'uye engeli: yalniz yonetici' using errcode = '42501';
  end if;
  select k.rez_engelli into v_var from public.customers k where k.id = p_customer for update;
  if not found then return json_build_object('ok', false, 'neden', 'yok'); end if;
  update public.customers set rez_engelli = coalesce(p_engel, false) where id = p_customer;
  return json_build_object('ok', true, 'engelli', coalesce(p_engel, false));
end $$;

-- ----------------------------------------------------------------------------
-- 5) BILDIRIM HATLARI. Iki zamanlanmis kontrol RESERVE'den cekiyordu. Anahtar
--    acilinca RESERVE'ye bakmamalilar: nip_reserve_onay_kontrol, RESERVE'nin
--    onayli listesinde olmayan her kaydi "onay-kalkti" diye kapatir; yerelde
--    onaylanan kaydin sirada bekleyen e-postasi boyle kapanirdi. Ikisi de
--    anahtara bakar; kopru dali satir satir aynidir.
-- ----------------------------------------------------------------------------

-- Onay e-postasi, yerel: su an onayli olanlar gecerlidir (nip_onaylananlari_ver
-- ile ayni pencere: son 30 gunde onaylanmis, tarihi gecmemis). Kuyrukta olmayan
-- onay kuyruga alinir (panelden dogrudan yazilmis onay), onayi kalkan kapanir,
-- bekleyen ve hata alanlar yeniden yollanir (en cok 3 deneme).
create or replace function public.nip_rez_yerel_onay_kontrol()
returns integer
language plpgsql
set search_path to 'public'
as $$
declare
  v_gecerli uuid[];
  v_yeni int := 0;
  v_bugun date := (now() at time zone 'Europe/Istanbul')::date;
begin
  select coalesce(array_agg(r.id), '{}'::uuid[]) into v_gecerli
    from public.reservations r
   where r.status = 'approved' and r.no_show_at is null
     and r.approved_at > now() - interval '30 days'
     and (r.event_date is null or r.event_date >= v_bugun - 1);

  insert into public.nip_reserve_onay_bildirim (rez_id, ad, eposta, telefon, dil, etkinlik, tarih, saat, kisi, qr_id, onay_at, durum, kaynak)
  select r.id, r.name, nullif(lower(btrim(coalesce(r.email, ''))), ''), r.phone, coalesce(r.lang, 'tr'),
         r.event_name, r.event_date, nullif(r.event_time, ''), coalesce(r.guest_count, 1), r.qr_id, r.approved_at,
         case when nullif(lower(btrim(coalesce(r.email, ''))), '') is null then 'eposta_yok' else 'bekliyor' end,
         'uygulama'
    from public.reservations r
   where r.id = any(v_gecerli)
  on conflict (rez_id) do nothing;
  get diagnostics v_yeni = row_count;

  -- Onayi geri alinan (reddedildi, giris yapti, gelmedi) ve sirada bekleyen kayit
  -- kapanir. Karar AYNI ifadede verilir (inceleme 13.11): once liste cikarilip
  -- sonra kapatilsaydi, arada onaylanan kaydin taze e-postasi "onay-kalkti" diye
  -- kapanirdi. Yerelde hic olmayan kayda (kopru doneminden kalan) dokunulmaz.
  update public.nip_reserve_onay_bildirim b
     set durum = 'hata', hata = 'onay-kalkti', deneme = 3, son = now()
   where b.durum in ('bekliyor', 'hata') and b.deneme < 3
     and exists (select 1 from public.reservations r where r.id = b.rez_id)
     and not exists (select 1 from public.reservations r
                      where r.id = b.rez_id and r.status = 'approved' and r.no_show_at is null
                        and r.approved_at > now() - interval '30 days'
                        and (r.event_date is null or r.event_date >= v_bugun - 1));
  -- Uc gonderimde de fonksiyondan yanit gelmediyse kayit "sirada" diye kalmasin
  update public.nip_reserve_onay_bildirim b
     set durum = 'hata', hata = 'cevap-yok'
   where b.durum = 'bekliyor' and b.deneme >= 3 and b.son < now() - interval '15 minutes';
  perform public.nip_reserve_onay_gonder(v_gecerli);
  return v_yeni;
end $$;

create or replace function public.nip_reserve_onay_kontrol()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_sir text;
  v_anon constant text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRpcXBhcmpydHZ2Znh2d3hlYm92Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5Mzc3OTMsImV4cCI6MjA4OTUxMzc5M30.pNI2yU6LDG8583HBPq-5puxkpEVEAYwhGp9ibJ1WBsI';
  v_url  constant text := 'https://diqparjrtvvfxvwxebov.supabase.co/rest/v1/rpc/nip_onaylananlari_ver';
  v_status int; v_content text; v_yeni int := 0; v_gecerli uuid[];
begin
  -- Cagiran: zamanlanmis is / SQL oturumu (istek rolu yok) ya da yonetici
  -- (nip_reserve_onay_simdi uzerinden). Tarayici oturumu dogrudan cagiramaz.
  if coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') in ('anon', 'authenticated')
     and not public.nip_yonetici_mi() then
    raise exception 'rezervasyon bildirimi: yalniz yonetici' using errcode = '42501';
  end if;

  -- ANAHTAR (20261113): yerelde RESERVE'ye gidilmez.
  if public.nip_rez_yerel_mi() then
    return public.nip_rez_yerel_onay_kontrol();
  end if;

  select decrypted_secret into v_sir from vault.decrypted_secrets where name = 'reserve_sync_sir';
  if v_sir is null then
    insert into public.nip_reserve_bildirim_log (ok, hata) values (false, 'onay: Vault''ta reserve_sync_sir yok');
    return 0;
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
    insert into public.nip_reserve_bildirim_log (ok, hata) values (false, 'onay ag: ' || sqlerrm);
    return 0;
  end;

  if v_status <> 200 then
    insert into public.nip_reserve_bildirim_log (ok, hata) values (false, 'onay ' || v_status || ' ' || left(coalesce(v_content, ''), 300));
    return 0;
  end if;

  v_yeni := public.nip_reserve_onaylari_isle(v_content::json);
  -- RESERVE'de su an onayli olanlar: yalniz bunlara e-posta gider
  select coalesce(array_agg(x.id), '{}'::uuid[]) into v_gecerli
    from json_to_recordset(v_content::json) as x(id uuid) where x.id is not null;
  -- Onayi geri alinan (reddedildi, giris yapti, gelmedi) ve sirada bekleyen kayit kapanir
  update public.nip_reserve_onay_bildirim b
     set durum = 'hata', hata = 'onay-kalkti', deneme = 3, son = now()
   where b.durum in ('bekliyor', 'hata') and b.deneme < 3 and not (b.rez_id = any(v_gecerli));
  -- Uc gonderimde de fonksiyondan yanit gelmediyse (acilis hatasi, zaman asimi)
  -- kayit "sirada" diye kalmasin: panel "gonderilemedi — WhatsApp'tan haber ver" der.
  update public.nip_reserve_onay_bildirim b
     set durum = 'hata', hata = 'cevap-yok'
   where b.durum = 'bekliyor' and b.deneme >= 3 and b.son < now() - interval '15 minutes';
  perform public.nip_reserve_onay_gonder(v_gecerli);
  return v_yeni;
end $$;

-- Telegram "rezervasyon talebi", yerel: son 3 gunun bekleyen talepleri ayni
-- isleyiciye verilir (nip_reserve_bekleyenleri_isle; bildirilen bir daha
-- gitmez). Talep aninda giden bildirimin emniyet agi.
create or replace function public.nip_rez_yerel_bekleyen_kontrol()
returns void
language plpgsql
set search_path to 'public'
as $$
declare
  v_p json;
  v_s record;
begin
  select json_build_object('uyeler', '[]'::json, 'rezervasyonlar', coalesce((
           select json_agg(json_build_object('id', r.id, 'name', r.name, 'event_name', r.event_name,
                                             'event_date', r.event_date, 'event_time', r.event_time,
                                             'guest_count', coalesce(r.guest_count, 1), 'created_at', r.created_at)
                           order by r.created_at)
             from public.reservations r
            where r.status = 'pending' and r.created_at > now() - interval '3 days'), '[]'::json))
    into v_p;
  select * into v_s from public.nip_reserve_bekleyenleri_isle(v_p);
  insert into public.nip_reserve_bildirim_log (ok, uye, rez) values (true, v_s.uye, v_s.rez);
exception when others then
  insert into public.nip_reserve_bildirim_log (ok, hata) values (false, 'yerel: ' || left(sqlerrm, 300));
end $$;

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
begin
  -- Yalniz zamanlanmis is / SQL oturumu. Eski denetim current_user'a
  -- bakiyordu; SECURITY DEFINER icinde o fonksiyon sahibidir ve denetim hic
  -- tutmuyordu. Istek rolune bakilir (calistirma yetkisi zaten kapali).
  if current_user in ('authenticated', 'anon')
     or coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') in ('anon', 'authenticated') then
    raise exception 'dogrudan cagrilamaz';
  end if;

  -- ANAHTAR (20261113): yerelde RESERVE'ye gidilmez.
  if public.nip_rez_yerel_mi() then
    perform public.nip_rez_yerel_bekleyen_kontrol();
    return;
  end if;

  select decrypted_secret into v_sir from vault.decrypted_secrets where name = 'reserve_sync_sir';
  if v_sir is null then
    insert into public.nip_reserve_bildirim_log (ok, hata) values (false, 'Vault''ta reserve_sync_sir yok');
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

-- ----------------------------------------------------------------------------
-- 5b) MUSTERI BAGI KALKANI (inceleme 13.11). Musteri satiri kaldirilirsa
--     rezervasyonun customer_id'si kendiliginden bosaliyor (bag kurali). Uye
--     profili birlestirme (save_member_profile) "hayalet" satiri kaldirirken
--     rezervasyonlari ve geldi / gelmedi sayaclarini bilmiyor: uyenin onayli
--     rezervasyonu "Rezervasyonlarim"dan sessizce dusuyor, engel ve sayaclar
--     kayboluyordu. Artik rezervasyonu olan musteri satiri kaldirilamaz; islem
--     hata verir (birlestirme bunu yakalar ve "bize yaz" der), personel once
--     rezervasyonlari dogru uyeye tasir.
-- ----------------------------------------------------------------------------
create or replace function public.reservations_guard_musteri_bagi()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if old.customer_id is not null and new.customer_id is null
     and not exists (select 1 from public.customers k where k.id = old.customer_id) then
    raise exception 'rezervasyonu olan musteri kaydi kaldirilamaz; once rezervasyonlari tasiyin' using errcode = '23505';
  end if;
  return new;
end $$;

do $t$
begin
  if not exists (select 1 from pg_trigger
                  where tgname = 'trg_reservations_guard_musteri' and tgrelid = 'public.reservations'::regclass) then
    create trigger trg_reservations_guard_musteri
      before update of customer_id on public.reservations
      for each row execute function public.reservations_guard_musteri_bagi();
  end if;
end $t$;
revoke all on function public.reservations_guard_musteri_bagi() from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 6) RLS. reservations_talep herkese (anon dahil) dogrudan talep yazdiriyordu:
--    anon anahtari yayinlanan pakette durdugu icin kural, hiz siniri ve kod
--    uretimi atlanarak tabloya satir yazilabiliyordu. Artik butun talepler
--    nip_rezervasyon_iste uzerinden gelir. Politika yerinde kalir, kapatilir.
--    Personelin okuma / yazma politikasi (reservations_personel) AYNI kalir.
--    anon ve uye baska kimsenin rezervasyonunu okuyamaz (okuma politikasi yok);
--    kendi kaydini nip_rezervasyonlarim verir.
-- ----------------------------------------------------------------------------
do $p$
begin
  if exists (select 1 from pg_policies
              where schemaname = 'public' and tablename = 'reservations' and policyname = 'reservations_talep') then
    alter policy reservations_talep on public.reservations to authenticated with check (false);
    comment on policy reservations_talep on public.reservations is
      'KAPALI (20261113): dogrudan talep yazilmaz; talep nip_rezervasyon_iste ile acilir.';
  end if;
end $p$;
revoke all on public.reservations from anon;

-- ----------------------------------------------------------------------------
-- 7) YETKILER
-- ----------------------------------------------------------------------------
-- Anahtar bilgisi: menu (anon) ve panel okur.
revoke all on function public.nip_rez_yerel_mi() from public;
grant execute on function public.nip_rez_yerel_mi() to anon, authenticated, service_role;

-- Menu: bugun de anon ve authenticated cagiriyor.
revoke all on function public.nip_rezervasyon_iste(json) from public;
grant execute on function public.nip_rezervasyon_iste(json) to anon, authenticated;
revoke all on function public.nip_rezervasyonlarim(text[]) from public;
grant execute on function public.nip_rezervasyonlarim(text[]) to anon, authenticated;

-- Ic fonksiyonlar: yalniz bu dosyadaki fonksiyonlar ve zamanlanmis isler.
revoke all on function public.nip_rez_durum(text, timestamptz) from public, anon, authenticated;
revoke all on function public.nip_rez_yerel_iste(uuid, text, text, integer, text, boolean, text, text, uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.nip_rez_yerel_listem(uuid, text[]) from public, anon, authenticated;
revoke all on function public.nip_rez_yerel_onay_kontrol() from public, anon, authenticated;
revoke all on function public.nip_rez_yerel_bekleyen_kontrol() from public, anon, authenticated;
revoke all on function public.nip_reserve_onay_kontrol() from public, anon, authenticated;
revoke all on function public.nip_reserve_bekleyen_kontrol() from public, anon, authenticated;
revoke all on function public.customers_guard_rez_cols() from public, anon, authenticated;

-- Personel islemleri: panel (giris yapmis personel). Rol denetimi fonksiyonun icinde.
revoke all on function public.nip_rez_onayla(uuid) from public, anon;
grant execute on function public.nip_rez_onayla(uuid) to authenticated;
revoke all on function public.nip_rez_reddet(uuid, boolean) from public, anon;
grant execute on function public.nip_rez_reddet(uuid, boolean) to authenticated;
revoke all on function public.nip_rez_giris(uuid, text, boolean) from public, anon;
grant execute on function public.nip_rez_giris(uuid, text, boolean) to authenticated;
revoke all on function public.nip_rez_gelmedi(uuid, boolean) from public, anon;
grant execute on function public.nip_rez_gelmedi(uuid, boolean) to authenticated;
revoke all on function public.nip_rez_engel(uuid, boolean) from public, anon;
grant execute on function public.nip_rez_engel(uuid, boolean) to authenticated;
