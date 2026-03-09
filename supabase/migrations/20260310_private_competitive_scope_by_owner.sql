-- Restrict competitive entities to owner-only visibility/modification (no cross-account access)
-- Date: 2026-03-10

-- Helper visibility for construct steps should be owner-only.
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
      and c.created_by = auth.uid()
  );
;

grant execute on function public.construct_is_visible(uuid) to authenticated;

-- Exercises: owner-only select/update/delete for all roles.
drop policy if exists "competitive_exercises_select_visible" on public.competitive_exercises;
drop policy if exists "competitive_exercises_select_own_or_teacher" on public.competitive_exercises;
create policy "competitive_exercises_select_own_only"
on public.competitive_exercises
for select
to authenticated
using (created_by = auth.uid());

drop policy if exists "competitive_exercises_update_teacher" on public.competitive_exercises;
create policy "competitive_exercises_update_teacher"
on public.competitive_exercises
for update
to authenticated
using (
  created_by = auth.uid()
  and public.current_profile_role() = 'teacher'
)
with check (
  created_by = auth.uid()
  and public.current_profile_role() = 'teacher'
);

drop policy if exists "competitive_exercises_delete_own_or_teacher" on public.competitive_exercises;
create policy "competitive_exercises_delete_own_or_teacher"
on public.competitive_exercises
for delete
to authenticated
using (created_by = auth.uid());

-- Techniques: owner-only select/update/delete for all roles.
drop policy if exists "competitive_techniques_select_visible" on public.competitive_techniques;
drop policy if exists "competitive_techniques_select_own_or_teacher" on public.competitive_techniques;
create policy "competitive_techniques_select_own_only"
on public.competitive_techniques
for select
to authenticated
using (created_by = auth.uid());

drop policy if exists "competitive_techniques_update_teacher" on public.competitive_techniques;
create policy "competitive_techniques_update_teacher"
on public.competitive_techniques
for update
to authenticated
using (
  created_by = auth.uid()
  and public.current_profile_role() = 'teacher'
)
with check (
  created_by = auth.uid()
  and public.current_profile_role() = 'teacher'
);

drop policy if exists "competitive_techniques_delete_own_or_teacher" on public.competitive_techniques;
create policy "competitive_techniques_delete_own_or_teacher"
on public.competitive_techniques
for delete
to authenticated
using (created_by = auth.uid());

-- Constructs: owner-only select/update/delete for all roles.
drop policy if exists "competitive_constructs_select_own_or_teacher" on public.competitive_constructs;
create policy "competitive_constructs_select_own_only"
on public.competitive_constructs
for select
to authenticated
using (created_by = auth.uid());

drop policy if exists "competitive_constructs_update_teacher" on public.competitive_constructs;
create policy "competitive_constructs_update_teacher"
on public.competitive_constructs
for update
to authenticated
using (
  created_by = auth.uid()
  and public.current_profile_role() = 'teacher'
)
with check (
  created_by = auth.uid()
  and public.current_profile_role() = 'teacher'
);

drop policy if exists "competitive_constructs_delete_own_or_teacher" on public.competitive_constructs;
create policy "competitive_constructs_delete_own_or_teacher"
on public.competitive_constructs
for delete
to authenticated
using (created_by = auth.uid());
