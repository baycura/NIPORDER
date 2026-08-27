-- ============================================================================
-- DIS MESAJ FONKSIYONLARI KILITLENDI       20260828_mesaj_fonksiyonlari_kilit
-- ============================================================================
-- Supabase guvenlik taramasi bulgusu: tg_call(payload) ve wp_call(payload)
-- SECURITY DEFINER ve ANON dahil herkes /rest/v1/rpc uzerinden cagirabiliyordu
-- — iclerinde hicbir kimlik kontrolu yok, dogrudan Telegram/web-push edge
-- function'ina istedigi payload'i POST ettiriyorlar. Giris yapmamis biri
-- personelin telefonuna sahte "siparis" mesaji attirabilir ya da bildirim
-- spam'i yapabilirdi. tg_notify(event, ord) ayni sekilde acikti.
--
-- Kirilma riski YOK, uc yonden kanitli:
--   1. Frontend'de rpc("tg_call") / rpc("wp_call") / rpc("tg_notify") cagrisi
--      hic yok (grep ile dogrulandi).
--   2. Bu fonksiyonlari cagiran her sey (trg_items_sent_ins/upd,
--      trg_items_ready, trg_items_ready_push, trg_item_ready,
--      trg_item_sent_to_kitchen, nip_haftalik_denetim_gonder...) SECURITY
--      DEFINER — icten cagrilar fonksiyon SAHIBININ (postgres) yetkisiyle
--      degerlendirilir, istemci grant'ine bakilmaz.
--   3. service_role'un yetkisine dokunulmuyor (edge function'lar etkilenmez).
--
-- is_staff/is_admin/user_store_ids gibi RLS'in ictigi yardimcilara BILEREK
-- dokunulmadi: onlar politika degerlendirmesinde istemci rolu baglaminda
-- cagrilir, revoke tum RLS'i kirardi.
--
-- Geri alma:
--   grant execute on function public.tg_call(jsonb) to anon, authenticated;
--   grant execute on function public.wp_call(jsonb) to anon, authenticated;
--   grant execute on function public.tg_notify(text, uuid) to anon, authenticated;
-- ============================================================================

revoke all on function public.tg_call(jsonb)         from anon, authenticated, public;
revoke all on function public.wp_call(jsonb)         from anon, authenticated, public;
revoke all on function public.tg_notify(text, uuid)  from anon, authenticated, public;
