-- ============================================================================
-- TELEGRAM GURULTUSU                              20261013_telegram_gurultu
-- ============================================================================
-- OLCUM (son 30 gun, tg_notify_log):
--   * "Yeni siparis" bildirimi 1.162 kez tetiklendi; yalniz 7'si musterinin
--     QR siparisiydi.
--   * Personele 1.398 mesaj gitti; 828'i (%59) siparisi GIREN kisinin
--     kendisine gitti.
--   * Sahibe 170 kez "VARDIYADA KIMSE YOK" gitti. 165'i dukkandaki part-time
--     calisanin girdigi siparisti; Telegram'i bagli olmadigi icin "kimse yok"
--     sanildi.
--
-- DEGISIKLIK: tetik, bildirime kalemi KIMIN girdigini ekler:
--   added_by : siparisi giren personelin staff.id listesi
--   qr       : musteri (QR) kalemi var mi (added_by bos)
-- telegram fonksiyonu (supabase/functions/telegram) bu alanlarla:
--   * mesaji siparisi giren kisiye gondermez;
--   * sahibe yedek uyariyi YALNIZ QR siparisinde gonderir;
--   * QR siparisini vardiyadaki herkese gonderir.
-- Eski fonksiyon bu alanlari yok sayar; sira onemli degil.
--
-- Geri alma: iki tetik fonksiyonu payload'dan added_by ve qr cikarilarak
-- onceki haline doner.
-- ============================================================================

create or replace function public.trg_items_sent_ins()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare r record;
begin
  for r in
    select n.order_id,
           jsonb_agg(jsonb_build_object('name', coalesce(n.product_name,'Urun'), 'qty', coalesce(n.quantity,1))) as items,
           -- Kalemi kim girdi: personel (staff.id) ya da musteri (bos = QR).
           coalesce(jsonb_agg(distinct n.added_by) filter (where n.added_by is not null), '[]'::jsonb) as added_by,
           bool_or(n.added_by is null) as qr
    from new_rows n join public.orders o on o.id = n.order_id
    where coalesce(n.sent_to_kitchen,false) = true
      and (n.kitchen_destination_store_id is null or n.kitchen_destination_store_id = o.origin_store_id)   -- doner kalemleri panoya gider
    group by n.order_id
  loop
    perform public.tg_call(jsonb_build_object('kind','items_sent','order_id', r.order_id, 'items', r.items,
                                              'added_by', r.added_by, 'qr', r.qr));
  end loop;
  return null;
end $fn$;

create or replace function public.trg_items_sent_upd()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare r record;
begin
  for r in
    select n.order_id,
           jsonb_agg(jsonb_build_object('name', coalesce(n.product_name,'Urun'), 'qty', coalesce(n.quantity,1))) as items,
           coalesce(jsonb_agg(distinct n.added_by) filter (where n.added_by is not null), '[]'::jsonb) as added_by,
           bool_or(n.added_by is null) as qr
    from new_rows n join old_rows o on o.id = n.id join public.orders ord on ord.id = n.order_id
    where coalesce(o.sent_to_kitchen,false) = false and coalesce(n.sent_to_kitchen,false) = true
      and (n.kitchen_destination_store_id is null or n.kitchen_destination_store_id = ord.origin_store_id)
    group by n.order_id
  loop
    perform public.tg_call(jsonb_build_object('kind','items_sent','order_id', r.order_id, 'items', r.items,
                                              'added_by', r.added_by, 'qr', r.qr));
  end loop;
  return null;
end $fn$;
