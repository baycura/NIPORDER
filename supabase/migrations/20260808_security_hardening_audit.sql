-- GUVENLIK SIKILASTIRMA (denetim bulgularina gore)

-- 1) KRITIK: personel olusturma RPC'sine yetki kontrolu (eskiden HICBIR kontrol yoktu)
create or replace function public.admin_create_staff_with_auth(p_email text, p_password text, p_name text, p_role text)
returns table(staff_id uuid, auth_user_id uuid)
language plpgsql security definer
set search_path to 'public', 'auth', 'extensions'
as $function$
declare
  v_user_id uuid;
  v_staff_id uuid;
  v_existing_staff_id uuid;
  v_caller_role text;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select role::text into v_caller_role from staff where auth_id = auth.uid() and is_active = true;
  if v_caller_role is null or v_caller_role not in ('admin','manager','owner') then
    raise exception 'yetkisiz: sadece yonetici personel olusturabilir';
  end if;
  if p_role in ('admin','owner','super_admin') and v_caller_role <> 'admin' then
    raise exception 'yetkisiz: admin hesabini sadece admin olusturabilir';
  end if;

  select id into v_existing_staff_id from staff where email = p_email limit 1;
  if v_existing_staff_id is not null then
    raise exception 'Bu e-posta ile zaten personel kayitli: %', p_email;
  end if;

  select id into v_user_id from auth.users where email = p_email limit 1;
  if v_user_id is null then
    v_user_id := gen_random_uuid();
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
    ) values (
      '00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated', 'authenticated',
      p_email, crypt(p_password, gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
      now(), now(), '', '', '', ''
    );
  else
    update auth.users set encrypted_password = crypt(p_password, gen_salt('bf')), updated_at = now()
    where id = v_user_id;
  end if;

  insert into staff (id, email, name, role, auth_id)
  values (gen_random_uuid(), p_email, p_name, p_role::staff_role, v_user_id)
  returning id into v_staff_id;

  return query select v_staff_id, v_user_id;
end;
$function$;
revoke execute on function public.admin_create_staff_with_auth(text,text,text,text) from anon;

-- 2) Sifre sifirlama: admin rolu de yetkili olsun (eskiden sadece manager/owner idi)
create or replace function public.admin_set_user_password(p_email text, p_new_password text)
returns text
language plpgsql security definer
set search_path to 'public', 'auth', 'extensions'
as $function$
declare
  v_user_id uuid;
  v_caller_ok boolean;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select (role in ('admin','manager','owner') and is_active = true) into v_caller_ok from staff where auth_id = auth.uid();
  if coalesce(v_caller_ok, false) = false then
    raise exception 'yetkisiz: sadece yonetici sifre sifirlayabilir';
  end if;
  select id into v_user_id from auth.users where email = p_email;
  if v_user_id is null then raise exception 'user not found: %', p_email; end if;
  update auth.users
  set encrypted_password = crypt(p_new_password, gen_salt('bf')),
      email_confirmed_at = coalesce(email_confirmed_at, now()),
      updated_at = now()
  where id = v_user_id;
  return 'ok';
end;
$function$;
revoke execute on function public.admin_set_user_password(text,text) from anon;

-- 3) is_staff: pasif personel staff sayilmasin
create or replace function public.is_staff()
returns boolean language sql stable security definer
set search_path = public
as $function$
  select exists (select 1 from staff where auth_id = auth.uid() and is_active = true);
$function$;

-- 4) Telegram ic fonksiyonlari API'den cagirilamasin (spam onlemi)
revoke execute on function public.tg_call(jsonb) from anon, authenticated;
revoke execute on function public.tg_notify(text, uuid) from anon, authenticated;
revoke execute on function public.trg_item_ready() from anon, authenticated;
revoke execute on function public.trg_item_sent_to_kitchen() from anon, authenticated;
revoke execute on function public.trg_items_ready() from anon, authenticated;
revoke execute on function public.trg_items_sent_ins() from anon, authenticated;
revoke execute on function public.trg_items_sent_upd() from anon, authenticated;

-- 5) SECURITY DEFINER view'lar -> invoker (RLS cagirana gore uygulanir)
alter view public.active_happy_hour set (security_invoker = true);
alter view public.table_summary set (security_invoker = true);
alter view public.stock_alerts set (security_invoker = true);
alter view public.inter_company_settlement set (security_invoker = true);

-- 6) search_path sabitleme (lint uyarilari)
alter function public.is_admin() set search_path = public;
alter function public.is_manager_or_admin() set search_path = public;
alter function public.user_role() set search_path = public;
alter function public.user_store_ids() set search_path = public;
alter function public.get_active_happy_hour() set search_path = public;
alter function public.fn_decrement_stock_from_recipe() set search_path = public;

-- 7) Storage: RLS acik ama POLITIKA YOKTU -> uygulamadan foto yukleme kirikti; duzelt
drop policy if exists "nip read storage" on storage.objects;
create policy "nip read storage" on storage.objects for select to anon, authenticated
  using (bucket_id = 'product-images' or (bucket_id = 'invoices' and public.is_staff()));
drop policy if exists "nip staff insert storage" on storage.objects;
create policy "nip staff insert storage" on storage.objects for insert to authenticated
  with check (bucket_id in ('product-images','invoices') and public.is_staff());
drop policy if exists "nip staff update storage" on storage.objects;
create policy "nip staff update storage" on storage.objects for update to authenticated
  using (bucket_id in ('product-images','invoices') and public.is_staff())
  with check (bucket_id in ('product-images','invoices') and public.is_staff());
drop policy if exists "nip staff delete storage" on storage.objects;
create policy "nip staff delete storage" on storage.objects for delete to authenticated
  using (bucket_id in ('product-images','invoices') and public.is_staff());