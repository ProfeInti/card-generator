\set ON_ERROR_STOP on

WITH normalized AS (
  SELECT
    id,
    owner_user_id,
    CASE
      WHEN visibility = 'private' THEN 'private'
      ELSE 'public'
    END AS visibility,
    source_workspace_id,
    exercise_local_id,
    coalesce(exercise_title, '') AS exercise_title,
    coalesce(exercise_snapshot, '{}'::jsonb) AS exercise_snapshot,
    coalesce(notebook_state, '{}'::jsonb) AS notebook_state,
    CASE
      WHEN jsonb_typeof(nodes) = 'array' THEN nodes
      ELSE '[]'::jsonb
    END AS nodes,
    CASE
      WHEN jsonb_typeof(links) = 'array' THEN links
      ELSE '[]'::jsonb
    END AS links,
    last_editor_user_id,
    coalesce(created_at, timezone('utc', now())) AS created_at,
    coalesce(updated_at, timezone('utc', now())) AS updated_at
  FROM legacy_import.supabase_whiteboard_workspaces
),
prepared AS (
  SELECT
    *
  FROM normalized
  WHERE EXISTS (SELECT 1 FROM public.users u WHERE u.id = normalized.owner_user_id)
)
INSERT INTO public.whiteboard_workspaces (
  id,
  owner_user_id,
  visibility,
  source_workspace_id,
  exercise_local_id,
  exercise_title,
  exercise_snapshot,
  notebook_state,
  nodes,
  links,
  last_editor_user_id,
  created_at,
  updated_at
)
SELECT
  id,
  owner_user_id,
  visibility,
  source_workspace_id,
  exercise_local_id,
  exercise_title,
  exercise_snapshot,
  notebook_state,
  nodes,
  links,
  CASE
    WHEN EXISTS (SELECT 1 FROM public.users u WHERE u.id = prepared.last_editor_user_id)
      THEN prepared.last_editor_user_id
    ELSE prepared.owner_user_id
  END AS last_editor_user_id,
  created_at,
  updated_at
FROM prepared
ON CONFLICT (id) DO UPDATE SET
  owner_user_id = EXCLUDED.owner_user_id,
  visibility = EXCLUDED.visibility,
  source_workspace_id = EXCLUDED.source_workspace_id,
  exercise_local_id = EXCLUDED.exercise_local_id,
  exercise_title = EXCLUDED.exercise_title,
  exercise_snapshot = EXCLUDED.exercise_snapshot,
  notebook_state = EXCLUDED.notebook_state,
  nodes = EXCLUDED.nodes,
  links = EXCLUDED.links,
  last_editor_user_id = EXCLUDED.last_editor_user_id,
  updated_at = EXCLUDED.updated_at;
