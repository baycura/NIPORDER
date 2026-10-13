-- ============================================================================
-- BORC KILIDI                                   20261013_borc_tahsilat_kilit
-- ============================================================================
-- 20261013_borc_tahsilat.sql (A) uygulandiktan SONRA, AYRI islemde uygulanir.
-- Neden ayri: A'daki "alter table payments" tabloyu bir an kilitler. O an
-- baslayan "Borca yaz" islemi ESKI nip_odeme_al govdesiyle (bayraksiz) devam
-- eder. Bu kilit ayni islemde gelseydi o islemin borc artisi sessizce yok
-- sayilirdi (inceleme bulgusu).
--
-- KURAL: personel de borcu (customers.outstanding_balance) DOGRUDAN yazamaz.
-- Borc yalniz su yollarla degisir:
--   * nip_odeme_al, "Borc" yontemi    -> artar   ('nip.borc_rpc' bayragi)
--   * nip_borc_tahsil                 -> azalir  ('nip.borc_rpc' bayragi)
--   * nip_borc_tahsil_geri_al         -> artar   ('nip.borc_rpc' bayragi)
--   * nip_borc_affet, nip_borc_geri_yaz (admin, SECURITY DEFINER: current_user
--     tablo sahibi oldugu icin bu tetige hic takilmaz)
--
-- Bayrak yoksa personelin yazdigi deger SESSIZCE eski haline doner, hata
-- verilmez. Sebep: telefonda acik kalmis eski bir Uyeler ekrani "Kaydet"e
-- basarsa ad/telefon degisikligi yine kaydedilsin, yalniz borc korunsun.
-- Eskiden bu "Kaydet" yeni yazilan borcu ya da tahsilati geri aliyordu.
--
-- Bayragi istemci acamaz: PostgREST tablo islemleri ve RPC calistirir;
-- set_config disariya acik degildir. Bayrak RPC icinde acilir ve hemen
-- kapatilir. Musteri (personel olmayan) dali DEGISMEDI.
--
-- Geri alma: bu fonksiyonun onceki hali (personel icin "return new")
-- yeniden kurulur.
-- ============================================================================

create or replace function public.customers_guard_money_cols()
returns trigger
language plpgsql
set search_path to 'public'
as $fn$
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;

  if public.is_staff() then
    if coalesce(current_setting('nip.borc_rpc', true), '') <> '1' then
      if tg_op = 'INSERT' then
        new.outstanding_balance := 0;
      else
        new.outstanding_balance := old.outstanding_balance;
      end if;
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.points := 0;
    new.total_spent := 0;
    new.visit_count := 0;
    new.outstanding_balance := 0;
    new.admin_discount := null;
    new.tier := 'yeniyuz';
  else
    new.points := old.points;
    new.total_spent := old.total_spent;
    new.visit_count := old.visit_count;
    new.outstanding_balance := old.outstanding_balance;
    new.admin_discount := old.admin_discount;
    new.tier := old.tier;
    new.store_id := old.store_id;
    new.notes := old.notes;
  end if;
  return new;
end $fn$;
