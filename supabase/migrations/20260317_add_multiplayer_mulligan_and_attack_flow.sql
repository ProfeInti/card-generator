alter table public.mp_matches
  add column if not exists setup_phase text not null default 'battle';

alter table public.mp_matches
  drop constraint if exists mp_matches_setup_phase_check;

alter table public.mp_matches
  add constraint mp_matches_setup_phase_check
  check (setup_phase in ('mulligan', 'battle'));

alter table public.mp_match_players
  add column if not exists has_completed_mulligan boolean not null default true;

alter table public.mp_match_players
  add column if not exists mulligan_completed_at timestamptz null;

update public.mp_matches
set setup_phase = 'battle'
where setup_phase is null;

update public.mp_match_players
set has_completed_mulligan = true,
    mulligan_completed_at = coalesce(mulligan_completed_at, created_at)
where has_completed_mulligan is null;

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
    setup_phase,
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
    'mulligan',
    v_player1,
    v_player2,
    v_player1,
    timezone('utc', now()) + make_interval(secs => v_turn_seconds),
    v_turn_seconds,
    1,
    timezone('utc', now()),
    null
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
    cards_in_discard,
    has_completed_mulligan,
    mulligan_completed_at
  ) values
    (v_match_id, v_player1, 30, 1, 1, 0, 0, 0, false, null),
    (v_match_id, v_player2, 30, 1, 1, 0, 0, 0, false, null);

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
  select v_match_id, 'ok'::text, 'Match created. Both players must complete mulligan before turn 1 starts.'::text;
end;
$$;

create or replace function public.mp_submit_mulligan(
  p_match_id uuid,
  p_card_ids uuid[] default array[]::uuid[]
)
returns table(
  match_id uuid,
  submitted_by uuid,
  replaced_count integer,
  setup_phase text,
  message text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.mp_matches%rowtype;
  v_player public.mp_match_players%rowtype;
  v_selected_ids uuid[];
  v_replace_count integer := 0;
  v_deck_position_base integer := 0;
  v_all_ready boolean := false;
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

  if v_match.setup_phase <> 'mulligan' then
    raise exception 'The mulligan phase has already ended.';
  end if;

  select *
  into v_player
  from public.mp_match_players p
  where p.match_id = p_match_id
    and p.user_id = auth.uid()
  for update;

  if not found then
    raise exception 'Match player state not found.';
  end if;

  if coalesce(v_player.has_completed_mulligan, false) then
    raise exception 'You already completed mulligan.';
  end if;

  select coalesce(array_agg(distinct card_id), array[]::uuid[])
  into v_selected_ids
  from unnest(coalesce(p_card_ids, array[]::uuid[])) as card_id;

  v_replace_count := coalesce(array_length(v_selected_ids, 1), 0);

  if exists (
    select 1
    from unnest(v_selected_ids) as selected_id
    where not exists (
      select 1
      from public.mp_match_cards c
      where c.id = selected_id
        and c.match_id = p_match_id
        and c.owner_user_id = auth.uid()
        and c.zone = 'hand'
        and c.source_type = 'construct'
    )
  ) then
    raise exception 'One or more selected cards are invalid for mulligan.';
  end if;

  if v_replace_count > 0 then
    select coalesce(max(c.position_index), 0)
    into v_deck_position_base
    from public.mp_match_cards c
    where c.match_id = p_match_id
      and c.owner_user_id = auth.uid()
      and c.zone = 'deck';

    update public.mp_match_cards c
    set zone = 'deck',
        position_index = v_deck_position_base + moved.rn
    from (
      select selected_id as card_id, row_number() over (order by selected_id) as rn
      from unnest(v_selected_ids) as selected_id
    ) moved
    where c.id = moved.card_id;

    with next_draws as (
      select c.id
      from public.mp_match_cards c
      where c.match_id = p_match_id
        and c.owner_user_id = auth.uid()
        and c.zone = 'deck'
      order by c.position_index asc nulls last, c.created_at asc
      limit v_replace_count
      for update
    )
    update public.mp_match_cards c
    set zone = 'hand',
        position_index = null
    from next_draws d
    where c.id = d.id;
  end if;

  with ordered_hand as (
    select c.id, row_number() over (order by c.created_at asc, c.id asc) as rn
    from public.mp_match_cards c
    where c.match_id = p_match_id
      and c.owner_user_id = auth.uid()
      and c.zone = 'hand'
  )
  update public.mp_match_cards c
  set position_index = ordered_hand.rn
  from ordered_hand
  where c.id = ordered_hand.id;

  with ordered_deck as (
    select c.id, row_number() over (order by c.position_index asc nulls last, c.created_at asc, c.id asc) as rn
    from public.mp_match_cards c
    where c.match_id = p_match_id
      and c.owner_user_id = auth.uid()
      and c.zone = 'deck'
  )
  update public.mp_match_cards c
  set position_index = ordered_deck.rn
  from ordered_deck
  where c.id = ordered_deck.id;

  update public.mp_match_players p
  set has_completed_mulligan = true,
      mulligan_completed_at = timezone('utc', now()),
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
      cards_in_discard = (
        select count(*)
        from public.mp_match_cards c
        where c.match_id = p.match_id
          and c.owner_user_id = p.user_id
          and c.zone = 'discard'
      )
  where p.id = v_player.id;

  select bool_and(coalesce(p.has_completed_mulligan, false))
  into v_all_ready
  from public.mp_match_players p
  where p.match_id = p_match_id;

  if coalesce(v_all_ready, false) then
    update public.mp_matches m
    set setup_phase = 'battle',
        current_turn_user_id = m.player1_id,
        turn_started_at = timezone('utc', now()),
        turn_deadline_at = timezone('utc', now()) + make_interval(secs => greatest(30, least(coalesce(m.turn_seconds, 75), 120)))
    where m.id = p_match_id
    returning m.setup_phase
    into setup_phase;

    message := 'Mulligan complete. Both players are ready and turn 1 has started.';
  else
    setup_phase := 'mulligan';
    message := 'Mulligan submitted. Waiting for the other player.';
  end if;

  match_id := p_match_id;
  submitted_by := auth.uid();
  replaced_count := v_replace_count;
  return next;
end;
$$;

create or replace function public.mp_play_construct_from_hand(
  p_match_id uuid,
  p_card_id uuid,
  p_slot_index integer
)
returns table(card_id uuid, match_construct_id uuid, slot_index integer, ingenuity_remaining integer, message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.mp_matches%rowtype;
  v_card public.mp_match_cards%rowtype;
  v_construct public.mp_match_constructs%rowtype;
  v_player public.mp_match_players%rowtype;
  v_cost integer;
  v_state text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  if p_slot_index not between 1 and 5 then
    raise exception 'Slot index must be between 1 and 5.';
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

  if v_match.setup_phase <> 'battle' then
    raise exception 'The match is still in mulligan.';
  end if;

  if v_match.current_turn_user_id <> auth.uid() then
    raise exception 'It is not your turn.';
  end if;

  select *
  into v_card
  from public.mp_match_cards c
  where c.id = p_card_id
    and c.match_id = p_match_id
    and c.owner_user_id = auth.uid()
  for update;

  if not found then
    raise exception 'Card not found.';
  end if;

  if v_card.source_type <> 'construct' then
    raise exception 'Only construct cards can be played with this action.';
  end if;

  if v_card.zone <> 'hand' then
    raise exception 'This construct is not in your hand.';
  end if;

  select *
  into v_construct
  from public.mp_match_constructs mc
  where mc.id = v_card.linked_match_construct_id
    and mc.match_id = p_match_id
    and mc.owner_user_id = auth.uid()
  for update;

  if not found then
    raise exception 'Linked construct snapshot not found.';
  end if;

  if exists (
    select 1
    from public.mp_match_cards c
    where c.match_id = p_match_id
      and c.owner_user_id = auth.uid()
      and c.zone = 'board'
      and c.position_index = p_slot_index
  ) then
    raise exception 'That battlefield slot is already occupied.';
  end if;

  select *
  into v_player
  from public.mp_match_players p
  where p.match_id = p_match_id
    and p.user_id = auth.uid()
  for update;

  if not found then
    raise exception 'Match player state not found.';
  end if;

  v_cost := greatest(coalesce(v_construct.ingenuity_cost, 0), 0);
  if v_player.ingenuity_current < v_cost then
    raise exception 'Not enough ingenuity to play this construct.';
  end if;

  v_state := case when coalesce(v_construct.armor, 0) > 0 then 'protected' else 'vulnerable' end;

  update public.mp_match_cards
  set zone = 'board',
      position_index = p_slot_index
  where id = v_card.id;

  update public.mp_match_constructs
  set slot_index = p_slot_index,
      state = v_state,
      has_attacked_this_turn = false,
      summoned_turn_number = v_match.turn_number,
      deconstruction_locked_until_turn = null,
      destroyed_at = null
  where id = v_construct.id;

  update public.mp_match_players
  set ingenuity_current = ingenuity_current - v_cost,
      cards_in_hand = greatest(cards_in_hand - 1, 0)
  where id = v_player.id
  returning ingenuity_current into v_cost;

  return query
  select v_card.id, v_construct.id, p_slot_index, v_cost, 'Construct played successfully.'::text;
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
  v_attacker_damage integer;
  v_retaliation_damage integer;
  v_attacker_armor integer;
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

  if v_match.setup_phase <> 'battle' then
    raise exception 'The match is still in mulligan.';
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

  if not exists (
    select 1
    from public.mp_match_cards c
    where c.match_id = p_match_id
      and c.owner_user_id = v_target.owner_user_id
      and c.linked_match_construct_id = v_target.id
      and c.zone = 'board'
  ) then
    raise exception 'The target construct is not on the battlefield.';
  end if;

  v_attacker_damage := greatest(coalesce(v_attacker.attack, 0), 0);
  v_retaliation_damage := greatest(coalesce(v_target.attack, 0), 0);

  update public.mp_match_constructs mc
  set armor = greatest(coalesce(mc.armor, 0) - v_attacker_damage, 0),
      state = case
        when greatest(coalesce(mc.armor, 0) - v_attacker_damage, 0) <= 0 then 'vulnerable'
        else 'protected'
      end
  where mc.id = v_target.id
  returning mc.armor, mc.state
  into target_armor, target_state;

  update public.mp_match_constructs mc
  set armor = greatest(coalesce(mc.armor, 0) - v_retaliation_damage, 0),
      state = case
        when greatest(coalesce(mc.armor, 0) - v_retaliation_damage, 0) <= 0 then 'vulnerable'
        else 'protected'
      end,
      has_attacked_this_turn = true
  where mc.id = v_attacker.id
  returning mc.armor
  into v_attacker_armor;

  attacker_construct_id := v_attacker.id;
  target_construct_id := v_target.id;
  target_destroyed := false;
  message := case
    when target_armor <= 0 and v_attacker_armor <= 0 then 'Combat resolved. Both constructs became vulnerable.'
    when target_armor <= 0 then 'Combat resolved. The target construct became vulnerable.'
    when v_attacker_armor <= 0 then 'Combat resolved. The attacker became vulnerable after striking.'
    else 'Combat resolved. Both constructs traded damage.'
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

  if v_match.setup_phase <> 'battle' then
    raise exception 'The match is still in mulligan.';
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

create or replace function public.mp_end_turn(p_match_id uuid)
returns table(
  match_id uuid,
  next_player_id uuid,
  turn_number integer,
  turn_deadline_at timestamptz,
  message text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.mp_matches%rowtype;
  v_next_player uuid;
  v_next_ingenuity_max integer;
  v_draw_card_id uuid;
  v_turn_seconds integer := 75;
  v_deadline_expired boolean := false;
  v_next_player_state public.mp_match_players%rowtype;
  v_next_fatigue_count integer;
  v_next_life_total integer;
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

  if v_match.setup_phase <> 'battle' then
    raise exception 'The match is still in mulligan.';
  end if;

  if auth.uid() <> v_match.player1_id and auth.uid() <> v_match.player2_id then
    raise exception 'You are not a participant in this match.';
  end if;

  v_deadline_expired := v_match.turn_deadline_at is not null and v_match.turn_deadline_at <= timezone('utc', now());

  if v_match.current_turn_user_id <> auth.uid() and not v_deadline_expired then
    raise exception 'It is not your turn.';
  end if;

  v_next_player := case
    when v_match.current_turn_user_id = v_match.player1_id then v_match.player2_id
    else v_match.player1_id
  end;

  select *
  into v_next_player_state
  from public.mp_match_players p
  where p.match_id = p_match_id
    and p.user_id = v_next_player
  for update;

  if not found then
    raise exception 'Next player state not found.';
  end if;

  v_next_ingenuity_max := least(10, coalesce(v_next_player_state.ingenuity_max, 0) + 1);

  update public.mp_match_players p
  set ingenuity_max = v_next_ingenuity_max,
      ingenuity_current = v_next_ingenuity_max
  where p.match_id = p_match_id
    and p.user_id = v_next_player;

  update public.mp_match_constructs mc
  set has_attacked_this_turn = false
  where mc.match_id = p_match_id
    and mc.owner_user_id = v_next_player
    and mc.destroyed_at is null;

  select c.id
  into v_draw_card_id
  from public.mp_match_cards c
  where c.match_id = p_match_id
    and c.owner_user_id = v_next_player
    and c.zone = 'deck'
  order by c.position_index asc nulls last, c.created_at asc
  limit 1
  for update;

  if v_draw_card_id is not null then
    update public.mp_match_cards c
    set zone = 'hand',
        position_index = null
    where c.id = v_draw_card_id;
  else
    v_next_fatigue_count := coalesce(v_next_player_state.fatigue_count, 0) + 1;

    update public.mp_match_players p
    set fatigue_count = v_next_fatigue_count,
        life_total = greatest(coalesce(p.life_total, 0) - v_next_fatigue_count, 0)
    where p.match_id = p_match_id
      and p.user_id = v_next_player
    returning p.life_total
    into v_next_life_total;

    if coalesce(v_next_life_total, 0) <= 0 then
      update public.mp_matches m
      set status = 'finished',
          winner_user_id = v_match.current_turn_user_id,
          finished_at = timezone('utc', now())
      where m.id = p_match_id
      returning m.id, m.current_turn_user_id, m.turn_number, m.turn_deadline_at
      into match_id, next_player_id, turn_number, turn_deadline_at;

      message := format(
        'Turn ended%s. %s tried to draw from an empty deck, took %s fatigue damage, and lost the match.',
        case when v_deadline_expired then ' automatically after timeout' else '' end,
        case when v_next_player = v_match.player1_id then 'Player 1' else 'Player 2' end,
        v_next_fatigue_count
      );
      return next;
    end if;
  end if;

  update public.mp_match_players p
  set cards_in_hand = (
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
      cards_in_discard = (
        select count(*)
        from public.mp_match_cards c
        where c.match_id = p.match_id
          and c.owner_user_id = p.user_id
          and c.zone = 'discard'
      )
  where p.match_id = p_match_id;

  update public.mp_matches m
  set current_turn_user_id = v_next_player,
      turn_number = coalesce(m.turn_number, 1) + 1,
      turn_started_at = timezone('utc', now()),
      turn_deadline_at = timezone('utc', now()) + make_interval(secs => v_turn_seconds),
      turn_seconds = v_turn_seconds
  where m.id = p_match_id
  returning
    m.id,
    m.current_turn_user_id,
    m.turn_number,
    m.turn_deadline_at
  into
    match_id,
    next_player_id,
    turn_number,
    turn_deadline_at;

  if v_draw_card_id is null then
    message := format(
      'Turn ended%s. The next player had no cards to draw and took %s fatigue damage.',
      case when v_deadline_expired then ' automatically after timeout' else '' end,
      coalesce(v_next_fatigue_count, 0)
    );
  else
    message := case
      when v_deadline_expired then 'Turn ended automatically after timeout. The next player drew 1 card.'
      else 'Turn ended successfully. The next player drew 1 card.'
    end;
  end if;

  return next;
end;
$$;

create or replace function public.mp_resolve_deconstruction_attempt(
  p_match_id uuid,
  p_target_construct_id uuid,
  p_technique_ids uuid[]
)
returns table(
  target_construct_id uuid,
  was_success boolean,
  target_state text,
  target_armor integer,
  target_stability_remaining integer,
  acting_player_life integer,
  match_status text,
  winner_user_id uuid,
  message text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.mp_matches%rowtype;
  v_target public.mp_match_constructs%rowtype;
  v_target_card public.mp_match_cards%rowtype;
  v_acting_player public.mp_match_players%rowtype;
  v_expected_sequence uuid[];
  v_input_sequence uuid[];
  v_recoil_damage integer;
  v_discard_index integer;
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

  if v_match.setup_phase <> 'battle' then
    raise exception 'The match is still in mulligan.';
  end if;

  if v_match.current_turn_user_id <> auth.uid() then
    raise exception 'It is not your turn.';
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

  if v_target.state <> 'vulnerable' or coalesce(v_target.armor, 0) > 0 then
    raise exception 'Only vulnerable constructs with 0 armor can be deconstructed.';
  end if;

  if coalesce(v_target.deconstruction_locked_until_turn, 0) >= coalesce(v_match.turn_number, 1) then
    raise exception 'This construct cannot be deconstructed again this turn.';
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

  select *
  into v_acting_player
  from public.mp_match_players p
  where p.match_id = p_match_id
    and p.user_id = auth.uid()
  for update;

  if not found then
    raise exception 'Acting player state not found.';
  end if;

  select array_agg(ms.technique_id order by ms.step_order asc)
  into v_expected_sequence
  from public.mp_match_steps ms
  where ms.match_construct_id = v_target.id;

  if coalesce(array_length(v_expected_sequence, 1), 0) = 0 then
    raise exception 'The target construct has no deconstruction steps.';
  end if;

  v_input_sequence := coalesce(p_technique_ids, array[]::uuid[]);

  if v_input_sequence = v_expected_sequence then
    update public.mp_match_constructs mc
    set state = 'destroyed',
        armor = 0,
        stability_remaining = 0,
        destroyed_at = timezone('utc', now()),
        deconstruction_locked_until_turn = null,
        slot_index = null
    where mc.id = v_target.id
    returning mc.state, mc.armor, mc.stability_remaining
    into target_state, target_armor, target_stability_remaining;

    select coalesce(max(c.position_index), 0) + 1
    into v_discard_index
    from public.mp_match_cards c
    where c.match_id = p_match_id
      and c.owner_user_id = v_target.owner_user_id
      and c.zone = 'discard';

    update public.mp_match_cards c
    set zone = 'discard',
        position_index = v_discard_index
    where c.id = v_target_card.id;

    update public.mp_match_players p
    set cards_in_discard = (
          select count(*)
          from public.mp_match_cards c
          where c.match_id = p.match_id
            and c.owner_user_id = p.user_id
            and c.zone = 'discard'
        )
    where p.match_id = p_match_id
      and p.user_id = v_target.owner_user_id;

    target_construct_id := v_target.id;
    was_success := true;
    acting_player_life := v_acting_player.life_total;
    match_status := v_match.status;
    winner_user_id := v_match.winner_user_id;
    message := 'Deconstruction successful. The construct was destroyed and moved to discard.';
    return next;
  end if;

  v_recoil_damage := greatest(coalesce(v_target.attack, 0), 0);

  update public.mp_match_players p
  set life_total = greatest(coalesce(p.life_total, 0) - v_recoil_damage, 0)
  where p.id = v_acting_player.id
  returning p.life_total
  into acting_player_life;

  update public.mp_match_constructs mc
  set armor = 1,
      state = 'protected',
      stability_remaining = mc.stability_total,
      deconstruction_locked_until_turn = coalesce(v_match.turn_number, 1)
  where mc.id = v_target.id
  returning mc.state, mc.armor, mc.stability_remaining
  into target_state, target_armor, target_stability_remaining;

  if acting_player_life <= 0 then
    update public.mp_matches m
    set status = 'finished',
        winner_user_id = v_target.owner_user_id,
        finished_at = timezone('utc', now())
    where m.id = p_match_id
    returning m.status, m.winner_user_id
    into match_status, winner_user_id;
  else
    match_status := v_match.status;
    winner_user_id := v_match.winner_user_id;
  end if;

  target_construct_id := v_target.id;
  was_success := false;
  message := 'Deconstruction failed. You received retaliatory damage, and the construct recovered 1 armor.';
  return next;
end;
$$;

grant execute on function public.mp_start_match(uuid, integer) to authenticated;
grant execute on function public.mp_submit_mulligan(uuid, uuid[]) to authenticated;
grant execute on function public.mp_play_construct_from_hand(uuid, uuid, integer) to authenticated;
grant execute on function public.mp_attack_construct(uuid, uuid, uuid) to authenticated;
grant execute on function public.mp_attack_player(uuid, uuid) to authenticated;
grant execute on function public.mp_end_turn(uuid) to authenticated;
grant execute on function public.mp_resolve_deconstruction_attempt(uuid, uuid, uuid[]) to authenticated;
