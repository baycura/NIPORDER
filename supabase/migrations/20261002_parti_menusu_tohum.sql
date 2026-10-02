-- ============================================================================
-- PARTI MENUSU TOHUMU                         20261002_parti_menusu_tohum
-- ============================================================================
-- SORUN: parti modu kurulmus ama HIC KULLANILAMAZ durumda. nip_parti_durum
-- bugun "(f, kapali, , 0)" donuyor: 185 urunun SIFIRI parti menusunde
-- isaretli. 20260828_parti_dugmesi.sql'deki guvenlik kilidi geregi
-- (isaretli urun yoksa parti acilmaz) dugmeye basilsa da parti acilmiyor.
-- Yani ozellik yaziliydi, verisi hic girilmemisti.
--
-- NE ISARETLENIYOR VE NEDEN. Olcu: 22:00-02:00 arasinda satilan adetler
-- (order_items x orders, tum gecmis). Kategori bazinda:
--
--   Bira        281 adet   <- tek basina parti saatinin %46'si
--   Kokteyl      48
--   Mesrubatlar  36        <- Su / Soda / Churchill; icki yaninin zorunlusu
--   Kahveler     30        <- Americano 17; gece kahve gercekten satiliyor
--   Highball     23        <- Beefeater 22
--   Shot         13
--   Viski         7
--
-- Bu yedi kategori parti saatindeki satisin neredeyse tamamini kapsiyor ve
-- kasada yedi serit ediyor; yatay tablette alti serit ekranda, yedincisi bir
-- parmak hareketi uzakta.
--
-- BILEREK DISARIDA BIRAKILANLAR: Saraplar, Soguk Kahveler, Mutfak (Durum,
-- Napoli Bread) ve raf urunleri (NIP tisort). Gece satiliyorlar ama seyrek:
-- her biri bir serit daha demek, alti seridi dokuza cikarip her gece
-- kullanilan listeyi asagi iterdi. Bunlar icin kasadaki "Tum menu" tek
-- dokunus; 3.600 TL'lik tisort satisinda bir fazladan dokunus sorun degil.
-- Sahip isterse Ayarlar > Urunler'den isaretleyip serit ekler.
--
-- IKINCI ISLETME GUVENLIGI: bu bir NIP VERI tohumu, sema degisikligi degil.
-- Iki korumasi var: (1) kategoriler ADIYLA araniyor, baska bir isletmenin
-- veritabaninda bu adlar yoksa hicbir satir etkilenmez; (2) yalnizca HIC
-- isaretli urun yokken calisir — sahip sonradan listeyi duzenlerse bu dosya
-- tekrar uygulansa bile uzerine yazmaz.
--
-- Geri alma:
--   update public.products set show_in_party_menu = false;
-- ============================================================================

do $$
declare
  v_mevcut int;
  v_yazilan int;
begin
  select count(*) into v_mevcut
    from public.products where coalesce(show_in_party_menu, false);

  if v_mevcut > 0 then
    raise notice 'Parti menusunde zaten % urun isaretli — tohum atlandi.', v_mevcut;
    return;
  end if;

  update public.products p
     set show_in_party_menu = true
   where p.category_id in (
           select c.id from public.categories c
            where c.name in ('Bira', 'Kokteyl', 'Meşrubatlar', 'Kahveler',
                             'Highball', 'Shot', 'Viski')
              and coalesce(c.is_active, true)
         )
     and coalesce(p.is_available, true);

  get diagnostics v_yazilan = row_count;
  raise notice 'Parti menusu tohumlandi: % urun isaretlendi.', v_yazilan;
end $$;
