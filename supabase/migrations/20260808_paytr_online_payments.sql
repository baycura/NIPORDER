-- PayTR online odeme: iFrame token kayitlari (merchant_oid <-> order eslesme)
create table if not exists public.paytr_payments (
  merchant_oid text primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  amount_kurus bigint not null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  processed_at timestamptz
);
create index if not exists idx_paytr_payments_order on public.paytr_payments(order_id);
alter table public.paytr_payments enable row level security;
-- policy yok: yalniz service role (edge fn) erisir

-- Ozellik anahtari: Ayarlar sayfasindan ac/kapa (musteri menusu bu degeri okur)
insert into public.app_settings (key, value, store_id)
select 'online_payment_enabled', to_jsonb(true), 'c3c6e0c7-1821-4edd-993d-ad960cfbc452'
where not exists (select 1 from public.app_settings where key = 'online_payment_enabled');

-- 1 gunden eski 'pending' kayitlari gece temizle
select cron.unschedule(jobid) from cron.job where jobname = 'nip-clean-paytr-pending';
select cron.schedule('nip-clean-paytr-pending','40 3 * * *',
  $job$delete from public.paytr_payments where status = 'pending' and created_at < now() - interval '1 day'$job$);

-- NOT: paytr_merchant_id / paytr_merchant_key / paytr_merchant_salt bot_config'te tutulur (repoya yazilmaz).
