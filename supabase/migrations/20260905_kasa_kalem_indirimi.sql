-- ============================================================================
-- KASADA KALEM INDIRIMI (ADET BASINA TL)              20260905_kasa_kalem_indirimi
-- ============================================================================
-- ISTEK: "Kasada siparis alirken urun bazli TL indirimi yapilabilecek bir
-- alan." Simdiye kadar kasadaki tek fiyat mudahalesi ikramdi (0 TL); ara bir
-- sey yoktu, personel ya tam fiyat ya ikram yaziyordu.
--
-- TASARIM: indirim kalem uzerinde, ADET BASINA ve TL olarak durur.
--   final_price = taban - manual_discount        (taban: uye/kampanya/HH dahil)
-- final_price zaten tek gercek: toplam, odeme, ciro, puan hep oradan okur;
-- indirim baska hicbir hesabi degistirmez. Kim verdi (discount_by) ve neden
-- (discount_note) kalemde kalir — gun sonu "kim ne kadar indirim yapti"
-- buradan cikar. Ikramla catismaz: ikramli kalemde final 0'dir, indirim
-- dugmesi gizlidir; ikram geri alininca taban - indirim'e doner.
--
-- Yetki: siparise urun ekleyebilen herkes indirim de yapabilir (ikramla ayni
-- kapi). Daraltmak istenirse discount_by uzerinden rapor + rol kapisi eklenir.
--
-- Geri alma:
--   alter table public.order_items drop column manual_discount, drop column discount_note, drop column discount_by;
-- ============================================================================

alter table public.order_items add column if not exists manual_discount numeric(10,2) not null default 0;
alter table public.order_items add column if not exists discount_note text;
alter table public.order_items add column if not exists discount_by uuid references public.staff(id);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'order_items_manual_discount_pozitif') then
    alter table public.order_items add constraint order_items_manual_discount_pozitif check (manual_discount >= 0);
  end if;
end $$;

comment on column public.order_items.manual_discount is
  'Kasada elle verilen indirim, adet basina TL. final_price = taban - manual_discount.';
comment on column public.order_items.discount_note is 'Indirimin nedeni (istege bagli).';
comment on column public.order_items.discount_by is 'Indirimi veren personel (staff.id).';
