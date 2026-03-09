-- Allow students to revise previously reviewed entities by moving them back to draft/proposed
-- Date: 2026-03-10

-- Exercises

drop policy if exists "competitive_exercises_update_student_own" on public.competitive_exercises;

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
);

-- Techniques

drop policy if exists "competitive_techniques_update_student_own" on public.competitive_techniques;

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
);

-- Constructs

drop policy if exists "competitive_constructs_update_student_own" on public.competitive_constructs;

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
);
