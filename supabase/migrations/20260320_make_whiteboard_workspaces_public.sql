alter table public.whiteboard_workspaces
  add column if not exists visibility text not null default 'public';

alter table public.whiteboard_workspaces
  add column if not exists source_workspace_id uuid references public.whiteboard_workspaces (id) on delete set null;

update public.whiteboard_workspaces
set visibility = 'public'
where visibility is null or visibility <> 'public';

create index if not exists whiteboard_workspaces_visibility_idx
  on public.whiteboard_workspaces (visibility, updated_at desc);

drop policy if exists "whiteboard_workspaces_select_own" on public.whiteboard_workspaces;
create policy "whiteboard_workspaces_select_public_or_own"
on public.whiteboard_workspaces
for select
to authenticated
using (visibility = 'public' or owner_user_id = auth.uid());

drop policy if exists "whiteboard_workspaces_insert_own" on public.whiteboard_workspaces;
create policy "whiteboard_workspaces_insert_own"
on public.whiteboard_workspaces
for insert
to authenticated
with check (
  owner_user_id = auth.uid()
  and visibility in ('public', 'private')
);

drop policy if exists "whiteboard_workspaces_update_own" on public.whiteboard_workspaces;
create policy "whiteboard_workspaces_update_public_or_own"
on public.whiteboard_workspaces
for update
to authenticated
using (visibility = 'public' or owner_user_id = auth.uid())
with check (visibility in ('public', 'private'));
