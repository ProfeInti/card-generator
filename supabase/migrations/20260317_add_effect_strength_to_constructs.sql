alter table public.competitive_constructs
  add column if not exists effect_strength text not null default 'none';

update public.competitive_constructs
set effect_strength = 'none'
where effect_strength is null;

alter table public.competitive_constructs
  drop constraint if exists competitive_constructs_effect_strength_check;

alter table public.competitive_constructs
  add constraint competitive_constructs_effect_strength_check
  check (effect_strength in ('none', 'light', 'medium', 'strong'));
