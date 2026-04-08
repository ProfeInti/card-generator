-- Math Dungeons phase 2 persistence
-- Date: 2026-03-24

create extension if not exists pgcrypto;

create table if not exists public.math_dungeons (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users (id) on delete cascade,
  title text not null default '',
  theme text not null default '',
  context_text text not null default '',
  context_json jsonb not null default '{}'::jsonb,
  player_defaults jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.math_dungeon_challenges (
  id uuid primary key default gen_random_uuid(),
  dungeon_id uuid not null references public.math_dungeons (id) on delete cascade,
  sort_order integer not null default 0,
  title text not null default '',
  room_type text not null default 'riddle',
  math_topic text not null default '',
  exercise_prompt text not null default '',
  success_outcome text not null default '',
  failure_outcome text not null default '',
  challenge_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  constraint math_dungeon_challenges_room_type_check
    check (room_type in ('riddle', 'enemy', 'elite-enemy', 'boss'))
);

create table if not exists public.math_dungeon_rewards (
  id uuid primary key default gen_random_uuid(),
  dungeon_id uuid not null references public.math_dungeons (id) on delete cascade,
  sort_order integer not null default 0,
  name text not null default '',
  reward_type text not null default 'loot',
  rarity text not null default 'common',
  description text not null default '',
  reward_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  constraint math_dungeon_rewards_type_check
    check (reward_type in ('loot', 'consumable', 'key-item', 'artifact')),
  constraint math_dungeon_rewards_rarity_check
    check (rarity in ('common', 'rare', 'epic', 'legendary'))
);

create index if not exists math_dungeons_created_by_idx
  on public.math_dungeons (created_by);

create index if not exists math_dungeons_updated_at_idx
  on public.math_dungeons (updated_at desc);

create index if not exists math_dungeon_challenges_dungeon_sort_idx
  on public.math_dungeon_challenges (dungeon_id, sort_order, created_at);

create index if not exists math_dungeon_rewards_dungeon_sort_idx
  on public.math_dungeon_rewards (dungeon_id, sort_order, created_at);

create or replace function public.set_math_dungeons_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_math_dungeons_updated_at on public.math_dungeons;
create trigger trg_math_dungeons_updated_at
before update on public.math_dungeons
for each row
execute function public.set_math_dungeons_updated_at();

alter table public.math_dungeons enable row level security;
alter table public.math_dungeon_challenges enable row level security;
alter table public.math_dungeon_rewards enable row level security;

drop policy if exists "math_dungeons_select_teacher_own" on public.math_dungeons;
drop policy if exists "math_dungeons_insert_teacher_own" on public.math_dungeons;
drop policy if exists "math_dungeons_update_teacher_own" on public.math_dungeons;
drop policy if exists "math_dungeons_delete_teacher_own" on public.math_dungeons;

create policy "math_dungeons_select_teacher_own"
on public.math_dungeons
for select
to authenticated
using (
  created_by = auth.uid()
  and public.current_profile_role() = 'teacher'
);

create policy "math_dungeons_insert_teacher_own"
on public.math_dungeons
for insert
to authenticated
with check (
  created_by = auth.uid()
  and public.current_profile_role() = 'teacher'
);

create policy "math_dungeons_update_teacher_own"
on public.math_dungeons
for update
to authenticated
using (
  created_by = auth.uid()
  and public.current_profile_role() = 'teacher'
)
with check (
  created_by = auth.uid()
  and public.current_profile_role() = 'teacher'
);

create policy "math_dungeons_delete_teacher_own"
on public.math_dungeons
for delete
to authenticated
using (
  created_by = auth.uid()
  and public.current_profile_role() = 'teacher'
);

drop policy if exists "math_dungeon_challenges_select_teacher_parent" on public.math_dungeon_challenges;
drop policy if exists "math_dungeon_challenges_insert_teacher_parent" on public.math_dungeon_challenges;
drop policy if exists "math_dungeon_challenges_update_teacher_parent" on public.math_dungeon_challenges;
drop policy if exists "math_dungeon_challenges_delete_teacher_parent" on public.math_dungeon_challenges;

create policy "math_dungeon_challenges_select_teacher_parent"
on public.math_dungeon_challenges
for select
to authenticated
using (
  exists (
    select 1
    from public.math_dungeons d
    where d.id = dungeon_id
      and d.created_by = auth.uid()
      and public.current_profile_role() = 'teacher'
  )
);

create policy "math_dungeon_challenges_insert_teacher_parent"
on public.math_dungeon_challenges
for insert
to authenticated
with check (
  exists (
    select 1
    from public.math_dungeons d
    where d.id = dungeon_id
      and d.created_by = auth.uid()
      and public.current_profile_role() = 'teacher'
  )
);

create policy "math_dungeon_challenges_update_teacher_parent"
on public.math_dungeon_challenges
for update
to authenticated
using (
  exists (
    select 1
    from public.math_dungeons d
    where d.id = dungeon_id
      and d.created_by = auth.uid()
      and public.current_profile_role() = 'teacher'
  )
)
with check (
  exists (
    select 1
    from public.math_dungeons d
    where d.id = dungeon_id
      and d.created_by = auth.uid()
      and public.current_profile_role() = 'teacher'
  )
);

create policy "math_dungeon_challenges_delete_teacher_parent"
on public.math_dungeon_challenges
for delete
to authenticated
using (
  exists (
    select 1
    from public.math_dungeons d
    where d.id = dungeon_id
      and d.created_by = auth.uid()
      and public.current_profile_role() = 'teacher'
  )
);

drop policy if exists "math_dungeon_rewards_select_teacher_parent" on public.math_dungeon_rewards;
drop policy if exists "math_dungeon_rewards_insert_teacher_parent" on public.math_dungeon_rewards;
drop policy if exists "math_dungeon_rewards_update_teacher_parent" on public.math_dungeon_rewards;
drop policy if exists "math_dungeon_rewards_delete_teacher_parent" on public.math_dungeon_rewards;

create policy "math_dungeon_rewards_select_teacher_parent"
on public.math_dungeon_rewards
for select
to authenticated
using (
  exists (
    select 1
    from public.math_dungeons d
    where d.id = dungeon_id
      and d.created_by = auth.uid()
      and public.current_profile_role() = 'teacher'
  )
);

create policy "math_dungeon_rewards_insert_teacher_parent"
on public.math_dungeon_rewards
for insert
to authenticated
with check (
  exists (
    select 1
    from public.math_dungeons d
    where d.id = dungeon_id
      and d.created_by = auth.uid()
      and public.current_profile_role() = 'teacher'
  )
);

create policy "math_dungeon_rewards_update_teacher_parent"
on public.math_dungeon_rewards
for update
to authenticated
using (
  exists (
    select 1
    from public.math_dungeons d
    where d.id = dungeon_id
      and d.created_by = auth.uid()
      and public.current_profile_role() = 'teacher'
  )
)
with check (
  exists (
    select 1
    from public.math_dungeons d
    where d.id = dungeon_id
      and d.created_by = auth.uid()
      and public.current_profile_role() = 'teacher'
  )
);

create policy "math_dungeon_rewards_delete_teacher_parent"
on public.math_dungeon_rewards
for delete
to authenticated
using (
  exists (
    select 1
    from public.math_dungeons d
    where d.id = dungeon_id
      and d.created_by = auth.uid()
      and public.current_profile_role() = 'teacher'
  )
);
