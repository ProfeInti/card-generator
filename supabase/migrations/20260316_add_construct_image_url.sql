alter table public.competitive_constructs
  add column if not exists image_url text;

alter table public.mp_match_constructs
  add column if not exists image_url text;

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

grant execute on function public.mp_start_match(uuid, integer) to authenticated;
