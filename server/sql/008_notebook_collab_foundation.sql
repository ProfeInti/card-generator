\set ON_ERROR_STOP on

CREATE TABLE IF NOT EXISTS public.notebook_collab_pages (
  id text PRIMARY KEY,
  owner_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  last_editor_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  title text NOT NULL DEFAULT '',
  exercise_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  notebook_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  share_code text NOT NULL UNIQUE,
  visibility text NOT NULL DEFAULT 'code' CHECK (visibility IN ('private', 'code')),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE TABLE IF NOT EXISTS public.notebook_collab_page_members (
  page_id text NOT NULL REFERENCES public.notebook_collab_pages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'editor' CHECK (role IN ('editor', 'viewer')),
  joined_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  PRIMARY KEY (page_id, user_id)
);

CREATE INDEX IF NOT EXISTS notebook_collab_pages_owner_idx
  ON public.notebook_collab_pages (owner_user_id);

CREATE INDEX IF NOT EXISTS notebook_collab_pages_share_code_idx
  ON public.notebook_collab_pages (share_code);

CREATE INDEX IF NOT EXISTS notebook_collab_pages_updated_at_idx
  ON public.notebook_collab_pages (updated_at DESC);

CREATE INDEX IF NOT EXISTS notebook_collab_page_members_user_idx
  ON public.notebook_collab_page_members (user_id);

CREATE OR REPLACE FUNCTION public.set_notebook_collab_pages_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  new.updated_at = timezone('utc', now());
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS trg_notebook_collab_pages_updated_at ON public.notebook_collab_pages;
CREATE TRIGGER trg_notebook_collab_pages_updated_at
BEFORE UPDATE ON public.notebook_collab_pages
FOR EACH ROW
EXECUTE FUNCTION public.set_notebook_collab_pages_updated_at();
