-- Blog/Shop yazilarina istege bagli dis baglanti: musteri karta tiklayinca
-- acilir (orn. notinparis.me'deki kamp sayfasi). Bos birakilirsa kart
-- eskisi gibi tiklanamaz duz icerik olarak kalir.
--
-- Yonetim: Vitrin & Blog > icerik formundaki "LINK" alanindan girilir.

alter table public.posts add column if not exists link_url text;

comment on column public.posts.link_url is
  'Istege bagli: karta tiklayinca acilacak sayfa (orn. notinparis.me kamp sayfasi)';
