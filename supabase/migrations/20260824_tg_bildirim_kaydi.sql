-- ============================================================================
-- TELEGRAM BILDIRIM KAYDI                        20260824_tg_bildirim_kaydi
-- ============================================================================
-- tg_notify_log tablosu duruyordu ama hic yazilmiyordu (0 satir). Bildirim
-- kimseye gitmediginde sistem sessizce "0 gonderildi" deyip geciyordu; "bana
-- bildirim gelmedi" tartismasinin bakilacak bir yeri yoktu.
--
-- Son 15 QR siparisinin 6'sinda o gune ait hic vardiya kaydi yoktu ve o alti
-- siparisin altisi da iptale dustu.
--
-- Geri alma:
--   alter table public.tg_notify_log
--     drop column if exists sent_count, drop column if exists target,
--     drop column if exists detail;
--   drop index if exists ix_tg_notify_log_at;
-- ============================================================================

alter table public.tg_notify_log
  add column if not exists sent_count integer not null default 0,
  add column if not exists target     text,
  add column if not exists detail     text;

comment on column public.tg_notify_log.sent_count is
  'Telegram''in ok dondurdugu alici sayisi — denenen degil, gerceklesen.';
comment on column public.tg_notify_log.target is
  'mutfak | vardiya | sahip_yedek (vardiyada kimse yoktu) | kimse (hic ulasmadi)';

create index if not exists ix_tg_notify_log_at on public.tg_notify_log (at desc);
