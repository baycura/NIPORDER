-- ============================================================================
-- FATURA TAKMA ADLARI                          20260916_fatura_takma_adlari
-- ============================================================================
-- SAHIP: "Tum fatura kayitlarindaki ikiz yapmis malzemeleri tespit et, onlari
--         menu isimleri ile stokta toplayalim."
--
-- IKIZLER NEDEN OLUSUYOR
-- Faturalar ekrani fatura kalemindeki adi mevcut malzemeyle isim benzerligine
-- gore esletiriyor (matchIngredient, %50 esik). Tedarikci adlari bambaska
-- yazildigi icin esleme tutmuyor ve YENI malzeme aciliyor:
--   "CORONA KL 33CL 4X6 (İTHAL)" -> "Corona Şişe Bira" ile eslesmedi
--   "HEINEKEN BEER 33CL"         -> "Heineken 33cl Şişe" ile eslesmedi
--   "MGD KL 33 CL NRB"           -> "Miller Şişe Bira" ile eslesmedi
-- Sonuc: ALIM ikize giriyor, SATIS asil kayittan dusuyor; ikisi de yanlis.
-- Ikizler birlestirildi, ama esleme duzelmezse bir sonraki faturada yeniden
-- dogarlar.
--
-- COZUM
-- ingredients.fatura_adlari: o malzemenin faturalarda gectigi adlar. Ekran
-- once bu listeye tam esleme ariyor, tutmazsa eski benzerlik yoluna dusuyor.
-- Fatura kaydedilirken kullanilan ad listeye ekleniyor: bir kere elle
-- eslestirilen tedarikci adi bir daha sorulmuyor.
--
-- Asagidaki ilk doldurma, bugun birlestirilen ikizlerin adlarini asil kayda
-- yaziyor — o faturalar bir daha yeni kayit acmasin.
--
-- Geri alma:
--   alter table public.ingredients drop column fatura_adlari;
-- ============================================================================

alter table public.ingredients add column if not exists fatura_adlari text[];

comment on column public.ingredients.fatura_adlari is
  'Bu malzemenin faturalarda gectigi adlar (tedarikci yazimi). Faturalar ekrani '
  'once burada tam esleme arar; ikiz kayit acilmasini onler.';

update public.ingredients set fatura_adlari = array['CORONA KL 33CL 4X6 (İTHAL)']
 where name = 'Corona Şişe Bira' and fatura_adlari is null;
update public.ingredients set fatura_adlari = array['HEINEKEN BEER 33CL']
 where name = 'Heineken 33cl Şişe' and fatura_adlari is null;
update public.ingredients set fatura_adlari = array['MGD KL 33 CL NRB']
 where name = 'Miller Şişe Bira' and fatura_adlari is null;
update public.ingredients set fatura_adlari = array['EFES PİLSEN FIÇI 50 L']
 where name = 'Efes Fıçı Bira' and fatura_adlari is null;
update public.ingredients set fatura_adlari = array['PET BARDAK 400 CC 50 Lİ PP SERT PLASTİK']
 where name = 'Pet Bardak 400cc' and fatura_adlari is null;
update public.ingredients set fatura_adlari = array['PLASTİK BARDAK 16 OZ 500 CC 50 Lİ PP']
 where name = 'Parti Bardak 500cc' and fatura_adlari is null;
update public.ingredients set fatura_adlari = array['Uludağ prem soda']
 where name = 'Soda (şişe)' and fatura_adlari is null;
