-- Allow teachers to insert legacy competitive_techniques rows while approving proposals
-- Date: 2026-03-15

drop policy if exists "competitive_techniques_insert_guarded" on public.competitive_techniques;

create policy "competitive_techniques_insert_guarded"
on public.competitive_techniques
for insert
to authenticated
with check (
  (
    created_by = auth.uid()
    and (
      public.current_profile_role() = 'teacher'
      or (
        status in ('draft', 'proposed')
        and reviewed_by is null
        and approved_at is null
      )
    )
  )
  or public.current_profile_role() = 'teacher'
);
