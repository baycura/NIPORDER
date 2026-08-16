-- Musteri oylamalari (Vote sekmesi): kisa, surekli degisen sorular.
--   * Secmeli: "Yarin hangi cekirdekten filtre demleyelim?"
--   * Serbest cevapli: "Burada hangi DJ'i dinlemek isterdin?"
-- Misafir de oy verir: kimlik yerine telefonda saklanan voter_key kullanilir.
--
-- Gizlilik: musteri tarafi yalniz TOPLU sonuclari gorur (poll_results RPC).
-- Serbest metin cevaplarini ve tekil oylari yalniz personel okuyabilir.

create table if not exists public.polls (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  question text not null,
  question_en text,
  question_ru text,
  -- [{ "id": "a", "tr": "...", "en": "...", "ru": "..." }]
  options jsonb not null default '[]'::jsonb,
  allow_free_text boolean not null default false,
  is_active boolean not null default true,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.poll_votes (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls(id) on delete cascade,
  option_id text,
  free_text text,
  voter_key text not null,
  customer_id uuid references public.customers(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (poll_id, voter_key)
);

create index if not exists poll_votes_poll_idx on public.poll_votes (poll_id);
create index if not exists polls_store_active_idx on public.polls (store_id, is_active);

alter table public.polls enable row level security;
alter table public.poll_votes enable row level security;

drop policy if exists anyone_read_polls on public.polls;
create policy anyone_read_polls on public.polls for select to anon, authenticated using (true);

drop policy if exists staff_write_polls on public.polls;
create policy staff_write_polls on public.polls for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

drop policy if exists staff_read_votes on public.poll_votes;
create policy staff_read_votes on public.poll_votes for select to authenticated using (public.is_staff());

drop policy if exists staff_delete_votes on public.poll_votes;
create policy staff_delete_votes on public.poll_votes for delete to authenticated using (public.is_staff());

-- Oy verme: dogrulama sunucuda. Ayni voter_key ikinci kez oy verirse fikrini
-- degistirmis sayilir (kayit guncellenir), boylece cift oy olusmaz.
create or replace function public.poll_vote(
  p_poll_id uuid, p_option_id text, p_free_text text, p_voter_key text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_poll public.polls; v_txt text;
begin
  if p_voter_key is null or length(p_voter_key) < 8 then
    return jsonb_build_object('error', 'gecersiz oturum');
  end if;

  select * into v_poll from public.polls where id = p_poll_id;
  if not found or not v_poll.is_active
     or v_poll.starts_at > now()
     or (v_poll.ends_at is not null and v_poll.ends_at < now()) then
    return jsonb_build_object('error', 'bu oylama kapali');
  end if;

  v_txt := nullif(btrim(coalesce(p_free_text, '')), '');
  if v_txt is not null then
    if not v_poll.allow_free_text then
      return jsonb_build_object('error', 'bu soruda serbest cevap yok');
    end if;
    v_txt := left(v_txt, 140);
  elsif p_option_id is null
     or not exists (select 1 from jsonb_array_elements(v_poll.options) o where o->>'id' = p_option_id) then
    return jsonb_build_object('error', 'gecersiz secenek');
  end if;

  insert into public.poll_votes (poll_id, option_id, free_text, voter_key, customer_id)
  values (p_poll_id, case when v_txt is null then p_option_id end, v_txt, p_voter_key,
          (select id from public.customers where auth_user_id = auth.uid()))
  on conflict (poll_id, voter_key) do update
    set option_id = excluded.option_id, free_text = excluded.free_text, created_at = now();

  return jsonb_build_object('ok', true);
end $$;

create or replace function public.poll_results(p_poll_id uuid)
returns jsonb language sql security definer set search_path = public as $$
  select jsonb_build_object(
    'total', (select count(*) from public.poll_votes where poll_id = p_poll_id),
    'counts', coalesce((
      select jsonb_object_agg(option_id, n) from (
        select option_id, count(*) as n from public.poll_votes
        where poll_id = p_poll_id and option_id is not null group by option_id
      ) t), '{}'::jsonb),
    'free_count', (select count(*) from public.poll_votes where poll_id = p_poll_id and free_text is not null)
  );
$$;

create or replace function public.poll_my_vote(p_poll_id uuid, p_voter_key text)
returns jsonb language sql security definer set search_path = public as $$
  select coalesce((select jsonb_build_object('option_id', option_id, 'free_text', free_text)
                   from public.poll_votes where poll_id = p_poll_id and voter_key = p_voter_key), '{}'::jsonb);
$$;

revoke all on function public.poll_vote(uuid, text, text, text) from public;
revoke all on function public.poll_results(uuid) from public;
revoke all on function public.poll_my_vote(uuid, text) from public;
grant execute on function public.poll_vote(uuid, text, text, text) to anon, authenticated;
grant execute on function public.poll_results(uuid) to anon, authenticated;
grant execute on function public.poll_my_vote(uuid, text) to anon, authenticated;
