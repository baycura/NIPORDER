-- ============================================================================
-- KONSINYE HESABI ELLE DUZELTME (KILIT)                20261101_konsinye_hesap_duzeltme
-- ============================================================================
-- Sahip (1.11): "Mashq'ta bir satis girilmemis; beige urunden 2 adet satilmis.
-- Duzeltmeyi yapip yeniden gonder listeyi."
--
-- Kasada eksik girilen satis hesaba elle eklenir. Elle duzeltilen kayit
-- KILITLENIR: yeniden kesim (nip_konsinye_hesap_kes) odenmis kayit gibi
-- ona da dokunmaz; yoksa cron bir sonraki kesimde duzeltmeyi ezerdi.
-- duzeltme_notu sayfada ve tedarikci Excel'inde gorunur.
--
-- Not: kasa (orders/order_items) degismez; satis raporlarinda Beige 1 adet
-- gorunur. Kasa kaydi eklenirse kilit kaldirilip yeniden kesilebilir.
-- Hicbir nesne kaldirilmaz.
-- ============================================================================

alter table public.konsinye_hesaplar add column if not exists kilitli boolean not null default false;
alter table public.konsinye_hesaplar add column if not exists duzeltme_notu text;
comment on column public.konsinye_hesaplar.kilitli is 'Elle duzeltildi; yeniden kesim dokunmaz.';
comment on column public.konsinye_hesaplar.duzeltme_notu is 'Elle duzeltmenin aciklamasi; sayfada ve Excelde gorunur.';

-- nip_konsinye_hesap_kes: odendi YA DA kilitli kaydi atla (yalniz bu satir degisti).
-- (Yetki kapisi 20261101_konsinye_yetki.sql'de onarildi; buradaki govde o
-- goce kadar gecerli olan metindir.)
create or replace function public.nip_konsinye_hesap_kes(p_store_id uuid, p_donem date default null)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_donem date; v_bas date; v_bit date; r record; n int := 0;
begin
  if current_user in ('authenticated', 'anon') then
    if not public.is_admin() then raise exception 'konsinye kesim: yalniz sahip'; end if;
    if not exists (select 1 from public.staff s where s.auth_id = (select auth.uid()) and s.is_active and p_store_id = any(s.store_ids)) then
      raise exception 'konsinye kesim: bu magaza icin yetkin yok';
    end if;
  end if;
  v_donem := date_trunc('month', coalesce(p_donem, (public.nip_business_day(now()) - interval '1 month')::date))::date;
  v_bas := v_donem;
  v_bit := (v_donem + interval '1 month' - interval '1 day')::date;

  for r in
    select t.tedarikci,
           jsonb_agg(jsonb_build_object(
             'urun', t.urun, 'barkod', coalesce(p.barkod, ''), 'adet', t.adet,
             'perakende', case when t.adet > 0 then round(t.taban / t.adet) else 0 end,
             'toplam', t.taban, 'satis', t.satis,
             'tedarikci_pay', coalesce(t.tedarikci_pay, 0), 'bizim_pay', coalesce(t.bizim_pay, 0),
             'ikram', t.ikram_adet) order by t.taban desc, t.urun) as satirlar,
           sum(t.adet) as adet, sum(t.taban) as perakende, sum(t.satis) as satis,
           sum(coalesce(t.tedarikci_pay, 0)) as tedarikci_pay, sum(coalesce(t.bizim_pay, 0)) as bizim_pay,
           max(t.pay_pct) as pay_pct, bool_or(t.pay_pct is null) as pay_eksik
      from public.nip_konsinye_raporu(p_store_id, v_bas, v_bit) t
      join public.products p on p.id = t.product_id
     group by t.tedarikci
  loop
    -- Odenmis ya da elle duzeltilmis (kilitli) kayit dondurulmus: dokunma
    if exists (select 1 from public.konsinye_hesaplar h
                where h.store_id = p_store_id and h.tedarikci = r.tedarikci and h.donem = v_donem
                  and (h.durum = 'odendi' or h.kilitli)) then
      continue;
    end if;
    insert into public.konsinye_hesaplar (store_id, tedarikci, donem, pay_pct, adet, perakende, satis, tedarikci_pay, bizim_pay, satirlar, kesildi_at, guncellendi)
    values (p_store_id, r.tedarikci, v_donem, case when r.pay_eksik then null else r.pay_pct end, r.adet, r.perakende, r.satis, r.tedarikci_pay, r.bizim_pay, r.satirlar, now(), now())
    on conflict (store_id, tedarikci, donem) do update
      set pay_pct = excluded.pay_pct, adet = excluded.adet, perakende = excluded.perakende, satis = excluded.satis,
          tedarikci_pay = excluded.tedarikci_pay, bizim_pay = excluded.bizim_pay, satirlar = excluded.satirlar,
          guncellendi = now();
    n := n + 1;
  end loop;
  return n;
end $$;

-- ----------------------------------------------------------------------------
-- Mashqhead, Ekim 2026: Beige Linen Sailor Hat 1 -> 2 adet (3.500 ₺ etiket).
-- Toplam 5 -> 6 sapka, perakende 19.500 -> 23.000, pay %50: 9.750 -> 11.500.
-- ----------------------------------------------------------------------------
update public.konsinye_hesaplar h
   set satirlar = (
         select jsonb_agg(
                  case when s->>'urun' = 'Beige Linen Sailor Hat'
                       then s || jsonb_build_object('adet', 2, 'toplam', 7000, 'satis', 7000, 'tedarikci_pay', 3500, 'bizim_pay', 3500)
                       else s end
                  order by (case when s->>'urun' = 'Beige Linen Sailor Hat' then 7000 else (s->>'toplam')::numeric end) desc, s->>'urun')
           from jsonb_array_elements(h.satirlar) s),
       adet = 6, perakende = 23000, satis = 23000, tedarikci_pay = 11500, bizim_pay = 11500,
       kilitli = true,
       duzeltme_notu = 'Düzeltme (1.11): Beige Linen Sailor Hat 2 adet satıldı; kasaya 1 adet girilmişti. Satış raporlarında 1 adet görünür.',
       guncellendi = now()
 where h.store_id = 'c3c6e0c7-1821-4edd-993d-ad960cfbc452' and h.tedarikci = 'Mashqhead' and h.donem = '2026-10-01'
   and h.durum = 'bekliyor' and not h.kilitli;
