-- Kapanis hatirlatmasina POS gun sonu satiri (oneri 14, sahip onayi 14.10).
--
-- 9 kapanisin hicbirinde POS cihazinin gun sonu toplami girilmemis; kart
-- satisi hic dogrulanmiyor. Alan kapanis ekraninda var ama istege bagli.
-- Zorunlu yapilmaz (kapanis kisa kalsin); 23:30 mesaji bir satirla hatirlatir.
-- Metnin gerisi 20261014_telegram_tekrar ile ayni.
--
-- Hicbir nesne silinmez.

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
              || 'POS cihazının gün sonu toplamını da yaz. '
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
                || '"Kasayı say" kartına dokun. Toplamı yazman yeterli. '
                || 'POS cihazının gün sonu toplamını da yaz.'
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
