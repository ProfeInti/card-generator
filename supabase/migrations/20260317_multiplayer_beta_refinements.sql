alter table public.mp_matches
  add column if not exists last_resolution_kind text null,
  add column if not exists last_resolution_title text null,
  add column if not exists last_resolution_summary text null,
  add column if not exists last_resolution_step_label text null,
  add column if not exists last_resolution_effect text null,
  add column if not exists last_resolution_actor_id uuid null references auth.users(id) on delete set null,
  add column if not exists last_resolution_created_at timestamptz null;

alter table public.mp_match_cards
  add column if not exists art_url text,
  add column if not exists technique_name text,
  add column if not exists technique_topic text,
  add column if not exists technique_subtopic text,
  add column if not exists technique_effect_type text,
  add column if not exists technique_effect_description text,
  add column if not exists technique_worked_example text;

alter table public.mp_match_players
  add column if not exists turns_started integer not null default 0;

alter table public.mp_match_players
  drop constraint if exists mp_match_players_turns_started_check;

alter table public.mp_match_players
  add constraint mp_match_players_turns_started_check check (turns_started >= 0);

create or replace function public.mp_start_match(p_room_id uuid, p_turn_seconds integer default 120)
returns table(match_id uuid, status text, message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.mp_rooms%rowtype;
  v_player1 uuid;
  v_player2 uuid;
  v_starting_player uuid;
  v_second_player uuid;
  v_match_id uuid;
  v_turn_seconds integer := 120;
  v_owner uuid;
  v_construct_id uuid;
  v_match_construct_id uuid;
  v_selected_path text;
  v_step_count integer;
  v_slot integer;
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

  if random() < 0.5 then
    v_starting_player := v_player1;
    v_second_player := v_player2;
  else
    v_starting_player := v_player2;
    v_second_player := v_player1;
  end if;

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
    turn_started_at,
    last_resolution_kind,
    last_resolution_title,
    last_resolution_summary,
    last_resolution_step_label,
    last_resolution_effect,
    last_resolution_actor_id,
    last_resolution_created_at
  ) values (
    v_room.id,
    'active',
    'mulligan',
    v_player1,
    v_player2,
    v_starting_player,
    timezone('utc', now()) + make_interval(secs => v_turn_seconds),
    v_turn_seconds,
    1,
    timezone('utc', now()),
    timezone('utc', now()),
    null,
    null,
    null,
    null,
    null,
    null,
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
    turns_started,
    has_completed_mulligan,
    mulligan_completed_at
  ) values
    (v_match_id, v_player1, 30, 0, 0, 0, 0, 0, 0, false, null),
    (v_match_id, v_player2, 30, 0, 0, 0, 0, 0, 0, false, null);

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

  with shuffled_deck as (
    select
      c.id,
      row_number() over (
        partition by c.owner_user_id
        order by random(), c.created_at asc, c.id asc
      ) as rn
    from public.mp_match_cards c
    where c.match_id = v_match_id
      and c.zone = 'deck'
      and c.source_type = 'construct'
  )
  update public.mp_match_cards c
  set position_index = shuffled_deck.rn
  from shuffled_deck
  where c.id = shuffled_deck.id;

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
      and c.source_type = 'construct'
  )
  update public.mp_match_cards c
  set zone = 'hand',
      position_index = pc.rn
  from player_cards pc
  where c.id = pc.id
    and pc.rn <= case
      when pc.owner_user_id = v_starting_player then 3
      else 4
    end;

  insert into public.mp_match_cards (
    match_id,
    owner_user_id,
    source_type,
    art_url,
    source_construct_id,
    source_technique_id,
    technique_name,
    technique_topic,
    technique_subtopic,
    technique_effect_type,
    technique_effect_description,
    technique_worked_example,
    zone,
    position_index,
    linked_match_construct_id,
    granted_by_opponent
  )
  values (
    v_match_id,
    v_second_player,
    'spell',
    'https://i.ibb.co/S4dZwDB8/pngtree-cat-with-glasses-meme-sticker-tshirt-illustration-png-image-15380701.png',
    null,
    null,
    'Chispa de Ingenio',
    'Special',
    'Opening Bonus',
    'Mana Boost',
    '<p>Gain 1 ingenuity for this turn only.</p>',
    '<p>Second player bonus card.</p>',
    'hand',
    999,
    null,
    false
  );

  with ordered_hands as (
    select
      c.id,
      row_number() over (
        partition by c.owner_user_id
        order by c.position_index asc nulls last, c.created_at asc, c.id asc
      ) as rn
    from public.mp_match_cards c
    where c.match_id = v_match_id
      and c.zone = 'hand'
  )
  update public.mp_match_cards c
  set position_index = ordered_hands.rn
  from ordered_hands
  where c.id = ordered_hands.id;

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
  select v_match_id, 'ok'::text, 'Match created. Decks were shuffled, the starting player was chosen at random, and mulligan has begun.'::text;
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
  v_opening_draw_card_id uuid;
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

    with shuffled_draws as (
      select c.id
      from public.mp_match_cards c
      where c.match_id = p_match_id
        and c.owner_user_id = auth.uid()
        and c.zone = 'deck'
        and c.source_type = 'construct'
      order by c.position_index asc nulls last, c.created_at asc
      limit v_replace_count
      for update
    )
    update public.mp_match_cards c
    set zone = 'hand',
        position_index = null
    from shuffled_draws d
    where c.id = d.id;
  end if;

  with ordered_hand as (
    select c.id, row_number() over (order by c.position_index asc nulls last, c.created_at asc, c.id asc) as rn
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
    select c.id
    into v_opening_draw_card_id
    from public.mp_match_cards c
    where c.match_id = p_match_id
      and c.owner_user_id = v_match.current_turn_user_id
      and c.zone = 'deck'
      and c.source_type = 'construct'
    order by c.position_index asc nulls last, c.created_at asc
    limit 1
    for update;

    if v_opening_draw_card_id is not null then
      update public.mp_match_cards c
      set zone = 'hand',
          position_index = null
      where c.id = v_opening_draw_card_id;
    end if;

    update public.mp_match_players p
    set turns_started = case
          when p.user_id = v_match.current_turn_user_id then 1
          else 0
        end,
        ingenuity_max = case
          when p.user_id = v_match.current_turn_user_id then 1
          else 0
        end,
        ingenuity_current = case
          when p.user_id = v_match.current_turn_user_id then 1
          else 0
        end,
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
    where p.match_id = p_match_id;

    update public.mp_matches m
    set setup_phase = 'battle',
        turn_started_at = timezone('utc', now()),
        turn_deadline_at = timezone('utc', now()) + make_interval(secs => 120)
    where m.id = p_match_id
    returning m.setup_phase
    into setup_phase;

    message := 'Mulligan complete. The starting player drew their opening turn card and the battle has begun.';
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

create or replace function public.mp_play_spell_card(
  p_match_id uuid,
  p_card_id uuid
)
returns table(card_id uuid, ingenuity_current integer, message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.mp_matches%rowtype;
  v_card public.mp_match_cards%rowtype;
  v_player public.mp_match_players%rowtype;
  v_ingenuity_max integer;
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
  into v_card
  from public.mp_match_cards c
  where c.id = p_card_id
    and c.match_id = p_match_id
    and c.owner_user_id = auth.uid()
  for update;

  if not found then
    raise exception 'Spell card not found.';
  end if;

  if v_card.source_type <> 'spell' or v_card.zone <> 'hand' then
    raise exception 'Only a spell in hand can be used here.';
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

  update public.mp_match_cards c
  set zone = 'consumed',
      position_index = null
  where c.id = v_card.id;

  v_ingenuity_max := greatest(coalesce(v_player.ingenuity_max, 0), 0);

  update public.mp_match_players p
  set ingenuity_current = least(10, greatest(coalesce(p.ingenuity_current, 0), v_ingenuity_max) + 1),
      cards_in_hand = greatest(cards_in_hand - 1, 0)
  where p.id = v_player.id
  returning p.ingenuity_current
  into ingenuity_current;

  card_id := v_card.id;
  message := 'Chispa de Ingenio resolved. You gained 1 ingenuity for this turn.';
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
  v_turn_seconds integer := 120;
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

  v_next_ingenuity_max := least(10, coalesce(v_next_player_state.turns_started, 0) + 1);

  update public.mp_match_players p
  set turns_started = coalesce(p.turns_started, 0) + 1,
      ingenuity_max = v_next_ingenuity_max,
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
  v_attempt_step integer;
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
  v_attempt_step := greatest(1, coalesce(array_length(v_input_sequence, 1), 1));

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

    update public.mp_matches m
    set last_resolution_kind = 'deconstruction_success',
        last_resolution_title = 'Deconstruction Successful',
        last_resolution_summary = coalesce(v_target.title, 'Construct') || ' was fully deconstructed.',
        last_resolution_step_label = 'Final sequence',
        last_resolution_effect = 'The construct was destroyed and moved to discard.',
        last_resolution_actor_id = auth.uid(),
        last_resolution_created_at = timezone('utc', now())
    where m.id = p_match_id;

    target_construct_id := v_target.id;
    was_success := true;
    acting_player_life := v_acting_player.life_total;
    match_status := v_match.status;
    winner_user_id := v_match.winner_user_id;
    message := 'Deconstruction successful. The construct was destroyed and moved to discard.';
    return next;
    return;
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

  update public.mp_matches m
  set last_resolution_kind = 'deconstruction_fail',
      last_resolution_title = 'Deconstruction Failed',
      last_resolution_summary = 'The attempt broke on step ' || v_attempt_step || '.',
      last_resolution_step_label = 'Step ' || v_attempt_step,
      last_resolution_effect = 'You took ' || v_recoil_damage || ' retaliatory damage and the target recovered 1 armor.',
      last_resolution_actor_id = auth.uid(),
      last_resolution_created_at = timezone('utc', now())
  where m.id = p_match_id;

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
grant execute on function public.mp_play_spell_card(uuid, uuid) to authenticated;
grant execute on function public.mp_end_turn(uuid) to authenticated;
grant execute on function public.mp_resolve_deconstruction_attempt(uuid, uuid, uuid[]) to authenticated;
