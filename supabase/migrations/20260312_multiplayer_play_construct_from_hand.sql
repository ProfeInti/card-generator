-- Multiplayer Phase A gameplay action: play construct from hand
-- Date: 2026-03-12

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

  if p_slot_index not between 1 and 3 then
    raise exception 'Slot index must be between 1 and 3.';
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

grant execute on function public.mp_play_construct_from_hand(uuid, uuid, integer) to authenticated;
