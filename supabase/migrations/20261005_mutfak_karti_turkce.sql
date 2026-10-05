-- ============================================================================
-- MUTFAK KARTI TURKCE                          20261005_mutfak_karti_turkce
-- ============================================================================
-- SAHIP (05.10.2026): "Musteri siparisi Rusca verdiginde bize de Rusca
-- dusuyor, anlamiyoruz. Mutfaga ve fise Turkce gelmeli."
--
-- OLCUM. kitchen_orders tablosunda 96 kart var:
--   * NIP koprusunun actigi 58 kart  -> Rusca YOK. NIP tarafi temiz.
--   * Doner kendi uygulamasinin 38 karti -> 7'si Rusca, 17'si Ingilizce.
-- NIP musteri menusu urun adini her zaman Turkce gonderir
-- (CustomerMenu.jsx: product_name: c.product.name). Orada duzeltme gerekmez.
--
-- HATA NEREDE. Urun ADI dogru geliyor (DURUM, WATER, MENEMEN). Bozuk olan
-- items[].det alani, yani malzeme listesi:
--   "Донер, Дзадзики, Соус из печёного перца, Чеддер, Красный салат"
-- Asci bunu okuyamiyor.
--
-- NEDEN VERITABANINDA DUZELTIYORUZ. Hata dONER uygulamasinda doguyor
-- (nip-kitchen). O uygulamanin kaynak kodu bu depoda yok ve erisilebilen
-- hicbir depoda bulunamadi. Asil duzeltme orada yapilmali. Bu dosya bir
-- YAMA: kart kaydedilirken det alanini Turkceye cevirir.
--
-- SOZLUK VERIDEN CIKARILDI, CEVIRI UYDURULMADI. Her Turkce karsilik,
-- ayni mutfagin Turkce kartlarinda gercekten kullandigi kelimedir
-- (ornegin "Tatziki", "Tzatziki" degil; "Kirmizi Marul", "Kirmizi Salata"
-- degil). Iki kelimenin Turkce karti yoktu, sahibi soyledi: gazsiz su
-- "Su", gazlisi "Soda".
--
-- GUVENLIK KURALI: HATA SIPARISI DURDURMAZ. Govde exception yakalar. Ceviri
-- patlarsa kart ESKI HALIYLE kaydedilir ve nip_mutfak_log'a yazilir. Doner
-- mutfaginin satisi hicbir kosulda durmaz.
--
-- Geri alma:
--   drop trigger if exists trg_mutfak_det_turkce on public.kitchen_orders;
--   drop function if exists public.nip_mutfak_trg_det_turkce();
--   drop function if exists public.nip_mutfak_det_turkce(jsonb);
--   drop table if exists public.nip_mutfak_sozluk;
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Sozluk
-- ----------------------------------------------------------------------------
create table if not exists public.nip_mutfak_sozluk (
  yabanci text primary key,
  turkce  text not null
);

comment on table public.nip_mutfak_sozluk is
  'Mutfak kartindaki malzeme adlarinin Turkce karsiligi. Yeni malzeme eklenirse buraya da eklenir.';

-- RLS: defter gibi bu da disariya acilmaz. Tablo sahibi (gocusu uygulayan
-- kullanici) ve SECURITY DEFINER fonksiyon RLS'ten muaftir, ceviri calisir.
alter table public.nip_mutfak_sozluk enable row level security;
revoke all on table public.nip_mutfak_sozluk from anon, authenticated, public;

insert into public.nip_mutfak_sozluk (yabanci, turkce) values
  -- Rusca
  ('Донер',                   'Döner'),
  ('Дзадзики',                'Tatziki'),
  ('Соус из печёного перца',  'Köz Biber Sosu'),
  ('Чеддер',                  'Cheddar'),
  ('Красный салат',           'Kırmızı Marul'),
  ('Коулслоу',                'Coleslaw'),
  ('Соленья',                 'Turşu'),
  ('Карамелизованный лук',    'Karamelize Soğan'),
  ('Майонез',                 'Mayonez'),
  ('Лук',                     'Soğan'),
  ('С луком',                 'Soğanlı'),
  ('Без лука',                'Soğansız'),
  ('Без газа',                'Su'),
  ('С газом',                 'Soda'),
  ('Фалафель',                'Falafel'),
  -- Ingilizce
  ('Doner',                   'Döner'),
  ('Tzatziki',                'Tatziki'),
  ('Roasted Pepper',          'Köz Biber Sosu'),
  ('Red Lettuce',             'Kırmızı Marul'),
  ('Pickle',                  'Turşu'),
  ('Caramelized Onion',       'Karamelize Soğan'),
  ('Mayo',                    'Mayonez'),
  ('Onion',                   'Soğan'),
  ('With onion',              'Soğanlı'),
  ('Without onion',           'Soğansız'),
  ('Still',                   'Su'),
  ('Sparkling',               'Soda')
on conflict (yabanci) do update set turkce = excluded.turkce;

-- BILEREK CEVRILMEYENLER: "Cheddar", "Coleslaw", "Falafel", "Original",
-- "Light". Mutfak bunlari Turkce kartlarda da ayni yaziyor.

-- ----------------------------------------------------------------------------
-- 2) Ceviri
-- ----------------------------------------------------------------------------
-- det alani virgulle ayrilmis parcalardan olusur. Her parca AYRI AYRI ve
-- TAM eslesmeyle cevrilir. Duz metin replace() YAPILMAZ: "Лук" (sogan)
-- "Без лука" (sogansiz) ifadesinin icinde gecer, duz replace iki kelimeyi
-- birden bozardi.
--
-- Sozlukte olmayan parca OLDUGU GIBI kalir. Asci notu boyle korunur
-- (canli veride ornek: "Karamelize Sogan · Not: Chilli sauce please").
create or replace function public.nip_mutfak_det_turkce(p_items jsonb)
returns jsonb
language sql
stable
set search_path to 'public'
as $$
  select case
    when p_items is null or jsonb_typeof(p_items) <> 'array' then p_items
    else (
      select coalesce(jsonb_agg(
               case when e.it ? 'det' and nullif(trim(e.it->>'det'), '') is not null
                    then jsonb_set(e.it, '{det}', to_jsonb((
                           select string_agg(coalesce(s.turkce, trim(u.parca)), ', '
                                             order by u.parca_sira)
                             from unnest(string_to_array(e.it->>'det', ','))
                                  with ordinality as u(parca, parca_sira)
                             left join public.nip_mutfak_sozluk s
                                    on s.yabanci = trim(u.parca)
                         )))
                    else e.it
               end
               order by e.kalem_sira), p_items)
        from jsonb_array_elements(p_items) with ordinality as e(it, kalem_sira)
    )
  end;
$$;

comment on function public.nip_mutfak_det_turkce(jsonb) is
  'Mutfak kartindaki items[].det malzeme listesini Turkceye cevirir. Sozlukte olmayan parcaya dokunmaz.';

-- ----------------------------------------------------------------------------
-- 3) Tetikleyici
-- ----------------------------------------------------------------------------
create or replace function public.nip_mutfak_trg_det_turkce()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  begin
    new.items := public.nip_mutfak_det_turkce(new.items);
  exception when others then
    -- Ceviri patlarsa kart eski haliyle kaydedilir. Satis durmaz.
    begin
      insert into public.nip_mutfak_log (yon, olay, kitchen_order_id, ok, mesaj)
      values ('kart', 'det_turkce', new.id, false, sqlerrm);
    exception when others then null;
    end;
  end;
  return new;
end;
$$;

drop trigger if exists trg_mutfak_det_turkce on public.kitchen_orders;
create trigger trg_mutfak_det_turkce
  before insert or update of items on public.kitchen_orders
  for each row execute function public.nip_mutfak_trg_det_turkce();
