-- ============================================================================
-- TEMEL PROFIL — hedef projede, sema geldikten sonra
-- ============================================================================
-- Sema Order'in birebir kopyasi: Telegram, web push, Shopify tetikleyicileri
-- de geldi. Bu isletmede o servisler yok; bot_config bos. Tetikleyiciler
-- durursa her siparis kaleminde http cagrisi denenir (bos URL'ye). O yuzden
-- dis servise giden tetikleyiciler kaldirilir, cron'a yalniz yerel isler
-- yazilir. Fonksiyonlar duruyor — ileride acilmak istenirse tetik geri
-- eklenir (kaynak: supabase/migrations/20260807_telegram_triggers_and_cron.sql).
-- ============================================================================

-- Telegram (siparis gonderildi / hazir, vardiya kapandi)
drop trigger if exists tg_items_ready       on public.order_items;
drop trigger if exists tg_items_sent_ins    on public.order_items;
drop trigger if exists tg_items_sent_upd    on public.order_items;
drop trigger if exists trg_notify_shift_closed on public.shifts;
-- Web push (siparis hazir bildirimi)
drop trigger if exists wp_items_ready       on public.order_items;
-- Shopify stok aynasi
drop trigger if exists trg_shopify_stok_push on public.products;

-- Cron: yalniz yerel bakim isleri (Order'daki adlar korunur)
select cron.schedule('nip-close-shifts', '0 0 * * *',
  $$update public.shifts set status='done', checked_out_at=now() where status='active'$$);
select cron.schedule('nip-clean-push-subs', '30 3 * * *',
  $$delete from public.push_subscriptions where created_at < now() - interval '2 days'$$);
select cron.schedule('nip-clean-paytr-pending', '40 3 * * *',
  $$delete from public.paytr_payments where status = 'pending' and created_at < now() - interval '1 day'$$);
-- Acilmayanlar (dis servis ister): nip-daily-summary, eur-rate-daily,
-- nip-weekly-audit, nip-*-hatirlatma, nip-kasa-bekcisi, nip-reserve-*, nip-shopify-*.
