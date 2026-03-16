-- Restore teacher delete authority for competitive techniques
-- Date: 2026-03-15

drop policy if exists "competitive_techniques_delete_own_or_teacher" on public.competitive_techniques;

create policy "competitive_techniques_delete_own_or_teacher"
on public.competitive_techniques
for delete
to authenticated
using (
  created_by = auth.uid()
  or public.current_profile_role() = 'teacher'
);
