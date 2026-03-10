-- Add battle-ready stats to competitive constructs
-- Date: 2026-03-10

alter table public.competitive_constructs
  add column if not exists attack integer not null default 0,
  add column if not exists armor integer not null default 0,
  add column if not exists effects text;

alter table public.competitive_constructs
  drop constraint if exists competitive_constructs_attack_check;

alter table public.competitive_constructs
  add constraint competitive_constructs_attack_check
  check (attack >= 0);

alter table public.competitive_constructs
  drop constraint if exists competitive_constructs_armor_check;

alter table public.competitive_constructs
  add constraint competitive_constructs_armor_check
  check (armor >= 0);
