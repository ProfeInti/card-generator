alter table public.mp_match_constructs
  drop constraint if exists mp_match_constructs_slot_index_check;

alter table public.mp_match_constructs
  add constraint mp_match_constructs_slot_index_check
  check (slot_index is null or slot_index between 1 and 5);

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
  v_target_card public.mp_match_cards%rowtype;
  v_attacker_damage integer;
  v_retaliation_damage integer;
  v_attacker_armor integer;
  v_attacker_state text;
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

  v_attacker_damage := greatest(coalesce(v_attacker.attack, 0), 0);
  v_retaliation_damage := greatest(coalesce(v_target.attack, 0), 0);

  update public.mp_match_constructs mc
  set armor = greatest(coalesce(mc.armor, 0) - v_attacker_damage, 0),
      state = case
        when greatest(coalesce(mc.armor, 0) - v_attacker_damage, 0) <= 0 then 'vulnerable'
        else 'protected'
      end,
      stunned_until_turn = case
        when greatest(coalesce(mc.armor, 0) - v_attacker_damage, 0) <= 0 then coalesce(v_match.turn_number, 1) + 1
        else mc.stunned_until_turn
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
      stunned_until_turn = case
        when greatest(coalesce(mc.armor, 0) - v_retaliation_damage, 0) <= 0 then coalesce(v_match.turn_number, 1) + 1
        else mc.stunned_until_turn
      end,
      has_attacked_this_turn = true
  where mc.id = v_attacker.id
  returning mc.armor, mc.state
  into v_attacker_armor, v_attacker_state;

  attacker_construct_id := v_attacker.id;
  target_construct_id := v_target.id;
  target_destroyed := false;
  message := case
    when target_armor <= 0 and v_attacker_armor <= 0 then 'Attack resolved. Both constructs are now vulnerable and stunned.'
    when target_armor <= 0 then 'Attack resolved. The target construct is now vulnerable and stunned.'
    when v_attacker_armor <= 0 then 'Attack resolved. The attacker became vulnerable after retaliation.'
    else 'Attack resolved. Both constructs exchanged damage.'
  end;
  return next;
end;
$$;

create or replace function public.mp_surrender_match(
  p_match_id uuid
)
returns table(
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
  v_winner_user_id uuid;
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

  if auth.uid() not in (v_match.player1_id, v_match.player2_id) then
    raise exception 'You are not a participant in this match.';
  end if;

  v_winner_user_id := case
    when auth.uid() = v_match.player1_id then v_match.player2_id
    else v_match.player1_id
  end;

  if v_winner_user_id is null then
    raise exception 'Could not determine the winner for this surrender.';
  end if;

  update public.mp_matches m
  set status = 'finished',
      winner_user_id = v_winner_user_id,
      finished_at = timezone('utc', now())
  where m.id = p_match_id
  returning m.winner_user_id, m.status
  into winner_user_id, match_status;

  message := 'Match surrendered. Your opponent wins.';
  return next;
end;
$$;

grant execute on function public.mp_play_construct_from_hand(uuid, uuid, integer) to authenticated;
grant execute on function public.mp_attack_construct(uuid, uuid, uuid) to authenticated;
grant execute on function public.mp_surrender_match(uuid) to authenticated;
