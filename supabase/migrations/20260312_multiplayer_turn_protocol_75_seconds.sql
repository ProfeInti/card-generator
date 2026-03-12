drop function if exists public.mp_end_turn(uuid);

create function public.mp_end_turn(p_match_id uuid)
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

  v_next_player := case
    when v_match.current_turn_user_id = v_match.player1_id then v_match.player2_id
    else v_match.player1_id
  end;

  select least(10, p.ingenuity_max + 1)
  into v_next_ingenuity_max
  from public.mp_match_players p
  where p.match_id = p_match_id
    and p.user_id = v_next_player
  for update;

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

  message := 'Turn ended successfully.';
  return next;
end;
$$;

grant execute on function public.mp_end_turn(uuid) to authenticated;
