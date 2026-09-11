-- ============================================================================
-- SEMA GONDERICI — kaynak projede (Order) calisir, kurulum.sema'daki DDL'i
-- hedef projeye pg_net ile gonderir. sema_uretici.sql'den sonra.
-- ============================================================================
-- Kullanim:
--   select kurulum.uret();
--   select kurulum.gonder('https://HEDEF.supabase.co', '<hedef anon>', '<SIR>',
--          array['00_baslik','01_uzanti','02_tip','03_sekans','03b_fonksiyon']);
--   select * from kurulum.sonuc();        -- 200 + 'ok' gorunce sonraki grup
--   select kurulum.gonder(..., array['04_tablo','05_kisit','06_fonksiyon','07_gorunum','08_fk','09_indeks','10_tetikleyici']);
--   select * from kurulum.sonuc();
--   select kurulum.gonder(..., array['11_rls','12_yetki','13_yorum','14_yayin','15_depolama']);
--   select * from kurulum.sonuc();
-- Gruplar SIRAYLA gonderilir: pg_net asenkron, bir grup bitmeden digerini
-- yollama (tablo olmadan politika yazilmaz).
-- ============================================================================

create table if not exists kurulum.gonderim (
  id         serial primary key,
  bolumler   text[] not null,
  request_id bigint not null,
  at         timestamptz not null default now()
);

create or replace function kurulum.gonder(p_hedef_url text, p_anon text, p_sir text, p_bolumler text[])
returns bigint
language plpgsql
as $$
declare
  v_sql text;
  v_id  bigint;
begin
  select string_agg(s.sql, E'\n\n' order by s.sira) into v_sql
    from kurulum.sema s
   where s.bolum = any (p_bolumler);
  if v_sql is null then
    raise exception 'bolum bulunamadi: %', p_bolumler;
  end if;
  select net.http_post(
    url := rtrim(p_hedef_url, '/') || '/rest/v1/rpc/nip_kurulum_calistir',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', p_anon,
      'Authorization', 'Bearer ' || p_anon),
    body := jsonb_build_object('p_sir', p_sir, 'p_sql', v_sql),
    timeout_milliseconds := 150000
  ) into v_id;
  insert into kurulum.gonderim(bolumler, request_id) values (p_bolumler, v_id);
  return v_id;
end $$;

-- Son gonderimlerin sonucu: status_code 200 ve cevap "ok" beklenir.
create or replace function kurulum.sonuc()
returns table(id int, bolumler text[], request_id bigint, status_code int, cevap text, at timestamptz)
language sql
as $$
  select g.id, g.bolumler, g.request_id, r.status_code,
         left(coalesce(r.content, r.error_msg, '(henuz cevap yok)'), 600), g.at
    from kurulum.gonderim g
    left join net._http_response r on r.id = g.request_id
   order by g.id;
$$;
