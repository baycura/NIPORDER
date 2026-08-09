-- Guvenlik sertlestirmesi: dogrudan cagrilabilen bildirim fonksiyonlari ve
-- yonetici sifre sifirlamada yetki yukseltme yolu.
--
-- BULGU 1 — tg_call / wp_call / tg_notify anon rolune acikti.
--   Bunlar SECURITY DEFINER ve bot_config'ten webhook secret'i okuyup Telegram
--   ya da web-push fonksiyonuna ISTEDIGI icerigi POST ediyor. anon anahtari
--   yayinlanan JS paketinin icinde oldugu icin internetteki herhangi biri
--   /rest/v1/rpc/tg_call cagirip personelin telefonuna mesaj gonderebilirdi.
--   Bu fonksiyonlar zaten yalniz trigger'lar (SECURITY DEFINER, owner olarak
--   calisir) tarafindan cagriliyor; disariya acik olmalari gereksiz.
--
-- BULGU 2 — admin_set_user_password hedefi kontrol etmiyordu.
--   Cagiran 'manager' olabiliyordu ve HERHANGI bir kullanicinin, admin dahil,
--   sifresini degistirebiliyordu. Yani bir mudur admin hesabini ele gecirebilirdi.
--   Artik admin/owner hesaplarinin sifresini yalniz admin degistirebilir.

-- --- 1) Bildirim RPC'lerini disariya kapat ---
revoke all on function public.tg_call(jsonb)         from anon, authenticated;
revoke all on function public.wp_call(jsonb)         from anon, authenticated;
revoke all on function public.tg_notify(text, uuid)  from anon, authenticated;

-- Trigger fonksiyonlari RPC olarak cagrilmamali. Trigger tetiklenmesi EXECUTE
-- yetkisi gerektirmez, dolayisiyla siparis akisi etkilenmez.
revoke all on function public.trg_item_ready()            from anon, authenticated;
revoke all on function public.trg_item_sent_to_kitchen()  from anon, authenticated;
revoke all on function public.trg_items_ready()           from anon, authenticated;
revoke all on function public.trg_items_ready_push()      from anon, authenticated;
revoke all on function public.trg_items_sent_ins()        from anon, authenticated;
revoke all on function public.trg_items_sent_upd()        from anon, authenticated;
revoke all on function public.fn_award_member_points()    from anon, authenticated;
revoke all on function public.fn_decrement_retail_stock() from anon, authenticated;

-- NOT: is_staff / is_admin / is_manager_or_admin / user_role / user_store_ids
-- bilerek acik birakildi — RLS policy'leri bunlari cagiran rolun kendisiyle
-- degerlendiriyor; EXECUTE kaldirilirsa tum RLS coker.
-- fn_is_party_now da acik kaliyor: stok trigger'i (SECURITY DEFINER degil)
-- cagiran kullanicinin yetkisiyle calisiyor. Ikisi de yalnizca "ben personel
-- miyim / su an parti mi" gibi zararsiz bilgi donuyor.

-- --- 2) Sifre sifirlamada yetki yukseltmeyi kapat ---
create or replace function public.admin_set_user_password(p_email text, p_new_password text)
returns text
language plpgsql
security definer
set search_path to 'public', 'auth', 'extensions'
as $function$
declare
  v_user_id uuid;
  v_caller_role text;
  v_target_role text;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;

  select role::text into v_caller_role
  from staff where auth_id = auth.uid() and is_active = true;

  if v_caller_role is null or v_caller_role not in ('admin','manager','owner') then
    raise exception 'yetkisiz: sadece yonetici sifre sifirlayabilir';
  end if;

  select id into v_user_id from auth.users where email = p_email;
  if v_user_id is null then raise exception 'user not found: %', p_email; end if;

  -- Hedef admin/owner ise yalniz admin degistirebilir (mudur admini ele geciremez)
  select role::text into v_target_role from staff where auth_id = v_user_id limit 1;
  if v_target_role in ('admin','owner','super_admin') and v_caller_role <> 'admin' then
    raise exception 'yetkisiz: admin hesabinin sifresini sadece admin degistirebilir';
  end if;

  update auth.users
  set encrypted_password = crypt(p_new_password, gen_salt('bf')),
      email_confirmed_at = coalesce(email_confirmed_at, now()),
      updated_at = now()
  where id = v_user_id;
  return 'ok';
end;
$function$;

revoke all on function public.admin_set_user_password(text, text) from anon;
