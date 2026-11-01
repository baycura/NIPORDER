-- ============================================================================
-- KONSINYE HESAPLARI (AYLIK KESIM + ODENDI)             20261101_konsinye_hesaplar
-- ============================================================================
-- Sahip (1.11): "Bunlari sistem uzerinden her ay basinda bana ayni sekilde
-- raporlasan, ben odendi butonuna basana kadar da kalsa; Ceren ve Fatih de
-- gorebilse."
--
-- Her ayin 1'inde (04:15 Istanbul) gecen ayin konsinye hesabi tedarikci
-- tedarikci KESILIR ve konsinye_hesaplar tablosuna yazilir: adet, perakende
-- toplami, tedarikci payi (etiket uzerinden), bizim pay, urun satirlari.
-- Kayit "bekliyor" durumunda kalir; sahip (admin) "Odendi"ye basinca kapanir.
-- Odenmis kayit yeniden kesimde EZILMEZ (rakam dondurulur). Bekleyen kayit
-- yeniden kesilirse guncel satis verisiyle tazelenir.
--
-- Gorunurluk: magazanin tum personeli okur (RLS); yazma yalniz RPC ile,
-- "odendi" yalniz admin. Telegram: kesim sonrasi yonetici sohbetlerine ozet.
-- Hicbir nesne kaldirilmaz.
-- ============================================================================

create table if not exists public.konsinye_hesaplar (
  id            uuid primary key default gen_random_uuid(),
  store_id      uuid not null references public.stores(id),
  tedarikci     text not null,
  donem         date not null,                       -- ayin ilk gunu
  pay_pct       numeric,                             -- kesim anindaki BIZIM pay
  adet          numeric not null default 0,
  perakende     numeric not null default 0,          -- etiket toplami
  satis         numeric not null default 0,          -- gercek tahsilat
  tedarikci_pay numeric not null default 0,          -- odenecek
  bizim_pay     numeric not null default 0,
  satirlar      jsonb not null default '[]'::jsonb,  -- [{urun, barkod, adet, perakende, toplam, tedarikci_pay, bizim_pay}]
  durum         text not null default 'bekliyor' check (durum in ('bekliyor', 'odendi')),
  odendi_at     timestamptz,
  odeyen        uuid,                                -- staff.id
  odeme_notu    text,
  kesildi_at    timestamptz not null default now(),
  guncellendi   timestamptz not null default now(),
  unique (store_id, tedarikci, donem)
);
comment on table public.konsinye_hesaplar is
  'Aylik konsinye hesap kesimi: tedarikci basina adet, perakende, pay, odenecek; odendi isareti. 20261101_konsinye_hesaplar.';
create index if not exists ix_konsinye_hesaplar_donem on public.konsinye_hesaplar (store_id, donem desc);

alter table public.konsinye_hesaplar enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'konsinye_hesaplar' and policyname = 'konsinye_hesaplar_personel_okur') then
    create policy konsinye_hesaplar_personel_okur on public.konsinye_hesaplar
      for select to authenticated
      using (public.is_staff() and store_id = any(public.user_store_ids()));
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- KESIM: bir magaza, bir ay. Donen: yazilan/tazelenen kayit sayisi.
-- authenticated cagirirsa admin olmali; cron (postgres) serbest.
-- ----------------------------------------------------------------------------
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
    -- Odenmis kayit dondurulmus: dokunma
    if exists (select 1 from public.konsinye_hesaplar h where h.store_id = p_store_id and h.tedarikci = r.tedarikci and h.donem = v_donem and h.durum = 'odendi') then
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
-- ODENDI / GERI AL — yalniz admin (sahip). Odeyen = staff.id.
-- ----------------------------------------------------------------------------
create or replace function public.nip_konsinye_odendi(p_id uuid, p_geri boolean default false, p_not text default null)
returns public.konsinye_hesaplar
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_staff uuid; v_row public.konsinye_hesaplar;
begin
  if not public.is_admin() then raise exception 'konsinye odendi: yalniz sahip'; end if;
  select s.id into v_staff from public.staff s where s.auth_id = (select auth.uid()) and s.is_active limit 1;
  update public.konsinye_hesaplar h
     set durum = case when p_geri then 'bekliyor' else 'odendi' end,
         odendi_at = case when p_geri then null else now() end,
         odeyen = case when p_geri then null else v_staff end,
         odeme_notu = case when p_geri then null else coalesce(p_not, h.odeme_notu) end,
         guncellendi = now()
   where h.id = p_id and h.store_id = any(public.user_store_ids())
  returning h.* into v_row;
  if v_row.id is null then raise exception 'konsinye odendi: kayit bulunamadi'; end if;
  return v_row;
end $$;

-- ----------------------------------------------------------------------------
-- AYLIK IS: gecen ayi kes, yoneticiye Telegram ozeti. Cron: her ayin 1'i 01:15 UTC.
-- ----------------------------------------------------------------------------
create or replace function public.nip_konsinye_aylik()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_store uuid := 'c3c6e0c7-1821-4edd-993d-ad960cfbc452'; v_donem date; n int; r record; v_metin text; v_toplam numeric := 0; k record;
begin
  v_donem := date_trunc('month', (public.nip_business_day(now()) - interval '1 month')::date)::date;
  n := public.nip_konsinye_hesap_kes(v_store, v_donem);
  v_metin := '📦 ' || to_char(v_donem, 'MM.YYYY') || ' konsinye hesapları kesildi (' || n || ' tedarikçi):';
  for r in select h.tedarikci, h.adet, h.tedarikci_pay, h.pay_pct from public.konsinye_hesaplar h
            where h.store_id = v_store and h.donem = v_donem order by h.tedarikci_pay desc loop
    v_metin := v_metin || E'\n• ' || r.tedarikci || ': ' || r.adet::text || ' adet → ₺' || to_char(round(r.tedarikci_pay), 'FM999G999G990')
               || case when r.pay_pct is null then ' (pay yazılmadı!)' else '' end;
    v_toplam := v_toplam + coalesce(r.tedarikci_pay, 0);
  end loop;
  v_metin := v_metin || E'\nToplam ödenecek: ₺' || to_char(round(v_toplam), 'FM999G999G990') || E'\nOnay: order.notinparis.me/konsinye → Ödendi';
  begin
    for k in select sf.telegram_chat_id from public.staff sf where sf.is_active and sf.role = 'admin' and sf.telegram_chat_id is not null loop
      perform public.nip_tg_gonder(k.telegram_chat_id, v_metin, 'konsinye_aylik');
    end loop;
  exception when others then null;
  end;
  return n;
end $$;

select cron.unschedule(jobid) from cron.job where jobname = 'nip-konsinye-aylik';
select cron.schedule('nip-konsinye-aylik', '15 1 1 * *', $$select public.nip_konsinye_aylik()$$);

revoke all on function public.nip_konsinye_hesap_kes(uuid, date) from anon, public;
revoke all on function public.nip_konsinye_odendi(uuid, boolean, text) from anon, public;
revoke all on function public.nip_konsinye_aylik() from anon, public;
grant execute on function public.nip_konsinye_hesap_kes(uuid, date) to authenticated;
grant execute on function public.nip_konsinye_odendi(uuid, boolean, text) to authenticated;

-- ----------------------------------------------------------------------------
-- Ilk kesim: Ekim 2026 (bugun 1.11). Juju Ekim odemesi yapildi (sahip 1.11).
-- ----------------------------------------------------------------------------
select public.nip_konsinye_hesap_kes('c3c6e0c7-1821-4edd-993d-ad960cfbc452', '2026-10-01');
update public.konsinye_hesaplar
   set durum = 'odendi', odendi_at = now(), odeme_notu = 'Sahip 1.11: ödeme yapıldı (kesimden önce)', guncellendi = now()
 where store_id = 'c3c6e0c7-1821-4edd-993d-ad960cfbc452' and tedarikci = 'Jüjü' and donem = '2026-10-01' and durum = 'bekliyor';
