alter table public.mp_match_constructs
  add column if not exists stunned_until_turn integer null;

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
      raise exception 'Player % needs at least 3 approved constructs.', v_owner;
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

create or replace function public.mp_attack_construct(
  p_match_id uuid,
  p_attacker_construct_id uuid,
  p_target_construct_id uuid
)
returns table(
  attacker_construct_id uuid,
  target_construct_id uuid,
  target_armor integer,
  target_state text,
  target_destroyed boolean,
  message text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.mp_matches%rowtype;
  v_attacker public.mp_match_constructs%rowtype;
  v_target public.mp_match_constructs%rowtype;
  v_target_card public.mp_match_cards%rowtype;
  v_damage integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  select *
  into v_match
  from public.mp_matches m
  where m.id = p_match_id
  for update;

  if not found then
    raise exception 'Match not found.';
  end if;

  if v_match.status <> 'active' then
    raise exception 'Match is not active.';
  end if;

  if v_match.current_turn_user_id <> auth.uid() then
    raise exception 'It is not your turn.';
  end if;

  select *
  into v_attacker
  from public.mp_match_constructs mc
  where mc.id = p_attacker_construct_id
    and mc.match_id = p_match_id
    and mc.owner_user_id = auth.uid()
  for update;

  if not found then
    raise exception 'Attacker construct not found.';
  end if;

  if v_attacker.destroyed_at is not null or v_attacker.state = 'destroyed' then
    raise exception 'The selected attacker is destroyed.';
  end if;

  if coalesce(v_attacker.has_attacked_this_turn, false) then
    raise exception 'This construct has already attacked this turn.';
  end if;

  if coalesce(v_attacker.attack, 0) <= 0 then
    raise exception 'This construct has no attack power.';
  end if;

  if coalesce(v_attacker.summoned_turn_number, 0) >= coalesce(v_match.turn_number, 1) then
    raise exception 'A construct cannot attack on the same turn it is summoned.';
  end if;

  if coalesce(v_attacker.stunned_until_turn, 0) >= coalesce(v_match.turn_number, 1) then
    raise exception 'This construct is stunned and cannot attack yet.';
  end if;

  if not exists (
    select 1
    from public.mp_match_cards c
    where c.match_id = p_match_id
      and c.owner_user_id = auth.uid()
      and c.linked_match_construct_id = v_attacker.id
      and c.zone = 'board'
  ) then
    raise exception 'The attacker must be on the battlefield.';
  end if;

  select *
  into v_target
  from public.mp_match_constructs mc
  where mc.id = p_target_construct_id
    and mc.match_id = p_match_id
    and mc.owner_user_id <> auth.uid()
  for update;

  if not found then
    raise exception 'Target construct not found.';
  end if;

  if v_target.destroyed_at is not null or v_target.state = 'destroyed' then
    raise exception 'The target construct is already destroyed.';
  end if;

  select *
  into v_target_card
  from public.mp_match_cards c
  where c.match_id = p_match_id
    and c.owner_user_id = v_target.owner_user_id
    and c.linked_match_construct_id = v_target.id
    and c.zone = 'board'
  for update;

  if not found then
    raise exception 'The target construct is not on the battlefield.';
  end if;

  v_damage := greatest(coalesce(v_attacker.attack, 0), 0);

  update public.mp_match_constructs mc
  set armor = greatest(coalesce(mc.armor, 0) - v_damage, 0),
      state = case
        when greatest(coalesce(mc.armor, 0) - v_damage, 0) <= 0 then 'vulnerable'
        else 'protected'
      end,
      stunned_until_turn = case
        when greatest(coalesce(mc.armor, 0) - v_damage, 0) <= 0 then coalesce(v_match.turn_number, 1) + 1
        else mc.stunned_until_turn
      end
  where mc.id = v_target.id
  returning
    mc.armor,
    mc.state
  into
    target_armor,
    target_state;

  update public.mp_match_constructs mc
  set has_attacked_this_turn = true
  where mc.id = v_attacker.id;

  attacker_construct_id := v_attacker.id;
  target_construct_id := v_target.id;
  target_destroyed := false;
  message := case
    when target_armor <= 0 then 'Attack resolved. The target construct is now vulnerable and stunned.'
    else 'Attack resolved. Target armor reduced.'
  end;
  return next;
end;
$$;

create or replace function public.mp_attack_player(
  p_match_id uuid,
  p_attacker_construct_id uuid
)
returns table(
  attacker_construct_id uuid,
  target_player_id uuid,
  target_life integer,
  winner_user_id uuid,
  match_status text,
  message text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.mp_matches%rowtype;
  v_attacker public.mp_match_constructs%rowtype;
  v_target_player public.mp_match_players%rowtype;
  v_damage integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  select *
  into v_match
  from public.mp_matches m
  where m.id = p_match_id
  for update;

  if not found then
    raise exception 'Match not found.';
  end if;

  if v_match.status <> 'active' then
    raise exception 'Match is not active.';
  end if;

  if v_match.current_turn_user_id <> auth.uid() then
    raise exception 'It is not your turn.';
  end if;

  select *
  into v_attacker
  from public.mp_match_constructs mc
  where mc.id = p_attacker_construct_id
    and mc.match_id = p_match_id
    and mc.owner_user_id = auth.uid()
  for update;

  if not found then
    raise exception 'Attacker construct not found.';
  end if;

  if v_attacker.destroyed_at is not null or v_attacker.state = 'destroyed' then
    raise exception 'The selected attacker is destroyed.';
  end if;

  if coalesce(v_attacker.has_attacked_this_turn, false) then
    raise exception 'This construct has already attacked this turn.';
  end if;

  if coalesce(v_attacker.attack, 0) <= 0 then
    raise exception 'This construct has no attack power.';
  end if;

  if coalesce(v_attacker.summoned_turn_number, 0) >= coalesce(v_match.turn_number, 1) then
    raise exception 'A construct cannot attack on the same turn it is summoned.';
  end if;

  if coalesce(v_attacker.stunned_until_turn, 0) >= coalesce(v_match.turn_number, 1) then
    raise exception 'This construct is stunned and cannot attack yet.';
  end if;

  if not exists (
    select 1
    from public.mp_match_cards c
    where c.match_id = p_match_id
      and c.owner_user_id = auth.uid()
      and c.linked_match_construct_id = v_attacker.id
      and c.zone = 'board'
  ) then
    raise exception 'The attacker must be on the battlefield.';
  end if;

  select *
  into v_target_player
  from public.mp_match_players p
  where p.match_id = p_match_id
    and p.user_id <> auth.uid()
  for update;

  if not found then
    raise exception 'Target player state not found.';
  end if;

  v_damage := greatest(coalesce(v_attacker.attack, 0), 0);

  update public.mp_match_players p
  set life_total = greatest(coalesce(p.life_total, 0) - v_damage, 0)
  where p.id = v_target_player.id
  returning p.life_total, p.user_id
  into target_life, target_player_id;

  update public.mp_match_constructs mc
  set has_attacked_this_turn = true
  where mc.id = v_attacker.id;

  if target_life <= 0 then
    update public.mp_matches m
    set status = 'finished',
        winner_user_id = auth.uid(),
        finished_at = timezone('utc', now())
    where m.id = p_match_id
    returning m.winner_user_id, m.status
    into winner_user_id, match_status;

    message := 'Direct attack resolved. The opponent reached 0 life.';
  else
    winner_user_id := v_match.winner_user_id;
    match_status := v_match.status;
    message := 'Direct attack resolved. Opponent life reduced.';
  end if;

  attacker_construct_id := v_attacker.id;
  return next;
end;
$$;

grant execute on function public.mp_start_match(uuid, integer) to authenticated;
grant execute on function public.mp_attack_construct(uuid, uuid, uuid) to authenticated;
grant execute on function public.mp_attack_player(uuid, uuid) to authenticated;
