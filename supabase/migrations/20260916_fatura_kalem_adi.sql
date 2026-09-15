-- ============================================================================
-- FATURA KALEMINDE TEDARIKCI ADI                 20260916_fatura_kalem_adi
-- ============================================================================
-- SAHIP: "Faturayi cekip urun ekleme isini de askiya alalim ... goruyorum ki
--         faturalar hep yanlis okunmus."
--
-- Fatura kaydi bundan boyle STOGA VE MALIYETE dokunmuyor (bkz. lib/profil.js
-- -> faturaStok). Eslesmeyen kalem artik YENI HAMMADDE ACMIYOR; acsaydi ikiz
-- kayitlar yeniden dogardi. Ama kalem gider dokumunde gorunmeye devam etmeli:
-- ingredient_id bos kalinca ekranda "?" yaziyordu.
--
-- kalem_adi: faturada yazan ad ("CORONA KL 33CL 4X6 (İTHAL)"). Hammaddeye
-- baglanmamis kalemler bu adla listelenir; TURMOB/Luca entegrasyonundan sonra
-- gecmis kalemleri hammaddeye baglamak icin de elde yazili ad kalir.
--
-- Geri alma:
--   alter table public.supplier_invoice_items drop column kalem_adi;
-- ============================================================================

alter table public.supplier_invoice_items add column if not exists kalem_adi text;

comment on column public.supplier_invoice_items.kalem_adi is
  'Faturada yazan kalem adi (tedarikci yazimi). Hammaddeye baglanmamis '
  'kalemler bu adla gosterilir; fatura stoga yazmayi biraktigi icin gerekli.';
