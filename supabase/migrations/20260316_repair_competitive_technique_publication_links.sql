-- Repair approved competitive technique publication links without deleting data.
-- This migration is intentionally additive and idempotent:
-- 1. Re-link approved proposals to existing catalog rows when an exact signature match exists.
-- 2. Re-link approved proposals to existing legacy rows when an exact signature match exists.
-- 3. Materialize missing legacy rows for approved proposals.
-- 4. Materialize missing catalog rows for approved proposals.
-- 5. Seed the creator's private collection from the resolved catalog rows.
-- Date: 2026-03-16

-- Step 1: link approved proposals to an existing catalog row by exact signature.
update public.competitive_technique_proposals p
set published_catalog_id = c.id
from public.competitive_technique_catalog c
where p.status = 'approved'
  and p.published_catalog_id is null
  and p.created_by = c.created_by
  and p.created_at = c.created_at
  and coalesce(p.name, '') = coalesce(c.name, '')
  and coalesce(p.topic, '') = coalesce(c.topic, '')
  and coalesce(p.subtopic, '') = coalesce(c.subtopic, '')
  and coalesce(p.effect_type, '') = coalesce(c.effect_type, '')
  and coalesce(p.effect_description, '') = coalesce(c.effect_description, '');

-- Step 2: backfill legacy ids from matching legacy approved rows or linked catalog rows.
update public.competitive_technique_proposals p
set legacy_technique_id = t.id
from public.competitive_techniques t
where p.status = 'approved'
  and p.legacy_technique_id is null
  and t.status = 'approved'
  and p.created_by = t.created_by
  and p.created_at = t.created_at
  and coalesce(p.name, '') = coalesce(t.name, '')
  and coalesce(p.topic, '') = coalesce(t.topic, '')
  and coalesce(p.subtopic, '') = coalesce(t.subtopic, '')
  and coalesce(p.effect_type, '') = coalesce(t.effect_type, '')
  and coalesce(p.effect_description, '') = coalesce(t.effect_description, '');

update public.competitive_technique_proposals p
set legacy_technique_id = c.legacy_technique_id
from public.competitive_technique_catalog c
where p.status = 'approved'
  and p.legacy_technique_id is null
  and p.published_catalog_id = c.id
  and c.legacy_technique_id is not null;

-- Step 3: create missing legacy approved rows from approved proposals still lacking one.
insert into public.competitive_techniques (
  created_by,
  reviewed_by,
  approved_at,
  status,
  name,
  name_fr,
  topic,
  subtopic,
  effect_type,
  effect_description,
  effect_description_fr,
  worked_example,
  worked_example_fr,
  created_at,
  updated_at
)
select
  p.created_by,
  p.reviewed_by,
  coalesce(p.approved_at, timezone('utc', now())),
  'approved',
  p.name,
  p.name_fr,
  p.topic,
  p.subtopic,
  p.effect_type,
  p.effect_description,
  p.effect_description_fr,
  p.worked_example,
  p.worked_example_fr,
  p.created_at,
  p.updated_at
from public.competitive_technique_proposals p
where p.status = 'approved'
  and p.legacy_technique_id is null
  and not exists (
    select 1
    from public.competitive_techniques t
    where t.status = 'approved'
      and t.created_by = p.created_by
      and t.created_at = p.created_at
      and coalesce(t.name, '') = coalesce(p.name, '')
      and coalesce(t.topic, '') = coalesce(p.topic, '')
      and coalesce(t.subtopic, '') = coalesce(p.subtopic, '')
      and coalesce(t.effect_type, '') = coalesce(p.effect_type, '')
      and coalesce(t.effect_description, '') = coalesce(p.effect_description, '')
  );

update public.competitive_technique_proposals p
set legacy_technique_id = t.id
from public.competitive_techniques t
where p.status = 'approved'
  and p.legacy_technique_id is null
  and t.status = 'approved'
  and p.created_by = t.created_by
  and p.created_at = t.created_at
  and coalesce(p.name, '') = coalesce(t.name, '')
  and coalesce(p.topic, '') = coalesce(t.topic, '')
  and coalesce(p.subtopic, '') = coalesce(t.subtopic, '')
  and coalesce(p.effect_type, '') = coalesce(t.effect_type, '')
  and coalesce(p.effect_description, '') = coalesce(t.effect_description, '');

-- Step 4: create missing catalog rows from approved proposals still lacking publication.
insert into public.competitive_technique_catalog (
  legacy_technique_id,
  created_by,
  reviewed_by,
  status,
  published_at,
  archived_at,
  name,
  name_fr,
  topic,
  subtopic,
  effect_type,
  effect_description,
  effect_description_fr,
  worked_example,
  worked_example_fr,
  created_at,
  updated_at
)
select
  p.legacy_technique_id,
  p.created_by,
  p.reviewed_by,
  'approved',
  coalesce(p.approved_at, timezone('utc', now())),
  null,
  p.name,
  p.name_fr,
  p.topic,
  p.subtopic,
  p.effect_type,
  p.effect_description,
  p.effect_description_fr,
  p.worked_example,
  p.worked_example_fr,
  p.created_at,
  p.updated_at
from public.competitive_technique_proposals p
where p.status = 'approved'
  and p.published_catalog_id is null
  and not exists (
    select 1
    from public.competitive_technique_catalog c
    where c.created_by = p.created_by
      and c.created_at = p.created_at
      and coalesce(c.name, '') = coalesce(p.name, '')
      and coalesce(c.topic, '') = coalesce(p.topic, '')
      and coalesce(c.subtopic, '') = coalesce(p.subtopic, '')
      and coalesce(c.effect_type, '') = coalesce(p.effect_type, '')
      and coalesce(c.effect_description, '') = coalesce(p.effect_description, '')
  );

update public.competitive_technique_proposals p
set published_catalog_id = c.id
from public.competitive_technique_catalog c
where p.status = 'approved'
  and p.published_catalog_id is null
  and p.created_by = c.created_by
  and p.created_at = c.created_at
  and coalesce(p.name, '') = coalesce(c.name, '')
  and coalesce(p.topic, '') = coalesce(c.topic, '')
  and coalesce(p.subtopic, '') = coalesce(c.subtopic, '')
  and coalesce(p.effect_type, '') = coalesce(c.effect_type, '')
  and coalesce(p.effect_description, '') = coalesce(c.effect_description, '');

-- Step 5: ensure the owner has the approved technique in the private collection.
insert into public.competitive_technique_student_collection (
  student_user_id,
  catalog_technique_id,
  source,
  created_at
)
select
  p.created_by,
  p.published_catalog_id,
  'seeded_from_legacy_approved',
  coalesce(p.approved_at, p.created_at, timezone('utc', now()))
from public.competitive_technique_proposals p
where p.status = 'approved'
  and p.published_catalog_id is not null
on conflict (student_user_id, catalog_technique_id) do nothing;
