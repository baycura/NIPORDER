-- ============================================================================
-- MUSTERI QR: ACIK HESABA EKLE            20260918_musteri_acik_hesaba_ekle
-- ============================================================================
-- Sorun: Kayitli (veya ayni normal masadaki) musteri her "Siparis ver"de
-- yeni orders satiri aciyordu. Uye profili ayni kalirken kasa iki ayri
-- hesap goruyordu. Personel normal masada tek hesaba ekler; QR ayni
-- davranisi yapmiyordu.
--
-- Kural (staff TablesPage ile hizali):
--   * Normal masa (shared=false): masadaki acik hesaba ekle
--   * Ortak masa (shared=true): yalniz ayni customer_id ile acik hesaba ekle
--   * Masasiz + uye: ayni uyenin acik hesabina ekle (store eslesmesi)
--   * 12 saatten eski acik hesaplar birlestirilmez (bayat)
--
-- Gizlilik: anon orders SELECT edemez; bu yuzden SECURITY DEFINER RPC.
-- p_customer_id yalniz auth.uid() ile eslesen uye icin kabul edilir.
--
-- Geri alma:
--   drop function if exists public.musteri_sepet_gonder(jsonb, uuid, text, uuid, text, boolean, uuid);
-- ============================================================================

create or replace function public.musteri_sepet_gonder(
  p_items            jsonb,
  p_table_id         uuid    default null,
  p_customer_name    text    default null,
  p_customer_id      uuid    default null,
  p_note             text    default null,
  p_use_points       boolean default false,
  p_origin_store_id  uuid    default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_customer_id uuid := p_customer_id;
  v_shared      boolean := false;
  v_order_id    uuid;
  v_sum         numeric := 0;
  v_name        text := nullif(trim(coalesce(p_customer_name, '')), '');
  v_note        text := nullif(trim(coalesce(p_note, '')), '');
  v_appended    boolean := false;
  v_n           int;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'sepet: kalem listesi gerekli';
  end if;
  v_n := jsonb_array_length(p_items);
  if v_n < 1 or v_n > 40 then
    raise exception 'sepet: kalem sayisi gecersiz';
  end if;

  -- Uye id'sini anon / baskasina yazdirma
  if v_customer_id is not null then
    if auth.uid() is null then
      v_customer_id := null;
    elsif not exists (
      select 1 from public.customers c
       where c.id = v_customer_id and c.auth_user_id = auth.uid()
    ) then
      raise exception 'sepet: yetkisiz uye';
    end if;
  end if;

  if p_table_id is not null then
    select coalesce(t.shared, false) into v_shared
      from public.cafe_tables t where t.id = p_table_id;
    if not found then
      raise exception 'sepet: masa bulunamadi';
    end if;
  end if;

  -- Acik hesap ara
  if p_table_id is not null and not v_shared then
    select o.id into v_order_id
      from public.orders o
     where o.table_id = p_table_id
       and o.status in ('open', 'sent', 'preparing', 'ready')
       and o.created_at > now() - interval '12 hours'
     order by o.created_at desc
     limit 1
     for update of o skip locked;
  elsif v_customer_id is not null then
    select o.id into v_order_id
      from public.orders o
     where o.customer_id = v_customer_id
       and o.status in ('open', 'sent', 'preparing', 'ready')
       and o.created_at > now() - interval '12 hours'
       and (p_table_id is null or o.table_id is not distinct from p_table_id)
       and (p_origin_store_id is null or o.origin_store_id is not distinct from p_origin_store_id)
     order by o.created_at desc
     limit 1
     for update of o skip locked;
  end if;

  if v_order_id is null then
    v_order_id := gen_random_uuid();
    insert into public.orders (
      id, table_id, customer_name, customer_id,
      subtotal, total, status, note, use_points, origin_store_id
    ) values (
      v_order_id, p_table_id, v_name, v_customer_id,
      0, 0, 'open', v_note, coalesce(p_use_points, false), p_origin_store_id
    );
    v_appended := false;
  else
    v_appended := true;
  end if;

  insert into public.order_items (
    order_id, product_id, product_name, product_price, final_price,
    quantity, kitchen_status, sent_to_kitchen, kitchen_destination_store_id,
    notes, selected_options, store_id, is_takeaway
  )
  select
    v_order_id,
    nullif(e->>'product_id', '')::uuid,
    coalesce(nullif(e->>'product_name', ''), 'Urun'),
    coalesce(nullif(e->>'product_price', '')::numeric, 0),
    coalesce(nullif(e->>'final_price', '')::numeric, 0),
    greatest(1, coalesce(nullif(e->>'quantity', '')::int, 1)),
    'pending',
    coalesce((e->>'sent_to_kitchen')::boolean, true),
    nullif(e->>'kitchen_destination_store_id', '')::uuid,
    nullif(e->>'notes', ''),
    case when e ? 'selected_options' then e->'selected_options' else null end,
    nullif(e->>'store_id', '')::uuid,
    coalesce((e->>'is_takeaway')::boolean, false)
  from jsonb_array_elements(p_items) e;

  if exists (select 1 from public.order_items where order_id = v_order_id and product_id is null) then
    raise exception 'sepet: urun id zorunlu';
  end if;

  select coalesce(sum(
    case when coalesce(oi.is_treat, false) then 0
         else (coalesce(oi.final_price, 0) * coalesce(oi.quantity, 1)
               - coalesce(oi.manual_discount, 0))
    end
  ), 0) into v_sum
  from public.order_items oi where oi.order_id = v_order_id;

  update public.orders o set
    subtotal = v_sum,
    total = greatest(0, v_sum - coalesce(o.discount_amount, 0)),
    customer_id = coalesce(o.customer_id, v_customer_id),
    customer_name = case
      when nullif(trim(coalesce(o.customer_name, '')), '') is not null then o.customer_name
      else v_name
    end,
    use_points = coalesce(o.use_points, false) or coalesce(p_use_points, false),
    note = case
      when v_note is null then o.note
      when nullif(trim(coalesce(o.note, '')), '') is null then v_note
      when position(v_note in o.note) > 0 then o.note
      else o.note || E'\n' || v_note
    end
  where o.id = v_order_id;

  return jsonb_build_object(
    'order_id', v_order_id,
    'appended', v_appended,
    'total', v_sum
  );
end;
$$;

comment on function public.musteri_sepet_gonder(jsonb, uuid, text, uuid, text, boolean, uuid) is
  'QR musteri sepeti: normal masada / ayni uyede acik hesaba ekler, yoksa yeni acar.';

grant execute on function public.musteri_sepet_gonder(jsonb, uuid, text, uuid, text, boolean, uuid)
  to anon, authenticated;
