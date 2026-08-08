-- Ucuncu dil: Rusca (musteri menusu TR/EN/RU)
-- Uygulandi: 2026-08-08 (Supabase migration: russian_language_fields)
alter table public.products add column if not exists name_ru text;
alter table public.products add column if not exists description_ru text;
alter table public.categories add column if not exists name_ru text;
alter table public.posts add column if not exists title_en text;
alter table public.posts add column if not exists body_en text;
alter table public.posts add column if not exists title_ru text;
alter table public.posts add column if not exists body_ru text;
