-- QR menu vitrin (urun hikayeleri) + mini blog (haber/Fethiye tavsiyeleri)
-- Uygulandi: 2026-08-08 (Supabase migration: posts_vitrin_blog)
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('urun','blog')),
  title text not null,
  body text,
  images jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_posts_kind on public.posts(kind, is_active, sort_order);
alter table public.posts enable row level security;
create policy anyone_read_posts on public.posts for select to anon, authenticated using (true);
create policy staff_insert_posts on public.posts for insert to authenticated with check (is_staff());
create policy staff_update_posts on public.posts for update to authenticated using (is_staff()) with check (is_staff());
create policy staff_delete_posts on public.posts for delete to authenticated using (is_staff());
