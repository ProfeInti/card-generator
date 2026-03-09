-- Multiplayer duel snapshot foundation (phase 2)
-- Date: 2026-03-10

create table if not exists public.mp_matches (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.mp_rooms(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'finished', 'cancelled')),
  player1_id uuid not null references auth.users(id) on delete cascade,
  player2_id uuid not null references auth.users(id) on delete cascade,
  current_turn_user_id uuid not null references auth.users(id) on delete cascade,
  turn_deadline_at timestamptz not null,
  turn_seconds integer not null default 10 check (turn_seconds between 5 and 60),
  winner_user_id uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint mp_matches_players_distinct check (player1_id <> player2_id)
);

create index if not exists mp_matches_room_idx on public.mp_matches (room_id);
create index if not exists mp_matches_status_idx on public.mp_matches (status);
create index if not exists mp_matches_created_at_idx on public.mp_matches (created_at desc);

create unique index if not exists mp_matches_one_active_per_room_uidx
  on public.mp_matches (room_id)
  where status = 'active';

create table if not exists public.mp_match_constructs (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.mp_matches(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  source_construct_id uuid not null references public.competitive_constructs(id) on delete restrict,
  source_exercise_id uuid not null references public.competitive_exercises(id) on delete restrict,
  title text not null,
  description text null,
  selected_solution_path text not null,
  stability_total integer not null check (stability_total > 0),
  stability_remaining integer not null check (stability_remaining >= 0),
  slot_index integer not null check (slot_index between 1 and 3),
  destroyed_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (match_id, owner_user_id, slot_index)
);

create index if not exists mp_match_constructs_match_idx on public.mp_match_constructs (match_id);
create index if not exists mp_match_constructs_owner_idx on public.mp_match_constructs (owner_user_id);

create table if not exists public.mp_match_steps (
  id uuid primary key default gen_random_uuid(),
  match_construct_id uuid not null references public.mp_match_constructs(id) on delete cascade,
  step_order integer not null check (step_order > 0),
  source_step_id uuid not null references public.competitive_construct_steps(id) on delete restrict,
  technique_id uuid not null references public.competitive_techniques(id) on delete restrict,
  progress_state text not null,
  explanation text null,
  solution_path text not null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (match_construct_id, step_order)
);

create index if not exists mp_match_steps_construct_idx on public.mp_match_steps (match_construct_id);

create or replace function public.set_mp_matches_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_mp_matches_updated_at on public.mp_matches;
create trigger trg_mp_matches_updated_at
before update on public.mp_matches
for each row
execute function public.set_mp_matches_updated_at();

create or replace function public.mp_start_match(p_room_id uuid, p_turn_seconds integer default 10)
returns table(match_id uuid, status text, message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.mp_rooms%rowtype;
  v_player1 uuid;
  v_player2 uuid;
  v_match_id uuid;
  v_turn_seconds integer;
  v_owner uuid;
  v_construct_id uuid;
  v_match_construct_id uuid;
  v_selected_path text;
  v_step_count integer;
  v_slot integer;
begin
  select *
  into v_room
  from public.mp_rooms r
  where r.id = p_room_id
  for update;

  if not found then
    raise exception 'Room not found.';
  end if;

  if not public.mp_is_room_member(v_room.id, auth.uid()) then
    raise exception 'You are not a member of this room.';
  end if;

  if v_room.status <> 'open' then
    raise exception 'Room is not open.';
  end if;

  select rp.user_id
  into v_player1
  from public.mp_room_players rp
  where rp.room_id = v_room.id
  order by rp.joined_at asc
  limit 1;

  select rp.user_id
  into v_player2
  from public.mp_room_players rp
  where rp.room_id = v_room.id
  order by rp.joined_at asc
  offset 1
  limit 1;

  if v_player1 is null or v_player2 is null then
    raise exception 'Two players are required to start a match.';
  end if;

  if exists (
    select 1
    from public.mp_matches m
    where m.room_id = v_room.id
      and m.status = 'active'
  ) then
    raise exception 'This room already has an active match.';
  end if;

  v_turn_seconds := greatest(5, least(coalesce(p_turn_seconds, 10), 60));

  insert into public.mp_matches (
    room_id,
    status,
    player1_id,
    player2_id,
    current_turn_user_id,
    turn_deadline_at,
    turn_seconds
  ) values (
    v_room.id,
    'active',
    v_player1,
    v_player2,
    v_player1,
    timezone('utc', now()) + make_interval(secs => v_turn_seconds),
    v_turn_seconds
  )
  returning id into v_match_id;

  foreach v_owner in array array[v_player1, v_player2]
  loop
    v_slot := 0;

    for v_construct_id in
      select c.id
      from public.competitive_constructs c
      where c.created_by = v_owner
        and c.status = 'approved'
      order by c.updated_at desc, c.created_at desc
      limit 3
    loop
      v_slot := v_slot + 1;

      select coalesce(
        (
          select s.solution_path
          from public.competitive_construct_steps s
          where s.construct_id = v_construct_id
            and s.solution_path = 'main'
          order by s.step_order asc
          limit 1
        ),
        (
          select s.solution_path
          from public.competitive_construct_steps s
          where s.construct_id = v_construct_id
          order by s.solution_path asc, s.step_order asc
          limit 1
        )
      )
      into v_selected_path;

      if v_selected_path is null then
        raise exception 'Construct % has no steps.', v_construct_id;
      end if;

      select count(*)
      into v_step_count
      from public.competitive_construct_steps s
      where s.construct_id = v_construct_id
        and s.solution_path = v_selected_path;

      if coalesce(v_step_count, 0) <= 0 then
        raise exception 'Construct % has no steps in selected path.', v_construct_id;
      end if;

      insert into public.mp_match_constructs (
        match_id,
        owner_user_id,
        source_construct_id,
        source_exercise_id,
        title,
        description,
        selected_solution_path,
        stability_total,
        stability_remaining,
        slot_index
      )
      select
        v_match_id,
        v_owner,
        c.id,
        c.exercise_id,
        c.title,
        c.description,
        v_selected_path,
        v_step_count,
        v_step_count,
        v_slot
      from public.competitive_constructs c
      where c.id = v_construct_id
      returning id into v_match_construct_id;

      insert into public.mp_match_steps (
        match_construct_id,
        step_order,
        source_step_id,
        technique_id,
        progress_state,
        explanation,
        solution_path
      )
      select
        v_match_construct_id,
        s.step_order,
        s.id,
        s.technique_id,
        s.progress_state,
        s.explanation,
        s.solution_path
      from public.competitive_construct_steps s
      where s.construct_id = v_construct_id
        and s.solution_path = v_selected_path
      order by s.step_order asc;
    end loop;

    if v_slot < 3 then
      raise exception 'Player % needs at least 3 approved constructs.', v_owner;
    end if;
  end loop;

  update public.mp_rooms
  set status = 'in_match'
  where id = v_room.id;

  return query
  select v_match_id, 'ok'::text, 'Match created successfully.'::text;
end;
$$;

grant execute on function public.mp_start_match(uuid, integer) to authenticated;

alter table public.mp_matches enable row level security;
alter table public.mp_match_constructs enable row level security;
alter table public.mp_match_steps enable row level security;

drop policy if exists "mp_matches_select_participants" on public.mp_matches;
drop policy if exists "mp_match_constructs_select_participants" on public.mp_match_constructs;
drop policy if exists "mp_match_steps_select_participants" on public.mp_match_steps;

create policy "mp_matches_select_participants"
on public.mp_matches
for select
to authenticated
using (
  player1_id = auth.uid()
  or player2_id = auth.uid()
  or exists (
    select 1
    from public.mp_rooms r
    where r.id = room_id
      and r.created_by = auth.uid()
  )
);

create policy "mp_match_constructs_select_participants"
on public.mp_match_constructs
for select
to authenticated
using (
  exists (
    select 1
    from public.mp_matches m
    where m.id = match_id
      and (
        m.player1_id = auth.uid()
        or m.player2_id = auth.uid()
      )
  )
);

create policy "mp_match_steps_select_participants"
on public.mp_match_steps
for select
to authenticated
using (
  exists (
    select 1
    from public.mp_match_constructs mc
    join public.mp_matches m on m.id = mc.match_id
    where mc.id = match_construct_id
      and (
        m.player1_id = auth.uid()
        or m.player2_id = auth.uid()
      )
  )
);
