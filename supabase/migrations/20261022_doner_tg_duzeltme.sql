-- DONER TELEGRAM DUZELTMELERI (20261021 incelemesinden)
--
-- 1. nip_mutfak_sozluk_tam(): canlida 18.10'da acilmis, depoda yoktu.
--    Tanim canlidan birebir alindi (davranis degismez); dosya tek basina
--    uygulanabilir ve incelenebilir olsun diye burada.
-- 2. nip_mutfak_parca_turkce: bos parca NULL donup kalemi bozmasin.
-- 3. Grup baglama: tek kullanimlik kod (/baglan 123456), yalniz grup ya da
--    supergrup; /start kabul edilmez; getUpdates offset ile ileri gider
--    (eski mesajlar onaylanir, yeniden baglama olmaz). 409 iletisi kafe
--    botunun webhook'unu silmeye yonlendirmez.
-- 4. Siparis tetikleyicisi: kafe koprusunun "hazirlaniyor" iptali
--    (customer_name 'İPTAL! ...') da yakalanir. (status='cancelled' kosulu
--    zararsiz yedek: kitchen_orders_status_chk yalniz new/preparing/done/
--    archived izin verir.)
--    Dakikada 12'den fazla siparis mesaji gonderilmez (anon ile toplu kayda
--    karsi); 10 dakikada bir uyari.
-- 5. Gider duzeltme / silme gruba bildirilir (kim yapti). "giren" alani
--    istemciden degistirilemez: girisde auth.uid(), duzeltmede eski deger
--    (gun sonunda son duzelten).
--
-- Kafe nesnelerine (nip_tg_*, telegram fonksiyonu, kafe tablolari) dokunulmaz.
-- Hicbir nesne silinmez. Tetikleyici "create or replace trigger" ile degisir.
--
-- Dogrulama (21.10, canlida geri alinan islem, sahte anahtar): hazirlaniyor
-- iptali ve yeni kart iptali birer mesaj; durum degisikligi mesajsiz; 10
-- spam kaydinda 12 mesaj + 1 uyari; giren istemciden degismez; yalniz
-- aciklama degisince mesaj yok; ozel sohbetteki dogru kod ve yanlis kodlu
-- grup reddedildi, dogru kodlu supergrup baglandi, offset ilerledi.

-- 1. Sozluk (canlidaki tanim) -----------------------------------------------------
create or replace function public.nip_mutfak_sozluk_tam()
returns table(yabanci text, turkce text, oncelik integer)
language sql
stable
set search_path to 'public'
as $function$
  -- names {tr,en,ru}  (soslar, garniturler)
  select trim(n.value #>> '{}'), trim(km.names->>'tr'), 0
    from public.kitchen_menu km, jsonb_each(km.names) n
   where km.names is not null and jsonb_typeof(km.names) = 'object'
     and n.key in ('en','ru') and nullif(trim(km.names->>'tr'), '') is not null
  union
  -- variants {tr:[],en:[],ru:[]}  (konumsal)
  select trim(v.val #>> '{}'), trim(km.variants->'tr'->>((v.idx - 1)::int)), 0
    from public.kitchen_menu km,
         lateral (select k as lang from jsonb_object_keys(km.variants) k where k in ('en','ru')) l,
         lateral jsonb_array_elements(km.variants->l.lang) with ordinality v(val, idx)
   where km.variants is not null and jsonb_typeof(km.variants) = 'object'
     and km.variants->'tr'->>((v.idx - 1)::int) is not null
  union
  -- extras [{names:{tr,en,ru}}]
  select trim(n.value #>> '{}'), trim(e->'names'->>'tr'), 0
    from public.kitchen_menu km, jsonb_array_elements(km.extras) e, jsonb_each(e->'names') n
   where km.extras is not null and jsonb_typeof(km.extras) = 'array'
     and n.key in ('en','ru') and nullif(trim(e->'names'->>'tr'), '') is not null
  union
  -- elle sozluk (yedek)
  select yabanci, turkce, 1 from public.nip_mutfak_sozluk;
$function$;

-- 2. Parca cevirisi: bos parca kendisi kalir -------------------------------------
create or replace function public.nip_mutfak_parca_turkce(p text)
returns text
language sql
stable
set search_path to 'public'
as $$
  select coalesce((
    select string_agg(
             case when a.alt ~* '^\s*(not|note|примечание|заметка)\s*:' then trim(a.alt)
                  else coalesce((select t.turkce from public.nip_mutfak_sozluk_tam() t where t.yabanci = trim(a.alt) order by t.oncelik limit 1), trim(a.alt)) end,
             ' · ' order by a.sira)
      from unnest(string_to_array(p, ' · ')) with ordinality as a(alt, sira)), trim(coalesce(p, '')));
$$;

-- 3. Grup baglama: kod + grup turu + offset ---------------------------------------
create or replace function public.doner_tg_kod_al()
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_kod text;
begin
  if not public.doner_admin() then raise exception 'doner: yetkisiz' using errcode = '42501'; end if;
  v_kod := lpad((floor(random() * 900000) + 100000)::int::text, 6, '0');
  perform public.doner_ayar_yaz('tg_bul_kod', v_kod);
  perform public.doner_ayar_yaz('tg_bul_kod_zaman', now()::text);
  return v_kod;
end $function$;

create or replace function public.doner_tg_grup_bul()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_token text; v_istek bigint; v_offset bigint; v_govde jsonb;
begin
  if not public.doner_admin() then raise exception 'doner: yetkisiz' using errcode = '42501'; end if;
  v_token := public.doner_tg_token();
  if v_token is null then raise exception 'Bot anahtarı yok (Vault: doner_tg_token).'; end if;
  if public.doner_ayar_oku('tg_bul_kod') is null then raise exception 'Önce "Kod al".'; end if;
  v_offset := nullif(public.doner_ayar_oku('tg_offset'), '')::bigint;
  v_govde := jsonb_build_object('allowed_updates', jsonb_build_array('message'), 'limit', 100);
  if v_offset is not null then v_govde := v_govde || jsonb_build_object('offset', v_offset + 1); end if;
  v_istek := net.http_post(
    url := 'https://api.telegram.org/bot' || v_token || '/getUpdates',
    body := v_govde,
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
declare
  v_istek bigint; r record; v jsonb; m jsonb; v_chat text; v_ad text; v_n int := 0;
  v_kod text; v_kod_zaman timestamptz; v_max bigint; v_tur text;
begin
  if not public.doner_admin() then raise exception 'doner: yetkisiz' using errcode = '42501'; end if;
  v_istek := nullif(public.doner_ayar_oku('tg_bul_istek'), '')::bigint;
  if v_istek is null then return jsonb_build_object('hata', 'önce Grubu bul'); end if;
  select * into r from net._http_response x where x.id = v_istek;
  if not found then return jsonb_build_object('bekle', true); end if;
  perform public.doner_ayar_yaz('tg_bul_istek', null);
  if r.status_code is distinct from 200 then
    return jsonb_build_object('hata', coalesce(r.error_msg, r.status_code::text) ||
      case when r.status_code = 409 then ' — bu anahtar webhook kullanan başka bir bota ait (örn. kafe botu). Döner için @BotFather''da AYRI bot aç; kafe botuna dokunma.'
           when r.status_code = 401 then ' — bot anahtarı yanlış' else '' end);
  end if;
  v := r.content::jsonb;
  if coalesce((v->>'ok')::boolean, false) is not true then return jsonb_build_object('hata', left(coalesce(v->>'description', 'telegram hata'), 200)); end if;

  v_kod := public.doner_ayar_oku('tg_bul_kod');
  v_kod_zaman := nullif(public.doner_ayar_oku('tg_bul_kod_zaman'), '')::timestamptz;
  if v_kod is null or v_kod_zaman is null or v_kod_zaman < now() - interval '30 minutes' then
    return jsonb_build_object('hata', 'Kodun süresi doldu. Yeni kod al.');
  end if;

  select max((e->>'update_id')::bigint) into v_max from jsonb_array_elements(v->'result') e;
  if v_max is not null then perform public.doner_ayar_yaz('tg_offset', v_max::text); end if;

  for m in select e from jsonb_array_elements(v->'result') e order by (e->>'update_id')::bigint desc loop
    v_n := v_n + 1;
    v_tur := m->'message'->'chat'->>'type';
    if v_tur in ('group', 'supergroup')
       and (m->'message'->>'text') ~* ('^/(baglan|bağlan)(@\w+)?\s+' || v_kod || '\s*$') then
      v_chat := m->'message'->'chat'->>'id';
      v_ad := coalesce(m->'message'->'chat'->>'title', 'grup');
      exit;
    end if;
  end loop;
  if v_chat is null then return jsonb_build_object('bulunamadi', true, 'mesaj', v_n, 'kod', v_kod); end if;
  perform public.doner_ayar_yaz('tg_chat', v_chat);
  perform public.doner_ayar_yaz('tg_chat_ad', v_ad);
  perform public.doner_ayar_yaz('tg_bul_kod', null);
  return jsonb_build_object('bagli', true, 'ad', v_ad);
end $function$;

create or replace function public.doner_tg_durum()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare v_kod text; v_kod_zaman timestamptz;
begin
  if not public.doner_admin() then raise exception 'doner: yetkisiz' using errcode = '42501'; end if;
  v_kod := public.doner_ayar_oku('tg_bul_kod');
  v_kod_zaman := nullif(public.doner_ayar_oku('tg_bul_kod_zaman'), '')::timestamptz;
  if v_kod_zaman is null or v_kod_zaman < now() - interval '30 minutes' then v_kod := null; end if;
  return jsonb_build_object(
    'token_var', public.doner_tg_token() is not null,
    'chat', public.doner_ayar_oku('tg_chat'),
    'chat_ad', public.doner_ayar_oku('tg_chat_ad'),
    'kod', v_kod,
    'site', public.doner_ayar_oku('site'),
    'son', coalesce((select jsonb_agg(jsonb_build_object('zaman', to_char(t.created_at at time zone 'Europe/Istanbul', 'DD.MM HH24:MI'), 'kaynak', t.kaynak, 'durum', t.durum, 'hata', t.son_hata, 'metin', left(t.govde->>'text', 80)) order by t.id desc)
                      from (select * from public.doner_tg_giden order by id desc limit 8) t), '[]'::jsonb));
end $function$;

revoke execute on function public.doner_tg_kod_al() from public, anon;
grant execute on function public.doner_tg_kod_al() to authenticated;

-- 4. Siparis tetikleyicisi: iptal yollari + hiz siniri ------------------------------
create or replace function public.doner_tg_trg_siparis()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_bos boolean; v_eski_bos boolean; v_iptal boolean; v_metin text;
begin
  begin
    if public.doner_ayar_oku('tg_chat') is null then return null; end if;
    if tg_op = 'INSERT' then
      if jsonb_typeof(new.items) = 'array' and jsonb_array_length(new.items) > 0 then
        v_metin := public.doner_siparis_metni(new, '🧾 Yeni sipariş');
      end if;
    else
      v_bos := jsonb_typeof(new.items) <> 'array' or jsonb_array_length(new.items) = 0;
      v_eski_bos := jsonb_typeof(old.items) <> 'array' or jsonb_array_length(old.items) = 0;
      v_iptal := (coalesce(new.status, '') = 'cancelled' and coalesce(old.status, '') <> 'cancelled')
              or (coalesce(new.customer_name, '') like 'İPTAL!%' and coalesce(old.customer_name, '') not like 'İPTAL!%')
              or (v_bos and not v_eski_bos);
      if v_iptal then
        v_metin := '❌ İptal · ' || coalesce(new.code, '#' || new.id) ||
                   (case when nullif(btrim(new.note), '') is not null then E'\n📝 ' || left(new.note, 200) else '' end);
      elsif new.items is distinct from old.items and not v_bos then
        v_metin := public.doner_siparis_metni(new, '✏️ Sipariş değişti');
      end if;
    end if;
    if v_metin is null then return null; end if;

    -- Hiz siniri: kitchen_orders'a anon da yazabilir (QR menu). Toplu kayit
    -- grubu ve pg_net kuyrugunu bogmasin.
    if (select count(*) from public.doner_tg_giden g where g.kaynak = 'siparis' and g.created_at > now() - interval '1 minute') >= 12 then
      if not exists (select 1 from public.doner_tg_giden g where g.kaynak = 'siparis_sinir' and g.created_at > now() - interval '10 minutes') then
        perform public.doner_tg_gonder('⚠️ Dakikada 12''den fazla sipariş mesajı. Bir süre ayrıntı gönderilmiyor; mutfak ekranına bak.', 'siparis_sinir');
      end if;
      return null;
    end if;
    perform public.doner_tg_gonder(v_metin, 'siparis');
  exception when others then
    null;  -- bildirim hatasi siparisi durdurmaz
  end;
  return null;
end $function$;

create or replace trigger trg_doner_tg_siparis
  after insert or update of items, customer_name, status on public.kitchen_orders
  for each row execute function public.doner_tg_trg_siparis();

-- 5. Gider duzeltme / silme bildirimi + giren korumasi ------------------------------
create or replace function public.doner_tg_trg_gider_degisti()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_kim text := public.doner_kullanici_adi(auth.uid());
        o text := case when old.odeyen = 'kasa' then 'Döner kasası' else old.odeyen end;
        n text;
begin
  begin
    if tg_op = 'DELETE' then
      perform public.doner_tg_gonder(
        '🗑 Gider silindi · ' || public.doner_tarih_kisa(old.tarih) || ' · ' || old.kategori || ' · ' || public.doner_tl(old.tutar) ||
        E'\nÖdeyen: ' || o || coalesce(' · ' || nullif(btrim(old.aciklama), ''), '') ||
        E'\nSilen: ' || v_kim, 'gider');
    elsif (old.tarih, old.kategori, old.tutar, old.odeyen, old.yontem) is distinct from (new.tarih, new.kategori, new.tutar, new.odeyen, new.yontem) then
      n := case when new.odeyen = 'kasa' then 'Döner kasası' else new.odeyen end;
      perform public.doner_tg_gonder(
        '✏️ Gider düzeltildi · ' || public.doner_tarih_kisa(new.tarih) || ' · ' || new.kategori || E'\n' ||
        'Önce: ' || public.doner_tl(old.tutar) || ' · ' || o || ' · ' || old.kategori || ' · ' || public.doner_tarih_kisa(old.tarih) || E'\n' ||
        'Şimdi: ' || public.doner_tl(new.tutar) || ' · ' || n || ' · ' || new.kategori || ' · ' || public.doner_tarih_kisa(new.tarih) ||
        E'\nDüzelten: ' || v_kim || ' · ilk giren: ' || public.doner_kullanici_adi(old.giren), 'gider');
    end if;
  exception when others then null;
  end;
  return null;
end $function$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_doner_tg_gider_degisti' and tgrelid = 'public.doner_giderler'::regclass) then
    create trigger trg_doner_tg_gider_degisti after update or delete on public.doner_giderler
      for each row execute function public.doner_tg_trg_gider_degisti();
  end if;
end $$;

create or replace function public.doner_giren_ata()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if tg_op = 'INSERT' then
    new.giren := coalesce(auth.uid(), new.giren);
  elsif tg_table_name = 'doner_gunsonu' then
    new.giren := coalesce(auth.uid(), old.giren);   -- gun sonunda son duzelten
  else
    new.giren := old.giren;                         -- ilk giren degismez
  end if;
  return new;
end $function$;

do $$
declare t text;
begin
  foreach t in array array['doner_giderler', 'doner_gunsonu', 'doner_urun_maliyet', 'doner_satislar', 'doner_borclular'] loop
    if not exists (select 1 from pg_trigger where tgname = 'trg_' || t || '_giren' and tgrelid = ('public.' || t)::regclass) then
      execute format('create trigger %I before insert or update on public.%I for each row execute function public.doner_giren_ata()', 'trg_' || t || '_giren', t);
    end if;
  end loop;
end $$;
