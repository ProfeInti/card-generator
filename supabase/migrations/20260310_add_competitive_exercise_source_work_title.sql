-- Store optional original source/book title separately from the generated exercise title
-- Date: 2026-03-10

alter table public.competitive_exercises
  add column if not exists source_work_title text;
