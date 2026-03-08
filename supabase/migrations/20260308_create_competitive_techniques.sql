-- Competitive techniques entity + RLS workflow
-- Date: 2026-03-08

create extension if not exists pgcrypto;

create table if not exists public.competitive_techniques (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users (id) on delete cascade,
  reviewed_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  status text not null default 'draft' check (status in ('draft', 'proposed', 'approved', 'rejected')),
  name text not null,
  topic text,
  subtopic text,
  effect_type text,
  effect_description text not null,
  worked_example text,
  constraint competitive_techniques_approved_status_check check (
    (status = 'approved' and approved_at is not null)
    or (status <> 'approved')
  )
);

create index if not exists competitive_techniques_created_by_idx on public.competitive_techniques (created_by);
create index if not exists competitive_techniques_status_idx on public.competitive_techniques (status);
create index if not exists competitive_techniques_updated_at_idx on public.competitive_techniques (updated_at desc);

create or replace function public.set_competitive_techniques_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_competitive_techniques_updated_at on public.competitive_techniques;
create trigger trg_competitive_techniques_updated_at
before update on public.competitive_techniques
for each row
execute function public.set_competitive_techniques_updated_at();

create or replace function public.apply_competitive_review_metadata()
returns trigger
language plpgsql
as $$
begin
  if new.status in ('draft', 'proposed') then
    new.reviewed_by := null;
    new.approved_at := null;
  elsif new.status = 'approved' then
    if new.reviewed_by is null then
      new.reviewed_by := auth.uid();
    end if;
    new.approved_at := coalesce(new.approved_at, timezone('utc', now()));
  elsif new.status = 'rejected' then
    if new.reviewed_by is null then
      new.reviewed_by := auth.uid();
    end if;
    new.approved_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_competitive_techniques_review_metadata on public.competitive_techniques;
create trigger trg_competitive_techniques_review_metadata
before insert or update on public.competitive_techniques
for each row
execute function public.apply_competitive_review_metadata();

alter table public.competitive_techniques enable row level security;

drop policy if exists "competitive_techniques_select_own_or_teacher" on public.competitive_techniques;
drop policy if exists "competitive_techniques_insert_guarded" on public.competitive_techniques;
drop policy if exists "competitive_techniques_update_student_own" on public.competitive_techniques;
drop policy if exists "competitive_techniques_update_teacher" on public.competitive_techniques;
drop policy if exists "competitive_techniques_delete_own_or_teacher" on public.competitive_techniques;

create policy "competitive_techniques_select_own_or_teacher"
on public.competitive_techniques
for select
to authenticated
using (
  created_by = auth.uid()
  or public.current_profile_role() = 'teacher'
);

create policy "competitive_techniques_insert_guarded"
on public.competitive_techniques
for insert
to authenticated
with check (
  created_by = auth.uid()
  and (
    public.current_profile_role() = 'teacher'
    or (
      status in ('draft', 'proposed')
      and reviewed_by is null
      and approved_at is null
    )
  )
);

create policy "competitive_techniques_update_student_own"
on public.competitive_techniques
for update
to authenticated
using (
  created_by = auth.uid()
  and public.current_profile_role() = 'student'
)
with check (
  created_by = auth.uid()
  and public.current_profile_role() = 'student'
  and status in ('draft', 'proposed')
  and reviewed_by is null
  and approved_at is null
);

create policy "competitive_techniques_update_teacher"
on public.competitive_techniques
for update
to authenticated
using (public.current_profile_role() = 'teacher')
with check (public.current_profile_role() = 'teacher');

create policy "competitive_techniques_delete_own_or_teacher"
on public.competitive_techniques
for delete
to authenticated
using (
  created_by = auth.uid()
  or public.current_profile_role() = 'teacher'
);
