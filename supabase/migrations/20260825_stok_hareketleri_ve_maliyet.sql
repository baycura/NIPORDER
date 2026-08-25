-- ============================================================================
-- STOK HAREKETLERI + MALIYET FOTOGRAFI       20260825_stok_hareketleri_ve_maliyet
-- ============================================================================
-- SORUN
-- Recete stok dusumu bugune kadar YALNIZ kitchen_status 'preparing'e gecisde
-- calisiyordu (fn_decrement_stock_from_recipe). Gercek is akisi mutfak
-- adimlarini kullanmiyor: kasa hesabi kapatiyor, kimse "hazirlamaya basla"ya
-- basmiyor. Olcum: odenmis 84 order_items kaleminin 77'si hala 'pending';
-- recetesi olan 125 kalemin yalnizca 1'i 'preparing'ten gecmis. Yani dusum
-- pratikte HIC calismadi.
--
-- COZUM
-- Dusum artik "kalem baglandigi anda" olur. Baglanma = sunlarin ILKI:
--   (a) kitchen_status 'pending' disina cikar  (mutfak akisi kullanildiysa)
--   (b) siparis 'paid' / 'debt' olur           (kasa akisi kullanildiysa)
-- Kalem 'pending' iken silinebiliyor (OrderDetailPage.jsx changeQty ve
-- sonEklenenGeriAl mutfaga gitmis kalemi silmeyi reddediyor), o yuzden
-- baglanmadan once dusmuyoruz.
--
-- HESAPLAMA DEGIL, ESITLEME
-- Fonksiyon "su kadar dus" demiyor; "bu kalemin toplam dusumu su olmali"
-- deyip aradaki FARKI yaziyor (nip_stok_esitle). Boylece:
--   - ayni olay iki kez tetiklenirse ikinci kez fark 0 cikar (mukerrer dusum yok)
--   - adet degisirse yalniz fark yazilir
--   - siparis iptal edilirse hedef 0 olur ve dusum kendiliginden geri doner
-- Canli veride 66 iptal kaleminin 38'i mutfaktan gecmis; geri verme sart.
--
-- MALIYET FOTOGRAFI
-- Her hareket satiri o andaki cost_per_unit'i saklar. ingredients.cost_per_unit
-- her faturayla degistigi icin (InvoicesPage) gecmis satislarin kar marji aksi
-- halde her fatura girisinde geriye donuk degisirdi. Ters kayit da AYNI birim
-- fiyattan doner, yoksa iptal para kazandirir/kaybettirir gibi gorunurdu.
--
-- BAGLAM DONDURMA
-- Parti gecesi bayragi ve olcu carpani (duble) ILK harekette dondurulur.
-- Yoksa parti gecesi satilip ertesi gun iptal edilen bir kalemin ters kaydi
-- "parti degil" diye hesaplanir, parti malzemesi stokta asili kalirdi.
--
-- GERIYE DONUK DUSUM YAPILMIYOR — bilincli. Bugunku stok sayilari
-- StockMgmtPage'den ELLE girildi ve o sayilar zaten fiilen tuketilmis mali
-- iceriyor. Gecmisi simdi dusmek ayni mali IKINCI kez dusmek olurdu.
-- Otomatik dusum bu migration'dan itibaren gecerlidir.
--
-- Geri alma:
--   drop trigger if exists trg_stok_kalem  on public.order_items;
--   drop trigger if exists trg_stok_kalem_sil on public.order_items;
--   drop trigger if exists trg_stok_siparis on public.orders;
--   drop function if exists public.fn_stok_kalem_tetik() cascade;
--   drop function if exists public.fn_stok_siparis_tetik() cascade;
--   drop function if exists public.nip_stok_esitle(uuid, numeric, text) cascade;
--   drop function if exists public.nip_stok_kaydet(uuid,uuid,uuid,uuid,numeric,numeric,boolean,numeric,text) cascade;
--   drop table if exists public.stock_moves;
--   -- eski davranisa donmek icin trg_decrement_stock yeniden kurulmali
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) HAREKET DEFTERI
-- ----------------------------------------------------------------------------
create table if not exists public.stock_moves (
  id            bigint generated always as identity primary key,
  order_item_id uuid    not null references public.order_items(id) on delete cascade,
  ingredient_id uuid    not null references public.ingredients(id) on delete cascade,
  product_id    uuid             references public.products(id)    on delete set null,
  store_id      uuid    not null,
  qty_delta     numeric not null,                    -- negatif = stoktan dustu
  unit_cost     numeric not null default 0,          -- o andaki cost_per_unit
  party         boolean not null default false,      -- dondurulmus baglam
  mult          numeric not null default 1,          -- dondurulmus olcu carpani
  reason        text    not null,
  created_at    timestamptz not null default now()
);

comment on table public.stock_moves is
  'Recete kaynakli stok hareketleri. Append-only: duzeltme silmeyle degil ters '
  'kayitla yapilir. unit_cost satis anindaki birim maliyettir; urun karliligi '
  'bu fotografi okur, canli cost_per_unit''i degil.';

create index if not exists ix_stock_moves_kalem on public.stock_moves (order_item_id);
create index if not exists ix_stock_moves_malzeme on public.stock_moves (ingredient_id, created_at desc);
create index if not exists ix_stock_moves_urun on public.stock_moves (product_id, created_at desc);

alter table public.stock_moves enable row level security;

-- Yalniz okuma. Yazma tetikleyicilerin DEFINER fonksiyonlarindan gelir;
-- istemcinin hicbir yazma politikasi YOK — personel kendi tukettigini
-- silip stogu suslemesin.
drop policy if exists stock_moves_read_personel on public.stock_moves;
create policy stock_moves_read_personel on public.stock_moves
  for select to authenticated using (public.is_staff());

revoke all on table public.stock_moves from anon;

-- ----------------------------------------------------------------------------
-- 2) TEK MALZEME ESITLEME
-- Hedef toplam delta ile o ana kadar yazilmis toplami karsilastirip FARKI yazar.
-- ----------------------------------------------------------------------------
create or replace function public.nip_stok_kaydet(
  p_item uuid, p_ing uuid, p_prod uuid, p_store uuid,
  p_hedef_delta numeric, p_cost numeric,
  p_party boolean, p_mult numeric, p_reason text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_mevcut numeric; v_fark numeric; v_cost numeric;
begin
  select coalesce(sum(sm.qty_delta), 0) into v_mevcut
    from public.stock_moves sm
   where sm.order_item_id = p_item and sm.ingredient_id = p_ing;

  v_fark := coalesce(p_hedef_delta, 0) - v_mevcut;

  -- Kuruslu artiklari yazma: numeric karsilastirmasinda 1e-9'luk fark
  -- her tetiklemede bir satir uretirdi.
  if abs(v_fark) < 0.000001 then return; end if;

  -- Birim maliyet ILK harekette dondurulur; ters kayit ayni fiyattan doner.
  select sm.unit_cost into v_cost
    from public.stock_moves sm
   where sm.order_item_id = p_item and sm.ingredient_id = p_ing
   order by sm.id limit 1;
  v_cost := coalesce(v_cost, p_cost, 0);

  insert into public.stock_moves(order_item_id, ingredient_id, product_id, store_id,
                                 qty_delta, unit_cost, party, mult, reason)
  values (p_item, p_ing, p_prod, p_store, v_fark, v_cost, p_party, p_mult, p_reason);

  update public.ingredients
     set stock_qty = coalesce(stock_qty, 0) + v_fark
   where id = p_ing;
end $$;

-- ----------------------------------------------------------------------------
-- 3) KALEM ESITLEME
-- p_hedef = bu kalemin stoktan dusmesi gereken ADET (iptalde 0).
-- SECURITY DEFINER: PARIS'ten satilan bir doner urununun malzemesi DONER
-- magazasina ait; ingredients RLS'i (store_id = any(user_store_ids())) invoker
-- kimligiyle o satiri filtreler ve UPDATE sessizce 0 satir gunceller.
-- fn_decrement_retail_stock ayni sebeple DEFINER. Bu fonksiyon kullanicidan
-- parametre almaz, yalnizca RLS'in zaten yetki verdigi bir kalemin uzerinde
-- calisir; current_user'a dayali hicbir kontrol icermez (bkz.
-- 20260820_profil_birlestirme_ve_musteri_korumasi.sql:92-94 uyarisi).
-- ----------------------------------------------------------------------------
create or replace function public.nip_stok_esitle(p_item_id uuid, p_hedef numeric, p_reason text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  it      record;
  v_party boolean;
  v_mult  numeric;
  g       jsonb;
  sel     text;
  m       numeric;
  rec     record;
  v_hedef numeric;
  v_ing   uuid;
begin
  select oi.id, oi.product_id, oi.store_id, oi.selected_options, oi.is_takeaway,
         p.takeaway_cup, p.takeaway_straw, p.options_config
    into it
    from public.order_items oi
    left join public.products p on p.id = oi.product_id
   where oi.id = p_item_id;

  if not found or it.product_id is null then return; end if;

  -- Dondurulmus baglami ilk hareketten oku; yoksa simdi hesapla.
  select sm.party, sm.mult into v_party, v_mult
    from public.stock_moves sm
   where sm.order_item_id = p_item_id
   order by sm.id limit 1;

  if v_party is null then
    v_party := coalesce(public.fn_is_party_now(it.store_id), false);
    v_mult  := 1;
    -- Olcu carpani: secilen opsiyonlarda qty_multipliers varsa uygulanir;
    -- yoksa adinda double/duble gecen secenek x2 sayilir. (Eski
    -- fn_decrement_stock_from_recipe davranisi birebir korundu.)
    if it.selected_options is not null and jsonb_typeof(it.selected_options) = 'object' then
      for g in select * from jsonb_array_elements(coalesce(it.options_config->'groups', '[]'::jsonb))
      loop
        sel := case when jsonb_typeof(it.selected_options->(g->>'name')) = 'string'
                    then it.selected_options->>(g->>'name') end;
        if sel is not null then
          m := coalesce((g->'qty_multipliers'->>sel)::numeric,
                        case when sel ~* '(double|duble)' then 2 else 1 end);
          v_mult := v_mult * coalesce(m, 1);
        end if;
      end loop;
    end if;
  end if;

  -- 3a) Recete satirlari
  for rec in
    select r.ingredient_id, r.qty_per_unit, r.party_only,
           coalesce(i.waste_pct, 0)        as waste_pct,
           coalesce(i.is_consumable, false) as is_consumable,
           coalesce(i.cost_per_unit, 0)     as cost_per_unit
      from public.recipes r
      join public.ingredients i on i.id = r.ingredient_id
     where r.product_id = it.product_id
  loop
    if rec.party_only and not v_party then
      v_hedef := 0;
    else
      -- Carpan yalniz gercek malzemeye; sarf (buz, bardak) tek kalir.
      v_hedef := rec.qty_per_unit * coalesce(p_hedef, 0)
                 * (case when rec.is_consumable then 1 else v_mult end)
                 * (1 + rec.waste_pct / 100.0);
    end if;
    perform public.nip_stok_kaydet(p_item_id, rec.ingredient_id, it.product_id, it.store_id,
                                   -v_hedef, rec.cost_per_unit, v_party, v_mult, p_reason);
  end loop;

  -- 3b) Paket servis bardagi ve pipeti
  if it.is_takeaway and it.takeaway_cup is not null then
    select i.id into v_ing from public.ingredients i
     where i.takeaway_role = it.takeaway_cup and i.store_id = it.store_id
       and not exists (select 1 from public.recipes r
                        where r.product_id = it.product_id and r.ingredient_id = i.id)
     limit 1;
    if v_ing is not null then
      perform public.nip_stok_kaydet(p_item_id, v_ing, it.product_id, it.store_id,
                                     -coalesce(p_hedef, 0),
                                     (select coalesce(cost_per_unit,0) from public.ingredients where id = v_ing),
                                     v_party, v_mult, p_reason);
    end if;
  end if;

  if it.is_takeaway and it.takeaway_straw then
    select i.id into v_ing from public.ingredients i
     where i.takeaway_role = 'straw' and i.store_id = it.store_id
       and not exists (select 1 from public.recipes r
                        where r.product_id = it.product_id and r.ingredient_id = i.id)
     limit 1;
    if v_ing is not null then
      perform public.nip_stok_kaydet(p_item_id, v_ing, it.product_id, it.store_id,
                                     -coalesce(p_hedef, 0),
                                     (select coalesce(cost_per_unit,0) from public.ingredients where id = v_ing),
                                     v_party, v_mult, p_reason);
    end if;
  end if;

  -- Paket isareti sonradan kaldirilirsa (ya da hedef 0'a duserse) bardak/pipet
  -- geri doner. Iki koruma:
  --   1) Yalniz takeaway_role tasiyan malzemeler taranir — recete sonradan
  --      degistiyse cikarilan malzemenin dusumu geri alinmamali, o mal
  --      fiilen tuketildi.
  --   2) URUNUN RECETESINDE OLAN malzemeye dokunulmaz. Canli testte "Pipet"
  --      hem Bicycle Thief recetesinde hem takeaway_role='straw' tasiyordu;
  --      bu koruma olmadan recete dusumu her seferinde sifirlaniyordu.
  for rec in
    select sm.ingredient_id
      from public.stock_moves sm
      join public.ingredients i on i.id = sm.ingredient_id
     where sm.order_item_id = p_item_id
       and i.takeaway_role is not null
       and not exists (select 1 from public.recipes r
                        where r.product_id = it.product_id and r.ingredient_id = sm.ingredient_id)
       and not (it.is_takeaway
                and (i.takeaway_role = it.takeaway_cup
                     or (it.takeaway_straw and i.takeaway_role = 'straw'))
                and coalesce(p_hedef, 0) > 0)
     group by sm.ingredient_id
  loop
    perform public.nip_stok_kaydet(p_item_id, rec.ingredient_id, it.product_id, it.store_id,
                                   0, 0, v_party, v_mult, p_reason);
  end loop;
end $$;

-- DIKKAT: yalniz "from public" YETMEZ. Supabase, public semasindaki
-- fonksiyonlara anon ve authenticated icin VARSAYILAN EXECUTE verir; revoke
-- from public bunu kaldirmaz ve fonksiyon /rest/v1/rpc/<ad> uzerinden
-- cagrilabilir kalir. Bu dordu SECURITY DEFINER ve parametreleri kullanicidan
-- geliyor — acik birakilsa herhangi bir oturum istedigi malzemenin stogunu
-- istedigi kadar degistirebilirdi. Hicbiri istemciden cagrilmiyor.
revoke all on function public.nip_stok_kaydet(uuid,uuid,uuid,uuid,numeric,numeric,boolean,numeric,text) from anon, authenticated, public;
revoke all on function public.nip_stok_esitle(uuid, numeric, text) from anon, authenticated, public;

-- ----------------------------------------------------------------------------
-- 4) TETIKLEYICILER
-- ----------------------------------------------------------------------------
create or replace function public.fn_stok_kalem_tetik()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_durum text; v_hedef numeric;
begin
  if TG_OP = 'DELETE' then
    -- Silme yalniz 'pending' iken mumkun (frontend engelliyor), yani normalde
    -- dusulecek bir sey yok. Yine de esitliyoruz: bir gun kural gevserse
    -- stok sessizce eksik kalmasin. Ardindan FK cascade satirlari temizler.
    perform public.nip_stok_esitle(OLD.id, 0, 'kalem_silindi');
    return OLD;
  end if;

  select o.status::text into v_durum from public.orders o where o.id = NEW.order_id;

  if v_durum = 'cancelled' then
    v_hedef := 0;
  elsif NEW.kitchen_status is distinct from 'pending' or v_durum in ('paid', 'debt') then
    v_hedef := coalesce(NEW.quantity, 1);
  elsif exists (select 1 from public.stock_moves sm where sm.order_item_id = NEW.id) then
    -- Zaten dusulmus bir kalem 'pending'e geri cekildiyse dusumu iptal etmeyiz
    -- (mal cikti), yalnizca adedi takip ederiz.
    v_hedef := coalesce(NEW.quantity, 1);
  else
    return NEW;   -- henuz baglanmadi: ne mutfaga gitti ne odendi
  end if;

  perform public.nip_stok_esitle(NEW.id, v_hedef, lower(TG_OP));
  return NEW;
end $$;

create or replace function public.fn_stok_siparis_tetik()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare r record;
begin
  if NEW.status is not distinct from OLD.status then return NEW; end if;

  if NEW.status::text in ('paid', 'debt') then
    for r in select oi.id, oi.quantity from public.order_items oi where oi.order_id = NEW.id loop
      perform public.nip_stok_esitle(r.id, coalesce(r.quantity, 1), 'siparis_odendi');
    end loop;
  elsif NEW.status::text = 'cancelled' then
    for r in select oi.id from public.order_items oi where oi.order_id = NEW.id loop
      perform public.nip_stok_esitle(r.id, 0, 'siparis_iptal');
    end loop;
  end if;
  return NEW;
end $$;

revoke all on function public.fn_stok_kalem_tetik() from anon, authenticated, public;
revoke all on function public.fn_stok_siparis_tetik() from anon, authenticated, public;

-- Eski kanca kaldiriliyor — yenisi ayni isi kapsiyor, ikisi birden kalirsa
-- 'preparing'e gecen kalem iki kez duserdi.
drop trigger if exists trg_decrement_stock on public.order_items;
drop function if exists public.fn_decrement_stock_from_recipe() cascade;

drop trigger if exists trg_stok_kalem on public.order_items;
create trigger trg_stok_kalem
  after insert or update on public.order_items
  for each row execute function public.fn_stok_kalem_tetik();

drop trigger if exists trg_stok_kalem_sil on public.order_items;
create trigger trg_stok_kalem_sil
  before delete on public.order_items
  for each row execute function public.fn_stok_kalem_tetik();

drop trigger if exists trg_stok_siparis on public.orders;
create trigger trg_stok_siparis
  after update of status on public.orders
  for each row execute function public.fn_stok_siparis_tetik();
