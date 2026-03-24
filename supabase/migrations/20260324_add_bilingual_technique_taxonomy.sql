alter table public.competitive_techniques
  add column if not exists topic_fr text,
  add column if not exists subtopic_fr text,
  add column if not exists effect_type_fr text;

alter table public.competitive_technique_catalog
  add column if not exists topic_fr text,
  add column if not exists subtopic_fr text,
  add column if not exists effect_type_fr text;

alter table public.competitive_technique_proposals
  add column if not exists topic_fr text,
  add column if not exists subtopic_fr text,
  add column if not exists effect_type_fr text;

update public.competitive_techniques
set
  topic_fr = coalesce(nullif(topic_fr, ''), topic),
  subtopic_fr = coalesce(nullif(subtopic_fr, ''), subtopic),
  effect_type_fr = coalesce(nullif(effect_type_fr, ''), effect_type)
where
  topic is not null
  or subtopic is not null
  or effect_type is not null;

update public.competitive_technique_catalog
set
  topic_fr = coalesce(nullif(topic_fr, ''), topic),
  subtopic_fr = coalesce(nullif(subtopic_fr, ''), subtopic),
  effect_type_fr = coalesce(nullif(effect_type_fr, ''), effect_type)
where
  topic is not null
  or subtopic is not null
  or effect_type is not null;

update public.competitive_technique_proposals
set
  topic_fr = coalesce(nullif(topic_fr, ''), topic),
  subtopic_fr = coalesce(nullif(subtopic_fr, ''), subtopic),
  effect_type_fr = coalesce(nullif(effect_type_fr, ''), effect_type)
where
  topic is not null
  or subtopic is not null
  or effect_type is not null;
