-- Ikram edilen MUTFAK KONSINYE urunlerinde mutfagin hakki yanmasin.
--
-- Hakedis gorunumu final_price topluyordu; ikramda final_price=0 olunca
-- mutfaga odenecek tutar da sifirlanirdi. Oysa ikrami mutfak degil biz
-- yapiyoruz: ikramli kalem mutfaga PRODUCT_PRICE (gercek deger) uzerinden
-- borclanmaya devam eder.
create or replace view public.inter_company_settlement as
 SELECT (date_trunc('week'::text, o.created_at))::date AS week_start,
    (date_trunc('month'::text, o.created_at))::date AS month_start,
    o.origin_store_id,
    os.name AS origin_store_name,
    oi.kitchen_destination_store_id,
    ks.name AS kitchen_store_name,
    sum(((COALESCE(oi.quantity, 1))::numeric *
      CASE WHEN oi.is_treat THEN COALESCE(oi.product_price, (0)::numeric)
           ELSE COALESCE(oi.final_price, oi.product_price, (0)::numeric) END)) AS total_amount,
    count(DISTINCT o.id) AS order_count,
    count(oi.id) AS item_count
   FROM (((orders o
     JOIN order_items oi ON ((oi.order_id = o.id)))
     LEFT JOIN stores os ON ((os.id = o.origin_store_id)))
     LEFT JOIN stores ks ON ((ks.id = oi.kitchen_destination_store_id)))
  WHERE ((o.status = 'paid'::order_status) AND (o.origin_store_id IS NOT NULL) AND (oi.kitchen_destination_store_id IS NOT NULL) AND (o.origin_store_id <> oi.kitchen_destination_store_id))
  GROUP BY ((date_trunc('week'::text, o.created_at))::date), ((date_trunc('month'::text, o.created_at))::date), o.origin_store_id, os.name, oi.kitchen_destination_store_id, ks.name
  ORDER BY ((date_trunc('week'::text, o.created_at))::date) DESC;
