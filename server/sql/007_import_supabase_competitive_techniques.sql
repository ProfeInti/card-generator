\set ON_ERROR_STOP on

WITH normalized AS (
  SELECT
    id,
    created_by,
    CASE
      WHEN EXISTS (SELECT 1 FROM public.users u WHERE u.id = reviewed_by) THEN reviewed_by
      ELSE NULL
    END AS reviewed_by,
    approved_at,
    coalesce(created_at, timezone('utc', now())) AS created_at,
    coalesce(updated_at, timezone('utc', now())) AS updated_at,
    CASE
      WHEN status IN ('draft', 'proposed', 'approved', 'rejected') THEN status
      ELSE 'draft'
    END AS status,
    coalesce(nullif(name, ''), 'Untitled technique') AS name,
    nullif(name_fr, '') AS name_fr,
    nullif(topic, '') AS topic,
    nullif(topic_fr, '') AS topic_fr,
    nullif(subtopic, '') AS subtopic,
    nullif(subtopic_fr, '') AS subtopic_fr,
    nullif(effect_type, '') AS effect_type,
    nullif(effect_type_fr, '') AS effect_type_fr,
    coalesce(nullif(effect_description, ''), '<p></p>') AS effect_description,
    nullif(effect_description_fr, '') AS effect_description_fr,
    nullif(worked_example, '') AS worked_example,
    nullif(worked_example_fr, '') AS worked_example_fr,
    nullif(sympy_transformation, '') AS sympy_transformation,
    nullif(sympy_transformation_es, '') AS sympy_transformation_es,
    nullif(sympy_transformation_fr, '') AS sympy_transformation_fr,
    nullif(sympy_input_schema, '') AS sympy_input_schema,
    structured_technique_spec,
    nullif(application_structure, '') AS application_structure,
    nullif(application_structure_fr, '') AS application_structure_fr
  FROM legacy_import.supabase_competitive_techniques
  WHERE EXISTS (SELECT 1 FROM public.users u WHERE u.id = legacy_import.supabase_competitive_techniques.created_by)
)
INSERT INTO public.competitive_techniques (
  id,
  created_by,
  reviewed_by,
  approved_at,
  created_at,
  updated_at,
  status,
  name,
  name_fr,
  topic,
  topic_fr,
  subtopic,
  subtopic_fr,
  effect_type,
  effect_type_fr,
  effect_description,
  effect_description_fr,
  worked_example,
  worked_example_fr,
  sympy_transformation,
  sympy_transformation_es,
  sympy_transformation_fr,
  sympy_input_schema,
  structured_technique_spec,
  application_structure,
  application_structure_fr
)
SELECT
  id,
  created_by,
  reviewed_by,
  CASE
    WHEN status = 'approved' THEN coalesce(approved_at, updated_at, created_at)
    ELSE approved_at
  END AS approved_at,
  created_at,
  updated_at,
  status,
  name,
  name_fr,
  topic,
  topic_fr,
  subtopic,
  subtopic_fr,
  effect_type,
  effect_type_fr,
  effect_description,
  effect_description_fr,
  worked_example,
  worked_example_fr,
  sympy_transformation,
  sympy_transformation_es,
  sympy_transformation_fr,
  sympy_input_schema,
  structured_technique_spec,
  application_structure,
  application_structure_fr
FROM normalized
ON CONFLICT (id) DO UPDATE SET
  created_by = EXCLUDED.created_by,
  reviewed_by = EXCLUDED.reviewed_by,
  approved_at = EXCLUDED.approved_at,
  updated_at = EXCLUDED.updated_at,
  status = EXCLUDED.status,
  name = EXCLUDED.name,
  name_fr = EXCLUDED.name_fr,
  topic = EXCLUDED.topic,
  topic_fr = EXCLUDED.topic_fr,
  subtopic = EXCLUDED.subtopic,
  subtopic_fr = EXCLUDED.subtopic_fr,
  effect_type = EXCLUDED.effect_type,
  effect_type_fr = EXCLUDED.effect_type_fr,
  effect_description = EXCLUDED.effect_description,
  effect_description_fr = EXCLUDED.effect_description_fr,
  worked_example = EXCLUDED.worked_example,
  worked_example_fr = EXCLUDED.worked_example_fr,
  sympy_transformation = EXCLUDED.sympy_transformation,
  sympy_transformation_es = EXCLUDED.sympy_transformation_es,
  sympy_transformation_fr = EXCLUDED.sympy_transformation_fr,
  sympy_input_schema = EXCLUDED.sympy_input_schema,
  structured_technique_spec = EXCLUDED.structured_technique_spec,
  application_structure = EXCLUDED.application_structure,
  application_structure_fr = EXCLUDED.application_structure_fr;

WITH normalized AS (
  SELECT
    id,
    CASE
      WHEN EXISTS (SELECT 1 FROM public.competitive_techniques t WHERE t.id = legacy_technique_id) THEN legacy_technique_id
      ELSE NULL
    END AS legacy_technique_id,
    created_by,
    CASE
      WHEN EXISTS (SELECT 1 FROM public.users u WHERE u.id = reviewed_by) THEN reviewed_by
      ELSE NULL
    END AS reviewed_by,
    CASE
      WHEN status IN ('approved', 'archived') THEN status
      ELSE 'approved'
    END AS status,
    coalesce(published_at, updated_at, created_at, timezone('utc', now())) AS published_at,
    archived_at,
    coalesce(nullif(name, ''), 'Untitled technique') AS name,
    nullif(name_fr, '') AS name_fr,
    nullif(topic, '') AS topic,
    nullif(topic_fr, '') AS topic_fr,
    nullif(subtopic, '') AS subtopic,
    nullif(subtopic_fr, '') AS subtopic_fr,
    nullif(effect_type, '') AS effect_type,
    nullif(effect_type_fr, '') AS effect_type_fr,
    coalesce(nullif(effect_description, ''), '<p></p>') AS effect_description,
    nullif(effect_description_fr, '') AS effect_description_fr,
    nullif(worked_example, '') AS worked_example,
    nullif(worked_example_fr, '') AS worked_example_fr,
    nullif(sympy_transformation, '') AS sympy_transformation,
    nullif(sympy_transformation_es, '') AS sympy_transformation_es,
    nullif(sympy_transformation_fr, '') AS sympy_transformation_fr,
    nullif(sympy_input_schema, '') AS sympy_input_schema,
    structured_technique_spec,
    nullif(application_structure, '') AS application_structure,
    nullif(application_structure_fr, '') AS application_structure_fr,
    coalesce(created_at, timezone('utc', now())) AS created_at,
    coalesce(updated_at, timezone('utc', now())) AS updated_at
  FROM legacy_import.supabase_competitive_technique_catalog
  WHERE EXISTS (SELECT 1 FROM public.users u WHERE u.id = legacy_import.supabase_competitive_technique_catalog.created_by)
)
INSERT INTO public.competitive_technique_catalog (
  id,
  legacy_technique_id,
  created_by,
  reviewed_by,
  status,
  published_at,
  archived_at,
  name,
  name_fr,
  topic,
  topic_fr,
  subtopic,
  subtopic_fr,
  effect_type,
  effect_type_fr,
  effect_description,
  effect_description_fr,
  worked_example,
  worked_example_fr,
  sympy_transformation,
  sympy_transformation_es,
  sympy_transformation_fr,
  sympy_input_schema,
  structured_technique_spec,
  application_structure,
  application_structure_fr,
  created_at,
  updated_at
)
SELECT
  id,
  legacy_technique_id,
  created_by,
  reviewed_by,
  status,
  published_at,
  archived_at,
  name,
  name_fr,
  topic,
  topic_fr,
  subtopic,
  subtopic_fr,
  effect_type,
  effect_type_fr,
  effect_description,
  effect_description_fr,
  worked_example,
  worked_example_fr,
  sympy_transformation,
  sympy_transformation_es,
  sympy_transformation_fr,
  sympy_input_schema,
  structured_technique_spec,
  application_structure,
  application_structure_fr,
  created_at,
  updated_at
FROM normalized
ON CONFLICT (id) DO UPDATE SET
  legacy_technique_id = EXCLUDED.legacy_technique_id,
  created_by = EXCLUDED.created_by,
  reviewed_by = EXCLUDED.reviewed_by,
  status = EXCLUDED.status,
  published_at = EXCLUDED.published_at,
  archived_at = EXCLUDED.archived_at,
  name = EXCLUDED.name,
  name_fr = EXCLUDED.name_fr,
  topic = EXCLUDED.topic,
  topic_fr = EXCLUDED.topic_fr,
  subtopic = EXCLUDED.subtopic,
  subtopic_fr = EXCLUDED.subtopic_fr,
  effect_type = EXCLUDED.effect_type,
  effect_type_fr = EXCLUDED.effect_type_fr,
  effect_description = EXCLUDED.effect_description,
  effect_description_fr = EXCLUDED.effect_description_fr,
  worked_example = EXCLUDED.worked_example,
  worked_example_fr = EXCLUDED.worked_example_fr,
  sympy_transformation = EXCLUDED.sympy_transformation,
  sympy_transformation_es = EXCLUDED.sympy_transformation_es,
  sympy_transformation_fr = EXCLUDED.sympy_transformation_fr,
  sympy_input_schema = EXCLUDED.sympy_input_schema,
  structured_technique_spec = EXCLUDED.structured_technique_spec,
  application_structure = EXCLUDED.application_structure,
  application_structure_fr = EXCLUDED.application_structure_fr,
  updated_at = EXCLUDED.updated_at;

WITH normalized AS (
  SELECT
    id,
    student_user_id,
    catalog_technique_id,
    CASE
      WHEN source IN ('copied', 'seeded_from_legacy_approved') THEN source
      ELSE 'copied'
    END AS source,
    coalesce(created_at, timezone('utc', now())) AS created_at
  FROM legacy_import.supabase_competitive_technique_student_collection
  WHERE EXISTS (SELECT 1 FROM public.users u WHERE u.id = legacy_import.supabase_competitive_technique_student_collection.student_user_id)
    AND EXISTS (SELECT 1 FROM public.competitive_technique_catalog c WHERE c.id = legacy_import.supabase_competitive_technique_student_collection.catalog_technique_id)
)
INSERT INTO public.competitive_technique_student_collection (
  id,
  student_user_id,
  catalog_technique_id,
  source,
  created_at
)
SELECT
  id,
  student_user_id,
  catalog_technique_id,
  source,
  created_at
FROM normalized
ON CONFLICT (id) DO UPDATE SET
  student_user_id = EXCLUDED.student_user_id,
  catalog_technique_id = EXCLUDED.catalog_technique_id,
  source = EXCLUDED.source,
  created_at = EXCLUDED.created_at;

WITH normalized AS (
  SELECT
    id,
    CASE
      WHEN EXISTS (SELECT 1 FROM public.competitive_techniques t WHERE t.id = legacy_technique_id) THEN legacy_technique_id
      ELSE NULL
    END AS legacy_technique_id,
    created_by,
    CASE
      WHEN EXISTS (SELECT 1 FROM public.users u WHERE u.id = reviewed_by) THEN reviewed_by
      ELSE NULL
    END AS reviewed_by,
    CASE
      WHEN EXISTS (SELECT 1 FROM public.competitive_technique_catalog c WHERE c.id = published_catalog_id) THEN published_catalog_id
      ELSE NULL
    END AS published_catalog_id,
    CASE
      WHEN status IN ('draft', 'proposed', 'rejected', 'approved') THEN status
      ELSE 'draft'
    END AS status,
    approved_at,
    coalesce(nullif(name, ''), 'Untitled technique') AS name,
    nullif(name_fr, '') AS name_fr,
    nullif(topic, '') AS topic,
    nullif(topic_fr, '') AS topic_fr,
    nullif(subtopic, '') AS subtopic,
    nullif(subtopic_fr, '') AS subtopic_fr,
    nullif(effect_type, '') AS effect_type,
    nullif(effect_type_fr, '') AS effect_type_fr,
    coalesce(nullif(effect_description, ''), '<p></p>') AS effect_description,
    nullif(effect_description_fr, '') AS effect_description_fr,
    nullif(worked_example, '') AS worked_example,
    nullif(worked_example_fr, '') AS worked_example_fr,
    nullif(sympy_transformation, '') AS sympy_transformation,
    nullif(sympy_transformation_es, '') AS sympy_transformation_es,
    nullif(sympy_transformation_fr, '') AS sympy_transformation_fr,
    nullif(sympy_input_schema, '') AS sympy_input_schema,
    structured_technique_spec,
    nullif(application_structure, '') AS application_structure,
    nullif(application_structure_fr, '') AS application_structure_fr,
    coalesce(created_at, timezone('utc', now())) AS created_at,
    coalesce(updated_at, timezone('utc', now())) AS updated_at
  FROM legacy_import.supabase_competitive_technique_proposals
  WHERE EXISTS (SELECT 1 FROM public.users u WHERE u.id = legacy_import.supabase_competitive_technique_proposals.created_by)
)
INSERT INTO public.competitive_technique_proposals (
  id,
  legacy_technique_id,
  created_by,
  reviewed_by,
  published_catalog_id,
  status,
  approved_at,
  name,
  name_fr,
  topic,
  topic_fr,
  subtopic,
  subtopic_fr,
  effect_type,
  effect_type_fr,
  effect_description,
  effect_description_fr,
  worked_example,
  worked_example_fr,
  sympy_transformation,
  sympy_transformation_es,
  sympy_transformation_fr,
  sympy_input_schema,
  structured_technique_spec,
  application_structure,
  application_structure_fr,
  created_at,
  updated_at
)
SELECT
  id,
  legacy_technique_id,
  created_by,
  reviewed_by,
  published_catalog_id,
  status,
  CASE
    WHEN status = 'approved' THEN coalesce(approved_at, updated_at, created_at)
    ELSE approved_at
  END AS approved_at,
  name,
  name_fr,
  topic,
  topic_fr,
  subtopic,
  subtopic_fr,
  effect_type,
  effect_type_fr,
  effect_description,
  effect_description_fr,
  worked_example,
  worked_example_fr,
  sympy_transformation,
  sympy_transformation_es,
  sympy_transformation_fr,
  sympy_input_schema,
  structured_technique_spec,
  application_structure,
  application_structure_fr,
  created_at,
  updated_at
FROM normalized
ON CONFLICT (id) DO UPDATE SET
  legacy_technique_id = EXCLUDED.legacy_technique_id,
  created_by = EXCLUDED.created_by,
  reviewed_by = EXCLUDED.reviewed_by,
  published_catalog_id = EXCLUDED.published_catalog_id,
  status = EXCLUDED.status,
  approved_at = EXCLUDED.approved_at,
  name = EXCLUDED.name,
  name_fr = EXCLUDED.name_fr,
  topic = EXCLUDED.topic,
  topic_fr = EXCLUDED.topic_fr,
  subtopic = EXCLUDED.subtopic,
  subtopic_fr = EXCLUDED.subtopic_fr,
  effect_type = EXCLUDED.effect_type,
  effect_type_fr = EXCLUDED.effect_type_fr,
  effect_description = EXCLUDED.effect_description,
  effect_description_fr = EXCLUDED.effect_description_fr,
  worked_example = EXCLUDED.worked_example,
  worked_example_fr = EXCLUDED.worked_example_fr,
  sympy_transformation = EXCLUDED.sympy_transformation,
  sympy_transformation_es = EXCLUDED.sympy_transformation_es,
  sympy_transformation_fr = EXCLUDED.sympy_transformation_fr,
  sympy_input_schema = EXCLUDED.sympy_input_schema,
  structured_technique_spec = EXCLUDED.structured_technique_spec,
  application_structure = EXCLUDED.application_structure,
  application_structure_fr = EXCLUDED.application_structure_fr,
  updated_at = EXCLUDED.updated_at;
