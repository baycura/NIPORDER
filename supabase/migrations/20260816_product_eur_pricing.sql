-- EURO FIYATLAMA
-- Bazi urunlerin fiyati euro olarak belirlenir (ithal urun, kamp, merch...).
-- Kural: sistemin PARA BIRIMI HEP TL kalir — siparis, odeme, rapor, stok,
-- uye fiyati, happy hour hepsi TL uzerinden calisir. Euro yalniz GIRIS
-- birimidir: yonetici euro yazar, tetikleyici gecerli kurla TL fiyati hesaplar.
--
--   products.currency  : 'TRY' (varsayilan) veya 'EUR'
--   products.price_eur : euro olarak girilen tutar
--   products.price     : her zaman TL — EUR urunlerde otomatik hesaplanir
--   app_settings['eur_rate'] : 1 euro kac TL (magaza bazli, Ayarlar sayfasindan)

alter table public.products
  add column if not exists currency text not null default 'TRY',
  add column if not exists price_eur numeric;

alter table public.products drop constraint if exists products_currency_check;
alter table public.products add constraint products_currency_check
  check (currency in ('TRY', 'EUR'));

comment on column public.products.currency is
  'TRY veya EUR. EUR ise fiyat price_eur alanindan kur ile TL''ye cevrilir.';
comment on column public.products.price_eur is
  'Euro olarak girilen tutar. TL karsiligi products.price alanina yazilir.';

create or replace function public.fn_eur_rate(p_store_id uuid)
returns numeric language sql stable set search_path = public as $$
  select coalesce(
    nullif(regexp_replace(
      coalesce((select value #>> '{}' from app_settings
                where key = 'eur_rate' and store_id = p_store_id), '0'),
      '[^0-9.]', '', 'g'), '')::numeric,
    0);
$$;

-- Urun kaydedilirken: EUR ise TL fiyatini kurdan hesapla
create or replace function public.fn_product_apply_eur()
returns trigger language plpgsql set search_path = public as $$
declare v_rate numeric;
begin
  if NEW.currency = 'EUR' and NEW.price_eur is not null then
    v_rate := public.fn_eur_rate(NEW.store_id);
    if v_rate > 0 then
      NEW.price := round(NEW.price_eur * v_rate);
    end if;
  elsif NEW.currency = 'TRY' then
    NEW.price_eur := null;
  end if;
  return NEW;
end $$;

drop trigger if exists trg_product_apply_eur on public.products;
create trigger trg_product_apply_eur
  before insert or update of price, price_eur, currency on public.products
  for each row execute function public.fn_product_apply_eur();

-- Kur degisince EUR fiyatli tum urunlerin TL fiyati yenilenir
create or replace function public.fn_eur_rate_changed()
returns trigger language plpgsql set search_path = public as $$
declare v_rate numeric;
begin
  if NEW.key <> 'eur_rate' then return NEW; end if;
  v_rate := public.fn_eur_rate(NEW.store_id);
  if v_rate > 0 then
    update public.products
       set price = round(price_eur * v_rate)
     where store_id = NEW.store_id and currency = 'EUR' and price_eur is not null;
  end if;
  return NEW;
end $$;

drop trigger if exists trg_eur_rate_changed on public.app_settings;
create trigger trg_eur_rate_changed
  after insert or update on public.app_settings
  for each row execute function public.fn_eur_rate_changed();

insert into public.app_settings (key, value, store_id)
select 'eur_rate', to_jsonb('48'::text), id from public.stores
on conflict (key, store_id) do nothing;
