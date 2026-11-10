-- ============================================================================
-- KONSINYE HESAP DUZENI: AY KILIDI, KARISIK PAY, ESKI AD, TELEGRAM   20261110_konsinye_duzen
-- ============================================================================
-- Gozden gecirme (1.11) bulgulari (10.11 uygulandi):
--  1) Suren ay sayfadan kesilebiliyordu; "Odendi" denince cron o tedarikciyi
--     bir daha ele almaz, yarim ayin hesabi kalici olurdu. Kesim ve "odendi"
--     artik yalniz bitmis aylar icin (isletme ayina gore). Sayfa suren ayi
--     secime sunmaz; "Canli" sekmesi ayin o anki durumunu gosterir.
--  2) Bir tedarikcide urun bazinda farkli pay varsa baslikta max(pay) yaziyordu.
--     pay_karisik bayragi eklendi; sayfa ve Excel "karisik pay" der, satir
--     bazli tutarlari kullanir.
--  3) Tedarikci adi degisince ayni ay icin ikinci satir olusuyor, eski
--     "bekliyor" satir toplamda kaliyordu. Yeniden kesimde yeni raporda
--     cikmayan bekliyor + kilitsiz satirlar "Kontrol et" notu alir; tutar
--     SIFIRLANMAZ (gercek bir borc sessizce silinmesin).
--  4) Telegram ozetinde to_char(... 'G') en_US ile "20,640" yaziyordu (TR'de
--     20 lira 64 kurus okunur) -> "20.640". Odenmis satirlar "(odendi)" diye
--     listelenir ve "Toplam odenecek"e girmez.
-- Yetki kapisi 20261101_konsinye_yetki ile ayni (auth.uid / auth.role).
-- Hicbir nesne kaldirilmaz.
-- ============================================================================

alter table public.konsinye_hesaplar add column if not exists pay_karisik boolean not null default false;
comment on column public.konsinye_hesaplar.pay_karisik is
  'Tedarikcide urun bazinda farkli pay oranlari var; pay_pct tek oran degil, satir tutarlari gecerli.';

-- ----------------------------------------------------------------------------
-- KESIM
-- ----------------------------------------------------------------------------
create or replace function public.nip_konsinye_hesap_kes(p_store_id uuid, p_donem date default null)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_donem date; v_bas date; v_bit date; r record; n int := 0; v_isimler text[] := '{}';
begin
  -- Kimlik JWT'den: DEFINER icinde current_user her zaman postgres'tir.
  if (select auth.uid()) is not null or coalesce((select auth.role()), '') in ('anon', 'authenticated') then
    if not public.is_admin() then raise exception 'konsinye kesim: yalniz sahip'; end if;
    if not exists (select 1 from public.staff s where s.auth_id = (select auth.uid()) and s.is_active and p_store_id = any(s.store_ids)) then
      raise exception 'konsinye kesim: bu magaza icin yetkin yok';
    end if;
  end if;
  v_donem := date_trunc('month', coalesce(p_donem, (public.nip_business_day(now()) - interval '1 month')::date))::date;
  -- Suren ay kesilmez: yarim ay "odendi" olup donardi. Canli sekmesi var.
  if v_donem >= date_trunc('month', public.nip_business_day(now()))::date then
    raise exception 'konsinye kesim: % ayi bitmeden kesilmez', to_char(v_donem, 'MM.YYYY');
  end if;
  v_bas := v_donem;
  v_bit := (v_donem + interval '1 month' - interval '1 day')::date;

  for r in
    select t.tedarikci,
           jsonb_agg(jsonb_build_object(
             'urun', t.urun, 'barkod', coalesce(p.barkod, ''), 'adet', t.adet,
             'perakende', case when t.adet > 0 then round(t.taban / t.adet) else 0 end,
             'toplam', t.taban, 'satis', t.satis,
             'tedarikci_pay', coalesce(t.tedarikci_pay, 0), 'bizim_pay', coalesce(t.bizim_pay, 0),
             'ikram', t.ikram_adet, 'pay_pct', t.pay_pct) order by t.taban desc, t.urun) as satirlar,
           sum(t.adet) as adet, sum(t.taban) as perakende, sum(t.satis) as satis,
           sum(coalesce(t.tedarikci_pay, 0)) as tedarikci_pay, sum(coalesce(t.bizim_pay, 0)) as bizim_pay,
           max(t.pay_pct) as pay_pct, bool_or(t.pay_pct is null) as pay_eksik,
           (count(distinct t.pay_pct) filter (where t.pay_pct is not null)) > 1 as pay_karisik
      from public.nip_konsinye_raporu(p_store_id, v_bas, v_bit) t
      join public.products p on p.id = t.product_id
     group by t.tedarikci
  loop
    v_isimler := array_append(v_isimler, r.tedarikci);
    -- Odenmis ya da elle duzeltilmis (kilitli) kayit dondurulmus: dokunma
    if exists (select 1 from public.konsinye_hesaplar h
                where h.store_id = p_store_id and h.tedarikci = r.tedarikci and h.donem = v_donem
                  and (h.durum = 'odendi' or h.kilitli)) then
      continue;
    end if;
    insert into public.konsinye_hesaplar (store_id, tedarikci, donem, pay_pct, pay_karisik, adet, perakende, satis, tedarikci_pay, bizim_pay, satirlar, kesildi_at, guncellendi)
    values (p_store_id, r.tedarikci, v_donem, case when r.pay_eksik then null else r.pay_pct end, r.pay_karisik,
            r.adet, r.perakende, r.satis, r.tedarikci_pay, r.bizim_pay, r.satirlar, now(), now())
    on conflict (store_id, tedarikci, donem) do update
      set pay_pct = excluded.pay_pct, pay_karisik = excluded.pay_karisik,
          adet = excluded.adet, perakende = excluded.perakende, satis = excluded.satis,
          tedarikci_pay = excluded.tedarikci_pay, bizim_pay = excluded.bizim_pay, satirlar = excluded.satirlar,
          duzeltme_notu = null, guncellendi = now();
    n := n + 1;
  end loop;

  -- Bu ay icin YENI raporda satisi cikmayan eski "bekliyor" satirlar: tutar
  -- SIFIRLANMAZ (inceleme 10.11: marka konsinyeden cikarilirsa ya da urun
  -- tasinirsa odenmemis gercek bir borc listeden silinirdi). Satir oldugu gibi
  -- kalir ve not alir; ad degistiyse yeni adla ikinci bir satir olusur, sahip
  -- hangisinin gecerli oldugunu gorur. Kilitli ya da odenmis satira dokunulmaz.
  update public.konsinye_hesaplar h
     set duzeltme_notu = 'Kontrol et: yeniden kesimde bu adla satış bulunmadı (tedarikçi adı değişmiş ya da ürünler taşınmış olabilir). Tutar önceki kesimden.',
         guncellendi = now()
   where h.store_id = p_store_id and h.donem = v_donem and h.durum = 'bekliyor' and not h.kilitli
     and (h.adet <> 0 or h.tedarikci_pay <> 0)
     and h.duzeltme_notu is distinct from 'Kontrol et: yeniden kesimde bu adla satış bulunmadı (tedarikçi adı değişmiş ya da ürünler taşınmış olabilir). Tutar önceki kesimden.'
     and not (h.tedarikci = any(v_isimler));
  return n;
end $$;

-- ----------------------------------------------------------------------------
-- ODENDI: yalniz bitmis ay isaretlenir (geri alma serbest).
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
  if not p_geri and exists (select 1 from public.konsinye_hesaplar h
                             where h.id = p_id and h.donem >= date_trunc('month', public.nip_business_day(now()))::date) then
    raise exception 'konsinye odendi: ay bitmeden ödendi işaretlenemez';
  end if;
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
-- AYLIK CRON: TR sayi bicimi; odenmisler ayri, toplama girmez.
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
  for r in select h.tedarikci, h.adet, h.tedarikci_pay, h.pay_pct, h.pay_karisik, h.durum from public.konsinye_hesaplar h
            where h.store_id = v_store and h.donem = v_donem
            order by (h.durum = 'odendi'), h.tedarikci_pay desc loop
    v_metin := v_metin || E'\n• ' || r.tedarikci || ': ' || r.adet::text || ' adet → ₺'
               || replace(to_char(round(r.tedarikci_pay), 'FM999,999,999,990'), ',', '.')
               || case when r.durum = 'odendi' then ' (ödendi)'
                       when r.pay_pct is null then ' (pay yazılmadı!)'
                       when r.pay_karisik then ' (karışık pay)'
                       else '' end;
    if r.durum <> 'odendi' then v_toplam := v_toplam + coalesce(r.tedarikci_pay, 0); end if;
  end loop;
  v_metin := v_metin || E'\nToplam ödenecek: ₺' || replace(to_char(round(v_toplam), 'FM999,999,999,990'), ',', '.')
             || E'\nOnay: order.notinparis.me/konsinye → Ödendi' || E'\nExcel''ler 04:45''te e-postayla gider.';
  begin
    for k in select sf.telegram_chat_id from public.staff sf where sf.is_active and sf.role = 'admin' and sf.telegram_chat_id is not null loop
      perform public.nip_tg_gonder(k.telegram_chat_id, v_metin, 'konsinye_aylik');
    end loop;
  exception when others then null;
  end;
  return n;
end $$;

revoke all on function public.nip_konsinye_hesap_kes(uuid, date) from anon, public;
revoke all on function public.nip_konsinye_odendi(uuid, boolean, text) from anon, public;
revoke all on function public.nip_konsinye_aylik() from anon, authenticated, public;
grant execute on function public.nip_konsinye_hesap_kes(uuid, date) to authenticated;
grant execute on function public.nip_konsinye_odendi(uuid, boolean, text) to authenticated;
