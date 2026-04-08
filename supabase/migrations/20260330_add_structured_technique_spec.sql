alter table public.competitive_techniques
  add column if not exists structured_technique_spec jsonb;

alter table public.competitive_technique_catalog
  add column if not exists structured_technique_spec jsonb;

alter table public.competitive_technique_proposals
  add column if not exists structured_technique_spec jsonb;
