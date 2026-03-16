-- Share approved techniques across authenticated users and add French translations
-- Date: 2026-03-15

alter table public.competitive_techniques
  add column if not exists name_fr text,
  add column if not exists effect_description_fr text,
  add column if not exists worked_example_fr text;

drop policy if exists "competitive_techniques_select_own_or_teacher" on public.competitive_techniques;
drop policy if exists "competitive_techniques_select_shared_catalog_or_review_scope" on public.competitive_techniques;

create policy "competitive_techniques_select_shared_catalog_or_review_scope"
on public.competitive_techniques
for select
to authenticated
using (
  created_by = auth.uid()
  or status = 'approved'
  or public.current_profile_role() = 'teacher'
);
