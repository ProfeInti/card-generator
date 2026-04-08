alter table public.competitive_techniques
  add column if not exists application_structure text,
  add column if not exists application_structure_fr text;

alter table public.competitive_technique_catalog
  add column if not exists application_structure text,
  add column if not exists application_structure_fr text;

alter table public.competitive_technique_proposals
  add column if not exists application_structure text,
  add column if not exists application_structure_fr text;

update public.competitive_techniques
set
  application_structure = coalesce(nullif(application_structure, ''), nullif(worked_example, ''), nullif(effect_description, '')),
  application_structure_fr = coalesce(nullif(application_structure_fr, ''), nullif(worked_example_fr, ''), nullif(effect_description_fr, ''), nullif(application_structure, ''))
where application_structure is null
   or application_structure = ''
   or application_structure_fr is null
   or application_structure_fr = '';

update public.competitive_technique_catalog
set
  application_structure = coalesce(nullif(application_structure, ''), nullif(worked_example, ''), nullif(effect_description, '')),
  application_structure_fr = coalesce(nullif(application_structure_fr, ''), nullif(worked_example_fr, ''), nullif(effect_description_fr, ''), nullif(application_structure, ''))
where application_structure is null
   or application_structure = ''
   or application_structure_fr is null
   or application_structure_fr = '';

update public.competitive_technique_proposals
set
  application_structure = coalesce(nullif(application_structure, ''), nullif(worked_example, ''), nullif(effect_description, '')),
  application_structure_fr = coalesce(nullif(application_structure_fr, ''), nullif(worked_example_fr, ''), nullif(effect_description_fr, ''), nullif(application_structure, ''))
where application_structure is null
   or application_structure = ''
   or application_structure_fr is null
   or application_structure_fr = '';
