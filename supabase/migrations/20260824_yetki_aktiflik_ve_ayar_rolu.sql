-- ============================================================================
-- AYRILAN PERSONELIN YETKISI + AYAR YAZMA ROLU  20260824_yetki_aktiflik...
-- ============================================================================
-- Iki acik vardi:
--
-- 1) user_store_ids() aktiflik kontrolu yapmiyordu. Bir personeli "pasif"
--    yapinca uygulama ekranlari ona kapaniyor ama VERITABANI kapanmiyordu:
--    eski hesabiyla giren kisi hala yazabiliyordu. is_staff() ve is_admin()
--    zaten is_active bakiyor, bu fonksiyon atlanmis.
--    (Bugun: Tolgacan Ustaoglu — rol admin, is_active false, auth hesabi bagli,
--     iki magazaya yetkili.)
--
-- 2) app_settings yazma politikasi rol sormuyordu: magazasi tutan HERKES
--    (part-time garson dahil) ayarlara yazabiliyordu. Ayarlarin icinde menu
--    fiyatlarini hesaplayan eur_rate var.
--    Uygulama tarafinda /settings zaten managerOnly (App.jsx:84) — veritabani
--    artik ayni kurali uyguluyor.
--
-- NOT: Buradaki SECURITY DEFINER dogru ve gerekli — fonksiyonlar staff
-- tablosunu okumak zorunda ve kimligi current_user'dan DEGIL auth.uid()'den
-- aliyor. (current_user ile kontrol yapan bir DEFINER fonksiyonu her cagride
-- muaf sayilirdi; bu repo o hatayi bir kez yapmisti —
-- 20260820_profil_birlestirme_ve_musteri_korumasi.sql:92-94)
--
-- Geri alma:
--   create or replace function public.user_store_ids() ... (is_active kosulu
--     olmadan; eski govde asagida yorumda)
--   drop policy if exists app_settings_write_yonetim on public.app_settings;
--   create policy staff_write_app_settings on public.app_settings for all
--     using (store_id = any (user_store_ids()))
--     with check (store_id = any (user_store_ids()));
--   drop function if exists public.can_manage_settings();
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) AKTIFLIK KONTROLU
-- Eski govde: SELECT COALESCE(store_ids, ARRAY[]::uuid[]) FROM staff
--             WHERE auth_id = auth.uid() LIMIT 1;
-- ----------------------------------------------------------------------------
create or replace function public.user_store_ids()
returns uuid[]
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(store_ids, array[]::uuid[])
    from staff
   where auth_id = auth.uid()
     and is_active
   limit 1;
$$;

-- ----------------------------------------------------------------------------
-- 2) AYAR YAZMA: YALNIZ YONETIM
-- Roller App.jsx'teki isManager ile ayni: admin / manager / owner.
-- super_admin da eklendi (enumda var, uygulamada henuz kullanilmiyor).
-- ----------------------------------------------------------------------------
create or replace function public.can_manage_settings()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from staff
     where auth_id = auth.uid()
       and is_active
       and role::text in ('admin', 'manager', 'owner', 'super_admin')
  );
$$;

revoke all on function public.can_manage_settings() from public, anon;
grant execute on function public.can_manage_settings() to authenticated;

-- Iki eski yazma politikasi da yetersizdi: biri rol sormuyordu, oteki
-- aktiflik sormuyordu. Tek politikada birlestiriliyor.
drop policy if exists staff_write_app_settings on public.app_settings;
drop policy if exists app_settings_write_manager on public.app_settings;

create policy app_settings_write_yonetim on public.app_settings
  for all
  to authenticated
  using      (store_id = any (public.user_store_ids()) and public.can_manage_settings())
  with check (store_id = any (public.user_store_ids()) and public.can_manage_settings());

-- Okuma politikalarina dokunulmadi (app_settings_read_all / public_read_app_settings):
-- musteri menusu de ayarlari okuyor.
