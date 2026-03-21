-- Collaborative whiteboard workspaces
-- Date: 2026-03-20

create extension if not exists pgcrypto;

create table if not exists public.whiteboard_workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  last_editor_user_id uuid references auth.users (id) on delete set null,
  exercise_local_id text not null,
  exercise_title text not null default '',
  exercise_snapshot jsonb not null default '{}'::jsonb,
  nodes jsonb not null default '[]'::jsonb,
  links jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint whiteboard_workspaces_owner_exercise_unique unique (owner_user_id, exercise_local_id)
);

create index if not exists whiteboard_workspaces_owner_idx
  on public.whiteboard_workspaces (owner_user_id);

create index if not exists whiteboard_workspaces_updated_at_idx
  on public.whiteboard_workspaces (updated_at desc);

create or replace function public.set_whiteboard_workspaces_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_whiteboard_workspaces_updated_at on public.whiteboard_workspaces;
create trigger trg_whiteboard_workspaces_updated_at
before update on public.whiteboard_workspaces
for each row
execute function public.set_whiteboard_workspaces_updated_at();

alter table public.whiteboard_workspaces enable row level security;

create policy "whiteboard_workspaces_select_own"
on public.whiteboard_workspaces
for select
to authenticated
using (owner_user_id = auth.uid());

create policy "whiteboard_workspaces_insert_own"
on public.whiteboard_workspaces
for insert
to authenticated
with check (owner_user_id = auth.uid());

create policy "whiteboard_workspaces_update_own"
on public.whiteboard_workspaces
for update
to authenticated
using (owner_user_id = auth.uid())
with check (owner_user_id = auth.uid());

create policy "whiteboard_workspaces_delete_own"
on public.whiteboard_workspaces
for delete
to authenticated
using (owner_user_id = auth.uid());

alter publication supabase_realtime add table public.whiteboard_workspaces;
