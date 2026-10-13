-- ============================================================================
-- BOS MISAFIR HESABI TEMIZLIGI                   20261013_bos_misafir_temizle
-- ============================================================================
-- OLCUM (son 30 gun): personel 19 bos misafir hesabini ELLE iptal etti.
-- Bos hesap Masalar ve Siparis listesini dolduruyor; iptal ise iptal
-- sayisini sisiriyor (haftalik denetim iptali sayar).
--
-- KURAL: her 10 dakikada bir, ACILALI 60 dakikayi gecmis ve tamamen bos
-- "Misafir" / "Misafir N" hesabi SILINIR (iptal edilmez). Bos demek:
--   * kalem yok, odeme yok, tutar 0;
--   * masaya ve uyeye bagli degil.
-- Magazanin EN SON acilan bos misafir hesabi silinmez: parti tableti
-- tahsilattan sonra siradaki musteri icin bos hesap acip onda bekler.
--
-- Geri alma:
--   select cron.unschedule('nip-bos-misafir-temizle');
--   drop function if exists public.nip_bos_misafir_temizle();
-- ============================================================================

create or replace function public.nip_bos_misafir_temizle()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare v_n int;
begin
  delete from public.orders o
   where o.status = 'open'
     and o.table_id is null
     and o.customer_id is null
     and o.customer_name ~ '^Misafir( [0-9]+)?$'
     and o.created_at < now() - interval '60 minutes'
     and coalesce(o.total, 0) = 0
     and not exists (select 1 from public.order_items i where i.order_id = o.id)
     and not exists (select 1 from public.payments p where p.order_id = o.id)
     and not exists (select 1 from public.debts d where d.order_id = o.id)
     and o.id <> (select o2.id from public.orders o2
                   where o2.origin_store_id = o.origin_store_id
                     and o2.status = 'open'
                     and o2.customer_name ~ '^Misafir( [0-9]+)?$'
                   order by o2.created_at desc
                   limit 1);
  get diagnostics v_n = row_count;
  return v_n;
end $fn$;

comment on function public.nip_bos_misafir_temizle() is
  'Acilali 60 dakikayi gecmis tamamen bos Misafir hesaplarini siler (iptal etmez). En son acilan bos hesap korunur. pg_cron her 10 dakikada.';

revoke all on function public.nip_bos_misafir_temizle() from anon, public, authenticated;

do $c$
begin
  if not exists (select 1 from cron.job where jobname = 'nip-bos-misafir-temizle') then
    perform cron.schedule('nip-bos-misafir-temizle', '*/10 * * * *', 'select public.nip_bos_misafir_temizle()');
  end if;
end $c$;
