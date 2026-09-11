-- ============================================================================
-- TEMIZLIK — sema aktarimi bitince
-- ============================================================================

-- Hedef projede: alici uc ve sir silinir, anon siniri eski degerine doner.
drop function if exists public.nip_kurulum_calistir(text, text);
drop table if exists public.nip_kurulum_sir;
alter role anon set statement_timeout = '3s';
notify pgrst, 'reload config';
notify pgrst, 'reload schema';

-- Kaynak projede (Order): uretici ve gonderim kayitlari
-- drop schema kurulum cascade;
