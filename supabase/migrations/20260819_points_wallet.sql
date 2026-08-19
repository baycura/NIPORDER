-- PUAN CUZDANI: biriken puan kasada harcanabilir (1 puan = 1 TL).
--
-- Akis: musteri uygulamada ya da kasada "puanla ode" der (orders.use_points).
-- Gercek dusum SIPARIS ODENDIGI ANDA tetikleyicide olur:
--   kullanilan = min(bakiye, tutar)     -> puan dusulur, orders.points_used'a yazilir
--   kazanc     = (tutar - kullanilan)/20 -> puanla odenen kisim puan KAZANDIRMAZ
--
-- Neden hepsi tetikleyicide: istemciden gelen points_used'a guvenilemez
-- (musteri kendi siparisini acarken istedigini yazabilirdi). use_points sadece
-- bir istek bayragi; para matematigi burada, bakiye kilitlenerek yapilir —
-- ayni anda iki siparis odense de cift harcama olmaz (for update).

alter table orders add column if not exists use_points boolean not null default false;
alter table orders add column if not exists points_used numeric not null default 0;

comment on column orders.use_points is
  'Musterinin/kasiyerin istegi: odemede puan kullanilsin. Miktara tetikleyici karar verir.';
comment on column orders.points_used is
  'Odemede fiilen kullanilan puan (1 puan = 1 TL). YALNIZ tetikleyici yazar.';

create or replace function public.fn_award_member_points()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare bal int; use_amt int; delta int; spent numeric; new_tier text;
begin
  if new.customer_id is null then return null; end if;
  if old.status is not distinct from new.status then return null; end if;
  if new.status::text <> 'paid' or old.status::text = 'paid' then return null; end if;

  -- Cuzdan: istek varsa bakiye ve tutarla sinirla. Kilit sart — cift harcamayi onler.
  use_amt := 0;
  if coalesce(new.use_points, false) then
    select coalesce(points, 0) into bal from customers where id = new.customer_id for update;
    use_amt := least(bal, floor(coalesce(new.total, 0))::int);
  end if;

  delta := floor((coalesce(new.total, 0) - use_amt) / 20); -- %5; puanla odenen kisim kazandirmaz
  update public.customers set
    points = coalesce(points, 0) - use_amt + delta,
    total_spent = coalesce(total_spent, 0) + coalesce(new.total, 0),
    visit_count = coalesce(visit_count, 0) + 1,
    updated_at = now()
  where id = new.customer_id
  returning total_spent into spent;

  -- Fiilen kullanilani siparise isle. Bu update tetikleyiciyi yeniden calistirir
  -- ama status degismedigi icin yukaridaki kosuldan hemen doner.
  if use_amt > 0 or coalesce(new.points_used, 0) <> 0 then
    update public.orders set points_used = use_amt where id = new.id;
  end if;

  -- Seviye PUANDAN DEGIL toplam harcamadan: puan cuzdan olarak harcanabildigi
  -- icin bakiyeye baglansa cuzdani kullanan seviye kaybederdi.
  new_tier := case
    when spent >= 80000 then 'aileden'
    when spent >= 30000 then 'mudavim'
    when spent >= 10000 then 'mahalleli'
    else 'yeniyuz' end;
  update public.customers set tier = new_tier
  where id = new.customer_id and coalesce(tier, '') is distinct from new_tier;
  return null;
end $$;
