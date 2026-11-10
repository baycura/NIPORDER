-- ============================================================================
-- KONSINYE KESIM RPC YETKI ONARIMI                           20261101_konsinye_yetki
-- ============================================================================
-- Gozden gecirme bulgusu (1.11): nip_konsinye_hesap_kes SECURITY DEFINER;
-- icinde current_user = postgres (sahip) olur, "current_user in
-- ('authenticated','anon')" kapisi HIC calismiyordu. EXECUTE authenticated'a
-- acik oldugu icin oturum acmis herkes (uye, part-time) herhangi bir magaza
-- ve ay icin kesim yapabiliyordu. (Repo notu: 20260824 — DEFINER icinde
-- kimlik current_user'dan DEGIL auth.uid()/auth.role()'den alinir.)
--
-- Onarim: kapi JWT'ye bakar. auth.uid() doluysa ya da JWT rolu anon /
-- authenticated ise admin + magaza kontrolu yapilir. cron (postgres, JWT yok)
-- ve service_role (edge fonksiyonu) serbest kalir.
--
-- Ayrica nip_konsinye_aylik() cron-only; varsayilan EXECUTE authenticated'tan
-- da alinir (kesim + Telegram ozetini herkes tetikleyebiliyordu).
-- Hicbir nesne kaldirilmaz.
-- ============================================================================

create or replace function public.nip_konsinye_hesap_kes(p_store_id uuid, p_donem date default null)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_donem date; v_bas date; v_bit date; r record; n int := 0;
begin
  -- Kimlik JWT'den: DEFINER icinde current_user her zaman postgres'tir.
  if (select auth.uid()) is not null or coalesce((select auth.role()), '') in ('anon', 'authenticated') then
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

revoke all on function public.nip_konsinye_hesap_kes(uuid, date) from anon, public;
grant execute on function public.nip_konsinye_hesap_kes(uuid, date) to authenticated;

-- Cron-only: oturumdan cagrilamaz.
revoke all on function public.nip_konsinye_aylik() from anon, authenticated, public;
