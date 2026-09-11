-- ============================================================================
-- TOHUM VERI — hedef projede, temel profilden sonra
-- ============================================================================
-- Doldurulacaklar: <STORE_ID> (isletme/<slug>/vite.config.js VITE_STORE_ID ile
-- AYNI), <SLUG>, <ISLETME_ADI>, <ADMIN_EPOSTA>, <ADMIN_AD>, <GECICI_SIFRE>.
-- Sifre ilk giriste Personel sayfasindan degistirilir.
-- ============================================================================

-- 1) Magaza
insert into public.stores (id, name, slug)
values ('<STORE_ID>', '<ISLETME_ADI>', '<SLUG>')
on conflict (id) do update set name = excluded.name, slug = excluded.slug;

-- 2) Sahip hesabi (auth.users + staff). admin_create_staff_with_auth ile ayni
--    adimlar; o fonksiyon oturum ister, ilk hesabi acan yok, o yuzden elle.
do $$
declare v_user uuid; v_staff uuid;
begin
  select id into v_user from auth.users where email = '<ADMIN_EPOSTA>' limit 1;
  if v_user is null then
    v_user := gen_random_uuid();
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
    ) values (
      '00000000-0000-0000-0000-000000000000', v_user, 'authenticated', 'authenticated',
      '<ADMIN_EPOSTA>', extensions.crypt('<GECICI_SIFRE>', extensions.gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
      now(), now(), '', '', '', ''
    );
    insert into auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at, last_sign_in_at)
    values (gen_random_uuid(), v_user, v_user::text, 'email',
            jsonb_build_object('sub', v_user::text, 'email', '<ADMIN_EPOSTA>', 'email_verified', true),
            now(), now(), now());
  end if;
  select id into v_staff from public.staff where auth_id = v_user;
  if v_staff is null then
    insert into public.staff (id, email, name, role, auth_id, is_active)
    values (gen_random_uuid(), '<ADMIN_EPOSTA>', '<ADMIN_AD>', 'admin', v_user, true)
    returning id into v_staff;
  end if;
  -- Magaza baglantisi: staff.store_ids (uygulama ilk magazayi okur)
  update public.staff set store_ids = array['<STORE_ID>'::uuid] where id = v_staff;
end $$;

-- 3) Ayarlar (Order'daki anahtarlar, bu isletme icin kapali/varsayilan)
insert into public.app_settings (key, value, store_id) values
  ('announcement_enabled', 'false'::jsonb, '<STORE_ID>'),
  ('announcement_tr', '""'::jsonb, '<STORE_ID>'),
  ('announcement_en', '""'::jsonb, '<STORE_ID>'),
  ('announcement_ru', '""'::jsonb, '<STORE_ID>'),
  ('house_pour_cl', '4'::jsonb, '<STORE_ID>'),
  ('member_discount_enabled', 'false'::jsonb, '<STORE_ID>'),
  ('member_discount_pct', '0'::jsonb, '<STORE_ID>'),
  ('online_payment_enabled', 'false'::jsonb, '<STORE_ID>'),
  ('party_mode_enabled', 'false'::jsonb, '<STORE_ID>'),
  ('party_days', '[]'::jsonb, '<STORE_ID>'),
  ('eur_rate_auto', '"false"'::jsonb, '<STORE_ID>')
on conflict (key, store_id) do nothing;

-- 4) Ornek masa: QR menu ve kasa ilk acilista bos kalmasin
insert into public.cafe_tables (store_id, name, qr_token)
select '<STORE_ID>', 'Masa 1', encode(extensions.gen_random_bytes(8), 'hex')
where not exists (select 1 from public.cafe_tables where store_id = '<STORE_ID>');
