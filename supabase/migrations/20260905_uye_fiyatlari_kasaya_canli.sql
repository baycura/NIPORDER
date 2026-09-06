-- ============================================================================
-- UYE OZEL FIYATLARI KASAYA CANLI DUSSUN       20260905_uye_fiyatlari_kasaya_canli
-- ============================================================================
-- SORUN (canli): Esra'nin hesabinda Efes Fici 0.5L icin 180 TL ozel fiyat
-- tanimli; kasa 280 (liste fiyati) ekledi. Kasa, uyenin ozel fiyatlarini
-- yalniz siparis ekrani acilirken okuyordu. Sahip telefonundan fiyati
-- tanimlarken tablette o siparis zaten acikti — kasa yeni fiyati hic duymadi.
--
-- COZUM: member_discounts realtime yayinina giriyor; kasa siparis ekrani
-- bagli uyenin fiyat satirlarini dinleyip degisince yeniden okuyor
-- (OrderDetailPage). Uyeler sayfasi kaydederken once siler sonra yazar;
-- silme olayinin da customer_id suzgecinden gecebilmesi icin REPLICA
-- IDENTITY FULL (tablo kucuk, maliyeti yok).
--
-- Geri alma:
--   alter publication supabase_realtime drop table public.member_discounts;
--   alter table public.member_discounts replica identity default;
-- ============================================================================

alter table public.member_discounts replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'member_discounts'
  ) then
    alter publication supabase_realtime add table public.member_discounts;
  end if;
end $$;
