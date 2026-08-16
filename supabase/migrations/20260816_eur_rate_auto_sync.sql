-- EURO KURU OTOMATIK GUNCELLEME
--
-- eur-rate-sync edge fonksiyonu TCMB'den (yedek: frankfurter.app) kuru ceker,
-- app_settings['eur_rate'] alanina yazar; oradaki tetikleyici euro fiyatli tum
-- urunlerin TL fiyatini yeniler.
--
-- Ayarlar (magaza bazli, Ayarlar sayfasindan yonetilir):
--   eur_rate_auto          : otomatik guncelleme acik/kapali (varsayilan acik)
--   eur_rate_markup_pct    : kura eklenecek yuzde pay (varsayilan 0)
--   eur_rate_max_jump_pct  : guvenlik bandi — kur bundan fazla sicrarsa
--                            YAZILMAZ, eur_rate_note'a uyari birakilir (10)
--   eur_rate_updated_at / eur_rate_source / eur_rate_note : bilgi alanlari
--
-- Zamanlama: her is gunu 14:00 UTC (17:00 TR) — TCMB kuru 15:30'da yayinlar.

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

insert into public.app_settings (key, value, store_id)
select k, to_jsonb(v), s.id from public.stores s,
  (values ('eur_rate_auto','true'), ('eur_rate_markup_pct','0'), ('eur_rate_max_jump_pct','10')) as t(k,v)
on conflict (key, store_id) do nothing;

-- Gunluk kur cekme isi. Yetki: bot_config.webhook_secret ile x-nip-cron basligi.
select cron.unschedule('eur-rate-daily')
where exists (select 1 from cron.job where jobname = 'eur-rate-daily');

select cron.schedule('eur-rate-daily', '0 14 * * 1-5', $CRON$
  select net.http_post(
    url := 'https://gbbxxcduuwdmvfayxzeg.supabase.co/functions/v1/eur-rate-sync',
    headers := jsonb_build_object('Content-Type','application/json',
      'x-nip-cron', (select value from bot_config where key = 'webhook_secret')),
    body := '{}'::jsonb, timeout_milliseconds := 20000);
$CRON$);
