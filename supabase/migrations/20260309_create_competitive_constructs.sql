-- Competitive constructs + ordered steps
-- Date: 2026-03-09

create extension if not exists pgcrypto;

create or replace function public.is_approved_competitive_exercise(p_exercise_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.competitive_exercises e
    where e.id = p_exercise_id
      and e.status = 'approved'
  );
$$;

grant execute on function public.is_approved_competitive_exercise(uuid) to authenticated;

create or replace function public.is_approved_competitive_technique(p_technique_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.competitive_techniques t
    where t.id = p_technique_id
      and t.status = 'approved'
  );
$$;

grant execute on function public.is_approved_competitive_technique(uuid) to authenticated;

create table if not exists public.competitive_constructs (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users (id) on delete cascade,
  exercise_id uuid not null references public.competitive_exercises (id) on delete restrict,
  title text not null,
  description text,
  status text not null default 'draft' check (status in ('draft', 'proposed', 'approved', 'rejected')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  reviewed_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  constraint competitive_constructs_approved_status_check check (
    (status = 'approved' and approved_at is not null)
    or (status <> 'approved')
  ),
  constraint competitive_constructs_exercise_must_be_approved check (
    public.is_approved_competitive_exercise(exercise_id)
  )
);

create table if not exists public.competitive_construct_steps (
  id uuid primary key default gen_random_uuid(),
  construct_id uuid not null references public.competitive_constructs (id) on delete cascade,
  step_order integer not null check (step_order > 0),
  technique_id uuid not null references public.competitive_techniques (id) on delete restrict,
  progress_state text not null,
  explanation text,
  created_at timestamptz not null default timezone('utc', now()),
  constraint competitive_construct_steps_technique_must_be_approved check (
    public.is_approved_competitive_technique(technique_id)
  )
);

create index if not exists competitive_constructs_created_by_idx on public.competitive_constructs (created_by);
create index if not exists competitive_constructs_status_idx on public.competitive_constructs (status);
create index if not exists competitive_constructs_exercise_id_idx on public.competitive_constructs (exercise_id);
create index if not exists competitive_constructs_updated_at_idx on public.competitive_constructs (updated_at desc);
create index if not exists competitive_construct_steps_construct_id_idx on public.competitive_construct_steps (construct_id);
create index if not exists competitive_construct_steps_step_order_idx on public.competitive_construct_steps (step_order);
create unique index if not exists competitive_construct_steps_construct_order_uidx
  on public.competitive_construct_steps (construct_id, step_order);

create or replace function public.set_competitive_constructs_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_competitive_constructs_updated_at on public.competitive_constructs;
create trigger trg_competitive_constructs_updated_at
before update on public.competitive_constructs
for each row
execute function public.set_competitive_constructs_updated_at();

create or replace function public.apply_competitive_construct_review_metadata()
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

drop trigger if exists trg_competitive_constructs_review_metadata on public.competitive_constructs;
create trigger trg_competitive_constructs_review_metadata
before insert or update on public.competitive_constructs
for each row
execute function public.apply_competitive_construct_review_metadata();

create or replace function public.construct_is_visible(p_construct_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.competitive_constructs c
    where c.id = p_construct_id
      and (c.created_by = auth.uid() or public.current_profile_role() = 'teacher')
  );
$$;

grant execute on function public.construct_is_visible(uuid) to authenticated;

create or replace function public.student_can_modify_construct(p_construct_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.competitive_constructs c
    where c.id = p_construct_id
      and c.created_by = auth.uid()
      and c.status in ('draft', 'proposed')
      and public.current_profile_role() = 'student'
  );
$$;

grant execute on function public.student_can_modify_construct(uuid) to authenticated;

alter table public.competitive_constructs enable row level security;
alter table public.competitive_construct_steps enable row level security;

drop policy if exists "competitive_constructs_select_own_or_teacher" on public.competitive_constructs;
drop policy if exists "competitive_constructs_insert_guarded" on public.competitive_constructs;
drop policy if exists "competitive_constructs_update_student_own" on public.competitive_constructs;
drop policy if exists "competitive_constructs_update_teacher" on public.competitive_constructs;
drop policy if exists "competitive_constructs_delete_own_or_teacher" on public.competitive_constructs;

create policy "competitive_constructs_select_own_or_teacher"
on public.competitive_constructs
for select
to authenticated
using (
  created_by = auth.uid()
  or public.current_profile_role() = 'teacher'
);

create policy "competitive_constructs_insert_guarded"
on public.competitive_constructs
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

create policy "competitive_constructs_update_student_own"
on public.competitive_constructs
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

create policy "competitive_constructs_update_teacher"
on public.competitive_constructs
for update
to authenticated
using (public.current_profile_role() = 'teacher')
with check (public.current_profile_role() = 'teacher');

create policy "competitive_constructs_delete_own_or_teacher"
on public.competitive_constructs
for delete
to authenticated
using (
  created_by = auth.uid()
  or public.current_profile_role() = 'teacher'
);

drop policy if exists "competitive_construct_steps_select_visible" on public.competitive_construct_steps;
drop policy if exists "competitive_construct_steps_insert_guarded" on public.competitive_construct_steps;
drop policy if exists "competitive_construct_steps_update_guarded" on public.competitive_construct_steps;
drop policy if exists "competitive_construct_steps_delete_guarded" on public.competitive_construct_steps;

create policy "competitive_construct_steps_select_visible"
on public.competitive_construct_steps
for select
to authenticated
using (public.construct_is_visible(construct_id));

create policy "competitive_construct_steps_insert_guarded"
on public.competitive_construct_steps
for insert
to authenticated
with check (
  (public.current_profile_role() = 'teacher' and public.construct_is_visible(construct_id))
  or public.student_can_modify_construct(construct_id)
);

create policy "competitive_construct_steps_update_guarded"
on public.competitive_construct_steps
for update
to authenticated
using (
  (public.current_profile_role() = 'teacher' and public.construct_is_visible(construct_id))
  or public.student_can_modify_construct(construct_id)
)
with check (
  (public.current_profile_role() = 'teacher' and public.construct_is_visible(construct_id))
  or public.student_can_modify_construct(construct_id)
);

create policy "competitive_construct_steps_delete_guarded"
on public.competitive_construct_steps
for delete
to authenticated
using (
  (public.current_profile_role() = 'teacher' and public.construct_is_visible(construct_id))
  or public.student_can_modify_construct(construct_id)
);
