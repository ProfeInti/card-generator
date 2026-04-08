\set ON_ERROR_STOP on

CREATE TABLE IF NOT EXISTS legacy_import.supabase_whiteboard_workspaces (
  id uuid PRIMARY KEY,
  owner_user_id uuid NOT NULL,
  visibility text,
  source_workspace_id uuid,
  exercise_local_id text NOT NULL,
  exercise_title text,
  exercise_snapshot jsonb,
  notebook_state jsonb,
  nodes jsonb,
  links jsonb,
  last_editor_user_id uuid,
  created_at timestamptz,
  updated_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.whiteboard_workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  visibility text NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'private')),
  source_workspace_id uuid REFERENCES public.whiteboard_workspaces(id) ON DELETE SET NULL,
  exercise_local_id text NOT NULL,
  exercise_title text NOT NULL DEFAULT '',
  exercise_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  notebook_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  nodes jsonb NOT NULL DEFAULT '[]'::jsonb,
  links jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_editor_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT whiteboard_workspaces_owner_exercise_unique UNIQUE (owner_user_id, exercise_local_id)
);

CREATE INDEX IF NOT EXISTS whiteboard_workspaces_owner_idx
  ON public.whiteboard_workspaces (owner_user_id);

CREATE INDEX IF NOT EXISTS whiteboard_workspaces_updated_at_idx
  ON public.whiteboard_workspaces (updated_at DESC);

CREATE INDEX IF NOT EXISTS whiteboard_workspaces_visibility_idx
  ON public.whiteboard_workspaces (visibility, updated_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS whiteboard_workspaces_unique_root_exercise_idx
  ON public.whiteboard_workspaces (exercise_local_id)
  WHERE source_workspace_id IS NULL;

CREATE OR REPLACE FUNCTION public.set_whiteboard_workspaces_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  new.updated_at = timezone('utc', now());
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS trg_whiteboard_workspaces_updated_at ON public.whiteboard_workspaces;
CREATE TRIGGER trg_whiteboard_workspaces_updated_at
BEFORE UPDATE ON public.whiteboard_workspaces
FOR EACH ROW
EXECUTE FUNCTION public.set_whiteboard_workspaces_updated_at();
