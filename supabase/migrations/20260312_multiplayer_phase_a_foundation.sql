-- Multiplayer Phase A foundation
-- Safe to apply after the current multiplayer migrations
-- Date: 2026-03-12

alter table public.mp_matches
  add column if not exists turn_number integer not null default 1,
  add column if not exists started_at timestamptz not null default timezone('utc', now()),
  add column if not exists finished_at timestamptz null,
  add column if not exists turn_started_at timestamptz not null default timezone('utc', now());

alter table public.mp_match_constructs
  add column if not exists state text not null default 'protected',
  add column if not exists has_attacked_this_turn boolean not null default false,
  add column if not exists summoned_turn_number integer not null default 1,
  add column if not exists deconstruction_locked_until_turn integer null;

alter table public.mp_match_constructs
  drop constraint if exists mp_match_constructs_state_check;

alter table public.mp_match_constructs
  add constraint mp_match_constructs_state_check
  check (state in ('protected', 'vulnerable', 'destroyed'));

create table if not exists public.mp_match_players (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.mp_matches(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  life_total integer not null default 30,
  ingenuity_current integer not null default 1,
  ingenuity_max integer not null default 1,
  cards_in_deck integer not null default 0,
  cards_in_hand integer not null default 0,
  cards_in_discard integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (match_id, user_id),
  constraint mp_match_players_life_total_check check (life_total >= 0),
  constraint mp_match_players_ingenuity_current_check check (ingenuity_current >= 0),
  constraint mp_match_players_ingenuity_max_check check (ingenuity_max between 0 and 10),
  constraint mp_match_players_cards_in_deck_check check (cards_in_deck >= 0),
  constraint mp_match_players_cards_in_hand_check check (cards_in_hand >= 0),
  constraint mp_match_players_cards_in_discard_check check (cards_in_discard >= 0)
);

create index if not exists mp_match_players_match_idx on public.mp_match_players (match_id);
create index if not exists mp_match_players_user_idx on public.mp_match_players (user_id);

create table if not exists public.mp_match_cards (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.mp_matches(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  source_type text not null check (source_type in ('construct', 'technique', 'spell')),
  source_construct_id uuid null references public.competitive_constructs(id) on delete set null,
  source_technique_id uuid null references public.competitive_techniques(id) on delete set null,
  zone text not null check (zone in ('deck', 'hand', 'board', 'discard', 'consumed')),
  position_index integer null,
  linked_match_construct_id uuid null references public.mp_match_constructs(id) on delete set null,
  granted_by_opponent boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  constraint mp_match_cards_source_ref_check check (
    (source_type = 'construct' and source_construct_id is not null and source_technique_id is null)
    or (source_type = 'technique' and source_technique_id is not null and source_construct_id is null)
    or (source_type = 'spell')
  )
);

create index if not exists mp_match_cards_match_idx on public.mp_match_cards (match_id);
create index if not exists mp_match_cards_owner_idx on public.mp_match_cards (owner_user_id);
create index if not exists mp_match_cards_zone_idx on public.mp_match_cards (zone);
create index if not exists mp_match_cards_linked_construct_idx on public.mp_match_cards (linked_match_construct_id);

create or replace function public.set_mp_match_players_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_mp_match_players_updated_at on public.mp_match_players;
create trigger trg_mp_match_players_updated_at
before update on public.mp_match_players
for each row
execute function public.set_mp_match_players_updated_at();

alter table public.mp_match_players enable row level security;
alter table public.mp_match_cards enable row level security;

drop policy if exists "mp_match_players_select_participants" on public.mp_match_players;
create policy "mp_match_players_select_participants"
on public.mp_match_players
for select
to authenticated
using (
  exists (
    select 1
    from public.mp_matches m
    where m.id = match_id
      and (m.player1_id = auth.uid() or m.player2_id = auth.uid())
  )
);

drop policy if exists "mp_match_cards_select_participants" on public.mp_match_cards;
create policy "mp_match_cards_select_participants"
on public.mp_match_cards
for select
to authenticated
using (
  exists (
    select 1
    from public.mp_matches m
    where m.id = match_id
      and (m.player1_id = auth.uid() or m.player2_id = auth.uid())
  )
);

create or replace function public.mp_start_match(p_room_id uuid, p_turn_seconds integer default 60)
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
  v_opponent uuid;
  v_construct_id uuid;
  v_match_construct_id uuid;
  v_selected_path text;
  v_step_count integer;
  v_slot integer;
  v_hand_count integer := 4;
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
    from public.mp_room_players rp
    where rp.room_id = v_room.id
      and rp.user_id in (v_player1, v_player2)
      and coalesce(rp.is_ready, false) = false
  ) then
    raise exception 'Both players must confirm ready before starting the match.';
  end if;

  if exists (
    select 1
    from public.mp_matches m
    where m.room_id = v_room.id
      and m.status = 'active'
  ) then
    raise exception 'This room already has an active match.';
  end if;

  v_turn_seconds := greatest(30, least(coalesce(p_turn_seconds, 60), 120));

  insert into public.mp_matches (
    room_id,
    status,
    player1_id,
    player2_id,
    current_turn_user_id,
    turn_deadline_at,
    turn_seconds,
    turn_number,
    started_at,
    turn_started_at
  ) values (
    v_room.id,
    'active',
    v_player1,
    v_player2,
    v_player1,
    timezone('utc', now()) + make_interval(secs => v_turn_seconds),
    v_turn_seconds,
    1,
    timezone('utc', now()),
    timezone('utc', now())
  )
  returning id into v_match_id;

  insert into public.mp_match_players (
    match_id,
    user_id,
    life_total,
    ingenuity_current,
    ingenuity_max,
    cards_in_deck,
    cards_in_hand,
    cards_in_discard
  ) values
    (v_match_id, v_player1, 30, 1, 1, 0, 0, 0),
    (v_match_id, v_player2, 30, 1, 1, 0, 0, 0);

  foreach v_owner in array array[v_player1, v_player2]
  loop
    v_slot := 0;
    v_opponent := case when v_owner = v_player1 then v_player2 else v_player1 end;

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
        attack,
        armor,
        ingenuity_cost,
        effects,
        selected_solution_path,
        stability_total,
        stability_remaining,
        slot_index,
        state,
        has_attacked_this_turn,
        summoned_turn_number,
        deconstruction_locked_until_turn
      )
      select
        v_match_id,
        v_owner,
        c.id,
        c.exercise_id,
        c.title,
        c.description,
        c.attack,
        c.armor,
        c.ingenuity_cost,
        c.effects,
        v_selected_path,
        v_step_count,
        v_step_count,
        v_slot,
        case when coalesce(c.armor, 0) > 0 then 'protected' else 'vulnerable' end,
        false,
        1,
        null
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

      insert into public.mp_match_cards (
        match_id,
        owner_user_id,
        source_type,
        source_construct_id,
        zone,
        position_index,
        linked_match_construct_id,
        granted_by_opponent
      )
      values (
        v_match_id,
        v_owner,
        'construct',
        v_construct_id,
        case when v_slot <= v_hand_count then 'hand' else 'deck' end,
        v_slot,
        v_match_construct_id,
        false
      );

      insert into public.mp_match_cards (
        match_id,
        owner_user_id,
        source_type,
        source_technique_id,
        zone,
        position_index,
        linked_match_construct_id,
        granted_by_opponent
      )
      select
        v_match_id,
        v_opponent,
        'technique',
        s.technique_id,
        case when row_number() over (order by c.id, s.solution_path, s.step_order) <= v_hand_count then 'hand' else 'deck' end,
        row_number() over (order by c.id, s.solution_path, s.step_order),
        v_match_construct_id,
        true
      from public.competitive_construct_steps s
      join public.competitive_constructs c on c.id = s.construct_id
      where s.construct_id = v_construct_id;
    end loop;

    if v_slot < 3 then
      raise exception 'Player % needs at least 3 approved constructs.', v_owner;
    end if;
  end loop;

  update public.mp_match_players p
  set
    cards_in_hand = (
      select count(*)
      from public.mp_match_cards c
      where c.match_id = p.match_id
        and c.owner_user_id = p.user_id
        and c.zone = 'hand'
    ),
    cards_in_deck = (
      select count(*)
      from public.mp_match_cards c
      where c.match_id = p.match_id
        and c.owner_user_id = p.user_id
        and c.zone = 'deck'
    ),
    cards_in_discard = 0
  where p.match_id = v_match_id;

  update public.mp_rooms
  set status = 'in_match'
  where id = v_room.id;

  return query
  select v_match_id, 'ok'::text, 'Match created successfully.'::text;
end;
$$;
