-- ============================================================================
-- PERSONEL EK YETKISI                               20261128_personel_ek_yetki
-- ============================================================================
-- Sahip (28.11.2026): "Tugce'ye sadece urun ekleme ve fiyat degistirme yetkisi
-- verebilir misin?"
--
-- Rol (staff.role) degismez; rolun ustune TEK BIR IS icin izin eklenir.
-- staff.yetkiler (text[]) bu izinleri tutar:
--   'menu_fiyat' = Menu Yonetimi sayfasinda YALNIZ yeni urun ekleme ve mevcut
--                  urunun fiyatini degistirme (kategori, siralama, silme ve
--                  urunun diger alanlari uygulamada kapali). Yeni urunu
--                  eklerken recetesini de girer (var olan malzemelerden).
--
-- KIM YAZAR: staff tablosunun yazma kurali degismedi (admin_write_staff:
-- is_admin()). Personel kendi satirini degistiremez; yetkiyi yalniz admin
-- verir ve alir (Panel -> Personel).
--
-- SINIR NEREDE: bu yetki uygulama ekranlarinda uygulanir (rota + sayfa).
-- products tablosunun veritabani kurali bu gocuste DEGISMEDI: magazanin her
-- personeli urun satirina yazabilir (staff_write_products). Bunu role gore
-- daraltmak ayri bir istir.
--
-- Yalniz EKLEME. Sutun kismi tekrar calistirilabilir. Asagidaki YETKI VERME
-- satiri TEK SEFERLIKTIR: sahip yetkiyi Personel sayfasindan geri aldiktan
-- sonra bu dosya elle yeniden calistirilirsa yetki geri gelir; calistirma.
-- (Gocus isi her dosyayi bir kez uygular: public.nip_gocusler.)
-- ============================================================================
alter table public.staff
  add column if not exists yetkiler text[] not null default '{}'::text[];

comment on column public.staff.yetkiler is
  'Ek yetkiler: rol degismeden tek bir is icin izin. menu_fiyat = urun ekleme + fiyat degistirme. Yalniz admin yazar (20261128).';

-- Tugce (part-time): urun ekleme + fiyat degistirme.
update public.staff
   set yetkiler = array_append(yetkiler, 'menu_fiyat')
 where id = '948c483d-9115-4b3d-ab6f-16544624d52b'
   and not ('menu_fiyat' = any (yetkiler));

-- API yeni sutunu hemen tanisin.
notify pgrst, 'reload schema';
