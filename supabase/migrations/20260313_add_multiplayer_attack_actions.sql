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
    when target_armor <= 0 then 'Attack resolved. The target construct is now vulnerable.'
    else 'Attack resolved. Target armor reduced.'
  end;
  return next;
end;
$$;

grant execute on function public.mp_attack_construct(uuid, uuid, uuid) to authenticated;

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

grant execute on function public.mp_attack_player(uuid, uuid) to authenticated;
