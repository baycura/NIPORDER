-- ============================================================================
-- HEDEF PROJE HAZIRLIGI — YENI (bos) Supabase projesinde calisir
-- ============================================================================
-- Kaynak (Order) pg_net ile bu projeye HTTPS uzerinden DDL gonderecek
-- (sema_gonder.sql). Alici uc: PostgREST'ten cagrilan tek fonksiyon. Sir
-- olmadan calismaz; is bitince 04_temizlik.sql ile silinir.
--
-- Once: <SIR> yerine rastgele uzun bir deger yaz (ayni deger gonderene de
-- verilir). Sonra bu dosyayi SQL editorunden (postgres rolu) calistir.
-- ============================================================================

create table if not exists public.nip_kurulum_sir (sir text not null);
alter table public.nip_kurulum_sir enable row level security;   -- politika yok: yalniz sahibi okur
revoke all on public.nip_kurulum_sir from anon, authenticated;
delete from public.nip_kurulum_sir;
insert into public.nip_kurulum_sir(sir) values ('<SIR>');

create or replace function public.nip_kurulum_calistir(p_sir text, p_sql text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare v_sir text;
begin
  select sir into v_sir from public.nip_kurulum_sir limit 1;
  if v_sir is null or p_sir is null or length(p_sir) <> length(v_sir) or p_sir <> v_sir then
    raise exception 'yetkisiz' using errcode = '28000';
  end if;
  execute 'set local check_function_bodies = off; ' || p_sql;
  return 'ok';
end $$;
revoke all on function public.nip_kurulum_calistir(text, text) from public;
grant execute on function public.nip_kurulum_calistir(text, text) to anon;

-- anon'un 3 sn'lik sorgu siniri buyuk parcalar icin yetmez; gecici olarak ac.
alter role anon set statement_timeout = '120s';
notify pgrst, 'reload config';
notify pgrst, 'reload schema';
