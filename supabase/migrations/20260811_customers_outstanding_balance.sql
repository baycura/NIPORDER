-- Eksik sutun: customers.outstanding_balance (veresiye / acik bakiye).
--
-- Kod bu sutunu 20 yerde kullaniyor ama tabloda yoktu. PostgREST "column does
-- not exist" dondugu icin su UC EKRAN tamamen calismıyordu:
--   * Uyeler sayfasi   — liste outstanding_balance'a gore siralaniyor -> sorgu patliyor
--   * Kasa > Veresiye  — musteri listesi bu sutunu seciyor -> acilir liste bos
--   * Musteri profili  — profil karti sorgusu bu sutunu seciyor -> kart hic dolmuyor
--
-- Ayri bir `debts` tablosu var ama kodda hic kullanilmiyor; tasarimin gercek
-- kaynagi bu denormalize bakiye alani. Sifir varsayilanla ekleniyor.

alter table public.customers
  add column if not exists outstanding_balance numeric not null default 0
  check (outstanding_balance >= 0);

comment on column public.customers.outstanding_balance is
  'Musterinin acik veresiye bakiyesi (TL). Kasada borc kaydi artirir, tahsilat azaltir.';

create index if not exists idx_customers_outstanding_balance
  on public.customers (outstanding_balance) where outstanding_balance > 0;
