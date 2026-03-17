create table if not exists public.mp_player_decks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Multiplayer Deck' check (char_length(trim(name)) between 3 and 80),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id)
);

create table if not exists public.mp_player_deck_items (
  id uuid primary key default gen_random_uuid(),
  deck_id uuid not null references public.mp_player_decks(id) on delete cascade,
  construct_id uuid not null references public.competitive_constructs(id) on delete cascade,
  position_index integer not null check (position_index > 0),
  created_at timestamptz not null default timezone('utc', now()),
  unique (deck_id, construct_id),
  unique (deck_id, position_index)
);

create index if not exists mp_player_decks_user_id_idx on public.mp_player_decks (user_id);
create index if not exists mp_player_deck_items_deck_id_idx on public.mp_player_deck_items (deck_id);
create index if not exists mp_player_deck_items_construct_id_idx on public.mp_player_deck_items (construct_id);
create index if not exists mp_player_deck_items_position_idx on public.mp_player_deck_items (deck_id, position_index);

create or replace function public.set_mp_player_decks_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_mp_player_decks_updated_at on public.mp_player_decks;
create trigger trg_mp_player_decks_updated_at
before update on public.mp_player_decks
for each row
execute function public.set_mp_player_decks_updated_at();

create or replace function public.touch_mp_player_deck()
returns trigger
language plpgsql
as $$
begin
  update public.mp_player_decks
  set updated_at = timezone('utc', now())
  where id = coalesce(new.deck_id, old.deck_id);

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_mp_player_deck_items_touch_deck on public.mp_player_deck_items;
create trigger trg_mp_player_deck_items_touch_deck
after insert or update or delete on public.mp_player_deck_items
for each row
execute function public.touch_mp_player_deck();

alter table public.mp_player_decks enable row level security;
alter table public.mp_player_deck_items enable row level security;

drop policy if exists "mp_player_decks_select_own" on public.mp_player_decks;
drop policy if exists "mp_player_decks_insert_own" on public.mp_player_decks;
drop policy if exists "mp_player_decks_update_own" on public.mp_player_decks;
drop policy if exists "mp_player_decks_delete_own" on public.mp_player_decks;

create policy "mp_player_decks_select_own"
on public.mp_player_decks
for select
to authenticated
using (user_id = auth.uid());

create policy "mp_player_decks_insert_own"
on public.mp_player_decks
for insert
to authenticated
with check (user_id = auth.uid());

create policy "mp_player_decks_update_own"
on public.mp_player_decks
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "mp_player_decks_delete_own"
on public.mp_player_decks
for delete
to authenticated
using (user_id = auth.uid());

drop policy if exists "mp_player_deck_items_select_own" on public.mp_player_deck_items;
drop policy if exists "mp_player_deck_items_insert_own" on public.mp_player_deck_items;
drop policy if exists "mp_player_deck_items_update_own" on public.mp_player_deck_items;
drop policy if exists "mp_player_deck_items_delete_own" on public.mp_player_deck_items;

create policy "mp_player_deck_items_select_own"
on public.mp_player_deck_items
for select
to authenticated
using (
  exists (
    select 1
    from public.mp_player_decks d
    where d.id = deck_id
      and d.user_id = auth.uid()
  )
);

create policy "mp_player_deck_items_insert_own"
on public.mp_player_deck_items
for insert
to authenticated
with check (
  exists (
    select 1
    from public.mp_player_decks d
    join public.competitive_constructs c on c.id = construct_id
    where d.id = deck_id
      and d.user_id = auth.uid()
      and c.created_by = auth.uid()
      and c.status = 'approved'
  )
);

create policy "mp_player_deck_items_update_own"
on public.mp_player_deck_items
for update
to authenticated
using (
  exists (
    select 1
    from public.mp_player_decks d
    where d.id = deck_id
      and d.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.mp_player_decks d
    join public.competitive_constructs c on c.id = construct_id
    where d.id = deck_id
      and d.user_id = auth.uid()
      and c.created_by = auth.uid()
      and c.status = 'approved'
  )
);

create policy "mp_player_deck_items_delete_own"
on public.mp_player_deck_items
for delete
to authenticated
using (
  exists (
    select 1
    from public.mp_player_decks d
    where d.id = deck_id
      and d.user_id = auth.uid()
  )
);

create or replace function public.mp_start_match(p_room_id uuid, p_turn_seconds integer default 75)
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
  v_hand_count integer := 4;
  v_owner_position_base integer;
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

  v_turn_seconds := greatest(30, least(coalesce(p_turn_seconds, 75), 120));

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

    for v_construct_id in
      select di.construct_id
      from public.mp_player_decks d
      join public.mp_player_deck_items di on di.deck_id = d.id
      join public.competitive_constructs c on c.id = di.construct_id
      where d.user_id = v_owner
        and c.created_by = v_owner
        and c.status = 'approved'
      order by di.position_index asc, di.created_at asc, di.construct_id asc
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
        image_url,
        attack,
        armor,
        ingenuity_cost,
        effects,
        exercise_statement,
        exercise_final_answer,
        selected_solution_path,
        stability_total,
        stability_remaining,
        slot_index,
        state,
        has_attacked_this_turn,
        summoned_turn_number,
        deconstruction_locked_until_turn,
        stunned_until_turn
      )
      select
        v_match_id,
        v_owner,
        c.id,
        c.exercise_id,
        c.title,
        c.description,
        c.image_url,
        c.attack,
        c.armor,
        c.ingenuity_cost,
        c.effects,
        e.statement,
        e.final_answer,
        v_selected_path,
        v_step_count,
        v_step_count,
        null,
        case when coalesce(c.armor, 0) > 0 then 'protected' else 'vulnerable' end,
        false,
        1,
        null,
        null
      from public.competitive_constructs c
      join public.competitive_exercises e on e.id = c.exercise_id
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

      select coalesce(max(c.position_index), 0)
      into v_owner_position_base
      from public.mp_match_cards c
      where c.match_id = v_match_id
        and c.owner_user_id = v_owner;

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
        'deck',
        v_owner_position_base + 1,
        v_match_construct_id,
        false
      );
    end loop;

    if v_slot < 3 then
      raise exception 'Player % needs at least 3 approved constructs in the multiplayer deck.', v_owner;
    end if;
  end loop;

  with player_cards as (
    select
      c.id,
      c.owner_user_id,
      row_number() over (
        partition by c.owner_user_id
        order by c.position_index asc nulls last, c.created_at asc
      ) as rn
    from public.mp_match_cards c
    where c.match_id = v_match_id
      and c.zone = 'deck'
  )
  update public.mp_match_cards c
  set zone = 'hand',
      position_index = pc.rn
  from player_cards pc
  where c.id = pc.id
    and pc.rn <= v_hand_count;

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

grant execute on function public.mp_start_match(uuid, integer) to authenticated;
