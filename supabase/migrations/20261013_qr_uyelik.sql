-- QR siparisini uyelige bagla + "Odendi" durumu (musteri onerisi 1 ve 2,
-- sahip onayi 13.10).
--
-- Olcum (30 gun): 40 misafir QR hesabi ₺24.030 tuttu; bu hesaplardan 1.193
-- puan kimseye yazilmadi. 61 QR hesabinin 43'u odendikten sonra bile musteri
-- ekraninda "Hazirlaniyor" yaziyordu (ekran odeme durumunu okumuyordu).
--
-- 1. order_public_status: ayni imza, ek alanlar — total, uye (hesap bir uyeye
--    bagli mi), puan (odenmis uye hesabinin kazandirdigi puan), sahiplenebilir.
--    Misafir siparis tablosunu okuyamaz; ekran durumu buradan sorar.
-- 2. nip_qr_siparis_sahiplen(siparis): giris yapan musteri, kendi QR
--    siparisini uyeligine baglar. Kosullar: guncel KVKK onayi var; siparis
--    acik, uyesiz, 12 saatten yeni; en az bir kalemi QR'dan (added_by bos).
--    Puan odeme aninda fn_award_member_points ile yazilir (20 TL = 1 puan).
--
-- KVKK: guncel metin (2026-10-11) madde 7 "siparis gecmisinizin uyelik
-- profilinize baglanmasi"ni kapsiyor. Yeni surum gerekmez; fonksiyon guncel
-- surumu onaylamamis uyeyi reddeder.
--
-- Hicbir nesne silinmez. order_public_status ayni imzayla create or replace.

-- 1 ---------------------------------------------------------------------------
create or replace function public.order_public_status(p_order_id uuid)
returns jsonb
language sql
stable security definer
set search_path to 'public'
as $function$
  select jsonb_build_object(
    'status',     o.status,
    'item_count', (select count(*) from public.order_items where order_id = o.id),
    'any_ready',  (select coalesce(bool_or(kitchen_status in ('ready','served')), false)
                     from public.order_items where order_id = o.id),
    'all_served', (select coalesce(bool_and(kitchen_status = 'served'), false)
                     from public.order_items where order_id = o.id),
    'total',      coalesce(o.total, 0),
    'uye',        o.customer_id is not null,
    -- fn_award_member_points ile ayni hesap: harcanan puan ve borc dusulur.
    'puan',       case when o.customer_id is not null and o.status::text = 'paid' then
                    greatest(0, floor((coalesce(o.total, 0) - coalesce(o.points_used, 0)
                      - coalesce((select sum(p.amount) from public.payments p
                                   where p.order_id = o.id and p.method::text = 'debt'), 0)) / 20))
                  end,
    'sahiplenebilir', o.customer_id is null
                      and o.status::text in ('open', 'sent', 'preparing', 'ready')
                      and o.created_at > now() - interval '12 hours'
  )
  from public.orders o where o.id = p_order_id
$function$;

-- 2 ---------------------------------------------------------------------------
create or replace function public.nip_qr_siparis_sahiplen(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_musteri record;
  v_guncel  text;
  o         record;
begin
  select c.id, c.kvkk_version into v_musteri
    from public.customers c where c.auth_user_id = (select auth.uid())
   limit 1;
  if not found then raise exception 'sahiplen: once uye girisi yap'; end if;

  select d.version into v_guncel from public.kvkk_documents d where d.is_current limit 1;
  if v_guncel is not null and v_musteri.kvkk_version is distinct from v_guncel then
    raise exception 'sahiplen: once guncel aydinlatma metnini onayla';
  end if;

  select * into o from public.orders where id = p_order_id for update;
  if not found then raise exception 'sahiplen: siparis bulunamadi'; end if;
  if o.customer_id = v_musteri.id then
    return jsonb_build_object('ok', true, 'zaten', true,
                              'puan', floor(coalesce(o.total, 0) / 20));
  end if;
  if o.customer_id is not null then
    raise exception 'sahiplen: siparis baska bir uyeye bagli';
  end if;
  if o.status::text not in ('open', 'sent', 'preparing', 'ready') then
    raise exception 'sahiplen: siparis kapanmis';
  end if;
  if o.created_at < now() - interval '12 hours' then
    raise exception 'sahiplen: siparis cok eski';
  end if;
  if not exists (select 1 from public.order_items oi
                  where oi.order_id = o.id and oi.added_by is null) then
    raise exception 'sahiplen: bu hesap QR ile acilmamis — kasada uye adini soyle';
  end if;

  update public.orders set customer_id = v_musteri.id where id = o.id;

  return jsonb_build_object('ok', true, 'zaten', false,
                            'puan', floor(coalesce(o.total, 0) / 20));
end $function$;

comment on function public.nip_qr_siparis_sahiplen(uuid) is
  'Giris yapan musteri kendi QR siparisini uyeligine baglar; puan odeme aninda '
  'yazilir. Guncel KVKK onayi sart (20261013_qr_uyelik).';

revoke execute on function public.nip_qr_siparis_sahiplen(uuid) from public, anon;
grant execute on function public.nip_qr_siparis_sahiplen(uuid) to authenticated;
