-- Competitive exercises baseline entity
-- Date: 2026-03-07

create extension if not exists pgcrypto;

create table if not exists public.competitive_exercises (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users (id) on delete cascade,
  reviewed_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  status text not null default 'draft' check (status in ('draft', 'proposed', 'approved', 'rejected')),
  source_title text not null,
  source_type text,
  source_author text,
  source_year integer,
  source_location text,
  page_number integer,
  exercise_number text,
  statement text not null,
  final_answer text,
  topic text,
  subtopic text,
  difficulty text,
  constraint competitive_exercises_source_year_check check (source_year is null or (source_year >= 0 and source_year <= 9999)),
  constraint competitive_exercises_page_number_check check (page_number is null or page_number > 0),
  constraint competitive_exercises_approved_status_check check (
    (status = 'approved' and approved_at is not null)
    or (status <> 'approved')
  )
);

create index if not exists competitive_exercises_created_by_idx on public.competitive_exercises (created_by);
create index if not exists competitive_exercises_status_idx on public.competitive_exercises (status);
create index if not exists competitive_exercises_updated_at_idx on public.competitive_exercises (updated_at desc);

create or replace function public.set_competitive_exercises_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_competitive_exercises_updated_at on public.competitive_exercises;
create trigger trg_competitive_exercises_updated_at
before update on public.competitive_exercises
for each row
execute function public.set_competitive_exercises_updated_at();

alter table public.competitive_exercises enable row level security;

create policy "competitive_exercises_select_own"
on public.competitive_exercises
for select
to authenticated
using (created_by = auth.uid());

create policy "competitive_exercises_insert_own"
on public.competitive_exercises
for insert
to authenticated
with check (created_by = auth.uid());

create policy "competitive_exercises_update_own"
on public.competitive_exercises
for update
to authenticated
using (created_by = auth.uid())
with check (created_by = auth.uid());

create policy "competitive_exercises_delete_own"
on public.competitive_exercises
for delete
to authenticated
using (created_by = auth.uid());
