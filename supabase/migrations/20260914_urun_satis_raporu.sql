-- ============================================================================
-- URUN SATIS RAPORU                                    20260914_urun_satis_raporu
-- ============================================================================
-- SAHIP: "Haftalik, aylik, yillik ya da tarih girerek gunluk satis raporlarini,
-- hangi urunden kac adet satildigini gorelim."
--
-- Gun Ozeti yalniz bugunu, Urun Karliligi 7/30/90 gunu ve kari gosteriyordu;
-- "gecen ay kac latte sattik" sorusunun ekrani yoktu. Iki okuma fonksiyonu:
--   nip_urun_satis   : aralikta urun x beden bazinda adet / ikram / siparis / ciro
--   nip_gunluk_satis : ayni araligin isletme gunu bazinda toplami (cubuk grafik,
--                      gune dokununca urun listesi o gune iner)
--
-- KURALLAR (urun_karliligi ile birebir ayni, iki rapor birbirini tutsun):
--   * yalniz 'paid' siparisler (borca yazilan da 'paid' kapanir, mal teslim
--     edilmistir); iptal ve acik hesap sayilmaz
--   * gun = isletme gunu (03:00'te biter), odeme anina gore (nip_business_day)
--   * ciro = final_price x adet (indirim, kampanya, uye fiyati dusulmus);
--     ikram kalem adede girer, cirosu 0
--   * beden (variant_name) ayri satir: "Tisort · Small" — raf sayimi icin
--   * urun silinmis olsa da kalemdeki ad gosterilir (product_id null olabilir)
--
-- Yetki: aktif personel ve o magazaya yetkisi olan (ekranda adminOnly +
-- gozlemci). Anon yok.
--
-- Geri alma:
--   drop function if exists public.nip_urun_satis(uuid, date, date);
--   drop function if exists public.nip_gunluk_satis(uuid, date, date);
-- ============================================================================

create or replace function public.nip_urun_satis(p_store_id uuid, p_bas date default null, p_bit date default null)
returns table (product_id uuid, urun text, kategori text, adet numeric, ikram_adet numeric, siparis bigint, ciro numeric)
language plpgsql stable set search_path to 'public' as $$
declare v_bas date; v_bit date;
begin
  if current_user in ('authenticated', 'anon') then
    if not public.is_staff() then raise exception 'satis raporu: yetkisiz'; end if;
    if not exists (select 1 from public.staff s
                    where s.auth_id = (select auth.uid()) and s.is_active
                      and p_store_id = any(s.store_ids)) then
      raise exception 'satis raporu: bu magaza icin yetkin yok';
    end if;
  end if;
  v_bit := coalesce(p_bit, public.nip_business_day(now()));
  v_bas := coalesce(p_bas, v_bit);
  if v_bit < v_bas then raise exception 'satis raporu: bitis baslangictan once olamaz'; end if;
  if v_bit - v_bas > 400 then raise exception 'satis raporu: en fazla 400 gunluk aralik'; end if;

  return query
  select oi.product_id,
         (coalesce(p.name, oi.product_name) || coalesce(' · ' || nullif(oi.variant_name, ''), ''))::text as urun,
         coalesce(c.name, '—')::text as kategori,
         sum(coalesce(oi.quantity, 1))::numeric as adet,
         sum(case when coalesce(oi.is_treat, false) then coalesce(oi.quantity, 1) else 0 end)::numeric as ikram_adet,
         count(distinct o.id) as siparis,
         round(sum(coalesce(oi.final_price, 0) * coalesce(oi.quantity, 1))::numeric, 2) as ciro
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    left join public.products p on p.id = oi.product_id
    left join public.categories c on c.id = p.category_id
   where o.origin_store_id = p_store_id
     and o.status = 'paid'
     and public.nip_business_day(coalesce(o.paid_at, o.updated_at, o.created_at)) between v_bas and v_bit
   group by oi.product_id, coalesce(p.name, oi.product_name), nullif(oi.variant_name, ''), coalesce(c.name, '—')
   order by 4 desc, 7 desc, 2;
end $$;

create or replace function public.nip_gunluk_satis(p_store_id uuid, p_bas date default null, p_bit date default null)
returns table (gun date, adet numeric, ciro numeric, siparis bigint)
language plpgsql stable set search_path to 'public' as $$
declare v_bas date; v_bit date;
begin
  if current_user in ('authenticated', 'anon') then
    if not public.is_staff() then raise exception 'satis raporu: yetkisiz'; end if;
    if not exists (select 1 from public.staff s
                    where s.auth_id = (select auth.uid()) and s.is_active
                      and p_store_id = any(s.store_ids)) then
      raise exception 'satis raporu: bu magaza icin yetkin yok';
    end if;
  end if;
  v_bit := coalesce(p_bit, public.nip_business_day(now()));
  v_bas := coalesce(p_bas, v_bit);
  if v_bit < v_bas then raise exception 'satis raporu: bitis baslangictan once olamaz'; end if;
  if v_bit - v_bas > 400 then raise exception 'satis raporu: en fazla 400 gunluk aralik'; end if;

  return query
  select public.nip_business_day(coalesce(o.paid_at, o.updated_at, o.created_at)) as gun,
         sum(coalesce(oi.quantity, 1))::numeric as adet,
         round(sum(coalesce(oi.final_price, 0) * coalesce(oi.quantity, 1))::numeric, 2) as ciro,
         count(distinct o.id) as siparis
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
   where o.origin_store_id = p_store_id
     and o.status = 'paid'
     and public.nip_business_day(coalesce(o.paid_at, o.updated_at, o.created_at)) between v_bas and v_bit
   group by 1
   order by 1;
end $$;

comment on function public.nip_urun_satis(uuid, date, date) is
  'Satis raporu: aralikta (isletme gunu, odeme anina gore) urun x beden bazinda adet/ikram/siparis/ciro. Yalniz paid siparisler.';
comment on function public.nip_gunluk_satis(uuid, date, date) is
  'Satis raporu: ayni araligin isletme gunu bazinda adet/ciro/siparis toplami.';

revoke all on function public.nip_urun_satis(uuid, date, date) from anon, public;
revoke all on function public.nip_gunluk_satis(uuid, date, date) from anon, public;
grant execute on function public.nip_urun_satis(uuid, date, date) to authenticated;
grant execute on function public.nip_gunluk_satis(uuid, date, date) to authenticated;
