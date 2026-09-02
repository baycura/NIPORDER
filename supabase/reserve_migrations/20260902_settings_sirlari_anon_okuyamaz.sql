-- ============================================================================
-- DIKKAT: BU DOSYA ORDER'A DEGIL, "NIP RESERVE" PROJESINE UYGULANDI.
-- Order migration'lari ../migrations altinda. Bu klasor (reserve_migrations)
-- yalniz rezervasyon projesinin kaydini tutar — biri yanlislikla Order'a
-- uygulamasin diye ayri duruyor. Buradaki tablolarin (settings, profiles)
-- Order'da karsiligi yok.
--
-- BIRLESTIRME ADIM 2: sizan admin parolasi          2026-09-02
-- ============================================================================
-- BULGU
-- public.settings tablosunda "admin_credentials" anahtari DUZ METIN parola
-- tutuyordu ve okuma politikasi "using (true)" idi. Rezervasyon sitesinin anon
-- anahtari HTML'in icinde acikta oldugu icin, siteyi acan HERKES o satiri
-- okuyabiliyordu. "set local role anon" ile ampirik dogrulandi — teorik degil.
--
-- NEDEN SILMEK GUVENLI
-- Uc repo tarandi (rezervasyon HTML'i, Shopify temasi, NIPORDER):
-- admin_credentials'i OKUYAN tek satir yok. Gectigi tek yer onu YAZAN eski
-- form (saveAdminCreds, index.html). Gercek admin girisi
-- signInWithPassword + profiles.is_admin uzerinden yuruyor ve bu satira hic
-- bakmiyor. Yani satir olu veri; silmek panelin girisini bozmaz.
--
-- BU DUZELTMENIN KAPATMADIGI SEY
-- Parola artik yayilmis sayilmali. Baska bir yerde de kullaniliyorsa orada
-- degistirilmeli — bu tarafta yapilabilecek bir sey degil.
-- ============================================================================

-- 1) Sizan satir gider.
delete from public.settings where key = 'admin_credentials';

-- 2) Okuma beyaz listeye gecer. Tek satirlik temizlik degil kapi: yarin buraya
--    yanlislikla bir sir yazilirsa da anon onu goremez. Vitrinde gercekten
--    gereken iki anahtar var — slogan (giris ekrani) ve announcement (duyuru).
--    Admin her seyi gormeye devam eder.
drop policy if exists settings_read on public.settings;
create policy settings_genel_okur on public.settings
  for select
  using (key in ('slogan', 'announcement') or public.nip_is_admin());

comment on table public.settings is
  'Vitrin ayarlari. SIR TUTMAZ: okuma politikasi slogan/announcement disini '
  'yalniz admine acar, ama tablo yine de paylasimli bir alan — parola, token '
  'veya anahtar buraya yazilmaz.';

-- 3) Panelde "ADMIN BILGILERI" formu hala duruyor ve iki turlu yanlis:
--    a) gercek girisi DEGISTIRMIYOR — dolduran kisi parolasini degistirdigini
--       sanir, degistirmez;
--    b) doldurulunca duz metin parolayi geri yazar.
--    Formu silmek ayri bir repoda; delik o repo elden gecene kadar acik
--    kalmasin diye kapiyi burada kilitliyoruz.
alter table public.settings
  add constraint settings_admin_credentials_yasak
  check (key <> 'admin_credentials');

comment on constraint settings_admin_credentials_yasak on public.settings is
  'Duz metin parola tutan olu anahtar 2026-09-02 silindi. Panelde onu yazan '
  'eski form hala duruyor; bu kisit form tiklanirsa sirri geri getirmesini '
  'engeller. Form silinince kisit da kalkabilir.';

-- ============================================================================
-- DOGRULAMA (uygulandiktan sonra calistirildi, hepsi gecti)
--   anon admin_credentials satiri gorur mu ...... 0   (beklenen 0)
--   anon slogan okuyabiliyor mu ................. INNER CIRCLE
--   anon announcement okuyabiliyor mu ........... 1   (beklenen 1)
--   anon toplam kac satir gorur ................. 2   (beklenen 2)
--   anon uydurma sir anahtarini gorur mu ........ 0   (beklenen 0)
--   eski formun yazmasi ......................... reddedildi (beklenen)
-- ============================================================================
