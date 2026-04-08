alter table public.competitive_techniques
  add column if not exists sympy_transformation text;

alter table public.competitive_technique_catalog
  add column if not exists sympy_transformation text;

alter table public.competitive_technique_proposals
  add column if not exists sympy_transformation text;
