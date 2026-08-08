-- Yeni roller: viewer (gozlemci — sadece goruntuleme) + parttime (siparis+kasa)
-- Uygulandi: 2026-08-07 (Supabase migration: staff_role_viewer_parttime)
alter type staff_role add value if not exists 'viewer';
alter type staff_role add value if not exists 'parttime';
