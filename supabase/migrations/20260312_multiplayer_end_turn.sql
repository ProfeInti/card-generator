create or replace function public.mp_end_turn(p_match_id uuid)
returns table(match_id uuid, next_player_id uuid, turn_number integer, turn_deadline_at timestamptz, message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.mp_matches%rowtype;
  v_next_player uuid;
  v_next_ingenuity_max integer;
  v_draw_card_id uuid;
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

  v_next_player := case when v_match.current_turn_user_id = v_match.player1_id then v_match.player2_id else v_match.player1_id end;

  select least(10, ingenuity_max + 1)
  into v_next_ingenuity_max
  from public.mp_match_players p
  where p.match_id = p_match_id
    and p.user_id = v_next_player
  for update;

  update public.mp_match_players
  set ingenuity_max = v_next_ingenuity_max,
      ingenuity_current = v_next_ingenuity_max
  where match_id = p_match_id
    and user_id = v_next_player;

  update public.mp_match_constructs
  set has_attacked_this_turn = false
  where match_id = p_match_id
    and owner_user_id = v_next_player
    and destroyed_at is null;

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
    update public.mp_match_cards
    set zone = 'hand',
        position_index = null
    where id = v_draw_card_id;
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

  update public.mp_matches
  set current_turn_user_id = v_next_player,
      turn_number = coalesce(turn_number, 1) + 1,
      turn_started_at = timezone('utc', now()),
      turn_deadline_at = timezone('utc', now()) + make_interval(secs => 60),
      turn_seconds = 60
  where id = p_match_id
  returning id, current_turn_user_id, turn_number, turn_deadline_at
  into match_id, next_player_id, turn_number, turn_deadline_at;

  message := 'Turn ended successfully.';
  return next;
end;
$$;

grant execute on function public.mp_end_turn(uuid) to authenticated;
