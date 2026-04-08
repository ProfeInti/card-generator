-- Math Dungeons phase 3 runtime persistence
-- Date: 2026-03-24

alter table public.math_dungeons
  add column if not exists visibility text not null default 'private';

alter table public.math_dungeons
  drop constraint if exists math_dungeons_visibility_check;

alter table public.math_dungeons
  add constraint math_dungeons_visibility_check
  check (visibility in ('private', 'published'));

create index if not exists math_dungeons_visibility_updated_idx
  on public.math_dungeons (visibility, updated_at desc);

drop policy if exists "math_dungeons_select_teacher_own" on public.math_dungeons;

create policy "math_dungeons_select_teacher_own_or_published"
on public.math_dungeons
for select
to authenticated
using (
  visibility = 'published'
  or (
    created_by = auth.uid()
    and public.current_profile_role() = 'teacher'
  )
);

drop policy if exists "math_dungeon_challenges_select_teacher_parent" on public.math_dungeon_challenges;

create policy "math_dungeon_challenges_select_published_or_teacher_parent"
on public.math_dungeon_challenges
for select
to authenticated
using (
  exists (
    select 1
    from public.math_dungeons d
    where d.id = dungeon_id
      and (
        d.visibility = 'published'
        or (
          d.created_by = auth.uid()
          and public.current_profile_role() = 'teacher'
        )
      )
  )
);

drop policy if exists "math_dungeon_rewards_select_teacher_parent" on public.math_dungeon_rewards;

create policy "math_dungeon_rewards_select_published_or_teacher_parent"
on public.math_dungeon_rewards
for select
to authenticated
using (
  exists (
    select 1
    from public.math_dungeons d
    where d.id = dungeon_id
      and (
        d.visibility = 'published'
        or (
          d.created_by = auth.uid()
          and public.current_profile_role() = 'teacher'
        )
      )
  )
);

create table if not exists public.math_dungeon_characters (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  name text not null default '',
  class_id text not null default 'scribe',
  level integer not null default 1,
  experience integer not null default 0,
  base_stats jsonb not null default '{}'::jsonb,
  current_stats jsonb not null default '{}'::jsonb,
  inventory jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint math_dungeon_characters_level_check check (level >= 1),
  constraint math_dungeon_characters_experience_check check (experience >= 0)
);

create table if not exists public.math_dungeon_runs (
  id uuid primary key default gen_random_uuid(),
  player_user_id uuid not null references auth.users (id) on delete cascade,
  character_id uuid not null references public.math_dungeon_characters (id) on delete cascade,
  dungeon_id uuid not null references public.math_dungeons (id) on delete cascade,
  status text not null default 'active',
  current_room_id text not null default '',
  character_snapshot jsonb not null default '{}'::jsonb,
  state_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint math_dungeon_runs_status_check
    check (status in ('active', 'completed', 'failed', 'abandoned'))
);

create index if not exists math_dungeon_characters_owner_updated_idx
  on public.math_dungeon_characters (owner_user_id, updated_at desc);

create index if not exists math_dungeon_runs_player_updated_idx
  on public.math_dungeon_runs (player_user_id, updated_at desc);

create or replace function public.set_math_dungeon_characters_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_math_dungeon_characters_updated_at on public.math_dungeon_characters;
create trigger trg_math_dungeon_characters_updated_at
before update on public.math_dungeon_characters
for each row
execute function public.set_math_dungeon_characters_updated_at();

create or replace function public.set_math_dungeon_runs_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_math_dungeon_runs_updated_at on public.math_dungeon_runs;
create trigger trg_math_dungeon_runs_updated_at
before update on public.math_dungeon_runs
for each row
execute function public.set_math_dungeon_runs_updated_at();

alter table public.math_dungeon_characters enable row level security;
alter table public.math_dungeon_runs enable row level security;

drop policy if exists "math_dungeon_characters_select_own" on public.math_dungeon_characters;
drop policy if exists "math_dungeon_characters_insert_own" on public.math_dungeon_characters;
drop policy if exists "math_dungeon_characters_update_own" on public.math_dungeon_characters;
drop policy if exists "math_dungeon_characters_delete_own" on public.math_dungeon_characters;

create policy "math_dungeon_characters_select_own"
on public.math_dungeon_characters
for select
to authenticated
using (owner_user_id = auth.uid());

create policy "math_dungeon_characters_insert_own"
on public.math_dungeon_characters
for insert
to authenticated
with check (owner_user_id = auth.uid());

create policy "math_dungeon_characters_update_own"
on public.math_dungeon_characters
for update
to authenticated
using (owner_user_id = auth.uid())
with check (owner_user_id = auth.uid());

create policy "math_dungeon_characters_delete_own"
on public.math_dungeon_characters
for delete
to authenticated
using (owner_user_id = auth.uid());

drop policy if exists "math_dungeon_runs_select_own" on public.math_dungeon_runs;
drop policy if exists "math_dungeon_runs_insert_own" on public.math_dungeon_runs;
drop policy if exists "math_dungeon_runs_update_own" on public.math_dungeon_runs;
drop policy if exists "math_dungeon_runs_delete_own" on public.math_dungeon_runs;

create policy "math_dungeon_runs_select_own"
on public.math_dungeon_runs
for select
to authenticated
using (player_user_id = auth.uid());

create policy "math_dungeon_runs_insert_own"
on public.math_dungeon_runs
for insert
to authenticated
with check (
  player_user_id = auth.uid()
  and exists (
    select 1
    from public.math_dungeon_characters c
    where c.id = character_id
      and c.owner_user_id = auth.uid()
  )
  and exists (
    select 1
    from public.math_dungeons d
    where d.id = dungeon_id
      and (
        d.visibility = 'published'
        or (
          d.created_by = auth.uid()
          and public.current_profile_role() = 'teacher'
        )
      )
  )
);

create policy "math_dungeon_runs_update_own"
on public.math_dungeon_runs
for update
to authenticated
using (player_user_id = auth.uid())
with check (player_user_id = auth.uid());

create policy "math_dungeon_runs_delete_own"
on public.math_dungeon_runs
for delete
to authenticated
using (player_user_id = auth.uid());
