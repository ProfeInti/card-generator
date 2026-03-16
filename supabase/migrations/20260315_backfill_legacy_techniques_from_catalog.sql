-- Backfill legacy competitive_techniques rows for catalog entries created in v2
-- so constructs and multiplayer can keep using legacy technique ids safely.
-- Date: 2026-03-15

with inserted_legacy as (
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
    c.created_by,
    c.reviewed_by,
    coalesce(c.published_at, timezone('utc', now())),
    'approved',
    c.name,
    c.name_fr,
    c.topic,
    c.subtopic,
    c.effect_type,
    c.effect_description,
    c.effect_description_fr,
    c.worked_example,
    c.worked_example_fr,
    c.created_at,
    c.updated_at
  from public.competitive_technique_catalog c
  where c.legacy_technique_id is null
  returning id, created_by, name, topic, subtopic, effect_type, effect_description, created_at
)
update public.competitive_technique_catalog c
set legacy_technique_id = lt.id
from public.competitive_techniques lt
where c.legacy_technique_id is null
  and lt.created_by = c.created_by
  and coalesce(lt.name, '') = coalesce(c.name, '')
  and coalesce(lt.topic, '') = coalesce(c.topic, '')
  and coalesce(lt.subtopic, '') = coalesce(c.subtopic, '')
  and coalesce(lt.effect_type, '') = coalesce(c.effect_type, '')
  and coalesce(lt.effect_description, '') = coalesce(c.effect_description, '')
  and lt.created_at = c.created_at;

update public.competitive_technique_proposals p
set published_catalog_id = c.id
from public.competitive_technique_catalog c
where p.status = 'approved'
  and p.published_catalog_id is null
  and p.legacy_technique_id is not distinct from c.legacy_technique_id
  and p.name = c.name
  and coalesce(p.topic, '') = coalesce(c.topic, '');
