alter table public.whiteboard_workspaces
  add column if not exists notebook_state jsonb not null default '{}'::jsonb;
