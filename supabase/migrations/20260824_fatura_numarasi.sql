-- ============================================================================
-- TEDARIKCI FATURA NUMARASI                          20260824_fatura_numarasi
-- ============================================================================
-- Fatura numarasi XML'den zaten dogru okunuyor ve ekranda gosteriliyordu, ama
-- KAYDEDILMIYORDU — tabloda boyle bir kolon yoktu. Bu yuzden ayni fatura ikinci
-- kez girilince sistem uyaramiyordu. Nitekim girildi: ERBAK Uludag faturasi
-- 08-08'de 5.231,19 TL (10+2 koli x 266,50) ve 08-17'de 5.231 TL (120+24 adet
-- x 11,37) olarak, ayni uc kalemle iki kez kayitli. Hem gider iki kez sayildi
-- hem de stok iki farkli birimle sisti.
--
-- Geri alma:
--   drop index if exists ix_supplier_invoices_no;
--   alter table public.supplier_invoices drop column if exists invoice_no;
-- ============================================================================

alter table public.supplier_invoices
  add column if not exists invoice_no text;

comment on column public.supplier_invoices.invoice_no is
  'Tedarikcinin fatura numarasi (UBL XML: cbc:ID). Mukerrer giris uyarisi buna bakar.';

-- UNIQUE DEGIL, bilerek. Ayni numara farkli tedarikcide cikabilir; ayrica eski
-- 13 kaydin numarasi yok ve elle duzeltilecek. Kontrol uygulamada yapilir ve
-- kullaniciya "yine de kaydet" secenegi birakilir — kasadaki isi durdurmayalim.
create index if not exists ix_supplier_invoices_no
  on public.supplier_invoices (store_id, invoice_no)
  where invoice_no is not null;
