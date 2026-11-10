-- ============================================================================
-- KONSINYE HESAPLARI E-POSTA (AYLIK, OTOMATIK)               20261101_konsinye_mail
-- ============================================================================
-- Sahip (1.11): "Her ayin 1'i sabahi excel raporlarini cerenbaycura@gmail
-- adresine otomatik gonderebilir misin."
--
-- Her ayin 1'inde 04:45 Istanbul (kesimden 30 dk sonra) edge fonksiyonu
-- konsinye-mail cagrilir: gecen ayin konsinye_hesaplar satirlarindan tedarikci
-- basina Excel uretir, hepsini tek e-postayla alicilara gonderir.
-- Saglayici anahtari (BREVO_API_KEY ya da RESEND_API_KEY, MAIL_FROM) edge
-- fonksiyonu gizli degiskenlerinde; veritabaninda sir yok.
--
-- Alicilar ve son gonderim sonucu konsinye_mail tablosunda (magaza basina bir
-- satir). app_settings KULLANILMADI: o tablo anon'a acik okunur, e-posta adresi
-- herkese gorunurdu. konsinye_mail'i yalniz personel okur; yazma service_role
-- (edge fonksiyonu) ile. Hicbir nesne kaldirilmaz.
-- ============================================================================

create table if not exists public.konsinye_mail (
  store_id   uuid primary key references public.stores(id),
  alicilar   jsonb not null default '[]'::jsonb,   -- ["adres", ...]
  son        jsonb,                                -- {at, donem, ok, mesaj, alicilar, dosyalar, kaynak}
  updated_at timestamptz not null default now()
);
comment on table public.konsinye_mail is
  'Konsinye aylik e-posta: alicilar ve son gonderim sonucu. 20261101_konsinye_mail.';

alter table public.konsinye_mail enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'konsinye_mail' and policyname = 'konsinye_mail_personel_okur') then
    create policy konsinye_mail_personel_okur on public.konsinye_mail
      for select to authenticated
      using (public.is_staff() and store_id = any(public.user_store_ids()));
  end if;
end $$;

insert into public.konsinye_mail (store_id, alicilar)
values ('c3c6e0c7-1821-4edd-993d-ad960cfbc452', '["cerenbaycura@gmail.com"]'::jsonb)
on conflict (store_id) do nothing;

-- ----------------------------------------------------------------------------
-- Edge fonksiyonunu cagir (pg_net, asenkron). eur-rate-daily ile ayni kalip:
-- x-nip-cron basligi = bot_config.webhook_secret (yalniz okunur).
-- p_donem: 'YYYY-MM' ya da null (gecen ay).
-- ----------------------------------------------------------------------------
create or replace function public.nip_konsinye_mail_gonder(p_donem text default null)
returns bigint
language plpgsql
security definer
set search_path to 'public'
as $$
declare sec text; v_id bigint;
begin
  select value into sec from public.bot_config where key = 'webhook_secret';
  if sec is null then return null; end if;
  select net.http_post(
    url := 'https://gbbxxcduuwdmvfayxzeg.supabase.co/functions/v1/konsinye-mail',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-nip-cron', sec),
    body := jsonb_strip_nulls(jsonb_build_object('donem', p_donem, 'kaynak', 'cron')),
    timeout_milliseconds := 60000) into v_id;
  return v_id;
exception when others then return null;
end $$;
revoke all on function public.nip_konsinye_mail_gonder(text) from anon, authenticated, public;

-- Her ayin 1'i 01:45 UTC = 04:45 Istanbul (kesim 04:15'te; nip-konsinye-aylik).
select cron.unschedule(jobid) from cron.job where jobname = 'nip-konsinye-mail';
select cron.schedule('nip-konsinye-mail', '45 1 1 * *', $$select public.nip_konsinye_mail_gonder()$$);
