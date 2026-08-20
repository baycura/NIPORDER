-- PayTR: basarili odeme kaydi HICBIR ZAMAN yazilamiyordu (denetim bulgusu).
--
-- Bildirim fonksiyonu payments'a soyle yaziyordu:
--   insert into payments (order_id, amount, method) values (..., 'online')
-- Iki ihlal birden: payment_method enum'unda 'online' YOK ve store_id NOT NULL.
-- Insert hatasi kontrol edilmediginden sessizce dusuyor, siparis yine 'paid'
-- oluyordu — yani online tahsilat ciro kayitlarina hic girmeyecekti.
-- (Sansimiza bugune kadar basarili online odeme olmadi: 15 deneme, 15 basarisiz.)
--
-- Fonksiyon tarafi da duzeltildi: store_id siparisin magazasindan aliniyor,
-- insert hatasi loglaniyor, siparis kapatilamazsa PayTR'a OK donulmuyor
-- (tekrar bildirsin), ayni siparise ikinci kez odeme kaydi atilmiyor.

alter type payment_method add value if not exists 'online';

-- Karttan CEKILMEYEN, puanla karsilanan kisim. Cuzdan + kart ayni sipariste
-- kullanilinca cifte tahsilat olmasin diye kart yalniz kalan tutari ceker;
-- bu kolon beklenen puan dusumunu saklar, bildirimde gerceklesenle karsilastirilir.
alter table public.paytr_payments add column if not exists points_cover_kurus bigint not null default 0;
comment on column public.paytr_payments.points_cover_kurus is
  'Karttan CEKILMEYEN, puanla karsilanan kisim (kurus). Cifte tahsilat denetimi icin.';
