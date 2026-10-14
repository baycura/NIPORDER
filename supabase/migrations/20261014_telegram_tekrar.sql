-- Telegram mesaji ulasmazsa tekrar gonder (14.10 gece kontrolu bulgusu).
--
-- 13.10 23:30 kapanis hatirlatmasi Fatih'e ulasmadi: api.telegram.org ile
-- TLS el sikismasi 5 saniyede bitmedi (pg_net varsayilan zaman asimi 5000 ms).
-- Ayni hata 13.10 gunduz toplu duyuruda da oldu (Mustafa). Istek bir kez
-- gider, sonucunu kimse okumaz; mesaj sessizce kaybolur.
--
-- 1. nip_tg_giden: dogrudan Telegram'a giden her mesajin kaydi (kaynak,
--    sohbet, govde, pg_net istek no, deneme, durum). Govdede jeton yok; URL
--    gonderim aninda kurulur.
-- 2. nip_tg_gonder(sohbet, metin, kaynak): 20 sn zaman asimiyla gonderir ve
--    kaydeder.
-- 3. nip_tg_kontrol(): 2 dakikada bir sonuclari okur.
--      2xx                                  -> ulasti
--      kalici 4xx (sohbet yok, bot engelli)  -> basarisiz, tekrar yok
--      zaman asimi, 5xx, 429, 10 dk yanitsiz -> tekrar gonder (en cok 3 deneme)
--    Kayitlar kalir: gunde birkac satir; sahip ulasmayan mesaji gorebilir.
-- 4. Dogrudan gonderen dort fonksiyon artik nip_tg_gonder kullanir; metinler
--    ayni: nip_kapanis_hatirlat, nip_kasa_sayilmadi_bekcisi,
--    nip_haftalik_denetim_gonder, nip_toplu_telegram.
--
-- Edge fonksiyonu uzerinden gidenler (tg_call, tg_notify, notify_shift_closed)
-- degismez: istek Supabase icinde kalir, Telegram'a fonksiyon kendisi baglanir.
--
-- Hicbir nesne silinmez.

-- 1 ---------------------------------------------------------------------------
create table if not exists public.nip_tg_giden (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  guncellendi timestamptz not null default now(),
  kaynak      text not null,
  chat_id     text not null,
  govde       jsonb not null,
  istek_id    bigint,
  deneme      integer not null default 1,
  durum       text not null default 'yolda'
              check (durum in ('yolda', 'ulasti', 'basarisiz')),
  son_hata    text
);

comment on table public.nip_tg_giden is
  'Dogrudan Telegram''a giden mesajlar; nip_tg_kontrol ulasmayani en cok 3 kez '
  'gonderir. Govdede jeton yok (20261014_telegram_tekrar).';

create index if not exists nip_tg_giden_yolda on public.nip_tg_giden (id) where durum = 'yolda';

alter table public.nip_tg_giden enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = 'nip_tg_giden'
                    and policyname = 'nip_tg_giden_sahip_okur') then
    create policy nip_tg_giden_sahip_okur on public.nip_tg_giden
      for select to authenticated using (public.is_admin());
  end if;
end $$;

revoke insert, update, delete, truncate on public.nip_tg_giden from anon, authenticated;
revoke select on public.nip_tg_giden from anon;

-- 2 ---------------------------------------------------------------------------
create or replace function public.nip_tg_gonder(p_chat_id text, p_metin text,
                                                p_kaynak text default 'genel')
returns bigint
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_token text;
  v_govde jsonb;
  v_istek bigint;
  v_id    bigint;
begin
  if p_chat_id is null or btrim(p_chat_id) = ''
     or p_metin is null or length(btrim(p_metin)) < 2 then
    return null;
  end if;
  select value into v_token from public.bot_config where key = 'telegram_bot_token';
  if v_token is null then
    return null;
  end if;

  v_govde := jsonb_build_object('chat_id', p_chat_id, 'text', p_metin);
  v_istek := net.http_post(
    url                  := 'https://api.telegram.org/bot' || v_token || '/sendMessage',
    body                 := v_govde,
    headers              := jsonb_build_object('Content-Type', 'application/json'),
    timeout_milliseconds := 20000
  );

  insert into public.nip_tg_giden (kaynak, chat_id, govde, istek_id)
  values (coalesce(p_kaynak, 'genel'), p_chat_id, v_govde, v_istek)
  returning id into v_id;
  return v_id;
end $function$;

comment on function public.nip_tg_gonder(text, text, text) is
  'Telegram mesaji gonderir (20 sn zaman asimi) ve nip_tg_giden''e yazar; '
  'ulasmazsa nip_tg_kontrol tekrar gonderir (20261014_telegram_tekrar).';

revoke execute on function public.nip_tg_gonder(text, text, text) from public, anon, authenticated;

-- 3 ---------------------------------------------------------------------------
create or replace function public.nip_tg_kontrol()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  g           record;
  v_token     text;
  v_istek     bigint;
  v_hata      text;
  v_ulasti    integer := 0;
  v_tekrar    integer := 0;
  v_basarisiz integer := 0;
begin
  select value into v_token from public.bot_config where key = 'telegram_bot_token';

  for g in
    select t.id, t.govde, t.deneme, t.guncellendi,
           r.id is not null as yanit_var, r.status_code, r.error_msg, r.content
      from public.nip_tg_giden t
      left join net._http_response r on r.id = t.istek_id
     where t.durum = 'yolda'
     order by t.id
       for update of t skip locked
  loop
    v_hata := coalesce(left(g.error_msg, 200),
                       g.status_code::text || ' ' || left(coalesce(g.content, ''), 200),
                       'yanit yok');

    if g.status_code between 200 and 299 then
      update public.nip_tg_giden
         set durum = 'ulasti', son_hata = null, guncellendi = now()
       where id = g.id;
      v_ulasti := v_ulasti + 1;

    elsif g.status_code between 400 and 499 and g.status_code <> 429 then
      -- Kalici hata: sohbet yok ya da kisi botu engelledi. Tekrar ise yaramaz.
      update public.nip_tg_giden
         set durum = 'basarisiz', son_hata = v_hata, guncellendi = now()
       where id = g.id;
      v_basarisiz := v_basarisiz + 1;

    elsif g.yanit_var or g.guncellendi < now() - interval '10 minutes' then
      -- Zaman asimi, 5xx, 429 ya da yanit hic kaydedilmedi.
      if g.deneme >= 3 or v_token is null then
        update public.nip_tg_giden
           set durum = 'basarisiz', son_hata = v_hata, guncellendi = now()
         where id = g.id;
        v_basarisiz := v_basarisiz + 1;
      else
        v_istek := net.http_post(
          url                  := 'https://api.telegram.org/bot' || v_token || '/sendMessage',
          body                 := g.govde,
          headers              := jsonb_build_object('Content-Type', 'application/json'),
          timeout_milliseconds := 20000
        );
        update public.nip_tg_giden
           set istek_id = v_istek, deneme = g.deneme + 1, son_hata = v_hata,
               guncellendi = now()
         where id = g.id;
        v_tekrar := v_tekrar + 1;
      end if;
    end if;
    -- Yanit henuz yok ve 10 dakikadan yeni: bir sonraki turu bekle.
  end loop;

  return jsonb_build_object('ulasti', v_ulasti, 'tekrar', v_tekrar, 'basarisiz', v_basarisiz);
end $function$;

comment on function public.nip_tg_kontrol() is
  '2 dk cron: Telegram sonuclarini okur; zaman asimi, 5xx, 429 ya da yanitsiz '
  'mesaji tekrar gonderir (en cok 3 deneme) (20261014_telegram_tekrar).';

revoke execute on function public.nip_tg_kontrol() from public, anon, authenticated;

do $c$
begin
  if not exists (select 1 from cron.job where jobname = 'nip-tg-tekrar') then
    perform cron.schedule('nip-tg-tekrar', '*/2 * * * *', 'select public.nip_tg_kontrol()');
  end if;
end $c$;

-- 4 ---------------------------------------------------------------------------
create or replace function public.nip_kapanis_hatirlat()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_token  text;
  v_gun    date := public.nip_business_day(now());
  st       record;
  k        record;
  v_n      integer := 0;
  v_hedef  integer;
  v_adlar  text;
  v_diger  text;
  v_metin  text;
  v_link   text := 'https://order.notinparis.me/cash-count';
begin
  select value into v_token from bot_config where key = 'telegram_bot_token';
  if v_token is null then
    return 0;
  end if;

  for st in
    select s.id, s.name
      from public.stores s
     where exists (select 1 from public.payments p
                    where p.store_id = s.id
                      and p.created_at >= (v_gun + time '03:00') at time zone 'Europe/Istanbul')
       and not exists (select 1 from public.cash_counts_gecerli cc
                        where cc.store_id = s.id and cc.business_day = v_gun
                          and cc.tur = 'kapanis')
  loop
    v_hedef := 0;

    -- Son 2 saatte tahsilat alanlar: kapanisi buyuk olasilikla onlar yapar.
    select string_agg(x.name, ', ' order by x.son desc) into v_adlar
      from (select sf.name, max(p.created_at) son
              from public.payments p join public.staff sf on sf.id = p.staff_id
             where p.store_id = st.id and p.created_at >= now() - interval '2 hours'
               and sf.is_active
             group by sf.id, sf.name) x;

    for k in
      select sf.id, sf.name, sf.telegram_chat_id
        from public.staff sf
       where sf.is_active and sf.telegram_chat_id is not null
         and sf.id in (select p.staff_id from public.payments p
                        where p.store_id = st.id
                          and p.created_at >= now() - interval '2 hours')
    loop
      -- Birden cok kisi tahsilat aldiysa her biri otekileri de gorur: biri sayar.
      select string_agg(x.name, ', ' order by x.son desc) into v_diger
        from (select sf2.name, max(p.created_at) son
                from public.payments p join public.staff sf2 on sf2.id = p.staff_id
               where p.store_id = st.id and p.created_at >= now() - interval '2 hours'
                 and sf2.is_active and sf2.id <> k.id
               group by sf2.id, sf2.name) x;
      v_metin := split_part(k.name, ' ', 1)
              || case when v_diger is null then ', bu gece kasayı sen sayıyorsun.'
                      else ', bu gece kasayı sen ya da ' || v_diger
                           || ' sayacak. Birinizin sayması yeter.' end || E'\n\n'
              || 'Son hesap kapanınca Masalar ekranındaki "Kasayı say" kartına dokun. '
              || 'Kupür saymak zorunlu değil: çekmecedeki toplamı yazman yeterli. '
              || 'Kasadan bir şey aldıysan önce sayım ekranında "Gider ekle"ye bas.' || E'\n'
              || v_link;
      perform public.nip_tg_gonder(k.telegram_chat_id, v_metin, 'kapanis_hatirlat');
      v_hedef := v_hedef + 1;
    end loop;

    -- Tahsilat alan bagli degilse: vardiyasi acik ve bagli olanlara.
    if v_hedef = 0 then
      for k in
        select distinct sf.name, sf.telegram_chat_id
          from public.shifts sh join public.staff sf on sf.id = sh.staff_id
         where sh.date = v_gun and sh.status = 'active'
           and (sh.store_id = st.id or sh.store_id is null)
           and sf.is_active and sf.telegram_chat_id is not null
      loop
        v_metin := split_part(k.name, ' ', 1) || ', kapanış yaklaşıyor.' || E'\n\n'
                || 'Dükkanı kapatan kasayı sayar. Son hesap kapanınca Masalar ekranındaki '
                || '"Kasayı say" kartına dokun. Toplamı yazman yeterli.'
                || case when v_adlar is not null
                        then E'\n' || 'Son 2 saatte tahsilat alan: ' || v_adlar || '.'
                        else '' end || E'\n'
                || v_link;
        perform public.nip_tg_gonder(k.telegram_chat_id, v_metin, 'kapanis_hatirlat');
        v_hedef := v_hedef + 1;
      end loop;
    end if;

    -- Kimseye ulasilamadiysa sahibe: kime soylemesi gerektigini yaz.
    if v_hedef = 0 then
      v_metin := 'Kapanış hatırlatması kimseye ulaşmadı — ' || st.name || E'\n\n'
              || case when v_adlar is not null
                      then 'Son 2 saatte tahsilat alan: ' || v_adlar
                           || '. Telegram''a bağlı değil.'
                      else 'Son 2 saatte tahsilat yok ve vardiyada bağlı kimse yok.' end
              || E'\n' || 'Bu gece kasayı kimin sayacağını ona sen söyle.';
      for k in
        select distinct telegram_chat_id from public.staff
         where role::text = 'admin' and is_active and telegram_chat_id is not null
      loop
        perform public.nip_tg_gonder(k.telegram_chat_id, v_metin, 'kapanis_hatirlat');
        v_hedef := v_hedef + 1;
      end loop;
    end if;

    v_n := v_n + v_hedef;
  end loop;

  return v_n;
end $function$;

create or replace function public.nip_kasa_sayilmadi_bekcisi()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_gun     date := public.nip_business_day(now()) - 1;
  v_token   text;
  v_chat    record;
  r         record;
  v_vardiya text;
  v_metin   text;
  v_uyari   integer := 0;
begin
  select value into v_token from bot_config where key = 'telegram_bot_token';
  if v_token is null then
    return jsonb_build_object('ok', false, 'hata', 'telegram_bot_token yok');
  end if;

  for r in
    select st.id, st.name, oz.beklenen, oz.nakit, oz.nakit_gider, oz.acilis
      from public.stores st
      cross join lateral public.kasa_gun_ozeti(st.id, v_gun) oz
     where not exists (select 1 from public.cash_counts_gecerli cc
                        where cc.store_id = st.id and cc.business_day = v_gun
                          and cc.tur = 'kapanis')
       and (oz.nakit > 0 or oz.nakit_gider > 0 or oz.acilis > 0)
  loop
    v_uyari := v_uyari + 1;

    select string_agg(s.name, ', ' order by sh.checked_in_at desc nulls last)
      into v_vardiya
      from public.shifts sh join public.staff s on s.id = sh.staff_id
     where sh.date = v_gun and (sh.store_id = r.id or sh.store_id is null);

    v_metin := 'KASA SAYILMADI — ' || r.name || E'\n'
            || to_char(v_gun, 'DD.MM.YYYY') || ' gecesi kapanista kasa sayilmadi.' || E'\n\n'
            || 'Cekmecede olmasi gereken: TL ' || round(r.beklenen) || E'\n'
            || 'Kapanis vardiyasi: ' || coalesce(v_vardiya, 'vardiya kaydi yok') || E'\n\n'
            || 'Kural: dukkani kapatan sayar. Dunun sayimini sahip hesabi '
            || 'gerekcesiyle girebilir:' || E'\n'
            || 'https://order.notinparis.me/cash-count';

    for v_chat in
      select distinct telegram_chat_id from staff
       where role::text = 'admin' and is_active and telegram_chat_id is not null
    loop
      perform public.nip_tg_gonder(v_chat.telegram_chat_id, v_metin, 'kasa_bekcisi');
    end loop;
  end loop;

  return jsonb_build_object('ok', true, 'gun', v_gun, 'uyari', v_uyari);
end $function$;

create or replace function public.nip_haftalik_denetim_gonder()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  b        record;
  v_metin  text;
  v_onem   text := '';
  v_sayi   int := 0;
  v_token  text;
  v_gonderilen int := 0;
  v_chat   record;
  v_baslik text;
begin
  select value into v_token from bot_config where key = 'telegram_bot_token';
  if v_token is null then
    return jsonb_build_object('ok', false, 'hata', 'telegram_bot_token yok');
  end if;

  v_metin := 'Not In Paris — haftalık kontrol · ' ||
             to_char((now() at time zone 'Europe/Istanbul')::date, 'DD.MM.YYYY') || E'\n';

  for b in
    select * from public.nip_haftalik_denetim()
     order by case onem when 'yuksek' then 1 when 'orta' then 2 else 3 end, sayi desc
  loop
    v_sayi := v_sayi + 1;
    if b.onem is distinct from v_onem then
      v_baslik := case b.onem when 'yuksek' then 'ACİL'
                              when 'orta'   then 'BEKLEYEN'
                              else 'BİLGİ' end;
      v_metin := v_metin || E'\n' || v_baslik || E'\n';
      v_onem := b.onem;
    end if;
    v_metin := v_metin || '• ' || b.baslik || ': ' || b.detay || E'\n';
  end loop;

  -- Temiz hafta sessiz gecilir. Her hafta ayni "sorun yok" mesaji bildirim
  -- korlugu yaratir, sonra gercek uyari da okunmaz.
  if v_sayi = 0 then
    return jsonb_build_object('ok', true, 'bulgu', 0, 'gonderilen', 0,
                              'not', 'temiz hafta, bildirim gonderilmedi');
  end if;

  v_metin := v_metin || E'\nEksik maliyetleri buradan girebilirsin:\nhttps://order.notinparis.me/costs';

  for v_chat in
    select distinct telegram_chat_id from staff
     where role::text = 'admin' and is_active and telegram_chat_id is not null
  loop
    perform public.nip_tg_gonder(v_chat.telegram_chat_id, v_metin, 'haftalik_denetim');
    v_gonderilen := v_gonderilen + 1;
  end loop;

  return jsonb_build_object('ok', true, 'bulgu', v_sayi, 'gonderilen', v_gonderilen);
end $function$;

create or replace function public.nip_toplu_telegram(p_metin text)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_token text; v_chat record; v_n integer := 0;
begin
  select value into v_token from bot_config where key = 'telegram_bot_token';
  if v_token is null or p_metin is null or length(btrim(p_metin)) < 2 then
    return 0;
  end if;
  for v_chat in
    select distinct telegram_chat_id from staff
     where is_active and telegram_chat_id is not null
  loop
    perform public.nip_tg_gonder(v_chat.telegram_chat_id, p_metin, 'toplu');
    v_n := v_n + 1;
  end loop;
  return v_n;
end $function$;
