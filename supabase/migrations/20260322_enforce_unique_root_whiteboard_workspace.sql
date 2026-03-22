with ranked_roots as (
  select
    id,
    exercise_local_id,
    row_number() over (
      partition by exercise_local_id
      order by created_at asc, id asc
    ) as root_rank,
    first_value(id) over (
      partition by exercise_local_id
      order by created_at asc, id asc
    ) as canonical_root_id
  from public.whiteboard_workspaces
  where source_workspace_id is null
),
duplicate_roots as (
  select
    id,
    canonical_root_id
  from ranked_roots
  where root_rank > 1
)
update public.whiteboard_workspaces as workspace
set
  source_workspace_id = duplicate_roots.canonical_root_id,
  visibility = 'private'
from duplicate_roots
where workspace.id = duplicate_roots.id;

create unique index if not exists whiteboard_workspaces_unique_root_exercise_idx
  on public.whiteboard_workspaces (exercise_local_id)
  where source_workspace_id is null;
