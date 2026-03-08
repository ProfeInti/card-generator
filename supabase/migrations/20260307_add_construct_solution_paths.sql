-- Add support for multiple solution paths per construct
-- Backward compatible: existing rows become 'main'

alter table public.competitive_construct_steps
  add column if not exists solution_path text;

update public.competitive_construct_steps
set solution_path = 'main'
where solution_path is null or btrim(solution_path) = '';

alter table public.competitive_construct_steps
  alter column solution_path set default 'main';

alter table public.competitive_construct_steps
  alter column solution_path set not null;

alter table public.competitive_construct_steps
  drop constraint if exists competitive_construct_steps_solution_path_check;

alter table public.competitive_construct_steps
  add constraint competitive_construct_steps_solution_path_check
  check (solution_path ~ '^[a-z0-9_-]+$');

create index if not exists competitive_construct_steps_construct_path_idx
  on public.competitive_construct_steps (construct_id, solution_path);

drop index if exists public.competitive_construct_steps_construct_order_uidx;

create unique index if not exists competitive_construct_steps_construct_path_order_uidx
  on public.competitive_construct_steps (construct_id, solution_path, step_order);
