\set ON_ERROR_STOP on

CREATE TABLE IF NOT EXISTS legacy_import.supabase_competitive_techniques (
  id uuid PRIMARY KEY,
  created_by uuid NOT NULL,
  reviewed_by uuid,
  approved_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  status text,
  name text,
  topic text,
  subtopic text,
  effect_type text,
  effect_description text,
  worked_example text,
  name_fr text,
  effect_description_fr text,
  worked_example_fr text,
  topic_fr text,
  subtopic_fr text,
  effect_type_fr text,
  sympy_transformation text,
  sympy_transformation_es text,
  sympy_transformation_fr text,
  sympy_input_schema text,
  structured_technique_spec jsonb,
  application_structure text,
  application_structure_fr text
);

CREATE TABLE IF NOT EXISTS legacy_import.supabase_competitive_technique_catalog (
  id uuid PRIMARY KEY,
  legacy_technique_id uuid,
  created_by uuid NOT NULL,
  reviewed_by uuid,
  status text,
  published_at timestamptz,
  archived_at timestamptz,
  name text,
  name_fr text,
  topic text,
  subtopic text,
  effect_type text,
  effect_description text,
  effect_description_fr text,
  worked_example text,
  worked_example_fr text,
  created_at timestamptz,
  updated_at timestamptz,
  topic_fr text,
  subtopic_fr text,
  effect_type_fr text,
  sympy_transformation text,
  sympy_transformation_es text,
  sympy_transformation_fr text,
  sympy_input_schema text,
  structured_technique_spec jsonb,
  application_structure text,
  application_structure_fr text
);

CREATE TABLE IF NOT EXISTS legacy_import.supabase_competitive_technique_student_collection (
  id uuid PRIMARY KEY,
  student_user_id uuid NOT NULL,
  catalog_technique_id uuid NOT NULL,
  source text,
  created_at timestamptz
);

CREATE TABLE IF NOT EXISTS legacy_import.supabase_competitive_technique_proposals (
  id uuid PRIMARY KEY,
  legacy_technique_id uuid,
  created_by uuid NOT NULL,
  reviewed_by uuid,
  published_catalog_id uuid,
  status text,
  approved_at timestamptz,
  name text,
  name_fr text,
  topic text,
  subtopic text,
  effect_type text,
  effect_description text,
  effect_description_fr text,
  worked_example text,
  worked_example_fr text,
  created_at timestamptz,
  updated_at timestamptz,
  topic_fr text,
  subtopic_fr text,
  effect_type_fr text,
  sympy_transformation text,
  sympy_transformation_es text,
  sympy_transformation_fr text,
  sympy_input_schema text,
  structured_technique_spec jsonb,
  application_structure text,
  application_structure_fr text
);

CREATE TABLE IF NOT EXISTS public.competitive_techniques (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  reviewed_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'proposed', 'approved', 'rejected')),
  name text NOT NULL,
  name_fr text,
  topic text,
  topic_fr text,
  subtopic text,
  subtopic_fr text,
  effect_type text,
  effect_type_fr text,
  effect_description text NOT NULL,
  effect_description_fr text,
  worked_example text,
  worked_example_fr text,
  sympy_transformation text,
  sympy_transformation_es text,
  sympy_transformation_fr text,
  sympy_input_schema text,
  structured_technique_spec jsonb,
  application_structure text,
  application_structure_fr text,
  CONSTRAINT competitive_techniques_approved_status_check CHECK (
    (status = 'approved' AND approved_at IS NOT NULL)
    OR (status <> 'approved')
  )
);

CREATE TABLE IF NOT EXISTS public.competitive_technique_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_technique_id uuid UNIQUE NULL REFERENCES public.competitive_techniques(id) ON DELETE SET NULL,
  created_by uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  reviewed_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'approved' CHECK (status IN ('approved', 'archived')),
  published_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  archived_at timestamptz,
  name text NOT NULL,
  name_fr text,
  topic text,
  topic_fr text,
  subtopic text,
  subtopic_fr text,
  effect_type text,
  effect_type_fr text,
  effect_description text NOT NULL,
  effect_description_fr text,
  worked_example text,
  worked_example_fr text,
  sympy_transformation text,
  sympy_transformation_es text,
  sympy_transformation_fr text,
  sympy_input_schema text,
  structured_technique_spec jsonb,
  application_structure text,
  application_structure_fr text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE TABLE IF NOT EXISTS public.competitive_technique_student_collection (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  catalog_technique_id uuid NOT NULL REFERENCES public.competitive_technique_catalog(id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'copied' CHECK (source IN ('copied', 'seeded_from_legacy_approved')),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (student_user_id, catalog_technique_id)
);

CREATE TABLE IF NOT EXISTS public.competitive_technique_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_technique_id uuid UNIQUE NULL REFERENCES public.competitive_techniques(id) ON DELETE SET NULL,
  created_by uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  reviewed_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  published_catalog_id uuid REFERENCES public.competitive_technique_catalog(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'proposed', 'rejected', 'approved')),
  approved_at timestamptz,
  name text NOT NULL,
  name_fr text,
  topic text,
  topic_fr text,
  subtopic text,
  subtopic_fr text,
  effect_type text,
  effect_type_fr text,
  effect_description text NOT NULL,
  effect_description_fr text,
  worked_example text,
  worked_example_fr text,
  sympy_transformation text,
  sympy_transformation_es text,
  sympy_transformation_fr text,
  sympy_input_schema text,
  structured_technique_spec jsonb,
  application_structure text,
  application_structure_fr text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS competitive_techniques_created_by_idx
  ON public.competitive_techniques (created_by);

CREATE INDEX IF NOT EXISTS competitive_techniques_status_idx
  ON public.competitive_techniques (status);

CREATE INDEX IF NOT EXISTS competitive_techniques_updated_at_idx
  ON public.competitive_techniques (updated_at DESC);

CREATE INDEX IF NOT EXISTS competitive_technique_catalog_created_by_idx
  ON public.competitive_technique_catalog (created_by);

CREATE INDEX IF NOT EXISTS competitive_technique_catalog_status_idx
  ON public.competitive_technique_catalog (status);

CREATE INDEX IF NOT EXISTS competitive_technique_catalog_updated_at_idx
  ON public.competitive_technique_catalog (updated_at DESC);

CREATE INDEX IF NOT EXISTS competitive_technique_student_collection_student_idx
  ON public.competitive_technique_student_collection (student_user_id);

CREATE INDEX IF NOT EXISTS competitive_technique_student_collection_catalog_idx
  ON public.competitive_technique_student_collection (catalog_technique_id);

CREATE INDEX IF NOT EXISTS competitive_technique_proposals_created_by_idx
  ON public.competitive_technique_proposals (created_by);

CREATE INDEX IF NOT EXISTS competitive_technique_proposals_status_idx
  ON public.competitive_technique_proposals (status);

CREATE INDEX IF NOT EXISTS competitive_technique_proposals_updated_at_idx
  ON public.competitive_technique_proposals (updated_at DESC);

CREATE OR REPLACE FUNCTION public.set_competitive_techniques_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  new.updated_at = timezone('utc', now());
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS trg_competitive_techniques_updated_at ON public.competitive_techniques;
CREATE TRIGGER trg_competitive_techniques_updated_at
BEFORE UPDATE ON public.competitive_techniques
FOR EACH ROW
EXECUTE FUNCTION public.set_competitive_techniques_updated_at();

CREATE OR REPLACE FUNCTION public.set_competitive_technique_catalog_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  new.updated_at = timezone('utc', now());
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS trg_competitive_technique_catalog_updated_at ON public.competitive_technique_catalog;
CREATE TRIGGER trg_competitive_technique_catalog_updated_at
BEFORE UPDATE ON public.competitive_technique_catalog
FOR EACH ROW
EXECUTE FUNCTION public.set_competitive_technique_catalog_updated_at();

CREATE OR REPLACE FUNCTION public.set_competitive_technique_proposals_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  new.updated_at = timezone('utc', now());
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS trg_competitive_technique_proposals_updated_at ON public.competitive_technique_proposals;
CREATE TRIGGER trg_competitive_technique_proposals_updated_at
BEFORE UPDATE ON public.competitive_technique_proposals
FOR EACH ROW
EXECUTE FUNCTION public.set_competitive_technique_proposals_updated_at();
