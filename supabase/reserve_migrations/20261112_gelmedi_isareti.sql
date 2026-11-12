-- ============================================================
-- GELMEDI ISARETI — RESERVE projesi (rezervasyon sitesinin veritabani)
-- ============================================================
-- Sahip onayi: 12.11.2026 ("Gelmedi dugmesi de olsun").
--
-- Sorun: reservations_status_check yalniz pending / approved / rejected / used
-- durumlarini kabul eder; "no_show" yazilamaz. Bu yuzden "Gelmedi" dugmesi
-- sitede hic calismadi, Order panelinde de gizliydi.
--
-- Cozum: kisit yerinde kalir (hicbir nesne silinmez). Isaret ayri sutunda
-- tutulur: durum "approved" kalir, no_show_at dolu ise misafir gelmedi
-- sayilir. Order paneli (ReservePage) bu sutunu yazar ve okur.
--
-- Guvenlik: uye kendi kaydinda bu sutunu degistiremez (nip_rez_koru tetigi
-- yetkisiz guncellemede yalniz izinli alanlari alir). Yonetici yazar
-- (res_admin_update).
--
-- Yalniz EKLEME: mevcut veri, kisit ve yetki degismez. Canliya uygulandi.

alter table public.reservations add column if not exists no_show_at timestamptz;
comment on column public.reservations.no_show_at is
  'Gelmedi isareti (Order paneli). Dolu ise misafir gelmedi sayilir; durum approved kalir. Bos = isaret yok.';
