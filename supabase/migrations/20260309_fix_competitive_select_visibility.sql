-- Expose approved competitive corpus to all authenticated users
-- Date: 2026-03-09

-- Exercises: own rows + approved corpus + teacher broader access

drop policy if exists "competitive_exercises_select_own_or_teacher" on public.competitive_exercises;
drop policy if exists "competitive_exercises_select_visible" on public.competitive_exercises;

create policy "competitive_exercises_select_visible"
on public.competitive_exercises
for select
to authenticated
using (
  created_by = auth.uid()
  or status = 'approved'
  or public.current_profile_role() = 'teacher'
);

-- Techniques: own rows + approved corpus + teacher broader access

drop policy if exists "competitive_techniques_select_own_or_teacher" on public.competitive_techniques;
drop policy if exists "competitive_techniques_select_visible" on public.competitive_techniques;

create policy "competitive_techniques_select_visible"
on public.competitive_techniques
for select
to authenticated
using (
  created_by = auth.uid()
  or status = 'approved'
  or public.current_profile_role() = 'teacher'
);
