-- ============================================================================
-- TEMIZLIK ILE SARF MALZEMEYI AYIR              20260916_temizlik_sarf_ayrimi
-- ============================================================================
-- SAHIP: "Stok ekrani cok zorlu; onlari temizlik, sarf malzeme vb. hepsini
--         kategori kategori ayirsak super."
--
-- 20260916_malzeme_gruplari ikisini tek rafta topluyordu ("Sarf & Temizlik",
-- 17 kalem). Bar personeli ile temizlik islerinin listesi ayni yerde duruyordu:
-- barmen buz ve pipet ararken mop ve tuvalet kagidini geciyordu.
--
--   Temizlik     : mop, cop torbasi, tuvalet kagidi, kagit havlu, temizlik arabasi
--   Sarf Malzeme : buz, pipet, pecete, karistirici, bardaklar, kapaklar
--
-- Geri alma:
--   update public.ingredients set grup = 'Sarf & Temizlik'
--    where grup in ('Temizlik', 'Sarf Malzeme');
-- ============================================================================

update public.ingredients i
   set grup = case
     when lower(translate(i.name, 'İIıÇçÖöŞşĞğÜüÂâÎîÛûÄäÉé', 'IIiCcOoSsGgUuAaIiUuAaEe'))
          like any (array['%mop%','%tuvalet%','%havlu%','%towel%','%cop torbas%','%temizlik%','%deterjan%','%camasir%','%bulasik%'])
       then 'Temizlik'
     else 'Sarf Malzeme'
   end
 where i.grup = 'Sarf & Temizlik';
