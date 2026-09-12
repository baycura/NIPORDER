-- ============================================================================
-- DONER MUTFAGI QR SIPARISI: GIRIS YAPMIS KULLANICI DA SIPARIS VEREBILSIN
--                                  20260912_mutfak_siparisi_girisli_kullanici
-- ============================================================================
-- OLAY (2026-09-12 15:46): Sahip, doner uygulamasinda (nip-kitchen) once
-- mutfak paneline girdi, iki dakika sonra ayni telefondan musteri gibi
-- siparis verdi: "GONDERILEMEDI". Sunucu logu: POST /rest/v1/kitchen_orders
-- 403 "new row violates row-level security policy". Istek anonim degil,
-- mutfak hesabinin oturumuyla (role=authenticated) gitmisti.
--
-- NEDEN: kitchen_orders'ta INSERT politikasi yalniz anon icin var
-- (orders_anon_insert). Giris yapmis kullanici icin yok; RLS acik oldugu
-- icin eslesen politika bulunamayinca satir reddedilir. Sahibin ya da
-- mutfak personelinin kendi telefonundan deneme siparisi vermesi hep boyle
-- duser; normal musteri (oturumsuz) etkilenmez, 8 Eylul'deki N-9XF gecti.
--
-- COZUM: ayni kosullarla (status 'new', tutar >= 0, kalemler dizi)
-- authenticated icin de INSERT politikasi. Baska bir yetki genislemez:
-- guncelleme/silme politikalari degismedi.
--
-- Geri alma: drop policy orders_auth_insert on public.kitchen_orders;
-- ============================================================================

drop policy if exists orders_auth_insert on public.kitchen_orders;
create policy orders_auth_insert on public.kitchen_orders
  for insert to authenticated
  with check (status = 'new' and total >= 0 and jsonb_typeof(items) = 'array');

grant insert on public.kitchen_orders to authenticated;
