-- Restore teacher review scope while keeping student accounts isolated
-- Date: 2026-03-10

-- Teachers can inspect any construct for review and step visibility.
create or replace function public.construct_is_visible(p_construct_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as 
  select exists (
    select 1
    from public.competitive_constructs c
    where c.id = p_construct_id
      and (
        c.created_by = auth.uid()
        or public.current_profile_role() = 'teacher'
      )
  );
;

grant execute on function public.construct_is_visible(uuid) to authenticated;

-- Exercises: owner-only for students, full visibility/review authority for teachers.
drop policy if exists "competitive_exercises_select_own_only" on public.competitive_exercises;
drop policy if exists "competitive_exercises_select_own_or_teacher" on public.competitive_exercises;
create policy "competitive_exercises_select_own_or_teacher"
on public.competitive_exercises
for select
to authenticated
using (
  created_by = auth.uid()
  or public.current_profile_role() = 'teacher'
);

drop policy if exists "competitive_exercises_update_teacher" on public.competitive_exercises;
create policy "competitive_exercises_update_teacher"
on public.competitive_exercises
for update
to authenticated
using (public.current_profile_role() = 'teacher')
with check (public.current_profile_role() = 'teacher');

-- Techniques: owner-only for students, full visibility/review authority for teachers.
drop policy if exists "competitive_techniques_select_own_only" on public.competitive_techniques;
drop policy if exists "competitive_techniques_select_own_or_teacher" on public.competitive_techniques;
create policy "competitive_techniques_select_own_or_teacher"
on public.competitive_techniques
for select
to authenticated
using (
  created_by = auth.uid()
  or public.current_profile_role() = 'teacher'
);

drop policy if exists "competitive_techniques_update_teacher" on public.competitive_techniques;
create policy "competitive_techniques_update_teacher"
on public.competitive_techniques
for update
to authenticated
using (public.current_profile_role() = 'teacher')
with check (public.current_profile_role() = 'teacher');

-- Constructs: owner-only for students, full visibility/review authority for teachers.
drop policy if exists "competitive_constructs_select_own_only" on public.competitive_constructs;
drop policy if exists "competitive_constructs_select_own_or_teacher" on public.competitive_constructs;
create policy "competitive_constructs_select_own_or_teacher"
on public.competitive_constructs
for select
to authenticated
using (
  created_by = auth.uid()
  or public.current_profile_role() = 'teacher'
);

drop policy if exists "competitive_constructs_update_teacher" on public.competitive_constructs;
create policy "competitive_constructs_update_teacher"
on public.competitive_constructs
for update
to authenticated
using (public.current_profile_role() = 'teacher')
with check (public.current_profile_role() = 'teacher');
