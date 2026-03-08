-- Roles + review security for competitive exercises
-- Date: 2026-03-07

alter table public.profiles
  add column if not exists role text;

update public.profiles
set role = 'student'
where role is null;

alter table public.profiles
  alter column role set default 'student';

alter table public.profiles
  alter column role set not null;

alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('student', 'teacher'));

create index if not exists profiles_role_idx on public.profiles (role);

create or replace function public.current_profile_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.role from public.profiles p where p.id = auth.uid()), 'student');
$$;

grant execute on function public.current_profile_role() to authenticated;

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

drop trigger if exists trg_competitive_exercises_review_metadata on public.competitive_exercises;
create trigger trg_competitive_exercises_review_metadata
before update on public.competitive_exercises
for each row
execute function public.apply_competitive_review_metadata();

drop policy if exists "competitive_exercises_select_own" on public.competitive_exercises;
drop policy if exists "competitive_exercises_insert_own" on public.competitive_exercises;
drop policy if exists "competitive_exercises_update_own" on public.competitive_exercises;
drop policy if exists "competitive_exercises_delete_own" on public.competitive_exercises;

drop policy if exists "competitive_exercises_select_own_or_teacher" on public.competitive_exercises;
drop policy if exists "competitive_exercises_insert_guarded" on public.competitive_exercises;
drop policy if exists "competitive_exercises_update_student_own" on public.competitive_exercises;
drop policy if exists "competitive_exercises_update_teacher" on public.competitive_exercises;
drop policy if exists "competitive_exercises_delete_own_or_teacher" on public.competitive_exercises;

create policy "competitive_exercises_select_own_or_teacher"
on public.competitive_exercises
for select
to authenticated
using (
  created_by = auth.uid()
  or public.current_profile_role() = 'teacher'
);

create policy "competitive_exercises_insert_guarded"
on public.competitive_exercises
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

create policy "competitive_exercises_update_student_own"
on public.competitive_exercises
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

create policy "competitive_exercises_update_teacher"
on public.competitive_exercises
for update
to authenticated
using (public.current_profile_role() = 'teacher')
with check (public.current_profile_role() = 'teacher');

create policy "competitive_exercises_delete_own_or_teacher"
on public.competitive_exercises
for delete
to authenticated
using (
  created_by = auth.uid()
  or public.current_profile_role() = 'teacher'
);
